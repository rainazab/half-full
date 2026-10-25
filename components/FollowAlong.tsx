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
/** Stable 3–7 word thought groups for lighter read-along emphasis. */
export function splitPhrases(text: string) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const phrases: string[] = [];
  for (let i = 0; i < words.length; ) {
    const remaining = words.length - i;
    const size = remaining <= 7 ? remaining : remaining <= 10 ? 5 : 4;
    phrases.push(words.slice(i, i + size).join(" "));
    i += size;
  }
  return phrases;
}
export function activePhrase(phrases: string[], fraction: number) {
  const total = phrases.reduce((sum, phrase) => sum + phrase.length + 1, 0);
  if (!total || !Number.isFinite(fraction)) return 0;
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let seen = 0;
  for (let i = 0; i < phrases.length; i++) {
    seen += phrases[i].length + 1;
    if (target < seen) return i;
  }
  return Math.max(0, phrases.length - 1);
}
/**
 * The story's words in short thought groups. While narration plays only the
 * current group is emphasized; silent readers see the full text at once.
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
  const phrases = useMemo(() => splitPhrases(script), [script]);
  const live =
    !!playback && playback.ready && (playback.playing || playback.time > 0);
  const current = live
    ? activePhrase(phrases, playback!.time / Math.max(1e-6, playback!.duration))
    : -1;
  const total = phrases.reduce((sum, s) => sum + s.length + 1, 0);
  let offset = 0;
  return (
    <p
      className={`follow-along${live ? " live" : ""}`}
      aria-live={live ? "off" : undefined}
    >
      {phrases.map((phrase, i) => {
        const start = offset / Math.max(1, total);
        offset += phrase.length + 1;
        const state = i === current ? "now" : i < current ? "done" : "soon";
        return (
          <span
            key={i}
            className={`follow-phrase ${live ? state : ""}`}
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
            {phrase}{i < phrases.length - 1 ? " " : ""}
          </span>
        );
      })}
    </p>
  );
}
