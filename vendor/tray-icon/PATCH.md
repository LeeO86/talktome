# macOS 27 tray click forwarding backport

Base: crates.io tray-icon 0.24.2 (MIT OR Apache-2.0; licenses included).
Both native apps resolve this shared copy through Cargo's patch mechanism.

The only source modification is the official upstream fix:
https://github.com/tauri-apps/tray-icon/commit/42eb44ea1507d51b68a8b2fbb0d96a9c85f5b4cd
https://github.com/tauri-apps/tray-icon/pull/365

The menu is attached to NSStatusItem only while presented, preserving left
click forwarding on macOS 27. The menu is retained outside RefCell borrows
before entering the nested menu event loop. Windows/Linux code is unchanged.

Tauri 2.11.5 requires tray-icon 0.24; the published fix is in 0.25.1.
Remove both Cargo patches and this directory once a stable compatible Tauri
release includes tray-icon >=0.25.1. Do not upgrade to Tauri 3 alpha for this fix.
