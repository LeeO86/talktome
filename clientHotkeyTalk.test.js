const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, 'public', 'client.js'), 'utf8');

test('offline target hotkeys retain their visual pressed state without starting talk', () => {
  const keydownHandler = source.slice(
    source.indexOf("window.addEventListener('keydown', e => {"),
    source.indexOf("window.addEventListener('keyup', e => {")
  );

  assert.match(keydownHandler, /const liveTalkTarget = resolveLiveTalkTarget\(talkTarget\);/);
  assert.match(keydownHandler, /if \(!liveTalkTarget\) return;/);
  assert.ok(
    keydownHandler.indexOf('setHotkeyAssignmentActiveState(assignment, true);')
      < keydownHandler.indexOf('if (!liveTalkTarget) return;')
  );
  assert.ok(
    keydownHandler.indexOf('if (!liveTalkTarget) return;')
      < keydownHandler.indexOf('handleTalk({')
  );
});

test('hotkey release only stops its own active talk input', () => {
  const keyupHandler = source.slice(source.indexOf("window.addEventListener('keyup', e => {"));

  assert.match(keyupHandler, /const talkInputKey = `hotkey:\$\{bindingId\}`;/);
  assert.match(keyupHandler, /if \(!activeTalkPointers\.has\(talkInputKey\)\) return;/);
  assert.match(keyupHandler, /talkInputKey,/);
});

test('a scoped hotkey release preserves other visually pressed hotkeys', () => {
  const stopHandler = source.slice(
    source.indexOf('function handleStopTalking(e) {'),
    source.indexOf("socket.on('force-stop-transmission'")
  );

  assert.match(
    stopHandler,
    /if \(inputKey === null\) \{\s*clearHotkeyActiveStyles\(\);\s*pressedHotkeyBindings\.clear\(\);\s*\}/
  );
});
