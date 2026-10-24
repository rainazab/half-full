export function navigate(index: number, direction: -1 | 1, storyCount: number) {
  return Math.max(0, Math.min(storyCount, index + direction));
}

export function swipeDirection(dx: number, dy: number, elapsedMs: number): -1 | 0 | 1 {
  if (elapsedMs > 900 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return 0;
  return dx < 0 ? 1 : -1;
}

export function progressLabel(index: number, count: number) {
  return index >= count ? `Complete · ${count} stories` : `${index + 1} of ${count}`;
}

export const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
