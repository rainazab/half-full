"use client";
import { useEffect, useRef, useId } from "react";
import DitheredAtmosphere from "./DitheredAtmosphere";
import { formatClock } from "@/lib/mini-timer";

/** Original celebrating half full character; same blob family as the reaction stickers. */
export function CelebrationCharm() {
  const gradient = `celebration-${useId().replace(/:/g, "")}`;
  return (
    <svg
      className="celebration-charm"
      viewBox="0 0 160 150"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={gradient} cx="35%" cy="25%" r="80%">
          <stop stopColor="#e7fbe9" />
          <stop offset="1" stopColor="#a7dbc4" />
        </radialGradient>
      </defs>
      <g className="celebration-dots">
        <circle cx="26" cy="38" r="4" fill="#f4c8dc" />
        <circle cx="138" cy="30" r="3.5" fill="#f4eaa1" />
        <circle cx="146" cy="78" r="3" fill="#deedf7" />
        <circle cx="16" cy="92" r="3" fill="#f4eaa1" />
        <path
          d="M118 14l2.4 5.6 5.6 2.4-5.6 2.4-2.4 5.6-2.4-5.6-5.6-2.4 5.6-2.4z"
          fill="#f6d77a"
        />
      </g>
      <g className="celebration-body">
        {/* Raised arms */}
        <path
          d="M38 70c-10-10-18-26-12-32s16 6 22 18"
          fill="none"
          stroke="#a7dbc4"
          strokeWidth="13"
          strokeLinecap="round"
          className="arm arm-left"
        />
        <path
          d="M122 70c10-10 18-26 12-32s-16 6-22 18"
          fill="none"
          stroke="#a7dbc4"
          strokeWidth="13"
          strokeLinecap="round"
          className="arm arm-right"
        />
        <path
          d="M46 58C44 36 64 30 80 36c18-8 38 0 36 22 14 6 16 28 4 38 2 20-18 34-40 30-24 6-46-8-42-30-12-10-10-32 8-38Z"
          fill={`url(#${gradient})`}
          stroke="white"
          strokeWidth="2.5"
        />
        {/* Closed happy eyes */}
        <path
          d="M60 76q6-7 12 0"
          fill="none"
          stroke="#344a62"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M88 76q6-7 12 0"
          fill="none"
          stroke="#344a62"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M70 90q10 10 20 0"
          fill="none"
          stroke="#344a62"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <ellipse cx="52" cy="90" rx="7" ry="3.5" fill="#e69fbb" opacity=".55" />
        <ellipse
          cx="108"
          cy="90"
          rx="7"
          ry="3.5"
          fill="#e69fbb"
          opacity=".55"
        />
        <path
          d="M50 52q2-10 12-12"
          fill="none"
          stroke="white"
          strokeWidth="5"
          strokeLinecap="round"
          opacity=".6"
        />
      </g>
    </svg>
  );
}

export default function MiniCelebration({
  open,
  ms,
  message,
  personalBest,
  onClose,
}: {
  open: boolean;
  ms: number | null;
  message: string;
  personalBest: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      trigger.current = document.activeElement as HTMLElement;
      element.showModal();
      document.documentElement.classList.add("overlay-open");
      // Focus the one control; the heading is announced through aria-labelledby.
      requestAnimationFrame(() => done.current?.focus());
    } else if (!open && element.open) {
      element.close();
    }
    return () => {
      document.documentElement.classList.remove("overlay-open");
    };
  }, [open]);
  function close() {
    document.documentElement.classList.remove("overlay-open");
    onClose();
    const target = trigger.current;
    if (target && target.isConnected && target !== document.body)
      requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }
  return (
    <dialog
      ref={dialog}
      className="mini-celebration"
      aria-labelledby="mini-celebration-title"
      aria-describedby="mini-celebration-result"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
    >
      <div className="mini-celebration-panel">
        <DitheredAtmosphere tone="peach" intensity={0.18} />
        <p className="eyebrow">Brain Break</p>
        <h2 id="mini-celebration-title">A little win.</h2>
        <CelebrationCharm />
        <div id="mini-celebration-result">
          {ms !== null && (
            <p
              className="celebration-time"
              aria-label={`Your time ${formatClock(ms)}`}
            >
              {formatClock(ms)}
            </p>
          )}
          <p className={`celebration-message${personalBest ? " best" : ""}`}>
            {message}
          </p>
        </div>
        <button ref={done} className="primary celebration-done" onClick={close}>
          Back to Brain Break
        </button>
      </div>
    </dialog>
  );
}
