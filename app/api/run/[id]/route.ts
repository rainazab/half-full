import { dailyStore } from "@/lib/daily-store";
import { publicError } from "@/lib/errors";
import { getRun } from "@/lib/store";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let run = getRun(id);
  if (!run)
    try {
      const result = await dailyStore.byId(id);
      if (result)
        run = {
          id,
          status: "completed",
          createdAt: result.edition.createdAt,
          runLog: result.runLog,
          result,
        };
    } catch (e) {
      const safe = publicError(e);
      return json(
        { error: { code: safe.code, message: safe.message } },
        safe.status,
      );
    }
  return run
    ? json(run)
    : json(
        {
          error: {
            code: "RUN_NOT_FOUND",
            message:
              "This run is not in this server's memory. Runs expire after a restart or after 30 newer runs.",
          },
        },
        404,
      );
}
