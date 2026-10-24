import { useId } from "react";
/** Original decorative artwork; these characters never depict a news event. */
export default function Charm({
  mood = "blue",
  small = false,
}: {
  mood?: "blue" | "pink" | "mint" | "yellow";
  small?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const colors = {
    blue: ["#d5f5ff", "#8db9f4"],
    pink: ["#ffe9f1", "#e7a9cd"],
    mint: ["#e5ffe7", "#a0d9c6"],
    yellow: ["#fff9dd", "#ead07e"],
  }[mood];
  return (
    <svg
      className={`charm ${small ? "small" : ""}`}
      viewBox="0 0 120 120"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={id} cx="30%" cy="20%" r="85%">
          <stop stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[1]} />
        </radialGradient>
      </defs>
      <path
        d="M26 28C24 8 43 7 54 19C69 3 88 12 88 29C109 29 116 49 101 62C115 83 98 102 80 94C73 116 48 116 42 96C20 103 5 87 17 69C0 53 7 32 26 28Z"
        fill={`url(#${id})`}
        stroke="white"
        strokeWidth="2"
      />
      <ellipse cx="45" cy="55" rx="3.5" ry="5" fill="#344a62" />
      <ellipse cx="73" cy="55" rx="3.5" ry="5" fill="#344a62" />
      <path
        d="M53 65q7 8 14 0"
        fill="none"
        stroke="#344a62"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse cx="36" cy="65" rx="7" ry="3" fill="#e69fbb" opacity=".5" />
      <ellipse cx="83" cy="65" rx="7" ry="3" fill="#e69fbb" opacity=".5" />
      <path
        d="M23 39q0-12 12-13"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        opacity=".6"
      />
    </svg>
  );
}
