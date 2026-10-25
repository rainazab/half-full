"use client";
import { useEffect, useState } from "react";
import type { RunLogEntry } from "@/lib/types";
import { generationProgress } from "@/lib/generation-progress";
import { dateLabel } from "@/lib/daily";
import Charm from "./Charm";
export default function GenerationProgress({
  date,
  log,
}: {
  date: string;
  log: RunLogEntry[];
}) {
  const [started] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const progress = generationProgress(log, now);
  return (
    <section
      className="edition-loading generation-progress"
      aria-label="Preparing edition"
    >
      <Charm mood="mint" />
      <h2>Preparing your edition</h2>
      <p>
        {dateLabel(date, { month: "long", day: "numeric", year: "numeric" })}
      </p>
      <div className="generation-meter-label">
        <span role="status">{progress.label}</span>
        <span>Estimated {progress.percent}%</span>
      </div>
      <div
        className="generation-meter"
        role="progressbar"
        aria-label="Estimated edition progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-valuetext={`Estimated ${progress.percent} percent. ${progress.label}.`}
      >
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="generation-timing">
        {now - started < 180000
          ? "Usually 2–3 minutes. Saved dates open right away."
          : "Taking longer than usual. Still working on this edition."}
      </p>
    </section>
  );
}
