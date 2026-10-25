"use client";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  type Ref,
  type RefObject,
} from "react";
import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import type { SceneController } from "@/lib/authored-scenes";

gsap.registerPlugin(DrawSVGPlugin, MotionPathPlugin);

/**
 * Shared timeline plumbing for authored scenes: builds a paused GSAP timeline
 * once the SVG is mounted, honours play() calls that arrive before the
 * timeline exists (lazy mounts), and exposes play/pause/seek/restart.
 */
export function useAuthoredTimeline(
  root: RefObject<SVGSVGElement | null>,
  build: (tl: gsap.core.Timeline, q: gsap.utils.SelectorFunc) => void,
  reducedMotion: boolean,
  ref: Ref<SceneController>,
) {
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
    build(tl, q);
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
    // The build function is static per scene component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
}
export const sceneFrame = {
  className: "authored-scene overlay",
  viewBox: "0 0 1200 900",
  preserveAspectRatio: "xMidYMid slice" as const,
};
