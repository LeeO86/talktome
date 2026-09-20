// TalkToMe 1.5.4 scopes Companion PGM/PRV tally by production and emits
// `cut-camera` as `{ pgm, prv, productionId }`. Older servers sent a boolean
// (PGM only). PGM has visual priority when both buses are on.

export const TALLY_PGM_COLOR = '#e00000';
export const TALLY_PRV_COLOR = '#00875a';
/** On-air frame around the operator screen. The web client uses 0.4rem (~6px) plus
 * an 0.5rem dark-container inset; phones use a thicker ring than that, without
 * eating as much of the operator chrome as 24px did. */
export const TALLY_FRAME_WIDTH = 16;
/** Inner corner radius of a thick CSS-style border (`borderRadius − borderWidth`). */
export const TALLY_FRAME_INNER_RADIUS = 12;
/** How far the stroke view hangs past every screen edge. Its rounded outer corner is
 * clipped away by the frame container, so the visible outer edge stays square while the
 * inner cut keeps the same curve as a plain 16px / radius-28 border. */
export const TALLY_FRAME_OVERHANG = TALLY_FRAME_WIDTH;

/** Border width of the off-screen stroke: the visible 16px plus the clipped overhang. */
export function tallyFrameStrokeWidth(
  frameWidth = TALLY_FRAME_WIDTH,
  overhang = TALLY_FRAME_OVERHANG,
): number {
  return frameWidth + overhang;
}

/** Outer radius of the off-screen stroke so its inner radius is `TALLY_FRAME_INNER_RADIUS`. */
export function tallyFrameStrokeRadius(
  frameWidth = TALLY_FRAME_WIDTH,
  innerRadius = TALLY_FRAME_INNER_RADIUS,
  overhang = TALLY_FRAME_OVERHANG,
): number {
  return tallyFrameStrokeWidth(frameWidth, overhang) + innerRadius;
}

/** True when the screen corner pixel sits inside the stroke's outer arc, i.e. the
 * clipped outer edge is fully painted to the square corner. */
export function tallyFrameCoversScreenCorner(
  frameWidth = TALLY_FRAME_WIDTH,
  innerRadius = TALLY_FRAME_INNER_RADIUS,
  overhang = TALLY_FRAME_OVERHANG,
): boolean {
  const arcCenter = frameWidth + innerRadius;
  const cornerDistance = Math.SQRT2 * arcCenter;
  return cornerDistance < tallyFrameStrokeRadius(frameWidth, innerRadius, overhang);
}

export type CameraTallyState = {
  pgm: boolean;
  prv: boolean;
};

export const EMPTY_CAMERA_TALLY: CameraTallyState = { pgm: false, prv: false };

export function parseCameraTally(value: unknown): CameraTallyState {
  if (typeof value === 'boolean') {
    return { pgm: value, prv: false };
  }
  if (!value || typeof value !== 'object') {
    return EMPTY_CAMERA_TALLY;
  }
  const record = value as Record<string, unknown>;
  return {
    pgm: Boolean(record.pgm),
    prv: Boolean(record.prv),
  };
}

/** Screen-frame color for operator tally. PGM (red) wins over preview (green). */
export function cameraTallyColor(tally: CameraTallyState): string | null {
  if (tally.pgm) {
    return TALLY_PGM_COLOR;
  }
  if (tally.prv) {
    return TALLY_PRV_COLOR;
  }
  return null;
}

export function cameraTallyLabel(tally: CameraTallyState): 'PGM' | 'PRV' | null {
  if (tally.pgm) {
    return 'PGM';
  }
  if (tally.prv) {
    return 'PRV';
  }
  return null;
}
