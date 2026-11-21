# Tauri feature audit

Server and Bridge use an explicit Tauri feature list. This change keeps the
locked Tauri version (2.11.5) and all retained dependency versions unchanged.

The dependency and executable measurements below were made at `4e068a9` before
the subsequent npm dependency updates. They describe the isolated feature change,
not a size benchmark for later releases.

## Feature decisions

| Feature | Decision | Reason |
| --- | --- | --- |
| `wry` | Keep | Both apps render their settings UI in a native WebView. |
| `tray-icon` | Keep | The tray menu opens the initially hidden window. |
| `macos-private-api` | Keep | Transparent panel windows and the custom macOS title bar use native window APIs. |
| `common-controls-v6` | Keep | Preserve the existing Windows controls/menu integration. |
| `x11`, `dbus` | Keep | Preserve the existing Linux desktop backend support. |
| `dynamic-acl` | Disable | Both apps declare their capabilities in JSON at build time; neither app nor its plugins adds capabilities at runtime. Static capability enforcement and the Bridge URL allowlist remain active. |
| `compression` | Disable | The local frontends are only 17,387 bytes (Server) and 86,001 bytes (Bridge). Embedding them directly saves more executable space than Brotli compression saves in assets. |

Autostart, single-instance handling and Bridge's URL opener are used and retained.
Features such as devtools and the asset protocol were already disabled.
Build-time JSON configuration support is retained because both apps use
`tauri.conf.json` and static capability files.

Tauri documents [runtime ACL support](https://docs.rs/tauri/2.11.5/tauri/#cargo-features).
Cargo's [feature unification](https://doc.rust-lang.org/cargo/reference/features.html#feature-unification)
was checked with `cargo tree -e features -i tauri`: no dependency re-enables
`dynamic-acl` or `compression`.

## Dependency measurement

Counts below are distinct package versions in `cargo tree -e normal,build`,
excluding the application crate. They include build dependencies and procedural
macros for the selected target, rather than every entry in `Cargo.lock`.

| App | Target | Before | After |
| --- | --- | ---: | ---: |
| Server | macOS arm64 | 244 | 240 |
| Server | Windows x64 | 249 | 245 |
| Server | Linux x64 | 326 | 322 |
| Bridge | macOS arm64 | 286 | 282 |
| Bridge | Windows x64 | 295 | 291 |
| Bridge | Linux x64 | 360 | 356 |

Each app drops `brotli`, `brotli-decompressor`, `alloc-stdlib` and
`alloc-no-stdlib`. Lockfile changes only prune those four packages and their
references; the local `tray-icon` patch was retained at the time of this audit.
The subsequent [Server Rust update](server-rust-update.md) removes the last
backport after both apps adopt the published fix.

## Executable measurement

Both variants were built from the same checkout path with the same frontend,
sidecars, Rust 1.96.0, macOS 15.5 SDK and default Cargo release profile on macOS
arm64. Sizes are the native controller executables; Server's Node executable,
FFmpeg, NDI/OMT runtimes and other bundled resources are separate.

| Executable | Before, bytes | After, bytes | Saved |
| --- | ---: | ---: | ---: |
| Server | 10,372,480 | 9,964,096 | 408,384 bytes (3.94%) |
| Bridge | 14,538,672 | 14,132,528 | 406,144 bytes (2.79%) |

Build timings use warmed local caches and are unsuitable as a performance
comparison. Windows/Linux figures above describe dependency resolution;
native executable sizes were measured on macOS arm64.

## Validation

- Both Vite UI builds and both locked native macOS release builds pass.
- Server Rust tests: 7 passed.
- Bridge Rust tests: 22 passed; 6 existing hardware/runtime tests remain ignored.
- JavaScript tests: 210 passed.
- Server tray startup smoke test passes with a freshly packaged current Server
  sidecar, including health/version checks and a ready mediasoup router.
- Bridge's release executable remains running during an eight-second startup
  check with isolated settings. Audio hardware/streaming was not exercised.

Reproduce the graph and build checks with:

```sh
cargo tree --locked --manifest-path server-app/src-tauri/Cargo.toml --target aarch64-apple-darwin -e normal,build
cargo tree --locked --manifest-path bridge-client/src-tauri/Cargo.toml --target aarch64-apple-darwin -e normal,build
cargo build --release --locked --manifest-path server-app/src-tauri/Cargo.toml
cargo build --release --locked --manifest-path bridge-client/src-tauri/Cargo.toml
cargo test --locked --manifest-path server-app/src-tauri/Cargo.toml --lib
cargo test --locked --manifest-path bridge-client/src-tauri/Cargo.toml --lib
npm test
```
