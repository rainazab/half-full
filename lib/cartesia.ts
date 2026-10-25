import "server-only";
import Cartesia from "@cartesia/cartesia-js";
import { PipelineError } from "./errors";
import { isNarratorId, narratorById, type NarratorId } from "./narrators";

export const DEFAULT_CARTESIA_MODEL = "sonic-3.6";
// Public voice used by Cartesia's official Bytes API example; no cloning or impersonation.
export const DEFAULT_CARTESIA_VOICE = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4";
/**
 * A named narrator selects a verified public library voice. Without a narrator,
 * CARTESIA_VOICE_ID (or the default voice) is used, preserving older deployments.
 */
export function cartesiaConfig(env: Record<string, string | undefined> = process.env, narrator?: NarratorId) {
  const apiKey = env.CARTESIA_API_KEY?.trim() || env.CARTESIA?.trim();
  if (!apiKey) throw new PipelineError("AUDIO_NOT_CONFIGURED", "Listening is unavailable right now. The written edition is ready to read.", 503);
  const voice = isNarratorId(narrator) ? narratorById(narrator).voiceId : env.CARTESIA_VOICE_ID?.trim() || DEFAULT_CARTESIA_VOICE;
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(voice)) throw new PipelineError("INVALID_AUDIO_VOICE", "The configured narration voice is invalid. You can still read the story.", 503);
  return { apiKey, voice, model: env.CARTESIA_MODEL_ID?.trim() || DEFAULT_CARTESIA_MODEL, narrator: isNarratorId(narrator) ? narrator : undefined };
}
export type CartesiaConfig = { apiKey: string; voice: string; model: string; narrator?: NarratorId };
export async function synthesize(script: string, config: CartesiaConfig = cartesiaConfig(), fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  if (!script.trim() || script.length > 4000) throw new PipelineError("INVALID_NARRATION", "This narration script could not be prepared safely.", 422);
  const client = new Cartesia({ apiKey: config.apiKey, timeout: 35000, maxRetries: 0, fetch: fetcher });
  const signal = AbortSignal.timeout(35000);
  try {
    const response = await client.tts.generate({ model_id: config.model, voice: config.voice,
      transcript: script, language: "en", output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
      generation_config: { speed: 1, volume: 1 },
    }, { signal });
    if (!response.ok || !response.body) throw new PipelineError("AUDIO_EMPTY", "The voice service returned no playable audio. The text is still available.");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 3 * 1024 * 1024) throw new PipelineError("AUDIO_TOO_LARGE", "The voice clip exceeded the size limit.");
      chunks.push(value);
    } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const mp3 = size > 32 && ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
    if (!mp3) throw new PipelineError("AUDIO_INVALID", "The voice service returned an invalid audio file.");
    return bytes;
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    if (signal.aborted || error instanceof Cartesia.APIConnectionTimeoutError) throw new PipelineError("AUDIO_TIMEOUT", "Narration took too long to prepare. You can keep reading and try again later.", 504);
    if (error instanceof Cartesia.APIError) throw new PipelineError("AUDIO_PROVIDER_ERROR", `Narration is unavailable (voice service HTTP ${error.status ?? "unknown"}). The written story is unaffected.`, error.status === 429 ? 429 : 502);
    throw new PipelineError("AUDIO_UNAVAILABLE", "Could not reach the voice service. The written story is unaffected.");
  }
}
