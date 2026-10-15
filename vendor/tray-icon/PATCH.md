# macOS 27 tray click forwarding backport

Base: crates.io tray-icon 0.24.2 (MIT OR Apache-2.0; licenses included).
The Server app resolves this copy through Cargo's patch mechanism. The Bridge
uses upstream 0.25.1, which includes this exact fix, since its Tauri 2.12 update.

The only source modification is the official upstream fix:
https://github.com/tauri-apps/tray-icon/commit/42eb44ea1507d51b68a8b2fbb0d96a9c85f5b4cd
https://github.com/tauri-apps/tray-icon/pull/365

The menu is attached to NSStatusItem only while presented, preserving left
click forwarding on macOS 27. The menu is retained outside RefCell borrows
before entering the nested menu event loop. Windows/Linux code is unchanged.

Tauri 2.11.5 requires tray-icon 0.24; the published fix is in 0.25.1.
Remove the remaining Server Cargo patch and this directory when the Server also
uses a compatible Tauri release with tray-icon >=0.25.1.
