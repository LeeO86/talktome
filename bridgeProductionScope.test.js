const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts), 'utf8');

test('admin and bridge keep user and feed endpoints production-free', () => {
  const adminSource = read('public', 'admin.js');
  const bridgeSource = read('bridge-client', 'src', 'app.js');

  assert.doesNotMatch(adminSource, /bridge-production-/);
  assert.doesNotMatch(adminSource, /bridge_production/);
  assert.doesNotMatch(bridgeSource, /data-field="production"/);
  assert.doesNotMatch(bridgeSource, /productionId: draft\.productionId/);
  assert.doesNotMatch(bridgeSource, /productionId: port\.productionId/);
});

test('bridge sessions are global and conferences cross production boundaries', () => {
  const serverSource = read('serverCore.js');

  assert.match(serverSource, /getBridgeTargetsForUser\(userId\)/);
  assert.match(serverSource, /productionId: null/);
  assert.match(serverSource, /canRouteTargetBetweenPeers\(/);
});

test('server delegates login production fallback to the tested selection policy', () => {
  const serverSource = read('serverCore.js');

  assert.match(serverSource, /resolveActiveProductionSelection\(\{/);
  assert.match(serverSource, /memberships,/);
});
