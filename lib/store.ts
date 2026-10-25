import "server-only";
import { randomUUID } from "node:crypto";
import { PipelineError } from "./errors";
import type { EditionResult, RunRecord } from "./types";

/** Replace this adapter with durable storage for multiple server instances. */
interface EditionStore {
  runs: Map<string, RunRecord>;
  latest?: EditionResult;
  activeRunId?: string;
}

const globalStore = globalThis as typeof globalThis & {
  usEditionStore?: EditionStore;
};
const store: EditionStore = (globalStore.usEditionStore ??= {
  runs: new Map<string, RunRecord>(),
});

export function createRun(date?: string): RunRecord {
  if (store.activeRunId) {
    throw new PipelineError(
      "RUN_IN_PROGRESS",
      `An edition is already being generated. Check /api/run/${store.activeRunId} for progress.`,
      409,
    );
  }
  const record: RunRecord = {
    date,
    id: randomUUID(),
    status: "running",
    createdAt: new Date().toISOString(),
    runLog: [],
  };
  store.runs.set(record.id, record);
  store.activeRunId = record.id;
  // Bound memory. The latest successful edition is retained separately.
  if (store.runs.size > 30) store.runs.delete(store.runs.keys().next().value!);
  return record;
}

export function finishRun(record: RunRecord, result?: EditionResult) {
  if (result) {
    record.result = result;
    record.status = "completed";
    store.latest = result;
  } else record.status = "failed";
  if (store.activeRunId === record.id) store.activeRunId = undefined;
}

export const getRun = (id: string) => store.runs.get(id);
export const getLatestEdition = () => store.latest;

export const getRunForDate = (date: string) =>
  [...store.runs.values()].reverse().find((run) => run.date === date);
