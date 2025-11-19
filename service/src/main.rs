mod media;
mod pulseaudio;

#[cfg(feature = "embed-ui")]
mod ui;

use std::result::Result;
use std::sync::Arc;

use anyhow::{Context, Error};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Router, routing};
use thiserror::Error;
use tokio::net::TcpListener;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{EnvFilter, FmtSubscriber};
use zbus::Connection;

#[derive(Debug, Error)]
enum ApiError {
    #[error("{0}")]
    ListConnections(anyhow::Error),
    #[error("failed to get identity: {0}")]
    GetIdentity(zbus::Error),
    #[error("{0}")]
    Metadata(anyhow::Error),
    #[error("{0}")]
    PlayPause(anyhow::Error),
    #[error("missing offset")]
    MissingOffset,
    #[error("invalid offset")]
    InvalidOffset,
    #[error("{0}")]
    Seek(anyhow::Error),
    #[error("{0}")]
    Position(anyhow::Error),
    #[error("{0}")]
    SetPosition(anyhow::Error),
    #[error("missing track id")]
    MissingTrackId,
    #[error("invalid position")]
    InvalidPosition,
    #[error("{0}")]
    PlaybackStatus(anyhow::Error),
    #[error("failed to read image: {0}")]
    ReadImage(#[from] std::io::Error),
    #[error("failed to load image: {0}")]
    LoadImage(#[from] reqwest::Error),
    #[error("{0}")]
    Volume(anyhow::Error),
    // #[error("{0}")]
    // Next(anyhow::Error),
    // #[error("{0}")]
    // Previous(anyhow::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        match self {
            ApiError::ListConnections(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
            }
            ApiError::GetIdentity(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
            }
            ApiError::Metadata(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
            }
            ApiError::PlayPause(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
            }
            ApiError::MissingOffset => (StatusCode::BAD_REQUEST, self.to_string()).into_response(),
            ApiError::InvalidOffset => (StatusCode::BAD_REQUEST, self.to_string()).into_response(),
            ApiError::Seek(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
            }
            ApiError::Position(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
            }
            ApiError::SetPosition(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
            }
            ApiError::MissingTrackId => (StatusCode::BAD_REQUEST, self.to_string()).into_response(),
            ApiError::InvalidPosition => {
                (StatusCode::BAD_REQUEST, self.to_string()).into_response()
            }
            ApiError::PlaybackStatus(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
            }
            ApiError::ReadImage(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
            }
            ApiError::LoadImage(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
            }
            ApiError::Volume(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
            } // ApiError::Next(_) => {
              //     (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
              // }
              // ApiError::Previous(_) => {
              //     (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()).into_response()
        }
              // }
    }
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    tracing::subscriber::set_global_default(
        FmtSubscriber::builder()
            .with_env_filter(EnvFilter::from_default_env())
            .finish(),
    )
    .context("Failed to setup tracing subscriber")?;

    let connection = Connection::session().await.map_err(anyhow::Error::new)?;

    #[allow(unused_mut)]
    let mut router = Router::new().nest("/api", api(Arc::new(connection)));
    #[cfg(feature = "embed-ui")]
    {
        router = router.fallback(ui::serve_ui);
    }
    // .fallback_service(
    //     ServeDir::new("assets").not_found_service(ServeFile::new("assets/index.html")),
    // );
    let listener = TcpListener::bind(("0.0.0.0", 4433)).await?;

    tracing::info!("Starting service at 0.0.0.0:4433");
    axum::serve(listener, router.into_make_service())
        .await
        .map_err(Error::new)
}

fn api(connection: Arc<Connection>) -> Router {
    Router::new()
        .route("/status", routing::get(|| async { "OK" }))
        .nest("/media", media::routes::media_api(connection))
        .route(
            "/volume",
            routing::get(pulseaudio::get_volume).post(pulseaudio::set_volume),
        )
        .layer(CorsLayer::new().allow_origin(AllowOrigin::any()))
        .layer(TraceLayer::new_for_http())
}
