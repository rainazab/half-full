import { getLatestEdition, getRun } from "@/lib/store";
import { audioCache, audioKey, audioResponse } from "@/lib/audio-cache";
import { cartesiaConfig, synthesize } from "@/lib/cartesia";
import { narrationFor, hasNarrationEvidence } from "@/lib/narration";
import { PipelineError, publicError } from "@/lib/errors";
import { json } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;
type Context = { params: Promise<{ editionId: string; storyId: string }> };
async function resolve(context: Context) {
  const { editionId, storyId } = await context.params;
  const latest = getLatestEdition();
  const edition = latest?.edition.id === editionId ? latest : getRun(editionId)?.result;
  const story = edition?.edition.stories.find((story) => story.id === storyId);
  if (!story) throw new PipelineError("AUDIO_STORY_NOT_FOUND", "This story is no longer in server memory. Open the latest edition or the saved demo.", 404);
  if (!hasNarrationEvidence(story)) throw new PipelineError("AUDIO_EVIDENCE_MISSING", "This older story has no retained narration evidence. Its written version remains available.", 422);
  const config = cartesiaConfig(); const narration = narrationFor(story);
  return { config, narration, key: audioKey(narration.script, config.voice, config.model), editionId, storyId };
}
export async function POST(request: Request, context: Context) {
  const origin = request.headers.get("origin");
  if (origin) { try { if (new URL(origin).host !== request.headers.get("host")) return json({ error: { code: "INVALID_ORIGIN", message: "Prepare audio from US itself." } }, 403); } catch { return json({error:{code:"INVALID_ORIGIN",message:"Invalid origin."}},403); } }
  try {
    const { config, narration, key, editionId, storyId } = await resolve(context);
    const cached = !!audioCache.get(key);
    await audioCache.prepare(key, () => synthesize(narration.script, config));
    return json({ url: `/api/audio/${encodeURIComponent(editionId)}/${encodeURIComponent(storyId)}`, cached, provider: "Cartesia", script: narration.script });
  } catch (error) { const safe = publicError(error); return json({ error: { code: safe.code, message: safe.message } }, safe.status); }
}
export async function GET(request: Request, context: Context) {
  try { const { key } = await resolve(context); const entry = audioCache.get(key);
    if (!entry) throw new PipelineError("AUDIO_NOT_READY", "Prepare this clip with POST before playback, or prepare it again after a server restart.", 404);
    return audioResponse(entry.bytes, request.headers.get("range"));
  } catch (error) { const safe = publicError(error); return json({ error: { code: safe.code, message: safe.message } }, safe.status); }
}
