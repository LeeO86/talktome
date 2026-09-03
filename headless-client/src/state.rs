//! Shared runtime state published to surfaces and the commands they send back.

use std::sync::Arc;

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
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct IncomingInfo {
    pub from_name: String,
    pub target: Option<TargetKey>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Snapshot {
    pub instance: String,
    pub user_name: String,
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
}

impl Snapshot {
    pub fn initial(instance: &str, user_name: &str) -> Self {
        Self {
            instance: instance.to_string(),
            user_name: user_name.to_string(),
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
    Vox,
}

#[derive(Debug, Clone)]
pub enum Command {
    TalkPress { source: InputSource, target: TargetRef },
    TalkRelease { source: InputSource, target: TargetRef },
    LockToggle { target: TargetRef },
    ClearLocks,
    MuteToggle(TargetKey),
    VolumeStep { target: TargetKey, delta: f32 },
    VolumeSet { target: TargetKey, volume: f32 },
    /// Request a fresh snapshot broadcast (e.g. after a deck reconnects).
    Refresh,
    Shutdown,
}

/// Publisher side of the state channel plus the command inlet, handed to
/// surfaces and audio.
#[derive(Clone)]
pub struct Bus {
    pub commands: mpsc::Sender<Command>,
    pub snapshots: watch::Receiver<Arc<Snapshot>>,
}

pub fn channels(initial: Snapshot) -> (mpsc::Sender<Command>, mpsc::Receiver<Command>, watch::Sender<Arc<Snapshot>>, Bus) {
    let (cmd_tx, cmd_rx) = mpsc::channel(256);
    let (snap_tx, snap_rx) = watch::channel(Arc::new(initial));
    let bus = Bus {
        commands: cmd_tx.clone(),
        snapshots: snap_rx,
    };
    (cmd_tx, cmd_rx, snap_tx, bus)
}
