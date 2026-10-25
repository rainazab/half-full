"use client";
import { useRef } from "react";
import { gsap } from "gsap";
import type { AuthoredSceneProps } from "@/lib/authored-scenes";
import { INK, PALETTE } from "./grain";
import { sceneFrame, useAuthoredTimeline } from "./useAuthoredTimeline";

/**
 * Franklin story, scene 1, over the painting of a long row of identical closed
 * booklets with one warm one. A spotlight sweeps the whole row (the many
 * scientists named), then settles on the single warm booklet (the only woman
 * named) while small tally marks fill in under the others.
 */
export function FranklinOne({
  backgroundSrc,
  reducedMotion,
  ref,
}: AuthoredSceneProps) {
  const root = useRef<SVGSVGElement>(null);
  const tallies = Array.from({ length: 14 }, (_, i) => 120 + i * 68);
  useAuthoredTimeline(
    root,
    (tl, q) => {
      gsap.set(q(".spot"), { opacity: 0, x: -480, transformOrigin: "50% 50%" });
      gsap.set(q(".tally"), { scale: 0, transformOrigin: "50% 50%" });
      gsap.set(q(".halo"), {
        opacity: 0,
        scale: 0.5,
        transformOrigin: "50% 50%",
      });
      gsap.set(q(".spark"), {
        opacity: 0,
        scale: 0,
        transformOrigin: "50% 50%",
      });
      tl.to(q(".spot"), { opacity: 0.85, duration: 0.4 }, 0.2)
        .to(q(".spot"), { x: 420, duration: 3.2, ease: "sine.inOut" }, 0.3)
        .to(
          q(".tally"),
          { scale: 1, duration: 0.3, stagger: 0.16, ease: "back.out(2)" },
          0.8,
        )
        .to(q(".spot"), { x: 0, duration: 1.2, ease: "power2.inOut" }, 3.6)
        .to(q(".spot"), { opacity: 0, duration: 0.5 }, 4.8)
        .to(
          q(".halo"),
          { opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.8)" },
          4.8,
        )
        .to(
          q(".spark"),
          {
            opacity: 1,
            scale: 1,
            duration: 0.4,
            stagger: 0.12,
            ease: "back.out(3)",
          },
          5.4,
        )
        .to(
          q(".halo"),
          {
            scale: 1.06,
            duration: 0.9,
            yoyo: true,
            repeat: 2,
            ease: "sine.inOut",
          },
          6.0,
        )
        .to({}, { duration: 0.6 });
    },
    reducedMotion,
    ref,
  );
  return (
    <div className="authored-scene-frame">
      {backgroundSrc && (
        <img
          src={backgroundSrc}
          alt=""
          width={1365}
          height={1024}
          decoding="async"
          draggable={false}
        />
      )}
      <svg
        ref={root}
        {...sceneFrame}
        role="img"
        aria-label="A spotlight sweeps along a row of identical booklets while tally marks appear beneath them, then settles on the single highlighted booklet."
      >
        <defs>
          <radialGradient id="franklin-spot" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="0.6" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse
          className="spot"
          cx="560"
          cy="600"
          rx="150"
          ry="190"
          fill="url(#franklin-spot)"
        />
        {tallies.map((x, i) => (
          <rect
            key={i}
            className="tally"
            x={x}
            y="790"
            width="10"
            height="26"
            rx="5"
            fill={INK}
            opacity=".55"
          />
        ))}
        <ellipse
          className="halo"
          cx="560"
          cy="580"
          rx="92"
          ry="128"
          fill="none"
          stroke={PALETTE.butter}
          strokeWidth="10"
        />
        {[
          [470, 450],
          [650, 440],
          [560, 410],
        ].map(([x, y], i) => (
          <path
            key={i}
            className="spark"
            d={`M${x} ${y - 14} l 4 10 l 10 4 l -10 4 l -4 10 l -4 -10 l -10 -4 l 10 -4 z`}
            fill="#f6d77a"
          />
        ))}
      </svg>
    </div>
  );
}
/**
 * Franklin story, scene 2, over the painting of an open booklet with empty
 * portrait frames, a pencil and an atom. Beats follow the recommendation to
 * widen which scientists are named: the pencil's tip sparks, the empty frames
 * fill one by one with simple portraits, the atom's electrons circle, and the
 * sun brightens.
 */
export function FranklinRecommend({
  backgroundSrc,
  reducedMotion,
  ref,
}: AuthoredSceneProps) {
  const root = useRef<SVGSVGElement>(null);
  const frames: [number, number, string][] = [
    [492, 462, PALETTE.lilac],
    [722, 462, PALETTE.blush],
    [492, 552, PALETTE.butter],
    [722, 552, PALETTE.sage],
  ];
  useAuthoredTimeline(
    root,
    (tl, q) => {
      gsap.set(q(".tip"), { opacity: 0, scale: 0, transformOrigin: "50% 50%" });
      gsap.set(q(".portrait"), { scale: 0, transformOrigin: "50% 50%" });
      gsap.set(q(".orbit"), { rotation: 0, transformOrigin: "250px 430px" });
      gsap.set(q(".sun-glow"), {
        opacity: 0,
        scale: 0.7,
        transformOrigin: "50% 50%",
      });
      tl.to(
        q(".tip"),
        { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(3)" },
        0.3,
      )
        .to(
          q(".tip"),
          {
            scale: 1.3,
            duration: 0.4,
            yoyo: true,
            repeat: 3,
            ease: "sine.inOut",
          },
          0.7,
        )
        .to(
          q(".portrait"),
          { scale: 1, duration: 0.55, stagger: 0.7, ease: "back.out(2)" },
          1.0,
        )
        .to(q(".tip"), { opacity: 0, duration: 0.3 }, 3.6)
        .to(q(".orbit"), { rotation: 360, duration: 4, ease: "none" }, 1.0)
        .to(q(".sun-glow"), { opacity: 0.8, scale: 1, duration: 1.2 }, 4.2)
        .to(q(".sun-glow"), { opacity: 0.4, duration: 1 }, 5.6)
        .to({}, { duration: 0.6 });
    },
    reducedMotion,
    ref,
  );
  return (
    <div className="authored-scene-frame">
      {backgroundSrc && (
        <img
          src={backgroundSrc}
          alt=""
          width={1365}
          height={1024}
          decoding="async"
          draggable={false}
        />
      )}
      <svg
        ref={root}
        {...sceneFrame}
        role="img"
        aria-label="A pencil tip sparks and four empty frames in an open booklet fill with simple portraits one by one; electrons circle an atom and the sun brightens."
      >
        <circle
          className="sun-glow"
          cx="1010"
          cy="210"
          r="120"
          fill="#fff2b8"
          opacity=".6"
        />
        <g className="orbit">
          <circle cx="250" cy="430" r="78" fill="none" stroke="none" />
          <circle cx="328" cy="430" r="10" fill={PALETTE.skyDeep} />
          <circle cx="172" cy="430" r="10" fill={PALETTE.butter} />
        </g>
        {frames.map(([x, y, color], i) => (
          <g key={i} className="portrait">
            <circle cx={x} cy={y} r="30" fill={color} />
            <circle cx={x} cy={y - 8} r="10" fill={INK} opacity=".75" />
            <path
              d={`M${x - 18} ${y + 22} a 18 14 0 0 1 36 0`}
              fill={INK}
              opacity=".75"
            />
          </g>
        ))}
        <path
          className="tip"
          d="M728 530 l 5 12 l 12 5 l -12 5 l -5 12 l -5 -12 l -12 -5 l 12 -5 z"
          fill="#f6d77a"
        />
      </svg>
    </div>
  );
}
export default FranklinOne;
