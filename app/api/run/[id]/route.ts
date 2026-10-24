import { getRun } from "@/lib/store";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const run = getRun(id);
  return run ? json(run) : json({ error: { code: "RUN_NOT_FOUND", message: "This run is not in this server's memory. Runs expire after a restart or after 30 newer runs." } }, 404);
}
