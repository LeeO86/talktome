import { describe, expect, it } from 'vitest';

import {
  conferenceMemberGain,
  setConferenceMemberLevel,
  setConferenceMemberListening,
  EMPTY_CONFERENCE_LISTEN,
} from './conferenceListen';

describe('conference listen prefs', () => {
  it('mutes excluded members and scales the rest', () => {
    const excluded = setConferenceMemberListening(EMPTY_CONFERENCE_LISTEN, 2, 9, false);
    expect(conferenceMemberGain(excluded, 2, 9)).toBe(0);
    const quieter = setConferenceMemberLevel(EMPTY_CONFERENCE_LISTEN, 2, 4, 0.5);
    expect(conferenceMemberGain(quieter, 2, 4)).toBe(0.5);
    expect(conferenceMemberGain(quieter, 2, 9)).toBe(1);
  });
});
