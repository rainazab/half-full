import assert from "node:assert/strict";
import test from "node:test";
import {
  assignThemes,
  contrastRatio,
  ENDING_THEME,
  mixColor,
  STORY_THEMES,
  themeForCategory,
  themeGradient,
  themeVariables,
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

test("every theme keeps white readable on its deep top and ink readable on the sheet", () => {
  for (const theme of [...STORY_THEMES, ENDING_THEME]) {
    assert.ok(
      contrastRatio("#ffffff", theme.top) >= 4.5,
      `${theme.id} white on top`,
    );
    assert.ok(
      contrastRatio(theme.ink, "#ffffff") >= 7,
      `${theme.id} ink on sheet`,
    );
    assert.ok(
      contrastRatio(theme.ink, theme.tint) >= 7,
      `${theme.id} ink on tint`,
    );
    assert.ok(
      contrastRatio(theme.accent, "#ffffff") >= 4.5,
      `${theme.id} accent on sheet`,
    );
    assert.ok(
      contrastRatio(theme.muted, "#ffffff") >= 4.5,
      `${theme.id} muted on sheet`,
    );
  }
});
test("themes come from categories deterministically and neighbours never share one", () => {
  assert.equal(themeForCategory("Technology")?.id, "cobalt");
  assert.equal(themeForCategory("Health")?.id, "forest");
  assert.equal(themeForCategory("Environment")?.id, "forest");
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
    "cobalt",
    "forest",
    "violet",
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
  assert.equal(mixColor("#1d4ed8", "#c2410c", 2), "#c2410c");
  assert.equal(mixColor("#1d4ed8", "#c2410c", -1), "#1d4ed8");
});
test("every drag blend preserves contrast and the reusable gradients have unequal ambient fields", () => {
  for (const from of [...STORY_THEMES, ENDING_THEME]) {
    for (const to of [...STORY_THEMES, ENDING_THEME]) {
      for (const fraction of [0, .25, .5, .75, 1]) {
        assert.ok(contrastRatio("#ffffff", mixColor(from.top, to.top, fraction)) >= 4.5);
        assert.ok(contrastRatio(from.ink, mixColor(from.tint, to.tint, fraction)) >= 7);
      }
    }
    const gradient = themeGradient(from.top, from.glow);
    assert.equal(gradient.match(/radial-gradient/g)?.length, 2);
    assert.equal(themeVariables(from)["--story-top"], from.top);
    assert.equal(themeVariables(from)["--story-surface"], "#f9f7f2");
  }
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
