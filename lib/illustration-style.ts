/**
 * The permanent half full illustration style. Everything Recraft generates is
 * anchored to the existing original reaction stickers (public/reactions), whose
 * provenance is documented in public/reactions/README.md. Bump `version` when
 * the references, prompt language or controls change; manifests record it so
 * old assets are never mistaken for the current style.
 */
export const ILLUSTRATION_STYLE = {
  version: "half-full-style/1",
  /** Palette read from the reaction stickers and the app's design tokens. */
  palette: {
    cream: "#faf9f4",
    ink: "#273b38",
    butter: "#f6e39c",
    sky: "#a6cff2",
    sage: "#bfe3cf",
    lilac: "#cdbcf0",
    blush: "#f4c8dc",
  },
  /**
   * Reference images, most representative first. All four agree in texture and
   * line. They are 768px copies of the original reaction stickers (see
   * public/illustration-references/README.md); Recraft needs at least 256px.
   */
  references: [
    "/illustration-references/hopeful-768.png",
    "/illustration-references/insightful-768.png",
    "/illustration-references/interesting-768.png",
    "/illustration-references/stressed-768.png",
  ],
  /** Sent once when the reusable Recraft style is created. */
  stylePrompt:
    "Soft hand-painted gouache editorial illustration: matte pastel fills with very subtle paper grain, rounded organic shapes, gentle navy line accents, minimal clutter, readable silhouettes, warm friendly mood, cream background. Original artwork, flat 2D, no text.",
  /** Prefixes every scene prompt so subject prompts stay about the subject. */
  promptPrefix:
    "Flat 2D editorial illustration in a soft hand-painted pastel gouache style with subtle paper grain and simple rounded shapes, on a plain cream background.",
  promptSuffix:
    "Clear single focal point, uncluttered composition that reads at phone size, no text, no letters, no numbers, no labels, no logos, no signage, no watermark, no photorealism, no 3D rendering, no real people's faces.",
  /** Words a scene prompt may never request; validation rejects them. */
  forbiddenPromptTerms: [
    "text",
    "caption",
    "label",
    "labels",
    "lettering",
    "logo",
    "typography",
    "slogan",
    "headline",
    "quote",
    "written",
    "photo",
    "photograph",
    "photorealistic",
    "realistic",
    "3d",
    "render",
    "map of",
    "flag of",
    "portrait of",
  ],
  recraft: {
    model: "recraftv4_styles",
    baseStyle: "digital_illustration",
    match: "flexible",
    size: "4:3",
    imageFormat: "webp",
    /** Recraft colour controls; weights must total at most 1.0 (cream ground dominates). */
    colors: [
      { rgb: [250, 249, 244], weight: 0.35 },
      { rgb: [191, 227, 207], weight: 0.15 },
      { rgb: [166, 207, 242], weight: 0.15 },
      { rgb: [246, 227, 156], weight: 0.12 },
      { rgb: [205, 188, 240], weight: 0.08 },
      { rgb: [244, 200, 220], weight: 0.08 },
      { rgb: [39, 59, 56], weight: 0.05 },
    ],
    backgroundColor: { rgb: [250, 249, 244] },
  },
} as const;
export type IllustrationStyle = typeof ILLUSTRATION_STYLE;
export const REACTION_CHARACTERS = [
  "hopeful",
  "insightful",
  "interesting",
  "stressed",
] as const;
export type ReactionCharacter = (typeof REACTION_CHARACTERS)[number];
