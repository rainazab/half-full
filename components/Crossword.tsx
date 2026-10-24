"use client";
import { useMemo, useState } from "react";
import type { ApprovedStory } from "@/lib/types";
import { buildCrossword, puzzleWords, crosswordComplete, completeDay, type Entry, type Streak } from "@/lib/crossword";
export default function Crossword({ stories, demo }: { stories: ApprovedStory[]; demo: boolean }) {
  const puzzle = useMemo(() => buildCrossword(puzzleWords(stories)), [stories]);
  const [open, setOpen] = useState(false), [values, setValues] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false), [done, setDone] = useState(false), [days, setDays] = useState(0);
  const [selected, setSelected] = useState<Entry | null>(null);
  if (!puzzle) return <p className="note">No mini puzzle for this edition. Your reading is complete.</p>;
  function check() {
    setChecked(true); if (!puzzle || !crosswordComplete(puzzle, values)) return; setDone(true);
    if (demo) return;
    try { const raw = localStorage.getItem("us-puzzle-days"); const previous = raw ? JSON.parse(raw) as Streak : null;
      const next = completeDay(previous); localStorage.setItem("us-puzzle-days", JSON.stringify(next)); setDays(next.days);
    } catch { /* A blocked device store never blocks completion. */ }
  }
  function focusCell(row: number, col: number) { document.getElementById(`crossword-${row}-${col}`)?.focus(); }
  return <section className="puzzle" aria-label="Optional news crossword"><h3>Want to see what stuck?</h3><p>A small crossword from this edition’s definitions. Entirely optional.</p>
    {!open ? <button onClick={() => { setOpen(true); setSelected(puzzle.entries[0]); }}>Play the mini crossword</button> : <>
      <p className="note">{demo ? "Archived edition puzzle · practice only" : "One puzzle for this edition"}. Choose a clue, then type. Arrow keys move between squares.</p>
      {selected && <p className="selected-clue" aria-live="polite">{selected.number} {selected.direction}: {selected.clue} ({selected.answer.length})</p>}
      <div className="crossword-scroll"><div className="crossword-grid" style={{ gridTemplateColumns: `repeat(${puzzle.grid[0].length}, minmax(28px, 40px))` }} role="group" aria-label="Crossword letter grid">
        {puzzle.grid.flatMap((row, r) => row.map((letter, c) => {
          const key = `${r},${c}`, start = puzzle.entries.find((e) => e.row === r && e.col === c);
          const memberships = puzzle.entries.filter((e) => e.direction === "across" ? e.row === r && c >= e.col && c < e.col + e.answer.length : e.col === c && r >= e.row && r < e.row + e.answer.length);
          return letter ? <label key={key} className={`crossword-cell ${checked && values[key] && values[key] !== letter ? "incorrect" : ""} ${selected && memberships.includes(selected) ? "selected" : ""}`}><span aria-hidden="true">{start?.number}</span>
            <input id={`crossword-${r}-${c}`} aria-label={`Row ${r + 1}, column ${c + 1}; ${memberships.map((e) => `${e.number} ${e.direction}`).join(" and ")}`} aria-invalid={checked && !!values[key] && values[key] !== letter} value={values[key] ?? ""} maxLength={1} autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text" disabled={done}
              onFocus={() => { if (!selected || !memberships.includes(selected)) setSelected(memberships[0]); }}
              onKeyDown={(event) => { const direction = ({ ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] } as Record<string, number[]>)[event.key]; if (direction) { event.preventDefault(); focusCell(r + direction[0], c + direction[1]); } if (event.key === "Backspace" && !values[key] && selected) focusCell(r - (selected.direction === "down" ? 1 : 0), c - (selected.direction === "across" ? 1 : 0)); }}
              onChange={(event) => { const value = event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(-1); setValues((current) => ({ ...current, [key]: value })); setChecked(false); if (value && selected) focusCell(r + (selected.direction === "down" ? 1 : 0), c + (selected.direction === "across" ? 1 : 0)); }} /></label> : <span key={key} className="crossword-block" aria-hidden="true" />;
        }))}</div></div>
      <div className="clue-columns">{(["across", "down"] as const).map((direction) => <div key={direction}><h4>{direction === "across" ? "Across" : "Down"}</h4>{puzzle.entries.filter((e) => e.direction === direction).map((entry) => <button className="clue" key={`${entry.number}-${direction}`} aria-pressed={selected === entry} onClick={() => { setSelected(entry); focusCell(entry.row, entry.col); }}>{entry.number}. {entry.clue} ({entry.answer.length})</button>)}</div>)}</div>
      <div className="buttons"><button onClick={check} disabled={done}>Check answers</button><button onClick={() => setOpen(false)}>Close puzzle</button></div>
      {checked && !done && <p role="status">A few letters are missing or need another look. You can revisit the definitions or leave it here.</p>}
      {done && <p role="status" className="puzzle-success">You got it. {demo ? "Practice complete." : days > 1 ? `${days} consecutive days completed on this device.` : "Today’s puzzle is complete."} That’s the end—go enjoy your day.</p>}
    </>}
  </section>;
}
