//! Configuration schema, loading (JSON or TOML by extension) and environment
//! overrides (`TALKTOME_<SECTION>_<KEY>`).

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DEFAULT_CONFIG_DIR: &str = "/etc/talktome-headless";
pub const ENV_PREFIX: &str = "TALKTOME_";
/// Placeholder used for secrets in API output; sending it back keeps the
/// stored value.
pub const REDACTED: &str = "********";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Config {
    /// Instance name; defaults to the configuration file stem.
    pub instance: String,
    pub server: ServerConfig,
    pub tls: TlsConfig,
    pub user: UserConfig,
    pub registration: RegistrationConfig,
    pub audio: AudioConfig,
    pub vox: VoxConfig,
    pub talk: TalkConfig,
    pub ice: IceConfig,
    pub network: NetworkConfig,
    pub streamdeck: StreamDeckConfig,
    pub gpio: GpioConfig,
    pub health: HealthConfig,
    pub log: LogConfig,
    pub web: WebConfig,
    /// Directory for persisted runtime state (audio levels). Defaults to
    /// `$STATE_DIRECTORY` under systemd or `/var/lib/talktome-headless/<instance>`.
    pub state_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ServerConfig {
    /// Base URL of the Talktome server, e.g. `https://talktome.local:8443`.
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
#[derive(Default)]
pub struct TlsConfig {
    /// PEM file with one or more additional trusted CA certificates.
    pub ca_file: Option<PathBuf>,
    /// SHA-256 fingerprint of the server's leaf certificate (`AB:CD:...` or hex).
    pub fingerprint_sha256: Option<String>,
    /// Accept any certificate. Development only.
    pub insecure: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
#[derive(Default)]
pub struct UserConfig {
    pub name: String,
    pub password: String,
    /// Production id or name; `null` lets the server pick the default.
    pub production: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConflictPolicy {
    Takeover,
    Wait,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct RegistrationConfig {
    pub conflict: ConflictPolicy,
    pub takeover_delay_ms: u64,
    pub retry_ms: u64,
    pub kicked_retry_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AudioProfile {
    /// 5 ms frames, no FEC, 48 kbit/s.
    UltraLow,
    /// 10 ms frames, no FEC, 64 kbit/s.
    Low,
    /// 20 ms frames, FEC, 64 kbit/s.
    Standard,
}

impl AudioProfile {
    pub fn frame_ms(self) -> u32 {
        match self {
            AudioProfile::UltraLow => 5,
            AudioProfile::Low => 10,
            AudioProfile::Standard => 20,
        }
    }

    pub fn fec(self) -> bool {
        matches!(self, AudioProfile::Standard)
    }

    pub fn bitrate(self) -> i32 {
        match self {
            AudioProfile::UltraLow => 48_000,
            AudioProfile::Low | AudioProfile::Standard => 64_000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct AudioConfig {
    /// ALSA/cpal device name; `null` = system default. `"none"` disables capture.
    pub input_device: Option<String>,
    /// ALSA/cpal device name; `null` = system default. `"none"` disables playback.
    pub output_device: Option<String>,
    pub profile: AudioProfile,
    pub input_gain_db: f32,
    pub dim_db: f32,
    pub dim_feeds_while_speaking: bool,
    pub dim_when_addressed: bool,
    pub jitter_min_ms: u32,
    pub jitter_max_ms: u32,
    pub reopen_ms: u64,
    /// Default per-target volume for targets without persisted state.
    pub default_volume: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct VoxConfig {
    pub enabled: bool,
    /// Target key such as `conference:1` or `user:4`.
    pub target: Option<String>,
    pub threshold_db: f32,
    pub hang_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct TalkConfig {
    /// A press shorter than this toggles the talk lock instead of talking.
    pub tap_ms: u64,
    pub lock_multiple: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
#[derive(Default)]
pub struct IceServerConfig {
    pub urls: Vec<String>,
    pub username: Option<String>,
    pub credential: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
#[derive(Default)]
pub struct IceConfig {
    /// Overrides the servers announced by Talktome. Testing only.
    pub servers: Option<Vec<IceServerConfig>>,
    /// `all` or `relay`; overrides the server's policy. Testing only.
    pub transport_policy: Option<String>,
    /// Gather IPv6 host and server-reflexive candidates. Off by default:
    /// webrtc-ice cannot bind IPv6 link-local addresses (EINVAL) and IPv6
    /// STUN lookup fails when the only IPv6 addresses on the box are
    /// link-local. Remote IPv6 ICE candidates from the server are still used.
    pub ipv6: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct NetworkConfig {
    pub ice_disconnect_grace_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct StreamDeckConfig {
    pub enabled: bool,
    /// Serial number of the deck to use; `null` = first found.
    pub serial: Option<String>,
    /// Dummy deck when no hardware is attached (`mk2`, `plus`, `xl`, `neo`,
    /// `pedal`, …). Empty = discover a real Stream Deck. The environment
    /// variable `TALKTOME_MOCK_STREAMDECK` still wins when set.
    pub mock: Option<String>,
    pub brightness: u8,
    pub font_path: PathBuf,
    pub volume_step: f32,
    pub volume_layer_timeout_s: u64,
    /// Target key for the middle Stream Deck Pedal switch.
    pub pedal_target: Option<String>,
    /// Explicit key assignments: key index -> target key or action name.
    pub layout: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
#[derive(Default)]
pub struct GpioOutputConfig {
    pub line: String,
    pub active_low: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GpioInputAction {
    Talk,
    Reply,
    LockToggle,
    ClearLocks,
    MuteToggle,
    VolumeUp,
    VolumeDown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GpioInputConfig {
    pub line: String,
    pub action: GpioInputAction,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub active_low: bool,
    #[serde(default = "default_debounce_ms")]
    pub debounce_ms: u32,
}

fn default_debounce_ms() -> u32 {
    20
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct GpioConfig {
    pub enabled: bool,
    /// GPIO chip (`gpiochip0`, `/dev/gpiochip4`); `null` = search by line name.
    pub chip: Option<String>,
    /// Named outputs: `tally`, `talking`, `incoming`, `connected`, `locked`.
    pub outputs: BTreeMap<String, GpioOutputConfig>,
    pub inputs: Vec<GpioInputConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct HealthConfig {
    /// Port for the optional `GET /healthz` listener on 127.0.0.1.
    pub port: Option<u16>,
    pub bind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct LogConfig {
    pub level: String,
    /// `auto`, `json` or `text`.
    pub format: String,
}

/// Local administration web interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct WebConfig {
    pub enabled: bool,
    pub bind: String,
    pub port: u16,
    /// Password of the fixed `admin` login. The default forces a change on
    /// first login. Can also come from `TALKTOME_WEB_PASSWORD`.
    pub password: String,
}

pub const WEB_DEFAULT_PASSWORD: &str = "admin";
pub const WEB_ADMIN_USER: &str = "admin";

impl Default for Config {
    fn default() -> Self {
        Self {
            instance: "default".into(),
            server: ServerConfig::default(),
            tls: TlsConfig::default(),
            user: UserConfig::default(),
            registration: RegistrationConfig::default(),
            audio: AudioConfig::default(),
            vox: VoxConfig::default(),
            talk: TalkConfig::default(),
            ice: IceConfig::default(),
            network: NetworkConfig::default(),
            streamdeck: StreamDeckConfig::default(),
            gpio: GpioConfig::default(),
            health: HealthConfig::default(),
            log: LogConfig::default(),
            web: WebConfig::default(),
            state_dir: None,
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            url: "https://talktome.local:8443".into(),
        }
    }
}

impl Default for RegistrationConfig {
    fn default() -> Self {
        Self {
            conflict: ConflictPolicy::Takeover,
            takeover_delay_ms: 1500,
            retry_ms: 5000,
            kicked_retry_ms: 10_000,
        }
    }
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            input_device: None,
            output_device: None,
            profile: AudioProfile::Standard,
            input_gain_db: 0.0,
            dim_db: -14.0,
            dim_feeds_while_speaking: false,
            dim_when_addressed: true,
            jitter_min_ms: 20,
            jitter_max_ms: 120,
            reopen_ms: 2000,
            default_volume: 0.9,
        }
    }
}

impl Default for VoxConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            target: None,
            threshold_db: -32.0,
            hang_ms: 600,
        }
    }
}

impl Default for TalkConfig {
    fn default() -> Self {
        Self {
            tap_ms: 250,
            lock_multiple: false,
        }
    }
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            ice_disconnect_grace_ms: 4000,
        }
    }
}

impl Default for StreamDeckConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            serial: None,
            mock: None,
            brightness: 60,
            font_path: PathBuf::from("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
            volume_step: 0.05,
            volume_layer_timeout_s: 8,
            pedal_target: None,
            layout: BTreeMap::new(),
        }
    }
}

impl Default for GpioConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            chip: None,
            outputs: BTreeMap::new(),
            inputs: Vec::new(),
        }
    }
}

impl Default for HealthConfig {
    fn default() -> Self {
        Self {
            port: None,
            bind: "127.0.0.1".into(),
        }
    }
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            level: "info".into(),
            format: "auto".into(),
        }
    }
}

impl Default for WebConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            bind: "0.0.0.0".into(),
            port: 8080,
            password: WEB_DEFAULT_PASSWORD.into(),
        }
    }
}

/// Where a configuration came from, for diagnostics.
#[derive(Debug, Clone)]
pub struct LoadedConfig {
    pub config: Config,
    pub path: Option<PathBuf>,
}

/// Locates `<dir>/<instance>.json` or `<dir>/<instance>.toml`.
pub fn locate_instance_config(dir: &Path, instance: &str) -> Result<PathBuf> {
    let json = dir.join(format!("{instance}.json"));
    let toml = dir.join(format!("{instance}.toml"));
    match (json.is_file(), toml.is_file()) {
        (true, true) => bail!(
            "both {} and {} exist; keep only one configuration file per instance",
            json.display(),
            toml.display()
        ),
        (true, false) => Ok(json),
        (false, true) => Ok(toml),
        (false, false) => bail!(
            "no configuration for instance {instance:?}: expected {} or {}",
            json.display(),
            toml.display()
        ),
    }
}

/// Parses a configuration document into a generic JSON value based on the
/// file extension.
pub fn parse_document(path: &Path, text: &str) -> Result<Value> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "json" => serde_json::from_str(text)
            .with_context(|| format!("invalid JSON in {}", path.display())),
        "toml" => {
            let value: toml::Value = toml::from_str(text)
                .with_context(|| format!("invalid TOML in {}", path.display()))?;
            serde_json::to_value(value).context("failed to convert TOML to JSON value")
        }
        other => bail!(
            "unsupported configuration extension {other:?} for {} (use .json or .toml)",
            path.display()
        ),
    }
}

/// Applies `TALKTOME_<SECTION>_<KEY>` overrides onto a JSON document.
///
/// The first word after the prefix selects the section (`user`, `audio`, ...)
/// and the remainder, lower-cased, is the key. Values are parsed as JSON when
/// possible (`true`, `12`, `null`, `[...]`) and used verbatim otherwise.
pub fn apply_env_overrides<I>(doc: &mut Value, vars: I) -> Vec<String>
where
    I: IntoIterator<Item = (String, String)>,
{
    let sections = [
        "server",
        "tls",
        "user",
        "registration",
        "audio",
        "vox",
        "talk",
        "ice",
        "network",
        "streamdeck",
        "gpio",
        "health",
        "log",
        "web",
    ];
    let mut applied = Vec::new();
    if !doc.is_object() {
        *doc = Value::Object(Default::default());
    }
    for (name, raw) in vars {
        let Some(rest) = name.strip_prefix(ENV_PREFIX) else {
            continue;
        };
        let lower = rest.to_ascii_lowercase();
        if lower == "instance" || lower == "state_dir" {
            let value = parse_env_value(&raw);
            doc[lower.as_str()] = value;
            applied.push(name);
            continue;
        }
        let Some((section, key)) = lower.split_once('_') else {
            continue;
        };
        if !sections.contains(&section) || key.is_empty() {
            continue;
        }
        let value = parse_env_value(&raw);
        let section_value = doc
            .as_object_mut()
            .expect("document is an object")
            .entry(section.to_string())
            .or_insert_with(|| Value::Object(Default::default()));
        if !section_value.is_object() {
            *section_value = Value::Object(Default::default());
        }
        section_value[key] = value;
        applied.push(name);
    }
    applied
}

fn parse_env_value(raw: &str) -> Value {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Value::Null;
    }
    match serde_json::from_str::<Value>(trimmed) {
        Ok(Value::String(s)) => Value::String(s),
        Ok(value) => value,
        Err(_) => Value::String(raw.to_string()),
    }
}

/// Loads, merges and validates the configuration for a file path.
pub fn load_from_path(path: &Path) -> Result<LoadedConfig> {
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("cannot read configuration {}", path.display()))?;
    let mut doc = parse_document(path, &text)?;
    apply_env_overrides(&mut doc, std::env::vars());
    let mut config = from_document(doc)?;
    if config.instance == "default" || config.instance.is_empty() {
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            config.instance = stem.to_string();
        }
    }
    config.validate()?;
    Ok(LoadedConfig {
        config,
        path: Some(path.to_path_buf()),
    })
}

/// Builds a configuration purely from environment variables (containers, tests).
pub fn load_from_env() -> Result<LoadedConfig> {
    let mut doc = Value::Object(Default::default());
    apply_env_overrides(&mut doc, std::env::vars());
    let config = from_document(doc)?;
    config.validate()?;
    Ok(LoadedConfig { config, path: None })
}

pub fn from_document(doc: Value) -> Result<Config> {
    serde_json::from_value(doc).map_err(|e| anyhow!("invalid configuration: {e}"))
}

/// Serializes a configuration document in the format implied by `path`.
pub fn render_document(path: &Path, doc: &Value) -> Result<String> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "json" => Ok(format!("{}\n", serde_json::to_string_pretty(doc)?)),
        "toml" => {
            let value: toml::Value =
                serde_json::from_value(doc.clone()).context("converting configuration to TOML")?;
            toml::to_string_pretty(&value).context("serializing TOML")
        }
        other => bail!("unsupported configuration extension {other:?} (use .json or .toml)"),
    }
}

/// Overlay a configuration **file** on the running (fully defaulted) document.
/// File values win; keys only present in `running` remain, so the result is
/// suitable for a settings form after a save that has not been restarted yet.
pub fn merge_file_over_running(running: &Value, file: &Value) -> Value {
    match (running, file) {
        (Value::Object(running_map), Value::Object(file_map)) => {
            let mut out = running_map.clone();
            for (key, file_val) in file_map {
                let merged = match running_map.get(key) {
                    Some(running_val) if running_val.is_object() && file_val.is_object() => {
                        merge_file_over_running(running_val, file_val)
                    }
                    _ => file_val.clone(),
                };
                out.insert(key.clone(), merged);
            }
            Value::Object(out)
        }
        (_, file) => file.clone(),
    }
}

/// Copy top-level keys from `stored` that `incoming` omitted. Nested objects
/// that **are** present in `incoming` are left as sent, so an empty
/// `gpio.outputs` object can still clear outputs.
pub fn merge_missing_top_level(stored: &Value, mut incoming: Value) -> Value {
    if let (Some(stored_map), Some(incoming_map)) = (stored.as_object(), incoming.as_object_mut()) {
        for (key, stored_val) in stored_map {
            incoming_map
                .entry(key.clone())
                .or_insert_with(|| stored_val.clone());
        }
    }
    incoming
}

/// Removes `null` members recursively; TOML has no null and JSON files stay
/// tidy without them (absent keys mean "default").
pub fn strip_nulls(value: &mut Value) {
    match value {
        Value::Object(map) => {
            map.retain(|_, v| !v.is_null());
            for v in map.values_mut() {
                strip_nulls(v);
            }
        }
        Value::Array(items) => items.iter_mut().for_each(strip_nulls),
        _ => {}
    }
}

fn config_io_error(op: &str, path: &Path, error: std::io::Error) -> anyhow::Error {
    // EROFS is 30 on Linux; match both the typed kind and the raw code so the
    // hint still appears if the kind is Uncategorized on an older std.
    let erofs =
        error.kind() == std::io::ErrorKind::ReadOnlyFilesystem || error.raw_os_error() == Some(30);
    let hint = if erofs {
        " — systemd ProtectSystem=strict remounts /etc read-only; the unit needs ReadWritePaths=/etc/talktome-headless"
    } else if error.kind() == std::io::ErrorKind::PermissionDenied {
        " — the service user talktome-headless needs write access to the configuration directory (mode 0770, group talktome-headless)"
    } else {
        ""
    };
    anyhow!("{op} {}: {error}{hint}", path.display())
}

/// Writes the document atomically (temp file + rename), keeping the file mode
/// restrictive because it contains credentials.
pub fn write_document(path: &Path, doc: &Value) -> Result<()> {
    let mut doc = doc.clone();
    strip_nulls(&mut doc);
    let text = render_document(path, &doc)?;
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("cfg")
    ));
    std::fs::write(&tmp, text.as_bytes())
        .map_err(|error| config_io_error("writing", &tmp, error))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(path)
            .map(|m| m.permissions().mode())
            .unwrap_or(0o640);
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(mode & 0o777));
    }
    std::fs::rename(&tmp, path).map_err(|error| config_io_error("replacing", path, error))?;
    Ok(())
}

/// Reads the raw configuration document currently stored in `path` (without
/// environment overrides).
pub fn read_document(path: &Path) -> Result<Value> {
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("cannot read configuration {}", path.display()))?;
    parse_document(path, &text)
}

impl Config {
    pub fn validate(&self) -> Result<()> {
        let url = url::Url::parse(&self.server.url)
            .with_context(|| format!("server.url {:?} is not a valid URL", self.server.url))?;
        if !matches!(url.scheme(), "http" | "https") {
            bail!("server.url must use http:// or https://");
        }
        if url.host_str().is_none() {
            bail!("server.url must contain a host");
        }
        if self.user.name.trim().is_empty() {
            bail!("user.name is required");
        }
        if self.user.password.is_empty() {
            bail!("user.password is required (can be supplied via TALKTOME_USER_PASSWORD)");
        }
        if self.tls.insecure
            && (self.tls.ca_file.is_some() || self.tls.fingerprint_sha256.is_some())
        {
            bail!("tls.insecure cannot be combined with tls.ca_file or tls.fingerprint_sha256");
        }
        if let Some(fp) = &self.tls.fingerprint_sha256 {
            if crate::tls::parse_fingerprint(fp).is_none() {
                bail!(
                    "tls.fingerprint_sha256 must be 32 bytes as hex (optionally colon separated)"
                );
            }
        }
        if !(0.0..=1.0).contains(&self.audio.default_volume) {
            bail!("audio.default_volume must be between 0 and 1");
        }
        if self.audio.jitter_min_ms > self.audio.jitter_max_ms {
            bail!("audio.jitter_min_ms must not exceed audio.jitter_max_ms");
        }
        if let Some(policy) = &self.ice.transport_policy {
            if !matches!(policy.as_str(), "all" | "relay") {
                bail!("ice.transport_policy must be \"all\" or \"relay\"");
            }
        }
        if let Some(mock) = &self.streamdeck.mock {
            let name = mock
                .trim()
                .to_ascii_lowercase()
                .replace(['-', '_', ' '], "");
            if !name.is_empty()
                && !matches!(
                    name.as_str(),
                    "original"
                        | "originalv2"
                        | "v2"
                        | "mini"
                        | "minimk2"
                        | "mk2"
                        | "xl"
                        | "xlv2"
                        | "plus"
                        | "plusxl"
                        | "neo"
                        | "pedal"
                )
            {
                bail!(
                    "streamdeck.mock {mock:?} is not a known model (original, originalv2, mini, minimk2, mk2, xl, xlv2, plus, plusxl, neo, pedal)"
                );
            }
        }
        if self.streamdeck.brightness > 100 {
            bail!("streamdeck.brightness must be between 0 and 100");
        }
        if !(0.01..=1.0).contains(&self.streamdeck.volume_step) {
            bail!("streamdeck.volume_step must be between 0.01 and 1");
        }
        if let Some(target) = &self.vox.target {
            crate::talk::TargetKey::parse(target).ok_or_else(|| {
                anyhow!("vox.target {target:?} must look like conference:1 or user:4")
            })?;
        }
        if self.vox.enabled && self.vox.target.is_none() {
            bail!("vox.target is required when vox.enabled is true");
        }
        for (name, output) in &self.gpio.outputs {
            if !matches!(
                name.as_str(),
                "tally" | "talking" | "incoming" | "connected" | "locked"
            ) {
                bail!("gpio.outputs.{name} is not a known output (tally, talking, incoming, connected, locked)");
            }
            if output.line.trim().is_empty() {
                bail!("gpio.outputs.{name}.line is required");
            }
        }
        for (index, input) in self.gpio.inputs.iter().enumerate() {
            if input.line.trim().is_empty() {
                bail!("gpio.inputs[{index}].line is required");
            }
            let needs_target = matches!(
                input.action,
                GpioInputAction::Talk
                    | GpioInputAction::LockToggle
                    | GpioInputAction::MuteToggle
                    | GpioInputAction::VolumeUp
                    | GpioInputAction::VolumeDown
            );
            match (&input.target, needs_target) {
                (None, true) => bail!(
                    "gpio.inputs[{index}] action {:?} requires a target",
                    input.action
                ),
                (Some(target), _) => {
                    crate::talk::TargetKey::parse(target).ok_or_else(|| {
                        anyhow!("gpio.inputs[{index}].target {target:?} must look like conference:1 or user:4")
                    })?;
                }
                _ => {}
            }
        }
        if !matches!(self.log.format.as_str(), "auto" | "json" | "text") {
            bail!("log.format must be auto, json or text");
        }
        if self.web.enabled {
            if self.web.port == 0 {
                bail!("web.port must be between 1 and 65535");
            }
            if self.web.bind.trim().is_empty() {
                bail!("web.bind is required when web.enabled is true");
            }
            if self.web.password.is_empty() {
                bail!("web.password must not be empty");
            }
        }
        Ok(())
    }

    /// The configuration with secrets removed, for `--check-config` output.
    pub fn redacted(&self) -> Config {
        let mut copy = self.clone();
        if !copy.user.password.is_empty() {
            copy.user.password = REDACTED.into();
        }
        if !copy.web.password.is_empty() {
            copy.web.password = REDACTED.into();
        }
        if let Some(servers) = copy.ice.servers.as_mut() {
            for server in servers {
                if server.credential.is_some() {
                    server.credential = Some("********".into());
                }
            }
        }
        copy
    }

    pub fn server_url(&self) -> url::Url {
        url::Url::parse(&self.server.url).expect("validated URL")
    }

    pub fn state_dir(&self) -> PathBuf {
        if let Some(dir) = &self.state_dir {
            return dir.clone();
        }
        if let Ok(dir) = std::env::var("STATE_DIRECTORY") {
            if let Some(first) = dir.split(':').next() {
                if !first.is_empty() {
                    return PathBuf::from(first);
                }
            }
        }
        PathBuf::from("/var/lib/talktome-headless").join(&self.instance)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_json() -> Value {
        serde_json::json!({
            "server": { "url": "https://talktome.local:8443" },
            "user": { "name": "Cam 1", "password": "secret" }
        })
    }

    #[test]
    fn json_and_toml_produce_the_same_config() {
        let json_text = r#"{
            "instance": "cam1",
            "server": { "url": "https://talktome.local:8443" },
            "user": { "name": "Cam 1", "password": "secret" },
            "audio": { "profile": "low", "input_device": "plughw:CARD=Headset,DEV=0" },
            "gpio": { "outputs": { "tally": { "line": "GPIO17" } },
                      "inputs": [ { "line": "GPIO22", "action": "talk", "target": "conference:1", "active_low": true } ] }
        }"#;
        let toml_text = r#"
            instance = "cam1"
            [server]
            url = "https://talktome.local:8443"
            [user]
            name = "Cam 1"
            password = "secret"
            [audio]
            profile = "low"
            input_device = "plughw:CARD=Headset,DEV=0"
            [gpio.outputs.tally]
            line = "GPIO17"
            [[gpio.inputs]]
            line = "GPIO22"
            action = "talk"
            target = "conference:1"
            active_low = true
        "#;
        let json =
            from_document(parse_document(Path::new("cam1.json"), json_text).unwrap()).unwrap();
        let toml =
            from_document(parse_document(Path::new("cam1.toml"), toml_text).unwrap()).unwrap();
        assert_eq!(
            serde_json::to_value(&json).unwrap(),
            serde_json::to_value(&toml).unwrap()
        );
        assert_eq!(json.audio.profile, AudioProfile::Low);
        assert_eq!(json.gpio.inputs[0].debounce_ms, 20);
        json.validate().unwrap();
    }

    #[test]
    fn env_overrides_replace_values_and_parse_types() {
        let mut doc = minimal_json();
        let applied = apply_env_overrides(
            &mut doc,
            vec![
                ("TALKTOME_USER_PASSWORD".to_string(), "from-env".to_string()),
                (
                    "TALKTOME_AUDIO_INPUT_DEVICE".to_string(),
                    "hw:1,0".to_string(),
                ),
                (
                    "TALKTOME_STREAMDECK_ENABLED".to_string(),
                    "false".to_string(),
                ),
                ("TALKTOME_HEALTH_PORT".to_string(), "9911".to_string()),
                ("TALKTOME_INSTANCE".to_string(), "cam7".to_string()),
                ("TALKTOME_UNKNOWN_KEY".to_string(), "x".to_string()),
                ("PATH".to_string(), "/usr/bin".to_string()),
            ],
        );
        assert_eq!(applied.len(), 5);
        let config = from_document(doc).unwrap();
        assert_eq!(config.user.password, "from-env");
        assert_eq!(config.audio.input_device.as_deref(), Some("hw:1,0"));
        assert!(!config.streamdeck.enabled);
        assert_eq!(config.health.port, Some(9911));
        assert_eq!(config.instance, "cam7");
    }

    #[test]
    fn validation_rejects_missing_credentials_and_bad_targets() {
        let mut config = from_document(minimal_json()).unwrap();
        config.validate().unwrap();
        config.user.password.clear();
        assert!(config.validate().is_err());

        let mut config = from_document(minimal_json()).unwrap();
        config.vox.enabled = true;
        assert!(config.validate().is_err());
        config.vox.target = Some("bogus".into());
        assert!(config.validate().is_err());
        config.vox.target = Some("conference:3".into());
        config.validate().unwrap();

        let mut config = from_document(minimal_json()).unwrap();
        config.gpio.outputs.insert(
            "spotlight".into(),
            GpioOutputConfig {
                line: "GPIO1".into(),
                active_low: false,
            },
        );
        assert!(config.validate().is_err());
    }

    #[test]
    fn unknown_fields_are_rejected() {
        let doc = serde_json::json!({
            "server": { "url": "https://x", "port": 1 },
            "user": { "name": "a", "password": "b" }
        });
        assert!(from_document(doc).is_err());
    }

    #[test]
    fn redaction_hides_password() {
        let config = from_document(minimal_json()).unwrap();
        assert_eq!(config.redacted().user.password, "********");
    }

    #[test]
    fn documents_round_trip_through_both_formats() {
        let dir = tempfile::tempdir().unwrap();
        let mut doc = minimal_json();
        doc["web"] = serde_json::json!({ "port": 9090, "password": "secret" });
        doc["audio"] = serde_json::json!({ "input_device": null, "profile": "low" });
        for name in ["cam.toml", "cam.json"] {
            let path = dir.path().join(name);
            write_document(&path, &doc).unwrap();
            let loaded = read_document(&path).unwrap();
            let config = from_document(loaded.clone()).unwrap();
            assert_eq!(config.web.port, 9090);
            assert_eq!(config.audio.profile, AudioProfile::Low);
            assert!(
                loaded["audio"].get("input_device").is_none(),
                "nulls are dropped"
            );
        }
        assert!(render_document(Path::new("x.yaml"), &doc).is_err());
    }

    #[test]
    fn web_defaults_and_validation() {
        let mut config = from_document(minimal_json()).unwrap();
        assert!(config.web.enabled);
        assert_eq!(config.web.port, 8080);
        assert_eq!(config.web.password, WEB_DEFAULT_PASSWORD);
        assert_eq!(config.redacted().web.password, REDACTED);
        config.web.password.clear();
        assert!(config.validate().is_err());
        config.web.enabled = false;
        config.validate().unwrap();
    }

    #[test]
    fn streamdeck_mock_accepts_known_models() {
        let mut config = from_document(minimal_json()).unwrap();
        config.streamdeck.mock = Some("mk2".into());
        config.validate().unwrap();
        config.streamdeck.mock = Some("no-such-deck".into());
        assert!(config.validate().is_err());
        config.streamdeck.mock = Some("".into());
        config.validate().unwrap();
    }

    #[test]
    fn merge_file_over_running_keeps_saved_user_and_running_defaults() {
        let running = serde_json::json!({
            "user": { "name": "Cam 1", "password": "********", "production": null },
            "audio": { "profile": "standard", "input_device": "tone" },
            "server": { "url": "https://talktome.local:8443" }
        });
        let file = serde_json::json!({
            "user": { "name": "Studio", "password": "********" },
            "server": { "url": "https://talktome.local:8443" }
        });
        let editor = merge_file_over_running(&running, &file);
        assert_eq!(editor["user"]["name"], "Studio");
        assert_eq!(editor["audio"]["profile"], "standard");
        assert_eq!(editor["audio"]["input_device"], "tone");
    }

    #[test]
    fn merge_missing_top_level_keeps_omitted_instance() {
        let stored = serde_json::json!({
            "instance": "cam1",
            "user": { "name": "Studio" },
            "audio": { "profile": "standard", "input_device": "tone" }
        });
        let incoming = serde_json::json!({
            "user": { "name": "Studio" },
            "audio": { "profile": "low" }
        });
        let merged = merge_missing_top_level(&stored, incoming);
        assert_eq!(merged["instance"], "cam1");
        assert_eq!(merged["audio"]["profile"], "low");
        assert!(merged["audio"].get("input_device").is_none());
    }

    #[test]
    fn locate_prefers_single_file() {
        let dir = tempfile::tempdir().unwrap();
        assert!(locate_instance_config(dir.path(), "cam1").is_err());
        std::fs::write(dir.path().join("cam1.toml"), "").unwrap();
        assert!(locate_instance_config(dir.path(), "cam1")
            .unwrap()
            .ends_with("cam1.toml"));
        std::fs::write(dir.path().join("cam1.json"), "{}").unwrap();
        assert!(locate_instance_config(dir.path(), "cam1").is_err());
    }

    #[test]
    fn write_errors_explain_read_only_and_permission() {
        let erofs = config_io_error(
            "writing",
            Path::new("/etc/talktome-headless/cam1.toml.tmp"),
            std::io::Error::from_raw_os_error(30),
        );
        let erofs_text = format!("{erofs:#}");
        assert!(erofs_text.contains("ReadWritePaths=/etc/talktome-headless"));
        assert!(
            erofs_text.contains("Read-only file system") || erofs_text.contains("read-only"),
            "{erofs_text}"
        );

        let denied = config_io_error(
            "writing",
            Path::new("/etc/talktome-headless/cam1.toml.tmp"),
            std::io::Error::from(std::io::ErrorKind::PermissionDenied),
        );
        assert!(format!("{denied:#}").contains("mode 0770"));
    }

    #[test]
    fn write_document_fails_on_unwritable_directory() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if std::fs::metadata("/proc/self")
                .map(|m| m.uid())
                .unwrap_or(1)
                == 0
            {
                return;
            }
        }
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cam.toml");
        write_document(&path, &minimal_json()).unwrap();
        let original = std::fs::metadata(dir.path()).unwrap().permissions();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o555)).unwrap();
        }
        let result = write_document(&path, &minimal_json());
        std::fs::set_permissions(dir.path(), original).unwrap();
        let text = format!("{:#}", result.unwrap_err());
        assert!(
            text.contains("mode 0770") || text.contains("Permission denied"),
            "{text}"
        );
    }
}
