//! Pure key-layout logic for every Stream Deck geometry: which key does what
//! and how it should look, given the current snapshot and deck-local state.

use std::time::{Duration, Instant};

use crate::state::{ConferenceMemberInfo, ConnectionState, Snapshot, TargetInfo};
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
    /// Stream Deck +: dials sit under the bottom row of keys, one per column.
    pub fn encoders_follow_bottom_row(&self) -> bool {
        self.encoders > 0 && self.encoders == self.cols && self.rows >= 2
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
    pub const MEMBERS: Rgb = Rgb(40, 95, 90);
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
    Member { conference: TargetKey, user_id: i64 },
    NextPage,
    NextEncoderPage,
    VolumeToggle,
    MembersToggle,
    VolumeUp,
    VolumeDown,
    MuteSelected,
    Empty,
}

/// What a Stream Deck + / + XL encoder currently controls.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EncoderBinding<'a> {
    Target(&'a TargetInfo),
    Member {
        conference: TargetKey,
        member: &'a ConferenceMemberInfo,
    },
}

/// Decks whose command row still has a spare cell after Status, VOL, Reply
/// and any paging keys (MK.2 / Original / XL / Plus XL).
pub fn has_members_command_key(geometry: &Geometry) -> bool {
    geometry.visual && geometry.cols >= 5
}

/// Neo / Mini / Plus have no MEMBERS key; VOL long-press opens the member layer.
pub fn volume_toggle_defers_to_release(geometry: &Geometry) -> bool {
    geometry.visual && !has_members_command_key(geometry)
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
    pub encoder_page: usize,
    pub volume_layer: bool,
    pub volume_layer_touched: Instant,
    pub member_layer: bool,
    pub member_layer_touched: Instant,
    pub member_conference: Option<TargetKey>,
    pub member_selected: Option<i64>,
    pub member_page: usize,
    pub selected: Option<TargetKey>,
    pub blink_phase: bool,
}

impl Default for DeckState {
    fn default() -> Self {
        Self {
            page: 0,
            encoder_page: 0,
            volume_layer: false,
            volume_layer_touched: Instant::now(),
            member_layer: false,
            member_layer_touched: Instant::now(),
            member_conference: None,
            member_selected: None,
            member_page: 0,
            selected: None,
            blink_phase: false,
        }
    }
}

impl DeckState {
    pub fn touch_volume_layer(&mut self) {
        self.volume_layer_touched = Instant::now();
    }

    pub fn touch_member_layer(&mut self) {
        self.member_layer_touched = Instant::now();
    }

    pub fn close_volume_layer(&mut self) {
        self.volume_layer = false;
    }

    pub fn close_member_layer(&mut self) {
        self.member_layer = false;
    }

    pub fn expire_volume_layer(&mut self, timeout: Duration) -> bool {
        if self.volume_layer && self.volume_layer_touched.elapsed() >= timeout {
            self.close_volume_layer();
            return true;
        }
        false
    }

    pub fn expire_member_layer(&mut self, timeout: Duration) -> bool {
        if self.member_layer && self.member_layer_touched.elapsed() >= timeout {
            self.close_member_layer();
            return true;
        }
        false
    }

    pub fn toggle_volume_layer(&mut self, snapshot: &Snapshot) {
        if self.volume_layer {
            self.close_volume_layer();
            return;
        }
        self.close_member_layer();
        self.volume_layer = true;
        self.touch_volume_layer();
        if self.selected.is_none() {
            self.selected = snapshot.targets.first().map(|t| t.key);
        }
    }

    /// Opens or closes the member layer. Returns whether the layout changed.
    pub fn toggle_member_layer(
        &mut self,
        snapshot: &Snapshot,
        preferred: Option<TargetKey>,
    ) -> bool {
        if self.member_layer {
            self.close_member_layer();
            return true;
        }
        self.open_member_layer(snapshot, preferred)
    }

    /// Enters the member layer for `preferred` or a default conference.
    pub fn open_member_layer(&mut self, snapshot: &Snapshot, preferred: Option<TargetKey>) -> bool {
        let Some(conference) =
            default_member_conference(snapshot, preferred.or(self.member_conference))
        else {
            return false;
        };
        let members = conference_members(snapshot, conference);
        let keep_selection = self.member_conference == Some(conference)
            && self
                .member_selected
                .is_some_and(|id| members.iter().any(|member| member.user_id == id));
        self.close_volume_layer();
        self.member_layer = true;
        self.member_conference = Some(conference);
        if !keep_selection {
            self.member_selected = members.first().map(|member| member.user_id);
            self.member_page = 0;
        }
        self.encoder_page = 0;
        self.touch_member_layer();
        true
    }

    pub fn clamp_pages(&mut self, geometry: &Geometry, snapshot: &Snapshot) {
        let target_count = snapshot.targets.len();
        let pages = page_count(geometry, target_count);
        self.page = self.page.min(pages.saturating_sub(1));
        let member_count = self
            .member_conference
            .and_then(|key| snapshot.target(key))
            .map(|target| target.members.len())
            .unwrap_or(0);
        let member_pages = page_count(geometry, member_count);
        self.member_page = self.member_page.min(member_pages.saturating_sub(1));
        let encoder_count = if self.member_layer {
            member_count
        } else {
            target_count
        };
        let encoder_pages = encoder_page_count(geometry, encoder_count);
        self.encoder_page = self.encoder_page.min(encoder_pages.saturating_sub(1));
    }
}

/// Conference whose members the layer should show when none is named.
pub fn default_member_conference(
    snapshot: &Snapshot,
    preferred: Option<TargetKey>,
) -> Option<TargetKey> {
    let is_conference = |key: TargetKey| matches!(key, TargetKey::Conference(_));
    if let Some(key) = preferred.filter(|key| is_conference(*key)) {
        if snapshot.target(key).is_some() {
            return Some(key);
        }
    }
    snapshot
        .targets
        .iter()
        .find(|target| is_conference(target.key) && (target.held || target.locked))
        .map(|target| target.key)
        .or_else(|| snapshot.reply_target.filter(|key| is_conference(*key)))
        .or_else(|| {
            snapshot
                .targets
                .iter()
                .find(|target| is_conference(target.key) && !target.members.is_empty())
                .map(|target| target.key)
        })
        .or_else(|| {
            snapshot
                .targets
                .iter()
                .find(|target| is_conference(target.key))
                .map(|target| target.key)
        })
}

pub fn conference_members(snapshot: &Snapshot, conference: TargetKey) -> &[ConferenceMemberInfo] {
    snapshot
        .target(conference)
        .map(|target| target.members.as_slice())
        .unwrap_or(&[])
}

/// Everything the layout needs from configuration.
#[derive(Debug, Clone, Default)]
pub struct LayoutOptions {
    pub pedal_left: Option<TargetKey>,
    pub pedal_middle: Option<TargetKey>,
}

/// Target keys, bottom row left-to-right then the row above, never the command row.
pub fn target_slots(geometry: &Geometry) -> Vec<u8> {
    if !geometry.visual || geometry.rows <= 1 || geometry.cols == 0 {
        return Vec::new();
    }
    let cols = geometry.cols as usize;
    let rows = geometry.rows as usize;
    let mut slots = Vec::with_capacity((rows - 1) * cols);
    for row in (1..rows).rev() {
        for col in 0..cols {
            let index = row * cols + col;
            if index < geometry.keys as usize {
                slots.push(index as u8);
            }
        }
    }
    slots
}

pub fn page_count(geometry: &Geometry, target_count: usize) -> usize {
    let slots = target_slots(geometry).len();
    if slots == 0 {
        return 1;
    }
    target_count.div_ceil(slots).max(1)
}

/// Separate dial pages on models whose encoders are not in line with a key row.
pub fn encoder_page_count(geometry: &Geometry, target_count: usize) -> usize {
    if geometry.encoders == 0 || geometry.encoders_follow_bottom_row() {
        return 1;
    }
    target_count.div_ceil(geometry.encoders as usize).max(1)
}

/// Targets shown on the current key page, in slot order (bottom row first).
pub fn page_targets<'a>(
    geometry: &Geometry,
    state: &DeckState,
    targets: &'a [TargetInfo],
) -> Vec<&'a TargetInfo> {
    let slots = target_slots(geometry);
    let per_page = slots.len().max(1);
    let pages = page_count(geometry, targets.len());
    let page = state.page.min(pages.saturating_sub(1));
    targets
        .iter()
        .skip(page * per_page)
        .take(per_page)
        .collect()
}

/// Conference members shown on the current member page, in slot order.
pub fn page_members<'a>(
    geometry: &Geometry,
    state: &DeckState,
    members: &'a [ConferenceMemberInfo],
) -> Vec<&'a ConferenceMemberInfo> {
    let slots = target_slots(geometry);
    let per_page = slots.len().max(1);
    let pages = page_count(geometry, members.len());
    let page = state.member_page.min(pages.saturating_sub(1));
    members
        .iter()
        .skip(page * per_page)
        .take(per_page)
        .collect()
}

fn layer_page_counts(
    geometry: &Geometry,
    snapshot: &Snapshot,
    state: &DeckState,
) -> (usize, usize) {
    if state.member_layer {
        let count = state
            .member_conference
            .map(|key| conference_members(snapshot, key).len())
            .unwrap_or(0);
        (
            page_count(geometry, count),
            encoder_page_count(geometry, count),
        )
    } else {
        (
            page_count(geometry, snapshot.targets.len()),
            encoder_page_count(geometry, snapshot.targets.len()),
        )
    }
}

/// Command-row roles for the current layer. Targets never appear here.
fn command_roles(
    geometry: &Geometry,
    state: &DeckState,
    key_pages: usize,
    encoder_pages: usize,
) -> Vec<(u8, Role)> {
    if !geometry.visual || geometry.cols == 0 {
        return Vec::new();
    }
    let cols = geometry.cols as usize;
    let mut row: Vec<Option<Role>> = vec![None; cols];

    let idle_pagers = |row: &mut [Option<Role>]| {
        row[0] = Some(Role::Status);
        row[cols - 1] = Some(Role::Reply);
        if cols > 1 {
            row[1] = Some(Role::VolumeToggle);
        }
        let mut cursor = cols.saturating_sub(2);
        if key_pages > 1 && cursor > 1 {
            row[cursor] = Some(Role::NextPage);
            cursor = cursor.saturating_sub(1);
        } else if key_pages > 1 && cursor == 1 {
            row[1] = Some(Role::NextPage);
        }
        if encoder_pages > 1 && cursor > 1 {
            row[cursor] = Some(Role::NextEncoderPage);
        } else if encoder_pages > 1 && cursor == 1 && row[1] != Some(Role::NextPage) {
            row[1] = Some(Role::NextEncoderPage);
        }
        if has_members_command_key(geometry) {
            if let Some(index) = row.iter().position(|cell| cell.is_none()) {
                row[index] = Some(Role::MembersToggle);
            }
        }
    };

    let overlay = |row: &mut [Option<Role>], toggle: Role| {
        let controls = [toggle, Role::MuteSelected, Role::VolumeDown, Role::VolumeUp];
        for (index, role) in controls.iter().enumerate() {
            if index < cols {
                row[index] = Some(*role);
            }
        }
        if cols > 4 {
            let mut idle = vec![None; cols];
            idle_pagers(&mut idle);
            for (index, role) in idle.into_iter().enumerate().skip(4) {
                if row[index].is_none() {
                    row[index] = role;
                }
            }
        }
    };

    if state.member_layer {
        overlay(&mut row, Role::MembersToggle);
    } else if state.volume_layer {
        overlay(&mut row, Role::VolumeToggle);
    } else {
        idle_pagers(&mut row);
    }

    row.into_iter()
        .enumerate()
        .filter_map(|(index, role)| role.map(|role| (index as u8, role)))
        .collect()
}

fn member_appearance(member: &ConferenceMemberInfo, state: &DeckState) -> Appearance {
    let volume_pct = format!("{}%", (member.volume * 100.0).round() as u32);
    let mut appearance = Appearance::simple(&member.name, palette::MEMBERS);
    appearance.subtitle = volume_pct;
    appearance.bar = Some(member.volume);
    if state.member_selected == Some(member.user_id) {
        appearance.background = palette::SELECTED;
    }
    if !member.online {
        appearance.foreground = palette::OFFLINE_TEXT;
        if state.member_selected != Some(member.user_id) {
            appearance.background = palette::OFFLINE;
        }
    }
    if member.receiving {
        appearance.background = palette::RECEIVING;
        if state.member_selected == Some(member.user_id) {
            appearance.background = palette::SELECTED;
        }
    }
    if member.muted {
        appearance.badge = Some(Badge::Muted);
        if state.member_selected != Some(member.user_id) {
            appearance.background = palette::MUTED;
        }
    }
    appearance
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

fn status_appearance(snapshot: &Snapshot, state: &DeckState) -> Appearance {
    let mut appearance = Appearance::simple(
        &snapshot.user_name,
        if snapshot.connection == ConnectionState::Ready && snapshot.audio_ok {
            palette::STATUS_OK
        } else {
            palette::STATUS_BAD
        },
    );
    appearance.subtitle = if state.member_layer {
        "MEMBERS".to_string()
    } else if state.volume_layer {
        "VOLUME".to_string()
    } else if snapshot.connection != ConnectionState::Ready {
        snapshot.connection.label().to_string()
    } else if !snapshot.audio_ok {
        "no audio".to_string()
    } else if let Some(production) = snapshot
        .production
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
    {
        production.to_string()
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

fn reply_conference_name(snapshot: &Snapshot) -> Option<String> {
    snapshot.reply_label()
}

fn reply_appearance(snapshot: &Snapshot) -> Appearance {
    let mut appearance = Appearance::simple("REPLY", palette::REPLY);
    match reply_conference_name(snapshot) {
        Some(name) => appearance.subtitle = name,
        None => appearance.foreground = palette::OFFLINE_TEXT,
    }
    if !snapshot.incoming.is_empty() {
        appearance.background = palette::INCOMING;
        appearance.blink = Some(palette::REPLY);
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

fn appearance_for_role(
    role: Role,
    snapshot: &Snapshot,
    state: &DeckState,
    key_pages: usize,
    encoder_pages: usize,
) -> Appearance {
    match role {
        Role::Status => status_appearance(snapshot, state),
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
        Role::MembersToggle => {
            let mut a = Appearance::simple(
                "MEMBERS",
                if state.member_layer {
                    palette::SELECTED
                } else {
                    palette::MEMBERS
                },
            );
            a.subtitle = if state.member_layer {
                "back".into()
            } else {
                state
                    .member_conference
                    .and_then(|key| snapshot.target(key))
                    .or_else(|| {
                        default_member_conference(snapshot, None)
                            .and_then(|key| snapshot.target(key))
                    })
                    .map(|target| target.name.clone())
                    .unwrap_or_default()
            };
            a
        }
        Role::VolumeUp => Appearance::simple(
            "+",
            if state.member_layer {
                palette::MEMBERS
            } else {
                palette::VOLUME
            },
        ),
        Role::VolumeDown => Appearance::simple(
            "−",
            if state.member_layer {
                palette::MEMBERS
            } else {
                palette::VOLUME
            },
        ),
        Role::MuteSelected => {
            if state.member_layer {
                let member = state.member_conference.and_then(|conference| {
                    conference_members(snapshot, conference)
                        .iter()
                        .find(|member| Some(member.user_id) == state.member_selected)
                });
                let mut a = Appearance::simple(
                    if member.map(|m| m.muted).unwrap_or(false) {
                        "HEAR"
                    } else {
                        "MUTE"
                    },
                    palette::MEMBERS,
                );
                if let Some(member) = member {
                    a.subtitle = member.name.clone();
                    if member.muted {
                        a.background = palette::MUTED;
                        a.badge = Some(Badge::Muted);
                    }
                }
                a
            } else {
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
        }
        Role::NextPage => {
            let mut a = Appearance::simple("NEXT", palette::REPLY);
            a.subtitle = format!(
                "{}/{}",
                state.page.min(key_pages.saturating_sub(1)) + 1,
                key_pages
            );
            a
        }
        Role::NextEncoderPage => {
            let mut a = Appearance::simple("DIALS", palette::VOLUME);
            a.subtitle = format!(
                "{}/{}",
                state.encoder_page.min(encoder_pages.saturating_sub(1)) + 1,
                encoder_pages
            );
            a
        }
        Role::Target(key) => snapshot
            .target(key)
            .map(|target| target_appearance(target, state, snapshot))
            .unwrap_or_else(Appearance::blank),
        Role::Member {
            conference,
            user_id,
        } => snapshot
            .target(conference)
            .and_then(|target| {
                target
                    .members
                    .iter()
                    .find(|member| member.user_id == user_id)
            })
            .map(|member| member_appearance(member, state))
            .unwrap_or_else(Appearance::blank),
        Role::Empty => Appearance::blank(),
    }
}

/// Builds the full key map for a visual deck.
pub fn layout(
    geometry: &Geometry,
    snapshot: &Snapshot,
    state: &DeckState,
    options: &LayoutOptions,
) -> Vec<KeySpec> {
    if !geometry.visual {
        return pedal_layout(snapshot, options);
    }
    let mut keys: Vec<KeySpec> = (0..geometry.keys)
        .map(|_| KeySpec {
            role: Role::Empty,
            appearance: Appearance::blank(),
        })
        .collect();
    let (key_pages, encoder_pages) = layer_page_counts(geometry, snapshot, state);
    for (key, role) in command_roles(geometry, state, key_pages, encoder_pages) {
        let Some(slot) = keys.get_mut(key as usize) else {
            continue;
        };
        slot.role = role;
        slot.appearance = appearance_for_role(role, snapshot, state, key_pages, encoder_pages);
    }
    let slots = target_slots(geometry);
    if state.member_layer {
        if let Some(conference) = state.member_conference {
            let shown = page_members(geometry, state, conference_members(snapshot, conference));
            for (slot, member) in slots.iter().zip(shown.iter()) {
                if let Some(key) = keys.get_mut(*slot as usize) {
                    key.role = Role::Member {
                        conference,
                        user_id: member.user_id,
                    };
                    key.appearance = member_appearance(member, state);
                }
            }
        }
    } else {
        let shown = page_targets(geometry, state, &snapshot.targets);
        for (slot, target) in slots.iter().zip(shown.iter()) {
            if let Some(key) = keys.get_mut(*slot as usize) {
                key.role = Role::Target(target.key);
                key.appearance = target_appearance(target, state, snapshot);
            }
        }
    }
    keys
}

fn pedal_layout(snapshot: &Snapshot, options: &LayoutOptions) -> Vec<KeySpec> {
    let assign = |target: Option<TargetKey>| match target {
        Some(key) => KeySpec {
            role: Role::Target(key),
            appearance: snapshot
                .target(key)
                .map(|target| target_appearance(target, &DeckState::default(), snapshot))
                .unwrap_or_else(|| {
                    let mut a = Appearance::simple(&key.to_string(), palette::IDLE);
                    a.foreground = palette::OFFLINE_TEXT;
                    a
                }),
        },
        None => KeySpec {
            role: Role::Empty,
            appearance: {
                let mut a = Appearance::simple("—", palette::OFFLINE);
                a.foreground = palette::OFFLINE_TEXT;
                a
            },
        },
    };
    vec![
        assign(options.pedal_left),
        assign(options.pedal_middle),
        KeySpec {
            role: Role::Reply,
            appearance: reply_appearance(snapshot),
        },
    ]
}

/// Targets or members bound to the encoders of a Stream Deck + / + XL.
pub fn encoder_bindings<'a>(
    geometry: &Geometry,
    state: &DeckState,
    snapshot: &'a Snapshot,
) -> Vec<Option<EncoderBinding<'a>>> {
    if geometry.encoders == 0 {
        return Vec::new();
    }
    if state.member_layer {
        let Some(conference) = state.member_conference else {
            return vec![None; geometry.encoders as usize];
        };
        let members = conference_members(snapshot, conference);
        if geometry.encoders_follow_bottom_row() {
            let shown = page_members(geometry, state, members);
            return (0..geometry.encoders as usize)
                .map(|index| {
                    shown
                        .get(index)
                        .copied()
                        .map(|member| EncoderBinding::Member { conference, member })
                })
                .collect();
        }
        let per_page = geometry.encoders.max(1) as usize;
        let pages = encoder_page_count(geometry, members.len());
        let page = state.encoder_page.min(pages.saturating_sub(1));
        return (0..geometry.encoders as usize)
            .map(|index| {
                members
                    .get(page * per_page + index)
                    .map(|member| EncoderBinding::Member { conference, member })
            })
            .collect();
    }
    if geometry.encoders_follow_bottom_row() {
        let shown = page_targets(geometry, state, &snapshot.targets);
        return (0..geometry.encoders as usize)
            .map(|index| shown.get(index).copied().map(EncoderBinding::Target))
            .collect();
    }
    let per_page = geometry.encoders.max(1) as usize;
    let pages = encoder_page_count(geometry, snapshot.targets.len());
    let page = state.encoder_page.min(pages.saturating_sub(1));
    (0..geometry.encoders as usize)
        .map(|index| {
            snapshot
                .targets
                .get(page * per_page + index)
                .map(EncoderBinding::Target)
        })
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
            "plusxl" => Geometry {
                keys: 36,
                rows: 4,
                cols: 9,
                encoders: 6,
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
                members: Vec::new(),
            })
            .collect();
        snapshot
    }

    fn options() -> LayoutOptions {
        LayoutOptions {
            pedal_left: Some(TargetKey::User(9)),
            pedal_middle: Some(TargetKey::Conference(1)),
        }
    }

    fn binding_target(binding: Option<EncoderBinding<'_>>) -> Option<TargetKey> {
        match binding {
            Some(EncoderBinding::Target(target)) => Some(target.key),
            _ => None,
        }
    }

    fn roles(kind: &str, count: usize, state: &DeckState) -> Vec<Role> {
        layout(&geometry(kind), &snapshot(count), state, &options())
            .into_iter()
            .map(|key| key.role)
            .collect()
    }

    #[test]
    fn neo_command_row_and_bottom_targets() {
        let keys = layout(
            &geometry("neo"),
            &snapshot(3),
            &DeckState::default(),
            &options(),
        );
        assert_eq!(keys[0].role, Role::Status);
        assert_eq!(keys[1].role, Role::VolumeToggle);
        assert_eq!(keys[2].role, Role::Empty);
        assert_eq!(keys[3].role, Role::Reply);
        assert_eq!(keys[4].role, Role::Target(TargetKey::User(0)));
        assert_eq!(keys[5].role, Role::Target(TargetKey::User(1)));
        assert_eq!(keys[6].role, Role::Target(TargetKey::Feed(2)));
        assert_eq!(keys[7].role, Role::Empty);
        assert_eq!(keys[0].appearance.subtitle, "ready");
    }

    #[test]
    fn status_shows_production_when_ready() {
        let mut snapshot = snapshot(1);
        snapshot.production = Some("SRF News".into());
        let keys = layout(
            &geometry("neo"),
            &snapshot,
            &DeckState::default(),
            &options(),
        );
        assert_eq!(keys[0].appearance.title, "Cam 1");
        assert_eq!(keys[0].appearance.subtitle, "SRF News");
    }

    #[test]
    fn paging_sits_left_of_reply() {
        let geometry = geometry("mini");
        let mut state = DeckState::default();
        let snapshot = snapshot(7);
        let keys = layout(&geometry, &snapshot, &state, &options());
        assert_eq!(keys[0].role, Role::Status);
        assert_eq!(keys[1].role, Role::NextPage);
        assert_eq!(keys[2].role, Role::Reply);
        assert_eq!(keys[3].role, Role::Target(TargetKey::User(0)));
        assert_eq!(keys[4].role, Role::Target(TargetKey::User(1)));
        assert_eq!(keys[5].role, Role::Target(TargetKey::Feed(2)));
        assert_eq!(page_count(&geometry, 7), 3);
        state.page = 2;
        let keys = layout(&geometry, &snapshot, &state, &options());
        assert_eq!(keys[3].role, Role::Target(TargetKey::User(6)));
        assert_eq!(keys[4].role, Role::Empty);
        assert_eq!(keys[1].appearance.subtitle, "3/3");
    }

    #[test]
    fn volume_layer_overlays_command_row_not_targets() {
        let geometry = geometry("neo");
        let state = DeckState {
            volume_layer: true,
            selected: Some(TargetKey::User(0)),
            ..DeckState::default()
        };
        let keys = layout(&geometry, &snapshot(4), &state, &options());
        assert_eq!(keys[0].role, Role::VolumeToggle);
        assert_eq!(keys[1].role, Role::MuteSelected);
        assert_eq!(keys[2].role, Role::VolumeDown);
        assert_eq!(keys[3].role, Role::VolumeUp);
        assert_eq!(keys[4].role, Role::Target(TargetKey::User(0)));
        assert_eq!(keys[5].role, Role::Target(TargetKey::User(1)));
        assert_eq!(keys[6].role, Role::Target(TargetKey::Feed(2)));
        assert_eq!(keys[7].role, Role::Target(TargetKey::User(3)));
        assert_eq!(keys[4].appearance.bar, Some(0.9));
        assert_eq!(keys[4].appearance.background, palette::SELECTED);
        assert_eq!(keys[1].appearance.subtitle, "T0");
    }

    #[test]
    fn mk2_fills_targets_from_the_bottom() {
        let keys = roles("mk2", 5, &DeckState::default());
        assert_eq!(keys[0], Role::Status);
        assert_eq!(keys[1], Role::VolumeToggle);
        assert_eq!(keys[4], Role::Reply);
        assert_eq!(keys[2], Role::MembersToggle);
        assert_eq!(keys[5], Role::Empty);
        assert_eq!(keys[10], Role::Target(TargetKey::User(0)));
        assert_eq!(keys[11], Role::Target(TargetKey::User(1)));
        assert_eq!(keys[12], Role::Target(TargetKey::Feed(2)));
        assert_eq!(keys[13], Role::Target(TargetKey::User(3)));
        assert_eq!(keys[14], Role::Target(TargetKey::User(4)));
    }

    #[test]
    fn mk2_volume_keeps_reply_when_there_is_room() {
        let state = DeckState {
            volume_layer: true,
            selected: Some(TargetKey::User(0)),
            ..DeckState::default()
        };
        let keys = roles("mk2", 4, &state);
        assert_eq!(keys[0], Role::VolumeToggle);
        assert_eq!(keys[1], Role::MuteSelected);
        assert_eq!(keys[2], Role::VolumeDown);
        assert_eq!(keys[3], Role::VolumeUp);
        assert_eq!(keys[4], Role::Reply);
        assert_eq!(keys[10], Role::Target(TargetKey::User(0)));
    }

    #[test]
    fn plus_bottom_row_matches_dials() {
        let geometry = geometry("plus");
        let state = DeckState::default();
        let snapshot = snapshot(3);
        let keys = layout(&geometry, &snapshot, &state, &options());
        assert_eq!(keys[0].role, Role::Status);
        assert_eq!(keys[1].role, Role::VolumeToggle);
        assert_eq!(keys[3].role, Role::Reply);
        assert_eq!(keys[4].role, Role::Target(TargetKey::User(0)));
        assert_eq!(keys[5].role, Role::Target(TargetKey::User(1)));
        assert_eq!(keys[6].role, Role::Target(TargetKey::Feed(2)));
        assert_eq!(keys[7].role, Role::Empty);
        let encoders = encoder_bindings(&geometry, &state, &snapshot);
        assert_eq!(encoders.len(), 4);
        assert_eq!(binding_target(encoders[0]), Some(TargetKey::User(0)));
        assert_eq!(binding_target(encoders[1]), Some(TargetKey::User(1)));
        assert_eq!(binding_target(encoders[2]), Some(TargetKey::Feed(2)));
        assert_eq!(encoders[3], None);
        assert_eq!(encoder_page_count(&geometry, 12), 1);
    }

    #[test]
    fn plusxl_pages_dials_independently_of_keys() {
        let geometry = geometry("plusxl");
        let mut state = DeckState::default();
        let snapshot = snapshot(20);
        let keys = layout(&geometry, &snapshot, &state, &options());
        assert_eq!(keys[0].role, Role::Status);
        assert_eq!(keys[1].role, Role::VolumeToggle);
        assert_eq!(keys[8].role, Role::Reply);
        assert!(keys.iter().any(|key| key.role == Role::NextEncoderPage));
        assert!(!keys.iter().any(|key| key.role == Role::NextPage));
        let bottom = 3 * 9;
        assert_eq!(keys[bottom].role, Role::Target(TargetKey::User(0)));
        let encoders = encoder_bindings(&geometry, &state, &snapshot);
        assert_eq!(encoders.len(), 6);
        assert_eq!(binding_target(encoders[0]), Some(TargetKey::User(0)));
        assert_eq!(binding_target(encoders[5]), Some(TargetKey::Feed(5)));
        state.encoder_page = 3;
        let encoders = encoder_bindings(&geometry, &state, &snapshot);
        assert_eq!(binding_target(encoders[0]), Some(TargetKey::User(18)));
        assert_eq!(binding_target(encoders[1]), Some(TargetKey::User(19)));
        assert_eq!(encoders[2], None);
        assert_eq!(encoder_page_count(&geometry, 20), 4);
    }

    #[test]
    fn reply_shows_conference_not_caller() {
        let mut snapshot = snapshot(2);
        snapshot.targets[1].key = TargetKey::Conference(1);
        snapshot.targets[1].name = "News".into();
        snapshot.reply_target = Some(TargetKey::User(0));
        snapshot.reply_name = Some("jan".into());
        snapshot.targets[0].name = "jan".into();
        snapshot.incoming = vec![crate::state::IncomingInfo {
            from_name: "jan".into(),
            target: Some(TargetKey::Conference(1)),
        }];
        let keys = layout(
            &geometry("neo"),
            &snapshot,
            &DeckState::default(),
            &options(),
        );
        assert_eq!(keys[3].role, Role::Reply);
        assert_eq!(keys[3].appearance.subtitle, "News");
        assert_ne!(keys[3].appearance.subtitle, "jan");
        assert_eq!(keys[3].appearance.background, palette::INCOMING);
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
        let bottom = 3 * 8;
        assert_eq!(keys[bottom].appearance.badge, Some(Badge::Incoming));
        assert!(keys[bottom].appearance.blink.is_some());
        assert_eq!(keys[bottom + 1].appearance.background, palette::LOCKED);
        assert_eq!(keys[bottom + 2].appearance.background, palette::MUTED);
        assert_eq!(keys[bottom + 2].appearance.badge, Some(Badge::Muted));
    }

    #[test]
    fn pedal_maps_assignable_left_middle_and_reply_right() {
        let keys = layout(
            &geometry("pedal"),
            &snapshot(2),
            &DeckState::default(),
            &options(),
        );
        assert_eq!(keys[0].role, Role::Target(TargetKey::User(9)));
        assert_eq!(keys[1].role, Role::Target(TargetKey::Conference(1)));
        assert_eq!(keys[2].role, Role::Reply);
        assert_eq!(keys[2].appearance.title, "REPLY");
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

    fn conference_snapshot(member_count: usize) -> Snapshot {
        let mut snapshot = snapshot(2);
        snapshot.targets.push(TargetInfo {
            key: TargetKey::Conference(1),
            name: "News".into(),
            can_talk: true,
            online: true,
            held: false,
            locked: false,
            incoming: false,
            receiving: false,
            volume: 0.8,
            muted: false,
            members: (0..member_count)
                .map(|i| crate::state::ConferenceMemberInfo {
                    user_id: i as i64,
                    name: format!("M{i}"),
                    online: i % 2 == 0,
                    receiving: i == 0,
                    volume: 0.8,
                    muted: i == 1,
                })
                .collect(),
        });
        snapshot
    }

    fn member_state(selected: Option<i64>) -> DeckState {
        DeckState {
            member_layer: true,
            member_conference: Some(TargetKey::Conference(1)),
            member_selected: selected,
            ..DeckState::default()
        }
    }

    #[test]
    fn members_key_only_on_wide_command_rows() {
        assert!(has_members_command_key(&geometry("mk2")));
        assert!(has_members_command_key(&geometry("xl")));
        assert!(has_members_command_key(&geometry("plusxl")));
        assert!(!has_members_command_key(&geometry("neo")));
        assert!(!has_members_command_key(&geometry("plus")));
        assert!(!has_members_command_key(&geometry("mini")));
        assert!(!volume_toggle_defers_to_release(&geometry("mk2")));
        assert!(volume_toggle_defers_to_release(&geometry("neo")));
        assert!(volume_toggle_defers_to_release(&geometry("plus")));
        let neo = roles("neo", 3, &DeckState::default());
        assert_eq!(neo[2], Role::Empty);
        assert!(!neo.contains(&Role::MembersToggle));
        let plus = roles("plus", 3, &DeckState::default());
        assert!(!plus.contains(&Role::MembersToggle));
        let xl = roles("xl", 3, &DeckState::default());
        assert_eq!(xl[2], Role::MembersToggle);
        let plusxl = layout(
            &geometry("plusxl"),
            &snapshot(20),
            &DeckState::default(),
            &options(),
        );
        assert_eq!(plusxl[2].role, Role::MembersToggle);
        assert!(plusxl.iter().any(|key| key.role == Role::NextEncoderPage));
    }

    #[test]
    fn member_layer_overlays_command_row_with_members() {
        let snapshot = conference_snapshot(3);
        let state = member_state(Some(0));
        let keys = layout(&geometry("neo"), &snapshot, &state, &options());
        assert_eq!(keys[0].role, Role::MembersToggle);
        assert_eq!(keys[1].role, Role::MuteSelected);
        assert_eq!(keys[2].role, Role::VolumeDown);
        assert_eq!(keys[3].role, Role::VolumeUp);
        assert_eq!(
            keys[4].role,
            Role::Member {
                conference: TargetKey::Conference(1),
                user_id: 0
            }
        );
        assert_eq!(
            keys[5].role,
            Role::Member {
                conference: TargetKey::Conference(1),
                user_id: 1
            }
        );
        assert_eq!(
            keys[6].role,
            Role::Member {
                conference: TargetKey::Conference(1),
                user_id: 2
            }
        );
        assert_eq!(keys[7].role, Role::Empty);
        assert_eq!(keys[4].appearance.background, palette::SELECTED);
        assert_eq!(keys[4].appearance.bar, Some(0.8));
        assert_eq!(keys[5].appearance.badge, Some(Badge::Muted));
        assert_eq!(keys[1].appearance.title, "MUTE");
        assert_eq!(keys[1].appearance.subtitle, "M0");
        assert_eq!(keys[0].appearance.subtitle, "back");
    }

    #[test]
    fn mk2_member_layer_keeps_reply() {
        let snapshot = conference_snapshot(2);
        let keys = layout(
            &geometry("mk2"),
            &snapshot,
            &member_state(Some(1)),
            &options(),
        );
        assert_eq!(keys[0].role, Role::MembersToggle);
        assert_eq!(keys[1].role, Role::MuteSelected);
        assert_eq!(keys[2].role, Role::VolumeDown);
        assert_eq!(keys[3].role, Role::VolumeUp);
        assert_eq!(keys[4].role, Role::Reply);
        assert_eq!(keys[1].appearance.title, "HEAR");
        assert_eq!(keys[1].appearance.subtitle, "M1");
        let bottom = 2 * 5;
        assert_eq!(
            keys[bottom].role,
            Role::Member {
                conference: TargetKey::Conference(1),
                user_id: 0
            }
        );
    }

    #[test]
    fn member_layer_pages_members_not_destinations() {
        let geometry = geometry("neo");
        let snapshot = conference_snapshot(5);
        let mut state = member_state(Some(0));
        assert_eq!(page_count(&geometry, snapshot.targets[2].members.len()), 2);
        let keys = layout(&geometry, &snapshot, &state, &options());
        assert_eq!(
            keys[7].role,
            Role::Member {
                conference: TargetKey::Conference(1),
                user_id: 3
            }
        );
        state.member_page = 1;
        let keys = layout(&geometry, &snapshot, &state, &options());
        assert_eq!(
            keys[4].role,
            Role::Member {
                conference: TargetKey::Conference(1),
                user_id: 4
            }
        );
        assert_eq!(keys[5].role, Role::Empty);
    }

    #[test]
    fn member_and_volume_layers_are_exclusive() {
        let snapshot = conference_snapshot(2);
        let mut state = DeckState {
            volume_layer: true,
            selected: Some(TargetKey::User(0)),
            ..DeckState::default()
        };
        assert!(state.open_member_layer(&snapshot, Some(TargetKey::Conference(1))));
        assert!(state.member_layer);
        assert!(!state.volume_layer);
        assert_eq!(state.member_selected, Some(0));
        state.toggle_volume_layer(&snapshot);
        assert!(state.volume_layer);
        assert!(!state.member_layer);
        let mut expired = DeckState {
            member_layer: true,
            member_layer_touched: Instant::now() - Duration::from_secs(10),
            ..DeckState::default()
        };
        assert!(expired.expire_member_layer(Duration::from_secs(8)));
        assert!(!expired.member_layer);
    }

    #[test]
    fn default_conference_prefers_held_then_populated() {
        let mut snapshot = conference_snapshot(0);
        snapshot.targets.push(TargetInfo {
            key: TargetKey::Conference(2),
            name: "Sport".into(),
            can_talk: true,
            online: true,
            held: false,
            locked: false,
            incoming: false,
            receiving: false,
            volume: 0.5,
            muted: false,
            members: vec![crate::state::ConferenceMemberInfo {
                user_id: 9,
                name: "Jan".into(),
                online: true,
                receiving: false,
                volume: 1.0,
                muted: false,
            }],
        });
        assert_eq!(
            default_member_conference(&snapshot, None),
            Some(TargetKey::Conference(2))
        );
        snapshot.targets[2].held = true;
        assert_eq!(
            default_member_conference(&snapshot, None),
            Some(TargetKey::Conference(1))
        );
        assert_eq!(
            default_member_conference(&snapshot, Some(TargetKey::Conference(2))),
            Some(TargetKey::Conference(2))
        );
    }

    #[test]
    fn plus_member_layer_binds_dials_to_members() {
        let geometry = geometry("plus");
        let snapshot = conference_snapshot(3);
        let state = member_state(Some(0));
        let bindings = encoder_bindings(&geometry, &state, &snapshot);
        assert_eq!(bindings.len(), 4);
        match bindings[0] {
            Some(EncoderBinding::Member { conference, member }) => {
                assert_eq!(conference, TargetKey::Conference(1));
                assert_eq!(member.user_id, 0);
            }
            other => panic!("expected member binding, got {other:?}"),
        }
        assert!(matches!(
            bindings[2],
            Some(EncoderBinding::Member { member, .. }) if member.user_id == 2
        ));
        assert_eq!(bindings[3], None);
    }
}
