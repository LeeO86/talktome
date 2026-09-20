const test = require('node:test');
const assert = require('node:assert/strict');
const defaults = require('./defaultClientSettings');
const audio = require('./public/userAudioSettings');

test('dim options and defaults use -15 dB consistently', () => {
  assert.deepEqual(defaults.DIM_AMOUNT_DB_OPTIONS, audio.DIM_AMOUNT_DB_OPTIONS);
  assert.ok(audio.DIM_AMOUNT_DB_OPTIONS.includes(-15));
  assert.ok(!audio.DIM_AMOUNT_DB_OPTIONS.includes(-14));
  assert.equal(defaults.resolveDefaultClientSettings({}).dimAmountDb, -15);
  assert.equal(audio.resolve({}).dimAmountDb, -15);
});

test('stored -14 dB settings migrate to -15 dB, including strict imports', () => {
  assert.equal(defaults.normalizeConfiguredDefaultClientSettings({ dimAmountDb: -14 }, { strict: true }).dimAmountDb, -15);
  assert.equal(audio.normalize({ dimAmountDb: -14 }, { strict: true }).dimAmountDb, -15);
  assert.equal(audio.normalize({ dimAmountDb: -18 }).dimAmountDb, -18);
});
