import { describe, expect, it } from 'vitest';

import type { PeerSession, TalkTarget } from '../protocol';
import { buildWatchRemoteSnapshot } from './snapshot';

const all: TalkTarget = { type: 'conference', id: 2, label: 'All', canTalk: true };
const traktor: TalkTarget = { type: 'conference', id: 3, label: 'Traktor', canTalk: true };
const beni: TalkTarget = { type: 'user', id: 9, label: 'beni', canTalk: true };
const stage: TalkTarget = { type: 'user', id: 12, label: 'stage', canTalk: true };
const feed: TalkTarget = { type: 'feed', id: 1, label: 'Program', canTalk: true };
const listen: TalkTarget = { type: 'conference', id: 8, label: 'Listen', canTalk: false };

const onlineBeni: PeerSession = { socketId: 's-beni', userId: 9, kind: 'user', name: 'beni' };
const onlineStage: PeerSession = { socketId: 's-stage', userId: 12, kind: 'user', name: 'stage' };

describe('buildWatchRemoteSnapshot', () => {
  it('pins reply, drops feeds listen-only and offline users, and keeps server order', () => {
    const snapshot = buildWatchRemoteSnapshot({
      operatorReady: true,
      username: 'adi',
      productionName: 'Show',
      targets: [beni, feed, listen, all, traktor],
      peers: [onlineBeni],
      replyTarget: beni,
      talking: true,
      talkingTargets: [all],
      incoming: {
        addressedNow: [{ targetType: 'conference', targetId: 3, fromName: 'Stage' }],
      },
    });

    expect(snapshot.targets.map((item) => item.label)).toEqual(['beni', 'All', 'Traktor']);
    expect(snapshot.targets[0]).toMatchObject({ pinned: true, type: 'user' });
    expect(snapshot.targets.find((item) => item.label === 'Traktor')?.highlighted).toBe(true);
    expect(snapshot.talkingTargetKey).toBe('conference-2');
    expect(snapshot.productionName).toBe('Show');
  });

  it('keeps the reply target in the full list', () => {
    const snapshot = buildWatchRemoteSnapshot({
      operatorReady: true,
      username: 'adi',
      targets: [all, traktor, beni],
      peers: [onlineBeni],
      replyTarget: all,
      talking: false,
      talkingTargets: [],
      incoming: { addressedNow: [] },
    });

    expect(snapshot.targets.map((item) => item.label)).toEqual(['All', 'Traktor', 'beni']);
    expect(snapshot.targets[0]).toMatchObject({ pinned: true, label: 'All' });
  });

  it('does not regroup conferences ahead of users', () => {
    const snapshot = buildWatchRemoteSnapshot({
      operatorReady: true,
      username: 'adi',
      targets: [traktor, beni, all, stage],
      peers: [onlineBeni, onlineStage],
      replyTarget: beni,
      talking: false,
      talkingTargets: [],
      incoming: { addressedNow: [] },
    });

    expect(snapshot.targets.map((item) => item.label)).toEqual(['Traktor', 'beni', 'All', 'stage']);
    expect(snapshot.targets.find((item) => item.label === 'beni')?.pinned).toBe(true);
  });

  it('omits offline users', () => {
    const snapshot = buildWatchRemoteSnapshot({
      operatorReady: true,
      username: 'adi',
      targets: [beni, all, stage],
      peers: [onlineStage],
      replyTarget: beni,
      talking: false,
      talkingTargets: [],
      incoming: { addressedNow: [] },
    });

    expect(snapshot.targets.map((item) => item.label)).toEqual(['All', 'stage']);
    expect(snapshot.targets.every((item) => !item.pinned)).toBe(true);
  });

  it('clears targets when the phone is not in an operator session', () => {
    const snapshot = buildWatchRemoteSnapshot({
      operatorReady: false,
      username: 'adi',
      targets: [all],
      peers: [],
      replyTarget: all,
      talking: false,
      talkingTargets: [],
      incoming: { addressedNow: [] },
    });
    expect(snapshot.connected).toBe(false);
    expect(snapshot.targets).toEqual([]);
  });
});
