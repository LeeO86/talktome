const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts), 'utf8');

test('admin and bridge expose production selection for user and feed endpoints', () => {
  const adminSource = read('public', 'admin.js');
  const bridgeSource = read('bridge-client', 'src', 'app.js');

  assert.match(adminSource, /bridge-production-\$\{user\.id\}/);
  assert.match(adminSource, /bridge-production-\$\{formKey\}/);
  assert.match(bridgeSource, /data-field="production"/);
  assert.match(bridgeSource, /productionId: draft\.productionId/);
  assert.match(bridgeSource, /productionId: port\.productionId \?\? null/);
});

test('bridge sessions and runtime config carry the selected production', () => {
  const serverSource = read('serverCore.js');

  assert.match(serverSource, /productionId: selectedProduction\?\.id \?\? null/);
  assert.match(serverSource, /productionId: port\.productionId == null \? null : Number\(port\.productionId\)/);
  assert.match(serverSource, /arePeersInSameActiveProduction\(speakerPeer, peer\)/);
});
