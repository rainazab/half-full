import { dailyStore } from "@/lib/daily-store";
import { editionDay, selectableDay } from "@/lib/daily";
import { publicError } from "@/lib/errors";
import { json } from "@/lib/http";
import { illustrateEdition } from "@/lib/illustrate";
import { enqueueAutomaticVideo, pollVideo } from "@/lib/video-generation";
import { illustrationStore } from "@/lib/illustration-store";
import { videoStore } from "@/lib/video-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = process.env.VIDEO_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  return !!expected && request.headers.get("authorization") === `Bearer ${expected}`;
}

/** Vercel Cron/operations worker. It repairs missing artwork before submitting
 * first-scene jobs, then polls already persisted Runway tasks. It never waits
 * for provider video completion. A date query can backfill any published day. */
export async function GET(request: Request) {
  if (!authorized(request))
    return json({ error: { code: "UNAUTHORIZED", message: "Worker authentication required." } }, 401);
  const date = new URL(request.url).searchParams.get("date") || editionDay();
  if (!selectableDay(date))
    return json({ error: { code: "INVALID_DATE", message: "Invalid edition date." } }, 400);
  try {
    const edition = await dailyStore.get(date);
    if (!edition) return json({ date, queued: [], polled: [], skipped: [] });
    const missingArtwork = [] as string[];
    for (const story of edition.edition.stories) {
      const storyboard = await illustrationStore.getManifest(date, story.id);
      if (!storyboard?.scenes.some((scene) => scene.status === "ready" && scene.asset))
        missingArtwork.push(story.id);
    }
    let illustration: unknown = null;
    let illustrationError: { code: string; message: string } | undefined;
    if (missingArtwork.length) {
      try {
        illustration = await illustrateEdition(date, { storyIds: missingArtwork });
      } catch (error) {
        const safe = publicError(error);
        illustrationError = { code: safe.code, message: safe.message };
      }
    }
    const queued: string[] = [];
    const polled: string[] = [];
    const skipped: { storyId: string; reason: string }[] = [];
    for (const story of edition.edition.stories) {
      const manifest = await videoStore.getManifest(date, story.id);
      if (manifest?.clips[0]?.taskId) {
        try {
          await pollVideo(date, story.id);
          polled.push(story.id);
        } catch (error) {
          const safe = publicError(error);
          skipped.push({ storyId: story.id, reason: `${safe.code}: ${safe.message}` });
        }
        continue;
      }
      const storyboard = await illustrationStore.getManifest(date, story.id);
      if (!storyboard?.scenes.some((scene) => scene.status === "ready" && scene.asset)) {
        skipped.push({
          storyId: story.id,
          reason: illustrationError
            ? `${illustrationError.code}: ${illustrationError.message}`
            : "No ready approved illustration after backfill.",
        });
        continue;
      }
      const result = await enqueueAutomaticVideo(date, story.id);
      if (result.status === "queued" || result.status === "reused") queued.push(story.id);
      else skipped.push({ storyId: story.id, reason: result.status === "failed" ? `${result.code}: ${result.message}` : result.status });
    }
    return json(
      { date, illustration, queued, polled, skipped },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (error) {
    const safe = publicError(error);
    return json({ error: { code: safe.code, message: safe.message } }, safe.status);
  }
}

export const POST = GET;
