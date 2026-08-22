# Talktome Bridge Client

This is the first native bridge-client spike for routing Talktome audio to
local multichannel audio interfaces such as Dante Virtual Soundcard.

The current bridge path includes:

- Tauri/Rust desktop app shell for macOS and Windows.
- Native audio device enumeration through CPAL.
- Native F32/48 kHz stream probe for a selected input channel pair.
- Optional local loopback from selected input pair to selected output pair.
- Multiple local bridge-port rows with independent native streams.
- Server registration and automatic loading of Admin bridge assignments.
- One managed headless user session per configured bridge endpoint.
- Native CPAL input/output on the exact configured channel pairs.
- Optional NDI® Audio receive/send through separately installed NDI Tools or NDI Runtime.
- Bundled Open Media Transport (OMT) Audio receive/send.
- Opus/RTP transport to and from mediasoup through the server's plain RTP API.
- Companion press, release and lock commands for managed bridge users.
- Bundled FFmpeg sidecar support for Opus encoding/decoding.

FFmpeg is used only for Opus encoding/decoding; audio device and channel access
remain native through CPAL. Packaged builds use a platform-specific FFmpeg
sidecar. Development builds can also use `ffmpeg` from `PATH` or an explicit
binary path via `TALKTOME_FFMPEG`.

## NDI Audio

NDI support is optional and dynamically loaded at runtime. Talktome does not
bundle the NDI SDK, NDI Runtime or NDI Tools. Install the current
[NDI Tools](https://ndi.video/tools/) package or the
[NDI Runtime](https://ndi.video/for-developers/) separately, then use the
Bridge's `Refresh` action. The Bridge reports the loaded runtime version and
discovered source count in its window. Restart the Bridge after updating NDI so
that no previously loaded runtime remains active.

If no runtime is found, the Bridge shows an orange NDI status and a `Download
NDI Tools` button leading to NDI's official Tools download. While refreshing,
the button changes to `Refreshing…` and the status reads `Discovering NDI
sources…`; discovery can take a few seconds.

Discovered NDI sources are exposed as Bridge input devices with channel choices
up to channel 32. The selected channel is validated against the channel count of
received audio frames. Eight stereo send slots named `Talktome Bridge 1` through
`Talktome Bridge 8` are exposed as Bridge output devices. Both use the existing
managed Bridge-port configuration, so no server-side NDI component is required.
The first implementation supports uncompressed planar floating-point audio at
48 kHz. It intentionally does not use NDI HX, compressed audio or Advanced SDK
functionality.

Runtime lookup honors `TALKTOME_NDI_RUNTIME` first, followed by the standard
`NDI_RUNTIME_DIR_V6`/`V5`/`V4` variables and common installation paths. The
Windows fallbacks include both the standalone NDI Runtime and the Runtime
included with NDI 6 Tools. An environment variable can point either to the
runtime library itself or its directory.

The macOS Bridge has library validation disabled in its signing entitlements so
that an independently signed NDI Runtime can be loaded. Keep this limited to the
Bridge process and install runtimes only from NDI's official distribution.

NDI® is a registered trademark of Vizrt NDI AB. Use and installation of the
runtime are governed by NDI's license terms.

### OBS routing

For Talktome to OBS, assign one of the `NDI network output · Talktome Bridge N`
devices to a managed Bridge user. That configured NDI sender remains visible
even while no one is speaking. In OBS, add an `NDI Source` and select the
network source named like `COMPUTER (Talktome Bridge N)`. The similarly named
macOS devices `System audio · NDI Audio` are NDI's virtual CoreAudio drivers,
not Talktome's native NDI network integration.

For OBS to Talktome, enable an NDI program output in OBS (usually under
`Tools > NDI Output Settings`) or add a `Dedicated NDI Output` filter to the
desired OBS source. Refresh the Bridge, then select the resulting
`NDI network input · COMPUTER (OBS source name)` as the managed Bridge input.
The OBS output must contain an audio track; a video-only NDI test signal is
discoverable but produces silence in this audio-only Bridge integration.

## OMT Audio

Open Media Transport support is bundled with the macOS and Windows Bridge, so
users do not need to install a separate runtime. The Bridge window reports the
bundled backend version and the number of discovered OMT sources. Its `Refresh`
button updates OMT discovery and the available Bridge devices.

Discovered OMT sources are exposed as `OMT network input` devices. Eight stereo
send slots named `Talktome Bridge 1` through `Talktome Bridge 8` are exposed as
`OMT network output` devices. OMT supports up to 32 input channels; the initial
Talktome output implementation remains stereo. Audio is transported as
uncompressed planar 32-bit floating point at 48 kHz.

For Talktome to OBS, install the official
[OMT plugin](https://github.com/openmediatransport/omtplugin), assign an
`OMT network output · Talktome Bridge N` device to a managed Bridge port, then
add an `OMT Source` in OBS and select the corresponding network source.

For OBS to Talktome, enable the OMT main output from OBS's OMT Output settings,
refresh the Bridge and select the resulting `OMT network input` device. The OBS
output must contain an audio track. OMT discovery uses DNS-SD/mDNS on UDP 5353;
active senders use a TCP port from OMT's default range 6400–6600.

The build pins the official `libomt`/`libvmx` binary release and verifies the
archive and individual library SHA256 hashes before packaging. Both libraries
are distributed under the MIT License; their license text is included in the
Bridge resources. `TALKTOME_OMT_RUNTIME` can point to a different `libomt`
library or directory for development and compatibility testing.

## Development

Install a Rust toolchain and Node.js dependencies, then run:

```bash
cd bridge-client
npm install
npm run dev
```

The app lists input/output devices, supported stream configs, max channel
counts, 48 kHz availability and possible stereo channel pairs. After Server URL,
API key and Bridge name are configured, `Announce` loads all bridge endpoints
assigned to this bridge and starts them automatically. The manual stream probe
remains available as a collapsed diagnostic tool.

Useful checks:

```bash
npm run build:ui
npm run prepare:ffmpeg -- --optional
npm run prepare:omt
npm run build:ffmpeg:macos
npm run build:ffmpeg:windows # requires an MSYS2 MinGW shell
npm run build:release
cd src-tauri
cargo check
```

## macOS Test Builds

Unsigned macOS builds downloaded from GitHub are blocked by Gatekeeper because
they are not Developer ID signed and notarized yet. For internal testing, copy
the app to Applications and remove the quarantine flag once:

```bash
xattr -dr com.apple.quarantine "/Applications/Talktome Bridge.app"
```

This is only a test-build workaround. User-facing macOS releases need Apple
Developer ID signing and notarization.

## FFmpeg Sidecar

The Tauri bundle expects the FFmpeg binary under `src-tauri/binaries` using the
target-specific sidecar name, for example:

- `ffmpeg-aarch64-apple-darwin`
- `ffmpeg-x86_64-apple-darwin`
- `ffmpeg-x86_64-pc-windows-msvc.exe`

`npm run build` runs `npm run prepare:ffmpeg` first. The prepare script copies
the binary from `FFMPEG_SIDECAR_SOURCE`, `TALKTOME_FFMPEG` or the first `ffmpeg`
found on `PATH`.

For release builds, use:

```bash
FFMPEG_SIDECAR_URL=https://example.invalid/ffmpeg-portable.zip \
FFMPEG_SIDECAR_ARCHIVE_SHA256=<expected-archive-sha256> \
FFMPEG_SIDECAR_SHA256=<expected-ffmpeg-binary-sha256> \
npm run build:release
```

To evaluate a candidate URL and print the exact hashes without copying it into
the Tauri sidecar directory, run:

```bash
FFMPEG_SIDECAR_URL=https://example.invalid/ffmpeg-portable.zip \
npm run prepare:ffmpeg -- --discover --force
```

`FFMPEG_SIDECAR_URL` can point to a direct binary, `.zip`, `.tar`, `.tar.gz`,
`.tgz`, `.tar.xz` or `.txz` archive. The script extracts the archive and uses
the first `ffmpeg`/`ffmpeg.exe` binary it finds. `FFMPEG_SIDECAR_SOURCE` can
still point to an already downloaded binary.

Target-specific variables override the generic ones, which is useful in CI:

- `FFMPEG_SIDECAR_URL_AARCH64_APPLE_DARWIN`
- `FFMPEG_SIDECAR_ARCHIVE_SHA256_AARCH64_APPLE_DARWIN`
- `FFMPEG_SIDECAR_SHA256_AARCH64_APPLE_DARWIN`
- `FFMPEG_SIDECAR_URL_X86_64_PC_WINDOWS_MSVC`
- `FFMPEG_SIDECAR_ARCHIVE_SHA256_X86_64_PC_WINDOWS_MSVC`
- `FFMPEG_SIDECAR_SHA256_X86_64_PC_WINDOWS_MSVC`

The `Bridge Client Builds` GitHub workflow builds minimal LGPL/libopus FFmpeg
sidecars from pinned source tarballs for macOS arm64 and Windows x64. No
prebuilt FFmpeg binary is downloaded for releases by default.

The source builds use official source archives by default:

- FFmpeg `8.1.2`,
  SHA256 `464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`
- Opus `1.6.1`,
  SHA256 `6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1`

`build:release` refuses a PATH-only FFmpeg and validates that the binary exposes
the `libopus` encoder. It also fails when the binary looks unsuitable for
redistribution, for example when it links against Homebrew libraries or was
built with `--enable-gpl`. A Homebrew FFmpeg binary is useful for local
development, but it can depend on dynamic libraries that are not present on
other Macs.

The Windows source build must run inside an MSYS2 MinGW shell. The GitHub
workflow installs that toolchain automatically.

If a non-portable or GPL-enabled binary is intentionally used for a private test,
set `ALLOW_NON_PORTABLE_FFMPEG=1` explicitly.

## Next Milestones

1. Verify Dante Virtual Soundcard on macOS and Windows.
2. Decide whether parallel native streams are good enough or whether one shared
   stream per device is required.
3. Add per-return-path gain/mute handling for Companion volume commands.
4. Add device-reconnect recovery and long-running soak tests.
5. Add signed Bridge installer builds for macOS and Windows.
6. Add configurable NDI/OMT output names and multichannel network routing.
