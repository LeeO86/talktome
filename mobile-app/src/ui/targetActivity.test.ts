import { describe, expect, it } from 'vitest';
import { parseIncomingTalkState, type TalkTarget } from '../protocol';
import { conferenceSpeakingLabel, targetActivity } from './targetActivity';

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

describe('conference speaker names', () => {
  const conference: TalkTarget = { type: 'conference', id: 2, label: 'Tech Support', canTalk: true };

  it('shows the speaker from the server envelope and excludes other destinations', () => {
    const incoming = parseIncomingTalkState({ state: { addressedNow: [
      { fromUserId: 9, fromName: ' Lisa ', targetType: 'conference', targetId: '2' },
      { fromUserId: 10, fromName: 'Daniel', targetType: 'conference', targetId: 3 },
      { fromUserId: 11, fromName: 'Charlie', targetType: 'user', targetId: 4 },
    ] } });
    expect(conferenceSpeakingLabel(conference, incoming!.addressedNow, [])).toBe('Lisa speaking');
  });

  it('lists simultaneous users and guests once per speaker', () => {
    expect(conferenceSpeakingLabel(conference, [
      { fromUserId: 9, fromName: 'Lisa', targetType: 'conference', targetId: 2 },
      { fromUserId: 9, fromName: 'Lisa', targetType: 'conference', targetId: 2 },
      { fromUserId: 10, fromName: 'Daniel', targetType: 'conference', targetId: 2 },
      { fromGuestId: 'guest-a', fromName: 'Guest', targetType: 'conference', targetId: 2 },
    ], [])).toBe('Lisa, Daniel, Guest speaking');
  });

  it('shows active speaker names in listen-only conferences too', () => {
    expect(conferenceSpeakingLabel({ ...conference, canTalk: false }, [
      { fromUserId: 9, fromName: 'Lisa', targetType: 'conference', targetId: 2 },
    ], [])).toBe('Lisa speaking');
  });

  it('falls back to online peers or conference members when the event has no name', () => {
    const target = { ...conference, members: [{ userId: 10, name: 'Daniel' }] };
    expect(conferenceSpeakingLabel(target, [
      { fromUserId: 9, fromName: ' ', targetType: 'conference', targetId: 2 },
      { fromUserId: 10, targetType: 'conference', targetId: 2 },
    ], [{ socketId: 'lisa', kind: 'user', userId: 9, name: 'Lisa' }])).toBe('Lisa, Daniel speaking');
  });

  it('does not guess a guest name from a shared user profile', () => {
    expect(conferenceSpeakingLabel(conference, [
      { fromUserId: 9, fromGuestId: 'guest-a', targetType: 'conference', targetId: 2 },
    ], [{ socketId: 'lisa', kind: 'user', userId: 9, name: 'Lisa' }])).toBe('Speaking');
  });

  it('does not assign an unrelated peer name when the speaker has no user id', () => {
    expect(conferenceSpeakingLabel(conference, [
      { targetType: 'conference', targetId: 2 },
    ], [{ socketId: 'unknown-user', kind: 'user', name: 'Lisa' }])).toBe('Speaking');
  });

  it('clears old names when speakers stop and keeps a fallback for unnamed speakers', () => {
    expect(conferenceSpeakingLabel(conference, [], [])).toBe('Speaking');
    expect(conferenceSpeakingLabel(conference, [
      { fromUserId: 9, fromName: '', targetType: 'conference', targetId: 2 },
    ], [])).toBe('Speaking');
  });
});
