"use client";
import { useEffect, useRef, useState } from "react";
import { NARRATORS, type NarratorId } from "@/lib/narrators";
import Icon from "./Icon";

/** Sample controls appear only for a supplied, verified sample URL. */
export default function NarratorPicker({
  value,
  onChange,
  compact = false,
  previewSources,
}: {
  value: NarratorId;
  onChange: (narrator: NarratorId) => void;
  compact?: boolean;
  previewSources?: Partial<Record<NarratorId, string>>;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const [previewing, setPreviewing] = useState<NarratorId | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    audio.current?.pause();
    setPreviewing(null);
  }, [value]);
  useEffect(() => {
    const element = audio.current;
    return () => element?.pause();
  }, []);
  async function preview(id: NarratorId) {
    const element = audio.current,
      source = previewSources?.[id];
    if (!element || !source) return;
    setError("");
    if (previewing === id) {
      element.pause();
      setPreviewing(null);
      return;
    }
    element.pause();
    element.src = source;
    try {
      await element.play();
      setPreviewing(id);
    } catch {
      setError("This sample couldn’t play. You can still choose the voice.");
      setPreviewing(null);
    }
  }
  return (
    <div
      className={`narrator-picker${compact ? " compact" : ""}`}
      role="radiogroup"
      aria-label="Narrator"
      ref={group}
    >
      {NARRATORS.map((narrator, index) => (
        <div key={narrator.id} className="narrator-choice">
          <button
            type="button"
            role="radio"
            aria-checked={value === narrator.id}
            className={`narrator-option mood-${narrator.id}`}
            onClick={() => onChange(narrator.id)}
            onKeyDown={(event) => {
              const direction =
                event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? 1
                  : event.key === "ArrowLeft" || event.key === "ArrowUp"
                    ? -1
                    : 0;
              if (!direction) return;
              event.preventDefault();
              const next =
                (index + direction + NARRATORS.length) % NARRATORS.length;
              onChange(NARRATORS[next].id);
              group.current
                ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                [next]?.focus();
            }}
          >
            <span className="narrator-mark" aria-hidden="true">
              {narrator.name.charAt(0)}
            </span>
            <span className="narrator-copy">
              <strong>{narrator.name}</strong>
              {!compact && <small>{narrator.description}</small>}
            </span>
            <span className="selection-dot" aria-hidden="true">
              {value === narrator.id && <Icon name="check" size={12} />}
            </span>
          </button>
          {previewSources?.[narrator.id] && !compact && (
            <button
              className="narrator-preview"
              aria-label={`${previewing === narrator.id ? "Pause" : "Preview"} ${narrator.name}`}
              onClick={() => void preview(narrator.id)}
            >
              {previewing === narrator.id ? "Ⅱ" : "▶"}
            </button>
          )}
        </div>
      ))}
      <audio
        ref={audio}
        preload="none"
        onEnded={() => setPreviewing(null)}
        hidden
      />
      {error && (
        <p role="status" className="onboarding-note">
          {error}
        </p>
      )}
    </div>
  );
}
