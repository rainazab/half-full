/**
 * Scroll-driven reading model for the vertical feed. Pure helpers keep the
 * active-story and completion logic testable without a browser.
 */
export type Visibility = { index: number; ratio: number; top: number };
/**
 * Chooses the active story from the stories currently intersecting the
 * reading band. The band is a thin horizontal strip near the top third of the
 * viewport, so a story becomes active when its content crosses that line and
 * stays active until the next story crosses it. `current` only changes when a
 * different story actually occupies the band, which removes flicker while two
 * stories are partially visible.
 */
export function activeStory(
  current: number,
  intersecting: ReadonlySet<number>,
  count: number,
) {
  if (!intersecting.size) return Math.max(0, Math.min(count, current));
  // The lowest intersecting story (closest to the band's upper edge) wins; this
  // is the story whose heading the reader has reached.
  let best = -1;
  for (const index of intersecting) if (index > best) best = index;
  return Math.max(0, Math.min(count, best));
}
/** The reading band: 30%–45% down the viewport, expressed as IntersectionObserver rootMargin. */
export const READING_BAND_ROOT_MARGIN = "-30% 0px -55% 0px";
/** The ending counts as reached once this much of it is on screen. */
export const ENDING_THRESHOLD = 0.6;
/**
 * Completion fires exactly once per reader mount and only when the ending has
 * actually been reached, never on first render.
 */
export function shouldComplete(
  already: boolean,
  endingRatio: number,
  storyCount: number,
) {
  return !already && storyCount > 0 && endingRatio >= ENDING_THRESHOLD;
}
/**
 * Audio policy while scrolling: a clip keeps playing while its story is
 * within one viewport of the reading band, so readers can glance ahead; it
 * pauses when they have clearly moved on. Returns true when playback may continue.
 */
export function audioMayContinue(storyIndex: number, activeIndex: number) {
  return Math.abs(storyIndex - activeIndex) <= 1;
}
export const storyAnchor = (index: number) => `story-${index + 1}`;
