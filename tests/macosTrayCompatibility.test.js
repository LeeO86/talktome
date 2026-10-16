const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function cargoPackageEntries(lock) {
  return lock.split(/(?=^\[\[)/m).filter(section => /^\[\[package\]\]\r?\n/.test(section));
}

test('unused Cargo patches are not counted as resolved packages', () => {
  const lock = `version = 4

[[package]]
name = "tray-icon"
version = "0.25.1"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "zvariant_utils"
version = "4.2.0"

[[patch.unused]]
name = "tray-icon"
version = "0.24.2"
`;
  const entries = cargoPackageEntries(lock);
  const trays = entries.filter(entry => /^\s*name = "tray-icon"\s*$/m.test(entry));
  assert.equal(trays.length, 1);
  assert.match(trays[0], /^version = "0\.25\.1"$/m);
  assert.doesNotMatch(entries.join('\n'), /\[\[patch\.unused\]\]/);
});

for (const [directory, label] of [['server-app', 'Server app'], ['bridge-client', 'Bridge']]) {
  test(`the ${label} uses the published macOS tray fix`, () => {
    const manifest = fs.readFileSync(`${directory}/src-tauri/Cargo.toml`, 'utf8');
    assert.doesNotMatch(manifest, /\[patch\.crates-io\]/);
    const lock = fs.readFileSync(`${directory}/src-tauri/Cargo.lock`, 'utf8');
    const entries = cargoPackageEntries(lock).filter(entry => /^\s*name = "tray-icon"\s*$/m.test(entry));
    assert.equal(entries.length, 1);
    // Upstream 0.25.1 includes the menu-presentation fix formerly backported locally:
    // https://github.com/tauri-apps/tray-icon/releases/tag/tray-icon-v0.25.1
    // Review a new minor release before relaxing this version guard.
    assert.match(entries[0], /^version = "0\.25\.([1-9]\d*)"$/m);
    assert.match(entries[0], /^source = "registry\+https:\/\/github\.com\/rust-lang\/crates.io-index"$/m);
  });
}

test('macOS bridge toggles once on press without the release debounce', () => {
  const source = fs.readFileSync('bridge-client/src-tauri/src/lib.rs', 'utf8');
  assert.match(source, /#\[cfg\(target_os = "macos"\)\]\s*TrayIconEvent::Click\s*\{[^}]*button_state: MouseButtonState::Down,[^}]*\}\s*=> toggle_main_window_from_tray\(tray.app_handle\(\), rect\)/);
  assert.match(source, /#\[cfg\(all\(not\(target_os = "windows"\), not\(target_os = "macos"\)\)\)\]/);
});

test('bridge focus-loss check and hide run together on the main event loop', () => {
  const source = fs.readFileSync('bridge-client/src-tauri/src/lib.rs', 'utf8');
  const handler = source.split('fn hide_main_window_after_focus_check(')[1].split('\nfn ')[0];
  assert.match(handler, /run_on_main_thread\(move \|\| \{[\s\S]*is_focused\(\)[\s\S]*should_suppress_hide\(\)[\s\S]*window.hide\(\)/);
});

test('background bridge inventory and announce do not change focus protection', () => {
  const source = fs.readFileSync('bridge-client/src/app.js', 'utf8');
  for (const name of ['refreshManagedInventoryOnly', 'announceBridge']) {
    const body = source.split(`async function ${name}(`)[1]?.split('\nasync function ')[0]?.split('\nfunction ')[0];
    assert.ok(body, name);
    assert.doesNotMatch(body, /suppressWindowFocusHide\(/, name);
  }
  assert.doesNotMatch(source, /suppressWindowFocusHide\(900\)/);
});
