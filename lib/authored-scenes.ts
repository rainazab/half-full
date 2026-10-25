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
  "candidate-2c4b87c1d1d96844/scene-1": {
    id: "php-flaws",
    durationSeconds: 9,
    usesBackground: true,
    explains: [
      "PHP runs on web servers behind many websites",
      "Researchers using AI tools searched it",
      "They found two serious flaws",
    ],
    load: () =>
      import("../components/scenes/PhpScenes").then((m) => ({
        default: m.PhpFlaws,
      })),
  },
  "candidate-2c4b87c1d1d96844/scene-2": {
    id: "php-patch",
    durationSeconds: 8.5,
    usesBackground: true,
    explains: [
      "Patches were released for the flaws",
      "No successful attacks had been reported",
      "Operators were urged to patch or take systems offline",
    ],
    load: () =>
      import("../components/scenes/PhpScenes").then((m) => ({
        default: m.PhpPatch,
      })),
  },
  "candidate-f00e63d7b735d2ec/scene-1": {
    id: "franklin-one",
    durationSeconds: 8,
    usesBackground: true,
    explains: [
      "Many scientists are named in the specifications",
      "Rosalind Franklin is the only woman among them",
    ],
    load: () =>
      import("../components/scenes/FranklinScenes").then((m) => ({
        default: m.FranklinOne,
      })),
  },
  "candidate-f00e63d7b735d2ec/scene-2": {
    id: "franklin-recommend",
    durationSeconds: 7.5,
    usesBackground: true,
    explains: [
      "The authors recommend naming more scientists",
      "Figures such as Marie Curie and Lise Meitner",
    ],
    load: () =>
      import("../components/scenes/FranklinScenes").then((m) => ({
        default: m.FranklinRecommend,
      })),
  },
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
