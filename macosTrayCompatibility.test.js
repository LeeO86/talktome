const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('both native apps resolve the shared macOS tray backport', () => {
  for (const app of ['server-app', 'bridge-client']) {
    const manifest = fs.readFileSync(`${app}/src-tauri/Cargo.toml`, 'utf8');
    assert.match(manifest, /\[patch\.crates-io\][\s\S]*tray-icon = \{ path = "\.\.\/\.\.\/vendor\/tray-icon" \}/);
    const lock = fs.readFileSync(`${app}/src-tauri/Cargo.lock`, 'utf8');
    const entry = lock.split('[[package]]').find(entry => entry.includes('name = "tray-icon"'));
    assert.ok(entry);
    assert.doesNotMatch(entry, /source =/);
  }
});

test('tray menu is attached only during presentation', () => {
  const source = fs.readFileSync('vendor/tray-icon/src/platform_impl/macos/mod.rs', 'utf8');
  const assignments = source.split('\n').filter(line => line.includes('.setMenu('));
  assert.equal(assignments.length, 4);
  assert.match(source, /setMenu\(Some\(menu\)\);\s*button\.performClick\(None\);\s*ns_status_item\.setMenu\(None\)/);
  assert.match(source, /setMenu\(menu\.as_deref\(\)\);\s*ns_button\.performClick\(None\);\s*status_item\.setMenu\(None\)/);
});

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
