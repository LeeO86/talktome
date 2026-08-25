import {
  canTalkToTarget,
  talkTargetIdentity,
  type IncomingTalkState,
  type PeerSession,
  type TalkTarget,
} from '../protocol';
import { incomingHighlightsTarget } from '../talk/replyTarget';

export type WatchRemoteTarget = {
  key: string;
  type: TalkTarget['type'];
  id: string;
  label: string;
  canTalk: boolean;
  pinned: boolean;
  highlighted: boolean;
};

export type WatchRemoteSnapshot = {
  connected: boolean;
  username: string;
  productionName: string;
  talking: boolean;
  talkingTargetKey: string;
  replyTargetKey: string;
  targets: WatchRemoteTarget[];
};

export function watchTalkCandidates(targets: TalkTarget[], peers: PeerSession[]): TalkTarget[] {
  return targets.filter((target) => canTalkToTarget(target, peers));
}

export function buildWatchRemoteSnapshot(input: {
  operatorReady: boolean;
  username: string;
  productionName?: string | null;
  targets: TalkTarget[];
  peers: PeerSession[];
  replyTarget: TalkTarget | null;
  talking: boolean;
  talkingTargets: TalkTarget[];
  incoming: IncomingTalkState;
}): WatchRemoteSnapshot {
  const talkable = watchTalkCandidates(input.targets, input.peers);
  const replyKey = input.replyTarget ? talkTargetIdentity(input.replyTarget) : '';
  const talkingTargetKey = input.talkingTargets[0] ? talkTargetIdentity(input.talkingTargets[0]) : '';
  const rows = talkable.map((target) => {
    const key = talkTargetIdentity(target);
    return {
      key,
      type: target.type,
      id: String(target.id),
      label: target.label,
      canTalk: target.canTalk,
      pinned: Boolean(replyKey) && key === replyKey,
      highlighted: input.incoming.addressedNow.some((entry) => incomingHighlightsTarget(entry, target)),
    } satisfies WatchRemoteTarget;
  });

  return {
    connected: input.operatorReady,
    username: input.username.trim(),
    productionName: input.productionName?.trim() ?? '',
    talking: input.talking,
    talkingTargetKey,
    replyTargetKey: replyKey,
    targets: input.operatorReady ? rows : [],
  };
}
