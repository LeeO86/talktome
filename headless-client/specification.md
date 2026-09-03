# Talktome Headless Client — Specification

## Context

`gateway/radioGateway.js` is a working single-channel audio gateway that
connects one ALSA device to Talktome over a **plain RTP** transport
(`mediasoup` `PlainTransport`, unencrypted, no ICE/DTLS), registering
itself with `force: true` on a normal Talktome user id. It is designed
for a stationary host with a fixed network path
(typically WireGuard) and stays in scope for that deployment,
**unmodified**.

The goal is to run a Talktome endpoint **on a mobile
device** (a phone-class or portable Linux board,
moving between Wi-Fi and cellular networks) with **multiple independent
instances on the same physical device** (e.g. several channels/roles
carried by one operator, or one device serving several radios/handsets).

Two properties of `radioGateway.js` do not survive that move:

1. **Plain RTP has no NAT/mobility story.** `comedia` address-learning
   binds the server's send target to whatever source address the first
   packet arrived from; a Wi-Fi↔cellular handover, a carrier-grade NAT
   remapping, or a symmetric NAT changes that address and plain RTP has
   no mechanism to recover — no ICE restart, no keepalive-driven
   rebinding, nothing. It also carries audio in cleartext. WebRTC's
   ICE (STUN/TURN, connectivity checks, restart) and mandatory DTLS-SRTP
   are exactly the mechanism a mobile network path needs, and Talktome's
   server already runs `router.createWebRtcTransport(...)` for every
   browser user (`serverCore.js`, via `webrtcConfig.js`), so no
   server-side change is required to use it.
2. **`force: true` registration is a gateway-only shortcut.** A normal
   browser client registers with `force: false` and only retries with
   `force: true` after a human confirms they want to kick their own
   prior session (`public/client.js`, `registerUserWithConflictPrompt`).
   The gateway skips that entirely and always evicts whoever currently
   holds the user id. A device meant to look like "just another
   Talktome user" to the server should behave like one, not like a
   privileged relay.

This specification defines a **new, separate component** —
`headless-client/` — that is architecturally *inspired by*
`radioGateway.js` (its Audio Core / RX-TX Engine / Trigger Interface
split, per §§4–11 of the design this gateway already implements) but is
**not a refactor of it and does not modify `gateway/radioGateway.js` in
any way**. The two components solve different deployment problems with
different transports and different server-facing identities, and
duplicating the *design pattern* (not the code) is the right call here
— unlike the original gateway refactor, where duplicating code was
explicitly rejected, here the transport and identity model are
fundamentally different enough that a shared implementation would need
transport-shaped conditionals throughout the core.

---

# 1. Goals

The headless client must provide:

1. A Talktome endpoint that runs headless during normal operation (no
   display, keyboard, or webview attached, no interaction from whoever
   is carrying the device) on a mobile Linux device — a local
   configuration web interface for the installer/administrator is
   still allowed (§10.1), it is simply not exposed to the end user.
2. WebRTC transport (ICE + DTLS-SRTP) identical in kind to what a
   browser client negotiates — no server-side changes.
3. Registration as a normal Talktome user (`kind: "user"`,
   conflict-aware, not an unconditional `force: true` takeover).
4. Multiple independent instances running concurrently on one device,
   each a distinct Talktome user/channel with its own audio device.
5. Reuse of the existing Audio Core / Activity Detector / Trigger
   Interface *design* from `radioGateway.js` for local audio I/O and
   PTT/VOX behavior, with pluggable trigger backends — GPIO, VOX, and
   Bitfocus Companion as a hardware-abstraction option (§8).
6. No modification to `gateway/radioGateway.js` or its deployment.
7. No Talktome server-side changes.
8. Resilience to mobile network conditions: Wi-Fi↔cellular handover,
   temporary loss of connectivity, NAT rebinding, restrictive firewalls
   (TURN fallback).

---

# 2. Why WebRTC, not Plain RTP

```text
              Plain RTP (existing gateway)         WebRTC (this spec)
              ----------------------------         -------------------
Transport     mediasoup PlainTransport              mediasoup WebRtcTransport
Addressing    comedia (learned from 1st packet)     ICE (STUN/TURN, restart)
Encryption    none                                  mandatory DTLS-SRTP
Mobility      breaks on address change              ICE restart / consent refresh
Server change none needed                           none needed (browsers already use it)
Identity      force:true gateway takeover            normal conflict-aware user
```

The server-side `createWebRtcTransport` path (`webrtcConfig.js`,
`buildWebRtcListenInfos`) already supports UDP+TCP listen candidates and
an optional `announcedAddress`; TURN relay is available when
`iceTransportPolicy=relay` is configured. This is the same path every
browser tab uses today — the headless client is simply another WebRTC
peer on that path, not a new server capability.

---

# 3. Architecture

```text
                       headless-client
                            |
              +-------------+-------------+
              |                           |
        Talktome Core                Audio Core
        (register as normal           (ALSA capture/
         user, WebRTC signalling)       playback, PCM)
              |                           |
       Socket.IO / WebRTC            ALSA / resample
              |                           |
              +-------------+-------------+
                            |
                       TX/RX Control
                            |
                +-----------+-----------+
                |           |           |
              GPIO        Audio     Companion
              Trigger     Trigger    Trigger
```

Repository structure (new, top-level, sibling to `gateway/` and
`bridge-client/`):

```text
headless-client/
  headlessClient.js        # entry point, one process = one instance

  core/
    audio.js                # ALSA capture/playback, PCM framing
    talktome.js              # Socket.IO connection, normal-user registration
    webrtc.js                # Device/transport/produce/consume over WebRTC
    rx.js                    # Talktome -> local audio
    tx.js                    # local audio -> Talktome
    configWeb.js              # admin-only config UI/API (§10.1)

  triggers/
    gpioTrigger.js
    audioTrigger.js
    companionTrigger.js

  deploy/
    systemd/
      talktome-headless@.service
```

`core/audio.js`, the `AudioActivityDetector`, and the Trigger Interface
follow the same contracts as `radioGateway.js` §§7 and 9 — this is a
parallel implementation of the same design, not a shared library import,
since the two components are deployed and versioned independently.

---

# 4. Talktome Registration (normal-user semantics)

```text
                 register-user({ kind:"user", force:false })
                              |
                    +---------+---------+
                    |                   |
                 accepted            conflict
                    |                   |
                  running        is it MY OWN stale
                                  session (crash/restart)?
                                        |
                              +---------+---------+
                              |                   |
                             yes                  no
                              |                   |
                    retry force:true       fail startup,
                    (self-recovery,        alert operator —
                    no human prompt        do not silently
                    needed — headless)     hijack another
                              |            identity
                          running
```

- Each instance owns exactly one Talktome user id, provisioned per
  instance (not shared across instances on the same device).
- On startup, register with `force: false`, mirroring normal-user
  behavior.
- A `conflict` response most commonly means this instance's own
  previous process is still registered (crash without clean
  disconnect, or a fast restart before the server's stale-socket
  timeout). The client should retry once with `force: true` to recover
  its own identity — this is self-recovery of a dedicated id, not the
  gateway's blanket takeover of a shared one, and is safe *only*
  because each instance has an id nothing else should ever be using.
- If recovery also fails, or the operator has misconfigured two
  instances with the same user id, the client must fail startup loudly
  (health endpoint reports 503, log `registration-conflict`) rather
  than looping on `force: true` against a genuinely different session.
- No `guestProfileUserId` behavior is used; this is a plain registered
  user like any authenticated browser session.

---

# 5. WebRTC Core

`core/webrtc.js` drives the same Socket.IO signalling sequence a browser
client uses (`public/client.js`), so the server sees no difference:

```text
get-router-rtp-capabilities
        |
device.load(routerRtpCapabilities)
        |
create-send-transport  ->  device.createSendTransport
        |
(on "connect")  ->  connect-send-transport { dtlsParameters }
        |
(on "produce")  ->  produce { kind, rtpParameters }  ->  producerId
        |
create-recv-transport  ->  device.createRecvTransport
        |
(on "connect")  ->  connect-recv-transport { dtlsParameters }
        |
on "new-producer"  ->  consume { producerId, rtpCapabilities }
        |
recvTransport.consume(...)  ->  resume-consumer
```

`producer-close`, `consumer-closed`, and `request-active-producers` are
handled the same way a browser client handles them.

This core owns:

- ICE/DTLS/SRTP session lifecycle via the chosen WebRTC engine (§6)
- `mediasoup-client`-equivalent `Device`/transport/producer/consumer
  bookkeeping
- ICE restart on connectivity loss (mobile handover) before falling
  back to a full reconnect
- TURN configuration passthrough (same `iceServers`/
  `iceTransportPolicy` shape as `webrtcConfig.js` produces for browsers)

The Talktome Core (`core/talktome.js`) still owns the Socket.IO
connection itself, reconnection, and registration (§4); `core/webrtc.js`
owns everything that happens *on top of* that connection once
registered.

---

# 6. Headless WebRTC Engine — open technical decision

`mediasoup-client`'s browser-shaped API (`Device`, `sendTransport`,
`recvTransport`) is written against a real `RTCPeerConnection` — it
negotiates ICE/DTLS by driving an actual peer connection and reading back
its SDP/candidates. There is no DOM on a headless Linux device, so this
component needs a real WebRTC engine underneath, not a browser. This is
the single biggest open risk in this spec and must be resolved with a
short spike before committing to the full build:

```text
Option A: @roamhq/wrtc (libwebrtc bindings, prebuilt native addon)
  + real, battle-tested ICE/DTLS/SRTP; RTCPeerConnection-compatible
    globals let mediasoup-client run close to unmodified
  - prebuilt binaries must exist (and be validated) for the target
    mobile Linux architecture (commonly aarch64); native addon
    increases per-instance memory footprint

Option B: werift-webrtc (pure JS/TS ICE/DTLS/SRTP)
  + no native binary/cross-compile problem, easiest to run on whatever
    arch the mobile device uses
  - not a drop-in RTCPeerConnection global; mediasoup-client would need
    a custom Handler written against werift's API, and werift's
    real-world interop with mediasoup's WebRtcTransport is not yet
    validated for this project
  - higher CPU cost for crypto/ICE than a native engine, relevant on a
    battery-powered mobile device
```

**Recommendation:** spike Option A first (native engine + as-unmodified-
as-possible `mediasoup-client`), since it minimizes how much of the
mediasoup signalling protocol this project has to reimplement by hand.
Fall back to Option B only if prebuilt binaries are unavailable or
unreliable on the target hardware. Either choice also determines how
audio reaches the network:

- With a real engine, the engine performs Opus encode/decode internally
  from/to raw PCM — `core/audio.js` hands PCM frames to an outbound
  audio source and reads PCM frames from an inbound audio sink;
  `ffmpeg` in this path is only used for ALSA-format resampling, not for
  RTP or Opus.
- This is a departure from `radioGateway.js`, where `ffmpeg` does the
  RTP/Opus work directly against a `PlainTransport`. That is expected —
  the transport is fundamentally different — not a sign the pattern was
  copied wrong.

This section must be resolved (spike completed, engine chosen and
recorded here) before Implementation Step 2 (§15) begins.

---

# 7. Audio Core

`core/audio.js` owns local audio I/O, following the same shape as
`radioGateway.js`'s audio responsibilities but PCM-oriented rather than
RTP-oriented per §6:

Responsibilities:

- ALSA input (capture) per configured device
- ALSA output (playback) per configured device
- format/rate conversion to match the WebRTC engine's expected PCM
  format
- RMS calculation (reused by `AudioActivityDetector`, §8)
- audio buffer handling

No GPIO/PTT logic lives here, same constraint as the existing gateway.

---

# 8. Audio Activity Detector and Trigger Interface (reused design)

The detector and the interface below are reused **unchanged as designs**
from `radioGateway.js` §§7 and 9:

```js
const detector = new AudioActivityDetector({ onThreshold, offThreshold, hangMs });
detector.on("active", handler);
detector.on("inactive", handler);
detector.on("level", handler);
detector.process(chunk);
```

```js
trigger.on("active", handler);
trigger.on("inactive", handler);
await trigger.start();
await trigger.stop();
```

- `triggers/gpioTrigger.js` — for a mobile board with a physical PTT
  button (same lead/tail/serialization concerns as
  `gateway/triggers/gpioTrigger.js` would have, per the original
  spec's §10 — reimplemented here for this component's GPIO wiring,
  not imported from the gateway).
- `triggers/audioTrigger.js` — VOX/audio-level triggering using the
  same detector as RX gating, per the original spec's §11.
- `triggers/companionTrigger.js` — treats Bitfocus Companion as the
  hardware abstraction layer instead of talking to a pin or bus
  directly. Companion already supports a wide range of physical PTT
  hardware (footswitches, relay/GPIO breakout boards, Stream Decks,
  MIDI controllers), so this trigger keeps all of that
  device-specific knowledge inside Companion — where it is already
  built and maintained — rather than growing a new GPIO variant in
  this codebase per device model. Integration is one HTTP call each
  way: `companionTrigger.js` exposes a small local HTTP endpoint
  (`POST /trigger/active`, `POST /trigger/inactive`) that a Companion
  button/trigger action calls on press/release; the trigger turns
  those calls into the same `active`/`inactive` events the interface
  already defines. The endpoint must bind to localhost or a private
  interface and require a shared-secret token (§10) — anything that
  can POST to it can key TX.
- TX/RX echo prevention (mute TX's own playback from retriggering
  local RX) applies identically — see the original gateway spec §12
  for the state machine; behavior is unchanged, only the transport
  underneath differs.
- GPIO and Companion are alternative hardware-abstraction choices, not
  a progression — a deployment with simple, fixed wiring and no
  Companion install may prefer `gpioTrigger.js` directly; a deployment
  that already runs Companion for other control-surface needs, or
  wants to swap PTT hardware without touching this codebase, should
  prefer `companionTrigger.js`. Both sit behind the identical Trigger
  Interface, so the choice is a deployment-time config value
  (`TALKTOME_TRIGGER`, §10), not an architectural fork.

---

# 9. Multi-instance Model

Each instance is a fully independent process:

```text
instance-a                          instance-b
   |                                   |
Talktome user A                   Talktome user B
   |                                   |
own WebRTC PeerConnection          own WebRTC PeerConnection
   |                                   |
own ALSA device (or own            own ALSA device (or own
virtual/loopback device)           virtual/loopback device)
   |                                   |
own GPIO pin / own VOX config      own GPIO pin / own VOX config
```

Constraints:

- No shared state between instances; no cross-instance coordination.
- Each instance's Talktome user id, audio device, and (if used) GPIO
  pin are distinct and configured independently — collisions are an
  operator configuration error, not something the software resolves.
- Killing or restarting one instance must not affect any other
  instance on the same device.
- On a device with limited physical audio hardware, instances may use
  ALSA loopback/virtual devices (e.g. `snd-aloop`) to get independent
  capture/playback endpoints without one physical card per instance —
  this is a deployment/config concern, not a code-level one.

---

# 10. Configuration

```text
TALKTOME_INSTANCE_ID=operator-a

TALKTOME_USER_ID=...
TALKTOME_SERVER_URL=...

TALKTOME_ALSA_INPUT_DEVICE=...
TALKTOME_ALSA_OUTPUT_DEVICE=...

TALKTOME_ICE_SERVERS_JSON=...
TALKTOME_ICE_TRANSPORT_POLICY=all|relay

TALKTOME_TRIGGER=gpio|audio|companion

TALKTOME_AUDIO_ACTIVITY_ON_THRESHOLD=...
TALKTOME_AUDIO_ACTIVITY_OFF_THRESHOLD=...
TALKTOME_AUDIO_ACTIVITY_HANG_MS=...

TALKTOME_AUDIO_TRIGGER_ENABLED=false
TALKTOME_AUDIO_TRIGGER_ON_THRESHOLD=...
TALKTOME_AUDIO_TRIGGER_OFF_THRESHOLD=...
TALKTOME_AUDIO_TRIGGER_HANG_MS=...

TALKTOME_RADIO_TX_RX_MUTE_TAIL_MS=600

TALKTOME_HEALTH_PORT=...
```

GPIO-specific settings (only required when `TALKTOME_TRIGGER=gpio`):

```text
TALKTOME_GPIO_PIN
TALKTOME_PTT_LEAD_MS
TALKTOME_PTT_TAIL_MS
```

Companion-specific settings (only required when
`TALKTOME_TRIGGER=companion`):

```text
TALKTOME_COMPANION_TRIGGER_BIND=127.0.0.1
TALKTOME_COMPANION_TRIGGER_PORT=...
TALKTOME_COMPANION_TRIGGER_TOKEN=...
```

`TALKTOME_COMPANION_TRIGGER_TOKEN` must be sent by Companion's action
(e.g. as a header or query parameter, depending on the HTTP module
Companion uses) and checked before an `active`/`inactive` call is
honored — this endpoint keys TX, so it must not be reachable by an
unauthenticated caller on the network.

`TALKTOME_ICE_SERVERS_JSON`/`TALKTOME_ICE_TRANSPORT_POLICY` mirror the
shape `webrtcConfig.js` already produces for browser clients — this
client should be configurable with the same STUN/TURN servers the
Talktome deployment already runs, not a separate ICE configuration
scheme.

## 10.1 Configuration Web Interface

`core/configWeb.js` may serve a small web UI/API for reading and
changing an instance's configuration (the same fields as the env vars
above) — useful for an installer setting up a device without editing
an `EnvironmentFile` by hand, e.g. from a phone browser during
deployment. This is an **admin surface, not a user feature**: the
person carrying/wearing the device has no link, icon, or credential
that leads to it.

- Binds to `TALKTOME_ADMIN_BIND` (default `127.0.0.1`) and
  `TALKTOME_ADMIN_PORT`; on a deployment with an admin/management
  network (e.g. the WireGuard network noted in the Context), it should
  bind there rather than on whatever network the device uses to reach
  Talktome/TURN — not on an interface the end user's own traffic
  shares.
- Requires `TALKTOME_ADMIN_TOKEN`; unauthenticated requests are
  rejected and logged (`admin-ui-rejected`), the same posture as the
  Companion trigger endpoint (§8, §14).
- Disabled entirely (`TALKTOME_ADMIN_PORT` unset) is a valid and
  supported deployment choice — nothing else in this spec depends on
  it existing.
- Changes made through it must apply the same way a changed
  `EnvironmentFile` + restart would — it is a friendlier editor for
  the same configuration, not a second, independently-diverging
  runtime state. It should also show the instance's current effective
  configuration, not just accept blind writes.

---

# 11. systemd

Template unit, one per instance, mirroring the existing gateway pattern:

```text
deploy/systemd/talktome-headless@.service
```

```ini
[Service]
ExecStart=/usr/bin/node /opt/talktome-headless/headless-client/headlessClient.js
EnvironmentFile=/etc/talktome-headless/%i.env
Restart=on-failure
RestartSec=2

User=talktome-headless
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
```

```text
talktome-headless@operator-a
talktome-headless@operator-b
```

Exact filesystem permissions must be adapted for the ALSA devices and
GPIO access each instance needs.

---

# 12. Health Endpoint

```text
GET /healthz
```

`200` when:

- Talktome socket is connected and registered (not in conflict/failed
  state, per §4)
- WebRTC send and receive transports are connected (ICE state
  `connected` or `completed`)
- RX pipeline is alive
- TX pipeline is operational

`503` otherwise. Each instance binds its own `TALKTOME_HEALTH_PORT`.

---

# 13. Logging

Structured JSON, same shape as the existing gateway spec:

```json
{
  "ts": "2026-08-25T12:00:00.000Z",
  "instance": "operator-a",
  "event": "ice-restart"
}
```

Important events (superset of the existing gateway's list, §20 of the
original spec, plus WebRTC-specific ones):

```text
client-start
client-connected
client-registered
registration-conflict

ice-connected
ice-disconnected
ice-restart
dtls-connected

rx-active
rx-inactive
rx-muted

tx-active
tx-inactive

audio-trigger-active
audio-trigger-inactive

gpio-ptt-on
gpio-ptt-off

companion-trigger-active
companion-trigger-inactive
companion-trigger-rejected

producer-created
producer-closed
consumer-created
consumer-closed

client-error
```

---

# 14. Security

WebRTC's mandatory DTLS-SRTP means audio in transit is encrypted by
default — an improvement over the existing gateway's cleartext plain
RTP, though that gap is tracked separately and out of scope here.

The same server-side `register-user` weakness noted in the original
gateway spec (§25: a caller-supplied numeric user id with no credential
check beyond socket connectivity, and `force: true` able to kick an
existing session) still applies to this client and is not solved by
using WebRTC or conflict-aware registration — a malicious actor with
socket access could still force-kick this client's session. This
remains a separate, pre-existing server-side concern.

Additional considerations specific to running several instances on one
mobile device:

- Per-instance credentials/user ids must not be hardcoded into a shared
  image — each instance's environment file provisions its own identity.
- TURN credentials, if used, should be short-lived/instance-scoped
  where the deployment's TURN server supports it, rather than one
  static shared secret baked into every instance.
- The Companion trigger's local HTTP endpoint (§8, §10) is itself a
  keying mechanism reachable over the network Companion runs on; it
  must bind to localhost or a private interface and reject calls
  without `TALKTOME_COMPANION_TRIGGER_TOKEN`, the same way any other
  TX-keying input would need to be protected.
- The configuration web interface (§10.1) is an admin surface with
  write access to an instance's identity/config — it needs the same
  bind-to-private-interface-plus-token treatment as the Companion
  endpoint, and must never be reachable from whatever network path
  the end user's own device traffic uses.

---

# 15. Implementation Order

**Step 1** — Spike the headless WebRTC engine choice (§6): register a
throwaway user against the real Talktome server's `createWebRtcTransport`
path from a headless Node process, produce a test tone, consume it back.
Resolve and record the engine choice before continuing.

**Step 2** — Build `core/talktome.js`: Socket.IO connection,
conflict-aware normal-user registration (§4), reconnection handling.

**Step 3** — Build `core/webrtc.js` against the chosen engine: send
transport, produce; recv transport, consume.

**Step 4** — Build `core/audio.js`: ALSA capture/playback, PCM framing
matched to the engine's audio source/sink API.

**Step 5** — Wire RX/TX engines end to end for a single instance: mic →
Talktome, Talktome → speaker.

**Step 6** — Introduce `AudioActivityDetector` and
`triggers/audioTrigger.js`.

**Step 7** — Introduce `triggers/gpioTrigger.js` for boards with a
physical PTT input.

**Step 8** — Introduce `triggers/companionTrigger.js`: local HTTP
trigger endpoint plus a documented example Companion button config;
verify press/release maps to `active`/`inactive` the same as GPIO, and
that an unauthenticated call is rejected.

**Step 9** — Introduce `core/configWeb.js` (§10.1): admin-only,
token-gated, bound to a private/management interface; verify it can
read and change an instance's config and that an unauthenticated or
wrong-network request is rejected.

**Step 10** — Add the health endpoint and structured logging.

**Step 11** — Add the systemd template; run one instance under systemd.

**Step 12** — Run two instances on the same device concurrently;
verify isolation.

**Step 13** — Mobile network resilience testing (§16): Wi-Fi↔cellular
handover, TURN fallback, reconnect after connectivity loss.

---

# 16. Verification

## Registration

- normal `force: false` registration succeeds when the user id is free
- a genuine conflict (another live session) fails startup and is
  reported via `/healthz`, not silently forced
- restarting the same instance recovers its own id via the
  self-recovery `force: true` retry

## WebRTC transport

- ICE connects using the deployment's configured STUN/TURN
- audio produced by this client is audible to other Talktome
  participants
- audio produced by other participants is audible on this client's
  output
- TX/RX echo prevention holds (own playback does not retrigger own RX)

## Configuration web interface

- reachable from the admin/management interface, not from the network
  path the end user's own device traffic uses
- rejects requests without `TALKTOME_ADMIN_TOKEN`
- a config change made through it takes effect the same way an
  `EnvironmentFile` change + restart would
- disabling it (`TALKTOME_ADMIN_PORT` unset) leaves the rest of the
  instance fully functional

## Mobile network resilience

- switching the device from Wi-Fi to cellular mid-session recovers via
  ICE restart without a full re-registration
- temporary connectivity loss (elevator, tunnel) reconnects cleanly
- a network that blocks direct UDP still connects via TURN relay when
  `TALKTOME_ICE_TRANSPORT_POLICY=relay`

## Multi-instance

- two instances on one device, independent Talktome users, independent
  ALSA devices (or independent loopback devices)
- no audio cross-talk between instances
- killing instance A does not affect instance B
- systemd restarts only the failed instance

## Trigger modes

- GPIO PTT lead/tail timing works if configured
- VOX/audio-trigger hysteresis and hang time work if configured
- Companion button press/release maps to `active`/`inactive` with no
  GPIO/pinctrl invocation on that instance
- a Companion-trigger HTTP call without a valid
  `TALKTOME_COMPANION_TRIGGER_TOKEN` is rejected and logged
  (`companion-trigger-rejected`), not honored

---

# 17. Success Criteria

The implementation is complete when:

- The client registers and operates as an indistinguishable normal
  Talktome user from the server's point of view.
- Audio flows both directions over a real WebRTC (ICE + DTLS-SRTP)
  transport, with no Talktome server changes required.
- The client survives a Wi-Fi↔cellular handover without manual
  intervention.
- Multiple instances run independently and concurrently on one mobile
  Linux device with no cross-talk and independent failure/restart.
- `gateway/radioGateway.js` is untouched.
- `/healthz` gives a reliable per-instance signal for supervision.
- Swapping the trigger backend (GPIO, VOX, or Companion) is a
  `TALKTOME_TRIGGER` config change, not a code change to Audio/WebRTC/
  Talktome core.

---

## Closing summary

```text
                    Talktome Server
                          │
              (createWebRtcTransport — unchanged)
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   Browser user     headless-client    headless-client
                     instance A          instance B
                     (mobile device 1)   (mobile device 1)
```

To the server, this client is just another WebRTC user. The mobility
and multi-instance behavior live entirely on the client side — the same
principle the original gateway refactor established for triggers
(GPIO/Audio behind one interface) now applies one layer up: WebRTC
transport and normal-user registration behind the same Audio Core /
Activity Detector / Trigger design, running headless, once per instance.
