import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OPERATOR_AUDIO,
  dimDbFromSliderPosition,
  feedDuckingFactor,
  normalizeOperatorAudio,
  resolveOperatorAudio,
  shouldDuckFeeds,
  sliderPositionFromDimDb,
} from './operatorAudio';

describe('operatorAudio', () => {
  it('matches the web client defaults', () => {
    expect(normalizeOperatorAudio(undefined)).toEqual(DEFAULT_OPERATOR_AUDIO);
    expect(DEFAULT_OPERATOR_AUDIO.feedDimSelf).toBe(false);
    expect(DEFAULT_OPERATOR_AUDIO.feedDimIncoming).toBe(true);
    expect(DEFAULT_OPERATOR_AUDIO.feedDimDb).toBe(-14);
    expect(DEFAULT_OPERATOR_AUDIO.echoCancellation).toBe(true);
    expect(DEFAULT_OPERATOR_AUDIO.noiseSuppression).toBe(true);
    expect(DEFAULT_OPERATOR_AUDIO.autoGainControl).toBe(true);
  });

  it('maps the dim-amount slider onto the web dB steps', () => {
    expect(dimDbFromSliderPosition(0)).toBe(-6);
    expect(dimDbFromSliderPosition(1)).toBe(-24);
    expect(dimDbFromSliderPosition(sliderPositionFromDimDb(-14))).toBe(-14);
  });

  it('ducks at -14 dB like the web client', () => {
    expect(feedDuckingFactor(-14)).toBeCloseTo(10 ** (-14 / 20), 8);
  });

  it('applies server defaults only where the user has no explicit choice', () => {
    const resolved = resolveOperatorAudio(
      { feedDimSelf: false },
      {
        dimAmountDb: -12,
        dimFeedsWhileSpeaking: true,
        dimWhenAddressed: false,
        audioAutoProcessing: false,
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
