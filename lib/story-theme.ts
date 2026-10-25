import type { ApprovedStory } from "./types";

/**
 * Deterministic story atmospheres. Each theme is a tested pairing of a pastel
 * background with the ink foreground (every pair is above 7:1), a slightly
 * lighter surface for the stage and controls, and an accent for progress.
 * Themes come from the story's category, so the same story always gets the
 * same atmosphere; adjacent stories never share one.
 */
export type StoryTheme = {
  id: string;
  name: string;
  background: string;
  surface: string;
  accent: string;
  ink: string;
  muted: string;
};
export const STORY_THEMES: StoryTheme[] = [
  {
    id: "sky",
    name: "Sky",
    background: "#dce8fb",
    surface: "#eef4ff",
    accent: "#3f6bb5",
    ink: "#1f3350",
    muted: "#51657f",
  },
  {
    id: "apricot",
    name: "Apricot",
    background: "#fbe3cd",
    surface: "#fff2e6",
    accent: "#b9652a",
    ink: "#4a2f1a",
    muted: "#7c5a42",
  },
  {
    id: "sage",
    name: "Sage",
    background: "#dcebd9",
    surface: "#eef6ec",
    accent: "#3f6b4d",
    ink: "#20362a",
    muted: "#536a5b",
  },
  {
    id: "lavender",
    name: "Lavender",
    background: "#e6def7",
    surface: "#f3eefc",
    accent: "#6a4fb0",
    ink: "#30254d",
    muted: "#5f5478",
  },
  {
    id: "golden",
    name: "Golden",
    background: "#f6ecc6",
    surface: "#fdf7e3",
    accent: "#9a7a1c",
    ink: "#433712",
    muted: "#6f6239",
  },
  {
    id: "rose",
    name: "Rose",
    background: "#f7dde6",
    surface: "#fcedf2",
    accent: "#b04a6c",
    ink: "#4a2230",
    muted: "#7a4d5b",
  },
];
/** The ending page rests on the brand cream. */
export const ENDING_THEME: StoryTheme = {
  id: "cream",
  name: "Cream",
  background: "#faf9f4",
  surface: "#ffffff",
  accent: "#355b4c",
  ink: "#273b38",
  muted: "#66746e",
};
const CATEGORY_THEMES: [RegExp, string][] = [
  [/tech|software|digital|cyber|internet|ai\b|security/i, "sky"],
  [
    /health|medic|science|research|climate|environment|nature|ocean|water|wildlife/i,
    "sage",
  ],
  [
    /econom|business|money|finance|work|labor|housing|transit|transport/i,
    "apricot",
  ],
  [/educat|school|universit|culture|arts?|history|books?|museum/i, "lavender"],
  [/politic|government|court|law|election|policy|world|conflict/i, "golden"],
  [/communit|local|sport|food|life|people/i, "rose"],
];
export function themeForCategory(category: string) {
  const match = CATEGORY_THEMES.find(([pattern]) => pattern.test(category));
  return STORY_THEMES.find((theme) => theme.id === match?.[1]);
}
/**
 * Assigns a theme to every story in edition order: the category's theme when
 * it differs from the previous story's, otherwise the next unused theme in the
 * palette so neighbours always transition between two different atmospheres.
 */
export function assignThemes(stories: Pick<ApprovedStory, "category">[]) {
  const assigned: StoryTheme[] = [];
  for (const [index, story] of stories.entries()) {
    const previous = assigned[index - 1];
    const preferred = themeForCategory(story.category);
    let theme =
      preferred && preferred.id !== previous?.id ? preferred : undefined;
    if (!theme) {
      const used = new Set(assigned.map((item) => item.id));
      theme =
        STORY_THEMES.find(
          (item) => !used.has(item.id) && item.id !== previous?.id,
        ) ?? STORY_THEMES[(index + 1) % STORY_THEMES.length];
      if (theme.id === previous?.id)
        theme =
          STORY_THEMES[(STORY_THEMES.indexOf(theme) + 1) % STORY_THEMES.length];
    }
    assigned.push(theme);
  }
  return assigned;
}
const hex = (value: string) => {
  const clean = value.replace("#", "");
  return [0, 2, 4].map((offset) =>
    parseInt(clean.slice(offset, offset + 2), 16),
  );
};
const channel = (value: number) =>
  Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, "0");
/** Linear colour mix for drag-following transitions (t from 0 to 1). */
export function mixColor(from: string, to: string, t: number) {
  const a = hex(from),
    b = hex(to);
  const p = Math.max(0, Math.min(1, t));
  return `#${a.map((v, i) => channel(v + (b[i] - v) * p)).join("")}`;
}
/** WCAG relative luminance and contrast ratio, used by tests to keep every pairing readable. */
export function contrastRatio(foreground: string, background: string) {
  const luminance = (value: string) => {
    const [r, g, b] = hex(value).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = luminance(foreground),
    l2 = luminance(background);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}
/** CSS custom properties for a page, applied where the theme lives. */
export function themeVariables(theme: StoryTheme) {
  return {
    "--story-bg": theme.background,
    "--story-surface": theme.surface,
    "--story-accent": theme.accent,
    "--story-ink": theme.ink,
    "--story-muted": theme.muted,
  } as Record<string, string>;
}
