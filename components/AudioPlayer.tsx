"use client";
import { useEffect, useRef, useState } from "react";
import type { ApprovedStory } from "@/lib/types";
import { localDemoAudio, narrationFor } from "@/lib/narration";
import { narratorById, type NarratorId } from "@/lib/narrators";
import {
  audioPath,
  SPEEDS,
  type ListeningPreferences,
} from "@/lib/preferences";
import NarratorPicker from "./NarratorPicker";
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export type PlaybackState = {
  playing: boolean;
  time: number;
  duration: number;
  ready: boolean;
};
export type PlaybackController = {
  seekFraction: (fraction: number) => void;
  pause: () => void;
  /** Live clock for scene motion; avoids 4 Hz timeupdate granularity. */
  currentTime: () => number;
  duration: () => number;
  isPlaying: () => boolean;
  playbackRate?: () => number;
};
export default function AudioPlayer({
  story,
  editionId,
  demo,
  active,
  through,
  onThrough,
  onEnded,
  autoPlay,
  preferences,
  onPreferences,
  onPlayback,
  controller,
  onPrevious,
  onNext,
  transportLabel,
}: {
  story: ApprovedStory;
  editionId: string;
  demo: boolean;
  active: boolean;
  through: boolean;
  onThrough: (value: boolean) => void;
  onEnded: () => void;
  autoPlay: boolean;
  preferences: ListeningPreferences;
  onPreferences: (patch: Partial<ListeningPreferences>) => void;
  /** Lets illustrated scenes follow the same clock as the narration. */
  onPlayback?: (state: PlaybackState) => void;
  /** Filled in so scene navigation can seek the same clip. */
  controller?: React.RefObject<PlaybackController | null>;
  /** Story transport: previous/next page, rendered beside the play button. */
  onPrevious?: () => void;
  onNext?: () => void;
  transportLabel?: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false),
    [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [time, setTime] = useState(0),
    [duration, setDuration] = useState(0);
  const narration = narrationFor(story);
  const bundled = demo ? localDemoAudio(narration.audioUrl) : undefined;
  const narrator = preferences.narrator;
  const loadedNarrator = useRef<NarratorId | null>(null);
  useEffect(() => {
    const element = audio.current;
    return () => {
      request.current?.abort();
      element?.pause();
    };
  }, []);
  useEffect(() => {
    if (!active) {
      request.current?.abort();
      audio.current?.pause();
    }
  }, [active]);
  useEffect(() => {
    onPlayback?.({ playing, time, duration, ready: duration > 0 });
  }, [playing, time, duration, onPlayback]);
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = preferences.speed;
  }, [preferences.speed]);
  // Switching narrators drops the loaded clip; the next Play fetches that voice's audio.
  useEffect(() => {
    const element = audio.current;
    if (!element || demo) return;
    if (loadedNarrator.current && loadedNarrator.current !== narrator) {
      request.current?.abort();
      element.pause();
      element.removeAttribute("src");
      element.load();
      loadedNarrator.current = null;
      setTime(0);
      setDuration(0);
      setPlaying(false);
      setError("");
    }
  }, [narrator, demo]);
  async function play() {
    const element = audio.current;
    if (!element || busy) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    setError("");
    try {
      if (!element.getAttribute("src")) {
        if (demo) {
          setError("Audio isn’t available for this story.");
          return;
        }
        setBusy(true);
        request.current = new AbortController();
        const response = await fetch(audioPath(editionId, story.id, narrator), {
          method: "POST",
          signal: AbortSignal.any([
            request.current.signal,
            AbortSignal.timeout(40000),
          ]),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error?.message ?? "Audio couldn’t load. Try again.",
          );
        if (
          typeof result.url !== "string" ||
          !result.url.startsWith("/api/audio/")
        )
          throw new Error("Invalid audio location.");
        element.src = result.url;
        loadedNarrator.current = narrator;
      }
      if (request.current?.signal.aborted) return;
      element.playbackRate = preferences.speed;
      await element.play();
    } catch (failure) {
      if (request.current?.signal.aborted) return;
      setError(
        failure instanceof DOMException && failure.name === "NotAllowedError"
          ? "Tap Listen to play."
          : failure instanceof Error && failure.message
            ? failure.message
            : "Audio couldn’t load. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const autoPlayed = useRef(false);
  useEffect(() => {
    // Only Listen on the cover or explicit listen-through can start a clip, once.
    if (autoPlay && active && !autoPlayed.current) {
      autoPlayed.current = true;
      void play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, active]);
  function seek(seconds: number) {
    const element = audio.current;
    if (!element || !duration) return;
    element.currentTime = Math.max(0, Math.min(duration, seconds));
    setTime(element.currentTime);
  }
  useEffect(() => {
    if (!controller) return;
    controller.current = {
      seekFraction: (fraction) => {
        const element = audio.current;
        if (!element || !duration) return;
        element.currentTime = Math.max(
          0,
          Math.min(duration, fraction * duration),
        );
        setTime(element.currentTime);
      },
      pause: () => audio.current?.pause(),
      currentTime: () => audio.current?.currentTime ?? 0,
      duration: () => duration,
      isPlaying: () => !!audio.current && !audio.current.paused,
      playbackRate: () => audio.current?.playbackRate ?? 1,
    };
    return () => {
      controller.current = null;
    };
  }, [controller, duration]);
  return (
    <section className="audio-player" aria-label="Story narration">
      <audio
        ref={audio}
        src={bundled}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setTime(audio.current?.currentTime ?? 0)}
        onSeeked={() => setTime(audio.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          if (audio.current) audio.current.playbackRate = preferences.speed;
          setDuration(
            Number.isFinite(audio.current?.duration)
              ? audio.current!.duration
              : 0,
          );
        }}
        onEnded={() => {
          setPlaying(false);
          if (through) onEnded();
        }}
        onError={() => {
          setError("Audio couldn’t load. Try again.");
          audio.current?.removeAttribute("src");
          loadedNarrator.current = null;
        }}
      />
      <div
        className={`player-row${onPrevious || onNext ? " with-transport" : ""}`}
      >
        {(onPrevious || onNext) && (
          <button
            type="button"
            className="player-skip"
            aria-label="Previous story"
            disabled={!onPrevious}
            onClick={onPrevious}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 5h2v14H6zM18 5.5v13L9 12z" fill="currentColor" />
            </svg>
          </button>
        )}
        <button
          className="player-play"
          disabled={busy}
          onClick={() => void play()}
          aria-label={playing ? "Pause narration" : "Play narration"}
        >
          {busy ? (
            <span className="player-spinner" aria-hidden="true" />
          ) : playing ? (
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <rect
                x="6"
                y="5"
                width="4"
                height="14"
                rx="1.2"
                fill="currentColor"
              />
              <rect
                x="14"
                y="5"
                width="4"
                height="14"
                rx="1.2"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
            </svg>
          )}
        </button>
        {(onPrevious || onNext) && (
          <button
            type="button"
            className="player-skip"
            aria-label={transportLabel ?? "Next story"}
            disabled={!onNext}
            onClick={onNext}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M16 5h2v14h-2zM6 5.5v13l9-6.5z" fill="currentColor" />
            </svg>
          </button>
        )}
        <div className="player-track">
          <div className="player-meta">
            <span className="player-voice">
              {narratorById(narrator).name}
              {duration > 0
                ? ""
                : ` · about ${clock(narration.estimatedSeconds)}`}
            </span>
            {duration > 0 && (
              <span className="player-time">
                {clock(time)} / {clock(duration)}
              </span>
            )}
          </div>
          <input
            className="player-seek"
            aria-label="Audio position"
            type="range"
            min="0"
            max={duration || 1}
            step="0.1"
            value={duration ? time : 0}
            disabled={!duration}
            onChange={(e) => seek(Number(e.target.value))}
            style={
              {
                "--played": `${duration ? (time / duration) * 100 : 0}%`,
              } as React.CSSProperties
            }
          />
        </div>
        {duration > 0 && (
          <button
            className="player-replay"
            aria-label="Replay"
            title="Replay"
            onClick={() => {
              if (audio.current) {
                seek(0);
                void audio.current
                  .play()
                  .catch(() => setError("Tap Play to replay."));
              }
            }}
          >
            ↺
          </button>
        )}
        <label className="player-speed">
          <select
            aria-label="Playback speed"
            value={String(preferences.speed)}
            onChange={(e) =>
              onPreferences({
                speed: Number(e.target.value) as (typeof SPEEDS)[number],
              })
            }
          >
            {SPEEDS.map((speed) => (
              <option key={speed} value={String(speed)}>
                {speed}×
              </option>
            ))}
          </select>
        </label>
        <details className="audio-options">
          <summary aria-label="Playback options" title="Playback options">
            •••
          </summary>
          <label className="listen-through">
            <input
              type="checkbox"
              checked={through}
              onChange={(e) => {
                onThrough(e.target.checked);
                onPreferences({ autoplayNext: e.target.checked });
              }}
            />
            Autoplay next
          </label>
          <div className="audio-narrator">
            <span>Narrator</span>
            <NarratorPicker
              compact
              value={narrator}
              onChange={(next) => onPreferences({ narrator: next })}
            />
          </div>
          <details>
            <summary>Transcript</summary>
            <p>{narration.script}</p>
          </details>
        </details>
      </div>
      {error && (
        <p role="status" className="note">
          {error}
        </p>
      )}
    </section>
  );
}
