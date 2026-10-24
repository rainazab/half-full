import "server-only";
import { dailyStore } from "./daily-store";
import { generateEdition, pipelineDependencies } from "./pipeline";
import { finishRun } from "./store";
import { editionDay } from "./daily";
import type { RunRecord, RunLogEntry } from "./types";
/** Caller owns the distributed lock. Failed attempts never occupy a calendar date. */
export async function publishDaily(
  run: RunRecord,
  date: string,
  onLog?: (entry: RunLogEntry) => void,
) {
  try {
    const result = await generateEdition(run, onLog, {
      ...pipelineDependencies,
      finishRun: () => undefined,
    });
    result.edition.date = date;
    const entry: RunLogEntry = {
      step: "archive.save",
      status: "completed",
      message: `Edition assigned to ${date} (${editionDay() === date ? "today" : "the day generation began"}). Future requests reuse this edition.`,
      timestamp: new Date().toISOString(),
    };
    result.runLog.push(entry);
    onLog?.(entry);
    const published = await dailyStore.publish(result, date);
    finishRun(run, published);
    return published;
  } catch (e) {
    finishRun(run);
    throw e;
  }
}
