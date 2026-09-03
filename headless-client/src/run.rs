//! Wires configuration, audio, surfaces, health and the session together.

use std::sync::{Arc, Mutex};

use anyhow::Result;
use tokio::sync::{mpsc, watch};

use crate::audio::io::AudioIo;
use crate::audio::mixer::Mixer;
use crate::config::Config;
use crate::signalling::session::{Session, SessionIo};
use crate::state::{self, Snapshot};

pub async fn run(config: Config) -> Result<()> {
    let config = Arc::new(config);
    tracing::info!(event = "client-start", version = crate::VERSION, instance = %config.instance, user = %config.user.name);

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    spawn_signal_handler(shutdown_tx.clone());

    let mixer = Arc::new(Mutex::new(Mixer::new(
        config.audio.default_volume,
        config.audio.dim_db,
        config.audio.dim_feeds_while_speaking,
        config.audio.dim_when_addressed,
        config.audio.jitter_min_ms,
        config.audio.jitter_max_ms,
    )));
    let frame_samples = (crate::audio::codec::SAMPLE_RATE * config.audio.profile.frame_ms() / 1000) as usize;
    let (frames_tx, frames_rx) = mpsc::channel(64);
    let audio_io = AudioIo::start(config.audio.clone(), frame_samples, mixer.clone(), frames_tx);

    let (_cmd_tx, cmd_rx, snapshot_tx, bus) = state::channels(Snapshot::initial(&config.instance, &config.user.name));

    let mut tasks = tokio::task::JoinSet::new();
    tasks.spawn(crate::health::run_sd_notify(bus.snapshots.clone(), shutdown_rx.clone()));
    if let Some(port) = config.health.port {
        let bind = config.health.bind.clone();
        let snapshots = bus.snapshots.clone();
        let shutdown = shutdown_rx.clone();
        tasks.spawn(async move {
            if let Err(error) = crate::health::run_healthz(&bind, port, snapshots, shutdown).await {
                tracing::error!(event = "healthz-failed", error = %format!("{error:#}"));
            }
        });
    }
    crate::surfaces::spawn_all(&config, &bus, shutdown_rx.clone(), &mut tasks);

    let session = Session::new(
        config.clone(),
        SessionIo {
            commands: cmd_rx,
            snapshots: snapshot_tx,
            mixer,
            frames: frames_rx,
            audio_status: audio_io.status.clone(),
            shutdown: shutdown_rx,
        },
    )?;
    let result = session.run().await;

    let _ = shutdown_tx.send(true);
    audio_io.stop();
    tasks.shutdown().await;
    result
}

fn spawn_signal_handler(shutdown: watch::Sender<bool>) {
    tokio::spawn(async move {
        let mut terminate = match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(signal) => signal,
            Err(error) => {
                tracing::warn!(event = "signal-handler-failed", error = %error);
                return;
            }
        };
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = terminate.recv() => {}
        }
        tracing::info!(event = "shutdown-requested");
        let _ = shutdown.send(true);
    });
}
