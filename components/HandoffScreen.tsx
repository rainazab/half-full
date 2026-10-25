"use client";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import Charm from "./Charm";

const STAGES = [
  "Gathering today’s stories",
  "Checking the receipts",
  "Setting the mood",
  "Ready when you are",
];
/**
 * The breath between the intro and the app. It covers the home screen while
 * the first edition request is still in flight, holds for a minimum beat so
 * the change of scene never feels like a hard cut, then fades away to reveal
 * the home already rendered beneath it. Copy describes real stages of the
 * pipeline without claiming more than "getting ready".
 */
export default function HandoffScreen({
  ready,
  onDone,
}: {
  /** True once the edition behind the screen has finished loading. */
  ready: boolean;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(false);
  const minimumMs = reduced ? 600 : 1900;
  useEffect(() => {
    const timer = window.setTimeout(() => setElapsed(true), minimumMs);
    const ticker = window.setInterval(
      () => setStage((value) => Math.min(STAGES.length - 1, value + 1)),
      reduced ? 200 : 520,
    );
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(ticker);
    };
  }, [minimumMs, reduced]);
  const leaving = ready && elapsed;
  return (
    <motion.div
      className="handoff"
      role="status"
      aria-live="polite"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{
        duration: reduced ? 0.15 : leaving ? 0.7 : 0.35,
        ease: "easeInOut",
      }}
      onAnimationComplete={() => {
        if (leaving) onDone();
      }}
      style={{ pointerEvents: leaving ? "none" : "auto" }}
    >
      <motion.div
        className="handoff-charm"
        animate={reduced ? {} : { y: [0, -8, 0], rotate: [-2, 2, -2] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <Charm mood="mint" />
      </motion.div>
      <p className="handoff-wordmark">half full</p>
      <p className="handoff-stage" key={stage}>
        {STAGES[Math.min(stage, ready ? STAGES.length - 1 : STAGES.length - 2)]}
      </p>
      <div className="handoff-bar" aria-hidden="true">
        <motion.span
          initial={{ scaleX: 0 }}
          animate={{ scaleX: leaving ? 1 : 0.2 + stage * 0.22 }}
          transition={{ duration: reduced ? 0.1 : 0.6, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}
