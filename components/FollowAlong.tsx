"use client";
import { useMemo } from "react";
import type { PlaybackState } from "./AudioPlayer";

export function splitSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'(])/)
    .filter(Boolean);
}
/**
 * Which sentence the narrator is on, by character proportion of the script
 * (the same approximate cue model the scenes use; not word-level alignment).
 */
export function activeSentence(sentences: string[], fraction: number) {
  const total = sentences.reduce((sum, s) => sum + s.length + 1, 0);
  if (!total || !Number.isFinite(fraction)) return 0;
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let seen = 0;
  for (let i = 0; i < sentences.length; i++) {
    seen += sentences[i].length + 1;
    if (target < seen) return i;
  }
  return sentences.length - 1;
}
/**
 * The story's words, sentence by sentence. While narration plays the current
 * sentence is lit and the rest recede, like a lyrics panel; silent readers
 * see the full text at once.
 */
export default function FollowAlong({
  script,
  playback,
  onSeekFraction,
}: {
  script: string;
  playback?: PlaybackState;
  onSeekFraction?: (fraction: number) => void;
}) {
  const sentences = useMemo(() => splitSentences(script), [script]);
  const live =
    !!playback && playback.ready && (playback.playing || playback.time > 0);
  const current = live
    ? activeSentence(
        sentences,
        playback!.time / Math.max(1e-6, playback!.duration),
      )
    : -1;
  const total = sentences.reduce((sum, s) => sum + s.length + 1, 0);
  let offset = 0;
  return (
    <p
      className={`follow-along${live ? " live" : ""}`}
      aria-live={live ? "off" : undefined}
    >
      {sentences.map((sentence, i) => {
        const start = offset / Math.max(1, total);
        offset += sentence.length + 1;
        const state = i === current ? "now" : i < current ? "done" : "soon";
        return (
          <span
            key={i}
            className={`follow-sentence ${live ? state : ""}`}
            onClick={
              live && onSeekFraction ? () => onSeekFraction(start) : undefined
            }
            role={live && onSeekFraction ? "button" : undefined}
            tabIndex={live && onSeekFraction ? 0 : undefined}
            onKeyDown={
              live && onSeekFraction
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSeekFraction(start);
                    }
                  }
                : undefined
            }
          >
            {sentence}{" "}
          </span>
        );
      })}
    </p>
  );
}
