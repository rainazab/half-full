"use client";

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
  return (
    <div
      className="story-reactions"
      role="group"
      aria-label="React to this story"
    >
      <p>
        How did this land?
        <span>One little reaction. Just for you, saved on this device.</span>
      </p>
      <div>
        {options.map(({ label, image, hint }) => (
          <button
            key={label}
            type="button"
            aria-pressed={selected === label}
            title={hint}
            onClick={() => onChange(selected === label ? "" : label)}
          >
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
