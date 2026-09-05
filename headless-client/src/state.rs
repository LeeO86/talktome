//! Shared runtime state published to surfaces and the commands they send back.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use serde::Serialize;
use tokio::sync::{mpsc, watch};

use crate::talk::TargetKey;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConnectionState {
    /// Not connected; `retry_in_ms` in the snapshot says when we try again.
    Disconnected,
    Connecting,
    LoggingIn,
    Registering,
    /// Another session holds the account and the conflict policy is `wait`.
    Conflict,
    /// The server closed our session in favour of another one.
    Kicked,
    /// Registered; media not yet ready.
    Registered,
    /// Registered and both transports connected.
    Ready,
}

impl ConnectionState {
    pub fn is_online(self) -> bool {
        matches!(self, ConnectionState::Registered | ConnectionState::Ready)
    }

    pub fn label(self) -> &'static str {
        match self {
            ConnectionState::Disconnected => "offline",
            ConnectionState::Connecting => "connecting",
            ConnectionState::LoggingIn => "login",
            ConnectionState::Registering => "registering",
            ConnectionState::Conflict => "conflict",
            ConnectionState::Kicked => "kicked",
            ConnectionState::Registered => "media…",
            ConnectionState::Ready => "ready",
        }
    }
}

/// One target as rendered on a key: identity plus live state.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TargetInfo {
    pub key: TargetKey,
    pub name: String,
    pub can_talk: bool,
    /// Online (users) / has members online (conferences) / producing (feeds).
    pub online: bool,
    pub held: bool,
    pub locked: bool,
    /// This target (or someone in it) is currently addressing us.
    pub incoming: bool,
    /// We currently receive audio from this target.
    pub receiving: bool,
    pub volume: f32,
    pub muted: bool,
    /// Conference members (empty for users and feeds). Each can be heard
    /// independently, like the browser client's member mix.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub members: Vec<ConferenceMemberInfo>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ConferenceMemberInfo {
    pub user_id: i64,
    pub name: String,
    pub online: bool,
    pub receiving: bool,
    pub volume: f32,
    pub muted: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct IncomingInfo {
    pub from_name: String,
    pub target: Option<TargetKey>,
}

/// Media transport details for the status page.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct MediaInfo {
    pub send_state: String,
    pub recv_state: String,
    pub consumers: usize,
    pub producer_id: Option<String>,
    pub ice_servers: Vec<String>,
    /// URLs announced by the Talktome server (often `turns:…?transport=tcp`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ice_servers_announced: Vec<String>,
    pub ice_transport_policy: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Snapshot {
    pub instance: String,
    pub user_name: String,
    pub user_id: Option<i64>,
    pub server_url: String,
    pub production: Option<String>,
    pub connection: ConnectionState,
    pub detail: String,
    pub talking: bool,
    pub lock_active: bool,
    pub on_air: bool,
    pub audio_ok: bool,
    pub targets: Vec<TargetInfo>,
    pub reply_target: Option<TargetKey>,
    pub reply_name: Option<String>,
    pub incoming: Vec<IncomingInfo>,
    /// Peak input level in dBFS for meters / VOX display.
    pub input_level_db: f32,
    pub media: Option<MediaInfo>,
    /// Unix seconds when the current registration became active.
    pub registered_since_unix: Option<u64>,
    pub reconnects: u32,
}

impl Snapshot {
    pub fn initial(instance: &str, user_name: &str) -> Self {
        Self {
            instance: instance.to_string(),
            user_name: user_name.to_string(),
            user_id: None,
            server_url: String::new(),
            production: None,
            connection: ConnectionState::Disconnected,
            detail: String::new(),
            talking: false,
            lock_active: false,
            on_air: false,
            audio_ok: false,
            targets: Vec::new(),
            reply_target: None,
            reply_name: None,
            incoming: Vec::new(),
            input_level_db: -100.0,
            media: None,
            registered_since_unix: None,
            reconnects: 0,
        }
    }

    pub fn target(&self, key: TargetKey) -> Option<&TargetInfo> {
        self.targets.iter().find(|t| t.key == key)
    }
}

/// What a talk action refers to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TargetRef {
    Key(TargetKey),
    Reply,
}

/// Identifies who is pressing, so a Companion press does not release a
/// physically held key for the same target.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum InputSource {
    StreamDeck(u8),
    Gpio(String),
    Companion(String),
}

#[derive(Debug, Clone)]
pub enum Command {
    TalkPress {
        source: InputSource,
        target: TargetRef,
    },
    TalkRelease {
        source: InputSource,
        target: TargetRef,
    },
    LockToggle {
        target: TargetRef,
    },
    ClearLocks,
    MuteToggle(TargetKey),
    VolumeStep {
        target: TargetKey,
        delta: f32,
    },
    VolumeSet {
        target: TargetKey,
        volume: f32,
    },
    MemberVolumeSet {
        conference: TargetKey,
        user_id: i64,
        volume: f32,
    },
    MemberMuteToggle {
        conference: TargetKey,
        user_id: i64,
    },
    /// Request a fresh snapshot broadcast (e.g. after a deck reconnects).
    Refresh,
    Shutdown,
}

/// Live view of a GPIO output line.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct GpioOutputView {
    pub name: String,
    pub line: String,
    pub active_low: bool,
    /// `None` until the line has been driven.
    pub active: Option<bool>,
    pub error: Option<String>,
}

/// Live view of a GPIO input line.
#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct GpioInputView {
    pub line: String,
    pub action: String,
    pub target: Option<String>,
    pub active_low: bool,
    pub pressed: bool,
    pub events: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct GpioStatus {
    /// `disabled`, `gpiocdev`, `mock` or `error`.
    pub backend: String,
    pub error: Option<String>,
    pub outputs: Vec<GpioOutputView>,
    pub inputs: Vec<GpioInputView>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct DeckKeyView {
    pub index: u8,
    pub role: String,
    pub title: String,
    pub subtitle: String,
    /// Changes whenever the rendered image changes; used as cache key.
    pub hash: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct DeckStatus {
    pub enabled: bool,
    pub connected: bool,
    pub mock: bool,
    pub kind: Option<String>,
    pub serial: Option<String>,
    pub rows: u8,
    pub cols: u8,
    pub encoders: u8,
    pub touchpoints: u8,
    pub key_size: u32,
    pub page: usize,
    pub pages: usize,
    pub volume_layer: bool,
    pub keys: Vec<DeckKeyView>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Default)]
pub struct AudioView {
    pub capture_ok: bool,
    pub playback_ok: bool,
    pub capture_device: Option<String>,
    pub playback_device: Option<String>,
    pub last_error: Option<String>,
}

/// Hardware state written by the surfaces and read by the web UI.
#[derive(Debug, Default)]
pub struct Hardware {
    pub gpio: GpioStatus,
    pub deck: DeckStatus,
    /// Rendered key images (PNG) keyed by key index with their hash.
    pub deck_images: HashMap<u8, (u64, Arc<Vec<u8>>)>,
    pub audio: AudioView,
}

/// Input injected into the Stream Deck surface (from the web UI).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeckInput {
    KeyDown(u8),
    KeyUp(u8),
    EncoderTwist(u8, i8),
    EncoderPress(u8),
    TouchPoint(u8),
}

/// Publisher side of the state channel plus the command inlet, handed to
/// surfaces, the web UI and audio.
#[derive(Clone)]
pub struct Bus {
    pub commands: mpsc::Sender<Command>,
    pub snapshots: watch::Receiver<Arc<Snapshot>>,
    pub hardware: Arc<RwLock<Hardware>>,
    pub deck_input: mpsc::Sender<DeckInput>,
}

pub struct Channels {
    pub commands: mpsc::Receiver<Command>,
    pub snapshots: watch::Sender<Arc<Snapshot>>,
    pub deck_input: mpsc::Receiver<DeckInput>,
    pub bus: Bus,
}

pub fn channels(initial: Snapshot) -> Channels {
    let (cmd_tx, cmd_rx) = mpsc::channel(256);
    let (snap_tx, snap_rx) = watch::channel(Arc::new(initial));
    let (deck_tx, deck_rx) = mpsc::channel(64);
    let bus = Bus {
        commands: cmd_tx,
        snapshots: snap_rx,
        hardware: Arc::new(RwLock::new(Hardware::default())),
        deck_input: deck_tx,
    };
    Channels {
        commands: cmd_rx,
        snapshots: snap_tx,
        deck_input: deck_rx,
        bus,
    }
}
