mod media;
mod pulseaudio;

#[cfg(feature = "embed-ui")]
mod ui;

use std::fmt::Debug;
use std::path::{Path, PathBuf};
use std::result::Result;
use std::sync::Arc;

use anyhow::{Context, Error};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Router, routing};
use hyper::server::conn::http1;
use hyper_util::rt::TokioIo;
use hyper_util::service::TowerToHyperService;
use thiserror::Error;
use tokio::net::TcpListener;
use tokio_rustls::TlsAcceptor;
use tokio_rustls::rustls::ServerConfig;
use tokio_rustls::rustls::pki_types::pem::PemObject;
use tokio_rustls::rustls::pki_types::{CertificateDer, PrivateKeyDer};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::layer::SubscriberExt;
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
    if std::env::var("JOURNAL_LOGGING").is_ok() {
        let layer = tracing_journald::layer()
            .context("Failed to create new journald tracing layer, not in linux")?;
        tracing_subscriber::registry().with(layer);
    } else {
        tracing::subscriber::set_global_default(
            FmtSubscriber::builder()
                .with_env_filter(EnvFilter::from_default_env())
                .finish(),
        )
        .context("Failed to setup tracing subscriber")?;
    }

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
    let port: u16 = match std::env::var("PORT") {
        Ok(port) => port
            .parse::<u16>()
            .context("Failed to parse PORT env variable to an number")?,
        Err(_) => 4433,
    };

    let bind = ("0.0.0.0", port);
    let listener = TcpListener::bind(bind).await?;

    if std::env::var("TLS").is_err() {
        tracing::info!("Starting service at {bind:?}");
        axum::serve(listener, router.into_make_service())
            .await
            .map_err(Error::new)
    } else {
        serve_tls(bind, listener, router).await
    }
}

async fn serve_tls(
    bind: (&'static str, u16),
    listner: TcpListener,
    router: Router,
) -> Result<(), anyhow::Error> {
    let certs_dir = std::env::var("CERTS_DIR").context("Mising required CERTS_DIR env variable")?;

    let rustls_config = rustls_server_config(
        [&certs_dir, "server-private-key.pem"]
            .iter()
            .collect::<PathBuf>(),
        [&certs_dir, "certificates.pem"].iter().collect::<PathBuf>(),
    )?;

    let tls_acceptor = TlsAcceptor::from(rustls_config);
    tracing::info!("HTTPS server at {bind:?}");

    let hyper_service = Arc::new(TowerToHyperService::new(router));

    loop {
        let tls_acceptor = tls_acceptor.clone();
        let service = hyper_service.clone();

        let (cnx, addr) = listner
            .accept()
            .await
            .map_err(|error| anyhow::anyhow!("faile to accept socket connection: {error}"))?;

        tokio::spawn(async move {
            let stream = match tls_acceptor
                .accept(cnx)
                .await
                .map_err(|error| anyhow::anyhow!("error during TLS handshake: {error}"))
            {
                Ok(stream) => stream,
                Err(error) => {
                    tracing::warn!("Error in TLS: {error}");
                    return;
                }
            };

            let stream = TokioIo::new(stream);

            if let Err(error) = http1::Builder::new()
                .serve_connection(stream, service)
                .await
            {
                tracing::warn!("error serving connection {bind:?} to address: {addr}: {error}");
            }
        });
    }
}

fn rustls_server_config(
    key: impl AsRef<Path> + Debug + Clone,
    cert: impl AsRef<Path> + Debug + Clone,
) -> Result<Arc<ServerConfig>, anyhow::Error> {
    let key = PrivateKeyDer::from_pem_file(key.clone())
        .map_err(|error| anyhow::anyhow!("failed to load key from path {key:?} {error}"))?;

    let certs = CertificateDer::pem_file_iter(cert.clone())
        .map_err(|error| {
            anyhow::anyhow!("Failed to load certificate: from path: {cert:?} {error}")
        })?
        .map(|cert| cert.unwrap())
        .collect();

    let config = ServerConfig::builder()
        .with_no_client_auth()
        // .with_cert_resolver(cert_resolver)
        .with_single_cert(certs, key)
        .map_err(|error| {
            anyhow::anyhow!("Failed to create server config from single cert / key pair: {error:?}")
        })?;

    Ok(Arc::new(config))
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
