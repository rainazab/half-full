"use client";
import { useEffect, useImperativeHandle, useRef } from "react";
import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import type { AuthoredSceneProps } from "@/lib/authored-scenes";
import { GrainDefs, INK, PALETTE } from "./grain";

gsap.registerPlugin(DrawSVGPlugin, MotionPathPlugin);

/**
 * "Thawing permafrost exposed shale bedrock containing pyrite, which produces
 * acid that leaches metals into the lake supplying the town." Every beat of
 * the timeline is one clause of that approved sentence:
 *   1. the sun warms the valley and the frozen layer recedes (thaw)
 *   2. dark shale is exposed and its pyrite flecks catch the light
 *   3. acid forms at the shale and runs downhill as a stream (drawn path)
 *   4. metal particles ride the stream into the lake, which dulls
 *   5. the lake feeds the town's tap, and the "do not drink" mark closes it
 * No numbers, names or outcomes beyond the approved copy are drawn.
 */
const ID = "svp";
const STREAM = "M470 520 C 560 540, 600 600, 700 640 S 880 690, 930 700";
export default function SvalbardPermafrost({
  reducedMotion,
  ref,
}: AuthoredSceneProps) {
  const root = useRef<SVGSVGElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const pendingPlay = useRef(false);
  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const q = gsap.utils.selector(svg);
    const tl = gsap.timeline({
      paused: true,
      defaults: { ease: "power2.out" },
    });
    // Rest state before the story begins.
    gsap.set(q(".sun"), {
      y: 60,
      scale: 0.9,
      transformOrigin: "50% 50%",
      opacity: 0.85,
    });
    gsap.set(q(".frost-mask-rect"), { attr: { height: 190 } });
    gsap.set(q(".pyrite"), { scale: 0, transformOrigin: "50% 50%" });
    gsap.set(q(".acid-drop"), {
      opacity: 0,
      y: -6,
      transformOrigin: "50% 50%",
    });
    gsap.set(q(".stream"), { drawSVG: "0%" });
    gsap.set(q(".metal"), { opacity: 0, x: 470, y: 520 });
    gsap.set(q(".tap-drop"), { opacity: 0, y: 0 });
    gsap.set(q(".no-ring"), { drawSVG: "0%" });
    gsap.set(q(".no-slash"), { drawSVG: "0%" });
    gsap.set(q(".warm-glow"), { opacity: 0 });
    // 1. Warming and thaw (0–3.2 s)
    tl.to(q(".sun"), { y: 0, scale: 1, opacity: 1, duration: 1.6 }, 0)
      .to(q(".warm-glow"), { opacity: 0.55, duration: 1.4 }, 0.4)
      .to(
        q(".frost-mask-rect"),
        { attr: { height: 40 }, duration: 2.2, ease: "power1.inOut" },
        0.9,
      )
      // 2. Shale exposed, pyrite catches the light (3.0–4.6 s)
      .to(
        q(".pyrite"),
        { scale: 1, duration: 0.5, stagger: 0.08, ease: "back.out(2)" },
        3.0,
      )
      // 3. Acid forms and the stream runs downhill (4.4–7.4 s)
      .to(
        q(".acid-drop"),
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.15 },
        4.4,
      )
      .to(
        q(".stream"),
        { drawSVG: "100%", duration: 2.4, ease: "power1.inOut" },
        5.0,
      )
      // 4. Metals ride the stream into the lake (6.4–10.4 s)
      .to(q(".metal"), { opacity: 1, duration: 0.3, stagger: 0.35 }, 6.4)
      .to(
        q(".metal"),
        {
          duration: 3.2,
          stagger: 0.35,
          ease: "power1.inOut",
          // Raw path data in SVG user units; the particles start at the origin so
          // the path coordinates become their positions.
          motionPath: { path: STREAM },
        },
        6.5,
      )
      .to(q(".lake-fill"), { fill: "#8aa4c2", duration: 2.2 }, 8.4)
      // 5. The town's tap: a drop falls, then the advisory mark draws (10.2–13 s)
      .to(q(".tap-drop"), { opacity: 1, duration: 0.3 }, 10.2)
      .to(q(".tap-drop"), { y: 54, duration: 0.8, ease: "power2.in" }, 10.3)
      .to(q(".tap-drop"), { opacity: 0, duration: 0.2 }, 11.05)
      .to(
        q(".no-ring"),
        { drawSVG: "100%", duration: 0.9, ease: "power1.inOut" },
        11.3,
      )
      .to(q(".no-slash"), { drawSVG: "100%", duration: 0.5 }, 12.1)
      .to({}, { duration: 0.4 });
    timeline.current = tl;
    if (reducedMotion) tl.progress(1).pause();
    else if (pendingPlay.current) {
      pendingPlay.current = false;
      tl.play(0);
    }
    return () => {
      tl.kill();
      timeline.current = null;
    };
  }, [reducedMotion]);
  useImperativeHandle(ref, () => ({
    play: () => {
      if (!timeline.current) {
        pendingPlay.current = true;
        return;
      }
      if (reducedMotion) timeline.current.progress(1);
      else timeline.current.play(0);
    },
    pause: () => timeline.current?.pause(),
    seek: (progress) =>
      timeline.current?.pause().progress(Math.max(0, Math.min(1, progress))),
    restart: () => {
      if (reducedMotion) timeline.current?.progress(1);
      else timeline.current?.restart();
    },
  }));
  return (
    <svg
      ref={root}
      className="authored-scene"
      viewBox="0 0 1200 900"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Cross-section of a valley: sunlight thaws a frozen ground layer, exposing dark shale with pyrite flecks; a stream carries metal particles into a lake that feeds a town's tap, which is marked not for drinking."
    >
      <GrainDefs id={ID} />
      <g filter={`url(#${ID}-grain)`}>
        {/* Sky and sun */}
        <rect width="1200" height="900" fill={PALETTE.cream} />
        <circle
          className="warm-glow"
          cx="990"
          cy="150"
          r="170"
          fill="#fff2b8"
          filter={`url(#${ID}-soft)`}
        />
        <circle
          className="sun"
          cx="990"
          cy="150"
          r="78"
          fill={`url(#${ID}-sun)`}
        />
        {/* Far mountains */}
        <path
          d="M0 420 C 140 300, 260 330, 380 390 S 620 300, 780 380 S 1060 300, 1200 400 L1200 520 L0 520 Z"
          fill="#e6ebe4"
        />
        <path d="M120 380 L 190 310 L 250 365 Z" fill="#ffffff" opacity=".85" />
        <path d="M640 365 L 700 310 L 760 370 Z" fill="#ffffff" opacity=".85" />
        {/* Lake basin (right) */}
        <path
          className="lake-fill"
          d="M720 600 C 780 560, 1120 560, 1180 620 C 1210 700, 1150 760, 950 760 C 790 760, 690 700, 720 600 Z"
          fill={`url(#${ID}-lake)`}
        />
        <path
          d="M780 630 C 860 612, 1040 612, 1110 640"
          fill="none"
          stroke="#ffffff"
          strokeWidth="6"
          strokeLinecap="round"
          opacity=".55"
        />
        {/* Hillside cross-section (left): soil, frozen layer, shale */}
        <path
          d="M0 520 C 120 500, 260 500, 380 530 C 520 560, 600 640, 700 700 L 700 900 L 0 900 Z"
          fill={PALETTE.soil}
        />
        <path
          d="M0 520 C 120 500, 260 500, 380 530 C 520 560, 600 640, 700 700 L 700 760 C 560 700, 420 620, 0 600 Z"
          fill={PALETTE.sageDeep}
        />
        <path
          d="M0 596 C 300 616, 520 680, 700 760 L 700 900 L 0 900 Z"
          fill={PALETTE.soilDeep}
        />
        {/* Shale band with pyrite flecks, revealed beneath the thawing frost */}
        <path
          d="M60 640 C 300 650, 500 700, 690 790 L 690 850 C 500 770, 300 720, 60 700 Z"
          fill={PALETTE.shale}
        />
        <path
          d="M60 640 C 300 650, 500 700, 690 790"
          fill="none"
          stroke={PALETTE.shaleDeep}
          strokeWidth="6"
          strokeLinecap="round"
        />
        {[
          [140, 676],
          [230, 690],
          [330, 708],
          [420, 728],
          [500, 754],
          [580, 782],
        ].map(([x, y], i) => (
          <circle
            key={i}
            className="pyrite"
            cx={x}
            cy={y}
            r="11"
            fill={PALETTE.butter}
            stroke="#d9b94a"
            strokeWidth="3"
          />
        ))}
        {/* Frozen layer sits over the shale; its mask recedes as the ground thaws */}
        <mask id={`${ID}-frost-mask`}>
          <rect
            className="frost-mask-rect"
            x="0"
            y="596"
            width="700"
            height="190"
            fill="#ffffff"
          />
        </mask>
        <g mask={`url(#${ID}-frost-mask)`}>
          <path
            d="M0 596 C 300 616, 520 680, 700 760 L 700 850 C 520 770, 300 720, 0 700 Z"
            fill={`url(#${ID}-frost)`}
          />
          {[80, 200, 320, 440, 560].map((x, i) => (
            <path
              key={i}
              d={`M${x} ${640 + i * 18} l 10 -14 l 10 14 M${x + 10} ${626 + i * 18} v 28`}
              fill="none"
              stroke="#ffffff"
              strokeWidth="4"
              strokeLinecap="round"
              opacity=".8"
            />
          ))}
        </g>
        {/* Acid forms at the shale and runs downhill into the lake */}
        {[
          [300, 696],
          [360, 708],
          [420, 724],
        ].map(([x, y], i) => (
          <path
            key={i}
            className="acid-drop"
            d={`M${x} ${y - 16} c 10 14, 14 20, 14 28 a 14 14 0 0 1 -28 0 c 0 -8, 4 -14, 14 -28 z`}
            fill={PALETTE.blush}
            stroke="#d98fb0"
            strokeWidth="3"
          />
        ))}
        <path
          className="stream"
          d={STREAM}
          fill="none"
          stroke="#d98fb0"
          strokeWidth="14"
          strokeLinecap="round"
          opacity=".9"
        />
        <path
          className="stream"
          d={STREAM}
          fill="none"
          stroke="#f7d9e6"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle
            key={i}
            className="metal"
            cx="0"
            cy="0"
            r={7 - (i % 3)}
            fill={PALETTE.metal}
          />
        ))}
        {/* Town above the far bank, fed by the lake */}
        {[
          [900, 520, PALETTE.lilac],
          [960, 505, PALETTE.blush],
          [1020, 520, PALETTE.butter],
        ].map(([x, y, color], i) => (
          <g key={i}>
            <rect
              x={Number(x) - 26}
              y={Number(y)}
              width="52"
              height="44"
              rx="8"
              fill={String(color)}
            />
            <path
              d={`M${Number(x) - 32} ${y} L ${x} ${Number(y) - 30} L ${Number(x) + 32} ${y} Z`}
              fill={INK}
              opacity=".55"
            />
          </g>
        ))}
        {/* Tap and glass at the town */}
        <g transform="translate(1040 560)">
          <path
            d="M0 0 h 60 a 18 18 0 0 1 18 18 v 20 h -20 v -16 h -58 z"
            fill={PALETTE.sky}
            stroke={INK}
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <rect
            x="18"
            y="-28"
            width="18"
            height="30"
            rx="6"
            fill={PALETTE.sky}
            stroke={INK}
            strokeWidth="5"
          />
          <rect x="4" y="-40" width="46" height="14" rx="7" fill={INK} />
          <path
            className="tap-drop"
            d="M66 48 c 8 11, 11 16, 11 22 a 11 11 0 0 1 -22 0 c 0 -6, 3 -11, 11 -22 z"
            fill={PALETTE.skyDeep}
          />
          <path
            d="M44 110 l 8 70 h 36 l 8 -70 z"
            fill="#ffffff"
            stroke={INK}
            strokeWidth="5"
            strokeLinejoin="round"
            opacity=".95"
          />
          <circle
            className="no-ring"
            cx="70"
            cy="140"
            r="52"
            fill="none"
            stroke="#d9534f"
            strokeWidth="9"
          />
          <path
            className="no-slash"
            d="M34 104 L 106 176"
            fill="none"
            stroke="#d9534f"
            strokeWidth="9"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  );
}
