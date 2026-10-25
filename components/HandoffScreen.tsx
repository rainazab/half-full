"use client";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import DitheredAtmosphere from "./DitheredAtmosphere";
import BrandWorldArtwork from "./BrandWorldArtwork";

/** A short visual handoff, not an invented provider progress meter. */
export default function HandoffScreen({
  ready,
  onDone,
  status,
}: {
  ready: boolean;
  onDone: () => void;
  /** An actual loading message supplied by the caller, when available. */
  status?: string;
}) {
  const reduced = useReducedMotion();
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setElapsed(true),
      reduced ? 300 : 950,
    );
    return () => window.clearTimeout(timer);
  }, [reduced]);
  const leaving = ready && elapsed;
  return (
    <motion.div
      className="library-handoff"
      role="status"
      aria-live="polite"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: reduced ? 0.1 : leaving ? 0.45 : 0.25 }}
      onAnimationComplete={() => {
        if (leaving) onDone();
      }}
      style={{ pointerEvents: leaving ? "none" : "auto" }}
    >
      <DitheredAtmosphere tone="lavender" intensity={0.18} />
      <div className="handoff-content">
        <BrandWorldArtwork variant="handoff" />
        <p className="handoff-wordmark">half full</p>
        <p className="handoff-stage">
          {ready ? "Your edition is ready." : status || "Opening your edition…"}
        </p>
        {!ready && (
          <div className="handoff-indeterminate" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
    </motion.div>
  );
}
