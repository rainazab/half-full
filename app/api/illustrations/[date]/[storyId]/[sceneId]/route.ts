import { illustrationStore, IllustrationStore } from "@/lib/illustration-store";
import { selectableDay } from "@/lib/daily";
import { json } from "@/lib/http";
import { publicError } from "@/lib/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = {
  params: Promise<{ date: string; storyId: string; sceneId: string }>;
};
/** Serves one stored illustration. Assets are immutable per prompt hash. */
export async function GET(request: Request, context: Context) {
  const { date, storyId, sceneId } = await context.params;
  if (
    !selectableDay(date) ||
    !/^[\w-]{1,150}$/.test(storyId) ||
    !/^scene-[1-3]$/.test(sceneId)
  )
    return json(
      { error: { code: "NOT_FOUND", message: "No such illustration." } },
      404,
    );
  try {
    const manifest = await illustrationStore.getManifest(date, storyId);
    const scene = manifest?.scenes.find((s) => s.id === sceneId);
    if (!scene?.asset || scene.status !== "ready")
      return json(
        { error: { code: "NOT_FOUND", message: "No such illustration." } },
        404,
      );
    const etag = `"${scene.asset.promptHash.slice(0, 32)}"`;
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers: { ETag: etag } });
    const asset = await illustrationStore.getAsset(
      IllustrationStore.assetKey(date, storyId, sceneId),
      scene.asset.promptHash,
    );
    if (!asset)
      return json(
        {
          error: {
            code: "NOT_FOUND",
            message: "The illustration asset is missing.",
          },
        },
        404,
      );
    return new Response(asset.bytes.slice().buffer, {
      headers: {
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.bytes.length),
        "Cache-Control": "public, max-age=86400",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const safe = publicError(error);
    return json(
      { error: { code: safe.code, message: safe.message } },
      safe.status,
    );
  }
}
