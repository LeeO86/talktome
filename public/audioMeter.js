(function initAudioMeter(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TalktomeAudioMeter = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createAudioMeterApi() {
  const COLORS = Object.freeze({ green: '#22c55e', yellow: '#facc15', red: '#ef4444' });
  function renderLevel(fill, percent, minDb = -60, vertical = false) {
    const level = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    const yellowAt = (-12 - minDb) / -minDb * 100;
    const redAt = (-3 - minDb) / -minDb * 100;
    // Hard color boundaries span the entire meter; clipping reveals only the
    // reached portion, so quiet signals never contain yellow or red segments.
    fill.style.backgroundImage = `linear-gradient(${vertical ? 'to top' : 'to right'}, ${COLORS.green} 0%, ${COLORS.green} ${yellowAt}%, ${COLORS.yellow} ${yellowAt}%, ${COLORS.yellow} ${redAt}%, ${COLORS.red} ${redAt}%, ${COLORS.red} 100%)`;
    fill.style.setProperty('--meter-level', `${level}%`);
  }
  return Object.freeze({ COLORS, renderLevel });
}));
