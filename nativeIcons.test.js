const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = __dirname;

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath));
}

function pngSize(buffer) {
  assert.deepEqual(
    buffer.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test('native server and bridge use distinct app icon sets', () => {
  for (const filename of ['icon.png', 'icon.ico', 'icon.icns']) {
    const serverIcon = read(`server-app/src-tauri/icons/${filename}`);
    const bridgeIcon = read(`bridge-client/src-tauri/icons/${filename}`);
    assert.notDeepEqual(serverIcon, bridgeIcon, `${filename} must distinguish Bridge`);
  }
});

test('Windows trays use matching dedicated icon dimensions', () => {
  const serverTray = read('server-app/src-tauri/icons/tray-windows.png');
  const bridgeTray = read('bridge-client/src-tauri/icons/tray-windows.png');
  assert.deepEqual(pngSize(serverTray), { width: 64, height: 64 });
  assert.deepEqual(pngSize(bridgeTray), { width: 64, height: 64 });
  assert.notDeepEqual(serverTray, bridgeTray);

  const serverRust = read('server-app/src-tauri/src/lib.rs').toString('utf8');
  const bridgeRust = read('bridge-client/src-tauri/src/lib.rs').toString('utf8');
  assert.match(serverRust, /target_os = "windows"[\s\S]*tray-windows\.png/);
  assert.match(bridgeRust, /target_os = "windows"[\s\S]*tray-windows\.png/);
});
