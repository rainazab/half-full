/**
 * First-run state lives on the device, separate from editorial content and
 * from the account. Finishing or skipping the intro records a version so a
 * later redesign can show it again deliberately; nothing else re-triggers it.
 */
export const ONBOARDING_KEY = "half-full-onboarding-v1";
export const ONBOARDING_VERSION = 1;
export type OnboardingRecord = {
  version: number;
  completedAt: string;
  skipped: boolean;
};
export type CatchUpMode = "read" | "listen" | "both";
export function readOnboarding(
  storage: Pick<Storage, "getItem"> | undefined,
): OnboardingRecord | null {
  try {
    const raw = JSON.parse(storage?.getItem(ONBOARDING_KEY) ?? "null");
    if (
      raw &&
      typeof raw === "object" &&
      typeof raw.version === "number" &&
      typeof raw.completedAt === "string"
    )
      return {
        version: raw.version,
        completedAt: raw.completedAt,
        skipped: raw.skipped === true,
      };
  } catch {
    /* Unreadable storage behaves like a fresh device. */
  }
  return null;
}
export function writeOnboarding(
  storage: Pick<Storage, "setItem"> | undefined,
  record: OnboardingRecord,
) {
  try {
    storage?.setItem(ONBOARDING_KEY, JSON.stringify(record));
  } catch {
    /* Private browsing can refuse storage; the session still works. */
  }
}
export function clearOnboarding(
  storage: Pick<Storage, "removeItem"> | undefined,
) {
  try {
    storage?.removeItem(ONBOARDING_KEY);
  } catch {}
}
/**
 * The intro shows on a fresh device only, and never on a deep link to a
 * specific date, which should open that edition directly.
 */
export function shouldShowOnboarding(
  record: OnboardingRecord | null,
  search: string,
) {
  if (new URLSearchParams(search).has("date")) return false;
  return !record || record.version < ONBOARDING_VERSION;
}
export function greeting(now: Date, name?: string | null) {
  const hour = now.getHours();
  const base =
    hour < 5
      ? "Still up?"
      : hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : "Good evening";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${base}, ${first}.` : `${base}.`;
}
