import type { CSSProperties } from "react";
import type { StoryTheme } from "../lib/story-theme";

export type AtmosphereTone =
  | "lavender"
  | "home"
  | "mint"
  | "butter"
  | "peach"
  | "forest"
  | "story";

type AtmosphereStyle = CSSProperties & Record<`--${string}`, string | number>;

/**
 * Stable, decorative pigment underneath the page, never over its text or media.
 * The offline texture is shared by every atmosphere; only color fields change.
 * `story` inherits live --story-* variables, including Motion-driven drag colors.
 * Place first inside a positioned, isolated parent with content at z-index: 1.
 */
export default function DitheredAtmosphere({
  tone = "lavender",
  base,
  accent,
  secondary,
  glowPosition,
  intensity,
  scale = 1,
  theme,
  reducedMotion = false,
  className = "",
  style,
}: {
  tone?: AtmosphereTone;
  base?: string;
  accent?: string;
  secondary?: string;
  glowPosition?: { x: string; y: string; secondaryX?: string; secondaryY?: string };
  intensity?: number;
  scale?: number;
  theme?: Pick<StoryTheme, "top" | "glow" | "tint">;
  reducedMotion?: boolean;
  className?: string;
  style?: AtmosphereStyle;
}) {
  const variables: AtmosphereStyle = {
    ...(theme
      ? {
          "--story-top": theme.top,
          "--story-glow": theme.glow,
          "--story-tint": theme.tint,
        }
      : {}),
    ...(base ? { "--atmosphere-base": base } : {}),
    ...(accent ? { "--atmosphere-accent": accent } : {}),
    ...(secondary ? { "--atmosphere-secondary": secondary } : {}),
    ...(glowPosition
      ? {
          "--atmosphere-glow-x": glowPosition.x,
          "--atmosphere-glow-y": glowPosition.y,
          ...(glowPosition.secondaryX
            ? { "--atmosphere-secondary-x": glowPosition.secondaryX }
            : {}),
          ...(glowPosition.secondaryY
            ? { "--atmosphere-secondary-y": glowPosition.secondaryY }
            : {}),
        }
      : {}),
    ...(intensity !== undefined
      ? { "--atmosphere-grain": Math.max(0, Math.min(0.3, intensity)) }
      : {}),
    "--atmosphere-grain-size": `${512 * Math.max(0.5, Math.min(2, scale))}px`,
    ...style,
  };
  return (
    <div
      aria-hidden="true"
      className={`dithered-atmosphere ${className}`.trim()}
      data-tone={tone}
      data-reduced-motion={reducedMotion || undefined}
      style={variables}
    >
      <div className="atmosphere-fields" />
      <div className="atmosphere-pigment" />
      <div className="atmosphere-light" />
    </div>
  );
}
