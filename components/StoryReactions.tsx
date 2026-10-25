"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const options = [
  {
    label: "Interesting",
    image: "interesting",
    hint: "That caught my attention",
  },
  {
    label: "Insightful",
    image: "insightful",
    hint: "I understand a little more",
  },
  { label: "Hopeful", image: "hopeful", hint: "A little reason for optimism" },
  { label: "Stressed", image: "stressed", hint: "That felt like a lot" },
] as const;

/** How long a press must last before the tray opens. */
const HOLD_MS = 320;
/** Finger travel that turns a press into a scroll or swipe, not a hold. */
const MOVE_SLOP = 10;
/** Minimum gap between vibration ticks while sliding. */
const TICK_MS = 70;

type Mode = "hold" | "tap";

/**
 * One reaction button. Hold and slide to choose in a single gesture, or tap to
 * open the tray and tap a character. The reaction is saved only on commit.
 * Reactions saved in earlier versions keep working.
 */
export default function StoryReactions({
  value,
  onChange,
}: {
  value?: string;
  onChange: (reaction: string) => void;
}) {
  const selected =
    value === "Clearer" ? "Insightful" : value === "A lot" ? "Stressed" : value;
  const current = options.find((option) => option.label === selected);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("tap");
  const [active, setActive] = useState<number | null>(null);
  const [burst, setBurst] = useState<string | null>(null);

  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tray = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const press = useRef<{
    id: number;
    x: number;
    y: number;
    timer: number | null;
    opened: boolean;
  } | null>(null);
  const lastTick = useRef(0);
  const activeRef = useRef<number | null>(null);

  const setHighlight = useCallback((next: number | null) => {
    if (activeRef.current === next) return;
    activeRef.current = next;
    setActive(next);
    if (
      next !== null &&
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      const now = performance.now();
      if (now - lastTick.current > TICK_MS) {
        lastTick.current = now;
        // Supported on Android browsers. iOS Safari has no web vibration API,
        // so there the scale and spring motion is the feedback.
        navigator.vibrate(6);
      }
    }
  }, []);

  const close = useCallback(
    (restoreFocus = false) => {
      setOpen(false);
      setHighlight(null);
      if (restoreFocus) trigger.current?.focus();
    },
    [setHighlight],
  );

  const commit = useCallback(
    (index: number, how: Mode) => {
      const label = options[index].label;
      // A tap on the reaction you already chose takes it back.
      const next = how === "tap" && selected === label ? "" : label;
      setBurst(next || null);
      onChange(next);
      close();
    },
    [close, onChange, selected],
  );

  useEffect(() => {
    if (!burst) return;
    const timer = window.setTimeout(() => setBurst(null), 1100);
    return () => window.clearTimeout(timer);
  }, [burst]);

  useEffect(
    () => () => {
      if (press.current?.timer) window.clearTimeout(press.current.timer);
    },
    [],
  );

  // Dismiss on outside press or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close]);

  /** Which character is under the finger, by coordinates. */
  const hitTest = (x: number, y: number): number | null => {
    const box = tray.current?.getBoundingClientRect();
    if (!box) return null;
    if (
      x < box.left - 16 ||
      x > box.right + 16 ||
      y < box.top - 64 ||
      y > box.bottom + 8
    )
      return null;
    let best: number | null = null;
    let distance = Infinity;
    itemRefs.current.forEach((item, index) => {
      if (!item) return;
      const rect = item.getBoundingClientRect();
      const d = Math.abs(x - (rect.left + rect.width / 2));
      if (d < distance) {
        distance = d;
        best = index;
      }
    });
    return best;
  };

  const endPress = () => {
    const current = press.current;
    if (current?.timer) window.clearTimeout(current.timer);
    press.current = null;
    return current;
  };

  return (
    <div
      className={`reaction-picker${open ? " is-open" : ""}`}
      ref={root}
      role="group"
      aria-label="React to this story"
    >
      {open && (
        <div
          className="reaction-tray"
          ref={tray}
          role="radiogroup"
          aria-label="Choose how this story landed"
          data-mode={mode}
        >
          {options.map(({ label, image, hint }, index) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={selected === label}
              aria-label={`${label}. ${hint}`}
              className={`reaction-choice${active === index ? " is-active" : ""}${selected === label ? " is-selected" : ""}`}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              tabIndex={
                active === index || (active === null && index === 0) ? 0 : -1
              }
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setHighlight(index);
              }}
              onPointerLeave={(event) => {
                if (
                  event.pointerType === "mouse" &&
                  activeRef.current === index
                )
                  setHighlight(null);
              }}
              onFocus={() => setHighlight(index)}
              onClick={() => {
                // Hold gestures commit on release of the trigger instead.
                if (mode === "tap") commit(index, "tap");
              }}
              onKeyDown={(event) => {
                const step =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : 0;
                if (step) {
                  event.preventDefault();
                  const next = (index + step + options.length) % options.length;
                  itemRefs.current[next]?.focus();
                } else if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  itemRefs.current[
                    event.key === "Home" ? 0 : options.length - 1
                  ]?.focus();
                }
              }}
            >
              <span className="reaction-name" aria-hidden="true">
                {label}
              </span>
              <img
                src={`/reactions/${image}.webp`}
                width={56}
                height={56}
                alt=""
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        ref={trigger}
        className={`reaction-trigger${current ? ` has-reaction reaction-${current.image}` : ""}${burst ? " is-burst" : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={
          current
            ? `Your reaction: ${current.label}. Change reaction`
            : "React to this story"
        }
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          endPress();
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* capture is best effort */
          }
          const id = event.pointerId;
          const state = {
            id,
            x: event.clientX,
            y: event.clientY,
            timer: null as number | null,
            opened: false,
          };
          press.current = state;
          state.timer = window.setTimeout(() => {
            state.timer = null;
            state.opened = true;
            setMode("hold");
            setOpen(true);
          }, HOLD_MS);
        }}
        onPointerMove={(event) => {
          const state = press.current;
          if (!state || state.id !== event.pointerId) return;
          if (!state.opened) {
            if (
              Math.hypot(event.clientX - state.x, event.clientY - state.y) >
              MOVE_SLOP
            ) {
              // The finger is going somewhere else, so this was not a hold.
              endPress();
            }
            return;
          }
          setHighlight(hitTest(event.clientX, event.clientY));
        }}
        onPointerUp={(event) => {
          const state = press.current;
          if (!state || state.id !== event.pointerId) return;
          endPress();
          if (state.opened) {
            const index = hitTest(event.clientX, event.clientY);
            if (index !== null) commit(index, "hold");
            else close();
          } else if (open) {
            close();
          } else {
            setMode("tap");
            setOpen(true);
          }
        }}
        onPointerCancel={() => {
          if (!press.current) return;
          const state = endPress();
          if (state?.opened) close();
        }}
        onLostPointerCapture={() => {
          // Capture can end after a normal release; cleanup is idempotent.
          if (press.current?.opened) {
            endPress();
            close();
          } else {
            endPress();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) {
              close();
              return;
            }
            setMode("tap");
            setOpen(true);
            window.requestAnimationFrame(() => {
              const start = options.findIndex(
                (option) => option.label === selected,
              );
              itemRefs.current[start < 0 ? 0 : start]?.focus();
            });
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            setMode("tap");
            setOpen(true);
            window.requestAnimationFrame(() => itemRefs.current[0]?.focus());
          }
        }}
      >
        <span className="reaction-fx" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {current ? (
          <>
            <img
              src={`/reactions/${current.image}.webp`}
              width={32}
              height={32}
              alt=""
              draggable={false}
            />
            <span className="reaction-trigger-label">{current.label}</span>
          </>
        ) : (
          <>
            <span className="reaction-stack" aria-hidden="true">
              {options.map((option) => (
                <img
                  key={option.image}
                  src={`/reactions/${option.image}.webp`}
                  width={22}
                  height={22}
                  alt=""
                  draggable={false}
                />
              ))}
            </span>
            <span className="reaction-trigger-label">How did it land?</span>
          </>
        )}
      </button>
    </div>
  );
}
