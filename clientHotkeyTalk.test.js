const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'public', 'client.js'), 'utf8');

test('offline target hotkeys never enter the pressed talk state', () => {
  const keydownHandler = source.slice(
    source.indexOf("window.addEventListener('keydown', e => {"),
    source.indexOf("window.addEventListener('keyup', e => {")
  );

  assert.match(keydownHandler, /const liveTalkTarget = resolveLiveTalkTarget\(talkTarget\);/);
  assert.match(keydownHandler, /if \(!liveTalkTarget\) return;/);
  assert.ok(
    keydownHandler.indexOf('if (!liveTalkTarget) return;')
      < keydownHandler.indexOf('pressedHotkeyBindings.add(bindingId);')
  );
});

test('hotkey release only stops its own active talk input', () => {
  const keyupHandler = source.slice(source.indexOf("window.addEventListener('keyup', e => {"));

  assert.match(keyupHandler, /const talkInputKey = `hotkey:\$\{bindingId\}`;/);
  assert.match(keyupHandler, /if \(!activeTalkPointers\.has\(talkInputKey\)\) return;/);
  assert.match(keyupHandler, /talkInputKey,/);
});
