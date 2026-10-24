import "server-only";
import { createHash } from "node:crypto";
import { PipelineError } from "./errors";
export type AudioEntry = { bytes: Uint8Array; createdAt: number };
export function createAudioCache(maxEntries = 30, maxBytes = 24 * 1024 * 1024, ttlMs = 2 * 3600000) {
  const entries = new Map<string, AudioEntry>();
  const pending = new Map<string, Promise<AudioEntry>>();
  const failures = new Map<string, number>();
  function get(key: string) {
    const item = entries.get(key);
    if (item && Date.now() - item.createdAt >= ttlMs) { entries.delete(key); return undefined; }
    if (item) { entries.delete(key); entries.set(key, item); }
    return item;
  }
  return {
    get,
    async prepare(key: string, create: () => Promise<Uint8Array>) {
      const existing = get(key); if (existing) return existing;
      const ongoing = pending.get(key); if (ongoing) return ongoing;
      if ((failures.get(key) ?? 0) > Date.now() - 30000) throw new PipelineError("AUDIO_COOLDOWN", "Please wait a moment before retrying narration. You can keep reading.", 429);
      if (pending.size >= 2) throw new PipelineError("AUDIO_BUSY", "Two clips are being prepared. Please try Play again in a moment.", 429);
      const promise = (async () => {
        try {
          const bytes = await Promise.resolve().then(create);
          if (!bytes.length || bytes.length > maxBytes) throw new PipelineError("AUDIO_TOO_LARGE", "The voice clip cannot fit in the audio cache.");
          const entry = { bytes, createdAt: Date.now() }; entries.set(key, entry);
          while (entries.size > maxEntries || [...entries.values()].reduce((sum, value) => sum + value.bytes.length, 0) > maxBytes) entries.delete(entries.keys().next().value!);
          failures.delete(key); return entry;
        } catch (error) {
          failures.set(key, Date.now()); if (failures.size > 100) failures.delete(failures.keys().next().value!);
          throw error;
        } finally { pending.delete(key); }
      })();
      pending.set(key, promise); return promise;
    },
  };
}
const state = globalThis as typeof globalThis & { usAudioCache?: ReturnType<typeof createAudioCache> };
export const audioCache = state.usAudioCache ??= createAudioCache();
export const audioKey = (script: string, voice: string, model: string) => createHash("sha256").update(JSON.stringify([script, voice, model])).digest("hex");
/** Byte ranges let Safari seek/read metadata without regenerating audio. */
export function audioResponse(bytes: Uint8Array, range: string | null) {
  const headers = { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff" };
  if (!range) return new Response(bytes.slice().buffer, { headers: { ...headers, "Content-Length": String(bytes.length) } });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${bytes.length}` } });
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${bytes.length}` } });
  return new Response(bytes.slice(start, end + 1).buffer, { status: 206, headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${bytes.length}` } });
}
