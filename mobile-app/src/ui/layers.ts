// Phone portrait aims for 8 target rows plus chrome, matching the web client.
// Cards compress/expand slightly; leftover space sits above the list (bottom-justified).
// Landscape uses two columns and a shorter row cap so Reply can sit in a narrow side column.

export const CARD_GAP = 8;
export const CARD_MIN_HEIGHT = 56;
export const CARD_PREFERRED_HEIGHT = 72;
export const CARD_MAX_HEIGHT = 88;
export const PORTRAIT_MAX_ROWS = 8;
export const LANDSCAPE_MAX_ROWS = 4;
export const LANDSCAPE_COLUMNS = 2;
export const HEADER_COLLAPSE_ROW_THRESHOLD = 4;
export const COLLAPSED_HEADER_HEIGHT = 44;

const ESTIMATED_HEADER_HEIGHT = 96;
const ESTIMATED_REPLY_HEIGHT = 72;
const ESTIMATED_SCREEN_PADDING = 20;

export type OperatorLayoutInput = {
  width: number;
  height: number;
  availableHeight?: number;
  headerCollapsed?: boolean;
};

export type OperatorLayout = {
  landscape: boolean;
  columns: number;
  rows: number;
  layerSize: number;
  cardHeight: number;
  gap: number;
  maxRows: number;
};

export function isLandscape(width: number, height: number): boolean {
  return width > height;
}

export function targetGridColumns(width: number, height: number): number {
  return isLandscape(width, height) ? LANDSCAPE_COLUMNS : 1;
}

export function targetGridMaxRows(width: number, height: number): number {
  return isLandscape(width, height) ? LANDSCAPE_MAX_ROWS : PORTRAIT_MAX_ROWS;
}

export function estimateTargetListHeight(
  width: number,
  height: number,
  headerCollapsed = false,
): number {
  const header = headerCollapsed ? COLLAPSED_HEADER_HEIGHT : ESTIMATED_HEADER_HEIGHT;
  const reply = isLandscape(width, height) ? 0 : ESTIMATED_REPLY_HEIGHT;
  return Math.max(CARD_MIN_HEIGHT, height - header - reply - ESTIMATED_SCREEN_PADDING);
}

export function rowsThatFit(availableHeight: number, maxRows: number): number {
  const cap = Math.max(1, Math.floor(maxRows));
  if (!(availableHeight > 0)) {
    return 1;
  }
  for (let rows = cap; rows >= 1; rows -= 1) {
    const cardHeight = (availableHeight - (rows - 1) * CARD_GAP) / rows;
    if (cardHeight >= CARD_MIN_HEIGHT) {
      return rows;
    }
  }
  return 1;
}

export function cardHeightForRows(availableHeight: number, rows: number): number {
  const count = Math.max(1, rows);
  const raw = (availableHeight - (count - 1) * CARD_GAP) / count;
  if (!Number.isFinite(raw)) {
    return CARD_PREFERRED_HEIGHT;
  }
  return Math.min(CARD_MAX_HEIGHT, Math.max(CARD_MIN_HEIGHT, raw));
}

export function operatorLayout(input: OperatorLayoutInput): OperatorLayout {
  const landscape = isLandscape(input.width, input.height);
  const columns = targetGridColumns(input.width, input.height);
  const maxRows = targetGridMaxRows(input.width, input.height);
  const available =
    input.availableHeight ?? estimateTargetListHeight(input.width, input.height, input.headerCollapsed);
  const rows = rowsThatFit(available, maxRows);
  return {
    landscape,
    columns,
    rows,
    layerSize: rows * columns,
    cardHeight: cardHeightForRows(available, rows),
    gap: CARD_GAP,
    maxRows,
  };
}

export function targetLayerSize(
  width: number,
  height: number,
  availableHeight?: number,
  headerCollapsed = false,
): number {
  return operatorLayout({ width, height, availableHeight, headerCollapsed }).layerSize;
}

export function targetLayerCount(
  total: number,
  width: number,
  height: number,
  availableHeight?: number,
  headerCollapsed = false,
): number {
  const size = targetLayerSize(width, height, availableHeight, headerCollapsed);
  if (total <= size) {
    return 1;
  }
  return Math.max(1, Math.ceil(total / size));
}

export function visibleTargets<T>(
  items: T[],
  layerIndex: number,
  width: number,
  height: number,
  availableHeight?: number,
  headerCollapsed = false,
): T[] {
  const size = targetLayerSize(width, height, availableHeight, headerCollapsed);
  if (items.length <= size) {
    return items;
  }
  const count = targetLayerCount(items.length, width, height, availableHeight, headerCollapsed);
  const index = Math.min(Math.max(layerIndex, 0), count - 1);
  const start = index * size;
  return items.slice(start, start + size);
}

export function chunkTargets<T>(items: T[], columns: number): T[][] {
  const count = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += count) {
    rows.push(items.slice(index, index + count));
  }
  return rows;
}

export function shouldOfferHeaderCollapse(input: {
  rows: number;
  availableHeight: number;
  headerHeight: number;
  maxRows: number;
}): boolean {
  const recovered = Math.max(0, input.headerHeight - COLLAPSED_HEADER_HEIGHT);
  if (recovered < 8) {
    return false;
  }
  if (input.rows <= HEADER_COLLAPSE_ROW_THRESHOLD) {
    return true;
  }
  return rowsThatFit(input.availableHeight + recovered, input.maxRows) > input.rows;
}
