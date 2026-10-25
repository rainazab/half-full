import { validDay, type ReadingProgress } from "./daily";
const moods = new Set([
  "Interesting",
  "Insightful",
  "Hopeful",
  "Stressed",
  "Clearer",
  "A lot",
  "",
]);
export const emptyProgress = (): ReadingProgress => ({
  days: [],
  reactions: {},
});
export function cleanProgress(value: unknown): ReadingProgress {
  const row = (
    value && typeof value === "object" ? value : {}
  ) as Partial<ReadingProgress>;
  return {
    days: [
      ...new Set(
        Array.isArray(row.days)
          ? row.days.filter(
              (day): day is string => typeof day === "string" && validDay(day),
            )
          : [],
      ),
    ]
      .sort()
      .slice(-366),
    reactions: Object.fromEntries(
      Object.entries(
        row.reactions && typeof row.reactions === "object" ? row.reactions : {},
      )
        .filter(
          ([id, mood]) =>
            /^[a-zA-Z0-9_-]{1,150}$/.test(id) &&
            typeof mood === "string" &&
            moods.has(mood),
        )
        .slice(-1000),
    ),
  };
}
/** Guest history joins the account once; existing account reactions win conflicts. */
export function importGuest(
  account: ReadingProgress,
  guest: ReadingProgress,
): ReadingProgress {
  return cleanProgress({
    days: [...account.days, ...guest.days],
    reactions: { ...guest.reactions, ...account.reactions },
  });
}
/** A patch contains only this device's edits, never a stale copy of the account. */
export function progressPatch(
  previous: ReadingProgress,
  next: ReadingProgress,
): ReadingProgress {
  return cleanProgress({
    days: next.days.filter((day) => !previous.days.includes(day)),
    reactions: Object.fromEntries(
      Object.entries(next.reactions).filter(
        ([id, mood]) => previous.reactions[id] !== mood,
      ),
    ),
  });
}
export function applyProgress(
  base: ReadingProgress,
  patch: ReadingProgress,
): ReadingProgress {
  return cleanProgress({
    days: [...base.days, ...patch.days],
    reactions: { ...base.reactions, ...patch.reactions },
  });
}
export function hasProgress(progress: ReadingProgress) {
  return progress.days.length > 0 || Object.keys(progress.reactions).length > 0;
}
export const profileCacheKey = (uid?: string) =>
  uid ? `half-full-profile:${uid}` : "us-reading-v1";
export const pendingCacheKey = (uid: string) => `half-full-pending:${uid}`;
export function authMessage(code?: string) {
  switch (code) {
    case "auth/popup-blocked":
      return "Allow pop-ups, then try signing in again.";
    case "auth/unauthorized-domain":
      return "Sign-in isn’t enabled for this website yet.";
    case "auth/operation-not-allowed":
      return "Google sign-in isn’t available yet. Please try again shortly.";
    case "auth/network-request-failed":
      return "Couldn’t reach Google sign-in. Check your connection and try again.";
    case "permission-denied":
      return "Signed in, but cloud sync is unavailable. Your progress is saved on this device.";
    default:
      return "Couldn’t connect to your account. Please try again.";
  }
}
