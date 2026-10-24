import { dailyStore } from "@/lib/daily-store";
import { json } from "@/lib/http";
import { publicError } from "@/lib/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  try {
    const result = await dailyStore.get((await params).date);
    return result
      ? json(result)
      : json(
          {
            error: {
              code: "NO_EDITION",
              message: "No edition is saved for this date.",
            },
          },
          404,
        );
  } catch (e) {
    const safe = publicError(e);
    return json(
      { error: { code: safe.code, message: safe.message } },
      safe.status,
    );
  }
}
