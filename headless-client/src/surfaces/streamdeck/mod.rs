//! Stream Deck surface: discovers the deck (optionally by serial), renders
//! the key layout and turns key/dial/touch input into talk and audio commands.
//! A mock deck (`TALKTOME_MOCK_STREAMDECK=<model>`) renders PNGs and reads
//! input lines from a file for tests.

pub mod layout;
pub mod render;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use elgato_streamdeck::asynchronous::AsyncStreamDeck;
use elgato_streamdeck::images::convert_image_with_format;
use elgato_streamdeck::info::Kind;
use elgato_streamdeck::DeviceStateUpdate;
use image::{DynamicImage, RgbImage};
use tokio::sync::watch;

use crate::audio::mixer::step_volume_db;
use crate::config::{StreamDeckConfig, StreamDeckDeviceConfig, TalkConfig};
use crate::state::{
    Bus, Command, ConferenceMemberInfo, DeckDialView, DeckInput, DeckKeyView, DeckStatus,
    InputSource, Snapshot, TargetInfo, TargetRef,
};
use crate::talk::TargetKey;
use layout::{
    conference_members, encoder_bindings, encoder_page_count, page_count, palette,
    volume_toggle_defers_to_release, Appearance, DeckState, EncoderBinding, Geometry, KeySpec,
    LayoutOptions, Role,
};
use render::{Renderer, StripSegment};
use tokio::sync::mpsc;

pub const MOCK_ENV: &str = "TALKTOME_MOCK_STREAMDECK";
/// Comma-separated names painted onto mock decks when the client has no
/// live targets yet (`adi,conference:News,feed:Virus`). Optional
/// `TALKTOME_DEMO_REPLY` sets the Reply subtitle.
pub const DEMO_TARGETS_ENV: &str = "TALKTOME_DEMO_TARGETS";
pub const DEMO_REPLY_ENV: &str = "TALKTOME_DEMO_REPLY";
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

pub fn kind_from_name(name: &str) -> Option<Kind> {
    Some(
        match name
            .to_ascii_lowercase()
            .replace(['-', '_', ' '], "")
            .as_str()
        {
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
        },
    )
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

    async fn serial(&self) -> Option<String> {
        match self {
            Device::Real(deck) => deck.serial_number().await.ok(),
            Device::Mock(_) => Some("mock".into()),
        }
    }

    fn is_mock(&self) -> bool {
        matches!(self, Device::Mock(_))
    }

    async fn set_brightness(&self, percent: u8) -> Result<()> {
        match self {
            Device::Real(deck) => deck
                .set_brightness(percent)
                .await
                .map_err(|e| anyhow!("{e}")),
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
                let Some(format) = deck.kind().lcd_image_format() else {
                    return Ok(());
                };
                let data = convert_image_with_format(format, DynamicImage::ImageRgb8(image))
                    .map_err(|e| anyhow!("{e}"))?;
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
                deck.clear_all_button_images()
                    .await
                    .map_err(|e| anyhow!("{e}"))?;
                deck.flush().await.map_err(|e| anyhow!("{e}"))
            }
            Device::Mock(_) => Ok(()),
        }
    }

    async fn read(
        &self,
        reader: &Option<Arc<elgato_streamdeck::asynchronous::AsyncDeviceStateReader>>,
    ) -> Result<Vec<DeviceStateUpdate>> {
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
    fn new(kind: Kind, id: usize) -> Result<Self> {
        let base = std::env::var_os(super::MOCK_DIR_ENV)
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        let dir = if id == 0 {
            base.join("streamdeck")
        } else {
            base.join(format!("streamdeck-{id}"))
        };
        std::fs::create_dir_all(&dir)?;
        let inputs = if id == 0 {
            base.join("streamdeck-inputs")
        } else {
            base.join(format!("streamdeck-{id}-inputs"))
        };
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
        let keys = self
            .keys
            .lock()
            .map_err(|_| anyhow!("mock keys poisoned"))?;
        let Some(sample) = keys.iter().flatten().next() else {
            return Ok(());
        };
        let (kw, kh) = sample.dimensions();
        let gap = 8u32;
        let cols = self.kind.column_count() as u32;
        let rows = self.kind.row_count() as u32;
        let mut canvas = RgbImage::from_pixel(
            cols * (kw + gap) + gap,
            rows * (kh + gap) + gap,
            image::Rgb([12, 12, 14]),
        );
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
        let Ok(text) = std::fs::read_to_string(&self.inputs) else {
            return Ok(Vec::new());
        };
        let mut offset = self
            .offset
            .lock()
            .map_err(|_| anyhow!("mock offset poisoned"))?;
        if (text.len() as u64) < *offset {
            *offset = 0;
        }
        let new_text = &text[*offset as usize..];
        let Some(last_newline) = new_text.rfind('\n') else {
            return Ok(Vec::new());
        };
        let mut updates = Vec::new();
        for line in new_text[..last_newline].lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            let update = match parts.as_slice() {
                ["down", k] => k.parse().ok().map(DeviceStateUpdate::ButtonDown),
                ["up", k] => k.parse().ok().map(DeviceStateUpdate::ButtonUp),
                ["twist", e, d] => e
                    .parse()
                    .ok()
                    .zip(d.parse().ok())
                    .map(|(e, d)| DeviceStateUpdate::EncoderTwist(e, d)),
                ["encoder-down", e] => e.parse().ok().map(DeviceStateUpdate::EncoderDown),
                ["encoder-up", e] => e.parse().ok().map(DeviceStateUpdate::EncoderUp),
                ["touch", p] => p.parse().ok().map(DeviceStateUpdate::TouchPointDown),
                ["swipe", "left"] => {
                    Some(DeviceStateUpdate::TouchScreenSwipe((600, 50), (100, 50)))
                }
                ["swipe", "right"] => {
                    Some(DeviceStateUpdate::TouchScreenSwipe((100, 50), (600, 50)))
                }
                ["tap", x, y] => x
                    .parse()
                    .ok()
                    .zip(y.parse().ok())
                    .map(|(x, y)| DeviceStateUpdate::TouchScreenPress(x, y)),
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

#[allow(clippy::too_many_arguments)]
pub async fn run(
    id: usize,
    config: StreamDeckConfig,
    device_config: StreamDeckDeviceConfig,
    talk: TalkConfig,
    bus: Bus,
    mut deck_input: mpsc::Receiver<DeckInput>,
    mut shutdown: watch::Receiver<bool>,
    claimed: Arc<Mutex<HashSet<String>>>,
) {
    let env_mock = std::env::var(MOCK_ENV)
        .ok()
        .and_then(|name| kind_from_name(&name));
    let mock_kind = device_config
        .mock
        .as_deref()
        .filter(|name| !name.trim().is_empty())
        .and_then(kind_from_name)
        .or_else(|| {
            if id == 0 {
                env_mock.or_else(|| {
                    config
                        .mock
                        .as_deref()
                        .filter(|name| !name.trim().is_empty())
                        .and_then(kind_from_name)
                })
            } else {
                None
            }
        });
    let renderer = Renderer::load(&config.font_path);
    let mut warned = false;
    let mut bound_serial = device_config.serial.clone();
    publish_disconnected(&bus, id, None);
    loop {
        if *shutdown.borrow() {
            return;
        }
        let device = match mock_kind {
            Some(kind) => MockDeck::new(kind, id).map(Device::Mock),
            None => discover(&bound_serial, &claimed),
        };
        match device {
            Ok(device) => {
                warned = false;
                if let Some(serial) = device.serial().await {
                    bound_serial = Some(serial.clone());
                    if let Ok(mut claimed) = claimed.lock() {
                        claimed.insert(serial);
                    }
                }
                let kind = device.kind();
                tracing::info!(
                    event = "streamdeck-connected",
                    id,
                    kind = ?kind,
                    mock = mock_kind.is_some()
                );
                let outcome = run_device(
                    id,
                    device,
                    &config,
                    &device_config,
                    &talk,
                    &renderer,
                    &bus,
                    &mut deck_input,
                    &mut shutdown,
                )
                .await;
                if *shutdown.borrow() {
                    return;
                }
                let error = outcome.err().map(|e| format!("{e:#}")).unwrap_or_default();
                tracing::warn!(event = "streamdeck-disconnected", id, error = %error);
                publish_disconnected(&bus, id, Some(error));
            }
            Err(error) => {
                if !warned {
                    tracing::warn!(event = "streamdeck-not-found", id, error = %format!("{error:#}"));
                    warned = true;
                }
                publish_disconnected(&bus, id, Some(format!("{error:#}")));
            }
        }
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(3)) => {}
            _ = shutdown.changed() => {}
        }
    }
}

fn discover(serial: &Option<String>, claimed: &Arc<Mutex<HashSet<String>>>) -> Result<Device> {
    let hid = elgato_streamdeck::new_hidapi().context("initialising hidapi")?;
    let devices = elgato_streamdeck::list_devices(&hid);
    if devices.is_empty() {
        anyhow::bail!("no Stream Deck found");
    }
    let claimed_serials = claimed.lock().ok();
    let (kind, found_serial) = match serial.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(wanted) => devices
            .into_iter()
            .find(|(_, s)| s == wanted)
            .ok_or_else(|| anyhow!("Stream Deck with serial {wanted:?} not connected"))?,
        None => devices
            .into_iter()
            .find(|(_, s)| {
                claimed_serials
                    .as_ref()
                    .map(|set| !set.contains(s))
                    .unwrap_or(true)
            })
            .ok_or_else(|| anyhow!("no unused Stream Deck connected"))?,
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

fn publish_disconnected(bus: &Bus, id: usize, error: Option<String>) {
    if let Ok(mut hardware) = bus.hardware.write() {
        if hardware.decks.len() <= id {
            hardware.decks.resize(id + 1, DeckStatus::default());
        }
        hardware.decks[id] = DeckStatus {
            id,
            enabled: true,
            connected: false,
            error,
            ..DeckStatus::default()
        };
        hardware.deck_images.retain(|(device, _), _| *device != id);
    }
}

fn role_label(role: Role) -> String {
    match role {
        Role::Status => "status".into(),
        Role::Reply => "reply".into(),
        Role::Target(key) => key.to_string(),
        Role::Member {
            conference,
            user_id,
        } => format!("{conference}/user:{user_id}"),
        Role::NextPage => "next-page".into(),
        Role::NextEncoderPage => "next-dials".into(),
        Role::VolumeToggle => "volume-toggle".into(),
        Role::MembersToggle => "members-toggle".into(),
        Role::VolumeUp => "volume-up".into(),
        Role::VolumeDown => "volume-down".into(),
        Role::MuteSelected => "mute-selected".into(),
        Role::Empty => "empty".into(),
    }
}

fn key_item_count(snapshot: &Snapshot, state: &DeckState) -> usize {
    if state.member_layer {
        state
            .member_conference
            .map(|key| conference_members(snapshot, key).len())
            .unwrap_or(0)
    } else {
        snapshot.targets.len()
    }
}

fn cycle_page(page: &mut usize, pages: usize, forward: bool) {
    let pages = pages.max(1);
    *page = if forward {
        (*page + 1) % pages
    } else {
        (*page + pages - 1) % pages
    };
}

#[derive(Clone, Copy)]
enum BoundEncoder {
    Target(TargetKey),
    Member {
        conference: TargetKey,
        user_id: i64,
        volume: f32,
    },
}

fn bound_encoder(
    geometry: &Geometry,
    state: &DeckState,
    snapshot: &Snapshot,
    encoder: u8,
) -> Option<BoundEncoder> {
    match encoder_bindings(geometry, state, snapshot)
        .get(encoder as usize)
        .copied()
        .flatten()
    {
        Some(EncoderBinding::Target(target)) => Some(BoundEncoder::Target(target.key)),
        Some(EncoderBinding::Member { conference, member }) => Some(BoundEncoder::Member {
            conference,
            user_id: member.user_id,
            volume: member.volume,
        }),
        None => None,
    }
}

fn image_hash(image: &RgbImage) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    image.dimensions().hash(&mut hasher);
    image.as_raw().hash(&mut hasher);
    hasher.finish()
}

fn encode_png(image: &RgbImage) -> Option<Vec<u8>> {
    let mut bytes = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut bytes);
    image
        .write_to(&mut cursor, image::ImageFormat::Png)
        .ok()
        .map(|_| bytes)
}

/// Converts a web-injected input into the device update type.
fn injected_update(input: DeckInput) -> DeviceStateUpdate {
    match input {
        DeckInput::KeyDown(key) => DeviceStateUpdate::ButtonDown(key),
        DeckInput::KeyUp(key) => DeviceStateUpdate::ButtonUp(key),
        DeckInput::EncoderTwist(encoder, delta) => DeviceStateUpdate::EncoderTwist(encoder, delta),
        DeckInput::EncoderPress(encoder) => DeviceStateUpdate::EncoderDown(encoder),
        DeckInput::EncoderRelease(encoder) => DeviceStateUpdate::EncoderUp(encoder),
        DeckInput::TouchPoint(point) => DeviceStateUpdate::TouchPointDown(point),
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_device(
    id: usize,
    device: Device,
    config: &StreamDeckConfig,
    device_config: &StreamDeckDeviceConfig,
    talk: &TalkConfig,
    renderer: &Renderer,
    bus: &Bus,
    deck_input: &mut mpsc::Receiver<DeckInput>,
    shutdown: &mut watch::Receiver<bool>,
) -> Result<()> {
    let kind = device.kind();
    let geometry = geometry_for(kind);
    let serial = device.serial().await;
    let is_mock = device.is_mock();
    let key_size = effective_key_size(kind);
    let lcd_size = kind
        .lcd_image_format()
        .map(|f| (f.size.0 as u32, f.size.1 as u32));
    let options = layout_options(device_config);
    let reader = match &device {
        Device::Real(deck) => Some(deck.get_reader()),
        Device::Mock(_) => None,
    };
    let _ = talk;

    device.set_brightness(config.brightness).await?;
    let mut state = DeckState::default();
    let mut snapshots = bus.snapshots.clone();
    let mut snapshot: Arc<Snapshot> = with_demo_targets(snapshots.borrow().clone(), is_mock);
    let mut rendered: HashMap<u8, (Appearance, bool)> = HashMap::new();
    let mut images: HashMap<u8, (u64, Arc<Vec<u8>>)> = HashMap::new();
    let mut lcd_rendered: Option<Vec<StripSegment>> = None;
    let mut pressed: HashMap<u8, PressedKey> = HashMap::new();
    let mut pressed_encoders: HashMap<u8, Instant> = HashMap::new();
    let mut keys: Vec<KeySpec> = layout::layout(&geometry, &snapshot, &state, &options);
    let mut blink = tokio::time::interval(BLINK_PERIOD);
    let volume_timeout = Duration::from_secs(config.volume_layer_timeout_s.max(1));
    let source = |key: u8| InputSource::StreamDeck {
        device: id as u8,
        key,
    };

    render_all(
        &device,
        &geometry,
        renderer,
        key_size,
        &keys,
        &state,
        &mut rendered,
        &mut images,
    )
    .await?;
    if let Some(size) = lcd_size {
        render_lcd(
            &device,
            kind,
            renderer,
            size,
            &geometry,
            &state,
            &snapshot,
            &mut lcd_rendered,
        )
        .await?;
    }
    publish_deck_view(
        bus, id, kind, &serial, is_mock, &geometry, key_size, &keys, &state, &snapshot, &images,
    );

    loop {
        let mut relayout = false;
        let mut pending_updates: Vec<DeviceStateUpdate> = Vec::new();
        tokio::select! {
            changed = snapshots.changed() => {
                if changed.is_err() { return Ok(()); }
                snapshot = with_demo_targets(snapshots.borrow().clone(), is_mock);
                relayout = true;
            }
            _ = blink.tick() => {
                state.blink_phase = !state.blink_phase;
                if state.expire_volume_layer(volume_timeout)
                    || state.expire_member_layer(volume_timeout)
                {
                    relayout = true;
                }
            }
            injected = deck_input.recv() => {
                if let Some(input) = injected {
                    pending_updates.push(injected_update(input));
                }
            }
            updates = device.read(&reader) => {
                let updates = updates.context("reading deck input")?;
                pending_updates.extend(updates);
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

        for update in pending_updates {
            let now = Instant::now();
            match update {
                DeviceStateUpdate::ButtonDown(key) => {
                    let Some(spec) = keys.get(key as usize) else {
                        continue;
                    };
                    let role = spec.role;
                    pressed.insert(key, PressedKey { role, since: now });
                    match role {
                        Role::Status => {}
                        Role::Reply => {
                            let _ = bus
                                .commands
                                .send(Command::TalkPress {
                                    source: source(key),
                                    target: TargetRef::Reply,
                                })
                                .await;
                        }
                        Role::Target(target) => {
                            if state.volume_layer {
                                state.selected = Some(target);
                                state.touch_volume_layer();
                                relayout = true;
                            } else if target.can_talk() {
                                if matches!(target, TargetKey::User(_))
                                    && snapshot
                                        .targets
                                        .iter()
                                        .find(|t| t.key == target)
                                        .is_some_and(|t| !t.online)
                                {
                                    // Offline users stay grey; the press is ignored so
                                    // the operator sees that talk does not engage.
                                } else {
                                    let _ = bus
                                        .commands
                                        .send(Command::TalkPress {
                                            source: source(key),
                                            target: TargetRef::Key(target),
                                        })
                                        .await;
                                }
                            } else {
                                let _ = bus.commands.send(Command::MuteToggle(target)).await;
                            }
                        }
                        Role::Member { user_id, .. } => {
                            state.member_selected = Some(user_id);
                            state.touch_member_layer();
                            relayout = true;
                        }
                        Role::NextPage => {
                            let pages = page_count(&geometry, key_item_count(&snapshot, &state));
                            if state.member_layer {
                                cycle_page(&mut state.member_page, pages, true);
                                state.touch_member_layer();
                            } else {
                                cycle_page(&mut state.page, pages, true);
                            }
                            relayout = true;
                        }
                        Role::NextEncoderPage => {
                            let pages =
                                encoder_page_count(&geometry, key_item_count(&snapshot, &state));
                            cycle_page(&mut state.encoder_page, pages, true);
                            if state.member_layer {
                                state.touch_member_layer();
                            }
                            relayout = true;
                        }
                        Role::VolumeToggle => {
                            if !volume_toggle_defers_to_release(&geometry) {
                                state.toggle_volume_layer(&snapshot);
                                relayout = true;
                            }
                        }
                        Role::MembersToggle => {
                            relayout = state.toggle_member_layer(&snapshot, None);
                        }
                        Role::VolumeUp | Role::VolumeDown => {
                            let delta = if role == Role::VolumeUp {
                                config.volume_step_db()
                            } else {
                                -config.volume_step_db()
                            };
                            if state.member_layer {
                                state.touch_member_layer();
                                if let (Some(conference), Some(user_id)) =
                                    (state.member_conference, state.member_selected)
                                {
                                    let current = conference_members(&snapshot, conference)
                                        .iter()
                                        .find(|member| member.user_id == user_id)
                                        .map(|member| member.volume)
                                        .unwrap_or(1.0);
                                    let _ = bus
                                        .commands
                                        .send(Command::MemberVolumeSet {
                                            conference,
                                            user_id,
                                            volume: step_volume_db(current, delta),
                                        })
                                        .await;
                                }
                            } else {
                                state.touch_volume_layer();
                                if let Some(target) = state.selected {
                                    let current = snapshot
                                        .targets
                                        .iter()
                                        .find(|t| t.key == target)
                                        .map(|t| t.volume)
                                        .unwrap_or(1.0);
                                    let _ = bus
                                        .commands
                                        .send(Command::VolumeSet {
                                            target,
                                            volume: step_volume_db(current, delta),
                                        })
                                        .await;
                                }
                            }
                        }
                        Role::MuteSelected => {
                            if state.member_layer {
                                state.touch_member_layer();
                                if let (Some(conference), Some(user_id)) =
                                    (state.member_conference, state.member_selected)
                                {
                                    let _ = bus
                                        .commands
                                        .send(Command::MemberMuteToggle {
                                            conference,
                                            user_id,
                                        })
                                        .await;
                                }
                            } else {
                                state.touch_volume_layer();
                                if let Some(target) = state.selected {
                                    let _ = bus.commands.send(Command::MuteToggle(target)).await;
                                }
                            }
                        }
                        Role::Empty => {}
                    }
                }
                DeviceStateUpdate::ButtonUp(key) => {
                    let Some(press) = pressed.remove(&key) else {
                        continue;
                    };
                    let held = now.duration_since(press.since);
                    match press.role {
                        Role::Status => {
                            if held >= STATUS_HOLD {
                                let pages =
                                    page_count(&geometry, key_item_count(&snapshot, &state));
                                if state.member_layer {
                                    cycle_page(&mut state.member_page, pages, true);
                                    state.touch_member_layer();
                                } else {
                                    cycle_page(&mut state.page, pages, true);
                                }
                                relayout = true;
                            } else {
                                let _ = bus.commands.send(Command::ClearLocks).await;
                            }
                        }
                        Role::Reply => {
                            let _ = bus
                                .commands
                                .send(Command::TalkRelease {
                                    source: source(key),
                                    target: TargetRef::Reply,
                                })
                                .await;
                        }
                        Role::Target(target) => {
                            if state.volume_layer {
                                if held >= MUTE_HOLD {
                                    let _ = bus.commands.send(Command::MuteToggle(target)).await;
                                }
                            } else if target.can_talk() {
                                let _ = bus
                                    .commands
                                    .send(Command::TalkRelease {
                                        source: source(key),
                                        target: TargetRef::Key(target),
                                    })
                                    .await;
                            }
                        }
                        Role::Member {
                            conference,
                            user_id,
                        } => {
                            if held >= MUTE_HOLD {
                                let _ = bus
                                    .commands
                                    .send(Command::MemberMuteToggle {
                                        conference,
                                        user_id,
                                    })
                                    .await;
                                state.touch_member_layer();
                            }
                        }
                        Role::VolumeToggle if volume_toggle_defers_to_release(&geometry) => {
                            if held >= MUTE_HOLD {
                                relayout = state.open_member_layer(&snapshot, None);
                            } else {
                                state.toggle_volume_layer(&snapshot);
                                relayout = true;
                            }
                        }
                        _ => {}
                    }
                }
                DeviceStateUpdate::EncoderTwist(encoder, ticks) => {
                    let delta = config.volume_step_db() * ticks as f32;
                    match bound_encoder(&geometry, &state, &snapshot, encoder) {
                        Some(BoundEncoder::Target(target)) => {
                            let current = snapshot
                                .targets
                                .iter()
                                .find(|t| t.key == target)
                                .map(|t| t.volume)
                                .unwrap_or(1.0);
                            let _ = bus
                                .commands
                                .send(Command::VolumeSet {
                                    target,
                                    volume: step_volume_db(current, delta),
                                })
                                .await;
                        }
                        Some(BoundEncoder::Member {
                            conference,
                            user_id,
                            volume,
                        }) => {
                            if state.member_layer {
                                state.touch_member_layer();
                            }
                            let _ = bus
                                .commands
                                .send(Command::MemberVolumeSet {
                                    conference,
                                    user_id,
                                    volume: step_volume_db(volume, delta),
                                })
                                .await;
                        }
                        None => {}
                    }
                }
                DeviceStateUpdate::EncoderDown(encoder) => {
                    pressed_encoders.insert(encoder, now);
                }
                DeviceStateUpdate::EncoderUp(encoder) => {
                    let Some(since) = pressed_encoders.remove(&encoder) else {
                        continue;
                    };
                    let held = now.duration_since(since);
                    match bound_encoder(&geometry, &state, &snapshot, encoder) {
                        Some(BoundEncoder::Member {
                            conference,
                            user_id,
                            ..
                        }) => {
                            let _ = bus
                                .commands
                                .send(Command::MemberMuteToggle {
                                    conference,
                                    user_id,
                                })
                                .await;
                            state.touch_member_layer();
                        }
                        Some(BoundEncoder::Target(target)) => {
                            if held >= MUTE_HOLD && matches!(target, TargetKey::Conference(_)) {
                                relayout = state.open_member_layer(&snapshot, Some(target));
                            } else {
                                let _ = bus.commands.send(Command::MuteToggle(target)).await;
                            }
                        }
                        None => {}
                    }
                }
                DeviceStateUpdate::TouchPointDown(point) => {
                    let pages = page_count(&geometry, key_item_count(&snapshot, &state)).max(1);
                    if state.member_layer {
                        cycle_page(&mut state.member_page, pages, point != 0);
                        state.touch_member_layer();
                    } else {
                        cycle_page(&mut state.page, pages, point != 0);
                    }
                    relayout = true;
                }
                DeviceStateUpdate::TouchPointUp(_) => {}
                DeviceStateUpdate::TouchScreenSwipe((x0, y0), (x1, y1)) => {
                    let forward = if lcd_size.map(|(w, h)| w >= h).unwrap_or(true) {
                        x1 < x0
                    } else {
                        y1 < y0
                    };
                    if geometry.encoders_follow_bottom_row()
                        || encoder_page_count(&geometry, key_item_count(&snapshot, &state)) <= 1
                    {
                        let pages = page_count(&geometry, key_item_count(&snapshot, &state)).max(1);
                        if state.member_layer {
                            cycle_page(&mut state.member_page, pages, forward);
                            state.touch_member_layer();
                        } else {
                            cycle_page(&mut state.page, pages, forward);
                        }
                    } else {
                        let pages =
                            encoder_page_count(&geometry, key_item_count(&snapshot, &state)).max(1);
                        cycle_page(&mut state.encoder_page, pages, forward);
                        if state.member_layer {
                            state.touch_member_layer();
                        }
                    }
                    relayout = true;
                }
                DeviceStateUpdate::TouchScreenPress(x, y)
                | DeviceStateUpdate::TouchScreenLongPress(x, y) => {
                    if let Some((w, h)) = lcd_size {
                        let encoders = geometry.encoders.max(1) as u32;
                        let index = if w >= h {
                            x as u32 * encoders / w.max(1)
                        } else {
                            y as u32 * encoders / h.max(1)
                        };
                        match bound_encoder(&geometry, &state, &snapshot, index as u8) {
                            Some(BoundEncoder::Target(target)) => {
                                let _ = bus.commands.send(Command::MuteToggle(target)).await;
                            }
                            Some(BoundEncoder::Member {
                                conference,
                                user_id,
                                ..
                            }) => {
                                let _ = bus
                                    .commands
                                    .send(Command::MemberMuteToggle {
                                        conference,
                                        user_id,
                                    })
                                    .await;
                                state.touch_member_layer();
                            }
                            None => {}
                        }
                    }
                }
            }
        }

        if relayout {
            if state.member_layer {
                match state.member_conference.and_then(|key| snapshot.target(key)) {
                    None => state.close_member_layer(),
                    Some(target) => {
                        if !state.member_selected.is_some_and(|id| {
                            target.members.iter().any(|member| member.user_id == id)
                        }) {
                            state.member_selected =
                                target.members.first().map(|member| member.user_id);
                        }
                    }
                }
            }
            state.clamp_pages(&geometry, &snapshot);
            keys = layout::layout(&geometry, &snapshot, &state, &options);
        }
        let keys_changed = render_all(
            &device,
            &geometry,
            renderer,
            key_size,
            &keys,
            &state,
            &mut rendered,
            &mut images,
        )
        .await?;
        if relayout || keys_changed {
            publish_deck_view(
                bus, id, kind, &serial, is_mock, &geometry, key_size, &keys, &state, &snapshot,
                &images,
            );
        }
        if let Some(size) = lcd_size {
            render_lcd(
                &device,
                kind,
                renderer,
                size,
                &geometry,
                &state,
                &snapshot,
                &mut lcd_rendered,
            )
            .await?;
        }
    }
}

fn effective_key_size(kind: Kind) -> (u32, u32) {
    let (w, h) = kind.key_image_format().size;
    if w == 0 || h == 0 {
        (96, 96)
    } else {
        (w as u32, h as u32)
    }
}

fn layout_options(device: &StreamDeckDeviceConfig) -> LayoutOptions {
    let from_layout = |index: &str| {
        device
            .layout
            .get(index)
            .and_then(|value| TargetKey::parse(value))
    };
    LayoutOptions {
        pedal_left: from_layout("0")
            .or_else(|| device.pedal_left.as_deref().and_then(TargetKey::parse)),
        pedal_middle: from_layout("1")
            .or_else(|| device.pedal_target.as_deref().and_then(TargetKey::parse)),
    }
}

fn with_demo_targets(snapshot: Arc<Snapshot>, is_mock: bool) -> Arc<Snapshot> {
    if !is_mock || !snapshot.targets.is_empty() {
        return snapshot;
    }
    let Ok(raw) = std::env::var(DEMO_TARGETS_ENV) else {
        return snapshot;
    };
    let targets = parse_demo_targets(&raw);
    if targets.is_empty() {
        return snapshot;
    }
    let mut snap = (*snapshot).clone();
    snap.targets = targets;
    if let Ok(reply) = std::env::var(DEMO_REPLY_ENV) {
        let reply = reply.trim();
        if !reply.is_empty() {
            snap.reply_name = Some(reply.to_string());
            if let Some(target) = snap
                .targets
                .iter()
                .find(|target| target.name.eq_ignore_ascii_case(reply))
            {
                snap.reply_target = Some(target.key);
            }
        }
    }
    Arc::new(snap)
}

fn parse_demo_targets(raw: &str) -> Vec<TargetInfo> {
    let mut users = 0i64;
    let mut conferences = 0i64;
    let mut feeds = 0i64;
    raw.split(',')
        .filter_map(|part| {
            let part = part.trim();
            if part.is_empty() {
                return None;
            }
            let (kind, name) = if let Some((kind, name)) = part.split_once(':') {
                let kind = kind.trim().to_ascii_lowercase();
                if matches!(kind.as_str(), "user" | "conference" | "conf" | "feed") {
                    (kind, name.trim().to_string())
                } else {
                    ("user".into(), part.to_string())
                }
            } else {
                ("user".into(), part.to_string())
            };
            let (key, can_talk) = match kind.as_str() {
                "conference" | "conf" => {
                    conferences += 1;
                    (TargetKey::Conference(conferences), true)
                }
                "feed" => {
                    feeds += 1;
                    (TargetKey::Feed(feeds), false)
                }
                _ => {
                    users += 1;
                    (TargetKey::User(users), true)
                }
            };
            Some(TargetInfo {
                key,
                name,
                can_talk,
                online: true,
                held: false,
                locked: false,
                incoming: false,
                receiving: false,
                volume: 0.8,
                muted: false,
                members: if matches!(kind.as_str(), "conference" | "conf") {
                    demo_conference_members()
                } else {
                    Vec::new()
                },
            })
        })
        .collect()
}

fn demo_conference_members() -> Vec<ConferenceMemberInfo> {
    vec![
        ConferenceMemberInfo {
            user_id: 101,
            name: "Adi".into(),
            online: true,
            receiving: true,
            volume: 0.9,
            muted: false,
        },
        ConferenceMemberInfo {
            user_id: 102,
            name: "Beni".into(),
            online: true,
            receiving: false,
            volume: 0.7,
            muted: false,
        },
        ConferenceMemberInfo {
            user_id: 103,
            name: "Jan".into(),
            online: false,
            receiving: false,
            volume: 0.5,
            muted: true,
        },
    ]
}

fn dial_views(geometry: &Geometry, state: &DeckState, snapshot: &Snapshot) -> Vec<DeckDialView> {
    encoder_bindings(geometry, state, snapshot)
        .into_iter()
        .enumerate()
        .map(|(index, binding)| match binding {
            Some(EncoderBinding::Target(target)) => DeckDialView {
                index: index as u8,
                role: target.key.to_string(),
                title: target.name.clone(),
                subtitle: crate::audio::mixer::format_volume_db(target.volume),
            },
            Some(EncoderBinding::Member { conference, member }) => DeckDialView {
                index: index as u8,
                role: format!("{conference}/user:{}", member.user_id),
                title: member.name.clone(),
                subtitle: crate::audio::mixer::format_volume_db(member.volume),
            },
            None => DeckDialView {
                index: index as u8,
                role: String::new(),
                title: String::new(),
                subtitle: String::new(),
            },
        })
        .collect()
}

/// Re-renders keys whose appearance (or blink phase, when blinking) changed
/// and keeps PNG copies for the web UI. Returns true when anything changed.
#[allow(clippy::too_many_arguments)]
async fn render_all(
    device: &Device,
    geometry: &Geometry,
    renderer: &Renderer,
    key_size: (u32, u32),
    keys: &[KeySpec],
    state: &DeckState,
    rendered: &mut HashMap<u8, (Appearance, bool)>,
    images: &mut HashMap<u8, (u64, Arc<Vec<u8>>)>,
) -> Result<bool> {
    let write_hardware = geometry.visual || device.is_mock();
    let mut changed = false;
    for (index, spec) in keys.iter().enumerate() {
        let key = index as u8;
        let phase = spec.appearance.blink.is_some() && state.blink_phase;
        let needs = match rendered.get(&key) {
            Some((previous, previous_phase)) => {
                *previous != spec.appearance || *previous_phase != phase
            }
            None => true,
        };
        if !needs {
            continue;
        }
        let image = renderer.key(&spec.appearance, key_size, phase);
        if let Some(png) = encode_png(&image) {
            images.insert(key, (image_hash(&image), Arc::new(png)));
        }
        if write_hardware {
            device
                .set_key(key, image)
                .await
                .context("writing key image")?;
        }
        rendered.insert(key, (spec.appearance.clone(), phase));
        changed = true;
    }
    if changed && write_hardware {
        device.flush().await.context("flushing deck")?;
    }
    Ok(changed)
}

/// Publishes the deck view (geometry, key roles and image hashes) for the web UI.
#[allow(clippy::too_many_arguments)]
fn publish_deck_view(
    bus: &Bus,
    id: usize,
    kind: Kind,
    serial: &Option<String>,
    is_mock: bool,
    geometry: &Geometry,
    key_size: (u32, u32),
    keys: &[KeySpec],
    state: &DeckState,
    snapshot: &Snapshot,
    images: &HashMap<u8, (u64, Arc<Vec<u8>>)>,
) {
    let Ok(mut hardware) = bus.hardware.write() else {
        return;
    };
    if hardware.decks.len() <= id {
        hardware.decks.resize(id + 1, DeckStatus::default());
    }
    hardware.decks[id] = DeckStatus {
        id,
        enabled: true,
        connected: true,
        mock: is_mock,
        kind: Some(format!("{kind:?}")),
        serial: serial.clone(),
        rows: geometry.rows,
        cols: geometry.cols,
        encoders: geometry.encoders,
        touchpoints: geometry.touchpoints,
        key_size: key_size.0,
        page: if state.member_layer {
            state.member_page
        } else {
            state.page
        },
        pages: page_count(geometry, key_item_count(snapshot, state)),
        encoder_page: state.encoder_page,
        encoder_pages: encoder_page_count(geometry, key_item_count(snapshot, state)),
        volume_layer: state.volume_layer,
        member_layer: state.member_layer,
        keys: keys
            .iter()
            .enumerate()
            .map(|(index, spec)| DeckKeyView {
                index: index as u8,
                role: role_label(spec.role),
                title: spec.appearance.title.clone(),
                subtitle: spec.appearance.subtitle.clone(),
                hash: images
                    .get(&(index as u8))
                    .map(|(hash, _)| hash.to_string())
                    .unwrap_or_else(|| "0".into()),
            })
            .collect(),
        dials: dial_views(geometry, state, snapshot),
        error: None,
    };
    hardware.deck_images.retain(|(device, _), _| *device != id);
    for (key, image) in images {
        hardware.deck_images.insert((id, *key), image.clone());
    }
}

#[allow(clippy::too_many_arguments)]
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
        encoder_bindings(geometry, state, snapshot)
            .into_iter()
            .map(|binding| match binding {
                Some(EncoderBinding::Target(target)) => StripSegment {
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
                Some(EncoderBinding::Member { member, .. }) => StripSegment {
                    title: member.name.clone(),
                    volume: member.volume,
                    muted: member.muted,
                    background: if member.receiving {
                        palette::RECEIVING
                    } else if member.muted {
                        palette::MUTED
                    } else {
                        palette::MEMBERS
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
            title: format!(
                "{} · {}",
                snapshot.user_name,
                if snapshot.on_air {
                    "ON AIR"
                } else {
                    snapshot.connection.label()
                }
            ),
            volume: if snapshot.talking { 1.0 } else { 0.0 },
            muted: false,
            background: if snapshot.on_air {
                palette::ON_AIR
            } else {
                palette::STATUS_OK
            },
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

#[cfg(test)]
mod tests {
    use super::kind_from_name;

    #[test]
    fn kind_from_name_accepts_config_models() {
        for name in [
            "original",
            "originalv2",
            "v2",
            "mini",
            "minimk2",
            "mk2",
            "xl",
            "xlv2",
            "plus",
            "plusxl",
            "neo",
            "pedal",
            "MK-2",
            "Plus XL",
        ] {
            assert!(kind_from_name(name).is_some(), "{name}");
        }
        assert!(kind_from_name("nope").is_none());
        assert!(kind_from_name("").is_none());
    }

    #[test]
    fn parse_demo_targets_names_kinds() {
        let targets = super::parse_demo_targets("adi,conference:News,feed:Virus,beni");
        assert_eq!(targets.len(), 4);
        assert_eq!(targets[0].key, crate::talk::TargetKey::User(1));
        assert_eq!(targets[0].name, "adi");
        assert_eq!(targets[1].key, crate::talk::TargetKey::Conference(1));
        assert_eq!(targets[1].name, "News");
        assert_eq!(targets[2].key, crate::talk::TargetKey::Feed(1));
        assert!(!targets[2].can_talk);
        assert_eq!(targets[3].name, "beni");
        assert_eq!(targets[1].members.len(), 3);
        assert_eq!(targets[1].members[0].name, "Adi");
        assert!(targets[0].members.is_empty());
    }
}
