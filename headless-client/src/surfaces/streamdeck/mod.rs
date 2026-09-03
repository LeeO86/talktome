//! Stream Deck surface: discovers the deck (optionally by serial), renders
//! the key layout and turns key/dial/touch input into talk and audio commands.
//! A mock deck (`TALKTOME_MOCK_STREAMDECK=<model>`) renders PNGs and reads
//! input lines from a file for tests.

pub mod layout;
pub mod render;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use elgato_streamdeck::asynchronous::AsyncStreamDeck;
use elgato_streamdeck::images::convert_image_with_format;
use elgato_streamdeck::info::Kind;
use elgato_streamdeck::DeviceStateUpdate;
use image::{DynamicImage, RgbImage};
use tokio::sync::watch;

use crate::config::{StreamDeckConfig, TalkConfig};
use crate::state::{Bus, Command, InputSource, Snapshot, TargetRef};
use crate::talk::TargetKey;
use layout::{encoder_targets, page_count, palette, Appearance, DeckState, Geometry, KeySpec, LayoutOptions, Role};
use render::{Renderer, StripSegment};

pub const MOCK_ENV: &str = "TALKTOME_MOCK_STREAMDECK";
const STATUS_HOLD: Duration = Duration::from_millis(2000);
const MUTE_HOLD: Duration = Duration::from_millis(600);
const BLINK_PERIOD: Duration = Duration::from_millis(500);
const READ_POLL_HZ: f32 = 50.0;

fn geometry_for(kind: Kind) -> Geometry {
    Geometry {
        keys: kind.key_count(),
        rows: kind.row_count(),
        cols: kind.column_count(),
        encoders: kind.encoder_count(),
        touchpoints: kind.touchpoint_count(),
        visual: kind.is_visual(),
    }
}

fn kind_from_name(name: &str) -> Option<Kind> {
    Some(match name.to_ascii_lowercase().replace(['-', '_', ' '], "").as_str() {
        "original" => Kind::Original,
        "originalv2" | "v2" => Kind::OriginalV2,
        "mini" => Kind::Mini,
        "minimk2" => Kind::MiniMk2,
        "xl" => Kind::Xl,
        "xlv2" => Kind::XlV2,
        "mk2" => Kind::Mk2,
        "neo" => Kind::Neo,
        "pedal" => Kind::Pedal,
        "plus" => Kind::Plus,
        "plusxl" => Kind::PlusXl,
        _ => return None,
    })
}

/// A connected deck, real or mock.
enum Device {
    Real(AsyncStreamDeck),
    Mock(MockDeck),
}

impl Device {
    fn kind(&self) -> Kind {
        match self {
            Device::Real(deck) => deck.kind(),
            Device::Mock(mock) => mock.kind,
        }
    }

    async fn set_brightness(&self, percent: u8) -> Result<()> {
        match self {
            Device::Real(deck) => deck.set_brightness(percent).await.map_err(|e| anyhow!("{e}")),
            Device::Mock(_) => Ok(()),
        }
    }

    async fn set_key(&self, key: u8, image: RgbImage) -> Result<()> {
        match self {
            Device::Real(deck) => deck
                .set_button_image(key, DynamicImage::ImageRgb8(image))
                .await
                .map_err(|e| anyhow!("{e}")),
            Device::Mock(mock) => mock.write_key(key, &image),
        }
    }

    async fn set_lcd(&self, image: RgbImage) -> Result<()> {
        match self {
            Device::Real(deck) => {
                let Some(format) = deck.kind().lcd_image_format() else { return Ok(()) };
                let data = convert_image_with_format(format, DynamicImage::ImageRgb8(image)).map_err(|e| anyhow!("{e}"))?;
                deck.write_lcd_fill(&data).await.map_err(|e| anyhow!("{e}"))
            }
            Device::Mock(mock) => mock.write_lcd(&image),
        }
    }

    async fn flush(&self) -> Result<()> {
        match self {
            Device::Real(deck) => deck.flush().await.map_err(|e| anyhow!("{e}")),
            Device::Mock(mock) => mock.compose(),
        }
    }

    async fn clear(&self) -> Result<()> {
        match self {
            Device::Real(deck) => {
                deck.clear_all_button_images().await.map_err(|e| anyhow!("{e}"))?;
                deck.flush().await.map_err(|e| anyhow!("{e}"))
            }
            Device::Mock(_) => Ok(()),
        }
    }

    async fn read(&self, reader: &Option<Arc<elgato_streamdeck::asynchronous::AsyncDeviceStateReader>>) -> Result<Vec<DeviceStateUpdate>> {
        match self {
            Device::Real(_) => {
                let reader = reader.as_ref().ok_or_else(|| anyhow!("no reader"))?;
                reader.read(READ_POLL_HZ).await.map_err(|e| anyhow!("{e}"))
            }
            Device::Mock(mock) => mock.read().await,
        }
    }
}

/// File-driven stand-in: `<dir>/streamdeck/key-NN.png`, `<dir>/streamdeck/lcd.png`,
/// inputs from `<dir>/streamdeck-inputs` (`down 3`, `up 3`, `twist 0 -2`,
/// `encoder-down 1`, `encoder-up 1`, `touch 1`, `swipe left|right`, `tap 120 50`).
struct MockDeck {
    kind: Kind,
    dir: PathBuf,
    inputs: PathBuf,
    offset: std::sync::Mutex<u64>,
    keys: std::sync::Mutex<Vec<Option<RgbImage>>>,
}

impl MockDeck {
    fn new(kind: Kind) -> Result<Self> {
        let base = std::env::var_os(super::MOCK_DIR_ENV)
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        let dir = base.join("streamdeck");
        std::fs::create_dir_all(&dir)?;
        let inputs = base.join("streamdeck-inputs");
        let offset = std::fs::metadata(&inputs).map(|m| m.len()).unwrap_or(0);
        Ok(Self {
            kind,
            dir,
            inputs,
            offset: std::sync::Mutex::new(offset),
            keys: std::sync::Mutex::new(vec![None; kind.key_count() as usize]),
        })
    }

    fn write_key(&self, key: u8, image: &RgbImage) -> Result<()> {
        if let Ok(mut keys) = self.keys.lock() {
            if let Some(slot) = keys.get_mut(key as usize) {
                *slot = Some(image.clone());
            }
        }
        self.write_png(&format!("key-{key:02}.png"), image)
    }

    /// Composes all keys into `deck.png` in the device's row/column layout.
    fn compose(&self) -> Result<()> {
        let keys = self.keys.lock().map_err(|_| anyhow!("mock keys poisoned"))?;
        let Some(sample) = keys.iter().flatten().next() else { return Ok(()) };
        let (kw, kh) = sample.dimensions();
        let gap = 8u32;
        let cols = self.kind.column_count() as u32;
        let rows = self.kind.row_count() as u32;
        let mut canvas = RgbImage::from_pixel(cols * (kw + gap) + gap, rows * (kh + gap) + gap, image::Rgb([12, 12, 14]));
        for (index, key) in keys.iter().enumerate() {
            let Some(key) = key else { continue };
            let col = index as u32 % cols;
            let row = index as u32 / cols;
            let x0 = gap + col * (kw + gap);
            let y0 = gap + row * (kh + gap);
            for (x, y, pixel) in key.enumerate_pixels() {
                canvas.put_pixel(x0 + x, y0 + y, *pixel);
            }
        }
        self.write_png("deck.png", &canvas)
    }

    fn write_lcd(&self, image: &RgbImage) -> Result<()> {
        self.write_png("lcd.png", image)
    }

    fn write_png(&self, name: &str, image: &RgbImage) -> Result<()> {
        let path = self.dir.join(name);
        let tmp = self.dir.join(format!(".{name}.tmp.png"));
        image.save_with_format(&tmp, image::ImageFormat::Png)?;
        std::fs::rename(tmp, path)?;
        Ok(())
    }

    async fn read(&self) -> Result<Vec<DeviceStateUpdate>> {
        tokio::time::sleep(Duration::from_millis(50)).await;
        let Ok(text) = std::fs::read_to_string(&self.inputs) else { return Ok(Vec::new()) };
        let mut offset = self.offset.lock().map_err(|_| anyhow!("mock offset poisoned"))?;
        if (text.len() as u64) < *offset {
            *offset = 0;
        }
        let new_text = &text[*offset as usize..];
        let Some(last_newline) = new_text.rfind('\n') else { return Ok(Vec::new()) };
        let mut updates = Vec::new();
        for line in new_text[..last_newline].lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            let update = match parts.as_slice() {
                ["down", k] => k.parse().ok().map(DeviceStateUpdate::ButtonDown),
                ["up", k] => k.parse().ok().map(DeviceStateUpdate::ButtonUp),
                ["twist", e, d] => e.parse().ok().zip(d.parse().ok()).map(|(e, d)| DeviceStateUpdate::EncoderTwist(e, d)),
                ["encoder-down", e] => e.parse().ok().map(DeviceStateUpdate::EncoderDown),
                ["encoder-up", e] => e.parse().ok().map(DeviceStateUpdate::EncoderUp),
                ["touch", p] => p.parse().ok().map(DeviceStateUpdate::TouchPointDown),
                ["swipe", "left"] => Some(DeviceStateUpdate::TouchScreenSwipe((600, 50), (100, 50))),
                ["swipe", "right"] => Some(DeviceStateUpdate::TouchScreenSwipe((100, 50), (600, 50))),
                ["tap", x, y] => x.parse().ok().zip(y.parse().ok()).map(|(x, y)| DeviceStateUpdate::TouchScreenPress(x, y)),
                _ => None,
            };
            match update {
                Some(update) => updates.push(update),
                None => tracing::warn!(event = "streamdeck-mock-invalid", line),
            }
        }
        *offset += (last_newline + 1) as u64;
        Ok(updates)
    }
}

pub async fn run(config: StreamDeckConfig, talk: TalkConfig, bus: Bus, mut shutdown: watch::Receiver<bool>) {
    let mock_kind = std::env::var(MOCK_ENV).ok().and_then(|name| kind_from_name(&name));
    let renderer = Renderer::load(&config.font_path);
    let mut warned = false;
    loop {
        if *shutdown.borrow() {
            return;
        }
        let device = match mock_kind {
            Some(kind) => MockDeck::new(kind).map(Device::Mock),
            None => discover(&config.serial),
        };
        match device {
            Ok(device) => {
                warned = false;
                let kind = device.kind();
                tracing::info!(event = "streamdeck-connected", kind = ?kind, mock = mock_kind.is_some());
                let outcome = run_device(device, &config, &talk, &renderer, &bus, &mut shutdown).await;
                if *shutdown.borrow() {
                    return;
                }
                tracing::warn!(event = "streamdeck-disconnected", error = %outcome.err().map(|e| format!("{e:#}")).unwrap_or_default());
            }
            Err(error) => {
                if !warned {
                    tracing::warn!(event = "streamdeck-not-found", error = %format!("{error:#}"));
                    warned = true;
                }
            }
        }
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(3)) => {}
            _ = shutdown.changed() => {}
        }
    }
}

fn discover(serial: &Option<String>) -> Result<Device> {
    let hid = elgato_streamdeck::new_hidapi().context("initialising hidapi")?;
    let devices = elgato_streamdeck::list_devices(&hid);
    if devices.is_empty() {
        anyhow::bail!("no Stream Deck found");
    }
    let (kind, found_serial) = match serial.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(wanted) => devices
            .into_iter()
            .find(|(_, s)| s == wanted)
            .ok_or_else(|| anyhow!("Stream Deck with serial {wanted:?} not connected"))?,
        None => devices.into_iter().next().expect("non-empty"),
    };
    let deck = AsyncStreamDeck::connect(&hid, kind, &found_serial)
        .map_err(|e| anyhow!("connecting to {kind:?} {found_serial}: {e}"))?;
    Ok(Device::Real(deck))
}

/// `talktome-headless list-streamdecks`.
pub fn list() -> Result<()> {
    let hid = elgato_streamdeck::new_hidapi().context("initialising hidapi")?;
    let devices = elgato_streamdeck::list_devices(&hid);
    if devices.is_empty() {
        println!("No Stream Deck found. Check the udev rule and that the device is plugged in.");
        return Ok(());
    }
    for (kind, serial) in devices {
        println!(
            "{kind:?}  serial={serial}  keys={} encoders={} touchpoints={}",
            kind.key_count(),
            kind.encoder_count(),
            kind.touchpoint_count()
        );
    }
    Ok(())
}

struct PressedKey {
    role: Role,
    since: Instant,
}

async fn run_device(
    device: Device,
    config: &StreamDeckConfig,
    talk: &TalkConfig,
    renderer: &Renderer,
    bus: &Bus,
    shutdown: &mut watch::Receiver<bool>,
) -> Result<()> {
    let kind = device.kind();
    let geometry = geometry_for(kind);
    let key_size = {
        let (w, h) = kind.key_image_format().size;
        (w as u32, h as u32)
    };
    let lcd_size = kind.lcd_image_format().map(|f| (f.size.0 as u32, f.size.1 as u32));
    let options = LayoutOptions {
        pedal_target: config.pedal_target.as_deref().and_then(TargetKey::parse),
    };
    let reader = match &device {
        Device::Real(deck) => Some(deck.get_reader()),
        Device::Mock(_) => None,
    };
    let _ = talk;

    device.set_brightness(config.brightness).await?;
    let mut state = DeckState::default();
    let mut snapshots = bus.snapshots.clone();
    let mut snapshot: Arc<Snapshot> = snapshots.borrow().clone();
    let mut rendered: HashMap<u8, (Appearance, bool)> = HashMap::new();
    let mut lcd_rendered: Option<Vec<StripSegment>> = None;
    let mut pressed: HashMap<u8, PressedKey> = HashMap::new();
    let mut keys: Vec<KeySpec> = layout::layout(&geometry, &snapshot, &state, &options);
    let mut blink = tokio::time::interval(BLINK_PERIOD);
    let volume_timeout = Duration::from_secs(config.volume_layer_timeout_s.max(1));
    let source = |key: u8| InputSource::StreamDeck(key);

    render_all(&device, &geometry, renderer, key_size, &keys, &state, &mut rendered).await?;
    if let Some(size) = lcd_size {
        render_lcd(&device, kind, renderer, size, &geometry, &state, &snapshot, &mut lcd_rendered).await?;
    }

    loop {
        let mut relayout = false;
        tokio::select! {
            changed = snapshots.changed() => {
                if changed.is_err() { return Ok(()); }
                snapshot = snapshots.borrow().clone();
                relayout = true;
            }
            _ = blink.tick() => {
                state.blink_phase = !state.blink_phase;
                if state.expire_volume_layer(volume_timeout) {
                    relayout = true;
                }
            }
            updates = device.read(&reader) => {
                let updates = updates.context("reading deck input")?;
                for update in updates {
                    let now = Instant::now();
                    match update {
                        DeviceStateUpdate::ButtonDown(key) => {
                            let Some(spec) = keys.get(key as usize) else { continue };
                            let role = spec.role;
                            pressed.insert(key, PressedKey { role, since: now });
                            match role {
                                Role::Status => {}
                                Role::Reply => {
                                    let _ = bus.commands.send(Command::TalkPress { source: source(key), target: TargetRef::Reply }).await;
                                }
                                Role::Target(target) => {
                                    if state.volume_layer {
                                        state.selected = Some(target);
                                        state.touch_volume_layer();
                                        relayout = true;
                                    } else if target.can_talk() {
                                        let _ = bus.commands.send(Command::TalkPress { source: source(key), target: TargetRef::Key(target) }).await;
                                    } else {
                                        let _ = bus.commands.send(Command::MuteToggle(target)).await;
                                    }
                                }
                                Role::NextPage => {
                                    let pages = page_count(&geometry, &state, snapshot.targets.len());
                                    state.page = (state.page + 1) % pages.max(1);
                                    relayout = true;
                                }
                                Role::VolumeToggle => {
                                    state.volume_layer = !state.volume_layer;
                                    state.touch_volume_layer();
                                    if state.volume_layer && state.selected.is_none() {
                                        state.selected = snapshot.targets.first().map(|t| t.key);
                                    }
                                    relayout = true;
                                }
                                Role::VolumeUp | Role::VolumeDown => {
                                    state.touch_volume_layer();
                                    if let Some(target) = state.selected {
                                        let delta = if role == Role::VolumeUp { config.volume_step } else { -config.volume_step };
                                        let _ = bus.commands.send(Command::VolumeStep { target, delta }).await;
                                    }
                                }
                                Role::MuteSelected => {
                                    state.touch_volume_layer();
                                    if let Some(target) = state.selected {
                                        let _ = bus.commands.send(Command::MuteToggle(target)).await;
                                    }
                                }
                                Role::Empty => {}
                            }
                        }
                        DeviceStateUpdate::ButtonUp(key) => {
                            let Some(press) = pressed.remove(&key) else { continue };
                            let held = now.duration_since(press.since);
                            match press.role {
                                Role::Status => {
                                    if held >= STATUS_HOLD {
                                        let pages = page_count(&geometry, &state, snapshot.targets.len());
                                        state.page = (state.page + 1) % pages.max(1);
                                        relayout = true;
                                    } else {
                                        let _ = bus.commands.send(Command::ClearLocks).await;
                                    }
                                }
                                Role::Reply => {
                                    let _ = bus.commands.send(Command::TalkRelease { source: source(key), target: TargetRef::Reply }).await;
                                }
                                Role::Target(target) => {
                                    if state.volume_layer {
                                        if held >= MUTE_HOLD {
                                            let _ = bus.commands.send(Command::MuteToggle(target)).await;
                                        }
                                    } else if target.can_talk() {
                                        let _ = bus.commands.send(Command::TalkRelease { source: source(key), target: TargetRef::Key(target) }).await;
                                    }
                                }
                                _ => {}
                            }
                        }
                        DeviceStateUpdate::EncoderTwist(encoder, ticks) => {
                            let targets = encoder_targets(&geometry, &state, &snapshot);
                            if let Some(Some(target)) = targets.get(encoder as usize) {
                                let delta = config.volume_step * ticks as f32;
                                let _ = bus.commands.send(Command::VolumeStep { target: target.key, delta }).await;
                            }
                        }
                        DeviceStateUpdate::EncoderDown(encoder) => {
                            let targets = encoder_targets(&geometry, &state, &snapshot);
                            if let Some(Some(target)) = targets.get(encoder as usize) {
                                let _ = bus.commands.send(Command::MuteToggle(target.key)).await;
                            }
                        }
                        DeviceStateUpdate::EncoderUp(_) => {}
                        DeviceStateUpdate::TouchPointDown(point) => {
                            let pages = page_count(&geometry, &state, snapshot.targets.len()).max(1);
                            state.page = if point == 0 { (state.page + pages - 1) % pages } else { (state.page + 1) % pages };
                            relayout = true;
                        }
                        DeviceStateUpdate::TouchPointUp(_) => {}
                        DeviceStateUpdate::TouchScreenSwipe((x0, y0), (x1, y1)) => {
                            let pages = page_count(&geometry, &state, snapshot.targets.len()).max(1);
                            let forward = if lcd_size.map(|(w, h)| w >= h).unwrap_or(true) { x1 < x0 } else { y1 < y0 };
                            state.page = if forward { (state.page + 1) % pages } else { (state.page + pages - 1) % pages };
                            relayout = true;
                        }
                        DeviceStateUpdate::TouchScreenPress(x, y) | DeviceStateUpdate::TouchScreenLongPress(x, y) => {
                            if let Some((w, h)) = lcd_size {
                                let encoders = geometry.encoders.max(1) as u32;
                                let index = if w >= h { x as u32 * encoders / w.max(1) } else { y as u32 * encoders / h.max(1) };
                                let targets = encoder_targets(&geometry, &state, &snapshot);
                                if let Some(Some(target)) = targets.get(index as usize) {
                                    let _ = bus.commands.send(Command::MuteToggle(target.key)).await;
                                }
                            }
                        }
                    }
                }
            }
            _ = shutdown.changed() => {
                if *shutdown.borrow() {
                    // Release anything still held so the session stops talking.
                    for (key, press) in pressed.drain() {
                        match press.role {
                            Role::Reply => { let _ = bus.commands.send(Command::TalkRelease { source: source(key), target: TargetRef::Reply }).await; }
                            Role::Target(target) if target.can_talk() => { let _ = bus.commands.send(Command::TalkRelease { source: source(key), target: TargetRef::Key(target) }).await; }
                            _ => {}
                        }
                    }
                    let _ = device.clear().await;
                    let _ = device.set_brightness(0).await;
                    return Ok(());
                }
            }
        }

        if relayout {
            keys = layout::layout(&geometry, &snapshot, &state, &options);
        }
        render_all(&device, &geometry, renderer, key_size, &keys, &state, &mut rendered).await?;
        if let Some(size) = lcd_size {
            render_lcd(&device, kind, renderer, size, &geometry, &state, &snapshot, &mut lcd_rendered).await?;
        }
    }
}

/// Re-renders keys whose appearance (or blink phase, when blinking) changed.
async fn render_all(
    device: &Device,
    geometry: &Geometry,
    renderer: &Renderer,
    key_size: (u32, u32),
    keys: &[KeySpec],
    state: &DeckState,
    rendered: &mut HashMap<u8, (Appearance, bool)>,
) -> Result<()> {
    if !geometry.visual {
        return Ok(());
    }
    let mut changed = false;
    for (index, spec) in keys.iter().enumerate() {
        let key = index as u8;
        let phase = spec.appearance.blink.is_some() && state.blink_phase;
        let needs = match rendered.get(&key) {
            Some((previous, previous_phase)) => *previous != spec.appearance || *previous_phase != phase,
            None => true,
        };
        if !needs {
            continue;
        }
        let image = renderer.key(&spec.appearance, key_size, phase);
        device.set_key(key, image).await.context("writing key image")?;
        rendered.insert(key, (spec.appearance.clone(), phase));
        changed = true;
    }
    if changed {
        device.flush().await.context("flushing deck")?;
    }
    Ok(())
}

async fn render_lcd(
    device: &Device,
    kind: Kind,
    renderer: &Renderer,
    size: (u32, u32),
    geometry: &Geometry,
    state: &DeckState,
    snapshot: &Snapshot,
    rendered: &mut Option<Vec<StripSegment>>,
) -> Result<()> {
    let segments: Vec<StripSegment> = if geometry.encoders > 0 {
        encoder_targets(geometry, state, snapshot)
            .into_iter()
            .map(|target| match target {
                Some(target) => StripSegment {
                    title: target.name.clone(),
                    volume: target.volume,
                    muted: target.muted,
                    background: if target.held || target.locked {
                        palette::LOCKED
                    } else if target.incoming {
                        palette::INCOMING
                    } else {
                        palette::VOLUME
                    },
                },
                None => StripSegment {
                    title: String::new(),
                    volume: 0.0,
                    muted: false,
                    background: palette::OFFLINE,
                },
            })
            .collect()
    } else {
        // Neo: a single status segment.
        vec![StripSegment {
            title: format!("{} · {}", snapshot.user_name, if snapshot.on_air { "ON AIR" } else { snapshot.connection.label() }),
            volume: if snapshot.talking { 1.0 } else { 0.0 },
            muted: false,
            background: if snapshot.on_air { palette::ON_AIR } else { palette::STATUS_OK },
        }]
    };
    if rendered.as_ref() == Some(&segments) {
        return Ok(());
    }
    let _ = kind;
    let image = renderer.strip(size, &segments);
    device.set_lcd(image).await.context("writing LCD")?;
    *rendered = Some(segments);
    Ok(())
}
