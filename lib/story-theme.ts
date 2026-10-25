import type { ApprovedStory } from "./types";

/**
 * Story atmospheres. Each is a saturated hue pair: `top` is deep enough for
 * white text (≥ 4.5:1), `glow` is the bright end of the gradient behind the
 * artwork and player, and the article sheet below is white with ink. Themes
 * are picked from the story's category, so a story always gets the same
 * atmosphere and neighbouring stories never share one.
 */
export type StoryTheme = {
  id: string;
  name: string;
  /** Deep saturated colour at the top of the page; white text sits on it. */
  top: string;
  /** Bright end of the gradient, behind the artwork. */
  glow: string;
  /** Soft tint used on home tiles and the sheet's accents. */
  tint: string;
  /** Accent for progress, links and highlights on the white sheet. */
  accent: string;
  /** Text colour on the sheet. */
  ink: string;
  muted: string;
  /** Legacy aliases used by the home feature; same as tint/ink. */
  background: string;
  surface: string;
};
const theme = (
  id: string,
  name: string,
  top: string,
  glow: string,
  tint: string,
  accent: string,
): StoryTheme => ({
  id,
  name,
  top,
  glow,
  tint,
  accent,
  ink: "#17202a",
  muted: "#55606c",
  background: tint,
  surface: "#ffffff",
});
export const STORY_THEMES: StoryTheme[] = [
  theme("cobalt", "Cobalt", "#1d4ed8", "#60a5fa", "#dbeafe", "#1d4ed8"),
  theme("ember", "Ember", "#c2410c", "#fb923c", "#ffedd5", "#c2410c"),
  theme("forest", "Forest", "#15803d", "#4ade80", "#dcfce7", "#15803d"),
  theme("violet", "Violet", "#6d28d9", "#c084fc", "#ede9fe", "#6d28d9"),
  theme("ochre", "Ochre", "#a16207", "#facc15", "#fef3c7", "#a16207"),
  theme("magenta", "Magenta", "#be185d", "#f472b6", "#fce7f3", "#be185d"),
];
/** The ending page rests on the brand green. */
export const ENDING_THEME: StoryTheme = theme(
  "brand",
  "Brand",
  "#2f5d4a",
  "#8fd3b4",
  "#dcebd9",
  "#2f5d4a",
);
const CATEGORY_THEMES: [RegExp, string][] = [
  [/tech|software|digital|cyber|internet|ai\b|security/i, "cobalt"],
  [
    /health|medic|science|research|climate|environment|nature|ocean|water|wildlife/i,
    "forest",
  ],
  [
    /econom|business|money|finance|work|labor|housing|transit|transport/i,
    "ember",
  ],
  [/educat|school|universit|culture|arts?|history|books?|museum/i, "violet"],
  [/politic|government|court|law|election|policy|world|conflict/i, "ochre"],
  [/communit|local|sport|food|life|people/i, "magenta"],
];
export function themeForCategory(category: string) {
  const match = CATEGORY_THEMES.find(([pattern]) => pattern.test(category));
  return STORY_THEMES.find((item) => item.id === match?.[1]);
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
    let pick =
      preferred && preferred.id !== previous?.id ? preferred : undefined;
    if (!pick) {
      const used = new Set(assigned.map((item) => item.id));
      pick =
        STORY_THEMES.find(
          (item) => !used.has(item.id) && item.id !== previous?.id,
        ) ?? STORY_THEMES[(index + 1) % STORY_THEMES.length];
      if (pick.id === previous?.id)
        pick =
          STORY_THEMES[(STORY_THEMES.indexOf(pick) + 1) % STORY_THEMES.length];
    }
    assigned.push(pick);
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
/** WCAG contrast ratio, used by tests to keep every pairing readable. */
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
/** CSS custom properties for a page or tile. */
export function themeVariables(item: StoryTheme) {
  return {
    "--story-top": item.top,
    "--story-glow": item.glow,
    "--story-tint": item.tint,
    "--story-accent": item.accent,
    "--story-ink": item.ink,
    "--story-muted": item.muted,
    "--story-bg": item.tint,
    "--story-surface": item.surface,
  } as Record<string, string>;
}
/** Gradient behind a story: deep at the top, bright glow, then the sheet. */
export function themeGradient(top: string, glow: string) {
  return `linear-gradient(180deg, ${top} 0%, ${glow} 46%, ${mixColor(glow, "#ffffff", 0.55)} 100%)`;
}
