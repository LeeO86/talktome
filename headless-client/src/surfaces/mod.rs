//! Control surfaces: Stream Deck, GPIO and a file-driven mock.

pub mod gpio;
pub mod mock;
pub mod streamdeck;

use tokio::sync::{mpsc, watch};
use tokio::task::JoinSet;

use crate::config::Config;
use crate::state::{Bus, DeckInput};

/// Environment variable pointing the mock surface at a directory.
pub const MOCK_DIR_ENV: &str = "TALKTOME_SURFACE_MOCK_DIR";

pub fn spawn_all(
    config: &Config,
    bus: &Bus,
    deck_input: mpsc::Receiver<DeckInput>,
    shutdown: watch::Receiver<bool>,
    tasks: &mut JoinSet<()>,
) {
    if let Some(dir) = std::env::var_os(MOCK_DIR_ENV) {
        tasks.spawn(mock::run(dir.into(), bus.clone(), shutdown.clone()));
    }
    if config.gpio.enabled && (!config.gpio.outputs.is_empty() || !config.gpio.inputs.is_empty()) {
        tasks.spawn(gpio::run(
            config.gpio.clone(),
            bus.clone(),
            shutdown.clone(),
        ));
    } else if let Ok(mut hardware) = bus.hardware.write() {
        hardware.gpio.backend = "disabled".into();
    }
    if config.streamdeck.enabled {
        tasks.spawn(streamdeck::run(
            config.streamdeck.clone(),
            config.talk.clone(),
            bus.clone(),
            deck_input,
            shutdown.clone(),
        ));
    } else if let Ok(mut hardware) = bus.hardware.write() {
        hardware.deck.enabled = false;
    }
}
