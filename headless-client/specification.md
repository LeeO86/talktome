# Talktome Headless Client — Specification

`headless-client/` is a **Rust** Talktome endpoint for small Linux boards
(Raspberry Pi first) that behaves like a normal Talktome *user* without a
browser: it talks and listens over the same WebRTC path browsers use, is
driven from a directly attached Elgato Stream Deck and/or GPIO buttons, and
drives GPIO outputs for the user's camera tally. It is packaged as a Debian
package (`talktome-headless`) for arm64, armhf and amd64.

This document replaces the earlier Node-oriented draft. Decisions that were
taken during review are recorded in §19.

---

## 1. Context and goals

Talktome already has three kinds of endpoints:

- the **browser client** (`public/client.js`) — a normal user over Socket.IO
  signalling and mediasoup `WebRtcTransport`s;
- the **Bridge** (`bridge-client/`) — a Tauri/Rust desktop app that uses the
  bridge HTTP/SSE API and *plain RTP* (`PlainTransport`, unencrypted) to
  connect studio audio interfaces, NDI and OMT;
- the **radio gateway** (`gateway/radioGateway.js`) — a single-file Node
  script that registers with the admin API key and `force: true`, also over
  plain RTP, for a stationary radio interface.

The headless client fills the remaining gap: a **dedicated hardware
intercom panel / beltpack** that is a first-class Talktome user. It must:

1. Run headless on a Raspberry Pi (or similar) under systemd, without a
   display, keyboard or webview.
2. Register as a **normal user** (`kind: "user"`) with the user's own
   credentials — not with the admin API key and not as a bridge port — so
   that everything the server does for a user (target routing, reply,
   talk lock, camera tally, Companion targeting, per-target volume feedback)
   works unchanged.
3. Use **WebRTC** (ICE + DTLS-SRTP) exactly like the browser, including the
   deployment's **STUN/TURN** servers and `iceTransportPolicy`, so it works
   from **mobile networks** (LTE, roaming Wi-Fi, carrier-grade NAT).
4. Present the user's **targets** (users, conferences, feeds) on a directly
   attached **Stream Deck**: hold a key to talk, tap to lock, adjust volume
   and mute per target, see who is calling and whether the camera is on air.
5. Bring the user's **camera tally** and talk/incoming state to **GPIO
   outputs**, and accept PTT/lock/reply on **GPIO inputs**.
6. Support **several independent instances on one device** (one special
   case: two GPIO-only instances, no Stream Deck). The normal deployment is
   one instance per device.
7. Be built and released by CI as **`.deb` packages** for the Raspberry Pi
   OS variants in use (arm64, armhf) plus amd64 for testing on a PC.
8. Require **no Talktome server changes** for the first release.

## 2. Non-goals

- No changes to `gateway/radioGateway.js`, the Bridge or the server.
- No Companion-specific HTTP endpoint on the device. Bitfocus Companion
  connects to the *server* and targets the user; the server forwards
  `api-talk-command` / `api-target-audio-command` to the user's socket and
  this client executes them (§9.4). This keeps a TX-keying surface off the
  device and needs no extra token.
- No cloud/remote management. Configuration is a file under
  `/etc/talktome-headless/` plus environment overrides (§12); the local web
  interface (§13.1) edits that file.
- No video, no data channels, no NDI/OMT.
- No ICE restart. The server does not expose `transport.restartIce()` and
  the browser client does not use it either; recovery is by recreating the
  transports (§6.6). Adding a `restart-ice` event server-side is an
  optional follow-up (§18).

---

## 3. Architecture

```text
                 +--------------------------------------------------+
                 |             talktome-headless (1 instance)        |
                 |                                                  |
   Stream Deck   |  surfaces::streamdeck ----+                      |
   (USB HID) <-->|  surfaces::gpio ----------+--> talk (targets,    |
   GPIO in/out<->|                           |    hold/lock/reply,  |
                 |                           |    per-target audio) |
                 |                           |        |      |      |
                 |     signalling <----------+--------+      |      |
                 |     (Socket.IO v4 client,                 |      |
                 |      login, register-user,                |      |
                 |      reconnect)                           v      |
                 |          ^                    rtc (webrtc-rs:    |
                 |          |                    send PC + recv PC, |
                 |          |                    remote_sdp, ortc)  |
                 |          |                         ^   |         |
                 |          |                         |   v         |
                 |          |                    audio (cpal ALSA,  |
                 |          |                    opus, jitter,      |
                 |          |                    mixer, VOX)        |
                 |     health (sd_notify, /healthz, tracing)        |
                 +----------|------------------------|--------------+
                            |  wss:// Socket.IO      |  SRTP over ICE (UDP/TCP, TURN)
                            v                        v
                       Talktome server (Socket.IO + mediasoup WebRtcTransport)
                            ^
                            |  REST /api/v1/companion/... (Companion, optional)
                       Bitfocus Companion
```

Repository layout (standalone crate, like `bridge-client/src-tauri`):

```text
headless-client/
  Cargo.toml                       # bin "talktome-headless", [package.metadata.deb]
  build.rs                         # embeds the build version (§14.3)
  specification.md                 # this document
  README.md                        # install / run / configure
  src/
    main.rs                        # CLI (clap): --instance, --config, --check-config, --version
    config.rs                      # schema, JSON/TOML loading, env overrides, validation
    signalling/
      socketio.rs                  # minimal Socket.IO v4 / Engine.IO v4 client (WebSocket, rustls)
      session.rs                   # login, register-user, reconnect, conflict policy, event routing
    rtc/
      mod.rs                       # transports lifecycle, produce/consume, recovery
      remote_sdp.rs                # mediasoup params -> SDP for webrtc-rs
      ortc.rs                      # local SDP -> rtpParameters / rtpCapabilities
    audio/
      capture.rs playback.rs       # cpal (ALSA) streams, device selection, hot-plug recovery
      codec.rs                     # Opus encode/decode (libopus, static)
      jitter.rs                    # per-consumer adaptive jitter buffer
      mixer.rs                     # per-source gain/mute/dim, sum to output
      vox.rs                       # level trigger (RMS, hysteresis, hang)
    talk.rs                        # target model, hold/lock/reply, Companion commands, audio state
    surfaces/
      mod.rs                       # Surface trait + event bus
      streamdeck/{mod,layout,render}.rs
      gpio.rs
      mock.rs                      # test backends (PNG keys / in-memory lines)
    health.rs                      # sd_notify + watchdog, /healthz, structured logging
    web/                           # admin web interface (axum): auth, status, config, deck view
      mod.rs auth.rs config_api.rs
      assets/{index.html,style.css,app.js}
  deploy/
    systemd/talktome-headless@.service
    udev/60-talktome-streamdeck.rules
    config.example.json
    config.example.toml
  debian/
    postinst prerm                 # system user, groups, udev reload
```

Crates: `tokio`, `webrtc` (webrtc-rs), `tokio-tungstenite` + `rustls`,
`reqwest` (rustls), `serde`/`serde_json`/`toml`, `cpal`, `opus` (static
libopus via `opusic-sys`), `rubato`, `elgato-streamdeck` (+ `image`,
`ab_glyph`), `gpiocdev`, `axum`, `sd-notify`, `tracing`, `clap`. TLS is
rustls everywhere; the binary has no OpenSSL dependency.

---

## 4. Identity and authentication

The server (`serverCore.js`, `register-user`) accepts a user registration
only if the socket carries one of:

- a browser session cookie whose `kind`/`userId` match, or
- Companion auth in the Socket.IO handshake (`auth.token` / `auth.apiKey`,
  `Authorization: Bearer`, `x-api-key`): either the **global Companion API
  key** (may register *any* user — the gateway shortcut) or a **user-scoped
  token** from `POST /api/v1/companion/auth/login` that may register only
  that user.

The headless client uses the **user-scoped token**:

```text
config: server.url, user.name, user.password
        |
POST {url}/api/v1/companion/auth/login { name, password }
        |  -> { token, expiresInMs (12 h), user: { id, name, ... }, productions: [...] }
        v
Socket.IO connect (wss, default namespace) with auth: { token }
        |
register-user { id: user.id, name: user.name, kind: "user", force, productionId }
        |
   +----+------------------+--------------------------+
   | accepted (ack has no  | { conflict: true,        | { error }
   |  error/conflict)      |   existing: {socketId,   |  -> log `registration-error`,
   |                       |   name} }                |     back off, re-login if it
   v                       v                          |     looks like an auth error
 running            conflict policy (below)           v
```

- Tokens live in server memory for 12 h and vanish on a server restart. A
  failed connect / `register-user` error `Authenticated identity does not
  match registration` triggers a fresh login. The password is therefore
  required in the config; there is no long-lived device token in the
  server today (follow-up in §18).
- No admin API key is stored on the device.
- **Conflict policy** (`registration.conflict`):
  `takeover` (default): wait `registration.takeover_delay_ms` (default
  1500) and retry with `force: true`; the previous session receives
  `session-kicked { reason: "duplicate-login" }`. This is correct for a
  dedicated panel account that must always be online.
  `wait`: retry without `force` every `registration.retry_ms` (default
  5000) until the other session disappears; surfaces show a "conflict"
  state meanwhile.
- If this instance itself receives `session-kicked`, it stops media,
  shows "kicked" on the surfaces and, under `takeover`, retries after
  `registration.kicked_retry_ms` (default 10000) so two panels
  misconfigured with the same account do not flap every second.
- `productionId`: from `user.production` (name or id) if set, otherwise
  `null` (server picks the Default production). `active-production-reset`
  and `available-productions-updated` are honoured by reloading targets.

---

## 5. Signalling (Socket.IO)

The client implements the subset of Socket.IO v4 / Engine.IO v4 that the
server uses: WebSocket transport only, default namespace, JSON events,
acknowledgements, ping/pong. Connection URL:
`wss://host:port/socket.io/?EIO=4&transport=websocket`.

Events **sent** by the client (all with ack unless noted):

```text
register-user            { id, name, kind:"user", force, productionId }
get-router-rtp-capabilities            -> RtpCapabilities
create-send-transport    null          -> { id, iceParameters, iceCandidates, dtlsParameters,
                                            iceServers, iceTransportPolicy }
create-recv-transport    null          -> same shape
connect-send-transport   { dtlsParameters }        -> {} | { error }
connect-recv-transport   { dtlsParameters }        -> {} | { error }
produce                  { kind:"audio", rtpParameters, appData:{ type:"talk" } } -> { id }
pause-producer           { producerId }             -> {} | { error }
resume-producer          { producerId }             -> {} | { error }
producer-close           { producerId }             -> {}
consume                  { producerId, rtpCapabilities } -> { id, producerId, kind, rtpParameters }
resume-consumer          { consumerId }             -> {} | { error }
close-consumer           { consumerId }             -> {}
request-active-producers (no payload)  -> [ { peerId, speakerUserId, producerId, appData } ]
talk-targets-updated     { reason, targets:[{type,id}] }             (no ack)
ptt-state                { talking, lockActive, target, targets, reason } (no ack)
target-audio-state-snapshot { reason, states:[{targetType,targetId,volume,muted}] } (no ack)
api-talk-command-result / api-target-audio-command-result
                         { commandId, ok, reason, action, targetType, targetId, target,
                           targets, talking, lockActive }              (no ack)
set-active-production    { productionId }           -> {} | { error }
user-audio-settings-update { settings }             -> { ok, settings }
user-logout              (no payload, on clean shutdown)
```

Events **received**:

```text
new-producer        { peerId, speakerUserId, producerId, appData }
                    appData is what the *recipient* should see:
                    { type:"user", id:<speakerUserId>, targetPeer } for direct talk,
                    { type:"conference", id } or { type:"feed", id }
producer-closed     { peerId, speakerUserId, producerId, appData }
consumer-closed     { consumerId }
incoming-talk-state { state: { addressedNow:[{ fromUserId, fromName, targetType, targetId,
                      replyTargetType, replyTargetId, canReply, at }], replyTarget } }
user-list           [ { socketId, userId, feedId, guestId, kind, name } ]   (online peers)
user-targets-updated (no payload; reload targets via REST)
conference-list     [...]  conference-members-updated  available-productions-updated
active-production-reset { productionId }
cut-camera          <bool>   (sent at registration and on every change)
session-kicked      { reason, bySocketId }
api-talk-command    { commandId, action:"press"|"release"|"lock-toggle", targetType, targetId, inputKey }
api-target-audio-command { commandId, action:"volume-up"|"volume-down"|"mute-toggle",
                           targetType, targetId, step }
```

REST (with `Authorization: Bearer <token>` where the server checks it):

```text
POST /api/v1/companion/auth/login                      { name, password }
GET  /users/:id/targets?includeMemberships=1&productionId=<id>
     -> [ { targetType:"user"|"conference"|"feed", targetId, name, canTalk, members[], ... } ]
        in the admin-defined button order (same order as the browser's number keys)
GET  /users/:id/productions                            -> [ { id, name } ]
```

Reconnect: exponential backoff 1 s → 30 s with jitter. On reconnect the
client re-logs-in if the token is rejected, re-registers, and rebuilds the
media state from scratch (§6.6) — the same behaviour as the browser after a
socket loss.

---

## 6. WebRTC transport

### 6.1 Engine

`webrtc` (webrtc-rs). Chosen over `str0m` because it ships a full ICE agent
with **TURN** (UDP/TCP/TLS, `relay` policy) and candidate re-gathering,
which is exactly the mobile-network requirement, at the cost of speaking
SDP to it. str0m's `DirectApi` would have avoided SDP but needs a
hand-built TURN client; it remains the fallback if webrtc-rs proves too
heavy on armhf (the transport is behind a small trait).

### 6.2 Mapping mediasoup signalling to SDP

mediasoup is **ICE-lite** and signals ORTC-style parameters, not SDP.
`rtc::remote_sdp` reproduces what `mediasoup-client`'s `RemoteSdp` does:

- **Send transport**: create `RTCPeerConnection` (Opus-only
  `MediaEngine`, header extensions registered from router capabilities),
  add the local audio track, `create_offer()`, extract `rtpParameters`
  from the local SDP (`rtc::ortc`: `mid`, `ssrc`, `cname`, Opus PT,
  header-extension ids, `rtcp.mux/reducedSize`), then synthesise the
  **answer**: `a=ice-lite`, `a=ice-ufrag/pwd` from `iceParameters`,
  `a=candidate` lines from `iceCandidates` (udp and tcp), `a=fingerprint`
  from `dtlsParameters.fingerprints` (sha-256 preferred), `a=setup:passive`
  (client is DTLS client), `a=rtcp-mux`, `a=rtcp-rsize`, `a=recvonly`,
  same PT/extension ids as the offer. `connect-send-transport` is sent with
  `dtlsParameters: { role: "client", fingerprints: [local] }` when the
  first offer is created (`produce` follows once the ack arrives).
- **Receive transport**: the remote is the offerer. For each `consume`
  ack, `remote_sdp` adds an `m=audio` section (`a=mid`, `a=sendonly`,
  `a=ssrc`/`cname` from `rtpParameters.encodings`/`rtcp`, PT/extensions
  from `rtpParameters`) and applies it via `set_remote_description(offer)`
  → `create_answer()` → `set_local_description()`. Closed consumers become
  `port 0`/inactive sections so mids stay stable.
- `rtpCapabilities` sent in `consume` are the router capabilities filtered
  to Opus and the extensions webrtc-rs registered.

### 6.3 ICE configuration

`iceServers` and `iceTransportPolicy` from the `create-*-transport` ack
are passed through to `RTCConfiguration` (`relay` → `RTCIceTransportPolicy::Relay`).
Optional overrides in config (`ice.servers`, `ice.transport_policy`) exist
for testing only; by default the client uses whatever the server hands to
browsers.

### 6.4 Producer

One "warm" Opus producer with `appData: { type: "talk" }`, created paused
right after the send transport connects (like `ensureWarmTalkProducer` in
the browser). Talking = `resume-producer`; silence = `pause-producer`. The
producer is also paused locally (no RTP written) so no audio leaks while
the server-side pause is in flight.

### 6.5 Consumers

`new-producer` (and the initial `request-active-producers` list) →
`consume` → `resume-consumer`. Each consumer is a `TrackRemote`; RTP is
read, depacketized and handed to `audio::jitter` keyed by the recipient
appData (`user:<speakerUserId>`, `conference:<id>`, `feed:<id>`), which is
also the key for volume/mute (§9.3). `producer-closed`/`consumer-closed`
tear the consumer down. `request-active-producers` is re-sent after every
`incoming-talk-state` with a non-empty `addressedNow` and every
`user-targets-updated`, as the browser does.

### 6.6 Recovery on network change

Trigger: ICE connection state `failed`, or `disconnected` for longer than
`network.ice_disconnect_grace_ms` (default 4000), on either peer
connection; or Socket.IO disconnect. Action: close both peer connections
(the server closes its transports on socket disconnect or on the next
transport creation), then `create-send-transport` … `produce` … and
re-consume everything from `request-active-producers`. Talk state is
preserved: if a key is still held or locked when recovery completes, the
new producer is resumed and `talk-targets-updated` re-sent. Typical
recovery time on LTE→Wi-Fi is one ICE gathering + DTLS round trip.

### 6.7 Interop notes (from the spike, §15 step 1)

Verified end to end against the repo's server (`node server.js`, mediasoup
3.x) with `talktome-headless dev send-tone` on one user and `dev record` on
another: a 440 Hz tone produced by the Rust client was received, decoded and
written to WAV by the second instance (289 packets for a 6 s tone; the first
~200 ms are lost while ICE/DTLS complete, as in a browser).

- Engine: `webrtc` crate **0.17.x** (pion-derived API). The 0.20+ line is a
  new sans-IO rewrite with a different API; it is the future migration
  target but was not used.
- Opus payload type: taken from the router's `preferredPayloadType`
  (100 on this server) and registered as webrtc-rs' codec PT, so no PT
  mapping is needed for produce or consume.
- Header extensions: webrtc-rs assigns its own ids in the send offer
  (`sdes:mid`, `ssrc-audio-level`, `abs-send-time`, `transport-cc`); the
  `produce` parameters use those local ids. For consumers the router's
  preferred ids (`mid`=1, `abs-send-time`=4, `ssrc-audio-level`=6 here) are
  echoed into our remote offer and adopted by webrtc-rs as answerer.
- DTLS roles: send transport = local offer `actpass`, synthesized answer
  `passive`, `connect-send-transport { role: "client" }`. Receive transport
  = synthesized offer `actpass`; **webrtc-rs must be forced to answer as
  DTLS client** (`SettingEngine::set_answering_dtls_role(Client)`) because
  it otherwise answers an `a=ice-lite` offer with `setup:passive` while we
  tell mediasoup we are the client — both sides then wait for a ClientHello.
- ICE: webrtc-rs discards STUN responses whose source address differs from
  the signalled candidate. The server's announced address therefore has to
  be the address it actually replies from (the README's LAN-IP rule); a
  server announcing `127.0.0.1` while bound on another interface never
  connects.
- Renegotiation on the receive transport (new remote offer per consumer,
  answer, `connect-recv-transport` once) works; `on_track` fires with the
  consumer's SSRC.

---

## 7. Audio pipeline

- **Devices**: `cpal` on ALSA; `audio.input_device` / `audio.output_device`
  are ALSA names as listed by `talktome-headless --list-audio-devices`
  (e.g. `plughw:CARD=Headset,DEV=0`). A Pi's headphone jack has no input;
  a USB headset or USB audio interface is expected.
- **Capture**: mono, device rate → `rubato` → 48 kHz, input gain
  (`audio.input_gain_db`, default from the user's `userInputGainDb`
  semantics: 0 dB unless configured), RMS level for VOX and meters.
- **Encode**: libopus 48 kHz mono, `application = voip`, frame size
  `audio.profile` = `standard` (20 ms, FEC on, 64 kbit/s) by default; `low`
  (10 ms) and `ultra-low` (5 ms) mirror `QUALITY_PROFILES` in
  `public/client.js` for LAN use. Frames go to a `TrackLocalStaticSample`.
- **Decode**: per consumer, RTP → Opus decode with PLC/FEC → jitter buffer
  (`audio.jitter_min_ms` 20 … `audio.jitter_max_ms` 120, adaptive) → mixer.
- **Mixer**: `out = Σ source_i × volume_i × (muted_i ? 0 : 1) × dim_i`,
  soft-clipped. `dim_i` implements `dimFeedsWhileSpeaking` (feeds dimmed by
  `audio.dim_db`, default −14 dB, while the user talks) and
  `dimWhenAddressed` (feeds dimmed while `addressedNow` is non-empty).
- **Playback**: 48 kHz → device rate, stereo or mono as the device offers
  (mono mix duplicated).
- **VOX** (`vox.enabled`, `vox.target`, `vox.threshold_db`,
  `vox.hang_ms`): a level trigger that acts like holding a key for the
  configured target; mirrors `voiceTriggerEnabled/Target/ThresholdDb`.
- **Hot-plug**: if a stream errors or the device disappears, the pipeline
  keeps running (silence in, drop out) and retries opening the device every
  `audio.reopen_ms` (default 2000); surfaces show "no audio device".
- **Echo**: not handled. Panels are used with headsets; the server never
  sends a user's own producer back to them.

---

## 8. Talk model

Targets come from `GET /users/:id/targets?includeMemberships=1` in the
admin-defined order; online state per target from `user-list`. A target is
one of `user:<id>`, `conference:<id>`, `feed:<id>` (feeds are listen-only,
`canTalk: false`), plus the virtual **reply** target.

- **Hold** a talk key → `talk-targets-updated { targets: [t] }` then
  `resume-producer`; release → `pause-producer` then
  `talk-targets-updated { targets: [] }` (unless other keys are still held
  or locked, in which case the target list is re-sent without it).
  Multiple simultaneously held keys talk to the union of their targets.
- **Tap** (press and release within `talk.tap_ms`, default 250 ms) → toggle
  a **talk lock** on that target. Locks keep the producer resumed. If
  `talk.lock_multiple` is false (mirrors `lockMultipleTargets`), locking a
  new target clears the previous lock. Any press-and-hold while locks are
  active adds to the target list; release restores the locked set. A
  dedicated "clear locks" action exists for GPIO and the deck status key.
- **Reply** → talks to `incoming-talk-state.state.replyTarget` (falls back
  to the most recent `addressedNow` entry); no target → no-op with an
  error flash.
- `ptt-state { talking, lockActive, target, targets, reason }` is emitted on
  every change, mirroring the browser, so Companion/Admin see the panel's
  state.
- Local guards: no talking while not registered or while the send
  transport is not connected (key turns amber, press is queued until the
  producer exists or dropped after 2 s).

---

## 9. Per-target audio state, tally and Companion

### 9.1 Volume and mute

Per target key `user:<id>` / `conference:<id>` / `feed:<id>`:
`volume` 0.0–1.0 (default 0.9), `muted` bool. Applied in the mixer. Changes
come from the deck (§10), GPIO (§11), and Companion (§9.4). The browser
keeps this state client-local and only *reports* it; the headless client
does the same: state is persisted in
`$STATE_DIRECTORY/audio-state.json` (`/var/lib/talktome-headless/<instance>/`)
and reported with `target-audio-state-snapshot` after registration and on
every change (debounced 200 ms) so Companion feedback shows the panel's
levels.

### 9.2 Camera tally

Server model: a single global on-air user (`POST /cut-camera { user }`);
each registered user socket receives `cut-camera <bool>` at registration
and whenever the on-air user changes. The client mirrors this boolean to
the GPIO `tally` output and the deck status key ("ON AIR"). There is no
preview tally in the server today (§18). `POST /cut-camera` is
unauthenticated on the server; that is pre-existing and out of scope.

### 9.3 Indicators

Derived states available to all surfaces: `connected` (registered and both
transports connected), `talking`, `locked` (per target), `incoming` (per
target, from `addressedNow`), `online` (per target, from `user-list`),
`muted`/`volume` (per target), `on_air`, `conflict`/`kicked`/`no_audio`.

### 9.4 Companion commands

`api-talk-command` `press` / `release` / `lock-toggle` and
`api-target-audio-command` `volume-up` / `volume-down` (step default 0.1) /
`mute-toggle` are executed exactly like a local key, with `targetType`
`user|conference|feed|reply` and `inputKey` treated as an independent
virtual key so a Companion press does not cancel a physically held key.
Every command is answered with the matching `-result` event carrying the
`commandId`, `ok`, and `reason` (`target-not-available`,
`unsupported-action`, `not-connected`).

---

## 10. Stream Deck surface

- **Library**: `elgato-streamdeck` (hidapi). Supported: Original, Original
  V2, MK.2, Mini, Mini MK.2, XL, XL V2, Stream Deck +, Stream Deck + XL,
  Neo, Pedal. The device is opened by **serial** (`streamdeck.serial`); if
  unset, the first Stream Deck found is used. Multiple instances on one
  device must each set a distinct serial (or none for GPIO-only instances).
- **udev**: `deploy/udev/60-talktome-streamdeck.rules` grants group
  `plugdev` read/write on Elgato HID devices (vendor `0fd9`); the service
  user is in `plugdev`.
- **Rendering**: `image` + `ab_glyph`; font from `streamdeck.font_path`
  (default `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`, package
  dependency `fonts-dejavu-core`). Keys: dark grey idle, green while
  talking, green with lock glyph when locked, amber pulsing while that
  target addresses us, grey-dim when the target is offline, red speaker
  glyph when muted, volume shown as a bar. Brightness from
  `streamdeck.brightness` (default 60) with `streamdeck.idle_dim_s`.
- **Layout** (auto, from the target order; overridable per key in
  `streamdeck.layout`):
  - Key 0: **status** (connection state, user name, "ON AIR" red when
    tally is on). Tap: clear locks. Hold 2 s: next page.
  - Key 1: **Reply** (shows who is calling).
  - Remaining keys: targets in server order. Feeds show name + volume;
    press toggles mute (they cannot be talked to).
  - When there are more targets than keys, the last key is **next page**.
  - **Volume on models without dials**: a **VOL** key (right-most on the
    first row) toggles the volume layer; in that layer the target keys show
    the volume bar, tap selects the target, `+` / `−` keys change it by
    `streamdeck.volume_step` (0.05), hold a target key 600 ms toggles mute.
    The layer times out after `streamdeck.volume_layer_timeout_s` (8 s).
  - **Stream Deck + / + XL dials**: dial *n* controls the target on the
    *n*-th key of the current page (excluding status/reply); rotate =
    volume, press = mute toggle; the touch strip shows name, bar and mute
    state per dial. Swiping the strip changes page.
  - **Neo** touch points act as previous/next page.
  - **Pedal**: left = reply, middle = `streamdeck.pedal_target`, right =
    lock toggle of that target.
- The surface runs in its own task; rendering is diffed so only changed
  keys are re-sent (key images are JPEG/BMP per model, generated by the
  library).

---

## 11. GPIO surface

- **Library**: `gpiocdev` (Linux GPIO character device v2). Lines are
  addressed by **line name** (e.g. `GPIO17`, robust across Pi 4/5 where the
  chip number differs) or `chip` + `offset`. The service user is in group
  `gpio` (Raspberry Pi OS grants `/dev/gpiochip*` to it).
- **Outputs** (`gpio.outputs`): `tally` (camera on air), `talking`,
  `incoming`, `connected`, `locked`; each with `active_low`.
- **Inputs** (`gpio.inputs`): a list of `{ line, action, target, active_low,
  debounce_ms }` with actions `talk` (hold = talk, tap = lock, same rules as
  a deck key), `reply`, `lock_toggle`, `clear_locks`, `mute_toggle`,
  `volume_up`, `volume_down`. Edge events are debounced in software
  (`debounce_ms`, default 20) in addition to the kernel debounce where
  available.
- GPIO-only instances (the two-instances-per-Pi case) simply omit the
  `streamdeck` section; two instances must not share lines.
- A `mock` GPIO backend (env `TALKTOME_GPIO_BACKEND=mock`) writes line
  states to a file and reads input events from a FIFO for tests.

---

## 12. Configuration

One schema, loaded from `/etc/talktome-headless/<instance>.json` **or**
`<instance>.toml` (format by extension; `--config <path>` overrides the
location). Environment variables `TALKTOME_<SECTION>_<KEY>` override single
values (e.g. `TALKTOME_USER_PASSWORD`), which is also how the systemd
`EnvironmentFile` can supply the password separately from the config file.

```jsonc
{
  "instance": "cam1",                       // defaults to the file name
  "server": { "url": "https://talktome.local:8443" },
  "tls": {                                  // one of:
    "ca_file": "/etc/talktome-headless/server-ca.pem",   // custom CA
    "fingerprint_sha256": "AB:CD:...",                    // or pin the leaf cert
    "insecure": false                                     // or accept anything (dev only)
  },
  "user": { "name": "Cam 1", "password": "…", "production": null },
  "registration": { "conflict": "takeover", "takeover_delay_ms": 1500,
                    "retry_ms": 5000, "kicked_retry_ms": 10000 },
  "audio": { "input_device": "plughw:CARD=Headset,DEV=0",
             "output_device": "plughw:CARD=Headset,DEV=0",
             "profile": "standard", "input_gain_db": 0,
             "dim_db": -14, "dim_feeds_while_speaking": false,
             "dim_when_addressed": true,
             "jitter_min_ms": 20, "jitter_max_ms": 120, "reopen_ms": 2000 },
  "vox": { "enabled": false, "target": "conference:1", "threshold_db": -32, "hang_ms": 600 },
  "talk": { "tap_ms": 250, "lock_multiple": false },
  "ice": { "servers": null, "transport_policy": null },   // null = use the server's
  "network": { "ice_disconnect_grace_ms": 4000 },
  "streamdeck": { "enabled": true, "serial": null, "brightness": 60,
                  "font_path": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                  "volume_step": 0.05, "volume_layer_timeout_s": 8,
                  "pedal_target": "conference:1", "layout": {} },
  "gpio": { "enabled": true, "chip": null,
            "outputs": { "tally": { "line": "GPIO17", "active_low": false },
                         "talking": { "line": "GPIO27" } },
            "inputs": [ { "line": "GPIO22", "action": "talk", "target": "conference:1",
                          "active_low": true, "debounce_ms": 20 },
                        { "line": "GPIO23", "action": "reply", "active_low": true } ] },
  "web": { "enabled": true, "bind": "0.0.0.0", "port": 8080, "password": "admin" },
  "health": { "port": null },               // optional /healthz listener
  "log": { "level": "info", "format": "auto" } // auto = JSON when under systemd
}
```

`talktome-headless --check-config` validates a file and prints the
effective configuration with the password redacted.
`--list-audio-devices`, `--list-streamdecks` and `--list-gpio` help with
provisioning.

---

## 13. systemd, health and logging

`deploy/systemd/talktome-headless@.service` (one unit per instance):

```ini
[Unit]
Description=Talktome headless client (%i)
After=network-online.target sound.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/talktome-headless --instance %i
EnvironmentFile=-/etc/talktome-headless/%i.env
WatchdogSec=30
Restart=always
RestartSec=2
User=talktome-headless
SupplementaryGroups=audio plugdev gpio
StateDirectory=talktome-headless/%i
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
```

- `sd_notify(READY=1)` after the config is loaded and surfaces are open;
  `WATCHDOG=1` from the main loop while signalling and audio tasks are
  alive; `STATUS=` mirrors the connection state for `systemctl status`.
- Optional `GET /healthz` on `health.port` (127.0.0.1): `200` when
  registered and both transports are connected, else `503` with a JSON
  body describing the failing component.
- Logging via `tracing`; JSON lines when stdout is the journal, human
  format on a TTY. Event names: `client-start`, `login`, `login-failed`,
  `socket-connected`, `socket-disconnected`, `registered`,
  `registration-conflict`, `registration-error`, `session-kicked`,
  `transport-connected`, `ice-state`, `media-recovery`, `producer-created`,
  `consumer-created`, `consumer-closed`, `talk-start`, `talk-stop`,
  `lock-on`, `lock-off`, `incoming`, `tally`, `audio-device-lost`,
  `audio-device-restored`, `streamdeck-connected`,
  `streamdeck-disconnected`, `gpio-input`, `companion-command`,
  `client-error`.

### 13.1 Web interface

Each instance serves a local administration UI (`web.bind:web.port`,
default `0.0.0.0:8080`; one port per instance) built with axum and plain
HTML/CSS/JS embedded in the binary. It follows the Talktome Admin panel's
look (dark navy, cards, blue primary) and is laid out for phones first,
because in the field it is opened from a smartphone.

- **Login**: the user is always `admin`; the password is `web.password`
  (or `TALKTOME_WEB_PASSWORD`). The default `admin` is accepted once and then
  a password change is enforced; the new password is written into the
  configuration file (`web.password`). Sessions are in-memory cookies
  (`HttpOnly`, `SameSite=Strict`, 12 h); five failed logins throttle further
  attempts for 30 s.
- **Status**: connection (state, detail, server, user id, production,
  registration age, reconnects, send/receive transport state, consumers,
  producer id, ICE servers and policy, tally), talk state with press-and-hold
  Talk, Lock, volume slider and Mute per target, incoming callers and reply
  target, audio devices and input level, GPIO backend with every configured
  output (driven state) and input (pressed, event count), Stream Deck model /
  serial / page, and service details (version, uptime, config path,
  supervisor, ports).
- **Stream Deck**: the rendered key images of the attached deck (PNG per key,
  cached by content hash), dials and touch points; pressing in the browser
  injects the same input the hardware would produce.
- **Settings**: a form over the whole schema (§12), audio devices listed from
  ALSA, GPIO output/input editors, JSON fields for ICE overrides and key
  layout, and a raw JSON editor. Saving validates the document with the same
  rules as startup and rewrites the file in its own format (TOML or JSON);
  secrets are redacted in the API and kept unless replaced; environment
  overrides in effect are shown because they win on the next start.
- **Restart**: `POST /api/restart` shuts the client down cleanly; under
  systemd the process exits 0 and `Restart=always` starts it again, otherwise
  the binary re-executes itself with the same arguments. `Save & restart`
  chains both.
- The API (`/api/session`, `/api/login`, `/api/status`, `/api/config`,
  `/api/config/audio-devices`, `/api/streamdeck`, `/api/streamdeck/key/{n}`,
  `/api/streamdeck/input`, `/api/talk`, `/api/audio`, `/api/password`,
  `/api/restart`) is JSON and can be scripted with the session cookie.
- Transport is plain HTTP: keep the port on the production or management
  network or front it with a TLS reverse proxy.

---

## 14. Packaging and CI/CD

### 14.1 Debian package

`cargo-deb` with `[package.metadata.deb]`: package `talktome-headless`,
section `sound`, depends auto-detected (`libasound2`, `libudev1`, `libc6`)
plus `fonts-dejavu-core`, `adduser`; recommends `alsa-utils`. Assets:
`/usr/bin/talktome-headless`, `/lib/systemd/system/talktome-headless@.service`,
`/lib/udev/rules.d/60-talktome-streamdeck.rules`,
`/usr/share/doc/talktome-headless/config.example.{json,toml}`, README.
`postinst` creates system user `talktome-headless` (groups `audio`,
`plugdev`, `gpio` when they exist), creates `/etc/talktome-headless/` with
mode 750, reloads udev rules; `prerm` stops running instances.

### 14.2 Targets

- `arm64` — Raspberry Pi 3/4/5/Zero 2 W on 64-bit Raspberry Pi OS.
- `armhf` (`armv7-unknown-linux-gnueabihf`) — 32-bit Raspberry Pi OS on
  Pi 2/3/4.
- `amd64` — Debian/Ubuntu PCs for testing.

All packages are built inside a `debian:bookworm` container so the
binaries link against glibc 2.36 and run on Bookworm **and** Trixie. arm64
and armhf are cross-compiled with Debian multiarch toolchains
(`crossbuild-essential-*`, `libasound2-dev:<arch>`, `libudev-dev:<arch>`);
libopus is compiled statically by `opusic-sys` (cmake).

### 14.3 Versioning

Git tags remain the single source of truth (`scripts/resolve-build-version.js`).
`Cargo.toml` keeps `0.0.0`. `build.rs` embeds `TALKTOME_BUILD_VERSION`
(falling back to `git describe`) into `--version`. The Debian version is
derived as: release `1.2.5` → `1.2.5`; development `1.2.5-dev.3` →
`1.2.5~dev.3+g<sha>` (tilde sorts before the release).

### 14.4 Workflows

- `.github/workflows/ci.yml` gains a `headless-client` job: `cargo fmt
  --check`, `cargo clippy -D warnings`, `cargo test`, and `cargo deb` for
  amd64 as a packaging smoke test.
- `.github/workflows/headless-client-release.yml` (modelled on
  `bridge-client-release.yml`): version job → build matrix
  `amd64 | arm64 | armhf` in `debian:bookworm` → `cargo deb --target …
  --deb-version …` → upload artifacts → install smoke test of the arm64 deb
  on `ubuntu-24.04-arm` in a `debian:bookworm` container and of the amd64
  deb in `debian:trixie` (`apt-get install ./…deb`, `--version`,
  `--check-config` on the example) → on tags, upload to the draft release
  with `scripts/upload-release-asset.sh`.

---

## 15. Implementation order

1. **Spike (gate)**: Socket.IO client, login, `register-user`, send
   transport with webrtc-rs, `produce` a test tone; a second instance
   consumes and writes the decoded audio to a WAV file. Run against the
   repo's server (`node server.js`). Record §6.7.
2. `config` (JSON/TOML/env, validation, CLI) and `signalling`
   (reconnect, re-login, conflict policy, `session-kicked`).
3. `rtc`: send/recv transports, `remote_sdp`, `ortc`, consume/resume/close,
   recovery by recreation.
4. `audio`: capture → Opus → track; tracks → decode → jitter → mixer →
   playback; dim; VOX; device recovery.
5. `talk`: targets from REST + `user-list`, hold/lock/reply, `ptt-state`,
   Companion commands and results, per-target audio state persistence and
   snapshot.
6. `surfaces::gpio` (tally first, then inputs, LEDs) with the mock backend.
7. `surfaces::streamdeck` (discovery by serial, layout, rendering, dials,
   touch strip, paging, volume layer) with the PNG mock backend.
8. `health`, systemd unit, udev rule, example configs, README.
8a. `web`: login/password, status, Stream Deck view and input, talk/audio
    control, configuration editor writing back to the file, restart.
9. Packaging (`cargo-deb`, maintainer scripts, version mapping).
10. CI job and release workflow.
11. Two instances on one host: independent users, audio devices and GPIO
    (mock), no cross-talk, independent restart.

---

## 16. Verification

- **Unit**: Socket.IO framing and acks; `remote_sdp` output against
  fixtures taken from `mediasoup-client`; `ortc` extraction from webrtc-rs
  offers; jitter buffer; mixer gain/dim/mute math; layout engine for every
  deck model; config parsing (JSON, TOML, env overrides, validation).
- **Integration (CI-capable)**: start the repo's server; two headless
  instances with mock surfaces register as two users; A talks to B and the
  decoded audio on B is verified (tone detection); Companion-style commands
  via `POST /api/v1/companion/users/:id/talk` and `/target-audio` produce
  the expected `command-result`; `POST /cut-camera` toggles the mock tally
  line; killing A leaves B registered.
  Test hooks built into the client for this: virtual audio devices
  (`audio.input_device = "tone[:hz]"`, `audio.output_device = "wav:<path>"`),
  the file-driven mock surface (`TALKTOME_SURFACE_MOCK_DIR`), the mock GPIO
  backend (`TALKTOME_MOCK_GPIO=1`) and the mock Stream Deck
  (`TALKTOME_MOCK_STREAMDECK=<model>`, renders `deck.png`). The full
  scenario (talk both ways, no cross-talk, Companion commands, tally,
  `SIGKILL` of one instance while the other stays healthy, restart) was run
  against the real server during development.
- **Manual on hardware**: real Stream Deck models, GPIO tally into a camera
  tally input, LTE → Wi-Fi handover with the deployment's TURN server,
  `iceTransportPolicy=relay`, 2 h soak.

## 17. Success criteria

- From the server's point of view the panel is an ordinary user: it shows
  online in Admin, can be targeted by Companion, receives tally, and
  routes exactly like the browser.
- Audio flows both ways over ICE + DTLS-SRTP, including through TURN when
  direct paths are blocked, with no server changes.
- A network change (LTE ↔ Wi-Fi) recovers automatically within seconds
  without operator action.
- Stream Deck keys talk/lock/reply and adjust volume/mute per target; GPIO
  tally follows `cut-camera`.
- Two instances on one Pi run independently.
- `.deb` packages for arm64, armhf and amd64 are produced by CI and install
  cleanly on Bookworm and Trixie.

## 18. Follow-ups (not in this release)

- Server: `restart-ice` event (`transport.restartIce()` → new
  `iceParameters`) to avoid full transport recreation on handover.
- Server: long-lived device tokens so the password need not live on the
  device; authentication for `POST /cut-camera`; a preview (green) tally.
- HTTPS for the web interface (currently plain HTTP, meant for the LAN or a
  reverse proxy).
- Bridge: deliver `cut-camera` to bridge sessions
  (`queueBridgeControlEvent` filter).

## 19. Decision log

- Rust, not Node; standalone crate in `headless-client/`.
- Normal-user identity via user-scoped Companion login token; no admin API
  key on the device.
- webrtc-rs with SDP synthesis (TURN built in) over str0m.
- TURN is mandatory whenever the server configures one; devices are mobile.
- Talk keys: hold = talk, tap = lock toggle.
- Registration conflict: configurable, default take over.
- Multi-instance kept (systemd template); Stream Deck bound by serial;
  GPIO-only instances are the two-per-Pi case.
- Config: one schema, JSON or TOML by file extension, env overrides.
- Packages: arm64, armhf, amd64, built on Bookworm.
- Web interface added after review: fixed `admin` login with forced
  password change, status incl. GPIO, live Stream Deck view, settings saved
  to the TOML/JSON file, restart.
- Dropped from the earlier draft: Companion HTTP trigger endpoint, radio
  TX/RX echo state machine, references to a gateway design document that is
  not in this repository.
