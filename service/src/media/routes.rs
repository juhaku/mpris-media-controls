use std::collections::HashMap;
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use async_stream::stream;
use axum::extract::{Path, Query, State};
use axum::response::Sse;
use axum::response::sse::Event;
use axum::{Json, Router, routing};
use futures::{Stream, TryFutureExt, TryStreamExt};
use tokio::fs;
use tokio::sync::oneshot;
use tokio::time::{self, timeout};
use tokio_stream::StreamExt;
use tokio_stream::wrappers::ReceiverStream;
use tower_http::cors::{AllowOrigin, CorsLayer};
use zbus::Connection;
use zvariant::OwnedObjectPath;

use crate::ApiError;
use crate::media::SseEvent;
use crate::media::player::{ProxyExt, ProxyPlayerProxy};

use super::player::Metadata;

pub fn media_api(connection: Arc<Connection>) -> Router {
    Router::new()
        .route("/players", routing::get(get_players))
        .route("/metadata/{player}", routing::get(get_metadata))
        .route("/play_pause/{player}", routing::post(play_pause))
        .route("/seek/{player}", routing::post(seek))
        .route(
            "/position/{player}",
            routing::get(get_position).post(set_position),
        )
        .route("/position-sse/{player}", routing::get(get_positon_sse))
        .route("/status/{player}", routing::get(get_playback_status))
        .route("/image/{url}", routing::get(get_image))
        .route("/player-sse/{player}", routing::get(get_player_sse))
        // .route("/next/{player}", routing::post(next))
        // .route("/previous/{player}", routing::post(previous))
        .with_state(connection)
        .layer(CorsLayer::new().allow_origin(AllowOrigin::any()))
}

async fn get_players(
    State(connection): State<Arc<Connection>>,
) -> Result<Json<Vec<(String, String)>>, ApiError> {
    let players = super::get_players(&connection)
        .await
        .map_err(ApiError::ListConnections)?
        .collect::<Vec<String>>();

    let identities = stream! {
        for p in players {
            yield (super::get_identity(&connection, &p).await, p)
        }
    };

    let player_identities = identities
        .then(|(result, player)| async {
            match result {
                Ok(identity) => Ok((identity, player)),
                Err(error) => Err(error),
            }
        })
        .try_collect::<Vec<(String, String)>>()
        .await
        .map_err(ApiError::GetIdentity)?;

    Ok(Json(player_identities))
}

async fn get_metadata(
    State(connection): State<Arc<Connection>>,
    Path(player): Path<String>,
) -> Result<Json<Metadata>, ApiError> {
    tracing::info!("Get player metadata: {}", &player);
    let con = connection.as_ref();

    let proxy = ProxyPlayerProxy::new(con, player.clone())
        .await
        .with_context(|| {
            format!(
                "Failed to create DBus Player2 connection MPRIS protocol for player: {}",
                player
            )
        })
        .map_err(ApiError::Metadata)?;

    let meta = proxy
        .metadata()
        .await
        .context("Failed to get Player metadata")
        .map_err(ApiError::Metadata)?;

    tracing::debug!(metadata = ?&meta, "Before from conversion");

    let metadata: Metadata = meta.into();

    tracing::debug!(metadata = ?&metadata);

    Ok(Json(metadata))
}

async fn play_pause(
    State(connection): State<Arc<Connection>>,
    Path(player): Path<String>,
) -> Result<(), ApiError> {
    tracing::info!("PlayPause: {}", &player);
    let con = connection.as_ref();

    let proxy = ProxyPlayerProxy::new(con, player.clone())
        .await
        .with_context(|| {
            format!("Failed to create DBus Player2 connection MPRIS protocol for player: {player}")
        })
        .map_err(ApiError::PlayPause)?;

    proxy
        .play_pause()
        .await
        .with_context(|| format!("Failed to PlayPause player: {player}"))
        .map_err(ApiError::PlayPause)?;

    Ok(())
}

// TODO consider implementing seek via set_position like get_positon() + offset
// this way the seek is more reliable
// needed track_id from client
async fn seek(
    State(connection): State<Arc<Connection>>,
    Path(player): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<(), ApiError> {
    let offset = params
        .get("offset")
        .map(|offset| {
            offset
                .parse::<i64>()
                .context("Failed to convert offset into i64")
        })
        .transpose()
        .map_err(|_| ApiError::InvalidOffset)?;

    if let Some(offset) = offset {
        tracing::info!("Seek: {player} with {offset}");
        let con = connection.as_ref();

        let proxy = ProxyPlayerProxy::new_without_cache(con, player.clone())
            .await
            .with_context(|| {
                format!(
                    "Failed to create DBus Player2 connection MPRIS protocol for player: {player}"
                )
            })
            .map_err(ApiError::Seek)?;

        async fn seek_offset(
            proxy: &ProxyPlayerProxy<'_>,
            player: &str,
            offset_micros: i64,
        ) -> Result<(), ApiError> {
            proxy
                .seek(offset_micros)
                .await
                .with_context(|| {
                    format!("Failed to Seek player: {player} to {offset_micros} offest micros")
                })
                .map_err(ApiError::Seek)
        }

        let position = proxy.position().await.map_err(|error| {
            ApiError::Seek(anyhow::anyhow!(
                "Fafiled to get player: {player} Metadata for position: {error}"
            ))
        })?;

        let offset_micros = offset * 1000 * 1000;

        tracing::debug!("Try seek as microseconds: {offset_micros}");
        seek_offset(&proxy, &player, offset_micros).await?;

        let (_tx, rx) = oneshot::channel::<i64>();
        let _ = timeout(Duration::from_millis(100), rx).await;

        let after_seek_position = proxy.position().await.map_err(|error| {
            ApiError::Seek(anyhow::anyhow!(
                "Fafiled to get player: {player} Metadata for position after seek: {error}"
            ))
        })?;
        let diff_secs = Duration::from_micros(position as u64)
            .abs_diff(Duration::from_micros(after_seek_position as u64))
            .as_secs();

        tracing::debug!(
            "After seeking, original: {position} after: {after_seek_position} diff in seconds: {diff_secs}",
        );

        // check the seek length is actually 5 seconds otherwise try with milliseconds
        if diff_secs < 4 {
            tracing::debug!("Incorrent offset as microseconds, trying with milliseconds");
            // revert the offset
            seek_offset(&proxy, &player, -offset_micros).await?;
            // try seeking with millis instead
            seek_offset(&proxy, &player, offset * 1000).await?;
        }

        Ok(())
    } else {
        Err(ApiError::MissingOffset)
    }
}

async fn get_position(
    State(connection): State<Arc<Connection>>,
    Path(player): Path<String>,
) -> Result<String, ApiError> {
    tracing::info!("Get current player: {player} position");
    let con = connection.as_ref();

    let proxy = ProxyPlayerProxy::new(con, player.clone())
        .await
        .with_context(|| {
            format!("Failed to create DBus Player2 connection MPRIS protocol for player: {player}")
        })
        .map_err(ApiError::Seek)?;

    let pos = proxy
        .position()
        .await
        .with_context(|| format!("Failed to get player: {player} Position"))
        .map_err(ApiError::Position)?;

    Ok(pos.to_string())
}

async fn get_positon_sse(
    State(connection): State<Arc<Connection>>,
    Path(player): Path<String>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    tracing::info!("Get positon SSE for player: {player}");
    let con = connection.as_ref();
    let proxy = match ProxyPlayerProxy::new_without_cache(con, player.clone()).await {
        Ok(proxy) => proxy,
        Err(error) => {
            return Sse::new(SseEvent::Single(Some(
                Event::default().event("errro").data(error.to_string()),
            )));
        }
    };

    let length = match proxy
        .get_length()
        .map_err(|error| {
            ApiError::Position(anyhow::anyhow!(
                "Fafiled to get player: {player} Metadata for position: {error}"
            ))
        })
        .await
    {
        Ok(length) => length,
        Err(error) => {
            return Sse::new(SseEvent::Single(Some(
                Event::default().event("error").data(error.to_string()),
            )));
        }
    };

    let mut interval = time::interval(Duration::from_millis(100));
    let (tx, rx) = tokio::sync::mpsc::channel(30);

    tokio::spawn(async move {
        loop {
            let _ = interval.tick().await;

            tracing::debug!("Check the postion: {player}, length: {length}");
            let pos = match proxy
                .position()
                .await
                .with_context(|| format!("Failed to get player: {player} Position"))
                .map_err(ApiError::Position)
            {
                Ok(position) => position,
                Err(error) => {
                    let _ = tx
                        .send(Event::default().event("error").data(error.to_string()))
                        .await;
                    return;
                }
            };

            if pos == length {
                tracing::debug!("last frame, {pos} == {length}, send EOS");
                let _ = tx
                    .send(Event::default().event("position").data("EOS"))
                    .await;
                break;
            } else {
                tracing::debug!("Still streaming for postion: {pos}");
                if tx
                    .send(Event::default().event("position").data(format!("{pos}")))
                    .await
                    .is_err()
                {
                    tracing::debug!("Broke pipe");

                    break;
                }
            }
        }
    });
    let stream = Box::new(ReceiverStream::new(rx).map(Ok::<Event, Infallible>));

    Sse::new(SseEvent::Multi(stream))
}

async fn set_position(
    State(connection): State<Arc<Connection>>,
    Path(player): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<(), ApiError> {
    let track_id = if let Some(track_id) = params.get("track_id") {
        track_id
    } else {
        return Err(ApiError::MissingTrackId);
    };

    let position = if let Some(position) = params.get("position") {
        position
            .parse::<i64>()
            .context("Failed to parse position")
            .map_err(|_| ApiError::InvalidPosition)?
    } else {
        return Err(ApiError::MissingTrackId);
    };

    tracing::info!("SetPosition: {player} position: {position}, track_id: {track_id}");
    let con = connection.as_ref();

    let proxy = ProxyPlayerProxy::new(con, player.clone())
        .await
        .with_context(|| {
            format!("Failed to create DBus Player2 connection MPRIS protocol for player: {player}")
        })
        .map_err(ApiError::Seek)?;

    let track_id = OwnedObjectPath::try_from(track_id.as_str())
        .context("Failed to create ObjectPath from track_id")
        .map_err(ApiError::SetPosition)?;

    proxy
        .set_position(track_id, position)
        .await
        .inspect_err(|e| {
            eprintln!("got error: {e:#?}");
        })
        .context("Failed to set Player position")
        .map_err(ApiError::SetPosition)?;

    Ok(())
}

async fn get_playback_status(
    State(connection): State<Arc<Connection>>,
    Path(player): Path<String>,
) -> Result<String, ApiError> {
    tracing::info!("Get current playback status for player: {player}");
    let con = connection.as_ref();

    let proxy = ProxyPlayerProxy::new(con, player.clone())
        .await
        .with_context(|| {
            format!("Failed to create DBus Player2 connection MPRIS protocol for player: {player}")
        })
        .map_err(ApiError::PlaybackStatus)?;

    let status = proxy
        .playback_status()
        .await
        .with_context(|| format!("Failed to get player: {player} PlaybackStatus"))
        .map_err(ApiError::PlaybackStatus)?;

    Ok(status.to_string())
}

async fn get_image(Path(url): Path<String>) -> Result<Vec<u8>, ApiError> {
    tracing::info!("Get image data for url: {url}");
    let bytes = if let Some(value) = url.strip_prefix("file://") {
        // strip the file:// prefix from the url
        let path = PathBuf::from(value);

        tracing::debug!("trying to get path {path:#?}");

        fs::read(path).await?
    } else {
        reqwest::get(url).await?.bytes().await?.to_vec()
    };

    Ok(bytes)
}

async fn get_player_sse(
    State(connection): State<Arc<Connection>>,
    Path(player): Path<String>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    tracing::info!("Get SSE for player: {player}");
    let con = connection.as_ref();
    let proxy = match ProxyPlayerProxy::new_without_cache(con, player.clone()).await {
        Ok(proxy) => proxy,
        Err(error) => {
            return Sse::new(SseEvent::Single(Some(
                Event::default().event("errro").data(error.to_string()),
            )));
        }
    };

    async fn get_metadata(
        proxy: &ProxyPlayerProxy<'_>,
        player: &str,
    ) -> Result<Metadata, ApiError> {
        proxy
            .metadata()
            .and_then(|metadata| async { Ok(Into::<Metadata>::into(metadata)) })
            .map_err(|error| {
                ApiError::Metadata(anyhow::anyhow!(
                    "Failed to get player: {player} Metadata: {error}"
                ))
            })
            .await
    }

    // initial metadata
    let mut metadata = match get_metadata(&proxy, &player).await {
        Ok(metadata) => metadata,
        Err(error) => {
            return Sse::new(SseEvent::Single(Some(
                Event::default().event("error").data(error.to_string()),
            )));
        }
    };
    let mut status = match proxy.playback_status().await {
        Ok(status) => status,
        Err(error) => {
            return Sse::new(SseEvent::Single(Some(
                Event::default().event("error").data(error.to_string()),
            )));
        }
    };

    let mut interval = time::interval(Duration::from_millis(500));
    let mut keepalive_interval = time::interval(Duration::from_secs(20));
    let (tx, rx) = tokio::sync::mpsc::channel(30);

    tokio::spawn(async move {
        loop {
            let _ = interval.tick().await;

            tokio::select! {
                _ = keepalive_interval.tick() => {
                    tracing::debug!("Checking keepalive");
                    if tx.send(Event::default().event("keepalive").comment("")).await.is_err() {
                        tracing::debug!("Broke pipe, failed to send keepalive, reciver is not present");

                        break;
                    }
                }
                _ = interval.tick() => {
                    tracing::debug!("Check: {player} metadata for changes");
                    let new_metadata = match get_metadata(&proxy, &player).await {
                        Ok(position) => position,
                        Err(error) => {
                            let _ = tx
                                .send(Event::default().event("error").data(error.to_string()))
                                .await;
                            return;
                        }
                    };


                    if metadata != new_metadata {
                        //  send event metadata changed
                        tracing::debug!("Player: {player} metadata changed: {new_metadata:?}");

                        if tx
                            .send(
                                Event::default().event("metadata").data(
                                    serde_json::to_string_pretty(&new_metadata)
                                        .expect("new metadata should serialize to JSON"),
                                ),
                            )
                            .await
                            .is_err()
                        {
                            tracing::debug!("Broke pipe, failed to send metadata");

                            break;
                        }

                        // update the old reference metadata
                        metadata = new_metadata;
                    }


                        let new_status = match proxy.playback_status().await {
                            Ok(status) => status,
                            Err(error) => {
                            let _ = tx
                                .send(Event::default().event("error").data(error.to_string()))
                                .await;
                            return;
                            }
                        };

                        if status != new_status {
                            if tx
                                .send(
                                    Event::default().event("status").data(
                                        &new_status
                                    ),
                                )
                                .await
                                .is_err()
                            {
                                tracing::debug!("Broke pipe, failed to send metadata");

                                break;
                            }

                            status = new_status;
                        }

                }
            }
        }
    });

    let stream = ReceiverStream::new(rx).map(Ok::<Event, Infallible>);

    Sse::new(SseEvent::Multi(Box::new(stream)))
}

// async fn next(
//     State(connection): State<Arc<Connection>>,
//     Path(player): Path<String>,
// ) -> Result<(), ApiError> {
//     tracing::info!("Call next on player: {player}");
//
//     let con = connection.as_ref();
//
//     let proxy = ProxyPlayerProxy::new(con, player.clone())
//         .await
//         .with_context(|| {
//             format!("Failed to create DBus Player2 connection MPRIS protocol for player: {player}")
//         })
//         .map_err(ApiError::PlaybackStatus)?;
//
//     proxy
//         .next()
//         .map_err(|error| ApiError::Next(anyhow::anyhow!("Failed to call next on player: {error}")))
//         .await
// }
//
// async fn previous(
//     State(connection): State<Arc<Connection>>,
//     Path(player): Path<String>,
// ) -> Result<(), ApiError> {
//     tracing::info!("Call previous on player: {player}");
//
//     let con = connection.as_ref();
//
//     let proxy = ProxyPlayerProxy::new(con, player.clone())
//         .await
//         .with_context(|| {
//             format!("Failed to create DBus Player2 connection MPRIS protocol for player: {player}")
//         })
//         .map_err(ApiError::PlaybackStatus)?;
//
//     proxy
//         .previous()
//         .map_err(|error| {
//             ApiError::Previous(anyhow::anyhow!(
//                 "Failed to call previous on player: {error}"
//             ))
//         })
//         .await
// }
