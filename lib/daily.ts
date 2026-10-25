/** One shared publishing day; device time zones do not create duplicate editions. */
export const EDITION_TIME_ZONE = "America/Los_Angeles";
export function editionDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EDITION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function validDay(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function dateLabel(
  day: string,
  options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" },
) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  });
}
export type ArchiveEntry = {
  date: string;
  id: string;
  count: number;
  mode: "live" | "demo";
  url?: string;
  label?: string;
};
export type ReadingProgress = {
  days: string[];
  reactions: Record<string, string>;
};
export function markRead(
  progress: ReadingProgress,
  day: string,
): ReadingProgress {
  return {
    ...progress,
    days: [...new Set([...progress.days, day])]
      .filter(validDay)
      .sort()
      .slice(-366),
  };
}
export function readingStreak(days: string[], today = editionDay()) {
  const completed = new Set(days);
  let cursor = new Date(`${today}T12:00:00Z`),
    count = 0;
  if (!completed.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (completed.has(cursor.toISOString().slice(0, 10))) {
    count++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}

/** Historical editions use an exact publication day, never a relabeled current batch. */
export function earliestEditionDay(today = editionDay()) {
  const [year, month, day] = today.split("-").map(Number);
  const last = new Date(Date.UTC(year - 10, month, 0)).getUTCDate();
  return `${year - 10}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
export function selectableDay(day: string, today = editionDay()) {
  return validDay(day) && day >= earliestEditionDay(today) && day <= today;
}
export function shiftDay(day: string, delta: number) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}
