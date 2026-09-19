// TalkToMe 1.5.4 scopes Companion PGM/PRV tally by production and emits
// `cut-camera` as `{ pgm, prv, productionId }`. Older servers sent a boolean
// (PGM only). PGM has visual priority when both buses are on.

export const TALLY_PGM_COLOR = '#e00000';
export const TALLY_PRV_COLOR = '#00875a';
/** On-air frame around the operator screen. The web client uses 0.4rem (~6px) plus
 * an 0.5rem dark-container inset; phones need a thicker ring to read from a distance. */
export const TALLY_FRAME_WIDTH = 24;

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
