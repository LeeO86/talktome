/** Push and tap-back slide length, close to UINavigationController. */
export const PAGE_TRANSITION_MS = 350;

/** Width of the left-edge strip where a back swipe can start, like UIKit's interactive pop. */
export const EDGE_SWIPE_START_WIDTH = 24;

/** Horizontal travel before the swipe takes the touch away from rows and the scroll view. */
const EDGE_SWIPE_SLOP = 8;

/** Release speed (px/ms) that finishes the swipe even when it is short of halfway. */
const EDGE_SWIPE_FLICK_VELOCITY = 0.3;

/** How far the page underneath starts to the left, as a share of the width (UIKit parallax). */
export const EDGE_SWIPE_UNDERLAY_SHIFT = 0.3;

/**
 * True once a touch that began on the left edge moves mostly to the right.
 * `startX` is relative to the sheet, not the screen, so an iPad page sheet works too.
 */
export function shouldStartEdgeSwipe(startX: number, dx: number, dy: number): boolean {
  return startX <= EDGE_SWIPE_START_WIDTH && dx > EDGE_SWIPE_SLOP && Math.abs(dx) > Math.abs(dy) * 1.5;
}

/** Goes back past halfway or on a rightward flick; a leftward flick always cancels. */
export function shouldCompleteEdgeSwipe(dx: number, vx: number, width: number): boolean {
  if (vx < -EDGE_SWIPE_FLICK_VELOCITY / 2) {
    return false;
  }
  return dx > width / 2 || (vx > EDGE_SWIPE_FLICK_VELOCITY && dx > 0);
}

/** Duration for the rest of the slide, so a fast flick does not slow down at the end. */
export function edgeSwipeFinishDuration(dx: number, vx: number, width: number): number {
  const remaining = Math.max(0, width - dx);
  const speed = Math.max(vx, width / 300);
  return Math.round(Math.min(300, Math.max(120, remaining / speed)));
}
