"use client";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  assetPath,
  displayableScenes,
  sceneIndexForFraction,
  type StoryboardManifest,
} from "@/lib/storyboard";
import { sceneProgressFromAudio } from "@/lib/scene-motion";
import {
  authoredScene,
  type AuthoredSceneProps,
  type SceneController,
} from "@/lib/authored-scenes";
import type { PlaybackController, PlaybackState } from "./AudioPlayer";

const reducedMotionQuery = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const loaded = new Map<string, ComponentType<AuthoredSceneProps>>();
function lazyScene(
  key: string,
  load: () => Promise<{ default: ComponentType<AuthoredSceneProps> }>,
) {
  let component = loaded.get(key);
  if (!component) {
    component = lazy(load);
    loaded.set(key, component);
  }
  return component;
}

/**
 * Plays a story's illustrated scenes. An art-directed composition (GSAP
 * timeline) is preferred when one is registered for the scene; otherwise the
 * stored Recraft painting is shown and settles once. The silent clock starts
 * when the stage is on screen; while a narration clip is loaded the timeline
 * is seeked from the audio clock inside the scene's cue window, so pause
 * freezes the frame and seeking lands on the matching one. No React state
 * changes per frame: GSAP drives the SVG directly.
 */
export default function IllustratedStoryPlayer({
  manifest,
  date,
  playback,
  getController,
  active = true,
  onUnavailable,
}: {
  manifest: StoryboardManifest;
  date: string;
  playback?: PlaybackState;
  getController?: () => PlaybackController | null;
  /** False while the story page is not the one on screen: timelines pause. */
  active?: boolean;
  onUnavailable?: () => void;
}) {
  const [broken, setBroken] = useState<string[]>([]);
  const [manual, setManual] = useState(0);
  const [motionOn, setMotionOn] = useState(() => !reducedMotionQuery());
  const [inView, setInView] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneController | null>(null);
  const scenes = useMemo(
    () =>
      displayableScenes(manifest).filter((item) => !broken.includes(item.id)),
    [manifest, broken],
  );
  const cues = useMemo(
    () =>
      scenes.map(
        (item) =>
          manifest.narration.cues.find((cue) => cue.sceneId === item.id) ?? {
            sceneId: item.id,
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
  const index = Math.min(scenes.length - 1, audioDriven ? audioIndex : manual);
  const current = scenes[index];
  const composition = current
    ? authoredScene(manifest.storyId, current.id)
    : undefined;
  const Composition = composition
    ? lazyScene(composition.id, composition.load)
    : null;
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
  useEffect(() => {
    const element = stage.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? false),
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const live = active && inView && motionOn;
  // Like clips on a now-playing screen: when reading silently, scenes advance
  // on their own once a scene's timeline (or a flat painting's settle) has
  // played out, looping gently back to the first. Narration takes over timing.
  useEffect(() => {
    if (!live || audioDriven || scenes.length < 2 || !current) return;
    const seconds = composition?.durationSeconds ?? 6;
    const timer = window.setTimeout(
      () => setManual((value) => (value + 1) % scenes.length),
      (seconds + 1.6) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [live, audioDriven, scenes.length, current, composition]);
  // Silent reading: play the composition once whenever it comes on screen or the scene changes.
  const sceneKey = current?.id;
  useEffect(() => {
    const controller = scene.current;
    if (!controller) return;
    if (!live) {
      controller.pause();
      return;
    }
    if (!audioDriven) controller.play();
  }, [live, audioDriven, sceneKey]);
  // Narration: seek the timeline from the live audio clock inside this scene's cue window.
  useEffect(() => {
    if (!live || !audioDriven || !composition) return;
    let frame = 0;
    const tick = () => {
      const audio = getController?.();
      const time = audio?.currentTime() ?? playback?.time ?? 0;
      const total = audio?.duration() ?? playback?.duration ?? 0;
      const start = cues[index]?.startFraction ?? 0;
      const end = cues[index + 1]?.startFraction ?? 1;
      scene.current?.seek(sceneProgressFromAudio(time, total, start, end));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    live,
    audioDriven,
    composition,
    index,
    cues,
    getController,
    playback?.playing,
    playback?.duration,
    playback?.time,
  ]);
  if (!scenes.length || !current) return null;
  function go(next: number) {
    const target = Math.max(0, Math.min(scenes.length - 1, next));
    if (audioDriven)
      getController?.()?.seekFraction(cues[target].startFraction);
    setManual(target);
  }
  function replay() {
    if (audioDriven) getController?.()?.seekFraction(cues[index].startFraction);
    else scene.current?.restart();
  }
  const legend = composition?.explains ?? [];
  return (
    <figure
      className={`illustrated-story tone-${manifest.tone}${composition ? " authored" : " flat"}`}
      aria-label="Illustrated explainer"
    >
      <div className="scene-stage" ref={stage} aria-live="polite">
        {scenes.map((item, i) => {
          const isActive = i === index;
          const authored = isActive && Composition && composition;
          return (
            <div
              key={item.id}
              className={`scene${isActive ? " active" : ""}${isActive && live && !authored ? " settling" : ""}`}
              aria-hidden={!isActive}
            >
              {authored ? (
                <Suspense
                  fallback={
                    <img
                      src={assetPath(date, manifest.storyId, item.id)}
                      alt={item.alt}
                      width={1365}
                      height={1024}
                    />
                  }
                >
                  <Composition
                    key={`${item.id}-${motionOn}`}
                    ref={(controller: SceneController | null) => {
                      scene.current = controller;
                      if (controller && live && !audioDriven) controller.play();
                    }}
                    backgroundSrc={
                      composition!.usesBackground
                        ? assetPath(date, manifest.storyId, item.id)
                        : undefined
                    }
                    reducedMotion={!motionOn}
                  />
                </Suspense>
              ) : (
                <img
                  src={assetPath(date, manifest.storyId, item.id)}
                  alt={item.alt}
                  width={1365}
                  height={1024}
                  loading={i === 0 ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                  onError={() => setBroken((list) => [...list, item.id])}
                />
              )}
              {isActive && !authored && item.character && (
                <img
                  className={`scene-character character-${item.character}`}
                  src={`/reactions/${item.character}.webp`}
                  alt=""
                  width={64}
                  height={64}
                  draggable={false}
                />
              )}
            </div>
          );
        })}
        <span className="scene-label" aria-hidden="true">
          Illustration · {index + 1} of {scenes.length}
        </span>
      </div>
      <figcaption>
        <p className="scene-caption" key={current.id}>
          {current.caption}
        </p>
        <div className="scene-controls">
          <button
            type="button"
            aria-label="Previous scene"
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            ‹
          </button>
          <div className="scene-dots" role="tablist" aria-label="Scenes">
            {scenes.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Scene ${i + 1}: ${item.purpose}`}
                className={i === index ? "active" : ""}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next scene"
            disabled={index === scenes.length - 1}
            onClick={() => go(index + 1)}
          >
            ›
          </button>
          {composition && (
            <button
              type="button"
              className="scene-replay"
              onClick={replay}
              disabled={!motionOn}
              aria-label="Replay this scene"
            >
              ↺ Replay
            </button>
          )}
          <button
            type="button"
            className="scene-motion-toggle"
            aria-pressed={!motionOn}
            onClick={() => setMotionOn((value) => !value)}
          >
            {motionOn ? "Pause motion" : "Resume motion"}
          </button>
        </div>
        {legend.length > 0 && (
          <ul className="scene-legend">
            {legend.map((item) => (
              <li key={item}>{item}</li>
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
