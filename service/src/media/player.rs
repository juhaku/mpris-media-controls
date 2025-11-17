use std::collections::HashMap;

use async_trait::async_trait;
use futures::TryFutureExt;
use serde::{Deserialize, Serialize};
use zbus::proxy::{Builder, CacheProperties};
use zbus::zvariant::{OwnedObjectPath, Value};
use zbus::{Connection, Result, proxy};

#[proxy(
    interface = "org.mpris.MediaPlayer2.Player",
    default_path = "/org/mpris/MediaPlayer2"
)]
pub trait ProxyPlayer {
    fn play_pause(&self) -> Result<()>;
    fn seek(&self, offfset: i64) -> Result<()>;
    fn set_position(&self, track_id: OwnedObjectPath, offset: i64) -> Result<()>;
    fn next(&self) -> Result<()>;
    fn previous(&self) -> Result<()>;

    #[zbus(property)]
    fn metadata(&self) -> Result<HashMap<String, Value<'static>>>;

    #[zbus(property)]
    fn position(&self) -> Result<i64>;

    #[zbus(property)]
    fn playback_status(&self) -> Result<String>;
}

#[async_trait]
pub trait ProxyExt {
    async fn get_length(&self) -> std::result::Result<i64, zbus::Error>;
    async fn new_without_cache<I: Into<String> + std::marker::Send>(
        connection: &Connection,
        destination: I,
    ) -> zbus::Result<ProxyPlayerProxy<'static>> {
        async {
            ProxyPlayerProxy::builder(connection)
                .cache_properties(CacheProperties::No)
                .destination(destination.into())
        }
        .and_then(Builder::build)
        .await
    }
}

#[async_trait]
impl ProxyExt for ProxyPlayerProxy<'static> {
    async fn get_length(&self) -> std::result::Result<i64, zbus::Error> {
        self.metadata()
            .and_then(|meta| async {
                let metadata = Into::<Metadata>::into(meta);
                Ok(metadata.length)
            })
            .await
    }
}

#[derive(Serialize, Deserialize, Default, Debug, Eq, PartialEq)]
pub struct Metadata {
    pub track_id: String,
    pub title: String,
    pub art_url: String,
    pub url: String,
    pub length: i64,
    pub artist: Vec<String>,
}

impl From<HashMap<String, Value<'static>>> for Metadata {
    fn from(value: HashMap<String, Value>) -> Self {
        let mut metadata = Metadata::default();

        if let Some(track_id) = value.get("mpris:trackid") {
            let id = match track_id {
                Value::Str(id) => id.as_str(),
                Value::ObjectPath(id) => id.as_str(),
                _ => {
                    unreachable!(
                        "Found a bug, should never get here, the track_id is ObjectPath or Str type"
                    )
                }
            };

            metadata.track_id = id.to_string();
        }

        if let Some(title) = value.get("xesam:title") {
            let Value::Str(title) = title else {
                unreachable!("Found a bug, should never get here, the title is Str type")
            };

            metadata.title = title.to_string();
        }

        if let Some(art_url) = value.get("mpris:artUrl") {
            let Value::Str(art_url) = art_url else {
                unreachable!("Found a bug, should never get here, the artUrl is Str type")
            };

            metadata.art_url = art_url.to_string();
        }

        if let Some(url) = value.get("xesam:url") {
            let Value::Str(url) = url else {
                unreachable!("Found a bug, should never get here, the url is Str type")
            };

            metadata.url = url.as_ref().to_string();
        }

        if let Some(length) = value.get("mpris:length") {
            let length = match length {
                Value::U64(length) => {
                    i64::try_from(*length).expect("Failed to convert length from u64 to i64")
                }
                Value::I64(length) => *length,
                _ => {
                    unreachable!(
                        "Found a bug, should never get here, the length is U64 or I64 type"
                    )
                }
            };

            metadata.length = length;
        }

        if let Some(artist) = value.get("xesam:artist") {
            let Value::Array(artist) = artist else {
                unreachable!("Found a bug, should never get here, the artist is Array of Str types")
            };

            metadata.artist = artist
                .iter()
                .map(|artist| {
                    let Value::Str(artist) = artist else {
                        unreachable!(
                            "Found a bug, should never gethere, the artist should be a Str type"
                        )
                    };

                    artist.to_string()
                })
                .collect();
        }

        metadata
    }
}
