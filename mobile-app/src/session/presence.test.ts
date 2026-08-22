import { describe, expect, it } from 'vitest';

import { presenceActionLine, presenceNotification, presenceWidgetLines, sessionPresence } from './presence';

const incoming = (name?: string, targetType: 'user' | 'conference' = 'user', targetId: number = 9) => ({
  addressedNow: name
    ? [{ fromName: name, fromUserId: 9, targetType, targetId, at: 1 }]
    : [],
});

const stage = { type: 'conference' as const, id: 1, label: 'Stage', canTalk: true };
const schniedel = { type: 'conference' as const, id: 2, label: 'Schniedel', canTalk: true };
const pat = { type: 'user' as const, id: 9, label: 'Pat', canTalk: true };

describe('sessionPresence', () => {
  it('uses reply unless talk & select is on', () => {
    const reply = sessionPresence({
      operatorReady: true,
      talkSelectMode: false,
      incoming: incoming('Pat'),
      talking: false,
      talkingLabels: [],
      talkLocked: false,
      replyTarget: pat,
      selectedTalkTarget: stage,
      targets: [pat, stage],
    });
    expect(reply.actionKind).toBe('reply');
    expect(reply.actionTarget).toBe('Pat');
    expect(reply.speaker).toBe('Pat');

    expect(
      sessionPresence({
        operatorReady: true,
        talkSelectMode: true,
        incoming: incoming(),
        talking: false,
        talkingLabels: [],
        talkLocked: false,
        replyTarget: pat,
        selectedTalkTarget: stage,
        targets: [pat, stage],
      }).actionTarget,
    ).toBe('Stage');
  });
});

describe('presence copy', () => {
  it('names the person for a direct incoming talk', () => {
    const snapshot = sessionPresence({
      operatorReady: true,
      talkSelectMode: false,
      incoming: incoming('Pat'),
      talking: false,
      talkingLabels: [],
      talkLocked: false,
      replyTarget: pat,
      selectedTalkTarget: null,
      targets: [pat],
    });
    expect(presenceNotification(snapshot)).toEqual({
      title: 'Pat',
      text: 'Reply: Pat. Disconnect ends the session.',
    });
    expect(presenceWidgetLines(snapshot)).toMatchObject({
      title: 'Pat',
      detail: 'Reply: Pat',
      audioActive: true,
      listening: true,
    });
    expect(presenceActionLine(snapshot)).toBe('Reply: Pat');
  });

  it('names the conference, not the speaker, when talk is into a conference', () => {
    const snapshot = sessionPresence({
      operatorReady: true,
      talkSelectMode: false,
      incoming: incoming('beni', 'conference', 2),
      talking: false,
      talkingLabels: [],
      talkLocked: false,
      replyTarget: schniedel,
      selectedTalkTarget: null,
      targets: [schniedel, pat],
    });
    expect(snapshot.speaker).toBe('beni');
    expect(snapshot.listeningLabels).toEqual(['Schniedel']);
    expect(presenceWidgetLines(snapshot).title).toBe('Schniedel');
    expect(presenceNotification(snapshot).title).toBe('Schniedel');
  });

  it('lists multiple live destinations and idle copy is Nobody Talking', () => {
    const snapshot = sessionPresence({
      operatorReady: true,
      talkSelectMode: false,
      incoming: {
        addressedNow: [
          { fromName: 'beni', fromUserId: 9, targetType: 'conference', targetId: 2, at: 2 },
          { fromName: 'Ada', fromUserId: 3, targetType: 'conference', targetId: 1, at: 1 },
        ],
      },
      talking: false,
      talkingLabels: [],
      talkLocked: false,
      replyTarget: schniedel,
      selectedTalkTarget: null,
      targets: [stage, schniedel],
    });
    expect(presenceWidgetLines(snapshot).title).toBe('Schniedel, Stage');

    const idle = sessionPresence({
      operatorReady: true,
      talkSelectMode: false,
      incoming: incoming(),
      talking: false,
      talkingLabels: [],
      talkLocked: false,
      replyTarget: null,
      selectedTalkTarget: null,
      targets: [stage],
    });
    expect(presenceWidgetLines(idle)).toMatchObject({
      title: 'Nobody Talking',
      audioActive: false,
    });
    expect(presenceNotification(idle)).toEqual({
      title: 'Nobody Talking',
      text: 'Reply: none. Disconnect ends the session.',
    });
  });

  it('uses Talk when talk & select is on', () => {
    const snapshot = sessionPresence({
      operatorReady: true,
      talkSelectMode: true,
      incoming: incoming(),
      talking: true,
      talkingLabels: ['Stage'],
      talkLocked: false,
      replyTarget: null,
      selectedTalkTarget: stage,
      targets: [stage],
    });
    expect(presenceNotification(snapshot)).toEqual({
      title: 'Talking · Stage',
      text: 'Talk: Stage. Disconnect ends the session.',
    });
    expect(presenceWidgetLines(snapshot).title).toBe('Talking · Stage');
  });

  it('puts talking first on the lock screen when also listening', () => {
    const snapshot = sessionPresence({
      operatorReady: true,
      talkSelectMode: false,
      incoming: incoming('beni', 'conference', 2),
      talking: true,
      talkingLabels: ['Traktor'],
      talkLocked: false,
      replyTarget: schniedel,
      selectedTalkTarget: null,
      targets: [schniedel],
    });
    expect(presenceWidgetLines(snapshot).title).toBe('Talking · Traktor, Schniedel');
    expect(presenceNotification(snapshot)).toEqual({
      title: 'Talking · Traktor, Schniedel',
      text: 'Reply: Schniedel. Disconnect ends the session.',
    });
  });

  it('lists live feeds only while they are streaming, not from incoming talk', () => {
    const virus = { type: 'feed' as const, id: 4, label: 'Virus (vom Lab 2Wcom)', canTalk: false };
    const addressed = sessionPresence({
      operatorReady: true,
      talkSelectMode: false,
      incoming: {
        addressedNow: [{ fromName: 'Virus', fromUserId: 1, targetType: 'feed', targetId: 4, at: 1 }],
      },
      talking: false,
      talkingLabels: [],
      talkLocked: false,
      replyTarget: null,
      selectedTalkTarget: null,
      targets: [virus],
    });
    expect(presenceWidgetLines(addressed).title).toBe('Nobody Talking');

    const streaming = sessionPresence({
      operatorReady: true,
      talkSelectMode: false,
      incoming: incoming(),
      talking: false,
      talkingLabels: [],
      talkLocked: false,
      replyTarget: null,
      selectedTalkTarget: null,
      targets: [virus],
      streamingFeedLabels: ['Virus (vom Lab 2Wcom)'],
    });
    expect(presenceWidgetLines(streaming).title).toBe('Virus (vom Lab 2Wcom)');
  });
});
