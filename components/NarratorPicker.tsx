"use client";
import { NARRATORS, type NarratorId } from "@/lib/narrators";

/** Three verified Cartesia library voices. Selection applies to the next clip played. */
export default function NarratorPicker({
  value,
  onChange,
  compact = false,
}: {
  value: NarratorId;
  onChange: (narrator: NarratorId) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`narrator-picker${compact ? " compact" : ""}`}
      role="radiogroup"
      aria-label="Narrator"
    >
      {NARRATORS.map((narrator) => (
        <button
          key={narrator.id}
          type="button"
          role="radio"
          aria-checked={value === narrator.id}
          className={`narrator-option mood-${narrator.id}`}
          onClick={() => onChange(narrator.id)}
        >
          <span className="narrator-mark" aria-hidden="true">
            {narrator.name.charAt(0)}
          </span>
          <span className="narrator-copy">
            <strong>{narrator.name}</strong>
            {!compact && <small>{narrator.description}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}
