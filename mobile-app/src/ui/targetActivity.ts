import type { TalkTarget } from '../protocol';

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
