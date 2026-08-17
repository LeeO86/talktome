import { talkTargetIdentity, type TalkTarget } from '../protocol';

export function talkTargetKeys(targets: TalkTarget[]): string[] {
  return targets.map(talkTargetIdentity);
}

export function addTalkTarget(targets: TalkTarget[], target: TalkTarget): TalkTarget[] {
  const key = talkTargetIdentity(target);
  if (targets.some((item) => talkTargetIdentity(item) === key)) {
    return targets;
  }
  return [...targets, target];
}

export function removeTalkTarget(targets: TalkTarget[], target: TalkTarget): TalkTarget[] {
  const key = talkTargetIdentity(target);
  return targets.filter((item) => talkTargetIdentity(item) !== key);
}

export function sameTalkTargets(left: TalkTarget[], right: TalkTarget[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const keys = new Set(talkTargetKeys(left));
  return right.every((item) => keys.has(talkTargetIdentity(item)));
}
