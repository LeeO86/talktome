import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const iconsRoot = resolve(__dirname, '../../assets/icons');
const referenceImages = resolve(__dirname, '../../../public/images');

const WEB_UI_ICONS = {
  'walkie-talkies-white.png':
    'b7833823a84a9073dd7fbb9878065c14bb81ce04ce329b6266e8cc875be1785f',
  'speaker-white.png': '566eacee949d1f67711aeb90808bcb12a39971c8d0651323071b52f734b1f65e',
  'speaker-muted.png': 'c071459e948611b9b9bc2302bcd046242bf480aade1dab35ba536ea9af2557f2',
} as const;

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('web client UI icons', () => {
  it('vendors the web talk and speaker PNGs', () => {
    const source = readFileSync(resolve(__dirname, 'icons.tsx'), 'utf8');
    for (const [filename, digest] of Object.entries(WEB_UI_ICONS)) {
      const path = resolve(iconsRoot, filename);
      expect(sha256(path)).toBe(digest);
      expect(source).toContain(`assets/icons/${filename}`);
    expect(source).toContain('resizeMethod="resize"');
      const upstream = resolve(referenceImages, filename);
      if (existsSync(upstream)) {
        expect(sha256(upstream), `${filename} drifted from the web client`).toBe(digest);
      }
    }
  });

  it('keeps conference / feed / user glyphs aligned with the web client', () => {
    const source = readFileSync(resolve(__dirname, 'icons.tsx'), 'utf8');
    expect(source).toContain("WEB_CONFERENCE_GLYPH = '📡'");
    expect(source).toContain("WEB_FEED_GLYPH = '🎧'");
    expect(source).toContain("user: '#446cc2'");
    expect(source).toContain("conference: '#4f9b8b'");
    expect(source).toContain("feed: '#5f804b'");
    expect(source).toContain("offline: '#475569'");
  });

  it('uses the walkie on a pinned main button and every talkable target card', () => {
    const operator = readFileSync(resolve(__dirname, 'OperatorScreen.tsx'), 'utf8');
    const row = readFileSync(resolve(__dirname, 'TargetRow.tsx'), 'utf8');
    expect(operator).toContain('<WalkieTalkieIcon');
    expect(operator).not.toContain('MicIcon');
    expect(row).toContain('<WalkieTalkieIcon');
    expect(row).toContain("target.canTalk && target.type !== 'feed'");
    expect(row).not.toContain('edgeTalkAffordance && canTalk');
    expect(row).not.toContain('talkControlGlyph');
    expect(row).toContain('letter={target.label}');
  });
});
