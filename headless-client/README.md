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

The package creates the `talktome-headless` system user (groups `audio`,
`plugdev`, `gpio`), installs the systemd template
`talktome-headless@.service`, the udev rule for Stream Decks and example
configurations under `/usr/share/talktome-headless/`.

## Configure

One configuration file per instance, JSON or TOML by file extension:

```bash
sudo cp /usr/share/talktome-headless/config.example.toml /etc/talktome-headless/cam1.toml
sudo editor /etc/talktome-headless/cam1.toml
sudo talktome-headless --instance cam1 check-config
```

Minimum content: the server URL, the user's name and password and (for a
self-signed server certificate) `tls.ca_file`, `tls.fingerprint_sha256` or
`tls.insecure = true`. The password can live in
`/etc/talktome-headless/cam1.env` as `TALKTOME_USER_PASSWORD=...` instead of
the configuration file; every `TALKTOME_<SECTION>_<KEY>` variable overrides
the corresponding setting.

Helpers for provisioning:

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

## Web interface

Every instance serves an administration web interface on
`http://<device>:<web.port>/` (default port 8080, `web.bind = "0.0.0.0"`; use
a different port per instance). It is built for phones as much as for
desktops:

- Login is always the user `admin`; the password comes from `web.password` or
  `TALKTOME_WEB_PASSWORD`. The default password `admin` works once and then
  forces a change; the new password is written to the configuration file.
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

## Build from source

```bash
sudo apt install build-essential pkg-config cmake libasound2-dev libudev-dev
cd headless-client
cargo build --release
cargo test
```

The version comes from Git tags through `scripts/resolve-build-version.js`
(`TALKTOME_BUILD_VERSION`); `Cargo.toml` intentionally stays at `0.0.0`.
`cargo deb` builds the package locally; CI builds arm64, armhf and amd64
packages inside Debian Bookworm containers so they run on Bookworm and Trixie.
