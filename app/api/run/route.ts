import { generateEdition } from "@/lib/pipeline";
import { createRun } from "@/lib/store";
import { publicError } from "@/lib/errors";
import { json } from "@/lib/http";
import type { RunRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  // Keep browser-triggered paid API calls same-origin. curl has no Origin header.
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get("host")) return json({ error: { code: "INVALID_ORIGIN", message: "Run editions from the app's own origin." } }, 403);
    } catch { return json({ error: { code: "INVALID_ORIGIN", message: "Invalid Origin header." } }, 403); }
  }
  let run: RunRecord | undefined;
  try {
    run = createRun();
    if (request.headers.get("accept")?.includes("application/x-ndjson")) {
      const record = run;
      let connected = true;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: unknown) => { if (connected) { try { controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n")); } catch { connected = false; } } };
          send({ type: "run", runId: record.id });
          void generateEdition(record, (entry) => send({ type: "log", entry }))
            .then((result) => send({ type: "result", result }))
            .catch((error) => { const safe = publicError(error); send({ type: "error", failure: {
              runId: record.id, error: { code: safe.code, message: safe.message },
              rejectedStories: record.rejectedStories ?? [], stats: record.stats, runLog: record.runLog,
            } }); })
            .finally(() => { if (connected) controller.close(); });
        },
        cancel() { connected = false; },
      });
      return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Run-Id": run.id, "Location": `/api/run/${run.id}` } });
    }
    const result = await generateEdition(run);
    return json(result, 200, { "X-Run-Id": run.id, "Location": `/api/run/${run.id}` });
  } catch (error) {
    const safe = publicError(error);
    return json({
      runId: run?.id,
      error: { code: safe.code, message: safe.message },
      rejectedStories: run?.rejectedStories ?? [],
      stats: run?.stats ?? { candidatesFound: 0, approved: 0, rejected: 0 },
      runLog: run?.runLog ?? [],
    }, safe.status, run ? { "X-Run-Id": run.id, "Location": `/api/run/${run.id}` } : undefined);
  }
}
