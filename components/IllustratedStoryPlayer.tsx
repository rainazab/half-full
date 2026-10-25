"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  assetPath,
  displayableScenes,
  sceneIndexForFraction,
  type StoryboardManifest,
} from "@/lib/storyboard";
import {
  layerFrame,
  sceneProgressFromAudio,
  type Layer,
  type SceneMotion,
} from "@/lib/scene-motion";
import type { PlaybackController, PlaybackState } from "./AudioPlayer";
import SceneIconGlyph, { ICON_COLORS } from "./SceneIcons";

const reducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const FLAT_SCENE_SECONDS = 6;

/**
 * Plays a story's illustrated scenes. Each scene is a flat Recraft background
 * plus optional validated layers (icons, characters, routes, bars, values)
 * whose frame is a pure function of scene progress. Progress comes from a
 * silent clock when the scene scrolls into view, or from the narration clock
 * while a clip is loaded, so play, pause, seek and replay all land on the same
 * deterministic frame.
 */
export default function IllustratedStoryPlayer({
  manifest,
  date,
  playback,
  getController,
  onUnavailable,
}: {
  manifest: StoryboardManifest;
  date: string;
  playback?: PlaybackState;
  getController?: () => PlaybackController | null;
  /** Called when every scene image failed to load, so the reader can fall back. */
  onUnavailable?: () => void;
}) {
  const [broken, setBroken] = useState<string[]>([]);
  const [manual, setManual] = useState(0);
  const [motionOn, setMotionOn] = useState(() => !reducedMotion());
  const [inView, setInView] = useState(false);
  const [progress, setProgress] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const clock = useRef<{ started: number; offset: number } | null>(null);
  const scenes = useMemo(
    () =>
      displayableScenes(manifest).filter((scene) => !broken.includes(scene.id)),
    [manifest, broken],
  );
  const cues = useMemo(
    () =>
      scenes.map(
        (scene) =>
          manifest.narration.cues.find((cue) => cue.sceneId === scene.id) ?? {
            sceneId: scene.id,
            startFraction: 0,
          },
      ),
    [scenes, manifest],
  );
  const audioDriven =
    !!playback && playback.ready && (playback.playing || playback.time > 0);
  const audioIndex = audioDriven
    ? sceneIndexForFraction(
        cues,
        playback!.time / Math.max(1e-6, playback!.duration),
      )
    : 0;
  const active = Math.min(scenes.length - 1, audioDriven ? audioIndex : manual);
  const scene = scenes[active];
  const duration = scene?.animation?.durationSeconds ?? FLAT_SCENE_SECONDS;
  // When the narration moves on, manual stepping resumes from where the audio left off.
  const lastAudio = useRef(audioIndex);
  useEffect(() => {
    if (audioDriven && lastAudio.current !== audioIndex) {
      lastAudio.current = audioIndex;
      setManual(audioIndex);
    }
  }, [audioDriven, audioIndex]);
  useEffect(() => {
    if (displayableScenes(manifest).length > 0 && scenes.length === 0)
      onUnavailable?.();
  }, [scenes.length, manifest, onUnavailable]);
  // Offscreen scenes do no animation work.
  useEffect(() => {
    const element = stage.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? false),
      { threshold: 0.25 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Silent clock: restart when the scene changes or scrolls into view; play once, then rest on the final frame.
  const sceneKey = scene?.id;
  useEffect(() => {
    if (!motionOn) {
      setProgress(1);
      return;
    }
    if (audioDriven || !inView) return;
    clock.current = { started: performance.now(), offset: 0 };
    setProgress(0);
  }, [sceneKey, inView, audioDriven, motionOn]);
  // Frame loop. Narration: progress from the live audio clock within this scene's cue window.
  useEffect(() => {
    if (!motionOn || !inView || !scene) return;
    let frame = 0;
    const tick = () => {
      let next: number;
      if (audioDriven) {
        const controller = getController?.();
        const time = controller?.currentTime() ?? playback?.time ?? 0;
        const total = controller?.duration() ?? playback?.duration ?? 0;
        const start = cues[active]?.startFraction ?? 0;
        const end = cues[active + 1]?.startFraction ?? 1;
        next = sceneProgressFromAudio(time, total, start, end);
      } else {
        const state = clock.current;
        if (!state) return;
        next = Math.min(
          1,
          (performance.now() - state.started) / (duration * 1000) +
            state.offset,
        );
      }
      setProgress((previous) =>
        Math.abs(previous - next) < 0.002 ? previous : next,
      );
      if (audioDriven ? true : next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    motionOn,
    inView,
    scene,
    audioDriven,
    active,
    cues,
    duration,
    getController,
    playback?.playing,
    playback?.time,
    playback?.duration,
  ]);
  if (!scenes.length || !scene) return null;
  function go(index: number) {
    const next = Math.max(0, Math.min(scenes.length - 1, index));
    if (audioDriven) getController?.()?.seekFraction(cues[next].startFraction);
    setManual(next);
  }
  function replay() {
    if (audioDriven) {
      getController?.()?.seekFraction(cues[active].startFraction);
      return;
    }
    clock.current = { started: performance.now(), offset: 0 };
    setProgress(0);
  }
  const t = motionOn ? progress : 1;
  // Flat (layer-less) scenes settle once toward rest along their planned
  // direction: a 6% scale and a small drift that never loops.
  const settle = scene.animation ? 1 : 1 + 0.06 * (1 - easeOut(t));
  const drift = scene.animation ? { x: 0, y: 0 } : flatDrift(scene.motion, t);
  return (
    <figure
      className={`illustrated-story tone-${manifest.tone}${scene.animation ? " layered" : ""}`}
      aria-label="Illustrated explainer"
    >
      <div className="scene-stage" ref={stage} aria-live="polite">
        {scenes.map((item, index) => (
          <div
            key={item.id}
            className={`scene${index === active ? " active" : ""}`}
            aria-hidden={index !== active}
          >
            <img
              src={assetPath(date, manifest.storyId, item.id)}
              alt={item.alt}
              width={1365}
              height={1024}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              style={
                index === active && !item.animation
                  ? {
                      transform: `scale(${settle.toFixed(4)}) translate(${drift.x.toFixed(2)}%, ${drift.y.toFixed(2)}%)`,
                    }
                  : undefined
              }
              onError={() => setBroken((list) => [...list, item.id])}
            />
            {index === active && item.animation && (
              <SceneLayers motion={item.animation} t={t} />
            )}
            {index === active && !item.animation && item.character && (
              <img
                className={`scene-character character-${item.character}`}
                src={`/reactions/${item.character}.webp`}
                alt=""
                width={64}
                height={64}
                draggable={false}
                style={{
                  transform: `translateY(${(Math.sin(t * Math.PI * 4) * 4).toFixed(2)}px)`,
                }}
              />
            )}
          </div>
        ))}
        <span className="scene-label" aria-hidden="true">
          Illustration · {active + 1} of {scenes.length}
        </span>
      </div>
      <figcaption>
        <p className="scene-caption" key={scene.id}>
          {scene.caption}
        </p>
        <div className="scene-controls">
          <button
            type="button"
            aria-label="Previous scene"
            disabled={active === 0}
            onClick={() => go(active - 1)}
          >
            ‹
          </button>
          <div className="scene-dots" role="tablist" aria-label="Scenes">
            {scenes.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === active}
                aria-label={`Scene ${index + 1}: ${item.purpose}`}
                className={index === active ? "active" : ""}
                onClick={() => go(index)}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next scene"
            disabled={active === scenes.length - 1}
            onClick={() => go(active + 1)}
          >
            ›
          </button>
          <button
            type="button"
            className="scene-replay"
            onClick={replay}
            disabled={!motionOn}
            aria-label="Replay this scene's motion"
          >
            ↺ Replay
          </button>
          <button
            type="button"
            className="scene-motion-toggle"
            aria-pressed={!motionOn}
            onClick={() => setMotionOn((value) => !value)}
          >
            {motionOn ? "Pause motion" : "Resume motion"}
          </button>
        </div>
        {scene.animation && (
          <ul className="scene-legend">
            {scene.animation.layers
              .filter((layer) => layer.motions.length > 0)
              .slice(0, 3)
              .map((layer) => (
                <li key={layer.id}>{layer.explains}</li>
              ))}
          </ul>
        )}
        <p className="scene-note">
          Illustrations drawn from the reviewed story
          {audioDriven ? " · following the narration" : ""}. Not photographs.
        </p>
      </figcaption>
    </figure>
  );
}
const easeOut = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
/** Rest-ward drift for v1 flat scenes, in percent of the stage. */
function flatDrift(motion: string, t: number) {
  const remaining = 1.5 * (1 - easeOut(t));
  switch (motion) {
    case "pan-left":
      return { x: remaining, y: 0 };
    case "pan-right":
      return { x: -remaining, y: 0 };
    case "rise":
      return { x: 0, y: remaining };
    default:
      return { x: 0, y: 0 };
  }
}

/** Renders validated layers at progress t. Positions are normalized to the 4:3 stage. */
function SceneLayers({ motion, t }: { motion: SceneMotion; t: number }) {
  const ordered = [...motion.layers].sort(
    (a, b) => (a.depth ?? 1) - (b.depth ?? 1),
  );
  return (
    <div className="scene-layers" aria-hidden="true">
      <svg
        className="scene-routes"
        viewBox="0 0 1000 750"
        preserveAspectRatio="none"
      >
        {ordered
          .filter((layer) => layer.kind === "path" && layer.points)
          .map((layer) => {
            const frame = layerFrame(layer, t);
            const points = layer.points!.map(
              (p) => `${(p.x * 1000).toFixed(1)},${(p.y * 750).toFixed(1)}`,
            );
            const length = layer.points!.reduce((sum, p, i, all) => {
              if (!i) return 0;
              const q = all[i - 1];
              return sum + Math.hypot((p.x - q.x) * 1000, (p.y - q.y) * 750);
            }, 0);
            return (
              <polyline
                key={layer.id}
                points={points.join(" ")}
                fill="none"
                stroke={ICON_COLORS[layer.color ?? "ink"]}
                strokeWidth={Math.max(3, layer.width * 100)}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${length.toFixed(1)} ${length.toFixed(1)}`}
                strokeDashoffset={(length * (1 - frame.reveal)).toFixed(1)}
                opacity={frame.opacity}
              />
            );
          })}
      </svg>
      {ordered
        .filter((layer) => layer.kind !== "path")
        .map((layer) => (
          <LayerView
            key={layer.id}
            layer={layer}
            frame={layerFrame(layer, t)}
          />
        ))}
    </div>
  );
}
function LayerView({
  layer,
  frame,
}: {
  layer: Layer;
  frame: ReturnType<typeof layerFrame>;
}) {
  const color = layer.color ?? "sky";
  const style: React.CSSProperties = {
    left: `${(frame.x * 100).toFixed(2)}%`,
    top: `${(frame.y * 100).toFixed(2)}%`,
    width: `${(layer.width * 100).toFixed(2)}%`,
    height: layer.height ? `${(layer.height * 100).toFixed(2)}%` : undefined,
    opacity: frame.opacity,
    zIndex: (layer.depth ?? 1) + 1,
    transform: `translate(-50%, -50%) translate(${frame.dx.toFixed(2)}%, ${frame.dy.toFixed(2)}%) rotate(${frame.rotate.toFixed(2)}deg) scale(${frame.scale.toFixed(3)})`,
  };
  const highlight =
    frame.highlight > 0 ? (
      <span
        className="layer-highlight"
        style={{
          opacity: frame.highlight * 0.7,
          transform: `scale(${1 + frame.highlight * 0.2})`,
        }}
      />
    ) : null;
  switch (layer.kind) {
    case "icon":
      return (
        <div
          className="scene-layer layer-icon"
          style={style}
          title={layer.label}
        >
          {highlight}
          <SceneIconGlyph icon={layer.icon!} color={color} />
        </div>
      );
    case "character":
      return (
        <div
          className="scene-layer layer-character"
          style={style}
          title={layer.label}
        >
          {highlight}
          <img
            src={`/reactions/${layer.character}.webp`}
            alt=""
            width={64}
            height={64}
            draggable={false}
          />
        </div>
      );
    case "shape":
      return (
        <div
          className={`scene-layer layer-shape shape-${layer.shape}`}
          style={{ ...style, background: ICON_COLORS[color] }}
          title={layer.label}
        >
          {highlight}
        </div>
      );
    case "bar":
      return (
        <div
          className="scene-layer layer-bar"
          style={style}
          title={layer.label}
        >
          <span
            style={{
              background: ICON_COLORS[color],
              transform: `scaleY(${((layer.fill ?? 1) * frame.reveal).toFixed(3)})`,
            }}
          />
        </div>
      );
    case "value": {
      const numeric = /^[\d,.]+%?$/.test(layer.value ?? "");
      const text = numeric ? countUp(layer.value!, frame.reveal) : layer.value;
      return (
        <div
          className="scene-layer layer-value"
          style={style}
          title={layer.label}
        >
          {highlight}
          <span style={{ background: ICON_COLORS[color] }}>{text}</span>
        </div>
      );
    }
    default:
      return null;
  }
}
/** Counts a validated number up to its final text; suffixes and separators are preserved. */
function countUp(value: string, reveal: number) {
  const suffix = value.endsWith("%") ? "%" : "";
  const number = Number(value.replace(/[%,]/g, ""));
  if (!Number.isFinite(number)) return value;
  const shown = Math.round(number * reveal);
  return `${shown.toLocaleString("en-US")}${suffix}`;
}
