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
