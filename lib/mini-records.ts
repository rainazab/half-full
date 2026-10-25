/**
 * Personal Mini records stay on the device. There is no leaderboard; the only
 * comparison is against the reader's own earlier solves.
 */
export type MiniSolve = {
  puzzleId: string;
  date: string;
  ms: number;
  assisted: boolean;
  completedAt: string;
};
export type MiniRecords = { solves: MiniSolve[] };
export const RECORDS_KEY = "half-full-mini-records-v1";
export const emptyRecords = (): MiniRecords => ({ solves: [] });
export function cleanRecords(value: unknown): MiniRecords {
  const row = (
    value && typeof value === "object" ? value : {}
  ) as Partial<MiniRecords>;
  const solves = Array.isArray(row.solves)
    ? row.solves
        .filter(
          (solve): solve is MiniSolve =>
            !!solve &&
            typeof solve === "object" &&
            typeof solve.puzzleId === "string" &&
            /^[\w:-]{1,120}$/.test(solve.puzzleId) &&
            typeof solve.date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(solve.date) &&
            typeof solve.ms === "number" &&
            Number.isFinite(solve.ms) &&
            solve.ms >= 0 &&
            typeof solve.assisted === "boolean" &&
            typeof solve.completedAt === "string",
        )
        .slice(-500)
    : [];
  return { solves };
}
export function bestTime(records: MiniRecords, assisted: boolean) {
  const times = records.solves
    .filter((solve) => solve.assisted === assisted)
    .map((solve) => solve.ms);
  return times.length ? Math.min(...times) : null;
}
export type SolveOutcome = {
  records: MiniRecords;
  /** True when this solve is faster than every earlier solve of the same kind. */
  personalBest: boolean;
  /** True when no earlier solve of the same kind exists. */
  first: boolean;
  /** Copy that is only ever shown when the saved records support it. */
  message: string;
};
/** Records a finished puzzle once. A repeated call for the same puzzle changes nothing. */
export function recordSolve(
  records: MiniRecords,
  solve: MiniSolve,
): SolveOutcome {
  const clean = cleanRecords(records);
  const existing = clean.solves.find(
    (item) => item.puzzleId === solve.puzzleId,
  );
  if (existing)
    return {
      records: clean,
      personalBest: false,
      first: false,
      message: existing.assisted ? "Solved with a little help." : "Solved.",
    };
  const previousBest = bestTime(clean, solve.assisted);
  const first = previousBest === null;
  const personalBest = !first && solve.ms < previousBest;
  const next = cleanRecords({ solves: [...clean.solves, solve] });
  return {
    records: next,
    personalBest,
    first,
    message: solve.assisted
      ? first
        ? "Your first Mini, with a little help."
        : personalBest
          ? "Your quickest assisted solve yet!"
          : "Solved with a little help."
      : first
        ? "Your first Mini. Nicely done."
        : personalBest
          ? "Your quickest one yet!"
          : "Solved.",
  };
}
export function solveCount(records: MiniRecords) {
  return records.solves.length;
}
