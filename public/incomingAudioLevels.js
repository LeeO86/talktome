(function initIncomingAudioLevels(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TalktomeIncomingAudioLevels = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createIncomingAudioLevelsApi() {
  const MIN_DB = -90;

  function levelToPercent(level) {
    if (!Number.isFinite(level) || level <= 0) return 0;
    return Math.max(0, Math.min(100, (20 * Math.log10(level) - MIN_DB) / -MIN_DB * 100));
  }

  function createSampler() {
    const previous = new Map();
    return {
      reset() { previous.clear(); },
      sample(report, bindings) {
        const byTrack = new Map();
        const bySsrc = new Map();
        report.forEach((stat) => {
          if (stat.type !== 'inbound-rtp' || (stat.kind || stat.mediaType) !== 'audio') return;
          if (stat.trackIdentifier) byTrack.set(stat.trackIdentifier, stat);
          if (stat.ssrc !== undefined) bySsrc.set(String(stat.ssrc), stat);
        });
        const levels = new Map();
        const seen = new Set();
        for (const binding of bindings) {
          if (!binding.targetKey) continue;
          if (!levels.has(binding.targetKey)) levels.set(binding.targetKey, 0);
          if (binding.paused) continue;
          const stat = byTrack.get(binding.trackId)
            || (binding.ssrcs || []).map((ssrc) => bySsrc.get(String(ssrc))).find(Boolean);
          const key = binding.id;
          seen.add(key);
          const last = previous.get(key);
          const sources = (binding.sources || []).filter((source) => (
            Number.isFinite(source.audioLevel) && Number.isFinite(source.timestamp)
          ));
          previous.set(key, { stat, sources: new Map(sources.map((source) => [source.source, source.timestamp])) });
          // RTP header levels also work for stereo streams where some browsers
          // expose a constant zero in inbound-rtp energy/audioLevel statistics.
          if (sources.length) {
            const fresh = sources.filter((source) => last?.sources.has(source.source)
              && last.sources.get(source.source) !== source.timestamp);
            const level = Math.max(0, ...fresh.map((source) => source.audioLevel));
            levels.set(binding.targetKey, Math.max(levels.get(binding.targetKey) || 0, level));
            continue;
          }
          if (!stat) continue;
          const hasEnergy = Number.isFinite(stat.totalAudioEnergy) && Number.isFinite(stat.totalSamplesDuration);
          const supported = hasEnergy || Number.isFinite(stat.audioLevel);
          if (!supported) {
            if (levels.get(binding.targetKey) === 0) levels.set(binding.targetKey, null);
            continue;
          }
          // A paused producer can leave audioLevel frozen at its last value.
          // Only advancing receive counters represent newly arriving audio.
          const lastStat = last?.stat;
          if (!lastStat || stat.id !== lastStat.id || stat.packetsReceived <= lastStat.packetsReceived) continue;
          let level = 0;
          const duration = stat.totalSamplesDuration - lastStat.totalSamplesDuration;
          const energy = stat.totalAudioEnergy - lastStat.totalAudioEnergy;
          if (hasEnergy && duration > 0 && energy >= 0) level = Math.sqrt(energy / duration);
          else if (Number.isFinite(stat.audioLevel)) level = stat.audioLevel;
          // Show the strongest incoming contributor on a conference target.
          levels.set(binding.targetKey, Math.max(levels.get(binding.targetKey) || 0, level));
        }
        for (const key of previous.keys()) if (!seen.has(key)) previous.delete(key);
        return levels;
      },
    };
  }

  function createMonitor({ getTransport, getBindings, onLevels, intervalMs = 100,
    schedule = setTimeout, cancel = clearTimeout }) {
    const sampler = createSampler();
    let enabled = false;
    let transport = null;
    let timer = null;
    let running = false;
    let generation = 0;

    function stop() {
      generation += 1;
      running = false;
      if (timer !== null) cancel(timer);
      timer = null;
      transport = null;
      sampler.reset();
      onLevels(new Map());
    }

    function refresh() {
      const next = enabled ? getTransport() : null;
      if (!next || next.closed || !getBindings().length) {
        stop();
        return;
      }
      if (running && transport === next) return;
      stop();
      transport = next;
      running = true;
      const token = generation;
      async function poll() {
        timer = null;
        const bindings = getBindings();
        if (!bindings.length || next.closed) { stop(); return; }
        try {
          const needsStats = bindings.some((binding) => !binding.paused
            && !(binding.sources || []).some((source) => Number.isFinite(source.audioLevel)
              && Number.isFinite(source.timestamp)));
          const report = needsStats ? await next.getStats() : new Map();
          if (token !== generation) return;
          onLevels(sampler.sample(report, bindings));
        } catch {
          if (token !== generation) return;
          sampler.reset();
          onLevels(new Map());
        }
        if (token === generation) timer = schedule(poll, intervalMs);
      }
      void poll();
    }

    return {
      refresh,
      setEnabled(value) { enabled = Boolean(value); refresh(); },
    };
  }

  return Object.freeze({ MIN_DB, levelToPercent, createSampler, createMonitor });
}));
