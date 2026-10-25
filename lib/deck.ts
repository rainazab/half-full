/**
 * Gesture maths for the horizontal story deck. Pure so the swipe thresholds,
 * velocity rule and edge handling are unit-tested without a browser.
 */
export const DECK_SPRING = {
  type: "spring" as const,
  stiffness: 360,
  damping: 36,
  mass: 0.9,
};
/** Elastic resistance past the first and last page. */
export const DECK_ELASTIC = 0.16;
/** Velocity (px/s) that commits a short flick. */
export const FLICK_VELOCITY = 360;
export const pageOffset = (index: number, width: number) => -index * width;
/**
 * Decides which page a released drag lands on. A drag past 28% of the width
 * (at most 140 px) or a fast flick with at least 24 px of travel commits in
 * the drag direction; anything else springs back. The result stays inside
 * [0, count - 1], so edges resist rather than overshoot.
 */
export function resolveSwipe({
  offset,
  velocity,
  width,
  index,
  count,
}: {
  offset: number;
  velocity: number;
  width: number;
  index: number;
  count: number;
}) {
  if (count <= 0) return 0;
  const threshold = Math.min(width * 0.28, 140);
  const flick = Math.abs(velocity) >= FLICK_VELOCITY && Math.abs(offset) >= 24;
  let target = index;
  if (offset <= -threshold || (flick && velocity < 0)) target = index + 1;
  else if (offset >= threshold || (flick && velocity > 0)) target = index - 1;
  return Math.max(0, Math.min(count - 1, target));
}
export const INTERACTIVE_SELECTOR =
  "a,button,input,select,textarea,summary,details,dialog,audio,video,[role='slider'],[data-no-swipe]";
/** Controls inside a page keep their own pointer behaviour; a swipe never starts on them. */
export function isInteractiveTarget(target: EventTarget | null) {
  return (
    typeof Element !== "undefined" &&
    target instanceof Element &&
    !!target.closest(INTERACTIVE_SELECTOR)
  );
}
/** Scale and opacity of a page as the track moves, for subtle neighbour previews. */
export function neighbourStyle(x: number, index: number, width: number) {
  if (!(width > 0)) return { scale: 1, opacity: 1 };
  const distance = Math.min(1, Math.abs(x + index * width) / width);
  return {
    scale: 1 - distance * 0.06,
    opacity: 1 - distance * 0.35,
  };
}
export function progressLabel(index: number, count: number) {
  return index >= count
    ? `Complete · ${count} stories`
    : `${index + 1} of ${count}`;
}

/** Continuous edition position, including a drag between stories and the ending. */
export function editionProgress(
  offset: number,
  width: number,
  stories: number,
) {
  if (!(width > 0) || !(stories > 0) || !Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(1, -offset / (width * stories)));
}
