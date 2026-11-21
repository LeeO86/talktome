import type { TalkTarget } from '../protocol';

/** Missing scope means automatic/all targets. An empty array explicitly selects none. */
export type WatchTargetSelections = Record<string, string[]>;
export const WATCH_REPLY_TARGET = 'reply';

export function normalizeWatchTargetKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((key): key is string => typeof key === 'string')
    .map(key => key.trim())
    .filter(key => key === WATCH_REPLY_TARGET || /^(user|guest|conference)-.+$/.test(key)))];
}

export function readWatchTargetSelections(value: unknown): WatchTargetSelections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([, keys]) => Array.isArray(keys))
    .map(([scope, keys]) => [scope, normalizeWatchTargetKeys(keys)]));
}

export function watchTargetCandidates(targets: TalkTarget[], selfId?: number | string | null): TalkTarget[] {
  return targets.filter(target => target.type !== 'feed' && target.canTalk &&
    !(target.type === 'user' && selfId != null && String(target.id) === String(selfId)));
}

export function toggleWatchTarget(selection: string[] | undefined, key: string): string[] {
  const selected = selection ?? [];
  return selected.includes(key) ? selected.filter(item => item !== key) : normalizeWatchTargetKeys([...selected, key]);
}
