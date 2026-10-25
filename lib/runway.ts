import "server-only";
import { PipelineError } from "./errors";
import { resolvePublicHost, type HostResolver } from "./network-safety";
import type { VideoClip } from "./video";

/** Official API/version and list pricing checked 2026-10-24. */
export const RUNWAY_API = "https://api.dev.runwayml.com/v1";
export const RUNWAY_VERSION = "2024-11-06";
export type RunwayModel = "gen4.5" | "gen4_turbo";
export type RunwayConfig = {
  apiKey: string;
  model?: RunwayModel;
  durationSeconds?: number;
};
export const RUNWAY_CREDITS_PER_SECOND: Record<RunwayModel, number> = {
  "gen4.5": 12,
  gen4_turbo: 5,
};
export function runwayConfig(
  env: Record<string, string | undefined> = process.env,
): RunwayConfig {
  const apiKey = env.RUNWAY_API_KEY?.trim();
  if (!apiKey)
    throw new PipelineError(
      "VIDEO_NOT_CONFIGURED",
      "Video generation is unavailable. The illustrated and written story remain available.",
      503,
    );
  const model = (env.RUNWAY_VIDEO_MODEL?.trim() || "gen4.5") as RunwayModel;
  if (!(model in RUNWAY_CREDITS_PER_SECOND))
    throw new PipelineError(
      "VIDEO_MODEL_INVALID",
      "RUNWAY_VIDEO_MODEL must be gen4.5 or gen4_turbo.",
      503,
    );
  const durationSeconds = Number(env.RUNWAY_VIDEO_DURATION_SECONDS ?? 8);
  if (!Number.isInteger(durationSeconds) || durationSeconds < 4 || durationSeconds > 10)
    throw new PipelineError(
      "VIDEO_DURATION_INVALID",
      "RUNWAY_VIDEO_DURATION_SECONDS must be an integer from 4 to 10.",
      503,
    );
  return { apiKey, model, durationSeconds };
}
async function call(
  config: RunwayConfig,
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
) {
  let response: Response;
  try {
    response = await fetcher(`${RUNWAY_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "X-Runway-Version": RUNWAY_VERSION,
        ...init.headers,
      },
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
  } catch {
    // Do not retry task creation: a timeout may have accepted and billed the task.
    throw new PipelineError(
      "VIDEO_PROVIDER_UNREACHABLE",
      "The video provider did not confirm the request. No automatic retry was made; inspect the provider dashboard before retrying.",
      504,
    );
  }
  if (!response.ok)
    throw new PipelineError(
      "VIDEO_PROVIDER_ERROR",
      `The video provider returned HTTP ${response.status}. Check API access, credits and request settings.`,
      response.status === 429 ? 429 : 502,
    );
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new PipelineError(
      "VIDEO_PROVIDER_INVALID",
      "The video provider returned an unreadable response.",
      502,
    );
  }
}
export function runwayBody(request: {
  image: Uint8Array;
  contentType: string;
  prompt: string;
  ratio: VideoClip["ratio"];
  model?: RunwayModel;
  durationSeconds?: number;
  seed?: number;
}) {
  if (
    !/^image\/(png|webp|jpeg)$/.test(request.contentType) ||
    !request.image.length
  )
    throw new PipelineError(
      "VIDEO_KEYFRAME_INVALID",
      "A stored PNG, WebP or JPEG keyframe is required.",
      422,
    );
  const promptImage = `data:${request.contentType};base64,${Buffer.from(request.image).toString("base64")}`;
  if (promptImage.length > 5 * 1024 * 1024)
    throw new PipelineError(
      "VIDEO_KEYFRAME_TOO_LARGE",
      "The stored keyframe exceeds Runway's 5 MB encoded-image limit.",
      422,
    );
  if (request.prompt.length < 20 || request.prompt.length > 1000)
    throw new PipelineError(
      "VIDEO_PROMPT_INVALID",
      "The motion prompt must contain 20–1,000 characters.",
      422,
    );
  const model = request.model ?? "gen4_turbo";
  const durationSeconds = request.durationSeconds ?? 5;
  if (!(model in RUNWAY_CREDITS_PER_SECOND) || !Number.isInteger(durationSeconds) || durationSeconds < 4 || durationSeconds > 10)
    throw new PipelineError(
      "VIDEO_REQUEST_INVALID",
      "Runway video requests require a supported model and a 4–10 second duration.",
      422,
    );
  return {
    model,
    promptImage,
    promptText: request.prompt,
    ratio: request.ratio,
    duration: durationSeconds,
    ...(request.seed !== undefined ? { seed: request.seed } : {}),
  };
}
export async function submitRunway(
  config: RunwayConfig,
  request: Parameters<typeof runwayBody>[0],
  fetcher: typeof fetch = fetch,
) {
  const result = await call(
    config,
    "/image_to_video",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        runwayBody({
          ...request,
          model: config.model,
          durationSeconds: config.durationSeconds,
        }),
      ),
    },
    fetcher,
  );
  if (typeof result.id !== "string" || !/^[0-9a-f-]{36}$/i.test(result.id))
    throw new PipelineError(
      "VIDEO_TASK_MISSING",
      "The video provider did not return a valid task ID. No automatic retry was made.",
      502,
    );
  const cost = result.estimatedCost as { credits?: unknown } | undefined;
  return {
    id: result.id,
    estimatedCredits:
      typeof cost?.credits === "number" && cost.credits >= 0
        ? cost.credits
        : undefined,
  };
}
export type RunwayTask = {
  id: string;
  status:
    "PENDING" | "THROTTLED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
  output?: string[];
  estimatedCost?: { credits: number };
  failureCode?: string;
};
export async function getRunwayTask(
  config: RunwayConfig,
  taskId: string,
  fetcher: typeof fetch = fetch,
): Promise<RunwayTask> {
  if (!/^[0-9a-f-]{36}$/i.test(taskId))
    throw new PipelineError(
      "VIDEO_TASK_INVALID",
      "Invalid video task ID.",
      422,
    );
  const result = await call(
    config,
    `/tasks/${encodeURIComponent(taskId)}`,
    {},
    fetcher,
  );
  if (
    result.id !== taskId ||
    ![
      "PENDING",
      "THROTTLED",
      "RUNNING",
      "SUCCEEDED",
      "FAILED",
      "CANCELED",
    ].includes(String(result.status))
  )
    throw new PipelineError(
      "VIDEO_TASK_INVALID",
      "The provider returned an invalid task record.",
      502,
    );
  return {
    id: taskId,
    status: result.status as RunwayTask["status"],
    output: Array.isArray(result.output)
      ? result.output.filter((u): u is string => typeof u === "string")
      : undefined,
    failureCode:
      typeof result.failureCode === "string"
        ? result.failureCode.slice(0, 80)
        : undefined,
  };
}
/** Ephemeral signed URLs are consumed only on the server and cached immediately. */
export async function downloadRunwayVideo(
  url: string,
  fetcher: typeof fetch = fetch,
  resolver: HostResolver = resolvePublicHost,
) {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new PipelineError(
      "VIDEO_ASSET_UNSAFE",
      "Invalid video result location.",
      502,
    );
  }
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    !(await resolver(target.hostname))
  )
    throw new PipelineError(
      "VIDEO_ASSET_UNSAFE",
      "The video result was not on a public HTTPS host.",
      502,
    );
  let response: Response;
  try {
    response = await fetcher(target.href, {
      redirect: "error",
      signal: AbortSignal.timeout(60000),
      cache: "no-store",
    });
  } catch {
    throw new PipelineError(
      "VIDEO_ASSET_UNAVAILABLE",
      "The generated clip could not be downloaded. Its provider task can be polled again.",
      502,
    );
  }
  if (!response.ok || !response.body)
    throw new PipelineError(
      "VIDEO_ASSET_UNAVAILABLE",
      `The generated clip returned HTTP ${response.status}.`,
      502,
    );
  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType !== "video/mp4" && contentType !== "application/octet-stream")
    throw new PipelineError(
      "VIDEO_ASSET_INVALID",
      "The generated clip was not an MP4.",
      502,
    );
  const max = 35 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > max)
    throw new PipelineError(
      "VIDEO_ASSET_TOO_LARGE",
      "The generated clip exceeds the 35 MB limit.",
      502,
    );
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max)
        throw new PipelineError(
          "VIDEO_ASSET_TOO_LARGE",
          "The generated clip exceeds the 35 MB limit.",
          502,
        );
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (
    length < 16 ||
    Buffer.from(bytes.subarray(4, 8)).toString("ascii") !== "ftyp"
  )
    throw new PipelineError(
      "VIDEO_ASSET_INVALID",
      "The result does not have a valid MP4 container signature.",
      502,
    );
  return { bytes, contentType: "video/mp4" as const };
}
