# Bridge Rust runtime update

This change carries forward the dependency group from the closed PR #150, with
Tauri 2.12.4 and its matching build tools. The JavaScript and Rust URL opener
components now both use 2.7.1. The Server's Rust dependency update (#153) remains
separate.

## macOS tray compatibility

Tauri 2.12 uses upstream `tray-icon` 0.25.1. That release contains the exact
[menu-presentation fix](https://github.com/tauri-apps/tray-icon/commit/42eb44ea1507d51b68a8b2fbb0d96a9c85f5b4cd)
previously backported into `vendor/tray-icon`:

- Menus are attached to the status item only during presentation.
- The menu is retained outside the `RefCell` borrow before the nested event loop.
- The menu is detached again after `performClick` returns.

The [0.25.1 release notes](https://github.com/tauri-apps/tray-icon/releases/tag/tray-icon-v0.25.1)
confirm inclusion of this fix. Bridge therefore drops its obsolete Cargo patch.
Server still uses Tauri 2.11 and retains the local backport and its regression
test. The Bridge regression test separately requires the reviewed upstream
0.25 patch series starting at 0.25.1; a future minor release requires review.

## Retained behavior

The explicit Tauri features from the feature audit remain in place. Runtime ACL
mutation and Brotli asset compression stay disabled. Static capabilities, the
URL allowlist, native window/tray behavior, single-instance handling and
autostart remain enabled. Bridge media protocols and application commands do
not change.

The direct `window-vibrancy` dependency remains at 0.6.0 for the application's
existing macOS panel integration. Tauri may independently use a newer version.
