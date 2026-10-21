/** Push and tap-back slide length, close to UINavigationController. */
export const PAGE_TRANSITION_MS = 350;

/**
 * Width of the left-edge strip that owns back-swipe touches. The strip takes the touch as soon
 * as the finger lands, so the native scroll view underneath cannot start scrolling and steal it.
 */
export const EDGE_SWIPE_START_WIDTH = 24;

/** The strip starts below the header so the "‹ Back" link next to the edge stays tappable. */
export const EDGE_SWIPE_TOP_INSET = 56;

/** Horizontal travel before the page starts to follow the finger. */
const EDGE_SWIPE_SLOP = 4;

/** Release speed (px/ms) that finishes the swipe even when it is short of halfway. */
const EDGE_SWIPE_FLICK_VELOCITY = 0.3;

/** How far the page underneath starts to the left, as a share of the width (UIKit parallax). */
export const EDGE_SWIPE_UNDERLAY_SHIFT = 0.3;

/** True once a touch on the edge strip moves more to the right than up or down. */
export function shouldStartEdgeSwipe(dx: number, dy: number): boolean {
  return dx > EDGE_SWIPE_SLOP && dx >= Math.abs(dy);
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
