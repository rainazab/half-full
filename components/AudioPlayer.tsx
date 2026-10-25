"use client";
import { useEffect, useRef, useState } from "react";
import type { ApprovedStory } from "@/lib/types";
import { localDemoAudio, narrationFor } from "@/lib/narration";
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export default function AudioPlayer({
  story,
  editionId,
  demo,
  active,
  through,
  onThrough,
  onEnded,
  autoPlay,
}: {
  story: ApprovedStory;
  editionId: string;
  demo: boolean;
  active: boolean;
  through: boolean;
  onThrough: (value: boolean) => void;
  onEnded: () => void;
  autoPlay: boolean;
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
        const response = await fetch(
          `/api/audio/${encodeURIComponent(editionId)}/${encodeURIComponent(story.id)}`,
          {
            method: "POST",
            signal: AbortSignal.any([
              request.current.signal,
              AbortSignal.timeout(40000),
            ]),
          },
        );
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
      }
      if (request.current?.signal.aborted) return;
      await element.play();
    } catch (failure) {
      if (request.current?.signal.aborted) return;
      setError(
        failure instanceof DOMException && failure.name === "NotAllowedError"
          ? "Tap Listen to play."
          : "Audio couldn’t load. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (autoPlay && active) void play();
  }, []); // Only explicit listen-through can start the next clip.
  return (
    <section className="audio-player" aria-label="Story narration">
      <audio
        ref={audio}
        src={bundled}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setTime(audio.current?.currentTime ?? 0)}
        onLoadedMetadata={() =>
          setDuration(
            Number.isFinite(audio.current?.duration)
              ? audio.current!.duration
              : 0,
          )
        }
        onEnded={() => {
          setPlaying(false);
          if (through) onEnded();
        }}
        onError={() => {
          setError("Audio couldn’t load. Try again.");
          audio.current?.removeAttribute("src");
        }}
      />
      <div className="audio-controls">
        <button
          className="primary"
          disabled={busy}
          onClick={() => void play()}
          aria-label={playing ? "Pause narration" : "Play narration"}
        >
          {busy ? "Loading…" : playing ? "Ⅱ Pause" : "▶ Listen"}
        </button>
        {duration > 0 && (
          <button
            aria-label="Replay"
            title="Replay"
            onClick={() => {
              if (audio.current) {
                audio.current.currentTime = 0;
                void audio.current
                  .play()
                  .catch(() => setError("Tap Play to replay."));
              }
            }}
          >
            ↺
          </button>
        )}
        <label>
          <select
            aria-label="Playback speed"
            defaultValue="1"
            onChange={(e) => {
              if (audio.current)
                audio.current.playbackRate = Number(e.target.value);
            }}
          >
            <option value="1">1×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.5×</option>
          </select>
        </label>
        {!duration && (
          <span className="audio-estimate">
            ~{clock(narration.estimatedSeconds)}
          </span>
        )}
        <details className="audio-options">
          <summary aria-label="Playback options" title="Playback options">
            •••
          </summary>
          <label className="listen-through">
            <input
              type="checkbox"
              checked={through}
              onChange={(e) => onThrough(e.target.checked)}
            />
            Autoplay next
          </label>
          <details>
            <summary>Transcript</summary>
            <p>{narration.script}</p>
          </details>
        </details>
      </div>
      {duration > 0 && (
        <div className="audio-timeline">
          <span>{clock(time)}</span>
          <input
            aria-label="Audio position"
            type="range"
            min="0"
            max={duration || 1}
            step="0.1"
            value={time}
            disabled={!duration}
            onChange={(e) => {
              if (audio.current)
                audio.current.currentTime = Number(e.target.value);
            }}
          />
          <span>{clock(duration)}</span>
        </div>
      )}
      {error && (
        <p role="status" className="note">
          {error}
        </p>
      )}
    </section>
  );
}
