import { DEFAULT_NARRATOR, isNarratorId, type NarratorId } from "./narrators";

/**
 * Listening preferences live on the device. They never change which stories
 * are selected, and they are not written into the shared edition record.
 */
export type ListeningPreferences = {
  narrator: NarratorId;
  speed: 1 | 1.25 | 1.5;
  autoplayNext: boolean;
};
export const PREFERENCES_KEY = "half-full-preferences-v1";
export const SPEEDS = [1, 1.25, 1.5] as const;
export const defaultPreferences = (): ListeningPreferences => ({
  narrator: DEFAULT_NARRATOR,
  speed: 1,
  autoplayNext: false,
});
export function cleanPreferences(value: unknown): ListeningPreferences {
  const row = (value && typeof value === "object" ? value : {}) as Partial<
    Record<keyof ListeningPreferences, unknown>
  >;
  const speed = SPEEDS.find((option) => option === row.speed) ?? 1;
  return {
    narrator: isNarratorId(row.narrator) ? row.narrator : DEFAULT_NARRATOR,
    speed,
    autoplayNext: row.autoplayNext === true,
  };
}
export function readPreferences(
  storage: Pick<Storage, "getItem"> | undefined,
): ListeningPreferences {
  try {
    return cleanPreferences(
      JSON.parse(storage?.getItem(PREFERENCES_KEY) ?? "null"),
    );
  } catch {
    return defaultPreferences();
  }
}
export function writePreferences(
  storage: Pick<Storage, "setItem"> | undefined,
  value: ListeningPreferences,
) {
  try {
    storage?.setItem(PREFERENCES_KEY, JSON.stringify(cleanPreferences(value)));
  } catch {
    /* Private browsing can refuse storage; the session still works. */
  }
}
/** Audio URLs carry the narrator so cached clips from different voices never mix. */
export function audioPath(
  editionId: string,
  storyId: string,
  narrator: NarratorId,
) {
  return `/api/audio/${encodeURIComponent(editionId)}/${encodeURIComponent(storyId)}?narrator=${encodeURIComponent(narrator)}`;
}
