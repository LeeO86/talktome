import { describe, expect, it } from 'vitest';

import {
  mainButtonCandidates,
  mainButtonStorageKey,
  resolveMainButton,
} from './mainButton';
import type { TalkTarget } from '../protocol';

const reply: TalkTarget = { type: 'user', id: 9, label: 'Pat', canTalk: true };
const stage: TalkTarget = { type: 'conference', id: 2, label: 'Stage', canTalk: true };
const listen: TalkTarget = { type: 'conference', id: 3, label: 'Listen', canTalk: false };
const feed: TalkTarget = { type: 'feed', id: 4, label: 'Program', canTalk: false };
const self: TalkTarget = { type: 'user', id: 1, label: 'Me', canTalk: true };

describe('main button target', () => {
  it('keys the choice by profile and production, like the web client', () => {
    expect(mainButtonStorageKey('srv::ada', 7)).toBe('srv::ada:7');
    expect(mainButtonStorageKey('srv::ada', null)).toBe('srv::ada:default');
    expect(mainButtonStorageKey(null, null)).toBe('device:default');
  });

  it('lists users and talkable conferences, including offline users', () => {
    expect(mainButtonCandidates([self, reply, stage, listen, feed], 1).map((item) => item.label)).toEqual([
      'Pat',
      'Stage',
    ]);
  });

  it('uses Reply until a target is chosen, and keeps a missing target explicit', () => {
    expect(
      resolveMainButton({ storedIdentity: '', targets: [reply, stage], replyTarget: reply }).label,
    ).toBe('Reply (Pat)');
    const fixed = resolveMainButton({
      storedIdentity: 'conference-2',
      targets: [reply, stage],
      replyTarget: reply,
    });
    expect(fixed.mode).toBe('target');
    expect(fixed.target?.label).toBe('Stage');
    expect(
      resolveMainButton({
        storedIdentity: 'user-99',
        targets: [reply],
        replyTarget: reply,
      }).label,
    ).toBe('Unavailable target');
    expect(
      resolveMainButton({
        storedIdentity: 'user-9',
        targets: [reply],
        replyTarget: null,
        canTalk: () => false,
      }),
    ).toMatchObject({ target: null, unavailable: true, label: 'Pat' });
    expect(
      resolveMainButton({
        storedIdentity: '',
        targets: [reply],
        replyTarget: reply,
        canTalk: () => false,
      }),
    ).toMatchObject({
      mode: 'reply',
      target: null,
      unavailable: true,
      label: 'Reply (Pat)',
    });
  });
});
