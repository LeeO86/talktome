import { describe, expect, it } from 'vitest';

import { talkLinkAuthorizes } from './talkLink';

const TOKEN = 'a'.repeat(32);

describe('talkLinkAuthorizes', () => {
  it('accepts only talktome://talk with this install token', () => {
    expect(talkLinkAuthorizes(`talktome://talk?token=${TOKEN}`, TOKEN)).toBe(true);
    expect(talkLinkAuthorizes('talktome://talk', TOKEN)).toBe(false);
    expect(talkLinkAuthorizes('talktome://talk?token=other', TOKEN)).toBe(false);
    expect(talkLinkAuthorizes(`https://example.com/talk?token=${TOKEN}`, TOKEN)).toBe(false);
    expect(talkLinkAuthorizes(`talktome://talk?token=${TOKEN}`, null)).toBe(false);
  });
});
