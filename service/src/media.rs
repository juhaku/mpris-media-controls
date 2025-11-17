pub mod player;
pub mod routes;

use std::convert::Infallible;
use std::task::Poll;

use anyhow::Context;
use axum::response::sse::Event;
use futures::Stream;
use pin_project::pin_project;
use zbus::{Connection, Result};

pub async fn get_players(connection: &Connection) -> anyhow::Result<impl Iterator<Item = String>> {
    const DEST: Option<&str> = Some("org.freedesktop.DBus");

    let message = connection
        .call_method(DEST, "/org/freedesktop/DBus", DEST, "ListNames", &())
        .await;

    let message = message.context("Failed to call ListNames via DBus")?;
    let (names, _) = message.body().data().deserialize::<Vec<String>>()?;

    tracing::debug!(?names, "Got ListNames");

    Ok(names
        .into_iter()
        .filter(|name| name.starts_with("org.mpris.MediaPlayer2")))
}

pub async fn get_identity(connection: &Connection, player: &str) -> Result<String> {
    tracing::info!("Getting player: {player} Identity");

    let message = connection
        .call_method(
            Some(player),
            "/org/mpris/MediaPlayer2",
            Some("org.freedesktop.DBus.Properties"),
            "Get",
            &("org.mpris.MediaPlayer2", "Identity"),
        )
        .await?;

    let body = message.body();
    tracing::trace!("Got identity message, deserializing: {:#?}", &body.data());
    tracing::trace!("Got identity body, deserializing: {:#?}", &body);
    let (identity, _): (zvariant::Value, usize) = body.data().deserialize()?;
    tracing::debug!(identity = ?&identity, "Got response");
    let identity = identity
        .downcast::<String>()
        .expect("Should return String anyways");

    Ok(identity)
}

#[pin_project(project = SseEventProj)]
enum SseEvent {
    Single(Option<Event>),
    Multi(
        #[pin]
        Box<
            dyn futures::Stream<Item = std::result::Result<Event, Infallible>>
                + 'static
                + Send
                + Unpin,
        >,
    ),
}

impl Stream for SseEvent {
    type Item = std::result::Result<Event, Infallible>;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        let this = self.as_mut().project();

        match this {
            SseEventProj::Single(ev) => Poll::Ready(ev.take().map(Ok)),
            SseEventProj::Multi(mut ev) => ev.as_mut().poll_next(cx),
        }
    }
}
