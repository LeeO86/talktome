//! GPIO surface: outputs mirror tally/talk state, inputs drive talk keys.
//! Uses the Linux GPIO character device through `gpiocdev`; a file-based mock
//! backend (`TALKTOME_MOCK_GPIO=1`) stands in during tests.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, Context, Result};
use gpiocdev::line::{Bias, EdgeDetection, EdgeKind, Offset, Value};
use gpiocdev::request::Request;
use gpiocdev::tokio::AsyncRequest;
use tokio::sync::{mpsc, watch};

use crate::config::{GpioConfig, GpioInputAction, GpioInputConfig};
use crate::state::{
    Bus, Command, GpioInputView, GpioOutputView, GpioStatus, InputSource, Snapshot, TargetRef,
};
use crate::talk::TargetKey;

pub const BACKEND_ENV: &str = "TALKTOME_MOCK_GPIO";
const GPIO_VOLUME_STEP: f32 = 0.1;

/// Output names in the order they appear in `gpio.outputs`.
pub const OUTPUT_NAMES: &[&str] = &["tally", "talking", "incoming", "connected", "locked"];

pub fn output_states(snapshot: &Snapshot) -> HashMap<&'static str, bool> {
    let mut states = HashMap::new();
    states.insert("tally", snapshot.on_air);
    states.insert("talking", snapshot.talking);
    states.insert("incoming", !snapshot.incoming.is_empty());
    states.insert("connected", snapshot.connection.is_online());
    states.insert("locked", snapshot.lock_active);
    states
}

fn action_name(action: GpioInputAction) -> &'static str {
    match action {
        GpioInputAction::Talk => "talk",
        GpioInputAction::Reply => "reply",
        GpioInputAction::LockToggle => "lock_toggle",
        GpioInputAction::ClearLocks => "clear_locks",
        GpioInputAction::MuteToggle => "mute_toggle",
        GpioInputAction::VolumeUp => "volume_up",
        GpioInputAction::VolumeDown => "volume_down",
    }
}

/// Initial status view for a configuration (all outputs undriven, no presses).
pub fn initial_status(config: &GpioConfig, backend: &str) -> GpioStatus {
    GpioStatus {
        backend: backend.to_string(),
        error: None,
        outputs: OUTPUT_NAMES
            .iter()
            .filter_map(|name| {
                config.outputs.get(*name).map(|output| GpioOutputView {
                    name: name.to_string(),
                    line: output.line.clone(),
                    active_low: output.active_low,
                    active: None,
                    error: None,
                })
            })
            .collect(),
        inputs: config
            .inputs
            .iter()
            .map(|input| GpioInputView {
                line: input.line.clone(),
                action: action_name(input.action).to_string(),
                target: input.target.clone(),
                active_low: input.active_low,
                pressed: false,
                events: 0,
            })
            .collect(),
    }
}

fn publish_status(bus: &Bus, status: &GpioStatus) {
    if let Ok(mut hardware) = bus.hardware.write() {
        hardware.gpio = status.clone();
    }
}

fn record_input(status: &mut GpioStatus, index: usize, pressed: bool) {
    if let Some(view) = status.inputs.get_mut(index) {
        view.pressed = pressed;
        view.events += 1;
    }
}

fn record_output(status: &mut GpioStatus, name: &str, active: Option<bool>, error: Option<String>) {
    if let Some(view) = status.outputs.iter_mut().find(|o| o.name == name) {
        view.active = active;
        view.error = error;
    }
}

/// An input transition after debouncing: `pressed` = line became active.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InputEvent {
    pub index: usize,
    pub pressed: bool,
}

/// Turns input transitions into surface commands.
pub fn command_for_input(input: &GpioInputConfig, pressed: bool) -> Option<Command> {
    let source = InputSource::Gpio(input.line.clone());
    let target_key = input.target.as_deref().and_then(TargetKey::parse);
    match input.action {
        GpioInputAction::Talk => {
            let target = TargetRef::Key(target_key?);
            Some(if pressed {
                Command::TalkPress { source, target }
            } else {
                Command::TalkRelease { source, target }
            })
        }
        GpioInputAction::Reply => Some(if pressed {
            Command::TalkPress {
                source,
                target: TargetRef::Reply,
            }
        } else {
            Command::TalkRelease {
                source,
                target: TargetRef::Reply,
            }
        }),
        GpioInputAction::ClearLocks => pressed.then_some(Command::ClearLocks),
        GpioInputAction::LockToggle
        | GpioInputAction::MuteToggle
        | GpioInputAction::VolumeUp
        | GpioInputAction::VolumeDown => {
            if !pressed {
                return None;
            }
            let key = target_key?;
            Some(match input.action {
                GpioInputAction::LockToggle => Command::LockToggle {
                    target: TargetRef::Key(key),
                },
                GpioInputAction::MuteToggle => Command::MuteToggle(key),
                GpioInputAction::VolumeUp => Command::VolumeStep {
                    target: key,
                    delta: GPIO_VOLUME_STEP,
                },
                _ => Command::VolumeStep {
                    target: key,
                    delta: -GPIO_VOLUME_STEP,
                },
            })
        }
    }
}

/// Software debounce on top of whatever the kernel provides.
pub struct Debouncer {
    window: Duration,
    last: HashMap<usize, (Instant, bool)>,
}

impl Debouncer {
    pub fn new(window_ms: u32) -> Self {
        Self {
            window: Duration::from_millis(window_ms as u64),
            last: HashMap::new(),
        }
    }

    /// Returns the event if it should be acted upon.
    pub fn filter(&mut self, event: InputEvent, now: Instant) -> Option<InputEvent> {
        if let Some((at, pressed)) = self.last.get(&event.index) {
            if *pressed == event.pressed {
                return None;
            }
            if now.duration_since(*at) < self.window {
                return None;
            }
        }
        self.last.insert(event.index, (now, event.pressed));
        Some(event)
    }
}

pub async fn run(config: GpioConfig, bus: Bus, shutdown: watch::Receiver<bool>) {
    let mock = std::env::var(BACKEND_ENV)
        .map(|v| !v.is_empty() && v != "0" && v != "false")
        .unwrap_or(false);
    let mut status = initial_status(&config, if mock { "mock" } else { "gpiocdev" });
    publish_status(&bus, &status);
    let result = if mock {
        run_mock(config, &bus, &mut status, shutdown).await
    } else {
        run_real(config, &bus, &mut status, shutdown).await
    };
    if let Err(error) = result {
        tracing::error!(event = "gpio-failed", error = %format!("{error:#}"));
        status.backend = "error".into();
        status.error = Some(format!("{error:#}"));
        publish_status(&bus, &status);
    }
}

struct ResolvedLine {
    chip: PathBuf,
    offset: Offset,
}

fn resolve_line(config: &GpioConfig, line: &str) -> Result<ResolvedLine> {
    let line = line.trim();
    if let Ok(offset) = line.parse::<Offset>() {
        let chip = config.chip.as_deref().ok_or_else(|| {
            anyhow!("gpio.chip is required when lines are given as offsets ({line})")
        })?;
        let chip = if chip.starts_with('/') {
            PathBuf::from(chip)
        } else {
            PathBuf::from("/dev").join(chip)
        };
        return Ok(ResolvedLine { chip, offset });
    }
    if let Some(chip) = config.chip.as_deref() {
        let path = if chip.starts_with('/') {
            PathBuf::from(chip)
        } else {
            PathBuf::from("/dev").join(chip)
        };
        let chip = gpiocdev::Chip::from_path(&path)
            .with_context(|| format!("opening {}", path.display()))?;
        for info in chip.line_info_iter()? {
            let info = info?;
            if info.name == line {
                return Ok(ResolvedLine {
                    chip: path,
                    offset: info.offset,
                });
            }
        }
        bail!("line {line:?} not found on {}", path.display());
    }
    let found = gpiocdev::find_named_line(line)
        .ok_or_else(|| anyhow!("GPIO line {line:?} not found on any chip"))?;
    Ok(ResolvedLine {
        chip: found.chip,
        offset: found.info.offset,
    })
}

struct OutputLine {
    request: Request,
    offset: Offset,
    current: Option<bool>,
}

async fn run_real(
    config: GpioConfig,
    bus: &Bus,
    status: &mut GpioStatus,
    mut shutdown: watch::Receiver<bool>,
) -> Result<()> {
    // Outputs: one request per line (lines may live on different chips).
    let mut outputs: HashMap<&'static str, OutputLine> = HashMap::new();
    for (name, output) in &config.outputs {
        let Some(static_name) = OUTPUT_NAMES.iter().find(|n| **n == name.as_str()) else {
            continue;
        };
        let resolved = resolve_line(&config, &output.line)?;
        let mut builder = Request::builder();
        builder
            .on_chip(&resolved.chip)
            .with_consumer("talktome-headless")
            .with_line(resolved.offset)
            .as_output(Value::Inactive);
        if output.active_low {
            builder.as_active_low();
        }
        let request = builder
            .request()
            .with_context(|| format!("requesting output {} ({})", name, output.line))?;
        tracing::info!(event = "gpio-output", name, line = %output.line, chip = %resolved.chip.display(), offset = resolved.offset);
        outputs.insert(
            static_name,
            OutputLine {
                request,
                offset: resolved.offset,
                current: None,
            },
        );
    }

    // Inputs: grouped per chip in one request each, with edge detection.
    let mut per_chip: HashMap<PathBuf, Vec<(usize, Offset)>> = HashMap::new();
    let mut resolved_inputs = Vec::new();
    for (index, input) in config.inputs.iter().enumerate() {
        let resolved = resolve_line(&config, &input.line)?;
        per_chip
            .entry(resolved.chip.clone())
            .or_default()
            .push((index, resolved.offset));
        resolved_inputs.push(resolved);
    }
    let (event_tx, mut event_rx) = mpsc::channel::<InputEvent>(64);
    let inputs = Arc::new(config.inputs.clone());
    for (chip, lines) in per_chip {
        let mut builder = Request::builder();
        builder.on_chip(&chip).with_consumer("talktome-headless");
        for (index, offset) in &lines {
            let input = &config.inputs[*index];
            builder
                .with_line(*offset)
                .as_input()
                .with_edge_detection(EdgeDetection::BothEdges)
                .with_bias(if input.active_low {
                    Bias::PullUp
                } else {
                    Bias::PullDown
                });
            if input.active_low {
                builder.as_active_low();
            } else {
                builder.as_active_high();
            }
            if input.debounce_ms > 0 {
                builder.with_debounce_period(Duration::from_millis(input.debounce_ms as u64));
            }
        }
        let request = match builder.request() {
            Ok(request) => request,
            Err(error) => {
                // Older kernels lack debounce support in the uAPI; retry without it.
                tracing::warn!(event = "gpio-input-retry", chip = %chip.display(), error = %error);
                let mut builder = Request::builder();
                builder.on_chip(&chip).with_consumer("talktome-headless");
                for (index, offset) in &lines {
                    let input = &config.inputs[*index];
                    builder
                        .with_line(*offset)
                        .as_input()
                        .with_edge_detection(EdgeDetection::BothEdges);
                    if input.active_low {
                        builder.as_active_low();
                    }
                }
                builder
                    .request()
                    .with_context(|| format!("requesting inputs on {}", chip.display()))?
            }
        };
        let offsets: HashMap<Offset, usize> = lines
            .iter()
            .map(|(index, offset)| (*offset, *index))
            .collect();
        for (index, offset) in &lines {
            tracing::info!(event = "gpio-input", line = %config.inputs[*index].line, chip = %chip.display(), offset, action = ?config.inputs[*index].action);
        }
        let tx = event_tx.clone();
        let async_request = AsyncRequest::new(request);
        tokio::spawn(async move {
            loop {
                match async_request.read_edge_event().await {
                    Ok(event) => {
                        let Some(index) = offsets.get(&event.offset) else {
                            continue;
                        };
                        let pressed = matches!(event.kind, EdgeKind::Rising);
                        if tx
                            .send(InputEvent {
                                index: *index,
                                pressed,
                            })
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(error) => {
                        tracing::warn!(event = "gpio-read-failed", error = %error);
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        });
    }
    drop(event_tx);

    let mut snapshots = bus.snapshots.clone();
    let mut debouncer = Debouncer::new(
        config
            .inputs
            .iter()
            .map(|i| i.debounce_ms)
            .max()
            .unwrap_or(20),
    );
    apply_outputs(&mut outputs, &snapshots.borrow(), status);
    publish_status(bus, status);

    loop {
        tokio::select! {
            changed = snapshots.changed() => {
                if changed.is_err() { break; }
                let snapshot = snapshots.borrow().clone();
                if apply_outputs(&mut outputs, &snapshot, status) {
                    publish_status(bus, status);
                }
            }
            Some(event) = event_rx.recv() => {
                if let Some(event) = debouncer.filter(event, Instant::now()) {
                    let input = &inputs[event.index];
                    tracing::info!(event = "gpio-input", line = %input.line, pressed = event.pressed);
                    record_input(status, event.index, event.pressed);
                    publish_status(bus, status);
                    if let Some(command) = command_for_input(input, event.pressed) {
                        let _ = bus.commands.send(command).await;
                    }
                }
            }
            _ = shutdown.changed() => {
                if *shutdown.borrow() { break; }
            }
        }
    }
    for output in outputs.values_mut() {
        let _ = output.request.set_value(output.offset, Value::Inactive);
    }
    Ok(())
}

/// Drives changed outputs; returns true when any line state changed.
fn apply_outputs(
    outputs: &mut HashMap<&'static str, OutputLine>,
    snapshot: &Snapshot,
    status: &mut GpioStatus,
) -> bool {
    let states = output_states(snapshot);
    let mut changed = false;
    for (name, output) in outputs.iter_mut() {
        let active = states.get(name).copied().unwrap_or(false);
        if output.current == Some(active) {
            continue;
        }
        let value = if active {
            Value::Active
        } else {
            Value::Inactive
        };
        match output.request.set_value(output.offset, value) {
            Ok(()) => {
                output.current = Some(active);
                record_output(status, name, Some(active), None);
                if *name == "tally" {
                    tracing::info!(event = "tally-output", active);
                }
            }
            Err(error) => {
                tracing::warn!(event = "gpio-write-failed", name, error = %error);
                record_output(status, name, None, Some(error.to_string()));
            }
        }
        changed = true;
    }
    changed
}

/// Mock backend: outputs to `<dir>/gpio-outputs.json`, inputs from lines
/// `<line> press|release` appended to `<dir>/gpio-inputs`.
async fn run_mock(
    config: GpioConfig,
    bus: &Bus,
    status: &mut GpioStatus,
    mut shutdown: watch::Receiver<bool>,
) -> Result<()> {
    let dir = std::env::var_os(super::MOCK_DIR_ENV)
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    std::fs::create_dir_all(&dir)?;
    let outputs_path = dir.join("gpio-outputs.json");
    let inputs_path = dir.join("gpio-inputs");
    let mut offset = std::fs::metadata(&inputs_path)
        .map(|m| m.len())
        .unwrap_or(0);
    let mut snapshots = bus.snapshots.clone();
    let mut poll = tokio::time::interval(Duration::from_millis(50));
    let mut debouncer = Debouncer::new(0);
    tracing::info!(event = "gpio-mock", dir = %dir.display());

    let write_outputs = |snapshot: &Snapshot, status: &mut GpioStatus| {
        let states = output_states(snapshot);
        let map: serde_json::Map<String, serde_json::Value> = config
            .outputs
            .keys()
            .map(|name| {
                let active = states.get(name.as_str()).copied().unwrap_or(false);
                record_output(status, name, Some(active), None);
                (name.clone(), serde_json::Value::Bool(active))
            })
            .collect();
        let _ = std::fs::write(
            &outputs_path,
            serde_json::to_string_pretty(&map).unwrap_or_default(),
        );
        publish_status(bus, status);
    };
    write_outputs(&snapshots.borrow(), status);

    loop {
        tokio::select! {
            changed = snapshots.changed() => {
                if changed.is_err() { break; }
                let snapshot = snapshots.borrow().clone();
                write_outputs(&snapshot, status);
            }
            _ = poll.tick() => {
                let Ok(text) = std::fs::read_to_string(&inputs_path) else { continue };
                if (text.len() as u64) < offset { offset = 0; }
                let new_text = &text[offset as usize..];
                let Some(last_newline) = new_text.rfind('\n') else { continue };
                for line in new_text[..last_newline].lines() {
                    let mut parts = line.split_whitespace();
                    let (Some(name), Some(state)) = (parts.next(), parts.next()) else { continue };
                    let Some(index) = config.inputs.iter().position(|i| i.line == name) else {
                        tracing::warn!(event = "gpio-mock-unknown-line", line = name);
                        continue;
                    };
                    let pressed = matches!(state, "press" | "1" | "on" | "active");
                    if debouncer.filter(InputEvent { index, pressed }, Instant::now()).is_some() {
                        tracing::info!(event = "gpio-input", line = name, pressed);
                        record_input(status, index, pressed);
                        publish_status(bus, status);
                        if let Some(command) = command_for_input(&config.inputs[index], pressed) {
                            let _ = bus.commands.send(command).await;
                        }
                    }
                }
                offset += (last_newline + 1) as u64;
            }
            _ = shutdown.changed() => {
                if *shutdown.borrow() { break; }
            }
        }
    }
    Ok(())
}

/// `talktome-headless list-gpio`.
pub fn list() -> Result<()> {
    let chips = gpiocdev::chip::chips().context("listing GPIO chips")?;
    if chips.is_empty() {
        println!("No GPIO chips found (/dev/gpiochip*).");
        return Ok(());
    }
    for path in chips {
        let chip = gpiocdev::Chip::from_path(&path)?;
        let info = chip.info()?;
        println!(
            "{} ({}, {} lines)",
            path.display(),
            info.label,
            info.num_lines
        );
        for line in chip.line_info_iter()? {
            let line = line?;
            let used = if line.used {
                format!(" [used by {}]", line.consumer)
            } else {
                String::new()
            };
            println!(
                "  {:>3}  {}{}",
                line.offset,
                if line.name.is_empty() {
                    "-"
                } else {
                    &line.name
                },
                used
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::ConnectionState;

    fn input(action: GpioInputAction, target: Option<&str>) -> GpioInputConfig {
        GpioInputConfig {
            line: "GPIO22".into(),
            action,
            target: target.map(str::to_string),
            active_low: true,
            debounce_ms: 20,
        }
    }

    #[test]
    fn maps_inputs_to_commands() {
        let talk = input(GpioInputAction::Talk, Some("conference:1"));
        assert!(matches!(
            command_for_input(&talk, true),
            Some(Command::TalkPress {
                target: TargetRef::Key(TargetKey::Conference(1)),
                ..
            })
        ));
        assert!(matches!(
            command_for_input(&talk, false),
            Some(Command::TalkRelease { .. })
        ));
        let lock = input(GpioInputAction::LockToggle, Some("user:2"));
        assert!(matches!(
            command_for_input(&lock, true),
            Some(Command::LockToggle { .. })
        ));
        assert!(command_for_input(&lock, false).is_none());
        let up = input(GpioInputAction::VolumeUp, Some("feed:1"));
        assert!(
            matches!(command_for_input(&up, true), Some(Command::VolumeStep { delta, .. }) if delta > 0.0)
        );
        let reply = input(GpioInputAction::Reply, None);
        assert!(matches!(
            command_for_input(&reply, true),
            Some(Command::TalkPress {
                target: TargetRef::Reply,
                ..
            })
        ));
    }

    #[test]
    fn output_states_follow_snapshot() {
        let mut snapshot = Snapshot::initial("i", "u");
        snapshot.on_air = true;
        snapshot.connection = ConnectionState::Ready;
        let states = output_states(&snapshot);
        assert!(states["tally"]);
        assert!(states["connected"]);
        assert!(!states["talking"]);
    }

    #[test]
    fn debouncer_drops_bounces_and_repeats() {
        let mut debouncer = Debouncer::new(20);
        let t0 = Instant::now();
        assert!(debouncer
            .filter(
                InputEvent {
                    index: 0,
                    pressed: true
                },
                t0
            )
            .is_some());
        assert!(debouncer
            .filter(
                InputEvent {
                    index: 0,
                    pressed: true
                },
                t0
            )
            .is_none());
        assert!(debouncer
            .filter(
                InputEvent {
                    index: 0,
                    pressed: false
                },
                t0 + Duration::from_millis(5)
            )
            .is_none());
        assert!(debouncer
            .filter(
                InputEvent {
                    index: 0,
                    pressed: false
                },
                t0 + Duration::from_millis(50)
            )
            .is_some());
    }
}
