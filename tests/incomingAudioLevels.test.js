const test = require('node:test');
const assert = require('node:assert/strict');
const { levelToPercent, createSampler, createMonitor } = require('../public/incomingAudioLevels');

const binding = (id, targetKey, extra = {}) => ({ id, targetKey, trackId: `track-${id}`, ...extra });
const inbound = (id, extra = {}) => ({
  id: `stat-${id}`, type: 'inbound-rtp', kind: 'audio', trackIdentifier: `track-${id}`,
  packetsReceived: 10, totalSamplesDuration: 1, totalAudioEnergy: 0.01, ...extra,
});
const report = (...stats) => new Map(stats.map((stat) => [stat.id, stat]));

test('maps RMS levels to a bounded -90 to 0 dBFS display, including quiet noise', () => {
  assert.equal(levelToPercent(0), 0);
  assert.equal(levelToPercent(0.00001), 0);
  assert.equal(levelToPercent(10 ** (-90 / 20)), 0);
  assert(Math.abs(levelToPercent(0.0001) - 100 / 9) < 1e-9, '-80 dBFS noise occupies about 4 px of the meter');
  assert(Math.abs(levelToPercent(0.001) - 100 / 3) < 1e-9);
  assert(Math.abs(levelToPercent(0.01) - 500 / 9) < 1e-9);
  assert(Math.abs(levelToPercent(0.1) - 700 / 9) < 1e-9);
  assert.equal(levelToPercent(1), 100);
  assert.equal(levelToPercent(2), 100);
  assert.equal(levelToPercent(NaN), 0);
});

test('uses interval energy rather than lifetime averages or stale audioLevel', () => {
  const sampler = createSampler();
  const bindings = [binding('a', 'user-1')];
  assert.equal(sampler.sample(report(inbound('a')), bindings).get('user-1'), 0);
  const current = inbound('a', {
    packetsReceived: 20, totalSamplesDuration: 2, totalAudioEnergy: 0.05, audioLevel: 0.9,
  });
  assert(Math.abs(sampler.sample(report(current), bindings).get('user-1') - 0.2) < 1e-9);
  assert.equal(sampler.sample(report(current), bindings).get('user-1'), 0, 'stopped producer clears its meter');
  sampler.reset();
  assert.equal(sampler.sample(report(current), bindings).get('user-1'), 0);
});

test('matches incoming tracks and SSRCs to users, feeds and conference contributors', () => {
  const sampler = createSampler();
  const bindings = [binding('a', 'user-1'), binding('b', 'feed-2', { trackId: null, ssrcs: [123] }),
    binding('c', 'conf-3'), binding('d', 'conf-3')];
  const first = ['a', 'b', 'c', 'd'].map((id) => inbound(id, { ssrc: id === 'b' ? 123 : undefined }));
  sampler.sample(report(...first), bindings);
  const levels = sampler.sample(report(...first.map((stat, index) => ({
    ...stat, packetsReceived: 20, totalSamplesDuration: 2,
    totalAudioEnergy: 0.01 + [0.01, 0.04, 0.09, 0.16][index],
  })), inbound('out', { type: 'outbound-rtp', audioLevel: 1 }),
  inbound('video', { kind: 'video', audioLevel: 1 })), bindings);
  assert(Math.abs(levels.get('user-1') - 0.1) < 1e-9);
  assert(Math.abs(levels.get('feed-2') - 0.2) < 1e-9);
  assert(Math.abs(levels.get('conf-3') - 0.4) < 1e-9);
  assert.equal(levels.size, 3);
});

test('falls back to audioLevel, distinguishes unsupported stats, and clears paused or replaced tracks', () => {
  const sampler = createSampler();
  const bindings = [binding('a', 'user-1')];
  const stat = inbound('a', { totalAudioEnergy: undefined, totalSamplesDuration: undefined, audioLevel: 0.3 });
  sampler.sample(report(stat), bindings);
  assert.equal(sampler.sample(report({ ...stat, packetsReceived: 20 }), bindings).get('user-1'), 0.3);
  assert.equal(sampler.sample(report({ ...stat, packetsReceived: 30 }), [{ ...bindings[0], paused: true }]).get('user-1'), 0);
  assert.equal(sampler.sample(report({ ...stat, packetsReceived: 40 }), bindings).get('user-1'), 0);
  assert.equal(sampler.sample(report({ ...stat, audioLevel: undefined }), bindings).get('user-1'), null);
  assert.equal(sampler.sample(report(), bindings).get('user-1'), 0);
  assert.equal(sampler.sample(report({ ...stat, packetsReceived: 50 }), bindings).get('user-1'), 0);
});

test('uses fresh RTP source levels for stereo streams even when browser energy statistics stay zero', () => {
  const sampler = createSampler();
  const stat = inbound('a', { totalAudioEnergy: 0, audioLevel: 0 });
  const source = { source: 123, timestamp: 1000, audioLevel: 0.2 };
  const bindings = [binding('a', 'feed-1', { sources: [source] })];
  assert.equal(sampler.sample(report(stat), bindings).get('feed-1'), 0);
  bindings[0].sources = [{ ...source, timestamp: 1100 }];
  assert.equal(sampler.sample(report(stat), bindings).get('feed-1'), 0.2);
  assert.equal(sampler.sample(report(stat), bindings).get('feed-1'), 0, 'retained RTP source must not leave a stale level');
  bindings[0].sources = [{ ...source, timestamp: 1200, audioLevel: 0 }];
  assert.equal(sampler.sample(report(stat), bindings).get('feed-1'), 0, 'silent packets show silence');
});

function monitorHarness() {
  let calls = 0;
  let pendingResolve;
  const timers = new Map();
  const updates = [];
  let bindings = [binding('a', 'user-1')];
  let transport = { getStats: () => { calls += 1; return new Promise((resolve) => { pendingResolve = resolve; }); } };
  const monitor = createMonitor({
    getTransport: () => transport, getBindings: () => bindings,
    onLevels: (levels) => updates.push(levels),
    schedule: (fn) => { const id = Symbol(); timers.set(id, fn); return id; },
    cancel: (id) => timers.delete(id),
  });
  return { monitor, timers, updates, get calls() { return calls; },
    setBindings(value) { bindings = value; }, setTransport(value) { transport = value; },
    async resolve(stats = report()) { pendingResolve(stats); await Promise.resolve(); },
    tick() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); },
  };
}

test('polls once per transport only while enabled, with consumers, without overlapping requests', async () => {
  const h = monitorHarness();
  h.monitor.refresh();
  assert.equal(h.calls, 0);
  h.monitor.setEnabled(true);
  h.monitor.refresh();
  assert.equal(h.calls, 1);
  assert.equal(h.timers.size, 0);
  await h.resolve(report(inbound('a')));
  assert.equal(h.timers.size, 1);
  h.tick();
  assert.equal(h.calls, 2);
  await h.resolve(report(inbound('a', { packetsReceived: 20, totalAudioEnergy: 0.05, totalSamplesDuration: 2 })));
  assert(h.updates.at(-1).get('user-1') > 0);
  h.setBindings([]);
  h.monitor.refresh();
  assert.equal(h.timers.size, 0);
  assert.equal(h.updates.at(-1).size, 0);
});

test('disabling or hiding the UI ignores an in-flight result and cancels polling', async () => {
  const h = monitorHarness();
  h.monitor.setEnabled(true);
  h.monitor.setEnabled(false);
  const count = h.updates.length;
  await h.resolve(report(inbound('a')));
  assert.equal(h.updates.length, count);
  assert.equal(h.timers.size, 0);
  h.monitor.setEnabled(true);
  assert.equal(h.calls, 2);
  await h.resolve();
  h.monitor.setEnabled(false);
  assert.equal(h.timers.size, 0);
});

test('RTP source levels avoid additional getStats requests when available', () => {
  const h = monitorHarness();
  const source = { source: 123, timestamp: 1000, audioLevel: 0.2 };
  h.setBindings([binding('a', 'feed-1', { sources: [source] })]);
  h.monitor.setEnabled(true);
  assert.equal(h.calls, 0);
  assert.equal(h.timers.size, 1);
  h.setBindings([binding('a', 'feed-1', { sources: [{ ...source, timestamp: 1100 }] })]);
  h.tick();
  assert.equal(h.updates.at(-1).get('feed-1'), 0.2);
  assert.equal(h.calls, 0);
  h.monitor.setEnabled(false);
  assert.equal(h.timers.size, 0);
});
