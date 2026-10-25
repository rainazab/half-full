import type { ComponentType, Ref } from "react";

/**
 * Art-directed scene compositions. Each is a hand-built React/SVG component
 * with a GSAP timeline, drawn in the half full aesthetic and grounded in the
 * approved copy of one specific story. Registered by story and scene so the
 * player can prefer a composition over the flat Recraft image; everything
 * else falls back to the stored illustration.
 */
export type SceneController = {
  /** Play the timeline once from the start (silent reading). */
  play: () => void;
  pause: () => void;
  /** Jump to a progress fraction 0–1 (narration-driven or seeking). */
  seek: (progress: number) => void;
  restart: () => void;
};
export type AuthoredSceneProps = {
  /** URL of the stored Recraft background for this scene, when the composition uses it. */
  backgroundSrc?: string;
  /** Final frame immediately, no motion. */
  reducedMotion: boolean;
  ref: Ref<SceneController>;
};
export type AuthoredScene = {
  id: string;
  /** Length of the silent timeline. Narration maps its cue window onto 0–1. */
  durationSeconds: number;
  /** Uses the stored Recraft image as the backdrop. */
  usesBackground: boolean;
  /** What each movement shows, from the approved copy; rendered as a legend. */
  explains: string[];
  load: () => Promise<{ default: ComponentType<AuthoredSceneProps> }>;
};
export const AUTHORED_SCENES: Record<string, AuthoredScene> = {
  "candidate-e4906bdb2f8476ad/scene-1": {
    id: "svalbard-town-tap",
    durationSeconds: 8,
    usesBackground: true,
    explains: [
      "The lake that supplies Longyearbyen's tap water",
      "Residents were told not to drink the tap water",
    ],
    load: () => import("../components/scenes/SvalbardTownTap"),
  },
  "candidate-e4906bdb2f8476ad/scene-2": {
    id: "svalbard-permafrost",
    durationSeconds: 13,
    usesBackground: false,
    explains: [
      "Thawing permafrost exposes shale bedrock",
      "The shale contains pyrite, which produces acid",
      "Acid leaches metals into the lake supplying the town",
    ],
    load: () => import("../components/scenes/SvalbardPermafrost"),
  },
};
export const authoredSceneKey = (storyId: string, sceneId: string) =>
  `${storyId}/${sceneId}`;
export function authoredScene(storyId: string, sceneId: string) {
  return AUTHORED_SCENES[authoredSceneKey(storyId, sceneId)];
}
