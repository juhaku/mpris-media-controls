use anyhow::anyhow;
use async_trait::async_trait;
use axum::{Form, debug_handler};
use futures::TryFutureExt;
use serde::Deserialize;
use tokio::process::Command;

use crate::ApiError;

pub struct PaCtl;

impl PaCtl {
    const COMMAND: &str = "pactl";

    fn cmd() -> Command {
        Command::new(Self::COMMAND)
    }
}

#[async_trait]
pub trait PulseAudio {
    async fn get_default_sink(&self) -> Result<String, anyhow::Error>;
    async fn get_default_sink_volume(&self) -> Result<u32, anyhow::Error>;
    async fn set_default_sink_volume(&self, volume: u32) -> Result<(), anyhow::Error>;
}

#[async_trait]
impl PulseAudio for PaCtl {
    async fn get_default_sink(&self) -> Result<String, anyhow::Error> {
        PaCtl::cmd()
            .arg("get-default-sink")
            .output()
            .map_err(|error| {
                anyhow!(format!(
                    "Failed to call: {command} to get default sink: {error}",
                    command = Self::COMMAND
                ))
            })
            .and_then(|value| async {
                String::from_utf8(value.stdout)
                    .map_err(|error| {
                        anyhow!(format!("Failed convert default sink to utf8: {error}"))
                    })
                    .map(|sink| sink.trim_end().to_string())
            })
            .await
    }

    async fn get_default_sink_volume(&self) -> Result<u32, anyhow::Error> {
        self.get_default_sink()
            .and_then(|sink| {
                tracing::debug!("Got sink: {sink}");

                PaCtl::cmd()
                    .arg("get-sink-volume")
                    .arg(sink)
                    .output()
                    .map_err(|error| {
                        anyhow!(format!(
                            "Failed to call: {command} to get sink volume: {error}",
                            command = Self::COMMAND
                        ))
                    })
                    .and_then(|value| async {
                        tracing::debug!("Got volume output: {value:?}");
                        String::from_utf8(value.stdout).map_err(|error| {
                            anyhow!(format!("Failed convert get sink volume to utf8: {error}"))
                        })
                    })
                    .and_then(|volume| async move {
                        volume
                            .split(' ')
                            .nth(5)
                            .map(|volume| {
                                (volume[0..volume.len() - 1]).parse::<u32>().map_err(
                                    |error| {
                                        anyhow!(format!(
                                            "Failed to get u32 from first volume: {volume} {error}",
                                            volume = &volume[0..volume.len() - 1]
                                        ))
                                    },
                                )
                            })
                            .transpose().map(|volume| {
                                volume.expect("Found a bug, should not get here, by getting here the volume should be present")
                            })
                    })
            })
            .await
    }

    async fn set_default_sink_volume(&self, volume: u32) -> Result<(), anyhow::Error> {
        self.get_default_sink()
            .and_then(|sink| {
                PaCtl::cmd()
                    .arg("set-sink-volume")
                    .arg(sink)
                    .arg(format!("{volume}%"))
                    .output()
                    .map_err(|error| {
                        anyhow!(format!(
                            "Failed to call: {command} to set sink volume: {error}",
                            command = Self::COMMAND
                        ))
                    })
            })
            .await
            .map(|_| ())
    }
}

#[debug_handler]
pub async fn get_volume() -> Result<String, ApiError> {
    tracing::info!("Get sytem volume for default sink");

    let ctl = PaCtl;

    ctl.get_default_sink_volume()
        .map_err(ApiError::Volume)
        .await
        .map(|volume| volume.to_string())
}

#[derive(Deserialize)]
pub struct VolumeForm {
    percent: u32,
}

pub async fn set_volume(Form(volume): Form<VolumeForm>) -> Result<(), ApiError> {
    let volume = volume.percent;

    tracing::info!("Set system volume for default sink to percent: {volume}");

    let ctl = PaCtl;

    ctl.set_default_sink_volume(volume)
        .map_err(ApiError::Volume)
        .await
}
