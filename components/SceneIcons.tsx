import type { SceneIcon } from "@/lib/scene-motion";

/**
 * Original programmatic icons in the half full style: rounded shapes, soft
 * pastel fills and a navy accent line. All share a 0 0 100 100 viewBox so the
 * motion engine can position them with normalized coordinates.
 */
const INK = "#344a62";
const paths: Record<SceneIcon, (fill: string) => React.ReactNode> = {
  arrow: (fill) => (
    <path
      d="M12 50h60M52 28l24 22-24 22"
      fill="none"
      stroke={fill}
      strokeWidth="12"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  ballot: (fill) => (
    <>
      <rect x="18" y="30" width="64" height="52" rx="10" fill={fill} />
      <path d="M38 22h24v18H38z" fill="#fff" stroke={INK} strokeWidth="4" />
      <path
        d="M36 60l10 10 20-22"
        fill="none"
        stroke={INK}
        strokeWidth="6"
        strokeLinecap="round"
      />
    </>
  ),
  bar: (fill) => (
    <rect x="30" y="10" width="40" height="80" rx="8" fill={fill} />
  ),
  bike: (fill) => (
    <>
      <circle cx="26" cy="68" r="16" fill="none" stroke={INK} strokeWidth="6" />
      <circle cx="74" cy="68" r="16" fill="none" stroke={INK} strokeWidth="6" />
      <path
        d="M26 68l18-30h22l8 30M44 38l-8-12h14"
        fill="none"
        stroke={fill}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  book: (fill) => (
    <>
      <path d="M14 24h32a8 8 0 0 1 8 8v48a8 8 0 0 0-8-8H14z" fill={fill} />
      <path
        d="M86 24H54a8 8 0 0 0-8 8v48a8 8 0 0 1 8-8h32z"
        fill={fill}
        opacity=".75"
      />
      <path d="M50 32v48" stroke={INK} strokeWidth="4" />
    </>
  ),
  bulb: (fill) => (
    <>
      <path
        d="M50 12a26 26 0 0 0-14 48v10h28V60a26 26 0 0 0-14-48z"
        fill={fill}
      />
      <rect x="38" y="74" width="24" height="10" rx="4" fill={INK} />
    </>
  ),
  bus: (fill) => (
    <>
      <rect x="8" y="24" width="84" height="50" rx="12" fill={fill} />
      <rect x="16" y="32" width="20" height="18" rx="4" fill="#fff" />
      <rect x="40" y="32" width="20" height="18" rx="4" fill="#fff" />
      <rect x="64" y="32" width="20" height="18" rx="4" fill="#fff" />
      <circle cx="26" cy="78" r="8" fill={INK} />
      <circle cx="74" cy="78" r="8" fill={INK} />
      <rect x="8" y="58" width="84" height="6" fill={INK} opacity=".25" />
    </>
  ),
  check: (fill) => (
    <>
      <circle cx="50" cy="50" r="40" fill={fill} />
      <path
        d="M30 52l14 14 26-30"
        fill="none"
        stroke={INK}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  clock: (fill) => (
    <>
      <circle cx="50" cy="52" r="38" fill={fill} />
      <path
        d="M50 30v24l16 10"
        fill="none"
        stroke={INK}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M38 10h24" stroke={INK} strokeWidth="6" strokeLinecap="round" />
    </>
  ),
  cloud: (fill) => (
    <path
      d="M30 76a18 18 0 0 1-2-36 24 24 0 0 1 46-6 16 16 0 0 1 4 42z"
      fill={fill}
    />
  ),
  coin: (fill) => (
    <>
      <circle cx="50" cy="50" r="36" fill={fill} />
      <circle
        cx="50"
        cy="50"
        r="24"
        fill="none"
        stroke={INK}
        strokeWidth="4"
        opacity=".5"
      />
    </>
  ),
  cross: (fill) => (
    <>
      <circle cx="50" cy="50" r="40" fill={fill} />
      <path
        d="M34 34l32 32M66 34L34 66"
        stroke={INK}
        strokeWidth="8"
        strokeLinecap="round"
      />
    </>
  ),
  dna: (fill) => (
    <path
      d="M30 10c0 20 40 20 40 40s-40 20-40 40M70 10c0 20-40 20-40 40s40 20 40 40M36 28h28M36 72h28M40 50h20"
      fill="none"
      stroke={fill}
      strokeWidth="8"
      strokeLinecap="round"
    />
  ),
  document: (fill) => (
    <>
      <path d="M24 10h36l20 20v60H24z" fill={fill} />
      <path
        d="M36 48h28M36 62h28M36 76h18"
        stroke={INK}
        strokeWidth="4"
        strokeLinecap="round"
        opacity=".55"
      />
    </>
  ),
  drop: (fill) => (
    <path
      d="M50 10c16 22 28 36 28 52a28 28 0 0 1-56 0c0-16 12-30 28-52z"
      fill={fill}
    />
  ),
  factory: (fill) => (
    <>
      <path d="M12 86V46l22 14V46l22 14V46l22 14V22h10v64z" fill={fill} />
      <rect x="20" y="66" width="10" height="10" fill="#fff" />
      <rect x="44" y="66" width="10" height="10" fill="#fff" />
    </>
  ),
  flask: (fill) => (
    <>
      <path
        d="M38 12h24v26l24 42a6 6 0 0 1-5 9H19a6 6 0 0 1-5-9l24-42z"
        fill={fill}
      />
      <path d="M26 66h48" stroke={INK} strokeWidth="4" opacity=".4" />
    </>
  ),
  gavel: (fill) => (
    <>
      <rect
        x="18"
        y="20"
        width="40"
        height="22"
        rx="8"
        transform="rotate(-35 38 31)"
        fill={fill}
      />
      <path
        d="M48 46l32 32"
        stroke={INK}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <rect x="10" y="80" width="46" height="10" rx="5" fill={INK} />
    </>
  ),
  globe: (fill) => (
    <>
      <circle cx="50" cy="50" r="38" fill={fill} />
      <path
        d="M12 50h76M50 12c-16 18-16 58 0 76M50 12c16 18 16 58 0 76"
        fill="none"
        stroke={INK}
        strokeWidth="3"
        opacity=".5"
      />
    </>
  ),
  heart: (fill) => (
    <path
      d="M50 86L18 54a18 18 0 0 1 26-26l6 6 6-6a18 18 0 0 1 26 26z"
      fill={fill}
    />
  ),
  house: (fill) => (
    <>
      <path
        d="M14 50L50 18l36 32"
        fill="none"
        stroke={INK}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M22 46v40h56V46z" fill={fill} />
      <rect
        x="42"
        y="60"
        width="16"
        height="26"
        rx="3"
        fill={INK}
        opacity=".5"
      />
    </>
  ),
  leaf: (fill) => (
    <>
      <path d="M18 82C18 40 46 16 86 16c0 40-24 68-68 66z" fill={fill} />
      <path
        d="M22 80c14-22 30-38 52-52"
        fill="none"
        stroke={INK}
        strokeWidth="4"
        strokeLinecap="round"
        opacity=".5"
      />
    </>
  ),
  lock: (fill) => (
    <>
      <rect x="20" y="44" width="60" height="44" rx="10" fill={fill} />
      <path
        d="M32 44V32a18 18 0 0 1 36 0v12"
        fill="none"
        stroke={INK}
        strokeWidth="8"
      />
      <circle cx="50" cy="66" r="6" fill={INK} />
    </>
  ),
  magnifier: (fill) => (
    <>
      <circle cx="42" cy="42" r="26" fill={fill} stroke={INK} strokeWidth="6" />
      <path
        d="M62 62l24 24"
        stroke={INK}
        strokeWidth="12"
        strokeLinecap="round"
      />
    </>
  ),
  microscope: (fill) => (
    <>
      <path d="M44 14l20 10-16 30-20-10z" fill={fill} />
      <path
        d="M30 50l12 6c-8 10-6 22 4 30"
        fill="none"
        stroke={INK}
        strokeWidth="8"
        strokeLinecap="round"
      />
      <rect x="22" y="82" width="56" height="8" rx="4" fill={INK} />
    </>
  ),
  mountain: (fill) => (
    <>
      <path d="M6 86L40 26l20 32 12-16 22 44z" fill={fill} />
      <path d="M40 26l8 14-8 6-8-6z" fill="#fff" opacity=".8" />
    </>
  ),
  particles: (fill) => (
    <>
      <circle cx="20" cy="30" r="8" fill={fill} />
      <circle cx="54" cy="18" r="6" fill={fill} />
      <circle cx="80" cy="40" r="9" fill={fill} />
      <circle cx="40" cy="60" r="7" fill={fill} />
      <circle cx="70" cy="76" r="6" fill={fill} />
      <circle cx="24" cy="82" r="5" fill={fill} />
    </>
  ),
  person: (fill) => (
    <>
      <circle cx="50" cy="28" r="16" fill={fill} />
      <path d="M18 90c0-24 14-36 32-36s32 12 32 36z" fill={fill} />
    </>
  ),
  pill: (fill) => (
    <>
      <rect
        x="12"
        y="34"
        width="76"
        height="32"
        rx="16"
        transform="rotate(-30 50 50)"
        fill={fill}
      />
      <path d="M38 30l24 40" stroke={INK} strokeWidth="4" opacity=".4" />
    </>
  ),
  server: (fill) => (
    <>
      <rect x="18" y="12" width="64" height="76" rx="10" fill={fill} />
      <path
        d="M30 30h30M30 50h30M30 70h30"
        stroke={INK}
        strokeWidth="5"
        strokeLinecap="round"
        opacity=".45"
      />
      <circle cx="70" cy="30" r="3" fill={INK} />
      <circle cx="70" cy="50" r="3" fill={INK} />
      <circle cx="70" cy="70" r="3" fill={INK} />
    </>
  ),
  shield: (fill) => (
    <>
      <path
        d="M50 10l34 12v26c0 22-14 36-34 44C30 84 16 70 16 48V22z"
        fill={fill}
      />
      <path
        d="M36 50l10 10 18-22"
        fill="none"
        stroke={INK}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  snowflake: (fill) => (
    <path
      d="M50 10v80M15 30l70 40M15 70l70-40M50 10l-10 10M50 10l10 10M50 90l-10-10M50 90l10-10"
      fill="none"
      stroke={fill}
      strokeWidth="7"
      strokeLinecap="round"
    />
  ),
  star: (fill) => (
    <path
      d="M50 10l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z"
      fill={fill}
    />
  ),
  sun: (fill) => (
    <>
      <circle cx="50" cy="50" r="22" fill={fill} />
      <path
        d="M50 8v12M50 80v12M8 50h12M80 50h12M20 20l8 8M72 72l8 8M20 80l8-8M72 28l8-8"
        stroke={fill}
        strokeWidth="7"
        strokeLinecap="round"
      />
    </>
  ),
  tap: (fill) => (
    <>
      <path d="M22 44h36a14 14 0 0 1 14 14v10h-14v-8H22z" fill={fill} />
      <rect x="34" y="22" width="12" height="22" rx="4" fill={fill} />
      <rect x="24" y="14" width="32" height="10" rx="5" fill={INK} />
      <path
        d="M62 74v10"
        stroke="#8fc5ee"
        strokeWidth="8"
        strokeLinecap="round"
      />
    </>
  ),
  thermometer: (fill) => (
    <>
      <rect
        x="40"
        y="8"
        width="20"
        height="60"
        rx="10"
        fill="#fff"
        stroke={INK}
        strokeWidth="5"
      />
      <circle cx="50" cy="76" r="16" fill={fill} stroke={INK} strokeWidth="5" />
      <rect x="46" y="36" width="8" height="36" fill={fill} />
    </>
  ),
  train: (fill) => (
    <>
      <rect x="14" y="18" width="72" height="56" rx="14" fill={fill} />
      <rect x="24" y="28" width="22" height="18" rx="4" fill="#fff" />
      <rect x="54" y="28" width="22" height="18" rx="4" fill="#fff" />
      <circle cx="32" cy="82" r="7" fill={INK} />
      <circle cx="68" cy="82" r="7" fill={INK} />
      <path d="M14 56h72" stroke={INK} strokeWidth="4" opacity=".3" />
    </>
  ),
  tree: (fill) => (
    <>
      <path d="M50 8L20 56h18L18 82h64L62 56h18z" fill={fill} />
      <rect x="44" y="82" width="12" height="12" fill={INK} opacity=".6" />
    </>
  ),
  wave: (fill) => (
    <path
      d="M6 40c12-14 24-14 36 0s24 14 36 0 16-8 16 0M6 66c12-14 24-14 36 0s24 14 36 0 16-8 16 0"
      fill="none"
      stroke={fill}
      strokeWidth="9"
      strokeLinecap="round"
    />
  ),
  wrench: (fill) => (
    <path
      d="M70 14a22 22 0 0 0-26 30L14 74l12 12 30-30a22 22 0 0 0 30-26L72 44l-16-16z"
      fill={fill}
    />
  ),
};
export const ICON_COLORS: Record<string, string> = {
  ink: "#344a62",
  butter: "#f6e39c",
  sky: "#a6cff2",
  sage: "#bfe3cf",
  lilac: "#cdbcf0",
  blush: "#f4c8dc",
  cream: "#faf9f4",
};
export default function SceneIconGlyph({
  icon,
  color = "sky",
  title,
}: {
  icon: SceneIcon;
  color?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="scene-icon"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {paths[icon](ICON_COLORS[color] ?? ICON_COLORS.sky)}
    </svg>
  );
}
