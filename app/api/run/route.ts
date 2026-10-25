import { publishDaily } from "@/lib/publication";
import { getConfig } from "@/lib/config";
import { dailyStore, type PublisherLease } from "@/lib/daily-store";
import { editionDay, selectableDay } from "@/lib/daily";
import { createRun, finishRun } from "@/lib/store";
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
      if (new URL(origin).host !== request.headers.get("host"))
        return json(
          {
            error: {
              code: "INVALID_ORIGIN",
              message: "Run editions from the app's own origin.",
            },
          },
          403,
        );
    } catch {
      return json(
        {
          error: { code: "INVALID_ORIGIN", message: "Invalid Origin header." },
        },
        403,
      );
    }
  }
  let run: RunRecord | undefined;
  let release: PublisherLease | undefined;
  const date = new URL(request.url).searchParams.get("date") ?? editionDay();
  if (!selectableDay(date))
    return json(
      {
        error: {
          code: "INVALID_DATE",
          message: "Choose a date within the last ten years, through today.",
        },
      },
      400,
    );
  try {
    const saved = await dailyStore.get(date);
    if (saved) return json(saved, 200, { "X-Edition-Reused": "true" });
    release = await dailyStore.lock();
    const existing = await dailyStore.get(date);
    if (existing) {
      await release();
      return json(existing, 200, { "X-Edition-Reused": "true" });
    }
    try {
      getConfig(date);
    } catch (error) {
      run = createRun(date);
      finishRun(run);
      throw error;
    }
    release.assertOwned?.();
    await dailyStore.admit(date);
    release.assertOwned?.();
    run = createRun(date);
    if (request.headers.get("accept")?.includes("application/x-ndjson")) {
      const record = run;
      let connected = true;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: unknown) => {
            if (connected) {
              try {
                controller.enqueue(
                  new TextEncoder().encode(JSON.stringify(event) + "\n"),
                );
              } catch {
                connected = false;
              }
            }
          };
          send({ type: "run", runId: record.id });
          void publishDaily(
            record,
            date,
            (entry) => send({ type: "log", entry }),
            () => release?.assertOwned?.(),
          )
            .then((result) => send({ type: "result", result }))
            .catch((error) => {
              const safe = publicError(error);
              send({
                type: "error",
                failure: {
                  runId: record.id,
                  error: {
                    code: safe.code,
                    message: safe.message,
                    retryAt: safe.retryAt,
                  },
                  rejectedStories: record.rejectedStories ?? [],
                  stats: record.stats,
                  runLog: record.runLog,
                },
              });
            })
            .finally(async () => {
              await release?.();
              if (connected) controller.close();
            });
        },
        cancel() {
          connected = false;
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
          "X-Run-Id": run.id,
          Location: `/api/run/${run.id}`,
        },
      });
    }
    const result = await publishDaily(run, date, undefined, () =>
      release?.assertOwned?.(),
    );
    await release?.();
    return json(result, 200, {
      "X-Run-Id": run.id,
      Location: `/api/run/${run.id}`,
    });
  } catch (error) {
    await release?.();
    const safe = publicError(error);
    if (
      run?.status === "failed" &&
      request.headers.get("accept")?.includes("application/x-ndjson")
    ) {
      return new Response(
        [
          { type: "run", runId: run.id },
          {
            type: "error",
            failure: {
              runId: run.id,
              error: {
                code: safe.code,
                message: safe.message,
                retryAt: safe.retryAt,
              },
              rejectedStories: [],
              runLog: run.runLog,
            },
          },
        ]
          .map((event) => JSON.stringify(event) + "\n")
          .join(""),
        {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    return json(
      {
        runId: run?.id,
        error: {
          code: safe.code,
          message: safe.message,
          retryAt: safe.retryAt,
        },
        rejectedStories: run?.rejectedStories ?? [],
        stats: run?.stats ?? { candidatesFound: 0, approved: 0, rejected: 0 },
        runLog: run?.runLog ?? [],
      },
      safe.status,
      {
        ...(run ? { "X-Run-Id": run.id, Location: `/api/run/${run.id}` } : {}),
        ...(safe.retryAt
          ? {
              "Retry-After": String(
                Math.max(
                  1,
                  Math.ceil((Date.parse(safe.retryAt) - Date.now()) / 1000),
                ),
              ),
            }
          : {}),
      },
    );
  }
}
