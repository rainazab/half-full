/**
 * Elapsed-time model for the Mini. Pure functions keep the clock testable:
 * the component only decides when to start, pause, resume and stop.
 */
export type TimerState = {
  /** Milliseconds accumulated while the clock was not running. */
  elapsedMs: number;
  /** Wall-clock timestamp when the current running span began, or null. */
  runningSince: number | null;
};
export const idleTimer = (): TimerState => ({
  elapsedMs: 0,
  runningSince: null,
});
export function cleanTimer(value: unknown): TimerState {
  const row = (
    value && typeof value === "object" ? value : {}
  ) as Partial<TimerState>;
  const elapsedMs =
    typeof row.elapsedMs === "number" &&
    Number.isFinite(row.elapsedMs) &&
    row.elapsedMs >= 0
      ? Math.min(row.elapsedMs, 24 * 3600000)
      : 0;
  // A persisted running span cannot be trusted after a reload: the tab may have been closed.
  return { elapsedMs, runningSince: null };
}
export function startTimer(state: TimerState, now: number): TimerState {
  return state.runningSince === null ? { ...state, runningSince: now } : state;
}
export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.runningSince === null) return state;
  return {
    elapsedMs: state.elapsedMs + Math.max(0, now - state.runningSince),
    runningSince: null,
  };
}
export function elapsedMs(state: TimerState, now: number) {
  return (
    state.elapsedMs +
    (state.runningSince === null ? 0 : Math.max(0, now - state.runningSince))
  );
}
export function formatClock(ms: number) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60),
    seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
