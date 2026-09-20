const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Main and Reply show Space by default but dispatch only Main', () => {
  const source = fs.readFileSync('public/client.js', 'utf8');
  const start = source.indexOf('  function rebuildTargetHotkeyAssignments(');
  const end = source.indexOf('\n  function ', start + 5);
  const context = vm.createContext({
    cachedUsers: [], ensureCustomTargetHotkeysLoaded() {},
    targetHotkeys: new Map(), targetHotkeysByTarget: new Map(),
    hotkeyBindingElements: new Map(), customTargetHotkeys: new Map(),
    DEFAULT_REPLY_HOTKEY_BINDING: { id: 'code:Space' },
    DEFAULT_TARGET_HOTKEY_BINDINGS: [],
    buildTalkTargetDescriptors: () => [
      { identity: 'main', kind: 'main' }, { identity: 'reply', kind: 'reply' },
    ],
  });
  vm.runInContext(source.slice(start, end), context);
  context.rebuildTargetHotkeyAssignments();
  assert.equal(context.targetHotkeys.size, 1);
  assert.equal(context.targetHotkeys.get('code:Space').kind, 'main');
  assert.equal(context.targetHotkeysByTarget.get('main').id, 'code:Space');
  assert.equal(context.targetHotkeysByTarget.get('reply').id, 'code:Space');
  context.customTargetHotkeys.set('main', { id: 'code:KeyM' });
  context.rebuildTargetHotkeyAssignments();
  assert.equal(context.targetHotkeys.get('code:Space').kind, 'reply');
  assert.equal(context.targetHotkeys.get('code:KeyM').kind, 'main');
});

test('status tables sort numbers numerically and maintain independent preferences', () => {
  const source = fs.readFileSync('public/admin.js', 'utf8');
  const start = source.indexOf('function statusSortValue(');
  const end = source.indexOf('function renderAdminStatus(', start);
  const context = vm.createContext({ statusSortPreferences: new Map() });
  vm.runInContext(source.slice(start, end), context);
  const body = { id: 'users', closest: () => null };
  const rows = [{name:'B',networkStats:{roundTripMs:20}}, {name:'A',networkStats:{roundTripMs:100}}];
  context.statusSortPreferences.set('users', {key:'RTT',direction:1});
  context.sortStatusRows(rows, body);
  assert.equal(rows[0].name, 'B');
  context.statusSortPreferences.set('users', {key:'RTT',direction:-1});
  context.sortStatusRows(rows, body);
  assert.equal(rows[0].name, 'A');
  context.sortStatusRows(rows, {id:'feeds',closest:()=>null}, (a,b)=>b.name.localeCompare(a.name));
  assert.equal(rows[0].name, 'B');
});

test('stop transmission control uses the provided icon only for talking users', () => {
  const source = fs.readFileSync('public/admin.js', 'utf8');
  assert.match(source, /user.online && user.talking && Number.isFinite\(userId\)/);
  assert.ok(source.includes('src="/images/mute_mic.png"'));
  assert.ok(fs.existsSync('public/images/mute_mic.png'));
  assert.ok(!source.includes('${stopTransmissionButton}'));
});
