//! Pure key-layout logic for every Stream Deck geometry: which key does what
//! and how it should look, given the current snapshot and deck-local state.

use std::time::{Duration, Instant};

use crate::state::{ConnectionState, Snapshot, TargetInfo};
use crate::talk::TargetKey;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Geometry {
    pub keys: u8,
    pub rows: u8,
    pub cols: u8,
    pub encoders: u8,
    pub touchpoints: u8,
    pub visual: bool,
}

impl Geometry {
    pub fn has_encoders(&self) -> bool {
        self.encoders > 0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgb(pub u8, pub u8, pub u8);

pub mod palette {
    use super::Rgb;
    pub const IDLE: Rgb = Rgb(38, 42, 48);
    pub const IDLE_TEXT: Rgb = Rgb(225, 228, 232);
    pub const OFFLINE: Rgb = Rgb(28, 30, 34);
    pub const OFFLINE_TEXT: Rgb = Rgb(110, 115, 122);
    pub const TALKING: Rgb = Rgb(30, 150, 70);
    pub const LOCKED: Rgb = Rgb(20, 110, 55);
    pub const INCOMING: Rgb = Rgb(220, 140, 20);
    pub const RECEIVING: Rgb = Rgb(45, 90, 160);
    pub const MUTED: Rgb = Rgb(150, 40, 40);
    pub const ON_AIR: Rgb = Rgb(200, 30, 30);
    pub const STATUS_OK: Rgb = Rgb(40, 60, 80);
    pub const STATUS_BAD: Rgb = Rgb(120, 60, 20);
    pub const VOLUME: Rgb = Rgb(70, 60, 120);
    pub const SELECTED: Rgb = Rgb(120, 100, 200);
    pub const REPLY: Rgb = Rgb(60, 70, 90);
    pub const WHITE: Rgb = Rgb(255, 255, 255);
    pub const BAR: Rgb = Rgb(120, 200, 255);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Badge {
    Lock,
    Muted,
    OnAir,
    Incoming,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Appearance {
    pub title: String,
    pub subtitle: String,
    pub background: Rgb,
    pub foreground: Rgb,
    /// 0..1 bar along the bottom (volume) when present.
    pub bar: Option<f32>,
    pub badge: Option<Badge>,
    /// Blinks between background and this colour when set.
    pub blink: Option<Rgb>,
}

impl Appearance {
    fn simple(title: &str, background: Rgb) -> Self {
        Self {
            title: title.to_string(),
            subtitle: String::new(),
            background,
            foreground: palette::IDLE_TEXT,
            bar: None,
            badge: None,
            blink: None,
        }
    }

    pub fn blank() -> Self {
        Self::simple("", palette::OFFLINE)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Status,
    Reply,
    Target(TargetKey),
    NextPage,
    VolumeToggle,
    VolumeUp,
    VolumeDown,
    MuteSelected,
    Empty,
}

#[derive(Debug, Clone, PartialEq)]
pub struct KeySpec {
    pub role: Role,
    pub appearance: Appearance,
}

/// Deck-local interaction state (not part of the shared snapshot).
#[derive(Debug, Clone)]
pub struct DeckState {
    pub page: usize,
    pub volume_layer: bool,
    pub volume_layer_touched: Instant,
    pub selected: Option<TargetKey>,
    pub blink_phase: bool,
}

impl Default for DeckState {
    fn default() -> Self {
        Self {
            page: 0,
            volume_layer: false,
            volume_layer_touched: Instant::now(),
            selected: None,
            blink_phase: false,
        }
    }
}

impl DeckState {
    pub fn touch_volume_layer(&mut self) {
        self.volume_layer_touched = Instant::now();
    }

    pub fn expire_volume_layer(&mut self, timeout: Duration) -> bool {
        if self.volume_layer && self.volume_layer_touched.elapsed() >= timeout {
            self.volume_layer = false;
            return true;
        }
        false
    }
}

/// Everything the layout needs from configuration.
#[derive(Debug, Clone)]
pub struct LayoutOptions {
    pub pedal_target: Option<TargetKey>,
}

/// Keys reserved for fixed roles in the current layer, in key order.
fn reserved_roles(geometry: &Geometry, state: &DeckState) -> Vec<(u8, Role)> {
    let mut roles = vec![(0u8, Role::Status), (1u8, Role::Reply)];
    if geometry.has_encoders() {
        return roles;
    }
    // The VOL toggle sits at the right end of the first row.
    let vol_key = geometry.cols.saturating_sub(1);
    if state.volume_layer {
        let mut next = 2u8;
        for role in [Role::MuteSelected, Role::VolumeDown, Role::VolumeUp] {
            if next == vol_key {
                next += 1;
            }
            roles.push((next, role));
            next += 1;
        }
    }
    if vol_key >= 2 && geometry.keys > 3 {
        roles.push((vol_key, Role::VolumeToggle));
    }
    roles
}

/// Number of target slots per page and the key indices used for them.
pub fn target_slots(geometry: &Geometry, state: &DeckState, target_count: usize) -> Vec<u8> {
    let reserved: Vec<u8> = reserved_roles(geometry, state)
        .into_iter()
        .map(|(k, _)| k)
        .collect();
    let mut free: Vec<u8> = (0..geometry.keys)
        .filter(|k| !reserved.contains(k))
        .collect();
    if target_count > free.len() && !free.is_empty() {
        // Paging needed: the last free key becomes "next page".
        free.pop();
    }
    free
}

pub fn page_count(geometry: &Geometry, state: &DeckState, target_count: usize) -> usize {
    let slots = target_slots(geometry, state, target_count).len().max(1);
    target_count.div_ceil(slots).max(1)
}

/// Targets shown on the current page, in slot order.
pub fn page_targets<'a>(
    geometry: &Geometry,
    state: &DeckState,
    targets: &'a [TargetInfo],
) -> Vec<&'a TargetInfo> {
    let slots = target_slots(geometry, state, targets.len());
    let per_page = slots.len().max(1);
    let pages = page_count(geometry, state, targets.len());
    let page = state.page.min(pages.saturating_sub(1));
    targets
        .iter()
        .skip(page * per_page)
        .take(per_page)
        .collect()
}

fn target_appearance(target: &TargetInfo, state: &DeckState, snapshot: &Snapshot) -> Appearance {
    let volume_pct = format!("{}%", (target.volume * 100.0).round() as u32);
    let mut appearance = Appearance::simple(&target.name, palette::IDLE);
    if state.volume_layer {
        appearance.background = if state.selected == Some(target.key) {
            palette::SELECTED
        } else {
            palette::VOLUME
        };
        appearance.subtitle = volume_pct;
        appearance.bar = Some(target.volume);
        if target.muted {
            appearance.badge = Some(Badge::Muted);
        }
        return appearance;
    }
    if !target.online {
        appearance.background = palette::OFFLINE;
        appearance.foreground = palette::OFFLINE_TEXT;
    }
    if target.receiving {
        appearance.background = palette::RECEIVING;
    }
    if target.incoming {
        appearance.background = palette::INCOMING;
        appearance.blink = Some(palette::IDLE);
        appearance.badge = Some(Badge::Incoming);
    }
    if target.locked {
        appearance.background = palette::LOCKED;
        appearance.badge = Some(Badge::Lock);
        appearance.blink = None;
    }
    if target.held {
        appearance.background = palette::TALKING;
        appearance.blink = None;
    }
    if !target.can_talk {
        appearance.subtitle = volume_pct;
        appearance.bar = Some(target.volume);
    }
    if target.muted {
        appearance.badge = Some(Badge::Muted);
        if !target.can_talk {
            appearance.background = palette::MUTED;
        }
    }
    let _ = snapshot;
    appearance
}

fn status_appearance(snapshot: &Snapshot, state: &DeckState, pages: usize) -> Appearance {
    let mut appearance = Appearance::simple(
        &snapshot.user_name,
        if snapshot.connection == ConnectionState::Ready && snapshot.audio_ok {
            palette::STATUS_OK
        } else {
            palette::STATUS_BAD
        },
    );
    appearance.subtitle = if state.volume_layer {
        "VOLUME".to_string()
    } else if snapshot.connection != ConnectionState::Ready {
        snapshot.connection.label().to_string()
    } else if !snapshot.audio_ok {
        "no audio".to_string()
    } else if pages > 1 {
        format!("page {}/{}", state.page.min(pages - 1) + 1, pages)
    } else {
        "ready".to_string()
    };
    if snapshot.on_air {
        appearance.background = palette::ON_AIR;
        appearance.subtitle = "ON AIR".to_string();
        appearance.badge = Some(Badge::OnAir);
    }
    if snapshot.lock_active {
        appearance.badge = Some(Badge::Lock);
    }
    appearance
}

fn reply_appearance(snapshot: &Snapshot) -> Appearance {
    let mut appearance = Appearance::simple("REPLY", palette::REPLY);
    match (&snapshot.reply_name, snapshot.incoming.first()) {
        (_, Some(incoming)) => {
            appearance.subtitle = incoming.from_name.clone();
            appearance.background = palette::INCOMING;
            appearance.blink = Some(palette::REPLY);
        }
        (Some(name), None) => {
            appearance.subtitle = name.clone();
        }
        (None, None) => {
            appearance.foreground = palette::OFFLINE_TEXT;
        }
    }
    if snapshot
        .reply_target
        .map(|key| snapshot.target(key).map(|t| t.held).unwrap_or(false))
        .unwrap_or(false)
    {
        appearance.background = palette::TALKING;
        appearance.blink = None;
    }
    appearance
}

/// Builds the full key map for a visual deck.
pub fn layout(
    geometry: &Geometry,
    snapshot: &Snapshot,
    state: &DeckState,
    options: &LayoutOptions,
) -> Vec<KeySpec> {
    if !geometry.visual {
        return pedal_layout(options);
    }
    let mut keys: Vec<KeySpec> = (0..geometry.keys)
        .map(|_| KeySpec {
            role: Role::Empty,
            appearance: Appearance::blank(),
        })
        .collect();
    let pages = page_count(geometry, state, snapshot.targets.len());
    for (key, role) in reserved_roles(geometry, state) {
        let Some(slot) = keys.get_mut(key as usize) else {
            continue;
        };
        slot.role = role;
        slot.appearance = match role {
            Role::Status => status_appearance(snapshot, state, pages),
            Role::Reply => reply_appearance(snapshot),
            Role::VolumeToggle => {
                let mut a = Appearance::simple(
                    "VOL",
                    if state.volume_layer {
                        palette::SELECTED
                    } else {
                        palette::VOLUME
                    },
                );
                a.subtitle = if state.volume_layer {
                    "back".into()
                } else {
                    String::new()
                };
                a
            }
            Role::VolumeUp => Appearance::simple("+", palette::VOLUME),
            Role::VolumeDown => Appearance::simple("−", palette::VOLUME),
            Role::MuteSelected => {
                let selected = state.selected.and_then(|key| snapshot.target(key));
                let mut a = Appearance::simple("MUTE", palette::VOLUME);
                if let Some(target) = selected {
                    a.subtitle = target.name.clone();
                    if target.muted {
                        a.background = palette::MUTED;
                        a.badge = Some(Badge::Muted);
                    }
                }
                a
            }
            _ => Appearance::blank(),
        };
    }
    let slots = target_slots(geometry, state, snapshot.targets.len());
    let shown = page_targets(geometry, state, &snapshot.targets);
    for (slot, target) in slots.iter().zip(shown.iter()) {
        if let Some(key) = keys.get_mut(*slot as usize) {
            key.role = Role::Target(target.key);
            key.appearance = target_appearance(target, state, snapshot);
        }
    }
    if pages > 1 {
        let reserved: Vec<u8> = reserved_roles(geometry, state)
            .into_iter()
            .map(|(k, _)| k)
            .collect();
        if let Some(next_key) = (0..geometry.keys).rev().find(|k| !reserved.contains(k)) {
            if let Some(key) = keys.get_mut(next_key as usize) {
                key.role = Role::NextPage;
                let mut a = Appearance::simple("NEXT", palette::REPLY);
                a.subtitle = format!("{}/{}", state.page.min(pages - 1) + 1, pages);
                key.appearance = a;
            }
        }
    }
    keys
}

fn pedal_layout(options: &LayoutOptions) -> Vec<KeySpec> {
    let blank = Appearance::blank();
    vec![
        KeySpec {
            role: Role::Reply,
            appearance: blank.clone(),
        },
        KeySpec {
            role: options
                .pedal_target
                .map(Role::Target)
                .unwrap_or(Role::Empty),
            appearance: blank.clone(),
        },
        KeySpec {
            role: Role::Empty,
            appearance: blank,
        },
    ]
}

/// Targets bound to the encoders of a Stream Deck + on the current page.
pub fn encoder_targets<'a>(
    geometry: &Geometry,
    state: &DeckState,
    snapshot: &'a Snapshot,
) -> Vec<Option<&'a TargetInfo>> {
    let shown = page_targets(geometry, state, &snapshot.targets);
    (0..geometry.encoders as usize)
        .map(|index| shown.get(index).copied())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn geometry(kind: &str) -> Geometry {
        match kind {
            "mk2" => Geometry {
                keys: 15,
                rows: 3,
                cols: 5,
                encoders: 0,
                touchpoints: 0,
                visual: true,
            },
            "mini" => Geometry {
                keys: 6,
                rows: 2,
                cols: 3,
                encoders: 0,
                touchpoints: 0,
                visual: true,
            },
            "xl" => Geometry {
                keys: 32,
                rows: 4,
                cols: 8,
                encoders: 0,
                touchpoints: 0,
                visual: true,
            },
            "plus" => Geometry {
                keys: 8,
                rows: 2,
                cols: 4,
                encoders: 4,
                touchpoints: 0,
                visual: true,
            },
            "neo" => Geometry {
                keys: 8,
                rows: 2,
                cols: 4,
                encoders: 0,
                touchpoints: 2,
                visual: true,
            },
            _ => Geometry {
                keys: 3,
                rows: 1,
                cols: 3,
                encoders: 0,
                touchpoints: 0,
                visual: false,
            },
        }
    }

    fn snapshot(count: usize) -> Snapshot {
        let mut snapshot = Snapshot::initial("cam1", "Cam 1");
        snapshot.connection = ConnectionState::Ready;
        snapshot.audio_ok = true;
        snapshot.targets = (0..count)
            .map(|i| TargetInfo {
                key: if i % 3 == 2 {
                    TargetKey::Feed(i as i64)
                } else {
                    TargetKey::User(i as i64)
                },
                name: format!("T{i}"),
                can_talk: i % 3 != 2,
                online: true,
                held: false,
                locked: false,
                incoming: false,
                receiving: false,
                volume: 0.9,
                muted: false,
            })
            .collect();
        snapshot
    }

    fn options() -> LayoutOptions {
        LayoutOptions {
            pedal_target: Some(TargetKey::Conference(1)),
        }
    }

    #[test]
    fn mk2_layout_reserves_status_reply_and_vol() {
        let geometry = geometry("mk2");
        let state = DeckState::default();
        let keys = layout(&geometry, &snapshot(5), &state, &options());
        assert_eq!(keys.len(), 15);
        assert_eq!(keys[0].role, Role::Status);
        assert_eq!(keys[1].role, Role::Reply);
        assert_eq!(keys[4].role, Role::VolumeToggle);
        assert_eq!(keys[2].role, Role::Target(TargetKey::User(0)));
        assert_eq!(keys[3].role, Role::Target(TargetKey::User(1)));
        assert_eq!(keys[5].role, Role::Target(TargetKey::Feed(2)));
        assert_eq!(keys[8].role, Role::Empty);
        assert_eq!(keys[0].appearance.subtitle, "ready");
    }

    #[test]
    fn paging_appears_when_targets_overflow() {
        let geometry = geometry("mini");
        let mut state = DeckState::default();
        let snapshot = snapshot(7);
        // Mini: keys 0,1 reserved, key 2 = VOL, three free keys -> 2 targets + NEXT.
        let keys = layout(&geometry, &snapshot, &state, &options());
        assert_eq!(keys[2].role, Role::VolumeToggle);
        assert_eq!(keys[5].role, Role::NextPage);
        assert_eq!(keys[3].role, Role::Target(TargetKey::User(0)));
        assert_eq!(page_count(&geometry, &state, 7), 4);
        state.page = 3;
        let keys = layout(&geometry, &snapshot, &state, &options());
        assert_eq!(keys[3].role, Role::Target(TargetKey::User(6)));
        assert_eq!(keys[4].role, Role::Empty);
        assert_eq!(keys[0].appearance.subtitle, "page 4/4");
    }

    #[test]
    fn volume_layer_adds_controls_and_bars() {
        let geometry = geometry("mk2");
        let state = DeckState {
            volume_layer: true,
            selected: Some(TargetKey::User(0)),
            ..DeckState::default()
        };
        let keys = layout(&geometry, &snapshot(4), &state, &options());
        assert_eq!(keys[2].role, Role::MuteSelected);
        assert_eq!(keys[3].role, Role::VolumeDown);
        assert_eq!(keys[4].role, Role::VolumeToggle);
        assert_eq!(keys[5].role, Role::VolumeUp);
        assert_eq!(keys[6].role, Role::Target(TargetKey::User(0)));
        assert_eq!(keys[6].appearance.bar, Some(0.9));
        assert_eq!(keys[6].appearance.background, palette::SELECTED);
        assert_eq!(keys[2].appearance.subtitle, "T0");
        assert_eq!(keys[0].appearance.subtitle, "VOLUME");
    }

    #[test]
    fn plus_uses_encoders_instead_of_vol_key() {
        let geometry = geometry("plus");
        let state = DeckState::default();
        let snapshot = snapshot(3);
        let keys = layout(&geometry, &snapshot, &state, &options());
        assert!(!keys.iter().any(|k| k.role == Role::VolumeToggle));
        assert_eq!(keys[2].role, Role::Target(TargetKey::User(0)));
        let encoders = encoder_targets(&geometry, &state, &snapshot);
        assert_eq!(encoders.len(), 4);
        assert_eq!(encoders[0].map(|t| t.key), Some(TargetKey::User(0)));
        assert_eq!(encoders[3], None);
    }

    #[test]
    fn states_change_appearance() {
        let geometry = geometry("xl");
        let state = DeckState::default();
        let mut snapshot = snapshot(3);
        snapshot.targets[0].incoming = true;
        snapshot.targets[1].locked = true;
        snapshot.targets[2].muted = true;
        snapshot.on_air = true;
        snapshot.lock_active = true;
        let keys = layout(&geometry, &snapshot, &state, &options());
        assert_eq!(keys[0].appearance.subtitle, "ON AIR");
        assert_eq!(keys[0].appearance.background, palette::ON_AIR);
        assert_eq!(keys[2].appearance.badge, Some(Badge::Incoming));
        assert!(keys[2].appearance.blink.is_some());
        assert_eq!(keys[3].appearance.background, palette::LOCKED);
        assert_eq!(keys[4].appearance.background, palette::MUTED);
        assert_eq!(keys[4].appearance.badge, Some(Badge::Muted));
    }

    #[test]
    fn pedal_maps_three_switches() {
        let keys = layout(
            &geometry("pedal"),
            &snapshot(2),
            &DeckState::default(),
            &options(),
        );
        assert_eq!(keys[0].role, Role::Reply);
        assert_eq!(keys[1].role, Role::Target(TargetKey::Conference(1)));
    }

    #[test]
    fn volume_layer_times_out() {
        let mut state = DeckState {
            volume_layer: true,
            volume_layer_touched: Instant::now() - Duration::from_secs(10),
            ..DeckState::default()
        };
        assert!(state.expire_volume_layer(Duration::from_secs(8)));
        assert!(!state.volume_layer);
    }
}
