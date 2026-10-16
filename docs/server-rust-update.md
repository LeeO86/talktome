# Server Rust runtime update

PR #156 moves the native Server app from Tauri 2.11.5 to 2.12.4, matching the
Bridge runtime. The build tooling moves to 2.7.3, autostart to 2.7.0 and
single-instance handling to 2.5.3. The checked-in lockfile is the source of truth;
the original Dependabot description listed an earlier Tauri patch version.

## macOS tray fix

Both apps now use published `tray-icon` 0.25.1. Its
[release notes](https://github.com/tauri-apps/tray-icon/releases/tag/tray-icon-v0.25.1)
include the [menu-presentation fix](https://github.com/tauri-apps/tray-icon/commit/42eb44ea1507d51b68a8b2fbb0d96a9c85f5b4cd)
previously backported into `vendor/tray-icon` for macOS 27. Both menu presentation
paths in the published source retain that fix.

The old Cargo patch was already unused by the updated dependency graph. It and
the vendor copy are removed. The regression tests require one published 0.25.x
tray package, starting at the reviewed 0.25.1 release. A new minor release still
requires review.

## Retained behavior

The explicit Tauri feature list is unchanged. `compression` and `dynamic-acl`
remain disabled. Existing capability grants and command definitions are
unchanged; regenerated schemas add definitions for upstream commands without
granting them. The direct `window-vibrancy` dependency remains pinned to 0.6.0.

Autostart still uses the explicitly selected LaunchAgent mode on macOS. The
plugin update does not switch the app to SMAppService registration. Server
configuration, managed restarts, browser/audio protocols and the Bridge code are
unchanged.

## Validation

- JavaScript tests: 211 passed, including both published tray version guards.
- Server Rust tests: 7 passed with `cargo test --locked --lib`.
- Vite frontend and locked native macOS release/app bundle builds passed.
- The bundled native tray app started with isolated data, a freshly packaged
  Node server, a ready mediasoup router and the expected version on its health
  endpoint.
- Cargo feature resolution confirms that compression and runtime ACL mutation
  remain disabled; npm production audit reports no advisories.

Reproduce the native package and startup check with Node 24 and the platform's
Rust/native build tools:

```sh
npm ci
npm test
npm run build:mac_arm64
cd server-app
npm ci
npm run prepare:server -- --force
npm run build -- --bundles app -- --locked
cd ..
cargo test --locked --manifest-path server-app/src-tauri/Cargo.toml --lib
node scripts/native-startup-smoke-test.mjs --mode tray \
  --executable 'server-app/src-tauri/target/release/bundle/macos/Talktome Server.app/Contents/MacOS/talktome-server-app' \
  --timeout-seconds 60
```
