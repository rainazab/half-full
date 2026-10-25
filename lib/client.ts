import { parseEdition } from "./edition-schema";
import type { EditionResult, RejectedStory, RunLogEntry } from "./types";

export interface RunFailure {
  runId?: string;
  error: { code: string; message: string };
  rejectedStories?: RejectedStory[];
  runLog?: RunLogEntry[];
}
export class LiveRunError extends Error {
  constructor(public failure: RunFailure) {
    super(failure.error.message);
  }
}
export type RunEvent =
  | { type: "run"; runId: string }
  | { type: "log"; entry: RunLogEntry }
  | { type: "result"; result: EditionResult }
  | { type: "error"; failure: RunFailure };

export async function loadDemo(fetcher: typeof fetch = fetch) {
  const response = await fetcher("/demo-edition.json", {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      "The saved demo could not be loaded. Reconnect once to download it.",
    );
  const result = parseEdition(await response.json());
  if (result.edition.mode !== "demo")
    throw new Error("The demo file is not labeled as a fixed edition.");
  return result;
}

export async function runLive(
  onEvent: (event: RunEvent) => void,
  fetcher: typeof fetch = fetch,
  date?: string,
) {
  const response = await fetcher(
    date ? `/api/run?date=${encodeURIComponent(date)}` : "/api/run",
    {
      method: "POST",
      headers: { Accept: "application/x-ndjson" },
      signal: AbortSignal.timeout(295000),
    },
  );
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const body = await response.json();
    if (!response.ok || body.error) throw new LiveRunError(body);
    return parseEdition(body);
  }
  if (!response.body)
    throw new Error("The server returned an empty generation stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let result: EditionResult | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as RunEvent;
    if (event.type === "error") throw new LiveRunError(event.failure);
    if (event.type === "result") result = parseEdition(event.result);
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        consume(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
      }
      if (done) {
        consume(pending);
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!result)
    throw new Error(
      "The connection ended before generation completed. Check the run log or reload the latest edition before retrying.",
    );
  return result;
}
