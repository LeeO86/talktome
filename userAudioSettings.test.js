const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { DEFAULTS, normalize, resolve } = require('./public/userAudioSettings');

test('normalizes complete per-user audio settings', () => {
  assert.deepEqual(normalize({
    audioProfile: 'low',
    dimAmountDb: -18,
    dimFeedsWhileSpeaking: true,
    dimWhenAddressed: false,
    audioAutoProcessing: true,
    leftHandMode: true,
    lockMultipleTargets: true,
    userInputGainDb: 12.5,
    voiceTriggerEnabled: true,
    voiceTriggerTarget: 'conference:42',
    voiceTriggerThresholdDb: -28,
  }, { strict: true }), {
    audioProfile: 'low',
    dimAmountDb: -18,
    dimFeedsWhileSpeaking: true,
    dimWhenAddressed: false,
    audioAutoProcessing: true,
    leftHandMode: true,
    lockMultipleTargets: true,
    userInputGainDb: 12.5,
    voiceTriggerEnabled: true,
    voiceTriggerTarget: 'conference:42',
    voiceTriggerThresholdDb: -28,
  });
});

test('resolves missing values and rejects unsafe settings', () => {
  assert.deepEqual(resolve(null), DEFAULTS);
  assert.throws(() => normalize({ userInputGainDb: 80 }, { strict: true }), /mic gain/);
  assert.throws(() => normalize({ voiceTriggerTarget: 'feed:1' }, { strict: true }), /trigger target/);
});

test('admin and client share the per-user audio settings model', () => {
  const adminHtml = fs.readFileSync(path.join(__dirname, 'public', 'admin.html'), 'utf8');
  const clientHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  const adminScript = fs.readFileSync(path.join(__dirname, 'public', 'admin.js'), 'utf8');
  const clientScript = fs.readFileSync(path.join(__dirname, 'public', 'client.js'), 'utf8');

  assert.match(adminHtml, /src="\/userAudioSettings\.js"/);
  assert.match(clientHtml, /src="\/userAudioSettings\.js"/);
  assert.match(adminScript, /openUserAudioSettings/);
  assert.match(adminScript, /user-settings-icon/);
  assert.match(clientScript, /user-audio-settings-update/);
  assert.match(clientScript, /user-audio-settings-updated/);
});
