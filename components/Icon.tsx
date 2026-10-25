import type { CSSProperties } from "react";
export type IconName =
  "today" | "calendar" | "mini" | "jar" | "back" | "next" | "listen" | "check";
const paths: Record<IconName, string> = {
  today: "M12 3a9 9 0 1 0 0 18V3Zm0 0a9 9 0 0 1 0 18",
  calendar:
    "M7 3v4m10-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  mini: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
  jar: "M7 3h10M6 6h12l2 4v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-8l2-4Zm1 8c3 3 7 3 10 0",
  back: "m14 5-7 7 7 7M7 12h14",
  next: "m10 5 7 7-7 7M3 12h14",
  listen: "M4 13v-2a8 8 0 0 1 16 0v2M4 12H3v7h4v-7H4Zm16 0h1v7h-4v-7h3Z",
  check: "m5 12 4 4L19 6",
};
export default function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
