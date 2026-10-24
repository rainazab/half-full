import { getLatestEdition } from "@/lib/store";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const result = getLatestEdition();
  return result ? json(result) : json({ error: { code: "NO_EDITION", message: "No edition has been generated yet. POST /api/run to create one." } }, 404);
}
