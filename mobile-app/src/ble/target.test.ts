import { describe, expect, it } from 'vitest';

import type { TalkTarget } from '../protocol';
import {
  bleTalkCandidates,
  bleTargetSelectionKey,
  describeBleTarget,
  parseBleTargetSelection,
  resolveBleTalkTarget,
} from './target';

const all: TalkTarget = { type: 'conference', id: 4, label: 'All', canTalk: true };
const feed: TalkTarget = { type: 'feed', id: 1, label: 'PGM', canTalk: false };
const beni: TalkTarget = { type: 'user', id: 9, label: 'beni', canTalk: true };

describe('BLE talk target', () => {
  it('defaults stored JSON to Reply', () => {
    expect(parseBleTargetSelection(null)).toEqual({ kind: 'reply' });
    expect(describeBleTarget({ kind: 'reply' })).toBe('Reply');
    expect(bleTargetSelectionKey({ kind: 'reply' })).toBe('reply');
  });

  it('uses Reply when that is the selection', () => {
    expect(
      resolveBleTalkTarget({
        selection: { kind: 'reply' },
        replyTarget: beni,
        targets: [all, beni],
      }),
    ).toEqual(beni);
  });

  it('uses the first talkable card when Reply has no live counterpart', () => {
    expect(
      resolveBleTalkTarget({
        selection: { kind: 'reply' },
        replyTarget: null,
        targets: [all, beni],
      }),
    ).toEqual(all);
    expect(
      resolveBleTalkTarget({
        selection: { kind: 'reply' },
        replyTarget: { type: 'user', id: 99, label: 'gone', canTalk: true },
        targets: [all, beni],
      }),
    ).toEqual(all);
  });

  it('prefers the live target list for a stored identity', () => {
    expect(
      resolveBleTalkTarget({
        selection: { kind: 'target', type: 'conference', id: 4, label: 'All' },
        replyTarget: beni,
        targets: [all],
      }),
    ).toEqual(all);
  });

  it('falls back to Reply when the coupled target is missing from this production', () => {
    expect(
      resolveBleTalkTarget({
        selection: { kind: 'target', type: 'user', id: 9, label: 'beni' },
        replyTarget: all,
        targets: [all],
      }),
    ).toEqual(all);
    expect(
      resolveBleTalkTarget({
        selection: { kind: 'target', type: 'conference', id: 4, label: 'All' },
        replyTarget: null,
        targets: [],
      }),
    ).toBeNull();
  });

  it('hides feeds from the picker', () => {
    expect(bleTalkCandidates([all, feed, beni]).map((item) => item.label)).toEqual(['All', 'beni']);
  });
});
