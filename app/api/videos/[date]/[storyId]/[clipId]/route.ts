import { selectableDay } from "@/lib/daily";
import { publicError } from "@/lib/errors";
import { json } from "@/lib/http";
import { videoStore } from "@/lib/video-store";
import { videoResponse } from "@/lib/video";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = {
  params: Promise<{ date: string; storyId: string; clipId: string }>;
};
const missing = () =>
  json(
    {
      error: {
        code: "VIDEO_NOT_FOUND",
        message:
          "This video is unavailable. The illustrated and written story remain available.",
      },
    },
    404,
  );
export async function GET(request: Request, context: Context) {
  const { date, storyId, clipId } = await context.params;
  if (
    !selectableDay(date) ||
    !/^[\w-]{1,150}$/.test(storyId) ||
    !/^clip-[1-3]$/.test(clipId)
  )
    return missing();
  try {
    const manifest = await videoStore.getManifest(date, storyId);
    const clip = manifest?.clips.find(
      (clip) => clip.id === clipId && clip.status === "ready" && clip.asset,
    );
    if (!clip?.asset) return missing();
    const etag = `"${clip.asset.sha256}"`;
    if (
      request.headers.get("if-none-match") === etag &&
      !request.headers.get("range")
    )
      return new Response(null, { status: 304, headers: { ETag: etag } });
    const asset = await videoStore.getAsset(clip.asset.key);
    if (!asset || asset.bytes.length !== clip.asset.bytes) return missing();
    return videoResponse(asset.bytes, request.headers.get("range"), etag);
  } catch (error) {
    const safe = publicError(error);
    return json(
      { error: { code: safe.code, message: safe.message } },
      safe.status,
    );
  }
}
