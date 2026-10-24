import type { ApprovedStory } from "./types";
export type PuzzleWord = { answer: string; clue: string; storyId: string };
export type Entry = PuzzleWord & { row: number; col: number; direction: "across" | "down"; number: number };
export type Puzzle = { grid: (string | null)[][]; entries: Entry[] };
const cells = (entry: Omit<Entry, "number">) => [...entry.answer].map((letter, i) => ({ letter, row: entry.row + (entry.direction === "down" ? i : 0), col: entry.col + (entry.direction === "across" ? i : 0) }));
export function puzzleWords(stories: ApprovedStory[]): PuzzleWord[] {
  return stories.flatMap((story) => (story.experience?.glossary ?? []).map((g) => ({ answer: g.term.toUpperCase().replace(/[ -]/g, ""), clue: g.text, storyId: story.id }))).filter((word) => /^[A-Z]{3,12}$/.test(word.answer));
}
/** Greedy connected layout; no model-generated coordinates, accidental adjacent words or unchecked intersections. */
export function buildCrossword(words: PuzzleWord[]): Puzzle | null {
  const pool = [...new Map(words.filter((w) => /^[A-Z]{3,12}$/.test(w.answer) && w.clue.trim()).map((w) => [w.answer, w])).values()].sort((a, b) => b.answer.length - a.answer.length || a.answer.localeCompare(b.answer)).slice(0, 15);
  if (pool.length < 3) return null;
  let best: Puzzle | null = null;
  for (const seed of pool) {
    const grid: (string | null)[][] = Array.from({ length: 25 }, () => Array(25).fill(null));
    const placed: Omit<Entry, "number">[] = [];
    const put = (entry: Omit<Entry, "number">) => { placed.push(entry); cells(entry).forEach(({ row, col, letter }) => { grid[row][col] = letter; }); };
    put({ ...seed, row: 12, col: Math.floor((25 - seed.answer.length) / 2), direction: "across" });
    function canPut(entry: Omit<Entry, "number">) {
      const dr = entry.direction === "down" ? 1 : 0, dc = 1 - dr;
      const get = (r: number, c: number) => grid[r]?.[c];
      if (get(entry.row - dr, entry.col - dc) || get(entry.row + dr * entry.answer.length, entry.col + dc * entry.answer.length)) return false;
      let intersections = 0;
      for (const { row, col, letter } of cells(entry)) {
        if (row < 0 || col < 0 || row >= 25 || col >= 25) return false;
        if (grid[row][col]) {
          if (grid[row][col] !== letter || placed.some((e) => e.direction === entry.direction && cells(e).some((c) => c.row === row && c.col === col))) return false;
          intersections++;
        } else if (get(row - dc, col - dr) || get(row + dc, col + dr)) return false;
      }
      return intersections > 0;
    }
    for (let pass = 0; pass < 2; pass++) for (const word of pool) {
      if (placed.length >= 5 || placed.some((p) => p.answer === word.answer)) continue;
      const options: Omit<Entry, "number">[] = [];
      for (const other of placed) for (const cell of cells(other)) for (let index = 0; index < word.answer.length; index++) {
        if (cell.letter !== word.answer[index]) continue;
        const direction = other.direction === "across" ? "down" : "across";
        const entry = { ...word, direction: direction as Entry["direction"], row: cell.row - (direction === "down" ? index : 0), col: cell.col - (direction === "across" ? index : 0) };
        if (canPut(entry)) options.push(entry);
      }
      // Prefer a compact bounding rectangle.
      options.sort((a, b) => area([...placed, a]) - area([...placed, b])); if (options[0]) put(options[0]);
    }
    const all = placed.flatMap(cells), minR = Math.min(...all.map((c) => c.row)), maxR = Math.max(...all.map((c) => c.row)), minC = Math.min(...all.map((c) => c.col)), maxC = Math.max(...all.map((c) => c.col));
    const entries = placed.map((p) => ({ ...p, row: p.row - minR, col: p.col - minC, number: 0 })).sort((a, b) => a.row - b.row || a.col - b.col);
    let number = 0; entries.forEach((e, i) => { if (!i || e.row !== entries[i - 1].row || e.col !== entries[i - 1].col) number++; e.number = number; });
    const puzzle = { grid: grid.slice(minR, maxR + 1).map((r) => r.slice(minC, maxC + 1)), entries };
    if (entries.length >= 3 && puzzle.grid.length <= 15 && puzzle.grid[0].length <= 15 && validateCrossword(puzzle) && (!best || entries.length > best.entries.length || entries.length === best.entries.length && area(entries) < area(best.entries))) best = puzzle;
  }
  return best;
}
function area(entries: Omit<Entry, "number">[]) { const all = entries.flatMap(cells); return (Math.max(...all.map((c) => c.row)) - Math.min(...all.map((c) => c.row)) + 1) * (Math.max(...all.map((c) => c.col)) - Math.min(...all.map((c) => c.col)) + 1); }
export function validateCrossword(puzzle: Puzzle) {
  const { grid, entries } = puzzle;
  if (!grid.length || !grid[0].length || grid.some((r) => r.length !== grid[0].length) || entries.length < 3) return false;
  if (new Set(entries.map((e) => e.answer)).size !== entries.length) return false;
  const occupied = new Map<string, Entry[]>();
  for (const entry of entries) for (const cell of cells(entry)) {
    if (grid[cell.row]?.[cell.col] !== cell.letter) return false;
    const key = `${cell.row},${cell.col}`, prior = occupied.get(key) ?? [];
    if (prior.some((p) => p.direction === entry.direction)) return false;
    occupied.set(key, [...prior, entry]);
  }
  const starts = [...new Set(entries.map((e) => `${e.row},${e.col}`))].sort((a, b) => { const [ar, ac] = a.split(",").map(Number), [br, bc] = b.split(",").map(Number); return ar - br || ac - bc; });
  if (entries.some((e) => e.number !== starts.indexOf(`${e.row},${e.col}`) + 1)) return false;
  for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[0].length; c++) {
    if (!grid[r][c]) continue;
    if (!occupied.has(`${r},${c}`)) return false;
    for (const direction of ["across", "down"] as const) {
      const dr = direction === "down" ? 1 : 0, dc = 1 - dr;
      if (grid[r - dr]?.[c - dc] || !grid[r + dr]?.[c + dc]) continue;
      let length = 0; while (grid[r + dr * length]?.[c + dc * length]) length++;
      if (!entries.some((e) => e.row === r && e.col === c && e.direction === direction && e.answer.length === length)) return false;
    }
  }
  const connected = new Set<Entry>([entries[0]]);
  for (let i = 0; i < entries.length; i++) for (const shared of occupied.values()) if (shared.some((e) => connected.has(e))) shared.forEach((e) => connected.add(e));
  return connected.size === entries.length;
}
export function crosswordComplete(puzzle: Puzzle, values: Record<string, string>) { return puzzle.grid.every((row, r) => row.every((letter, c) => !letter || values[`${r},${c}`]?.toUpperCase() === letter)); }
export type Streak = { lastDay: string; days: number };
export function completeDay(previous: Streak | null, day = new Date().toISOString().slice(0, 10)): Streak {
  if (previous?.lastDay === day) return previous;
  const yesterday = new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return { lastDay: day, days: previous?.lastDay === yesterday && Number.isInteger(previous.days) && previous.days > 0 ? previous.days + 1 : 1 };
}
