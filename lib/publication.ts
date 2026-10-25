import "server-only";
import { dailyStore } from "./daily-store";
import { generateEdition, pipelineDependencies } from "./pipeline";
import { finishRun } from "./store";
import { publicError } from "./errors";
import { editionDay } from "./daily";
import type { RunRecord, RunLogEntry } from "./types";
/** Caller owns the distributed lock. Failed attempts never occupy a calendar date. */
export async function publishDaily(
  run: RunRecord,
  date: string,
  onLog?: (entry: RunLogEntry) => void,
) {
  run.date = date;
  let lastCheckpoint = 0;
  let writes = Promise.resolve();
  let trailing: ReturnType<typeof setTimeout> | undefined;
  function checkpoint(force = false) {
    if (!force && Date.now() - lastCheckpoint < 1500) {
      if (!trailing)
        trailing = setTimeout(
          () => checkpoint(true),
          1500 - (Date.now() - lastCheckpoint),
        );
      return;
    }
    if (trailing) clearTimeout(trailing);
    trailing = undefined;
    lastCheckpoint = Date.now();
    const { result: _result, ...record } = run;
    const snapshot = structuredClone(record);
    writes = writes
      .then(() => dailyStore.saveRun(snapshot))
      .catch(() => {
        console.warn("Generation checkpoint unavailable.");
      });
  }
  checkpoint(true);
  try {
    const result = await generateEdition(
      run,
      (entry) => {
        onLog?.(entry);
        checkpoint();
      },
      {
        ...pipelineDependencies,
        finishRun: () => undefined,
        getConfig: () => pipelineDependencies.getConfig(date),
      },
    );
    result.edition.date = date;
    const entry: RunLogEntry = {
      step: "archive.save",
      status: "completed",
      message: `Edition assigned to ${date} (${editionDay() === date ? "today" : "the selected day"}). Future requests reuse this edition.`,
      timestamp: new Date().toISOString(),
    };
    result.runLog.push(entry);
    onLog?.(entry);
    const published = await dailyStore.publish(result, date);
    finishRun(run, published);
    checkpoint(true);
    await writes;
    return published;
  } catch (e) {
    finishRun(run);
    const safe = publicError(e);
    run.error = { code: safe.code, message: safe.message };
    checkpoint(true);
    await writes;
    throw e;
  }
}
