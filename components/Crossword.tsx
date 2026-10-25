"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ApprovedStory } from "@/lib/types";
import { crosswordComplete, type Entry } from "@/lib/crossword";
import { dailyMini, entryCells } from "@/lib/mini";
import { editionDay } from "@/lib/daily";
import Charm from "./Charm";
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
  const gridRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const inviteRef = useRef<HTMLButtonElement>(null);
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
        setDone(crosswordComplete(puzzle, saved.values));
        setAssisted(Boolean(saved.assisted));
      }
    } catch {}
    setReady(true);
  }, [key, puzzle]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(key, JSON.stringify({ values, assisted }));
      } catch {}
  }, [values, assisted, ready, key]);
  const focus = (value: string) => {
    setCell(value);
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-cell="${value}"]`)
      ?.focus({ preventScroll: true });
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
    const next = { ...values, [cell]: letter };
    setValues(next);
    setChecked(false);
    if (crosswordComplete(puzzle, next)) {
      setDone(true);
      return;
    }
    if (position < cells.length - 1) focus(cells[position + 1]);
    else nextClue();
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
  return (
    <section
      ref={sectionRef}
      className="puzzle"
      aria-label="Optional news crossword"
    >
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
            <p>5 × 5 · A few minutes</p>
            <button
              ref={inviteRef}
              className="primary"
              onClick={() => setOpen(true)}
            >
              Play the Mini <span>↗</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mini-heading">
            <div>
              <p className="eyebrow">
                The half full Mini · {demo ? "archive" : date}
              </p>
              <h2 ref={titleRef} tabIndex={-1}>
                {puzzle.title}
              </h2>
            </div>
            <span className="mini-size">5 × 5</span>
          </div>
          <div className="mini-toolbar">
            <button
              disabled={done}
              onClick={() => {
                setChecked(true);
                setDone(crosswordComplete(puzzle, values));
              }}
            >
              Check letters
            </button>
            <button
              disabled={done}
              onClick={() => {
                setAssisted(true);
                const next = {
                  ...values,
                  [cell]: puzzle.grid[Number(cell[0])][Number(cell[2])]!,
                };
                setValues(next);
                setDone(crosswordComplete(puzzle, next));
              }}
            >
              Reveal a letter
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
          {done && (
            <div className="mini-complete" role="status">
              <Charm mood="mint" small />
              <div>
                <h3>Solved.</h3>
                <p>Complete{assisted ? " · assisted" : ""}.</p>
              </div>
            </div>
          )}
          <div className="mini-play">
            <div>
              <div className="selected-clue" aria-live="polite">
                <button aria-label="Previous clue" onClick={() => nextClue(-1)}>
                  ‹
                </button>
                <p>
                  <strong>
                    {selected.number}
                    {selected.direction === "across" ? "A" : "D"}
                  </strong>{" "}
                  {selected.clue}
                </p>
                <button aria-label="Next clue" onClick={() => nextClue()}>
                  ›
                </button>
              </div>
              <div
                className="crossword-grid"
                ref={gridRef}
                role="group"
                aria-label="Mini crossword grid"
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
                        tabIndex={cell === id ? 0 : -1}
                        aria-label={`Row ${r + 1}, column ${c + 1}${start ? `, ${start.number}` : ""}: ${values[id] || "empty"}`}
                        aria-pressed={cell === id}
                        className={`crossword-cell ${entryCells(selected).includes(id) ? "selected" : ""} ${cell === id ? "current" : ""} ${checked && values[id] && values[id] !== letter ? "incorrect" : ""}`}
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
              <div className="mini-keyboard" aria-label="Letter keyboard">
                {["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM⌫"].map((row) => (
                  <div key={row}>
                    {[...row].map((letter) => (
                      <button
                        key={letter}
                        disabled={done}
                        aria-label={letter === "⌫" ? "Delete letter" : letter}
                        onClick={() => type(letter)}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
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
          </div>
          {checked && !done && (
            <p role="status">
              Red letters need another look. Empty squares are still yours to
              solve.
            </p>
          )}
          <details className="note">
            <summary>About this puzzle</summary>
            <p>{puzzle.notice} </p>
          </details>
        </>
      )}
    </section>
  );
}
