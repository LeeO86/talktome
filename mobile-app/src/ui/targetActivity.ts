import type { IncomingTalkEntry, PeerSession, TalkTarget } from '../protocol';
import { incomingHighlightsTarget } from '../talk/replyTarget';

/** Only live entries for this conference count; a sticky reply is not a speaker. */
export function conferenceSpeakingLabel(
  target: TalkTarget,
  incoming: IncomingTalkEntry[],
  peers: PeerSession[],
): string {
  const speakers = new Map<string, string>();
  for (const entry of incoming) {
    if (entry.targetType !== 'conference' || !incomingHighlightsTarget(entry, target)) continue;
    let name = entry.fromName?.trim();
    if (!name && !entry.fromGuestId && entry.fromUserId != null) {
      name = peers.find(peer => peer.kind === 'user' && peer.userId === entry.fromUserId)?.name?.trim()
        || target.members?.find(member => member.userId === entry.fromUserId)?.name?.trim();
    }
    if (!name) continue;
    const identity = entry.fromGuestId ? `guest-${entry.fromGuestId}`
      : entry.fromUserId != null ? `user-${entry.fromUserId}` : `name-${name}`;
    speakers.set(identity, name);
  }
  return speakers.size ? `${[...speakers.values()].join(', ')} speaking` : 'Speaking';
}

/** Web isTargetSpeaking: a feed's producer and local reception override talk events.
 * Muting affects playback only; it must not hide an active incoming connection.
 */
export function targetActivity(input: {
  type: TalkTarget['type'];
  incoming: boolean;
  feedOnline: boolean;
  feedStopped: boolean;
  userOnline: boolean;
}): { offline: boolean; receiving: boolean } {
  if (input.type === 'feed') {
    return { offline: !input.feedOnline, receiving: input.feedOnline && !input.feedStopped };
  }
  const offline = input.type === 'user' && !input.userOnline;
  return { offline, receiving: !offline && input.incoming };
}
