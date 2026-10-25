"use client";
import { useEffect, useImperativeHandle, useRef } from "react";
import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import type { AuthoredSceneProps } from "@/lib/authored-scenes";
import { INK, PALETTE } from "./grain";

gsap.registerPlugin(DrawSVGPlugin);

/**
 * Scene 1 of the Svalbard story over the stored Recraft painting of the lake,
 * the small town and a tap. The timeline follows the caption "Residents of
 * Longyearbyen have been told not to drink tap water": a soft ring settles on
 * the town, a ripple shows the lake that supplies it, then the tap at the
 * foreground runs and the advisory mark draws over it. Coordinates are
 * normalized to the painting's 4:3 frame.
 */
export default function SvalbardTownTap({
  backgroundSrc,
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
    gsap.set(q(".town-ring"), {
      scale: 0.6,
      opacity: 0,
      transformOrigin: "50% 50%",
    });
    gsap.set(q(".ripple"), {
      scale: 0.2,
      opacity: 0,
      transformOrigin: "50% 50%",
    });
    gsap.set(q(".pipe"), { drawSVG: "0%" });
    gsap.set(q(".drop"), { opacity: 0, y: 0 });
    gsap.set(q(".no-ring"), { drawSVG: "0%" });
    gsap.set(q(".no-slash"), { drawSVG: "0%" });
    tl.to(q(".town-ring"), { scale: 1, opacity: 1, duration: 0.9 }, 0.2)
      .to(q(".town-ring"), { opacity: 0.35, duration: 0.8 }, 1.6)
      .to(
        q(".ripple"),
        {
          scale: 1,
          opacity: 0.9,
          duration: 1.4,
          stagger: 0.35,
          ease: "sine.out",
        },
        1.4,
      )
      .to(q(".ripple"), { opacity: 0, duration: 0.8, stagger: 0.2 }, 3.0)
      .to(
        q(".pipe"),
        { drawSVG: "100%", duration: 1.6, ease: "power1.inOut" },
        2.6,
      )
      .to(q(".drop"), { opacity: 1, duration: 0.2 }, 4.4)
      .to(q(".drop"), { y: 70, duration: 0.7, ease: "power2.in" }, 4.5)
      .to(q(".drop"), { opacity: 0, duration: 0.15 }, 5.15)
      .to(q(".drop"), { y: 0, opacity: 1, duration: 0.2 }, 5.5)
      .to(q(".drop"), { y: 70, duration: 0.7, ease: "power2.in" }, 5.6)
      .to(q(".drop"), { opacity: 0, duration: 0.15 }, 6.25)
      .to(
        q(".no-ring"),
        { drawSVG: "100%", duration: 0.9, ease: "power1.inOut" },
        6.3,
      )
      .to(q(".no-slash"), { drawSVG: "100%", duration: 0.5 }, 7.1)
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
    restart: () =>
      reducedMotion
        ? timeline.current?.progress(1)
        : timeline.current?.restart(),
  }));
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
        className="authored-scene overlay"
        viewBox="0 0 1200 900"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="A ring settles on the small town above the lake, ripples spread across the lake that supplies it, water runs from the tap and a red ring with a slash marks it not for drinking."
      >
        {/* Town above the far bank (painting: roughly x 0.62, y 0.3) */}
        <circle
          className="town-ring"
          cx="760"
          cy="265"
          r="96"
          fill="none"
          stroke={PALETTE.butter}
          strokeWidth="10"
          opacity=".9"
        />
        {/* Lake centre (painting: roughly x 0.5, y 0.5) */}
        {[70, 120, 170].map((r) => (
          <ellipse
            key={r}
            className="ripple"
            cx="600"
            cy="440"
            rx={r}
            ry={r * 0.45}
            fill="none"
            stroke="#ffffff"
            strokeWidth="6"
          />
        ))}
        {/* Supply line from the lake toward the foreground tap (painting: tap at x 0.1, y 0.88) */}
        <path
          className="pipe"
          d="M520 560 C 360 620, 230 680, 150 760"
          fill="none"
          stroke={PALETTE.skyDeep}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray="2 22"
        />
        {/* Water from the tap spout and the advisory mark */}
        <path
          className="drop"
          d="M168 820 c 9 12, 12 17, 12 24 a 12 12 0 0 1 -24 0 c 0 -7, 3 -12, 12 -24 z"
          fill={PALETTE.skyDeep}
        />
        <circle
          className="no-ring"
          cx="125"
          cy="800"
          r="92"
          fill="none"
          stroke="#d9534f"
          strokeWidth="11"
        />
        <path
          className="no-slash"
          d="M60 735 L 190 865"
          fill="none"
          stroke="#d9534f"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <circle
          cx="125"
          cy="800"
          r="92"
          fill="none"
          stroke={INK}
          strokeWidth="0"
        />
      </svg>
    </div>
  );
}
