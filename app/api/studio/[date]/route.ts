import { dailyStore } from "@/lib/daily-store";
import { getRunForDate } from "@/lib/store";
import { selectableDay } from "@/lib/daily";
import { json } from "@/lib/http";
import { publicError } from "@/lib/errors";
import { checkpointSchema } from "@/lib/run-checkpoint";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;
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
    const result = await dailyStore.get(date);
    if (result) return json({ date, status: "completed", result });
    const memory = getRunForDate(date);
    const candidate = memory ?? (await dailyStore.getRun(date));
    const parsed = checkpointSchema.safeParse(candidate);
    const run = parsed.success ? parsed.data : undefined;
    // A saved edition, rather than a completed checkpoint alone, confirms publication.
    const status =
      run?.status === "running"
        ? "running"
        : run?.status === "failed"
          ? "failed"
          : "empty";
    return json({ date, status, run });
  } catch (error) {
    const safe = publicError(error);
    return json(
      { error: { code: safe.code, message: safe.message } },
      safe.status,
    );
  }
}
