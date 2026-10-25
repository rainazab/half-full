"use client";
import { useRef } from "react";
import { gsap } from "gsap";
import type { AuthoredSceneProps } from "@/lib/authored-scenes";
import { PALETTE } from "./grain";
import { sceneFrame, useAuthoredTimeline } from "./useAuthoredTimeline";

const WARN = "#e4573d";
/**
 * PHP story, scene 1, over the painting of five browser windows wired to a
 * server with a magnifier. Beats follow the caption: PHP runs behind many
 * websites (pulses travel the wires to each window), researchers using AI
 * tools searched it (the magnifier glows and sweeps), and found two serious
 * flaws (two cracks draw and two warning marks pulse).
 */
export function PhpFlaws({
  backgroundSrc,
  reducedMotion,
  ref,
}: AuthoredSceneProps) {
  const root = useRef<SVGSVGElement>(null);
  const wires = [
    "M330 600 C 300 500, 260 420, 200 300",
    "M400 520 C 420 440, 440 360, 440 300",
    "M560 380 C 600 340, 640 320, 660 300",
    "M700 560 C 760 470, 800 400, 820 300",
    "M760 620 C 860 520, 940 420, 980 300",
  ];
  useAuthoredTimeline(
    root,
    (tl, q) => {
      gsap.set(q(".pulse"), { opacity: 0 });
      gsap.set(q(".glass-glow"), {
        opacity: 0,
        scale: 0.8,
        transformOrigin: "50% 50%",
      });
      gsap.set(q(".sweep"), { opacity: 0, x: -120, y: 120 });
      gsap.set(q(".crack"), { drawSVG: "0%" });
      gsap.set(q(".flaw"), { scale: 0, transformOrigin: "50% 50%" });
      wires.forEach((path, i) => {
        tl.to(q(`.pulse-${i}`), { opacity: 1, duration: 0.2 }, 0.3 + i * 0.35);
        tl.to(
          q(`.pulse-${i}`),
          { duration: 1.4, ease: "power1.inOut", motionPath: { path } },
          0.3 + i * 0.35,
        );
        tl.to(q(`.pulse-${i}`), { opacity: 0, duration: 0.3 }, 1.5 + i * 0.35);
      });
      tl.to(q(".glass-glow"), { opacity: 0.9, scale: 1, duration: 0.8 }, 3.0)
        .to(q(".sweep"), { opacity: 0.9, duration: 0.3 }, 3.2)
        .to(
          q(".sweep"),
          { x: 0, y: 0, duration: 1.6, ease: "power1.inOut" },
          3.2,
        )
        .to(q(".sweep"), { opacity: 0, duration: 0.4 }, 4.9)
        .to(
          q(".crack-1"),
          { drawSVG: "100%", duration: 0.7, ease: "power1.inOut" },
          5.0,
        )
        .to(
          q(".crack-2"),
          { drawSVG: "100%", duration: 0.7, ease: "power1.inOut" },
          5.5,
        )
        .to(
          q(".flaw"),
          { scale: 1, duration: 0.5, stagger: 0.3, ease: "back.out(2.5)" },
          6.0,
        )
        .to(
          q(".flaw"),
          {
            scale: 1.15,
            duration: 0.5,
            yoyo: true,
            repeat: 3,
            ease: "sine.inOut",
            stagger: 0.15,
          },
          6.8,
        )
        .to({}, { duration: 0.4 });
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
        aria-label="Pulses travel along the wires from the server to five browser windows; a magnifier glows and sweeps across the server; two cracks appear with warning marks."
      >
        {wires.map((_, i) => (
          <circle
            key={i}
            className={`pulse pulse-${i}`}
            cx="0"
            cy="0"
            r="11"
            fill={PALETTE.butter}
            stroke="#d9b94a"
            strokeWidth="3"
          />
        ))}
        <circle
          className="glass-glow"
          cx="860"
          cy="520"
          r="120"
          fill="none"
          stroke="#ffffff"
          strokeWidth="10"
          opacity=".9"
        />
        <circle
          className="sweep"
          cx="860"
          cy="520"
          r="96"
          fill="#ffffff"
          opacity=".35"
        />
        <path
          className="crack crack-1"
          d="M520 470 l 14 22 l -18 16 l 16 24"
          fill="none"
          stroke={PALETTE.metal}
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="crack crack-2"
          d="M600 640 l -12 20 l 16 14 l -12 22"
          fill="none"
          stroke={PALETTE.metal}
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g className="flaw">
          <circle cx="515" cy="455" r="17" fill={WARN} />
          <path
            d="M515 446v10M515 462v2"
            stroke="#fff"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
        <g className="flaw">
          <circle cx="612" cy="628" r="17" fill={WARN} />
          <path
            d="M612 619v10M612 635v2"
            stroke="#fff"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
}
/**
 * PHP story, scene 2, over the painting of a cracked server receiving a patch,
 * a lock, and a second server with its plug. Beats: the cracks are found, the
 * patch seals them (mending strokes draw over the cracks and the patch
 * glows), the lock closes with a check (no successful attacks reported), and
 * the plug draws back for systems taken offline.
 */
export function PhpPatch({
  backgroundSrc,
  reducedMotion,
  ref,
}: AuthoredSceneProps) {
  const root = useRef<SVGSVGElement>(null);
  useAuthoredTimeline(
    root,
    (tl, q) => {
      gsap.set(q(".found"), {
        opacity: 0,
        scale: 0.6,
        transformOrigin: "50% 50%",
      });
      gsap.set(q(".mend"), { drawSVG: "0%" });
      gsap.set(q(".patch-glow"), {
        opacity: 0,
        scale: 0.7,
        transformOrigin: "50% 50%",
      });
      gsap.set(q(".lock-ring"), {
        opacity: 0,
        scale: 0.6,
        transformOrigin: "50% 50%",
      });
      gsap.set(q(".check"), { drawSVG: "0%" });
      gsap.set(q(".unplug"), { opacity: 0, x: 0 });
      gsap.set(q(".plug-dash"), { drawSVG: "0%" });
      tl.to(
        q(".found"),
        {
          opacity: 1,
          scale: 1,
          duration: 0.6,
          stagger: 0.3,
          ease: "back.out(2)",
        },
        0.3,
      )
        .to(q(".found"), { opacity: 0, duration: 0.4 }, 2.2)
        .to(q(".patch-glow"), { opacity: 0.9, scale: 1, duration: 0.7 }, 2.0)
        .to(q(".patch-glow"), { opacity: 0.35, duration: 0.8 }, 3.0)
        .to(
          q(".mend"),
          {
            drawSVG: "100%",
            duration: 0.9,
            stagger: 0.35,
            ease: "power1.inOut",
          },
          2.6,
        )
        .to(
          q(".lock-ring"),
          { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(2)" },
          4.6,
        )
        .to(
          q(".check"),
          { drawSVG: "100%", duration: 0.7, ease: "power1.inOut" },
          5.2,
        )
        .to(q(".unplug"), { opacity: 1, duration: 0.3 }, 6.4)
        .to(q(".unplug"), { x: 70, duration: 1.1, ease: "power2.inOut" }, 6.5)
        .to(q(".plug-dash"), { drawSVG: "100%", duration: 0.9 }, 6.7)
        .to({}, { duration: 0.5 });
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
        aria-label="Cracks on a server are marked, then sealed as a patch glows; a lock is ringed and a check mark draws; a plug pulls back from a second server."
      >
        <circle
          className="found"
          cx="265"
          cy="395"
          r="34"
          fill="none"
          stroke={WARN}
          strokeWidth="8"
        />
        <circle
          className="found"
          cx="400"
          cy="480"
          r="34"
          fill="none"
          stroke={WARN}
          strokeWidth="8"
        />
        <circle
          className="patch-glow"
          cx="345"
          cy="300"
          r="120"
          fill="#fff6c4"
          opacity=".6"
        />
        <path
          className="mend"
          d="M250 395 C 275 360, 300 340, 330 320"
          fill="none"
          stroke={PALETTE.sageDeep}
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          className="mend"
          d="M395 500 C 380 440, 360 380, 350 330"
          fill="none"
          stroke={PALETTE.sageDeep}
          strokeWidth="12"
          strokeLinecap="round"
        />
        <circle
          className="lock-ring"
          cx="610"
          cy="640"
          r="92"
          fill="none"
          stroke="#ffffff"
          strokeWidth="10"
          opacity=".95"
        />
        <path
          className="check"
          d="M560 560 l 36 34 l 70 -72"
          fill="none"
          stroke={PALETTE.sageDeep}
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g className="unplug">
          <circle
            cx="935"
            cy="770"
            r="36"
            fill="none"
            stroke={PALETTE.butter}
            strokeWidth="8"
          />
        </g>
        <path
          className="plug-dash"
          d="M905 770 h -110"
          fill="none"
          stroke={PALETTE.metal}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="4 18"
        />
      </svg>
    </div>
  );
}
export default PhpFlaws;
