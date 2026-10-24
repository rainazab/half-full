import { dailyStore } from "@/lib/daily-store";
import { editionDay } from "@/lib/daily";
import { json } from "@/lib/http";
import { publicError } from "@/lib/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const date = editionDay();
    const result = await dailyStore.get(date);
    return result
      ? json(result)
      : json(
          {
            date,
            error: {
              code: "NO_EDITION",
              message:
                "Today’s edition has not been published. POST /api/run prepares it once; earlier editions are in /api/editions.",
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
