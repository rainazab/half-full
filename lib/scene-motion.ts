import { z } from "zod";
import { REACTION_CHARACTERS } from "./illustration-style";

/**
 * Layered scene motion ("scene-motion/1"). A scene is a flat Recraft background
 * plus independently positioned layers drawn by React: allowlisted programmatic
 * icons, the original reaction characters, simple shapes, routes, bars and
 * validated values. Every property is schema-checked; no generated code ever
 * runs. Motion is a pure function of scene progress t ∈ [0, 1], so the same
 * frame is produced from a silent clock, a narration clock or a seek.
 */
export const MOTION_VERSION = "scene-motion/1";
export const SCENE_ICONS = [
  "arrow",
  "ballot",
  "bar",
  "bike",
  "book",
  "bulb",
  "bus",
  "check",
  "clock",
  "cloud",
  "coin",
  "cross",
  "dna",
  "document",
  "drop",
  "factory",
  "flask",
  "gavel",
  "globe",
  "heart",
  "house",
  "leaf",
  "lock",
  "magnifier",
  "microscope",
  "mountain",
  "particles",
  "person",
  "pill",
  "server",
  "shield",
  "snowflake",
  "star",
  "sun",
  "tap",
  "thermometer",
  "train",
  "tree",
  "wave",
  "wrench",
] as const;
export type SceneIcon = (typeof SCENE_ICONS)[number];
export const PALETTE_KEYS = [
  "ink",
  "butter",
  "sky",
  "sage",
  "lilac",
  "blush",
  "cream",
] as const;
export const MOTION_TYPES = [
  "enter-left",
  "enter-right",
  "enter-bottom",
  "fade",
  "float",
  "scale",
  "rotate",
  "path",
  "draw",
  "grow",
  "highlight",
  "exit",
  "count",
] as const;
export type MotionType = (typeof MOTION_TYPES)[number];
const unit = z.number().min(0).max(1);
const point = z.object({ x: unit, y: unit }).strict();
export const motionSchema = z
  .object({
    type: z.enum(MOTION_TYPES),
    /** Fraction of the scene at which the motion starts. */
    start: unit,
    /** Fraction of the scene the motion lasts. */
    duration: z.number().min(0.05).max(1),
    /** Destination for `path`-less movement, or the end of a count. */
    to: point.optional(),
    /** Strength: degrees for rotate, scale factor for scale, pixels/percent for float. */
    amount: z.number().min(0).max(2).optional(),
  })
  .strict();
export const layerSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,30}$/),
    kind: z.enum(["icon", "character", "shape", "path", "bar", "value"]),
    icon: z.enum(SCENE_ICONS).optional(),
    character: z.enum(REACTION_CHARACTERS).optional(),
    shape: z.enum(["circle", "rect"]).optional(),
    color: z.enum(PALETTE_KEYS).optional(),
    x: unit,
    y: unit,
    width: z.number().min(0.02).max(1),
    height: z.number().min(0.02).max(1).optional(),
    rotate: z.number().min(-180).max(180).optional(),
    depth: z.number().int().min(0).max(10).optional(),
    opacity: unit.optional(),
    /** Route points for `path` layers and for the `path` motion (2–8 points). */
    points: z.array(point).min(2).max(8).optional(),
    /** For `value` layers: short validated text rendered by React (must appear in the approved copy). */
    value: z.string().trim().min(1).max(24).optional(),
    /** For `bar` layers: fill fraction. */
    fill: unit.optional(),
    /** Accessible description of the object. */
    label: z.string().trim().min(1).max(80),
    /** Why this object moves: ties the motion to the explanation. */
    explains: z.string().trim().min(1).max(200),
    motions: z.array(motionSchema).max(3),
  })
  .strict();
export const sceneMotionSchema = z
  .object({
    version: z.literal(MOTION_VERSION),
    durationSeconds: z.number().min(3).max(15),
    layers: z.array(layerSchema).min(1).max(7),
  })
  .strict();
export type Layer = z.infer<typeof layerSchema>;
export type Motion = z.infer<typeof motionSchema>;
export type SceneMotion = z.infer<typeof sceneMotionSchema>;
export class SceneMotionError extends Error {}
/** First few zod issues as "path: message", for logs and bounded repair feedback. */
export function describeIssues(error: z.ZodError) {
  return error.issues
    .slice(0, 4)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}
/** Structural rules beyond the schema: required fields per kind, bounded concurrency. */
export function validateSceneMotion(raw: unknown): SceneMotion {
  const parsed = sceneMotionSchema.safeParse(raw);
  if (!parsed.success)
    throw new SceneMotionError(
      `Scene motion violated the layer schema or allowlists: ${describeIssues(parsed.error)}`,
    );
  const motion = parsed.data;
  const ids = new Set<string>();
  for (const layer of motion.layers) {
    if (ids.has(layer.id))
      throw new SceneMotionError(`Duplicate layer id ${layer.id}.`);
    ids.add(layer.id);
    if (layer.kind === "icon" && !layer.icon)
      throw new SceneMotionError(`${layer.id} needs an allowlisted icon.`);
    if (layer.kind === "character" && !layer.character)
      throw new SceneMotionError(`${layer.id} needs a reaction character.`);
    if (layer.kind === "shape" && !layer.shape)
      throw new SceneMotionError(`${layer.id} needs a shape.`);
    if (layer.kind === "path" && !layer.points)
      throw new SceneMotionError(`${layer.id} needs route points.`);
    if (layer.kind === "value" && !layer.value)
      throw new SceneMotionError(`${layer.id} needs a value.`);
    if (layer.kind === "bar" && layer.fill === undefined)
      throw new SceneMotionError(`${layer.id} needs a fill fraction.`);
    for (const item of layer.motions) {
      if (item.start + item.duration > 1.0001)
        throw new SceneMotionError(
          `${layer.id} has a motion that runs past the end of the scene.`,
        );
      if (item.type === "path" && !layer.points && !item.to)
        throw new SceneMotionError(
          `${layer.id} path motion needs points or a destination.`,
        );
      if (item.type === "draw" && layer.kind !== "path")
        throw new SceneMotionError(`${layer.id}: only routes can be drawn.`);
      if (item.type === "grow" && layer.kind !== "bar")
        throw new SceneMotionError(`${layer.id}: only bars grow.`);
      if (item.type === "count" && layer.kind !== "value")
        throw new SceneMotionError(`${layer.id}: only values count.`);
    }
  }
  // Calm motion: never more than four motions active at once.
  for (let sample = 0; sample <= 20; sample++) {
    const t = sample / 20;
    const active = motion.layers.reduce(
      (count, layer) =>
        count +
        layer.motions.filter(
          (item) =>
            item.type !== "float" &&
            item.type !== "highlight" &&
            t >= item.start &&
            t <= item.start + item.duration,
        ).length,
      0,
    );
    if (active > 4)
      throw new SceneMotionError(
        "Too many objects move at the same time; stagger the motions.",
      );
  }
  return motion;
}
const easeOut = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const easeInOut = (x: number) => {
  const v = Math.max(0, Math.min(1, x));
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
/** Progress of one motion at scene progress t: 0 before, 1 after, eased between. */
export function motionProgress(item: Motion, t: number) {
  if (t <= item.start) return 0;
  if (t >= item.start + item.duration) return 1;
  return (t - item.start) / item.duration;
}
export type LayerFrame = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  scale: number;
  rotate: number;
  opacity: number;
  /** 0–1 for draw/grow/count. */
  reveal: number;
  highlight: number;
};
function along(points: { x: number; y: number }[], p: number) {
  if (points.length === 1) return points[0];
  const segments = points.length - 1;
  const position = Math.max(0, Math.min(1, p)) * segments;
  const index = Math.min(segments - 1, Math.floor(position));
  const local = position - index;
  const a = points[index],
    b = points[index + 1];
  return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
}
/**
 * Deterministic frame for a layer at scene progress t. Entrances start hidden;
 * values with a count start at zero; everything else starts at rest.
 */
export function layerFrame(layer: Layer, t: number): LayerFrame {
  const frame: LayerFrame = {
    x: layer.x,
    y: layer.y,
    dx: 0,
    dy: 0,
    scale: 1,
    rotate: layer.rotate ?? 0,
    opacity: layer.opacity ?? 1,
    reveal: 1,
    highlight: 0,
  };
  const hidesInitially = layer.motions.some((item) =>
    ["enter-left", "enter-right", "enter-bottom", "fade"].includes(item.type),
  );
  if (hidesInitially) frame.opacity = 0;
  if (
    layer.motions.some((item) => ["draw", "grow", "count"].includes(item.type))
  )
    frame.reveal = 0;
  for (const item of layer.motions) {
    const raw = motionProgress(item, t);
    const p = easeOut(raw);
    const amount = item.amount ?? 1;
    switch (item.type) {
      case "enter-left":
        frame.dx = -40 * (1 - p);
        frame.opacity = (layer.opacity ?? 1) * p;
        break;
      case "enter-right":
        frame.dx = 40 * (1 - p);
        frame.opacity = (layer.opacity ?? 1) * p;
        break;
      case "enter-bottom":
        frame.dy = 30 * (1 - p);
        frame.opacity = (layer.opacity ?? 1) * p;
        break;
      case "fade":
        frame.opacity = (layer.opacity ?? 1) * p;
        break;
      case "exit":
        frame.opacity = frame.opacity * (1 - p);
        break;
      case "float":
        if (raw > 0 && raw < 1)
          frame.dy += Math.sin(raw * Math.PI * 2 * 2) * 3 * amount;
        break;
      case "scale":
        frame.scale *= 1 + (amount - 1) * easeInOut(raw);
        break;
      case "rotate":
        frame.rotate += amount * 20 * p;
        break;
      case "path": {
        if (layer.points) {
          const position = along(layer.points, easeInOut(raw));
          frame.x = position.x;
          frame.y = position.y;
        } else if (item.to) {
          frame.x = layer.x + (item.to.x - layer.x) * easeInOut(raw);
          frame.y = layer.y + (item.to.y - layer.y) * easeInOut(raw);
        }
        break;
      }
      case "draw":
      case "grow":
      case "count":
        frame.reveal = Math.max(frame.reveal, p);
        break;
      case "highlight":
        frame.highlight = raw > 0 && raw < 1 ? Math.sin(raw * Math.PI) : 0;
        break;
    }
  }
  return frame;
}
/** Progress of a scene that spans [startFraction, endFraction] of the narration. */
export function sceneProgressFromAudio(
  timeSeconds: number,
  durationSeconds: number,
  startFraction: number,
  endFraction: number,
) {
  if (!(durationSeconds > 0)) return 0;
  const start = startFraction * durationSeconds;
  const end = Math.max(start + 0.5, endFraction * durationSeconds);
  return Math.max(0, Math.min(1, (timeSeconds - start) / (end - start)));
}
