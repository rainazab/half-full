"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  assetPath,
  displayableScenes,
  sceneIndexForFraction,
  type StoryboardManifest,
} from "@/lib/storyboard";
import type { PlaybackController, PlaybackState } from "./AudioPlayer";

/**
 * Plays a story's illustrated scenes. The narration clock drives scene changes
 * while audio is loaded; without audio the reader steps through scenes by hand.
 * Captions, labels and alt text are rendered by React from validated data.
 */
export default function IllustratedStoryPlayer({
  manifest,
  date,
  playback,
  controller,
  onUnavailable,
}: {
  manifest: StoryboardManifest;
  date: string;
  playback?: PlaybackState;
  controller?: React.RefObject<PlaybackController | null>;
  /** Called when every scene image failed to load, so the reader can fall back. */
  onUnavailable?: () => void;
}) {
  const [broken, setBroken] = useState<string[]>([]);
  const [manual, setManual] = useState(0);
  const [motion, setMotion] = useState(true);
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
  if (!scenes.length) return null;
  const scene = scenes[active];
  function go(index: number) {
    const next = Math.max(0, Math.min(scenes.length - 1, index));
    if (audioDriven && controller?.current) {
      controller.current.seekFraction(cues[next].startFraction);
    }
    setManual(next);
  }
  const playing = !!playback?.playing && motion;
  return (
    <figure
      className={`illustrated-story tone-${manifest.tone}`}
      aria-label="Illustrated explainer"
    >
      <div className="scene-stage" aria-live="polite">
        {scenes.map((item, index) => (
          <div
            key={item.id}
            className={`scene motion-${item.motion}${index === active ? " active" : ""}${playing ? " playing" : " paused"}${motion ? "" : " still"}`}
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
              onError={() => setBroken((list) => [...list, item.id])}
            />
            {item.character && (
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
            className="scene-motion-toggle"
            aria-pressed={!motion}
            onClick={() => setMotion((value) => !value)}
          >
            {motion ? "Pause motion" : "Resume motion"}
          </button>
        </div>
        <p className="scene-note">
          Illustrations drawn from the reviewed story
          {audioDriven ? " · following the narration" : ""}. Not photographs.
        </p>
      </figcaption>
    </figure>
  );
}
