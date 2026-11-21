import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));
beforeEach(() => { storage.getItem.mockReset(); storage.setItem.mockReset(); });

import {
  DEFAULT_OPERATOR_AUDIO,
  dimDbFromSliderPosition,
  feedDuckingFactor,
  normalizeOperatorAudio,
  loadOperatorAudioOverrides,
  resolveOperatorAudio,
  shouldDuckFeeds,
  sliderPositionFromDimDb,
} from './operatorAudio';

describe('operatorAudio', () => {
  it('matches the web client defaults', () => {
    expect(normalizeOperatorAudio(undefined)).toEqual(DEFAULT_OPERATOR_AUDIO);
    expect(DEFAULT_OPERATOR_AUDIO.feedDimSelf).toBe(false);
    expect(DEFAULT_OPERATOR_AUDIO.feedDimIncoming).toBe(true);
    expect(DEFAULT_OPERATOR_AUDIO.feedDimDb).toBe(-15);
    expect(DEFAULT_OPERATOR_AUDIO.playConnectionSounds).toBe(true);
    expect(DEFAULT_OPERATOR_AUDIO.echoCancellation).toBe(true);
    expect(DEFAULT_OPERATOR_AUDIO.noiseSuppression).toBe(true);
    expect(DEFAULT_OPERATOR_AUDIO.autoGainControl).toBe(true);
  });

  it('maps the dim-amount slider onto the web dB steps', () => {
    expect(dimDbFromSliderPosition(0)).toBe(-6);
    expect(dimDbFromSliderPosition(1)).toBe(-24);
    expect(dimDbFromSliderPosition(sliderPositionFromDimDb(-15))).toBe(-15);
  });

  it('ducks at -15 dB like TalkToMe 1.5.5', () => {
    expect(feedDuckingFactor(-15)).toBeCloseTo(10 ** (-15 / 20), 8);
  });

  it('migrates stored -14 dB dim to -15 dB', () => {
    expect(normalizeOperatorAudio({ feedDimDb: -14 }).feedDimDb).toBe(-15);
    expect(resolveOperatorAudio({}, { dimAmountDb: -14 }).feedDimDb).toBe(-15);
    expect(resolveOperatorAudio({}, { dimAmountDb: -15 }).feedDimDb).toBe(-15);
  });

  it('applies server defaults only where the user has no explicit choice', () => {
    const resolved = resolveOperatorAudio(
      { feedDimSelf: false },
      {
        dimAmountDb: -12,
        dimFeedsWhileSpeaking: true,
        dimWhenAddressed: false,
        audioAutoProcessing: false,
        playConnectionSounds: false,
      },
    );
    // Explicit user choice wins over the server default.
    expect(resolved.feedDimSelf).toBe(false);
    // Untouched keys follow the server defaults.
    expect(resolved.feedDimDb).toBe(-12);
    expect(resolved.feedDimIncoming).toBe(false);
    expect(resolved.echoCancellation).toBe(false);
    expect(resolved.noiseSuppression).toBe(false);
    expect(resolved.autoGainControl).toBe(false);
    expect(resolved.playConnectionSounds).toBe(false);
  });

  it('lets an explicit connection-sound choice beat the server default', () => {
    expect(resolveOperatorAudio({ playConnectionSounds: true }, { playConnectionSounds: false }).playConnectionSounds).toBe(
      true,
    );
    expect(resolveOperatorAudio({ playConnectionSounds: false }, { playConnectionSounds: true }).playConnectionSounds).toBe(
      false,
    );
    expect(normalizeOperatorAudio({ playConnectionSounds: false }).playConnectionSounds).toBe(false);
  });

  it('falls back to the builtin defaults without server settings', () => {
    expect(resolveOperatorAudio({}, {})).toEqual(DEFAULT_OPERATOR_AUDIO);
    expect(resolveOperatorAudio({})).toEqual(DEFAULT_OPERATOR_AUDIO);
  });

  it('dims feeds when addressed by default, not while speaking', () => {
    expect(
      shouldDuckFeeds({
        dimSelf: DEFAULT_OPERATOR_AUDIO.feedDimSelf,
        dimIncoming: DEFAULT_OPERATOR_AUDIO.feedDimIncoming,
        talking: false,
        incomingAddressed: true,
      }),
    ).toBe(true);
    expect(
      shouldDuckFeeds({
        dimSelf: DEFAULT_OPERATOR_AUDIO.feedDimSelf,
        dimIncoming: DEFAULT_OPERATOR_AUDIO.feedDimIncoming,
        talking: true,
        incomingAddressed: false,
      }),
    ).toBe(false);
  });
});

describe('saved audio output migration', () => {
  const saved = { audioRouteId: 'receiver', feedDimDb: -12, playConnectionSounds: false };

  it('migrates the retired iOS receiver to speaker and preserves other preferences', async () => {
    storage.getItem.mockResolvedValue(JSON.stringify(saved));
    const migrated = { ...saved, audioRouteId: 'speaker' };
    expect(await loadOperatorAudioOverrides('ios')).toEqual(migrated);
    expect(storage.setItem.mock.calls[0]![0]).toBe('talktome.operator-audio');
    expect(JSON.parse(storage.setItem.mock.calls[0]![1])).toEqual(migrated);
  });

  it('keeps Android receiver settings', async () => {
    storage.getItem.mockResolvedValue(JSON.stringify(saved));
    expect(await loadOperatorAudioOverrides('android')).toEqual(saved);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps migrated preferences usable when persisting the migration fails', async () => {
    storage.getItem.mockResolvedValue(JSON.stringify(saved));
    storage.setItem.mockRejectedValue(new Error('Storage unavailable'));
    expect(await loadOperatorAudioOverrides('ios')).toEqual({ ...saved, audioRouteId: 'speaker' });
  });
});
