import { describe, expect, it } from 'vitest';
import { PANEL_AUDIO_DEFAULTS, parsePanelAudioSettings, parsePanelAudioState, parsePanelCommand, parsePanelSettings } from './remotePanel';

describe('remote panel protocol', () => {
  it('accepts the server command contract and absolute audio values', () => {
    expect(parsePanelCommand({ kind: 'talk', action: 'press', inputKey: 'panel:admin:main', targetType: 'reply' })).toMatchObject({ action: 'press', targetType: 'reply' });
    expect(parsePanelCommand({ kind: 'target-audio', audio: { targetType: 'conference', targetId: 2, volume: 0.5, muted: true }, panelSettings: { revision: 3, storage: {} } })).toMatchObject({ audio: { volume: 0.5, muted: true }, panelSettings: { revision: 3 } });
    expect(parsePanelAudioSettings(PANEL_AUDIO_DEFAULTS)).toEqual(PANEL_AUDIO_DEFAULTS);
  });

  it('rejects invalid actions, local input keys, IDs, and incomplete settings', () => {
    for (const command of [null, { kind: 'talk', action: 'press', inputKey: 'main', targetType: 'reply' }, { kind: 'talk', action: 'lock', targetType: 'feed', targetId: 2 }, { kind: 'production', productionId: -1 }, { kind: 'order', panelSettings: { revision: NaN, storage: {} } }, { kind: 'audio-settings', settings: { audioProfile: 'low' } }]) {
      expect(() => parsePanelCommand(command)).toThrow();
    }
  });

  it('rejects nonfinite and out-of-range audio values', () => {
    for (const volume of [NaN, Infinity, -0.1, 1.1, '0.5']) expect(parsePanelAudioState({ targetType: 'user', targetId: 2, volume, muted: false })).toBeNull();
    expect(parsePanelAudioSettings({ ...PANEL_AUDIO_DEFAULTS, userInputGainDb: Infinity })).toBeNull();
    expect(parsePanelAudioSettings({ ...PANEL_AUDIO_DEFAULTS, voiceTriggerTarget: 'feed:2' })).toBeNull();
  });

  it('bounds storage and accepts deletion patches', () => {
    expect(parsePanelSettings({ revision: 2, storage: { a: null } })).toBeNull();
    expect(parsePanelSettings({ revision: 2, storage: { a: 'x'.repeat(32769) } })).toBeNull();
    expect(parsePanelCommand({ kind: 'preferences', patch: { 'mainButtonTarget:user:1:2': null } })).toMatchObject({ patch: { 'mainButtonTarget:user:1:2': null } });
  });
});
