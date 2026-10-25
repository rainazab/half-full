"use client";
import { useEffect, useState } from "react";

const options = [
  {
    label: "Interesting",
    image: "interesting",
    hint: "That caught my attention",
  },
  {
    label: "Insightful",
    image: "insightful",
    hint: "I understand a little more",
  },
  { label: "Hopeful", image: "hopeful", hint: "A little reason for optimism" },
  { label: "Stressed", image: "stressed", hint: "That felt like a lot" },
] as const;

/**
 * Each reaction has its own small motion when the reader picks it. Restored
 * reactions render in their settled state without replaying the animation.
 */
export default function StoryReactions({
  value,
  onChange,
}: {
  value?: string;
  onChange: (reaction: string) => void;
}) {
  // Keep earlier device-local reactions when upgrading the character set.
  const selected =
    value === "Clearer" ? "Insightful" : value === "A lot" ? "Stressed" : value;
  const [burst, setBurst] = useState<string | null>(null);
  useEffect(() => {
    if (!burst) return;
    const timer = window.setTimeout(() => setBurst(null), 1100);
    return () => window.clearTimeout(timer);
  }, [burst]);
  return (
    <div
      className="story-reactions"
      role="group"
      aria-label="React to this story"
    >
      <p>Your take</p>
      <div>
        {options.map(({ label, image, hint }) => (
          <button
            key={label}
            type="button"
            aria-pressed={selected === label}
            title={hint}
            className={`reaction reaction-${image}${burst === label ? " is-burst" : ""}`}
            onClick={() => {
              const next = selected === label ? "" : label;
              setBurst(next ? label : null);
              onChange(next);
            }}
          >
            <span className="reaction-fx" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <img
              src={`/reactions/${image}.webp`}
              width={64}
              height={64}
              alt=""
              draggable={false}
            />
            <span>{label}</span>
            <span className="reaction-check" aria-hidden="true">
              ✓
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
