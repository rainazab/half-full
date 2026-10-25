import "server-only";
import { PipelineError } from "./errors";
import { ILLUSTRATION_STYLE } from "./illustration-style";
import { resolvePublicHost, type HostResolver } from "./network-safety";

/**
 * Recraft external API (https://external.api.recraft.ai/v1), verified against
 * the published OpenAPI document on October 24, 2026:
 *  - POST /styles            creates a reusable private style from reference images
 *  - POST /images/generations generates raster images; `style_id` applies the style
 * Result URLs expire after roughly 24 hours, so assets are downloaded and stored.
 * Rate limits: 100 images/minute and 5 requests/second per user.
 */
export const RECRAFT_BASE_URL = "https://external.api.recraft.ai/v1";
export type RecraftConfig = {
  apiKey: string;
  model: string;
  styleId?: string;
  baseUrl: string;
};
export function recraftConfig(
  env: Record<string, string | undefined> = process.env,
): RecraftConfig {
  const apiKey = env.RECRAFT_API_KEY?.trim() || env.RECRAFT?.trim();
  if (!apiKey)
    throw new PipelineError(
      "RECRAFT_NOT_CONFIGURED",
      "Illustrations are not configured on this server. The written edition is unaffected.",
      503,
    );
  const styleId = env.RECRAFT_STYLE_ID?.trim();
  if (styleId && !/^[0-9a-f-]{36}$/i.test(styleId))
    throw new PipelineError(
      "RECRAFT_STYLE_INVALID",
      "RECRAFT_STYLE_ID must be a Recraft style UUID.",
      503,
    );
  return {
    apiKey,
    model: env.RECRAFT_MODEL?.trim() || ILLUSTRATION_STYLE.recraft.model,
    styleId: styleId || undefined,
    baseUrl: env.RECRAFT_BASE_URL?.trim() || RECRAFT_BASE_URL,
  };
}
export type RecraftImage = {
  url: string;
  imageId?: string;
  /** API units charged for this call (Recraft reports cost, not balance). */
  creditsUsed?: number;
  styleId?: string;
};
async function call(
  config: RecraftConfig,
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
  timeoutMs: number,
  signal?: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetcher(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...(init.headers ?? {}),
      },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PipelineError(
      "RECRAFT_TIMEOUT",
      "The illustration service did not respond in time. The written story is unaffected.",
      504,
    );
  }
  if (!response.ok)
    // Provider bodies can echo prompts; only the status is surfaced.
    throw new PipelineError(
      "RECRAFT_API_ERROR",
      `The illustration service returned HTTP ${response.status}. Check RECRAFT_API_KEY, credits and rate limits.`,
      response.status === 429 ? 429 : 502,
    );
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new PipelineError(
      "RECRAFT_INVALID_RESPONSE",
      "The illustration service returned an unreadable response.",
      502,
    );
  }
}
/** Creates one reusable private style from the existing reaction artwork. Costs credits once. */
export async function createRecraftStyle(
  config: RecraftConfig,
  references: { name: string; bytes: Uint8Array; type: string }[],
  fetcher: typeof fetch = fetch,
): Promise<{ id: string; creditsUsed?: number }> {
  if (!references.length || references.length > 10)
    throw new PipelineError(
      "RECRAFT_STYLE_REFERENCES",
      "A Recraft style needs between one and ten reference images.",
    );
  const body = new FormData();
  for (const reference of references)
    body.append(
      "files",
      new Blob([reference.bytes as BlobPart], { type: reference.type }),
      reference.name,
    );
  body.append("model", config.model);
  body.append("match", ILLUSTRATION_STYLE.recraft.match);
  // V4 Styles rejects a base `style`; the references alone define the look.
  if (!config.model.startsWith("recraftv4_styles"))
    body.append("style", ILLUSTRATION_STYLE.recraft.baseStyle);
  body.append("prompt", ILLUSTRATION_STYLE.stylePrompt);
  const result = await call(
    config,
    "/styles",
    { method: "POST", body },
    fetcher,
    60000,
  );
  if (typeof result.id !== "string" || !/^[0-9a-f-]{36}$/i.test(result.id))
    throw new PipelineError(
      "RECRAFT_INVALID_RESPONSE",
      "The illustration service did not return a style ID.",
      502,
    );
  return {
    id: result.id,
    creditsUsed:
      typeof result.credits === "number" ? result.credits : undefined,
  };
}
export function recraftGenerationBody(
  config: RecraftConfig,
  request: { prompt: string; styleId: string; seed?: number },
) {
  if (!request.prompt.trim() || request.prompt.length > 1800)
    throw new PipelineError(
      "RECRAFT_PROMPT_INVALID",
      "The scene prompt is empty or too long.",
      422,
    );
  return {
    prompt: request.prompt,
    model: config.model,
    style_id: request.styleId,
    size: ILLUSTRATION_STYLE.recraft.size,
    n: 1,
    response_format: "url",
    image_format: ILLUSTRATION_STYLE.recraft.imageFormat,
    ...(request.seed !== undefined ? { random_seed: request.seed } : {}),
    controls: {
      colors: ILLUSTRATION_STYLE.recraft.colors.map((color) => ({
        rgb: [...color.rgb],
        weight: color.weight,
      })),
      background_color: {
        rgb: [...ILLUSTRATION_STYLE.recraft.backgroundColor.rgb],
      },
    },
  };
}
/** One paid image. Retries once on 429/5xx inside the caller's deadline. */
export async function generateRecraftImage(
  config: RecraftConfig,
  request: { prompt: string; styleId: string; seed?: number },
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<RecraftImage> {
  const body = JSON.stringify(recraftGenerationBody(config, request));
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const result = await call(
        config,
        "/images/generations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        },
        fetcher,
        90000,
        signal,
      );
      const data = Array.isArray(result.data) ? result.data[0] : undefined;
      const url =
        data && typeof data === "object" && typeof data.url === "string"
          ? data.url
          : undefined;
      if (!url)
        throw new PipelineError(
          "RECRAFT_INVALID_RESPONSE",
          "The illustration service returned no image URL.",
          502,
        );
      return {
        url,
        imageId:
          typeof (data as { image_id?: unknown }).image_id === "string"
            ? ((data as { image_id: string }).image_id as string)
            : undefined,
        creditsUsed:
          typeof result.credits === "number" ? result.credits : undefined,
        styleId:
          typeof result.style_id === "string" ? result.style_id : undefined,
      };
    } catch (error) {
      const retryable =
        error instanceof PipelineError &&
        attempt < 2 &&
        !signal?.aborted &&
        (error.code === "RECRAFT_TIMEOUT" ||
          /HTTP (429|5\d\d)\b/.test(error.message));
      if (!retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
}
const MAX_ASSET_BYTES = 6 * 1024 * 1024;
/** Downloads a temporary result URL with the same public-host checks as article previews. */
export async function downloadGeneratedImage(
  url: string,
  fetcher: typeof fetch = fetch,
  resolver: HostResolver = resolvePublicHost,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new PipelineError("RECRAFT_ASSET_UNSAFE", "Invalid asset URL.");
  }
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    !(await resolver(target.hostname))
  )
    throw new PipelineError(
      "RECRAFT_ASSET_UNSAFE",
      "The generated asset location was not a public HTTPS host.",
    );
  let response: Response;
  try {
    response = await fetcher(target.href, {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
  } catch {
    throw new PipelineError(
      "RECRAFT_ASSET_UNAVAILABLE",
      "The generated asset could not be downloaded.",
      502,
    );
  }
  if (!response.ok || !response.body)
    throw new PipelineError(
      "RECRAFT_ASSET_UNAVAILABLE",
      `The generated asset returned HTTP ${response.status}.`,
      502,
    );
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!/^image\/(webp|png|jpeg)$/.test(contentType))
    throw new PipelineError(
      "RECRAFT_ASSET_INVALID",
      "The generated asset was not a supported image type.",
      502,
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ASSET_BYTES)
        throw new PipelineError(
          "RECRAFT_ASSET_TOO_LARGE",
          "The generated asset exceeded the size limit.",
        );
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const webp =
    bytes.length > 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45;
  const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50;
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!webp && !png && !jpeg)
    throw new PipelineError(
      "RECRAFT_ASSET_INVALID",
      "The generated asset bytes were not a recognised image.",
    );
  return { bytes, contentType };
}
