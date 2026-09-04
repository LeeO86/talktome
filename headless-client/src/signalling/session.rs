//! The session orchestrator: keeps one Talktome user registered, owns the
//! WebRTC transports, applies talk/audio commands from surfaces and
//! Companion, and publishes state snapshots.

use std::collections::{BTreeSet, HashMap};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, Context, Result};
use rand::Rng;
use serde_json::{json, Value};
use tokio::sync::{mpsc, watch};

use super::http::{LoginResponse, ServerApi, TargetEntry};
use super::socketio::{ConnectOptions, SocketClient, SocketEvent};
use crate::audio::codec::OpusEncoder;
use crate::audio::io::AudioStatus;
use crate::audio::mixer::Mixer;
use crate::audio::vox::{peak_db, LevelTrigger};
use crate::config::{Config, ConflictPolicy};
use crate::rtc::types::{ProducerAnnouncement, RtpCapabilities};
use crate::rtc::{
    Direction, MediaFactory, RecvTransport, RtcEvent, RtcSettings, RxPacket, SendTransport,
    SIGNAL_TIMEOUT,
};
use crate::state::{
    Command, ConnectionState, IncomingInfo, InputSource, Snapshot, TargetInfo, TargetRef,
};
use crate::talk::{AudioState, TalkChange, TalkModel, TargetKey};
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;

const ACTIVE_PRODUCER_SYNC: Duration = Duration::from_secs(10);
const SNAPSHOT_DEBOUNCE: Duration = Duration::from_millis(200);
const MAX_BACKOFF: Duration = Duration::from_secs(30);
const MAX_IDLE_RECV_SECTIONS: usize = 32;

/// Inputs shared with the audio thread and surfaces.
pub struct SessionIo {
    pub commands: mpsc::Receiver<Command>,
    pub snapshots: watch::Sender<Arc<Snapshot>>,
    pub mixer: Arc<Mutex<Mixer>>,
    pub frames: mpsc::Receiver<Vec<f32>>,
    pub audio_status: watch::Receiver<AudioStatus>,
    pub shutdown: watch::Receiver<bool>,
}

#[derive(Debug, Clone)]
struct Target {
    key: TargetKey,
    name: String,
    can_talk: bool,
    members: Vec<i64>,
}

struct Media {
    factory: MediaFactory,
    send: SendTransport,
    recv: Arc<RecvTransport>,
    send_state: RTCPeerConnectionState,
    recv_state: RTCPeerConnectionState,
    /// consumer id -> target key
    consumers: HashMap<String, TargetKey>,
    /// producer id -> consumer id
    producers: HashMap<String, String>,
    /// Transport state events for this media generation only.
    rtc_rx: mpsc::Receiver<RtcEvent>,
}

struct Connected {
    socket: SocketClient,
    events: mpsc::Receiver<SocketEvent>,
    user_id: i64,
    user_name: String,
    production_id: Option<Value>,
    media: Option<Media>,
}

enum Event {
    Socket(SocketEvent),
    Rtc(RtcEvent),
    Rx(RxPacket),
    Command(Command),
    Frame(Vec<f32>),
    AudioStatus,
    Tick,
    Shutdown,
}

/// Why the connected loop ended.
enum Exit {
    Disconnected(String),
    Kicked,
    Shutdown,
}

pub struct Session {
    config: Arc<Config>,
    io: SessionIo,
    api: ServerApi,
    token: Option<(String, Instant)>,
    login: Option<LoginResponse>,
    encoder: OpusEncoder,
    frame_duration: Duration,
    talk: TalkModel,
    audio: AudioState,
    vox: Option<LevelTrigger>,
    targets: Vec<Target>,
    online_users: BTreeSet<i64>,
    incoming: Vec<IncomingInfo>,
    incoming_keys: BTreeSet<TargetKey>,
    on_air: bool,
    connection: ConnectionState,
    detail: String,
    input_level_db: f32,
    rx_tx: mpsc::Sender<RxPacket>,
    rx_rx: mpsc::Receiver<RxPacket>,
    snapshot_dirty: bool,
    last_snapshot: Instant,
    audio_state_dirty: bool,
    last_audio_snapshot: Instant,
    backoff: Duration,
    healthy_since: Option<Instant>,
    /// Server-side state we cannot send while disconnected; flushed on reconnect.
    pending_talk_change: Option<TalkChange>,
    registered_since: Option<std::time::SystemTime>,
    reconnects: u32,
    /// Details of the current transports for the status page.
    media_info: Option<crate::state::MediaInfo>,
}

impl Session {
    pub fn new(config: Arc<Config>, io: SessionIo) -> Result<Self> {
        let tls = crate::tls::build_client_config(&config.tls)?;
        let api = ServerApi::new(config.server_url(), tls)?;
        let profile = config.audio.profile;
        let encoder = OpusEncoder::new(profile.frame_ms(), profile.bitrate(), profile.fec())?;
        let mut talk = TalkModel::new(config.talk.tap_ms, config.talk.lock_multiple);
        let vox = if config.vox.enabled {
            talk.set_vox_target(config.vox.target.as_deref().and_then(TargetKey::parse));
            Some(LevelTrigger::new(
                config.vox.threshold_db,
                config.vox.hang_ms,
            ))
        } else {
            None
        };
        let audio = AudioState::load(&config.state_dir(), config.audio.default_volume);
        let (rx_tx, rx_rx) = mpsc::channel(1024);
        Ok(Self {
            frame_duration: Duration::from_millis(profile.frame_ms() as u64),
            config,
            io,
            api,
            token: None,
            login: None,
            encoder,
            talk,
            audio,
            vox,
            targets: Vec::new(),
            online_users: BTreeSet::new(),
            incoming: Vec::new(),
            incoming_keys: BTreeSet::new(),
            on_air: false,
            connection: ConnectionState::Disconnected,
            detail: String::new(),
            input_level_db: -120.0,
            rx_tx,
            rx_rx,
            snapshot_dirty: true,
            last_snapshot: Instant::now() - SNAPSHOT_DEBOUNCE,
            audio_state_dirty: false,
            last_audio_snapshot: Instant::now(),
            backoff: Duration::from_secs(1),
            healthy_since: None,
            pending_talk_change: None,
            registered_since: None,
            reconnects: 0,
            media_info: None,
        })
    }

    /// Runs until shutdown is requested.
    pub async fn run(mut self) -> Result<()> {
        loop {
            if *self.io.shutdown.borrow() {
                break;
            }
            self.set_connection(ConnectionState::Connecting, "");
            self.publish(true);

            let mut shutdown = self.io.shutdown.clone();
            let attempt = tokio::select! {
                result = self.connect() => result,
                _ = wait_true(&mut shutdown) => break,
            };

            match attempt {
                Ok(connected) => {
                    self.backoff = Duration::from_secs(1);
                    self.healthy_since = Some(Instant::now());
                    if self.registered_since.is_some() {
                        self.reconnects += 1;
                    }
                    self.registered_since = Some(std::time::SystemTime::now());
                    match self.run_connected(connected).await {
                        Exit::Shutdown => break,
                        Exit::Kicked => {
                            self.set_connection(ConnectionState::Kicked, "session taken over");
                            self.publish(true);
                            let delay =
                                Duration::from_millis(self.config.registration.kicked_retry_ms);
                            if self.sleep_or_shutdown(delay).await {
                                break;
                            }
                        }
                        Exit::Disconnected(reason) => {
                            tracing::warn!(event = "socket-disconnected", reason = %reason);
                            self.set_connection(ConnectionState::Disconnected, &reason);
                            self.publish(true);
                            let healthy = self
                                .healthy_since
                                .map(|t| t.elapsed() > Duration::from_secs(60))
                                .unwrap_or(false);
                            if healthy {
                                self.backoff = Duration::from_secs(1);
                            }
                            let delay = self.next_backoff();
                            if self.sleep_or_shutdown(delay).await {
                                break;
                            }
                        }
                    }
                }
                Err(error) => {
                    tracing::warn!(event = "connect-failed", error = %format!("{error:#}"));
                    self.set_connection(ConnectionState::Disconnected, &format!("{error:#}"));
                    self.publish(true);
                    let delay = self.next_backoff();
                    if self.sleep_or_shutdown(delay).await {
                        break;
                    }
                }
            }
        }
        tracing::info!(event = "client-stop");
        self.set_connection(ConnectionState::Disconnected, "shutting down");
        self.publish(true);
        let _ = self.audio.save();
        Ok(())
    }

    fn next_backoff(&mut self) -> Duration {
        let jitter = rand::rng().random_range(0..500);
        let delay = self.backoff + Duration::from_millis(jitter);
        self.backoff = (self.backoff * 2).min(MAX_BACKOFF);
        delay
    }

    /// Sleeps while draining commands; returns true when shutdown was requested.
    async fn sleep_or_shutdown(&mut self, delay: Duration) -> bool {
        let deadline = tokio::time::Instant::now() + delay;
        loop {
            let mut shutdown = self.io.shutdown.clone();
            tokio::select! {
                _ = tokio::time::sleep_until(deadline) => return false,
                _ = wait_true(&mut shutdown) => return true,
                Some(command) = self.io.commands.recv() => {
                    if matches!(command, Command::Shutdown) { return true; }
                    self.handle_offline_command(command);
                }
                Some(frame) = self.io.frames.recv() => {
                    self.input_level_db = peak_db(&frame);
                }
                _ = self.io.audio_status.changed() => { self.snapshot_dirty = true; }
                _ = tokio::time::sleep(SNAPSHOT_DEBOUNCE) => { self.publish(false); }
            }
        }
    }

    fn handle_offline_command(&mut self, command: Command) {
        match command {
            Command::MuteToggle(key) => {
                let level = self.audio.toggle_mute(key);
                self.apply_level(key, level);
            }
            Command::VolumeStep { target, delta } => {
                let level = self.audio.step_volume(target, delta);
                self.apply_level(target, level);
            }
            Command::VolumeSet { target, volume } => {
                let level = self.audio.set_volume(target, volume);
                self.apply_level(target, level);
            }
            Command::Refresh => self.snapshot_dirty = true,
            _ => {}
        }
    }

    // ------------------------------------------------------------------
    // Connecting
    // ------------------------------------------------------------------

    async fn ensure_token(&mut self) -> Result<String> {
        if let Some((token, expires)) = &self.token {
            if Instant::now() + Duration::from_secs(60) < *expires {
                return Ok(token.clone());
            }
        }
        self.set_connection(ConnectionState::LoggingIn, "");
        self.publish(true);
        let login = self
            .api
            .login(&self.config.user.name, &self.config.user.password)
            .await
            .map_err(|e| {
                tracing::warn!(event = "login-failed", error = %e);
                e
            })?;
        tracing::info!(event = "login", user = %login.user.name, id = login.user.id);
        let ttl = login
            .expires_in_ms
            .map(Duration::from_millis)
            .unwrap_or(Duration::from_secs(12 * 3600));
        self.token = Some((login.token.clone(), Instant::now() + ttl));
        let token = login.token.clone();
        self.login = Some(login);
        Ok(token)
    }

    fn resolve_production(&self) -> Option<Value> {
        let wanted = self.config.user.production.as_deref()?.trim();
        if wanted.is_empty() {
            return None;
        }
        let productions = self
            .login
            .as_ref()
            .map(|l| l.productions.as_slice())
            .unwrap_or(&[]);
        for production in productions {
            let id_text = match &production.id {
                Value::Number(n) => n.to_string(),
                Value::String(s) => s.clone(),
                _ => continue,
            };
            if id_text == wanted || production.name.eq_ignore_ascii_case(wanted) {
                return Some(production.id.clone());
            }
        }
        tracing::warn!(event = "production-not-found", production = wanted);
        wanted.parse::<i64>().ok().map(Value::from)
    }

    async fn connect(&mut self) -> Result<Connected> {
        let token = self.ensure_token().await?;
        let login = self
            .login
            .clone()
            .ok_or_else(|| anyhow!("missing login state"))?;
        self.set_connection(ConnectionState::Connecting, "");
        self.publish(true);

        let tls = crate::tls::build_client_config(&self.config.tls)?;
        let (socket, mut events) = SocketClient::connect(
            &self.config.server_url(),
            ConnectOptions {
                tls,
                auth: json!({ "token": token }),
                connect_timeout: Duration::from_secs(10),
            },
        )
        .await?;

        match tokio::time::timeout(Duration::from_secs(10), events.recv()).await {
            Ok(Some(SocketEvent::Connected { sid })) => {
                tracing::info!(event = "socket-connected", sid = %sid);
            }
            Ok(Some(SocketEvent::ConnectError(error))) => {
                self.token = None;
                bail!("socket connect rejected: {error}");
            }
            Ok(Some(SocketEvent::Disconnected(reason))) => {
                bail!("socket closed during connect: {reason}")
            }
            Ok(other) => bail!("unexpected event during connect: {other:?}"),
            Err(_) => bail!("timed out waiting for socket connect"),
        }

        let production_id = self.resolve_production();
        let mut connected = Connected {
            socket,
            events,
            user_id: login.user.id,
            user_name: login.user.name.clone(),
            production_id,
            media: None,
        };

        self.register(&mut connected).await?;
        Ok(connected)
    }

    async fn register(&mut self, connected: &mut Connected) -> Result<()> {
        self.set_connection(ConnectionState::Registering, "");
        self.publish(true);
        let mut force = false;
        loop {
            let ack = connected
                .socket
                .request(
                    "register-user",
                    json!({
                        "id": connected.user_id,
                        "name": connected.user_name,
                        "kind": "user",
                        "force": force,
                        "productionId": connected.production_id,
                    }),
                    SIGNAL_TIMEOUT,
                )
                .await
                .inspect_err(|error| {
                    let text = error.to_string();
                    if text.contains("identity") || text.contains("Authenticated") {
                        self.token = None;
                    }
                    tracing::warn!(event = "registration-error", error = %text);
                })?;
            if ack.get("conflict").and_then(Value::as_bool) == Some(true) {
                let existing = ack
                    .get("existing")
                    .and_then(|e| e.get("name"))
                    .and_then(Value::as_str)
                    .unwrap_or("another session");
                tracing::warn!(event = "registration-conflict", existing, policy = ?self.config.registration.conflict);
                match self.config.registration.conflict {
                    ConflictPolicy::Takeover => {
                        if force {
                            bail!("registration conflict persists even with force");
                        }
                        self.set_connection(
                            ConnectionState::Conflict,
                            &format!("taking over from {existing}"),
                        );
                        self.publish(true);
                        tokio::time::sleep(Duration::from_millis(
                            self.config.registration.takeover_delay_ms,
                        ))
                        .await;
                        force = true;
                        continue;
                    }
                    ConflictPolicy::Wait => {
                        self.set_connection(
                            ConnectionState::Conflict,
                            &format!("account in use by {existing}"),
                        );
                        self.publish(true);
                        let retry = Duration::from_millis(self.config.registration.retry_ms);
                        // Keep the socket alive while waiting; a disconnect ends the wait.
                        tokio::select! {
                            _ = tokio::time::sleep(retry) => {}
                            event = connected.events.recv() => {
                                if let Some(SocketEvent::Disconnected(reason)) = event {
                                    bail!("socket disconnected while waiting for the account: {reason}");
                                }
                            }
                        }
                        continue;
                    }
                }
            }
            tracing::info!(event = "registered", user = %connected.user_name, id = connected.user_id);
            self.set_connection(ConnectionState::Registered, "");
            self.publish(true);
            return Ok(());
        }
    }

    // ------------------------------------------------------------------
    // Media
    // ------------------------------------------------------------------

    fn rtc_settings(&self) -> RtcSettings {
        let grace = Duration::from_millis(self.config.network.ice_disconnect_grace_ms.max(1000));
        RtcSettings {
            ice_override: self.config.ice.clone(),
            disconnected_timeout: grace,
            failed_timeout: grace * 3,
            keepalive_interval: Duration::from_secs(2),
        }
    }

    async fn setup_media(&mut self, connected: &mut Connected) -> Result<()> {
        if let Some(media) = connected.media.take() {
            media.send.close().await;
            media.recv.close().await;
        }
        if let Ok(mut mixer) = self.io.mixer.lock() {
            mixer.clear_sources();
        }
        let router: RtpCapabilities = serde_json::from_value(
            connected
                .socket
                .request_no_payload("get-router-rtp-capabilities", SIGNAL_TIMEOUT)
                .await?,
        )
        .context("parsing router capabilities")?;
        let factory = MediaFactory::new(router, self.rtc_settings())?;
        let (rtc_tx, rtc_rx) = mpsc::channel(128);
        let send = SendTransport::create(
            &factory,
            &connected.socket,
            rtc_tx.clone(),
            &format!("talktome-{}", self.config.instance),
        )
        .await?;
        let recv =
            RecvTransport::create(&factory, &connected.socket, rtc_tx, self.rx_tx.clone()).await?;
        tracing::info!(event = "transports-created", send = %send.transport_id, recv = %recv.transport_id);
        self.media_info = Some(crate::state::MediaInfo {
            send_state: "new".into(),
            recv_state: "new".into(),
            consumers: 0,
            producer_id: Some(send.producer_id.clone()),
            ice_servers: send.ice_servers.clone(),
            ice_transport_policy: send.ice_transport_policy.clone(),
        });
        connected.media = Some(Media {
            factory,
            send,
            recv,
            send_state: RTCPeerConnectionState::New,
            recv_state: RTCPeerConnectionState::New,
            consumers: HashMap::new(),
            producers: HashMap::new(),
            rtc_rx,
        });
        self.sync_active_producers(connected).await;
        // Restore talk state on the new producer (locks/held keys survive recovery).
        let change = self.talk_change_now();
        if change.talking {
            self.send_talk_change(connected, &change, "media-recovered")
                .await;
        }
        Ok(())
    }

    fn talk_change_now(&self) -> TalkChange {
        let targets = self.talk.active_targets();
        TalkChange {
            talking: !targets.is_empty(),
            targets,
            lock_active: !self.talk.locked().is_empty(),
            lock_toggled: None,
        }
    }

    async fn sync_active_producers(&mut self, connected: &mut Connected) {
        let active = match connected
            .socket
            .request_no_payload("request-active-producers", SIGNAL_TIMEOUT)
            .await
        {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!(event = "active-producers-failed", error = %error);
                return;
            }
        };
        let announcements: Vec<ProducerAnnouncement> =
            serde_json::from_value(active).unwrap_or_default();
        for announcement in announcements {
            self.consume_announcement(connected, &announcement).await;
        }
    }

    fn target_for_announcement(announcement: &ProducerAnnouncement) -> Option<TargetKey> {
        let kind = announcement.app_type()?;
        let id = announcement.app_data.get("id")?;
        match kind {
            "user" | "guest" => {
                // Direct talk: key by the speaking user (falls back to appData id).
                if let Some(speaker) = announcement
                    .speaker_user_id
                    .as_ref()
                    .and_then(Value::as_i64)
                {
                    Some(TargetKey::User(speaker))
                } else {
                    TargetKey::from_type_and_id("user", id)
                }
            }
            other => TargetKey::from_type_and_id(other, id),
        }
    }

    async fn consume_announcement(
        &mut self,
        connected: &mut Connected,
        announcement: &ProducerAnnouncement,
    ) {
        let Some(producer_id) = announcement.producer_id().map(str::to_string) else {
            return;
        };
        let Some(media) = connected.media.as_mut() else {
            return;
        };
        if media.producers.contains_key(&producer_id) {
            return;
        }
        let key = Self::target_for_announcement(announcement).unwrap_or(TargetKey::User(0));
        match media
            .recv
            .consume(&connected.socket, &media.factory, &producer_id)
            .await
        {
            Ok(consumer_id) => {
                media.consumers.insert(consumer_id.clone(), key);
                media
                    .producers
                    .insert(producer_id.clone(), consumer_id.clone());
                if let Ok(mut mixer) = self.io.mixer.lock() {
                    if let Err(error) = mixer.add_source(&consumer_id, key) {
                        tracing::warn!(event = "mixer-source-failed", error = %error);
                    }
                    mixer.set_level(key, self.audio.level(key));
                }
                tracing::info!(event = "incoming-stream", target = %key, producer = %producer_id);
                if let Some(info) = self.media_info.as_mut() {
                    info.consumers = media.consumers.len();
                }
                self.snapshot_dirty = true;
            }
            Err(error) => {
                tracing::warn!(event = "consume-failed", producer = %producer_id, error = %format!("{error:#}"));
            }
        }
    }

    async fn drop_consumer(
        &mut self,
        connected: &mut Connected,
        consumer_id: &str,
        notify_server: bool,
    ) {
        let Some(media) = connected.media.as_mut() else {
            return;
        };
        if media.consumers.remove(consumer_id).is_some() {
            media.producers.retain(|_, c| c != consumer_id);
            if let Ok(mut mixer) = self.io.mixer.lock() {
                mixer.remove_source(consumer_id);
            }
            if let Err(error) = media
                .recv
                .close_consumer(&connected.socket, consumer_id, notify_server)
                .await
            {
                tracing::debug!(event = "close-consumer-failed", consumer = %consumer_id, error = %error);
            }
            self.snapshot_dirty = true;
        }
    }

    /// Closed consumers leave inactive media sections on the receive peer
    /// connection; once many have accumulated and nothing is being received,
    /// rebuild the transports to start from a clean SDP.
    async fn compact_recv_transport(&mut self, connected: &mut Connected) {
        let rebuild = match connected.media.as_ref() {
            Some(media) => {
                media.consumers.is_empty()
                    && media.recv.section_count().await >= MAX_IDLE_RECV_SECTIONS
            }
            None => false,
        };
        if rebuild {
            self.recover_media(connected, "recv transport compaction")
                .await;
        }
    }

    async fn recover_media(&mut self, connected: &mut Connected, reason: &str) {
        tracing::warn!(event = "media-recovery", reason);
        self.set_connection(ConnectionState::Registered, "recovering media");
        self.publish(true);
        if let Err(error) = self.setup_media(connected).await {
            tracing::error!(event = "media-recovery-failed", error = %format!("{error:#}"));
            self.detail = format!("media: {error:#}");
            self.snapshot_dirty = true;
        }
    }

    // ------------------------------------------------------------------
    // Connected loop
    // ------------------------------------------------------------------

    async fn run_connected(&mut self, mut connected: Connected) -> Exit {
        if let Err(error) = self.setup_media(&mut connected).await {
            tracing::error!(event = "media-setup-failed", error = %format!("{error:#}"));
            connected.socket.close().await;
            return Exit::Disconnected(format!("media setup failed: {error:#}"));
        }
        if let Err(error) = self.reload_targets(&connected).await {
            tracing::warn!(event = "targets-failed", error = %format!("{error:#}"));
        }
        self.send_audio_snapshot(&connected, "registered").await;
        if let Some(change) = self.pending_talk_change.take() {
            self.send_talk_change(&mut connected, &change, "reconnected")
                .await;
        }
        self.snapshot_dirty = true;

        let mut tick = tokio::time::interval(Duration::from_millis(500));
        let mut last_sync = Instant::now();
        let mut targets_reload_due: Option<Instant> = None;
        let mut shutdown = self.io.shutdown.clone();

        loop {
            let event = tokio::select! {
                Some(event) = connected.events.recv() => Event::Socket(event),
                event = recv_media_event(&mut connected.media) => Event::Rtc(event),
                Some(packet) = self.rx_rx.recv() => Event::Rx(packet),
                Some(command) = self.io.commands.recv() => Event::Command(command),
                Some(frame) = self.io.frames.recv() => Event::Frame(frame),
                _ = self.io.audio_status.changed() => Event::AudioStatus,
                _ = wait_true(&mut shutdown) => Event::Shutdown,
                _ = tick.tick() => Event::Tick,
            };

            match event {
                Event::Shutdown => {
                    self.shutdown_connected(&mut connected).await;
                    return Exit::Shutdown;
                }
                Event::Socket(SocketEvent::Disconnected(reason)) => {
                    self.teardown_media(&mut connected).await;
                    return Exit::Disconnected(reason);
                }
                Event::Socket(SocketEvent::ConnectError(error)) => {
                    self.teardown_media(&mut connected).await;
                    return Exit::Disconnected(format!("connect error: {error}"));
                }
                Event::Socket(SocketEvent::Connected { .. }) => {}
                Event::Socket(SocketEvent::Event { name, args, ack }) => {
                    if let Some(ack) = ack {
                        ack.respond(vec![]).await;
                    }
                    let payload = args.into_iter().next().unwrap_or(Value::Null);
                    match name.as_str() {
                        "session-kicked" => {
                            tracing::warn!(event = "session-kicked", detail = %payload);
                            self.teardown_media(&mut connected).await;
                            connected.socket.close().await;
                            return Exit::Kicked;
                        }
                        "user-targets-updated"
                        | "conference-list"
                        | "conference-members-updated"
                        | "available-productions-updated" => {
                            targets_reload_due = Some(Instant::now() + Duration::from_millis(300));
                        }
                        "active-production-reset" => {
                            connected.production_id = payload
                                .get("productionId")
                                .cloned()
                                .filter(|v| !v.is_null());
                            let change = self.talk.reset();
                            self.send_talk_change(&mut connected, &change, "production-reset")
                                .await;
                            targets_reload_due = Some(Instant::now());
                        }
                        _ => {
                            self.handle_socket_event(&mut connected, &name, payload)
                                .await
                        }
                    }
                }
                Event::Rtc(event) => self.handle_rtc_event(&mut connected, event).await,
                Event::Rx(packet) => {
                    if let Ok(mut mixer) = self.io.mixer.lock() {
                        if let Err(error) =
                            mixer.push_packet(&packet.consumer_id, packet.sequence, &packet.payload)
                        {
                            tracing::debug!(event = "rx-decode-failed", error = %error);
                        }
                    }
                }
                Event::Command(command) => {
                    if matches!(command, Command::Shutdown) {
                        self.shutdown_connected(&mut connected).await;
                        return Exit::Shutdown;
                    }
                    self.handle_command(&mut connected, command).await;
                }
                Event::Frame(frame) => self.handle_frame(&mut connected, frame).await,
                Event::AudioStatus => self.snapshot_dirty = true,
                Event::Tick => {
                    if let Some(due) = targets_reload_due {
                        if Instant::now() >= due {
                            targets_reload_due = None;
                            if let Err(error) = self.reload_targets(&connected).await {
                                tracing::warn!(event = "targets-failed", error = %format!("{error:#}"));
                            }
                            self.sync_active_producers(&mut connected).await;
                        }
                    }
                    if last_sync.elapsed() >= ACTIVE_PRODUCER_SYNC {
                        last_sync = Instant::now();
                        self.sync_active_producers(&mut connected).await;
                        self.compact_recv_transport(&mut connected).await;
                    }
                    if self.audio_state_dirty
                        && self.last_audio_snapshot.elapsed() >= SNAPSHOT_DEBOUNCE
                    {
                        self.send_audio_snapshot(&connected, "target-audio-state")
                            .await;
                    }
                    // Receiving indicators change without any event; refresh them.
                    self.snapshot_dirty = true;
                }
            }
            self.publish(false);
        }
    }

    async fn shutdown_connected(&mut self, connected: &mut Connected) {
        let change = self.talk.reset();
        if change != self.talk_change_now() || !change.targets.is_empty() {
            self.send_talk_change(connected, &change, "shutdown").await;
        }
        self.teardown_media(connected).await;
        let _ = connected.socket.emit("user-logout", vec![]).await;
        connected.socket.close().await;
    }

    async fn teardown_media(&mut self, connected: &mut Connected) {
        if let Some(media) = connected.media.take() {
            media.send.close().await;
            media.recv.close().await;
        }
        self.media_info = None;
        if let Ok(mut mixer) = self.io.mixer.lock() {
            mixer.clear_sources();
        }
        // Remember what to re-send once we are back.
        let change = self.talk_change_now();
        if change.talking {
            self.pending_talk_change = Some(change);
        }
        self.snapshot_dirty = true;
    }

    async fn handle_socket_event(&mut self, connected: &mut Connected, name: &str, payload: Value) {
        match name {
            "new-producer" => {
                if let Ok(announcement) = serde_json::from_value::<ProducerAnnouncement>(payload) {
                    self.consume_announcement(connected, &announcement).await;
                }
            }
            "producer-closed" => {
                if let Ok(announcement) = serde_json::from_value::<ProducerAnnouncement>(payload) {
                    if let Some(producer_id) = announcement.producer_id() {
                        let consumer = connected
                            .media
                            .as_ref()
                            .and_then(|m| m.producers.get(producer_id).cloned());
                        if let Some(consumer_id) = consumer {
                            self.drop_consumer(connected, &consumer_id, false).await;
                        }
                    }
                }
            }
            "consumer-closed" => {
                if let Some(consumer_id) = payload
                    .get("consumerId")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                {
                    self.drop_consumer(connected, &consumer_id, false).await;
                }
            }
            "incoming-talk-state" => {
                let state = payload.get("state").cloned().unwrap_or(Value::Null);
                self.apply_incoming_state(&state);
                if !self.incoming.is_empty() {
                    self.sync_active_producers(connected).await;
                }
            }
            "user-list" => {
                self.online_users = payload
                    .as_array()
                    .map(|peers| {
                        peers
                            .iter()
                            .filter(|p| p.get("kind").and_then(Value::as_str) == Some("user"))
                            .filter_map(|p| p.get("userId").and_then(Value::as_i64))
                            .collect()
                    })
                    .unwrap_or_default();
                self.snapshot_dirty = true;
            }
            "cut-camera" => {
                let on_air = payload.as_bool().unwrap_or(false);
                if on_air != self.on_air {
                    tracing::info!(event = "tally", on_air);
                    self.on_air = on_air;
                    self.snapshot_dirty = true;
                }
            }
            "api-talk-command" => self.handle_api_talk_command(connected, payload).await,
            "api-target-audio-command" => self.handle_api_audio_command(connected, payload).await,
            _ => {
                tracing::trace!(event = "socket-event-ignored", name);
            }
        }
    }

    fn apply_incoming_state(&mut self, state: &Value) {
        let addressed = state
            .get("addressedNow")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        self.incoming.clear();
        self.incoming_keys.clear();
        for entry in &addressed {
            let from_name = entry
                .get("fromName")
                .and_then(Value::as_str)
                .unwrap_or("?")
                .to_string();
            let target = entry
                .get("targetType")
                .and_then(Value::as_str)
                .zip(entry.get("targetId"))
                .and_then(|(kind, id)| TargetKey::from_type_and_id(kind, id));
            if let Some(key) = target {
                self.incoming_keys.insert(key);
            }
            if let Some(from) = entry.get("fromUserId").and_then(Value::as_i64) {
                self.incoming_keys.insert(TargetKey::User(from));
            }
            self.incoming.push(IncomingInfo { from_name, target });
        }
        let reply = state.get("replyTarget").and_then(|reply| {
            let kind = reply
                .get("replyTargetType")
                .or_else(|| reply.get("targetType"))
                .and_then(Value::as_str)?;
            let id = reply
                .get("replyTargetId")
                .or_else(|| reply.get("targetId"))?;
            TargetKey::from_type_and_id(kind, id)
        });
        self.talk.set_reply_target(reply);
        if let Ok(mut mixer) = self.io.mixer.lock() {
            mixer.set_dim_state(self.talk.is_talking(), !self.incoming.is_empty());
        }
        if !self.incoming.is_empty() {
            tracing::debug!(event = "incoming", from = ?self.incoming.iter().map(|i| &i.from_name).collect::<Vec<_>>());
        }
        self.snapshot_dirty = true;
    }

    async fn handle_rtc_event(&mut self, connected: &mut Connected, event: RtcEvent) {
        match event {
            RtcEvent::PeerState { direction, state } => {
                tracing::info!(event = "transport-state", direction = ?direction, state = %state);
                if let Some(media) = connected.media.as_mut() {
                    match direction {
                        Direction::Send => media.send_state = state,
                        Direction::Recv => media.recv_state = state,
                    }
                    if let Some(info) = self.media_info.as_mut() {
                        info.send_state = media.send_state.to_string();
                        info.recv_state = media.recv_state.to_string();
                        info.consumers = media.consumers.len();
                    }
                    self.snapshot_dirty = true;
                }
                if matches!(state, RTCPeerConnectionState::Failed) {
                    self.recover_media(connected, &format!("{direction:?} transport {state}"))
                        .await;
                }
                self.update_ready_state(connected);
            }
            RtcEvent::IceState { direction, state } => {
                tracing::debug!(event = "ice-state", direction = ?direction, state = %state);
                if matches!(state, RTCIceConnectionState::Failed) {
                    self.recover_media(connected, &format!("{direction:?} ICE failed"))
                        .await;
                }
            }
            RtcEvent::ConsumerTrack { consumer_id, .. } => {
                tracing::debug!(event = "consumer-track", consumer = %consumer_id);
            }
        }
    }

    fn update_ready_state(&mut self, connected: &Connected) {
        let Some(media) = connected.media.as_ref() else {
            return;
        };
        let send_ok = matches!(media.send_state, RTCPeerConnectionState::Connected);
        let recv_ok = media.consumers.is_empty()
            || matches!(
                media.recv_state,
                RTCPeerConnectionState::Connected
                    | RTCPeerConnectionState::New
                    | RTCPeerConnectionState::Connecting
            );
        let next = if send_ok && recv_ok {
            ConnectionState::Ready
        } else {
            ConnectionState::Registered
        };
        if next != self.connection {
            let detail = if next == ConnectionState::Ready {
                String::new()
            } else {
                format!("send {} / recv {}", media.send_state, media.recv_state)
            };
            self.set_connection(next, &detail);
        }
    }

    // ------------------------------------------------------------------
    // Talk / commands
    // ------------------------------------------------------------------

    async fn handle_command(&mut self, connected: &mut Connected, command: Command) {
        let now = Instant::now();
        match command {
            Command::TalkPress { source, target } => match self.talk.press(source, target, now) {
                Some(change) => self.send_talk_change(connected, &change, "press").await,
                None => {
                    self.detail = "no target".into();
                    self.snapshot_dirty = true;
                }
            },
            Command::TalkRelease { source, target } => {
                if let Some(change) = self.talk.release(source, target, now) {
                    self.send_talk_change(connected, &change, "release").await;
                }
            }
            Command::LockToggle { target } => {
                if let Some(change) = self.talk.toggle_lock(target) {
                    self.send_talk_change(connected, &change, "lock-toggle")
                        .await;
                }
            }
            Command::ClearLocks => {
                let change = self.talk.clear_locks();
                self.send_talk_change(connected, &change, "clear-locks")
                    .await;
            }
            Command::MuteToggle(key) => {
                let level = self.audio.toggle_mute(key);
                self.apply_level(key, level);
            }
            Command::VolumeStep { target, delta } => {
                let level = self.audio.step_volume(target, delta);
                self.apply_level(target, level);
            }
            Command::VolumeSet { target, volume } => {
                let level = self.audio.set_volume(target, volume);
                self.apply_level(target, level);
            }
            Command::Refresh => self.snapshot_dirty = true,
            Command::Shutdown => {}
        }
    }

    fn apply_level(&mut self, key: TargetKey, level: crate::talk::AudioLevel) {
        if let Ok(mut mixer) = self.io.mixer.lock() {
            mixer.set_level(key, level);
        }
        if let Err(error) = self.audio.save() {
            tracing::warn!(event = "audio-state-save-failed", error = %error);
        }
        self.audio_state_dirty = true;
        self.snapshot_dirty = true;
    }

    async fn send_talk_change(
        &mut self,
        connected: &mut Connected,
        change: &TalkChange,
        reason: &str,
    ) {
        let targets: Vec<Value> = change.targets.iter().map(|t| t.to_talk_target()).collect();
        if let Some((key, locked)) = change.lock_toggled {
            tracing::info!(event = if locked { "lock-on" } else { "lock-off" }, target = %key);
        }
        let was_talking = connected
            .media
            .as_ref()
            .map(|m| m.send.is_talking())
            .unwrap_or(false);
        if change.talking {
            if !was_talking {
                tracing::info!(event = "talk-start", targets = ?change.targets.iter().map(|t| t.to_string()).collect::<Vec<_>>());
            }
            let _ = connected
                .socket
                .emit(
                    "talk-targets-updated",
                    vec![json!({ "reason": reason, "targets": targets })],
                )
                .await;
            if let Some(media) = connected.media.as_ref() {
                if let Err(error) = media.send.set_talking(&connected.socket, true).await {
                    tracing::warn!(event = "resume-producer-failed", error = %error);
                }
            }
        } else {
            if let Some(media) = connected.media.as_ref() {
                if let Err(error) = media.send.set_talking(&connected.socket, false).await {
                    tracing::warn!(event = "pause-producer-failed", error = %error);
                }
            }
            if was_talking {
                tracing::info!(event = "talk-stop");
            }
            let _ = connected
                .socket
                .emit(
                    "talk-targets-updated",
                    vec![json!({ "reason": reason, "targets": [] })],
                )
                .await;
        }
        let first = change.targets.first().map(|t| t.to_talk_target());
        let _ = connected
            .socket
            .emit(
                "ptt-state",
                vec![json!({
                    "talking": change.talking,
                    "lockActive": change.lock_active,
                    "target": first,
                    "targets": targets,
                    "reason": reason,
                })],
            )
            .await;
        if let Ok(mut mixer) = self.io.mixer.lock() {
            mixer.set_dim_state(change.talking, !self.incoming.is_empty());
        }
        self.pending_talk_change = None;
        self.snapshot_dirty = true;
    }

    async fn handle_frame(&mut self, connected: &mut Connected, frame: Vec<f32>) {
        let level = peak_db(&frame);
        self.input_level_db = level;
        if let Some(trigger) = self.vox.as_mut() {
            if let Some(active) = trigger.update(level, Instant::now()) {
                if let Some(change) = self.talk.set_vox_active(active) {
                    tracing::info!(event = if active { "vox-active" } else { "vox-inactive" });
                    self.send_talk_change(connected, &change, "vox").await;
                }
            }
        }
        let talking = connected
            .media
            .as_ref()
            .map(|m| m.send.is_talking())
            .unwrap_or(false);
        if !talking {
            return;
        }
        if frame.len() != self.encoder.frame_samples() {
            return;
        }
        match self.encoder.encode(&frame) {
            Ok(packet) => {
                if let Some(media) = connected.media.as_ref() {
                    if let Err(error) = media.send.write_frame(packet, self.frame_duration).await {
                        tracing::debug!(event = "write-frame-failed", error = %error);
                    }
                }
            }
            Err(error) => tracing::warn!(event = "encode-failed", error = %error),
        }
    }

    fn companion_target(target_type: &str, target_id: &Value) -> Option<TargetRef> {
        if target_type.eq_ignore_ascii_case("reply") {
            return Some(TargetRef::Reply);
        }
        TargetKey::from_type_and_id(target_type, target_id).map(TargetRef::Key)
    }

    fn known_target(&self, target: TargetRef) -> bool {
        match target {
            TargetRef::Reply => self.talk.reply_target().is_some(),
            TargetRef::Key(key) => self.targets.iter().any(|t| t.key == key),
        }
    }

    async fn handle_api_talk_command(&mut self, connected: &mut Connected, payload: Value) {
        let command_id = payload.get("commandId").cloned().unwrap_or(Value::Null);
        let action = payload
            .get("action")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let target_type = payload
            .get("targetType")
            .and_then(Value::as_str)
            .unwrap_or("conference")
            .to_string();
        let target_id = payload.get("targetId").cloned().unwrap_or(Value::Null);
        let input_key = payload
            .get("inputKey")
            .and_then(Value::as_str)
            .filter(|k| !k.trim().is_empty())
            .map(|k| k.trim().to_string())
            .unwrap_or_else(|| format!("companion:{target_type}:{target_id}"));
        tracing::info!(event = "companion-command", action = %action, target_type = %target_type, target_id = %target_id);

        let target = Self::companion_target(&target_type, &target_id);
        let source = InputSource::Companion(input_key);
        let now = Instant::now();
        let (ok, reason, change) = match (action.as_str(), target) {
            ("press", Some(target)) if self.known_target(target) => {
                match self.talk.press(source, target, now) {
                    Some(change) => (true, None, Some(change)),
                    None => (false, Some("press-failed"), None),
                }
            }
            ("release", Some(target)) => {
                let change = self.talk.release(source, target, now);
                (true, None, change)
            }
            ("release", None) => (true, None, None),
            ("lock-toggle", Some(target)) if self.known_target(target) => {
                match self.talk.toggle_lock(target) {
                    Some(change) => (true, None, Some(change)),
                    None => (false, Some("target-not-available"), None),
                }
            }
            ("press" | "lock-toggle", _) => (false, Some("target-not-available"), None),
            _ => (false, Some("unsupported-action"), None),
        };
        if let Some(change) = change.as_ref() {
            self.send_talk_change(connected, change, "companion").await;
        }
        let state = self.talk_change_now();
        let result = json!({
            "commandId": command_id,
            "ok": ok,
            "reason": reason,
            "action": action,
            "targetType": target_type,
            "targetId": target_id,
            "talking": state.talking,
            "lockActive": state.lock_active,
            "target": state.targets.first().map(|t| t.to_talk_target()),
            "targets": state.targets.iter().map(|t| t.to_talk_target()).collect::<Vec<_>>(),
        });
        let _ = connected
            .socket
            .emit("api-talk-command-result", vec![result])
            .await;
    }

    async fn handle_api_audio_command(&mut self, connected: &mut Connected, payload: Value) {
        let command_id = payload.get("commandId").cloned().unwrap_or(Value::Null);
        let action = payload
            .get("action")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let target_type = payload
            .get("targetType")
            .and_then(Value::as_str)
            .unwrap_or("conference")
            .to_string();
        let target_id = payload.get("targetId").cloned().unwrap_or(Value::Null);
        let step = payload
            .get("step")
            .and_then(Value::as_f64)
            .map(|s| s.clamp(0.01, 1.0) as f32)
            .unwrap_or(0.1);
        tracing::info!(event = "companion-command", action = %action, target_type = %target_type, target_id = %target_id);
        let key = TargetKey::from_type_and_id(&target_type, &target_id)
            .filter(|k| self.targets.iter().any(|t| t.key == *k));
        let (ok, reason) = match (action.as_str(), key) {
            ("volume-up", Some(key)) => {
                let level = self.audio.step_volume(key, step);
                self.apply_level(key, level);
                (true, None)
            }
            ("volume-down", Some(key)) => {
                let level = self.audio.step_volume(key, -step);
                self.apply_level(key, level);
                (true, None)
            }
            ("mute-toggle", Some(key)) => {
                let level = self.audio.toggle_mute(key);
                self.apply_level(key, level);
                (true, None)
            }
            ("volume-up" | "volume-down" | "mute-toggle", None) => {
                (false, Some("target-not-available"))
            }
            _ => (false, Some("unsupported-action")),
        };
        let result = json!({
            "commandId": command_id,
            "ok": ok,
            "reason": reason,
            "action": action,
            "targetType": target_type,
            "targetId": target_id,
        });
        let _ = connected
            .socket
            .emit("api-target-audio-command-result", vec![result])
            .await;
        self.send_audio_snapshot(connected, "companion").await;
    }

    async fn send_audio_snapshot(&mut self, connected: &Connected, reason: &str) {
        let keys: Vec<TargetKey> = self.targets.iter().map(|t| t.key).collect();
        let states = self.audio.snapshot_entries(keys.iter());
        let _ = connected
            .socket
            .emit(
                "target-audio-state-snapshot",
                vec![json!({ "reason": reason, "states": states })],
            )
            .await;
        self.audio_state_dirty = false;
        self.last_audio_snapshot = Instant::now();
    }

    // ------------------------------------------------------------------
    // Targets and snapshots
    // ------------------------------------------------------------------

    async fn reload_targets(&mut self, connected: &Connected) -> Result<()> {
        let token = self
            .token
            .as_ref()
            .map(|(t, _)| t.clone())
            .unwrap_or_default();
        let production = connected.production_id.as_ref().map(|p| match p {
            Value::Number(n) => n.to_string(),
            Value::String(s) => s.clone(),
            other => other.to_string(),
        });
        let entries = self
            .api
            .targets(&token, connected.user_id, production.as_deref())
            .await?;
        let mut targets = Vec::new();
        for entry in entries {
            let Some(key) = TargetKey::from_type_and_id(&entry.target_type, &entry.target_id)
            else {
                continue;
            };
            let members = entry
                .members
                .iter()
                .filter_map(|m| m.get("userId").and_then(Value::as_i64))
                .collect();
            targets.push(Target {
                key,
                name: entry.name.clone().unwrap_or_else(|| key.to_string()),
                can_talk: TargetEntry::can_talk(&entry) && key.can_talk(),
                members,
            });
        }
        tracing::info!(event = "targets-loaded", count = targets.len());
        self.targets = targets;
        if let Ok(mut mixer) = self.io.mixer.lock() {
            for target in &self.targets {
                mixer.set_level(target.key, self.audio.level(target.key));
            }
        }
        self.snapshot_dirty = true;
        Ok(())
    }

    fn set_connection(&mut self, state: ConnectionState, detail: &str) {
        if self.connection != state || self.detail != detail {
            self.connection = state;
            self.detail = detail.to_string();
            self.snapshot_dirty = true;
        }
    }

    fn build_snapshot(&self) -> Snapshot {
        let audio_status = self.io.audio_status.borrow().clone();
        let receiving: BTreeSet<TargetKey> = self
            .io
            .mixer
            .lock()
            .map(|m| m.receiving_keys().into_iter().collect())
            .unwrap_or_default();
        let targets = self
            .targets
            .iter()
            .map(|target| {
                let level = self.audio.level(target.key);
                let online = match target.key {
                    TargetKey::User(id) => self.online_users.contains(&id),
                    TargetKey::Conference(_) => {
                        target.members.iter().any(|m| self.online_users.contains(m))
                    }
                    TargetKey::Feed(_) => receiving.contains(&target.key),
                };
                TargetInfo {
                    key: target.key,
                    name: target.name.clone(),
                    can_talk: target.can_talk,
                    online,
                    held: self.talk.is_held(target.key),
                    locked: self.talk.is_locked(target.key),
                    incoming: self.incoming_keys.contains(&target.key),
                    receiving: receiving.contains(&target.key),
                    volume: level.volume,
                    muted: level.muted,
                }
            })
            .collect();
        let reply_target = self.talk.reply_target();
        let reply_name = reply_target.and_then(|key| {
            self.targets
                .iter()
                .find(|t| t.key == key)
                .map(|t| t.name.clone())
        });
        let capture_wanted = !matches!(
            self.config.audio.input_device.as_deref(),
            Some("none") | Some("off")
        );
        let playback_wanted = !matches!(
            self.config.audio.output_device.as_deref(),
            Some("none") | Some("off")
        );
        let media = self.media_info.clone();
        Snapshot {
            instance: self.config.instance.clone(),
            user_name: self
                .login
                .as_ref()
                .map(|l| l.user.name.clone())
                .unwrap_or_else(|| self.config.user.name.clone()),
            user_id: self.login.as_ref().map(|l| l.user.id),
            server_url: self.config.server.url.clone(),
            production: self.config.user.production.clone(),
            connection: self.connection,
            detail: self.detail.clone(),
            talking: self.talk.is_talking(),
            lock_active: !self.talk.locked().is_empty(),
            on_air: self.on_air,
            audio_ok: audio_status.all_ok(capture_wanted, playback_wanted),
            targets,
            reply_target,
            reply_name,
            incoming: self.incoming.clone(),
            input_level_db: self.input_level_db,
            media,
            registered_since_unix: self
                .registered_since
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .filter(|_| self.connection.is_online()),
            reconnects: self.reconnects,
        }
    }

    fn publish(&mut self, force: bool) {
        if !self.snapshot_dirty && !force {
            return;
        }
        if !force && self.last_snapshot.elapsed() < SNAPSHOT_DEBOUNCE {
            return;
        }
        let snapshot = self.build_snapshot();
        self.snapshot_dirty = false;
        self.last_snapshot = Instant::now();
        if **self.io.snapshots.borrow() != snapshot {
            let _ = self.io.snapshots.send(Arc::new(snapshot));
        }
    }
}

/// Waits for the current media generation's next transport event; pends
/// forever while there is no media so `select!` can ignore it.
async fn recv_media_event(media: &mut Option<Media>) -> RtcEvent {
    match media.as_mut() {
        Some(media) => match media.rtc_rx.recv().await {
            Some(event) => event,
            None => std::future::pending().await,
        },
        None => std::future::pending().await,
    }
}

async fn wait_true(rx: &mut watch::Receiver<bool>) {
    loop {
        if *rx.borrow() {
            return;
        }
        if rx.changed().await.is_err() {
            std::future::pending::<()>().await;
        }
    }
}
