import assert from "node:assert/strict";
import test from "node:test";
import {
  assignThemes,
  contrastRatio,
  ENDING_THEME,
  mixColor,
  STORY_THEMES,
  themeForCategory,
} from "../lib/story-theme";
import {
  clearOnboarding,
  greeting,
  ONBOARDING_VERSION,
  readOnboarding,
  shouldShowOnboarding,
  writeOnboarding,
} from "../lib/onboarding";
import { cleanPreferences, defaultPreferences } from "../lib/preferences";

test("every theme keeps ink, muted and accent text readable on its background and surface", () => {
  for (const theme of [...STORY_THEMES, ENDING_THEME]) {
    for (const ground of [theme.background, theme.surface]) {
      assert.ok(
        contrastRatio(theme.ink, ground) >= 7,
        `${theme.id} ink on ${ground}`,
      );
      assert.ok(
        contrastRatio(theme.muted, ground) >= 4.5,
        `${theme.id} muted on ${ground}`,
      );
      assert.ok(
        contrastRatio(theme.accent, ground) >= 3,
        `${theme.id} accent on ${ground}`,
      );
    }
    // White controls (progress rail, surfaces) sit on the background, so the ink must read on white too.
    assert.ok(contrastRatio(theme.ink, "#ffffff") >= 7);
  }
});
test("themes come from categories deterministically and neighbours never share one", () => {
  assert.equal(themeForCategory("Technology")?.id, "sky");
  assert.equal(themeForCategory("Health")?.id, "sage");
  assert.equal(themeForCategory("Environment")?.id, "sage");
  assert.equal(themeForCategory("Unusual")?.id, undefined);
  const stories = [
    "Technology",
    "Health",
    "Education",
    "Environment",
    "Science",
  ].map((category) => ({ category }));
  const first = assignThemes(stories);
  assert.deepEqual(first, assignThemes(stories));
  assert.deepEqual(first.map((t) => t.id).slice(0, 3), [
    "sky",
    "sage",
    "lavender",
  ]);
  // Environment and Science would both be sage back to back; the second gets the next unused theme.
  for (let i = 1; i < first.length; i++)
    assert.notEqual(first[i].id, first[i - 1].id);
  const same = assignThemes(
    Array.from({ length: 8 }, () => ({ category: "Health" })),
  );
  for (let i = 1; i < same.length; i++)
    assert.notEqual(same[i].id, same[i - 1].id);
  assert.deepEqual(assignThemes([]), []);
});
test("colour mixing follows the drag position between two atmospheres", () => {
  assert.equal(mixColor("#000000", "#ffffff", 0), "#000000");
  assert.equal(mixColor("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(mixColor("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mixColor("#dce8fb", "#fbe3cd", 2), "#fbe3cd");
  assert.equal(mixColor("#dce8fb", "#fbe3cd", -1), "#dce8fb");
});
test("the intro shows once per device, never on a date deep link, and can be replayed", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  assert.equal(shouldShowOnboarding(readOnboarding(storage), ""), true);
  assert.equal(
    shouldShowOnboarding(readOnboarding(storage), "?date=2026-06-29"),
    false,
  );
  writeOnboarding(storage, {
    version: ONBOARDING_VERSION,
    completedAt: "2026-10-25T00:00:00.000Z",
    skipped: true,
  });
  assert.equal(shouldShowOnboarding(readOnboarding(storage), ""), false);
  assert.equal(readOnboarding(storage)?.skipped, true);
  store.set("half-full-onboarding-v1", "{broken");
  assert.equal(readOnboarding(storage), null);
  writeOnboarding(storage, { version: 0, completedAt: "x", skipped: false });
  assert.equal(shouldShowOnboarding(readOnboarding(storage), ""), true);
  clearOnboarding(storage);
  assert.equal(readOnboarding(storage), null);
});
test("catch-up mode is a device preference that cleans like the others", () => {
  assert.equal(defaultPreferences().mode, "both");
  assert.equal(cleanPreferences({ mode: "listen" }).mode, "listen");
  assert.equal(cleanPreferences({ mode: "podcast" }).mode, "both");
  assert.equal(greeting(new Date(2026, 9, 25, 8)), "Good morning.");
  assert.equal(
    greeting(new Date(2026, 9, 25, 14), "Raina Zab"),
    "Good afternoon, Raina.",
  );
  assert.equal(greeting(new Date(2026, 9, 25, 21), "  "), "Good evening.");
});
