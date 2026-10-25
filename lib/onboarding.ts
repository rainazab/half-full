/**
 * First-run state lives on the device, separate from editorial content and
 * from the account. Finishing or skipping the intro persists across redesigns; only an explicit
 * reset or removal of device data re-triggers it.
 */
export const ONBOARDING_KEY = "half-full-onboarding-v1";
export const ONBOARDING_VERSION = 1;
export type OnboardingRecord = {
  version: number;
  completedAt: string;
  skipped: boolean;
  status?: "completed" | "skipped";
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
        skipped: raw.skipped === true || raw.status === "skipped",
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
    storage?.setItem(
      ONBOARDING_KEY,
      JSON.stringify({
        ...record,
        status: record.skipped ? "skipped" : "completed",
      }),
    );
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
  return !record;
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
  return first
    ? `${base.replace(/\?$/, "")}, ${first}.`
    : base.endsWith("?")
      ? base
      : `${base}.`;
}

/** A second durable store survives a failed localStorage write in standalone WebKit. */
async function onboardingDatabase(
  write?: OnboardingRecord | null,
): Promise<OnboardingRecord | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: OnboardingRecord | null) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }
    };
    const timer = setTimeout(() => finish(null), 1500);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open("half-full-device", 1);
    } catch {
      finish(null);
      return;
    }
    request.onupgradeneeded = () =>
      request.result.createObjectStore("settings");
    request.onerror = () => finish(null);
    request.onblocked = () => finish(null);
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      const transaction = db.transaction(
        "settings",
        write === undefined ? "readonly" : "readwrite",
      );
      const store = transaction.objectStore("settings");
      const operation =
        write === undefined
          ? store.get(ONBOARDING_KEY)
          : write === null
            ? store.delete(ONBOARDING_KEY)
            : store.put(write, ONBOARDING_KEY);
      let value: OnboardingRecord | null = null;
      operation.onsuccess = () => {
        value =
          write === undefined
            ? readOnboarding({
                getItem: () => JSON.stringify(operation.result ?? null),
              })
            : write;
      };
      transaction.oncomplete = () => {
        db.close();
        finish(value);
      };
      transaction.onabort = transaction.onerror = () => {
        db.close();
        finish(null);
      };
    };
  });
}
export async function restoreOnboarding(): Promise<OnboardingRecord | null> {
  let local: OnboardingRecord | null = null;
  try {
    local = readOnboarding(window.localStorage);
  } catch {}
  if (local) {
    void onboardingDatabase(local);
    return local;
  }
  const backup = await onboardingDatabase();
  if (backup)
    try {
      writeOnboarding(window.localStorage, backup);
    } catch {}
  return backup;
}
export async function persistOnboarding(record: OnboardingRecord) {
  let saved = false;
  try {
    writeOnboarding(window.localStorage, record);
    saved = !!readOnboarding(window.localStorage);
  } catch {}
  const backup = await onboardingDatabase(record);
  return saved || !!backup;
}
export async function resetOnboarding() {
  try {
    clearOnboarding(window.localStorage);
  } catch {}
  await onboardingDatabase(null);
}
