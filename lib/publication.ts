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
  assertLease?: () => void,
) {
  run.date = date;
  let lastCheckpoint = 0;
  let writer: Promise<void> | undefined;
  let pending: Omit<RunRecord, "result"> | undefined;
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
    pending = snapshot;
    if (!writer)
      writer = (async () => {
        while (pending) {
          const next = pending;
          pending = undefined;
          try {
            await dailyStore.saveRun(next);
          } catch {
            console.warn("Generation checkpoint unavailable.");
          }
        }
      })().finally(() => {
        writer = undefined;
        if (pending) checkpoint(true);
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
      status: "started",
      message: `Saving the edition for ${date}. Publication is confirmed only when the saved record is available.`,
      timestamp: new Date().toISOString(),
    };
    result.runLog.push(entry);
    onLog?.(entry);
    assertLease?.();
    const published = await dailyStore.publish(result, date);
    finishRun(run, published);
    checkpoint(true);
    while (writer || pending) {
      if (!writer) checkpoint(true);
      await writer;
    }
    return published;
  } catch (e) {
    finishRun(run);
    const safe = publicError(e);
    run.error = { code: safe.code, message: safe.message };
    checkpoint(true);
    while (writer || pending) {
      if (!writer) checkpoint(true);
      await writer;
    }
    throw e;
  }
}
