"use client";
import { useCallback, useEffect, useState } from "react";
import {
  cleanPreferences,
  defaultPreferences,
  PREFERENCES_KEY,
  readPreferences,
  writePreferences,
  type ListeningPreferences,
} from "@/lib/preferences";

/**
 * Device-local listening preferences (narrator, speed, autoplay). They apply to
 * every account on this device and never regenerate the edition.
 */
export default function usePreferences() {
  const [preferences, setState] =
    useState<ListeningPreferences>(defaultPreferences);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setState(readPreferences(window.localStorage));
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key === PREFERENCES_KEY)
        setState(readPreferences(window.localStorage));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const update = useCallback((patch: Partial<ListeningPreferences>) => {
    setState((previous) => {
      const next = cleanPreferences({ ...previous, ...patch });
      writePreferences(window.localStorage, next);
      return next;
    });
  }, []);
  return { preferences, ready, update };
}
export type PreferencesState = ReturnType<typeof usePreferences>;
