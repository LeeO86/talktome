# Talktome Headless Client

`talktome-headless` turns a Raspberry Pi (or any small Linux board) into a
Talktome intercom panel. It logs in as a normal Talktome user over WebRTC,
drives an attached Elgato Stream Deck as the key panel and mirrors camera
tally and talk state to GPIO lines. It is written in Rust and shipped as a
Debian package for arm64, armhf and amd64.

The design and protocol details are in [specification.md](specification.md).

## Install

Download the `.deb` for your architecture from the GitHub release and install
it (dependencies such as `libasound2`, `libudev1` and `fonts-dejavu-core` are
pulled in automatically):

```bash
sudo apt install ./talktome-headless_<version>_arm64.deb
```

The package creates the `talktome-headless` system user and adds it to
`audio`, `plugdev` and `gpio` when those groups already exist (Raspberry Pi
OS has all three; Debian/Ubuntu often has no `gpio`). It installs the
systemd template `talktome-headless@.service`, the udev rule for Stream
Decks and example configurations under `/usr/share/talktome-headless/`.

## Configure

One configuration file per instance, JSON or TOML by file extension:

```bash
sudo cp /usr/share/talktome-headless/config.example.toml /etc/talktome-headless/cam1.toml
sudo editor /etc/talktome-headless/cam1.toml
sudo talktome-headless --instance cam1 check-config
```

`/etc/talktome-headless` is `0770 root:talktome-headless`. Copying the example
as root is fine; the service needs group-write on that directory so the web UI
can save the admin password and settings (it writes `<instance>.toml.tmp` then
renames). The packaged unit also sets `ReadWritePaths=/etc/talktome-headless`
because `ProtectSystem=strict` would otherwise make `/etc` read-only
(`saving the password failed: … Read-only file system`). After upgrading, a
manual drop-in with that path is no longer needed; `systemctl daemon-reload`
and restart the instance.

Minimum content: the server URL, the user's name and password and (for a
self-signed server certificate) `tls.ca_file`, `tls.fingerprint_sha256` or
`tls.insecure = true`. The password can live in
`/etc/talktome-headless/cam1.env` as `TALKTOME_USER_PASSWORD=...` instead of
the configuration file; every `TALKTOME_<SECTION>_<KEY>` variable overrides
the corresponding setting.

Everything else (audio devices, Stream Deck, GPIO lines, volumes, web port)
can be edited afterwards in the web interface (see below) or in the file.
Helpers for provisioning on the command line:

```bash
talktome-headless list-audio-devices   # ALSA ids for audio.input_device / output_device
talktome-headless list-streamdecks     # attached decks with serial numbers
talktome-headless list-gpio            # GPIO chips and line names (GPIO17, ...)
```

Create the user in Talktome Admin like any other operator and assign its
targets (users, conferences, feeds). The order of the targets in Admin is the
order of the keys on the deck.

## Run

```bash
sudo systemctl enable --now talktome-headless@cam1
journalctl -u talktome-headless@cam1 -f
```

Several instances can run on one device (for example two GPIO-only panels):
create `cam2.toml`, give it its own user, audio devices and GPIO lines, and
start `talktome-headless@cam2`. When more than one Stream Deck is attached,
bind each instance with `streamdeck.serial`.

`GET http://127.0.0.1:<health.port>/healthz` returns `200` while the client
is registered and both media transports are connected, otherwise `503`.

### Service exits 216/GROUP

`Failed to determine supplementary groups` / `status=216/GROUP` happens
**before** the binary or `default.toml` is read. systemd is looking up a
group named in `SupplementaryGroups=` that this machine does not have —
almost always `gpio`. The instance name `default` is fine; this is not a
bad config. Current packages do not list those groups on the unit.

Until you upgrade, clear the stale list (membership in `/etc/group` still
applies):

```bash
sudo mkdir -p /etc/systemd/system/talktome-headless@.service.d
sudo tee /etc/systemd/system/talktome-headless@.service.d/groups.conf >/dev/null <<'EOF'
[Service]
SupplementaryGroups=
EOF
sudo systemctl daemon-reload
sudo systemctl reset-failed talktome-headless@default
sudo systemctl start talktome-headless@default
```

`getent group audio plugdev gpio` shows which of those names exist. Do not
`addgroup gpio` just to silence this unless you actually have GPIO devices
and udev rules that use that group.

## Web interface

Every instance serves an administration web interface on
`http://<device>:<web.port>/` (default port 8080, `web.bind = "0.0.0.0"`; use
a different port per instance). It is built for phones as much as for
desktops:

- Login is always the user `admin`; the password comes from `web.password` or
  `TALKTOME_WEB_PASSWORD`. The default password `admin` works once and then
  forces a change (that dialog is not the login overlay). The new password is
  written to the configuration file; saving Settings does the same rewrite.
- **Status**: Talktome connection (state, server, user, production, transports,
  consumers, ICE servers, RTT, packet loss, receive concealment, reconnects,
  tally), the talk state with press-and-hold Talk, Lock, volume (dB) and mute
  controls per target (Talk/Lock disabled when that user is offline), audio
  devices with an input meter, every configured GPIO output (live state) and
  input (pressed, event count), Stream Deck and service details.
- **Stream Deck**: live rendering of the attached deck; keys, dials and touch
  points can be operated from the browser and behave like the hardware.
- **Settings**: every configuration value as a form (audio devices are listed
  from ALSA), plus a raw JSON editor. Saving writes the TOML/JSON file the
  instance was started with and keeps other file values even if the process
  has not restarted yet; secrets are never shown and stay unchanged unless
  replaced. `Save & restart` applies the change immediately.
- **Restart**: under systemd the service exits cleanly and `Restart=always`
  brings it back; without systemd the binary re-executes itself.

The interface is plain HTTP on the local network. Keep it on the production
LAN or a management network, or put a reverse proxy with TLS in front of it.

On a wide screen the Talk destinations fill a wrapping grid so you do not
have to zoom out; Settings sections sit two-across until one is opened.
Phones keep a single column.

## Testing without hardware (OrbStack VM, CI, a board with no deck)

A USB Stream Deck does not pass through an OrbStack Linux VM. Use a dummy
deck of a chosen type, then operate it from the **Stream Deck** tab (or
write input lines for scripts):

```toml
# /etc/talktome-headless/default.toml
[streamdeck]
enabled = true
mock = "mk2"          # mini, xl, plus, neo, pedal, …
```

Or in `/etc/talktome-headless/default.env` (overrides the file):

```bash
TALKTOME_STREAMDECK_MOCK=mk2
# older name, still works:
# TALKTOME_MOCK_STREAMDECK=mk2
```

Save & restart. The web Stream Deck view renders the keys; taps talk/lock
like hardware. Optional file input: `TALKTOME_SURFACE_MOCK_DIR=/tmp/tt` and
append lines such as `down 3` / `up 3` to `$TALKTOME_SURFACE_MOCK_DIR/streamdeck-inputs`.

With no Talktome server (so no live targets), mock decks can still show a
layout using `TALKTOME_DEMO_TARGETS=adi,beni,conference:News,feed:Virus`
and `TALKTOME_DEMO_REPLY=News`. Those names are paint-only and disappear as
soon as the client receives real targets.

The VM also has no USB headset. Capture a 440 Hz sine instead of a
microphone, and optionally write the mix to a WAV file:

```toml
[audio]
input_device = "tone"                 # or tone:1000 for 1 kHz
output_device = "wav:/tmp/heard.wav"  # skip if Pulse/ALSA playback works
```

`talktome-headless --instance default dev send-tone --target conference:1`
sends that sine to a target for 10 s using the running account.

GPIO lines from the example config (`GPIO17`, …) do not exist in OrbStack.
Turn GPIO off (`gpio.enabled = false`) or you will see `GPIO line "GPIO27"
not found on any chip`.

## Audio processing (AEC / NS / AGC)

The browser client asks `getUserMedia` for `echoCancellation`,
`noiseSuppression` and `autoGainControl` — those run in Chrome/Safari, not
on the server. The headless client runs the same algorithm family
**in-process** with [sonora](https://crates.io/crates/sonora) (WebRTC M145
AEC3, Wiener noise suppression, AGC2, high-pass). Turn it on with
`audio.auto_processing = true` or the admin **Audio auto processing**
toggle for this user (`audioAutoProcessing`). While it is on, manual
`audio.input_gain_db` is ignored (AGC sets the level). Echo cancellation
only runs when both capture and playback are real ALSA devices — `tone`
and `wav:` skips AEC. Optional `audio.stream_delay_ms` overrides the
estimated loudspeaker-to-mic delay if residual echo remains.

## Conference member mix

Like the web client, each conference card has **Members**: hear/mute and a
level per person. That is a local mix of the conference consumers, not a
server-side mute. The conference fader still scales the whole conference.

## Stream Deck

- The top row is the command row: **status** (user name and production) at
  the left, **VOL** next to it, **NEXT** (when there are more targets than
  keys) one left of **Reply**, and **Reply** at the far right. Reply shows
  the conference (or target) being talked to, not the caller name.
- Remaining keys are targets in the same order as the web client: **left to
  right, top to bottom**. If there are fewer targets than keys, used rows sit
  on the **lowest available rows** (empty rows above the block). Hold to talk,
  tap to toggle a talk lock (purple with a lock badge). Feeds cannot be talked
  to; pressing a feed toggles its mute.
- `VOL` opens the volume layer: mute / − / + occupy the command row (on a
  Neo the whole top row becomes VOL, MUTE, −, +) and **targets do not
  move**. Tap a target to select it. Steps use `streamdeck.volume_step_db`
  (default 3 dB). The layer closes after
  `streamdeck.volume_layer_timeout_s`.
- Conference **member mix** uses the same overlay pattern. **MEMBERS** is
  added on decks that still have a free command-row cell (MK.2, Original,
  XL, Plus XL). Neo / Mini / Plus open the layer with a **long-press on
  VOL**; Stream Deck + / + XL also open it with a **long-press on a
  conference dial**. Target keys then show that conference's members
  (select, MUTE/HEAR, − / +). The layer is exclusive with volume and uses
  the same timeout.
- Stream Deck +: the four dials control the same targets as the four keys
  above them (the bottom row of the current page). No separate dial paging.
- Stream Deck + XL: six dials can be paged independently (**DIALS** on the
  command row, or swipe the strip) so every target's volume can be adjusted.
  The web UI shows which target each dial currently controls.
- Neo: the two touch points switch key pages.
- Pedal: right = reply; left and middle are assignable (see **Pedal layout
  JSON** below).
- Several decks can run in one instance via `[[streamdeck.devices]]`
  (mixed models are allowed). Bind real hardware with `serial`.

### Pedal layout JSON

Visual decks (MK.2, Mini, XL, Plus, Neo, …) always place targets from the
production list. `streamdeck.layout` does **not** move those keys, command
keys, or dials.

On a **Stream Deck Pedal** the object pins the left and middle foot
switches to a specific user, conference, or feed:

```json
{
  "streamdeck": {
    "layout": {
      "0": "user:4",
      "1": "conference:1"
    }
  }
}
```

```toml
[streamdeck.layout]
"0" = "user:4"
"1" = "conference:1"
```

| Key | Switch | Dedicated field (used if that key is missing or invalid) |
| --- | --- | --- |
| `"0"` | Left | `streamdeck.pedal_left` |
| `"1"` | Middle | `streamdeck.pedal_target` |
| (not settable) | Right | Always **Reply** |

Values are the same target strings as GPIO / VOX: `user:<id>`,
`conference:<id>` (or `conf:<id>`), `feed:<id>`. IDs are the Talktome
server numeric ids. Layout JSON wins over the dedicated pedal fields.

**What this is for:** keep a camera pedal on one IFB or conference even
when the web-client target order changes; put two destinations on left and
middle; assign a listen-only feed (press mutes/unmutes). An unknown or
offline target still occupies the switch (the web mock shows the id in
dim text). Clear both the JSON key and the dedicated field to leave a
switch empty.

**What it cannot do:** rearrange MK.2 / XL / Neo keys, override Status /
VOL / MEMBERS / NEXT / Reply, or change the Pedal right switch. Extra
indexes in the object (`"5"`, `"10"`, …) are stored but ignored.

**With several decks**, put the map on that device. A non-empty
`streamdeck.devices` list does **not** inherit top-level `layout` /
`pedal_left` / `pedal_target`:

```toml
[[streamdeck.devices]]
mock = "pedal"
layout = { "0" = "user:4", "1" = "conference:1" }
```

## GPIO

Outputs (`gpio.outputs`): `tally` (camera on air), `talking`, `incoming`,
`connected` (only while registered **and** both media transports are up),
`locked`. Extra `[[gpio.target_outputs]]` rows drive a pin when a chosen
user, conference or feed is playing audio (`when = "receiving"`) or is
addressing this client (`when = "incoming"`). Inputs (`gpio.inputs`):
`talk` (hold = talk, tap = lock), `reply`, `lock_toggle`, `clear_locks`,
`mute_toggle`, `volume_up`, `volume_down`. After requesting input lines the
client samples the current level, so an already-held inverted button starts
talking immediately instead of waiting for the next edge. Lines are
addressed by kernel name (`GPIO17` on Raspberry Pi OS) or by `gpio.chip`
plus offset. Volume +/− steps use `streamdeck.volume_step_db`.

## Diagnostics without hardware

```bash
# Send a 440 Hz tone to a target for 10 s using the configured account
talktome-headless --instance cam1 dev send-tone --target conference:1

# Record everything addressed to this user for 15 s
talktome-headless --instance cam1 dev record --out /tmp/heard.wav
```

`audio.input_device = "tone"` and `audio.output_device = "wav:/tmp/out.wav"`
do the same inside the running service.

## Media / ICE troubleshooting

The client registers as a normal user, then fails media setup if it cannot
parse the server's ICE candidates or reach the media ports:

- `setting remote answer: parse addr: invalid IP address syntax` — the
  server announced a **hostname** (or a bracketed IPv6 literal) as the
  WebRTC address. Current builds resolve hostnames to A/AAAA before
  applying the SDP. Check `journalctl` for `ice-candidate-resolved` /
  `send-ice-candidates`.
- `Unable to handle URL in gather_candidates_relay turns:…?transport=tcp`
  — webrtc-ice cannot speak TURNS. Current builds bridge those URLs to a
  local UDP TURN façade (`turn-bridge-listen`, `ice-url-rewritten`). The
  status page then shows `turn:127.0.0.1:<ephemeral>?transport=udp` as
  **ICE (webrtc)** — that is not a bundled TURN server and not an extra
  network hop. webrtc-ice only speaks TURN-over-UDP, so the process
  listens on localhost and forwards STUN/ChannelData over TCP/TLS to the
  real `turns:` host. Media still goes to that TURN server; localhost is
  only the façade. **ICE (server)** lists the original URLs.
- `could not listen udp fe80::… Invalid argument` and `No available ipv6
  IP address found` — IPv6 link-local gathering. Leave `ice.ipv6` off
  unless this device has a global IPv6 address.
- Direct UDP to the server's announced IP still works when that IP is
  reachable (ICE-lite). TURN is required when the announced address is
  not reachable from the device (different network, UDP blocked, or
  `iceTransportPolicy=relay`).

## Build from source

```bash
sudo apt install build-essential pkg-config cmake libasound2-dev libudev-dev
cd headless-client
cargo build --release
cargo test
```

The version comes from Git tags through `scripts/resolve-build-version.js`
(`TALKTOME_BUILD_VERSION`); `Cargo.toml` intentionally stays at `0.0.0`.
`cargo install cargo-deb` once, then `scripts/build-deb.sh` builds the package
for the host (or `scripts/build-deb.sh aarch64-unknown-linux-gnu` with a
multiarch cross toolchain, see the comments in the script). The
`Headless Client Builds` GitHub workflow (`.github/workflows/headless-client-release.yml`)
builds arm64, armhf and amd64 packages inside Debian Bookworm containers so
they run on Bookworm and Trixie, and attaches them to the draft release for
every `v*` tag.
