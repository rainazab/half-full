import { dailyStore } from "@/lib/daily-store";
import { json } from "@/lib/http";
import { publicError } from "@/lib/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json(await dailyStore.list());
  } catch (e) {
    const safe = publicError(e);
    return json(
      { error: { code: safe.code, message: safe.message } },
      safe.status,
    );
  }
}
