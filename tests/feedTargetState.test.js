const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/client.js'), 'utf8');
function classes() {
  const values = new Set();
  return { contains: value => values.has(value), add: value => values.add(value), remove: value => values.delete(value),
    toggle(value, enabled) { if (enabled) values.add(value); else values.delete(value); } };
}
function harness(key = 'feed-3') {
  const icon = { classList: classes() };
  const speaker = {};
  const mute = { classList: classes(), querySelector: () => speaker };
  const reception = { classList: classes(), setAttribute() {} };
  const row = { id: key, classList: classes(), querySelector(selector) {
    if (selector === '.mute-btn') return mute;
    if (selector === '.feed-reception-btn') return reception;
    if (selector.endsWith('-icon')) return icon;
    return null;
  } };
  const consumer = { paused: false, pause() { this.paused = true; }, resume() { this.paused = false; } };
  const pauses = [];
  const context = vm.createContext({
    document: { getElementById: () => row }, activeFeedKeys: new Set(), stoppedFeedKeys: new Set(),
    speakingPeers: new Set(), mutedPeers: new Set(), isFeedKey: key => key.startsWith('feed-'),
    hasActiveTalkLocks: () => false, applyFeedDucking() {},
    collectConsumersForTarget: () => [consumer], emitConsumerPauseState: (_, paused) => pauses.push(paused),
    forEachStreamEntry() {}, applyingClientPanelSettings: true, session: {}, isOperatorSession: () => true,
    FEED_RECEPTION_ICONS: { play: 'play', stop: 'stop' }, UI_ICONS: { speakerMuted: 'muted.svg', speakerOn: 'on.svg' },
  });
  for (const name of ['isTargetSpeaking', 'updateFeedOnlineUi', 'updateSpeakerHighlight', 'updateFeedReceptionUi', 'setFeedReceptionStopped', 'applyMuteVisualState']) {
    const start = source.indexOf(`  function ${name}(`);
    const next = source.indexOf('\n  function ', start + 1);
    vm.runInContext(source.slice(start, next), context);
  }
  return { context, row, icon, speaker, mute, consumer, pauses };
}

test('feed availability and local stop independently control grey styling and green border', () => {
  const h = harness();
  const { context: c, row } = h;
  c.updateSpeakerHighlight('feed-3', false);
  assert(row.classList.contains('is-offline'));
  assert(!row.classList.contains('speaking'));
  c.activeFeedKeys.add('feed-3');
  c.updateSpeakerHighlight('feed-3', true);
  assert(!row.classList.contains('is-offline'));
  assert(row.classList.contains('speaking'));
  c.setFeedReceptionStopped('feed-3', true);
  assert(!row.classList.contains('is-offline'), 'sender stays online when receiver stops');
  assert(!row.classList.contains('speaking'));
  assert(h.consumer.paused);
  c.updateSpeakerHighlight('feed-3', true);
  assert(!row.classList.contains('speaking'), 'incoming updates must respect local stop');
  c.mutedPeers.add('feed-3');
  c.setFeedReceptionStopped('feed-3', false);
  c.applyMuteVisualState(row, true);
  assert(row.classList.contains('speaking'), 'mute does not disable reception');
  assert.equal(h.speaker.src, 'muted.svg');
  assert(!h.consumer.paused);
  assert.deepEqual(h.pauses, [true, false]);
  c.activeFeedKeys.clear();
  c.updateSpeakerHighlight('feed-3', false);
  assert(row.classList.contains('is-offline'));
  assert(!row.classList.contains('speaking'));
});

test('mute changes only the speaker control for users, conferences and feeds', () => {
  for (const key of ['user-1', 'conf-2', 'feed-3']) {
    const h = harness(key);
    h.context.applyMuteVisualState(h.row, true);
    assert(h.mute.classList.contains('muted'));
    assert.equal(h.speaker.src, 'muted.svg');
    assert.equal(h.mute.title, 'Unmute');
    assert(!h.icon.classList.contains('muted'));
    h.context.applyMuteVisualState(h.row, false);
    assert(!h.mute.classList.contains('muted'));
    assert.equal(h.speaker.src, 'on.svg');
  }
});
