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
  consumers, ICE servers, reconnects, tally), the talk state with press-and-hold
  Talk, Lock, volume and mute controls per target, audio devices with an input
  meter, every configured GPIO output (live state) and input (pressed, event
  count), Stream Deck and service details.
- **Stream Deck**: live rendering of the attached deck; keys, dials and touch
  points can be operated from the browser and behave like the hardware.
- **Settings**: every configuration value as a form (audio devices are listed
  from ALSA), plus a raw JSON editor. Saving writes the TOML/JSON file the
  instance was started with; secrets are never shown and stay unchanged unless
  replaced. `Save & restart` applies the change immediately.
- **Restart**: under systemd the service exits cleanly and `Restart=always`
  brings it back; without systemd the binary re-executes itself.

The interface is plain HTTP on the local network. Keep it on the production
LAN or a management network, or put a reverse proxy with TLS in front of it.

## Stream Deck

- Key 0 shows the status (user, connection, `ON AIR` when the camera is
  live). Tap it to clear all talk locks, hold it for two seconds to switch
  page.
- Key 1 is Reply: it shows who is calling and talks back to them.
- The remaining keys are the targets. Hold to talk, tap to toggle a talk
  lock (green with a lock badge). Feeds cannot be talked to; pressing a feed
  toggles its mute.
- `VOL` (right end of the first row) opens the volume layer: tap a target
  to select it, `+` / `−` change its volume, `MUTE` toggles it; holding a
  target key toggles its mute directly. The layer closes after
  `streamdeck.volume_layer_timeout_s`.
- Stream Deck + / + XL: the dials control the targets of the current page
  (turn = volume, press = mute); the touch strip shows the levels and swiping
  it changes page.
- Neo: the two touch points switch pages.
- Pedal: left = reply, middle = `streamdeck.pedal_target`, right = lock
  toggle of that target.

## GPIO

Outputs (`gpio.outputs`): `tally` (camera on air), `talking`, `incoming`,
`connected`, `locked`. Inputs (`gpio.inputs`): `talk` (hold = talk, tap =
lock), `reply`, `lock_toggle`, `clear_locks`, `mute_toggle`, `volume_up`,
`volume_down`. Lines are addressed by kernel name (`GPIO17` on Raspberry Pi
OS) or by `gpio.chip` plus offset.

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
  TURN host's certificate is verified with system roots plus
  `tls.ca_file`; a Talktome `tls.fingerprint_sha256` pin does **not**
  apply to the TURN server.
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
