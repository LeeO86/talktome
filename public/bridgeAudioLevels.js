(function initBridgeAudioLevels(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TalktomeBridgeAudioLevels = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createBridgeAudioLevels() {
  const LIMITS = Object.freeze({ input: [-40, 40], output: [-40, 40] });
  function normalizeLevel(value, direction, { strict = false } = {}) {
    const [min, max] = LIMITS[direction] || [];
    if (min === undefined) throw new Error('Invalid audio direction');
    if (strict && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('Audio level must be an object');
    const gainDb = value?.gainDb ?? 0;
    const muted = value?.muted ?? false;
    if (strict && (typeof gainDb !== 'number' || !Number.isFinite(gainDb) || gainDb < min || gainDb > max)) {
      throw new Error(`${direction} gain must be between ${min} and ${max} dB`);
    }
    if (strict && typeof muted !== 'boolean') throw new Error('Mute must be boolean');
    return { gainDb: Number.isFinite(gainDb) ? Math.round(Math.max(min, Math.min(max, gainDb)) * 10) / 10 : 0, muted: muted === true };
  }
  function normalize(value) {
    return { input: normalizeLevel(value?.input, 'input'), output: normalizeLevel(value?.output, 'output') };
  }
  function linearGain(level) {
    return level.muted ? 0 : 10 ** (level.gainDb / 20);
  }
  return Object.freeze({ LIMITS, normalizeLevel, normalize, linearGain });
}));
