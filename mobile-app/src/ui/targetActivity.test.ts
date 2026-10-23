import { describe, expect, it } from 'vitest';
import { targetActivity } from './targetActivity';

const feed = { type: 'feed' as const, incoming: false, feedOnline: true, feedStopped: false, userOnline: true };

describe('target activity matches web feed reception', () => {
  it('greys out a feed only when the source is not sending', () => {
    expect(targetActivity({ ...feed, feedOnline: false, incoming: true })).toEqual({ offline: true, receiving: false });
    expect(targetActivity({ ...feed, feedOnline: false, feedStopped: true })).toEqual({ offline: true, receiving: false });
  });

  it('keeps a sending but locally stopped feed neutral even with an incoming talk event', () => {
    expect(targetActivity({ ...feed, feedStopped: true, incoming: true })).toEqual({ offline: false, receiving: false });
  });

  it('highlights a received feed even without a talk event or audible audio', () => {
    expect(targetActivity(feed)).toEqual({ offline: false, receiving: true });
  });

  it('restores the highlight when reception restarts and clears it when the source stops', () => {
    const states = [feed, { ...feed, feedStopped: true }, feed, { ...feed, feedOnline: false }];
    expect(states.map(state => targetActivity(state).receiving)).toEqual([true, false, true, false]);
  });

  it('continues to use incoming talk events for users and conferences', () => {
    expect(targetActivity({ ...feed, type: 'user', incoming: true }).receiving).toBe(true);
    expect(targetActivity({ ...feed, type: 'user', incoming: true, userOnline: false })).toEqual({ offline: true, receiving: false });
    expect(targetActivity({ ...feed, type: 'conference', incoming: true, feedStopped: true }).receiving).toBe(true);
    expect(targetActivity({ ...feed, type: 'conference' }).receiving).toBe(false);
  });
});
