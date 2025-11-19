use std::path::PathBuf;

use axum::http::Uri;
use axum::response::IntoResponse;
use include_dir::{Dir, include_dir};
use mime_guess::mime;
use reqwest::StatusCode;

static UI_ASSETS: Dir = include_dir!("assets");

const INDEX: &str = "index.html";

pub async fn serve_ui(uri: Uri) -> impl IntoResponse {
    tracing::info!("Serving file with URI: {uri}");

    let path = &uri.path()[1..]; // strip first slash

    let (mimetype, content) = match UI_ASSETS.get_file(PathBuf::from(path)) {
        Some(entry) => {
            let mime = mime_guess::from_path(entry.path());
            let mimetype = mime.first_or_octet_stream().to_string();

            tracing::debug!(entry = ?entry, mime = ?mimetype, "found file");
            (mimetype, entry.contents())
        }
        None => {
            let file = UI_ASSETS
                .get_file(PathBuf::from(INDEX))
                .expect("Index should always be present");

            tracing::debug!(file = ?file, "serving index html");

            let content = file.contents();
            (mime::HTML.to_string(), content)
        }
    };

    (StatusCode::OK, [("content-type", mimetype)], content).into_response()
}
