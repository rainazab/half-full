import { dailyStore } from "@/lib/daily-store";
import { selectableDay } from "@/lib/daily";
import { publicError } from "@/lib/errors";
import { json } from "@/lib/http";
import { videoStore } from "@/lib/video-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Read-only. Opening a story neither submits nor polls a paid provider task. */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
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
    const edition = await dailyStore.get(date);
    const entries = await Promise.all(
      (edition?.edition.stories ?? []).map(
        async (story) =>
          [story.id, await videoStore.getManifest(date, story.id)] as const,
      ),
    );
    const planEntries = await Promise.all(
      (edition?.edition.stories ?? []).map(
        async (story) =>
          [story.id, await videoStore.getPlan(date, story.id)] as const,
      ),
    );
    return json(
      {
        date,
        videos: Object.fromEntries(
          entries.filter(
            ([, manifest]) =>
              manifest && manifest.editionId === edition?.edition.id,
          ),
        ),
        plans: Object.fromEntries(
          planEntries.filter(
            ([, plan]) => plan && plan.editionId === edition?.edition.id,
          ),
        ),
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (error) {
    const safe = publicError(error);
    return json(
      { error: { code: safe.code, message: safe.message } },
      safe.status,
    );
  }
}
