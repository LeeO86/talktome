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
  it('keeps Reply separate, drops feeds listen-only and offline users, and keeps server order', () => {
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

    expect(snapshot.targets.map((item) => item.label)).toEqual(['beni', 'All', 'Traktor', 'beni']);
    expect(snapshot.targets[0]).toMatchObject({ pinned: false, slotKey: 'user-9' });
    expect(snapshot.targets[3]).toMatchObject({ pinned: true, type: 'user', slotKey: 'reply' });
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

    expect(snapshot.targets.map((item) => item.label)).toEqual(['All', 'Traktor', 'beni', 'All']);
    expect(snapshot.targets[0]).toMatchObject({ pinned: false, label: 'All' });
    expect(snapshot.targets[3]).toMatchObject({ pinned: true, label: 'All' });
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

    expect(snapshot.targets.filter(item => !item.pinned).map((item) => item.label)).toEqual(['Traktor', 'beni', 'All', 'stage']);
    expect(snapshot.targets.find((item) => item.pinned)?.key).toBe('user-9');
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

    expect(snapshot.targets.map((item) => item.label)).toEqual(['All', 'stage', 'beni']);
    expect(snapshot.targets[2]).toMatchObject({ pinned: true, canTalk: false });
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

const selectionInput: Parameters<typeof buildWatchRemoteSnapshot>[0] = {
  operatorReady: true, username: 'Alex', targets: [all, traktor, beni, stage, feed, listen],
  peers: [onlineBeni], replyTarget: traktor, talking: false, talkingTargets: [],
  incoming: { addressedNow: [] },
};

describe('selected Watch targets', () => {
  it('sends only the selected fixed target in full-screen mode without an extra Reply', () => {
    const next = buildWatchRemoteSnapshot({ ...selectionInput, selectedTargetKeys: ['conference-2'] });
    expect(next.singleTargetMode).toBe(true);
    expect(next.targets.map(x => x.key)).toEqual(['conference-2']);
    expect(next.targets[0]?.pinned).toBe(false);
  });

  it('supports a full-screen dynamic Reply choice', () => {
    const next = buildWatchRemoteSnapshot({ ...selectionInput, selectedTargetKeys: ['reply'] });
    expect(next.singleTargetMode).toBe(true);
    expect(next.targets[0]).toMatchObject({ key: 'conference-3', pinned: true });
    expect(buildWatchRemoteSnapshot({ ...selectionInput, replyTarget: null, selectedTargetKeys: ['reply'] }).targets)
      .toEqual([expect.objectContaining({ slotKey: 'reply', pinned: true, canTalk: false })]);
  });

  it('keeps multiple selections in server order and marks offline targets unavailable', () => {
    const next = buildWatchRemoteSnapshot({ ...selectionInput, selectedTargetKeys: ['user-12', 'conference-2'] });
    expect(next.singleTargetMode).toBe(false);
    expect(next.targets.map(x => x.key)).toEqual(['conference-2', 'user-12']);
    expect(next.targets[1]?.canTalk).toBe(false);
    const online = buildWatchRemoteSnapshot({ ...selectionInput, peers: [onlineStage], selectedTargetKeys: ['user-12'] });
    expect(online.targets[0]?.canTalk).toBe(true);
  });

  it('does not substitute other targets for empty or unavailable saved selections', () => {
    for (const keys of [[], ['conference-999'], ['feed-1'], ['conference-8']]) {
      expect(buildWatchRemoteSnapshot({ ...selectionInput, selectedTargetKeys: keys }).targets).toEqual([]);
    }
  });

  it('keeps automatic mode as a list with a separate Reply slot', () => {
    const next = buildWatchRemoteSnapshot({ ...selectionInput, targets: [all] });
    expect(next.singleTargetMode).toBe(false);
    expect(next.targets.map(x => x.slotKey)).toEqual(['conference-2', 'reply']);
  });
});


describe('Watch fixed layouts and lock state', () => {
  it('marks a configured pair and reports the phone locks', () => {
    const next = buildWatchRemoteSnapshot({ ...selectionInput,
      selectedTargetKeys: ['reply', 'conference-2'], lockedTargetKeys: ['conference-3'] });
    expect(next.twoTargetMode).toBe(true);
    expect(next.targets.map(x => x.key)).toEqual(['conference-2', 'conference-3']);
    expect(next.lockedTargetKeys).toEqual(['conference-3']);
  });
  it('keeps Reply and the fixed target as two distinct slots for the same destination', () => {
    const next = buildWatchRemoteSnapshot({ ...selectionInput,
      selectedTargetKeys: ['reply', 'conference-3'] });
    expect(next.twoTargetMode).toBe(true);
    expect(next.targets.map(x => x.key)).toEqual(['conference-3', 'conference-3']);
    expect(next.targets.map(x => x.slotKey)).toEqual(['conference-3', 'reply']);
    expect(next.targets.map(x => x.pinned)).toEqual([false, true]);
  });
  it.each([
    ['reply'],
    ['conference-3', 'reply'],
    ['conference-2', 'conference-3', 'reply'],
  ])('keeps slots and layout stable when Reply changes for %j', (...selectedTargetKeys) => {
    const snapshots = [null, all, traktor, beni, null].map(replyTarget =>
      buildWatchRemoteSnapshot({ ...selectionInput, selectedTargetKeys, replyTarget }));
    const initial = snapshots[0]!;
    for (const snapshot of snapshots) {
      expect(snapshot.targets.map(x => x.slotKey)).toEqual(initial.targets.map(x => x.slotKey));
      expect(new Set(snapshot.targets.map(x => x.slotKey)).size).toBe(snapshot.targets.length);
      expect(snapshot.singleTargetMode).toBe(initial.singleTargetMode);
      expect(snapshot.twoTargetMode).toBe(initial.twoTargetMode);
      expect(snapshot.targets.filter(x => !x.pinned)).toEqual(initial.targets.filter(x => !x.pinned));
    }
  });
  it('clears locks when disconnected', () => {
    expect(buildWatchRemoteSnapshot({ ...selectionInput, operatorReady: false,
      lockedTargetKeys: ['conference-3'] }).lockedTargetKeys).toEqual([]);
  });
});
