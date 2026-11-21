import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_CAMERA_TALLY,
  TALLY_FRAME_INNER_RADIUS,
  TALLY_FRAME_OVERHANG,
  TALLY_FRAME_WIDTH,
  TALLY_PGM_COLOR,
  TALLY_PRV_COLOR,
  cameraTallyColor,
  cameraTallyLabel,
  parseCameraTally,
  tallyFrameCoversScreenCorner,
  tallyFrameStrokeRadius,
  tallyFrameStrokeWidth,
} from './tally';

describe('camera tally', () => {
  it('treats a legacy boolean cut-camera payload as PGM', () => {
    expect(parseCameraTally(true)).toEqual({ pgm: true, prv: false });
    expect(parseCameraTally(false)).toEqual(EMPTY_CAMERA_TALLY);
  });

  it('reads production-scoped PGM and preview from 1.5.4 payloads', () => {
    expect(parseCameraTally({ pgm: false, prv: true, productionId: 4 })).toEqual({
      pgm: false,
      prv: true,
    });
    expect(parseCameraTally({ pgm: true, prv: true })).toEqual({ pgm: true, prv: true });
  });

  it('uses a thick on-air frame, larger than the web client 0.4rem ring', () => {
    expect(TALLY_FRAME_WIDTH).toBe(16);
  });

  it('keeps the plain-border inner curve while the clipped outer edge stays square', () => {
    expect(TALLY_FRAME_INNER_RADIUS).toBe(12);
    // Same inner radius as a plain `borderWidth: 16, borderRadius: 28` view.
    expect(tallyFrameStrokeRadius() - tallyFrameStrokeWidth()).toBe(TALLY_FRAME_INNER_RADIUS);
    // Visible band is still 16px once the overhang is clipped.
    expect(tallyFrameStrokeWidth() - TALLY_FRAME_OVERHANG).toBe(TALLY_FRAME_WIDTH);
    // The square screen corner is inside the outer arc, so nothing dark leaks at (0,0).
    expect(tallyFrameCoversScreenCorner()).toBe(true);
    expect(tallyFrameCoversScreenCorner(16, 12, 0)).toBe(false);
  });

  it('draws the frame as one clipped bordered view without image assets', () => {
    const app = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');
    expect(app).toContain("overflow: 'hidden'");
    expect(app).toContain('top: -TALLY_FRAME_OVERHANG');
    expect(app).toContain('borderWidth: tallyFrameStrokeWidth()');
    expect(app).toContain('borderRadius: tallyFrameStrokeRadius()');
    expect(app).not.toContain('tally-outer-corner');
    expect(app).not.toContain('tintColor');
    expect(app).not.toContain('tallyStripTop');
    expect(app).not.toContain('borderBottomRightRadius');
    expect(existsSync(resolve(__dirname, '../../assets/tally-outer-corner.png'))).toBe(false);
  });

  it('gives PGM visual priority over preview', () => {
    expect(cameraTallyColor({ pgm: true, prv: true })).toBe(TALLY_PGM_COLOR);
    expect(cameraTallyColor({ pgm: false, prv: true })).toBe(TALLY_PRV_COLOR);
    expect(cameraTallyColor(EMPTY_CAMERA_TALLY)).toBeNull();
  });

  it('labels PGM over preview', () => {
    expect(cameraTallyLabel({ pgm: true, prv: true })).toBe('PGM');
    expect(cameraTallyLabel({ pgm: false, prv: true })).toBe('PRV');
    expect(cameraTallyLabel(EMPTY_CAMERA_TALLY)).toBeNull();
  });
});
