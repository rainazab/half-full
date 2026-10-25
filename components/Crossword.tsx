"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { miniInputLetter } from "@/lib/mini-input";
import type { ApprovedStory } from "@/lib/types";
import { crosswordComplete, type Entry } from "@/lib/crossword";
import { dailyMini, entryCells } from "@/lib/mini";
import { editionDay, dateLabel } from "@/lib/daily";
import DitheredAtmosphere from "./DitheredAtmosphere";
import Icon from "./Icon";
import {
  cleanTimer,
  elapsedMs,
  formatClock,
  idleTimer,
  pauseTimer,
  startTimer,
  type TimerState,
} from "@/lib/mini-timer";
import {
  cleanRecords,
  emptyRecords,
  recordSolve,
  RECORDS_KEY,
} from "@/lib/mini-records";
import MiniCelebration from "./MiniCelebration";

type Completed = {
  ms: number | null;
  message: string;
  personalBest: boolean;
  first: boolean;
  completedAt: string;
};
function readRecords() {
  try {
    return cleanRecords(
      JSON.parse(localStorage.getItem(RECORDS_KEY) ?? "null"),
    );
  } catch {
    return emptyRecords();
  }
}
const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function Crossword({
  stories,
  demo,
  date = editionDay(),
  initialOpen = false,
}: {
  stories: ApprovedStory[];
  demo: boolean;
  date?: string;
  initialOpen?: boolean;
}) {
  const puzzle = useMemo(() => dailyMini(stories, date), [stories, date]);
  const [open, setOpen] = useState(initialOpen),
    [values, setValues] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Entry>(puzzle.entries[0]),
    [cell, setCell] = useState(entryCells(puzzle.entries[0])[0]);
  const [checked, setChecked] = useState(false),
    [done, setDone] = useState(false),
    [assisted, setAssisted] = useState(false),
    [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [timer, setTimer] = useState<TimerState>(idleTimer);
  const timerRef = useRef(timer);
  const [, tick] = useState(0);
  const [finalCell, setFinalCell] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const inviteRef = useRef<HTMLButtonElement>(null);
  const started = timer.elapsedMs > 0 || timer.runningSince !== null;
  const commitTimer = useCallback((next: TimerState) => {
    timerRef.current = next;
    setTimer(next);
  }, []);
  useEffect(() => {
    if (open) {
      titleRef.current?.focus({ preventScroll: true });
      sectionRef.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    }
  }, [open]);
  const ordered = [
    ...puzzle.entries.filter((e) => e.direction === "across"),
    ...puzzle.entries.filter((e) => e.direction === "down"),
  ];
  const key = `us-mini-${demo ? "practice" : "live"}-${puzzle.id}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved?.values) {
        setValues(saved.values);
        const solved = crosswordComplete(puzzle, saved.values);
        setDone(solved);
        setAssisted(Boolean(saved.assisted));
        const restoredTimer = cleanTimer(saved.timer);
        commitTimer(restoredTimer);
        if (solved)
          setCompleted(
            saved.completed && typeof saved.completed === "object"
              ? {
                  ms:
                    typeof saved.completed.ms === "number"
                      ? saved.completed.ms
                      : null,
                  message:
                    typeof saved.completed.message === "string"
                      ? saved.completed.message
                      : "Solved.",
                  personalBest: saved.completed.personalBest === true,
                  first: saved.completed.first === true,
                  completedAt: String(saved.completed.completedAt ?? ""),
                }
              : // Solved before times were recorded: never invent one.
                {
                  ms: null,
                  message: saved.assisted
                    ? "Solved with a little help."
                    : "Solved.",
                  personalBest: false,
                  first: false,
                  completedAt: "",
                },
          );
      }
    } catch {}
    setReady(true);
  }, [key, puzzle, commitTimer]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            values,
            assisted,
            timer: { elapsedMs: pauseTimer(timer, Date.now()).elapsedMs },
            completed,
          }),
        );
      } catch {}
  }, [values, assisted, ready, key, timer, completed]);
  // The clock runs only while the puzzle is open, unfinished, started and visible.
  useEffect(() => {
    if (!open || done || !started) return;
    const resume = () => {
      if (document.visibilityState === "visible")
        commitTimer(startTimer(timerRef.current, Date.now()));
      else commitTimer(pauseTimer(timerRef.current, Date.now()));
    };
    resume();
    document.addEventListener("visibilitychange", resume);
    const interval = window.setInterval(() => tick((n) => n + 1), 500);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.clearInterval(interval);
      commitTimer(pauseTimer(timerRef.current, Date.now()));
    };
  }, [open, done, started, commitTimer]);
  const focus = (value: string) => {
    setCell(value);
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.setSelectionRange(0, 1);
  };
  function choose(entry: Entry) {
    setSelected(entry);
    focus(entryCells(entry).find((c) => !values[c]) ?? entryCells(entry)[0]);
    const grid = gridRef.current;
    if (grid) {
      const bounds = grid.getBoundingClientRect();
      if (bounds.top < 80 || bounds.bottom > window.innerHeight - 100)
        grid.previousElementSibling?.scrollIntoView({
          block: "start",
          behavior: "instant",
        });
    }
  }
  function nextClue(delta = 1) {
    choose(
      ordered[
        (ordered.indexOf(selected) + delta + ordered.length) % ordered.length
      ],
    );
  }
  function beginIfNeeded() {
    if (timerRef.current.runningSince === null && !done)
      commitTimer(startTimer(timerRef.current, Date.now()));
  }
  /** Runs exactly once per puzzle: the done flag and the records both guard repeats. */
  function finish(
    next: Record<string, string>,
    via: string,
    wasAssisted: boolean,
  ) {
    if (done) return;
    const now = Date.now();
    const paused = pauseTimer(timerRef.current, now);
    commitTimer(paused);
    const outcome = recordSolve(readRecords(), {
      puzzleId: `${demo ? "practice" : "live"}:${puzzle.id}`,
      date,
      ms: paused.elapsedMs,
      assisted: wasAssisted,
      completedAt: new Date(now).toISOString(),
    });
    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(outcome.records));
    } catch {}
    setCompleted({
      ms: paused.elapsedMs,
      message: outcome.message,
      personalBest: outcome.personalBest,
      first: outcome.first,
      completedAt: new Date(now).toISOString(),
    });
    setValues(next);
    inputRef.current?.blur();
    setDone(true);
    setChecked(false);
    setFinalCell(via);
    setFlash(true);
    window.setTimeout(() => setCelebrate(true), reducedMotion() ? 0 : 720);
  }
  function type(letter: string) {
    if (done) return;
    const cells = entryCells(selected),
      position = cells.indexOf(cell);
    if (letter === "⌫") {
      const target = values[cell] ? cell : cells[Math.max(0, position - 1)];
      setValues((old) => ({ ...old, [target]: "" }));
      focus(target);
      setChecked(false);
      return;
    }
    if (!/^[A-Z]$/.test(letter)) return;
    beginIfNeeded();
    const next = { ...values, [cell]: letter };
    setChecked(false);
    if (crosswordComplete(puzzle, next)) {
      finish(next, cell, assisted);
      return;
    }
    setValues(next);
    if (position < cells.length - 1) focus(cells[position + 1]);
    else nextClue();
  }
  function reveal() {
    if (done) return;
    beginIfNeeded();
    setAssisted(true);
    const next = {
      ...values,
      [cell]: puzzle.grid[Number(cell[0])][Number(cell[2])]!,
    };
    if (crosswordComplete(puzzle, next)) finish(next, cell, true);
    else setValues(next);
  }
  function cellClick(value: string) {
    const members = puzzle.entries.filter((e) => entryCells(e).includes(value));
    setSelected(
      members.find(
        (e) =>
          e.direction ===
          (value === cell
            ? selected.direction === "across"
              ? "down"
              : "across"
            : selected.direction),
      ) ?? members[0],
    );
    focus(value);
  }
  const shownMs = done ? (completed?.ms ?? null) : elapsedMs(timer, Date.now());
  return (
    <section
      ref={sectionRef}
      className={`library-screen puzzle mini-experience${done ? " is-solved" : ""}`}
      aria-label="Optional news crossword"
    >
      <DitheredAtmosphere tone="butter" intensity={0.16} />
      {!open ? (
        <div className="mini-invite">
          <div className="mini-icon" aria-hidden="true">
            {puzzle.grid.flat().map((l, i) => (
              <i key={i} className={!l ? "block" : ""} />
            ))}
          </div>
          <div>
            <p className="eyebrow">Take a break</p>
            <h3>The Mini</h3>
            <p>A little brain break.</p>
            <button
              ref={inviteRef}
              className="primary"
              onClick={() => setOpen(true)}
            >
              {done ? "See your solved Mini" : "Play the Mini"} <span>↗</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mini-game-header">
            <div>
              <p className="eyebrow">
                {demo
                  ? "Practice edition"
                  : dateLabel(date, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                · A little brain break
              </p>
              <h2 ref={titleRef} tabIndex={-1}>
                The Mini
              </h2>
              <p className="mini-puzzle-name">{puzzle.title}</p>
              {done && completed && (
                <p className="mini-solved-line" role="status">
                  Solved{assisted ? " with help" : ""} · {completed.message}
                </p>
              )}
            </div>
            <div
              className={`mini-timer${done ? " done" : started ? " running" : ""}`}
              aria-hidden={!done}
              aria-label={
                done && shownMs !== null
                  ? `Solved in ${formatClock(shownMs)}`
                  : undefined
              }
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                width="16"
                height="16"
              >
                <circle
                  cx="12"
                  cy="13"
                  r="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M12 9v4l2.5 2M9 3h6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              <span>{shownMs === null ? "—" : formatClock(shownMs)}</span>
            </div>
          </div>

          <div className="mini-play">
            <div className="mini-board">
              <div className="selected-clue" aria-live="polite">
                <button aria-label="Previous clue" onClick={() => nextClue(-1)}>
                  <Icon name="back" size={16} />
                </button>
                <p>
                  <strong>
                    {selected.number}
                    {selected.direction === "across" ? "A" : "D"}
                  </strong>{" "}
                  {selected.clue}
                </p>
                <button aria-label="Next clue" onClick={() => nextClue()}>
                  <Icon name="next" size={16} />
                </button>
              </div>
              <div
                className={`crossword-grid${flash ? " solved-flash" : ""}${done ? " solved" : ""}`}
                ref={gridRef}
                role="group"
                aria-label="Mini crossword grid"
                onAnimationEnd={(event) => {
                  if (event.target === gridRef.current) setFlash(false);
                }}
                onKeyDown={(event) => {
                  if (event.ctrlKey || event.metaKey || event.altKey) return;
                  if (
                    /^[a-zA-Z]$/.test(event.key) ||
                    event.key === "Backspace"
                  ) {
                    event.preventDefault();
                    type(
                      event.key === "Backspace" ? "⌫" : event.key.toUpperCase(),
                    );
                  }
                  if (event.key === " ") {
                    event.preventDefault();
                    cellClick(cell);
                  }
                  const delta = (
                    {
                      ArrowRight: [0, 1],
                      ArrowLeft: [0, -1],
                      ArrowDown: [1, 0],
                      ArrowUp: [-1, 0],
                    } as Record<string, number[]>
                  )[event.key];
                  if (delta) {
                    event.preventDefault();
                    const [r, c] = cell.split(",").map(Number);
                    const target = `${r + delta[0]},${c + delta[1]}`;
                    if (puzzle.grid[r + delta[0]]?.[c + delta[1]]) {
                      setSelected(
                        puzzle.entries.find(
                          (e) =>
                            e.direction === (delta[0] ? "down" : "across") &&
                            entryCells(e).includes(target),
                        )!,
                      );
                      focus(target);
                    }
                  }
                }}
              >
                {!done && (
                  <input
                    ref={inputRef}
                    className="mini-cell-input"
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label={`Letter for row ${Number(cell.split(",")[0]) + 1}, column ${Number(cell.split(",")[1]) + 1}. ${selected.number} ${selected.direction}: ${selected.clue}`}
                    aria-describedby="mini-input-help"
                    value=" "
                    placeholder={values[cell] || ""}
                    style={{
                      left: `${Number(cell.split(",")[1]) * 20}%`,
                      top: `${Number(cell.split(",")[0]) * 20}%`,
                    }}
                    onFocus={(event) =>
                      event.currentTarget.setSelectionRange(0, 1)
                    }
                    onClick={() => cellClick(cell)}
                    onChange={(event) => {
                      const text = event.currentTarget.value;
                      const letter = miniInputLetter(text);
                      if (letter) type(letter);
                      else if (text === "") type("⌫");
                      event.currentTarget.value = " ";
                      event.currentTarget.setSelectionRange(0, 1);
                    }}
                    onBeforeInput={(event) => {
                      if (
                        (event.nativeEvent as InputEvent).inputType ===
                        "deleteContentBackward"
                      ) {
                        event.preventDefault();
                        type("⌫");
                      }
                    }}
                  />
                )}
                {puzzle.grid.flatMap((row, r) =>
                  row.map((letter, c) => {
                    const id = `${r},${c}`,
                      start = puzzle.entries.find(
                        (e) => e.row === r && e.col === c,
                      );
                    return letter ? (
                      <button
                        key={id}
                        data-cell={id}
                        tabIndex={done && cell === id ? 0 : -1}
                        aria-label={`Row ${r + 1}, column ${c + 1}${start ? `, ${start.number}` : ""}: ${values[id] || "empty"}`}
                        aria-pressed={cell === id}
                        className={`crossword-cell ${entryCells(selected).includes(id) ? "selected" : ""} ${cell === id ? "current" : ""} ${checked && values[id] && values[id] !== letter ? "incorrect" : ""} ${finalCell === id ? "settle" : ""}`}
                        onClick={() => cellClick(id)}
                      >
                        <small>{start?.number}</small>
                        {values[id] || ""}
                      </button>
                    ) : (
                      <span
                        key={id}
                        className="crossword-block"
                        aria-hidden="true"
                      />
                    );
                  }),
                )}
              </div>
              <p id="mini-input-help" className="mini-input-help">
                Tap a square to type. Tap it again to switch direction.
              </p>
              <div className="mini-assists">
                <button
                  disabled={done}
                  onClick={() => {
                    setAssisted(true);
                    setChecked(true);
                  }}
                >
                  Check
                </button>
                <button disabled={done} onClick={reveal}>
                  Reveal letter
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    requestAnimationFrame(() => inviteRef.current?.focus());
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <details className="mini-clue-library">
              <summary>All clues</summary>
              <div className="clue-columns">
                {(["across", "down"] as const).map((direction) => (
                  <div key={direction}>
                    <h3>{direction === "across" ? "Across" : "Down"}</h3>
                    {ordered
                      .filter((e) => e.direction === direction)
                      .map((entry) => (
                        <button
                          className={`clue ${selected === entry ? "active" : ""}`}
                          key={`${entry.number}${direction}`}
                          aria-pressed={selected === entry}
                          onClick={() => choose(entry)}
                        >
                          <strong>{entry.number}</strong>
                          <span>{entry.clue}</span>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </details>
          </div>
          {checked && !done && (
            <p role="status" className="mini-check-note">
              Red letters need another look. Empty squares are still yours to
              solve.
            </p>
          )}
          <details className="note">
            <summary>About this puzzle</summary>
            <p>{puzzle.notice} </p>
          </details>
          <MiniCelebration
            open={celebrate}
            ms={completed?.ms ?? null}
            message={completed?.message ?? "Solved."}
            personalBest={completed?.personalBest ?? false}
            onClose={() => setCelebrate(false)}
          />
        </>
      )}
    </section>
  );
}
