import { describe, expect, it } from 'vitest';

import {
  EMPTY_CAMERA_TALLY,
  TALLY_FRAME_WIDTH,
  TALLY_PGM_COLOR,
  TALLY_PRV_COLOR,
  cameraTallyColor,
  cameraTallyLabel,
  parseCameraTally,
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
    expect(TALLY_FRAME_WIDTH).toBe(24);
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
