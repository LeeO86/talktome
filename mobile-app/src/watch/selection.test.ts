import { describe, expect, it } from 'vitest';
import { readWatchTargetSelections, toggleWatchTarget, watchTargetCandidates } from './selection';

describe('Watch target selection', () => {
  it('restores independent selections per profile and production, including explicit none', () => {
    expect(readWatchTargetSelections({
      'profile-a:1': ['conference-2', 'reply', 'conference-2'],
      'profile-a:2': [],
      'profile-b:1': ['user-9', 'feed-1', null],
      malformed: true,
    })).toEqual({ 'profile-a:1': ['conference-2', 'reply'], 'profile-a:2': [], 'profile-b:1': ['user-9'] });
    expect(readWatchTargetSelections(null)).toEqual({});
  });

  it('starts a custom single selection from automatic mode and allows multiple choices', () => {
    expect(toggleWatchTarget(undefined, 'conference-2')).toEqual(['conference-2']);
    expect(toggleWatchTarget(['conference-2'], 'reply')).toEqual(['conference-2', 'reply']);
    expect(toggleWatchTarget(['conference-2', 'reply'], 'conference-2')).toEqual(['reply']);
    expect(toggleWatchTarget(['reply'], 'reply')).toEqual([]);
  });

  it('offers offline users but excludes self, feeds and listen-only conferences', () => {
    expect(watchTargetCandidates([
      { type: 'user', id: 1, label: 'Me', canTalk: true },
      { type: 'user', id: 2, label: 'Camera', canTalk: true },
      { type: 'feed', id: 3, label: 'Program', canTalk: true },
      { type: 'conference', id: 4, label: 'Listen', canTalk: false },
    ], 1).map(x => x.label)).toEqual(['Camera']);
  });
});
