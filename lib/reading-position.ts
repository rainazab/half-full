import type { ApprovedStory } from "./types";
export function validPosition(value: unknown, count: number) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < count
    ? value
    : 0;
}
export function readingMinutes(stories: ApprovedStory[]) {
  const words = stories.reduce(
    (n, s) =>
      n +
      `${s.headline} ${s.experience?.explanation.text ?? s.summary} ${s.whyItMatters} ${s.action}`
        .trim()
        .split(/\s+/).length,
    0,
  );
  return Math.max(1, Math.ceil(words / 220));
}
export const positionKey = (edition: string, uid = "guest") =>
  `half-full-position:${uid}:${edition}`;
