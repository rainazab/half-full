import "server-only";
import { DailyStore } from "./daily-store";
import { PipelineError } from "./errors";
import { validDay } from "./daily";
import {
  parseVideoManifest,
  videoManifestSchema,
  type VideoManifest,
  videoMotionPlanSchema,
  type VideoMotionPlan,
} from "./video";

type Asset = { bytes: Uint8Array; contentType: "video/mp4" };
/** Separate durable Apify KV and queue; does not consume or alter news-generation budgets. */
export class VideoStore {
  private kv?: Promise<string>;
  private records = new Map<string, unknown>();
  private leases: DailyStore;
  constructor(
    private token = process.env.APIFY_API_TOKEN?.trim(),
    private name = process.env.APIFY_VIDEO_STORE_NAME?.trim() ||
      `${process.env.APIFY_EDITION_STORE_NAME?.trim() || "us-daily-editions"}-videos`,
    private fetcher: typeof fetch = fetch,
    private memory = process.env.EDITION_STORAGE === "memory" || !token,
  ) {
    this.leases = new DailyStore(token, name, fetcher, memory);
  }
  get mode() {
    return this.memory ? ("memory" as const) : ("apify" as const);
  }
  private async api(path: string, init: RequestInit = {}, binary = false) {
    let response: Response;
    try {
      response = await this.fetcher(`https://api.apify.com/v2${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.token}`, ...init.headers },
        signal: AbortSignal.timeout(45000),
        cache: "no-store",
      });
    } catch {
      throw new PipelineError(
        "VIDEO_STORAGE_UNAVAILABLE",
        "The video store could not be reached. No new video request will be made.",
        503,
      );
    }
    if (response.status === 404) return null;
    if (!response.ok)
      throw new PipelineError(
        "VIDEO_STORAGE_ERROR",
        `Video storage returned HTTP ${response.status}.`,
        503,
      );
    if (binary)
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: "video/mp4" as const,
      };
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      throw new PipelineError(
        "VIDEO_STORAGE_INVALID",
        "The video store returned an unreadable record.",
        503,
      );
    }
  }
  private storeId() {
    return (this.kv ??= this.api(
      `/key-value-stores?name=${encodeURIComponent(this.name)}`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
    )
      .then((body) => {
        if (!body?.data?.id)
          throw new PipelineError(
            "VIDEO_STORAGE_INVALID",
            "The video store has no ID.",
            503,
          );
        return body.data.id as string;
      })
      .catch((error) => {
        this.kv = undefined;
        throw error;
      }));
  }
  private async read(key: string, binary = false) {
    if (this.memory) return this.records.get(key) ?? null;
    const id = await this.storeId();
    return this.api(
      `/key-value-stores/${encodeURIComponent(id)}/records/${encodeURIComponent(key)}`,
      {},
      binary,
    );
  }
  private async write(key: string, value: unknown, binary = false) {
    if (this.memory) {
      this.records.set(key, structuredClone(value));
      return;
    }
    const id = await this.storeId();
    await this.api(
      `/key-value-stores/${encodeURIComponent(id)}/records/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        headers: { "Content-Type": binary ? "video/mp4" : "application/json" },
        body: binary
          ? ((value as Asset).bytes as BodyInit)
          : JSON.stringify(value),
      },
    );
  }
  async getManifest(date: string, storyId: string) {
    if (!validDay(date) || !/^[\w-]{1,150}$/.test(storyId)) return null;
    const manifest = parseVideoManifest(
      await this.read(`MANIFEST-${date}-${storyId}`),
    );
    return manifest?.date === date && manifest.storyId === storyId
      ? manifest
      : null;
  }
  async saveManifest(manifest: VideoManifest) {
    const checked = videoManifestSchema.parse(manifest);
    // Separate attempt records keep the audit trail when an operator retries.
    await this.write(
      `ATTEMPT-${checked.date}-${checked.storyId}-${checked.clips[0].attempt}`,
      checked,
    );
    await this.write(`MANIFEST-${checked.date}-${checked.storyId}`, checked);
    return checked;
  }
  async getPlan(date: string, storyId: string) {
    if (!validDay(date) || !/^[\w-]{1,150}$/.test(storyId)) return null;
    const parsed = videoMotionPlanSchema.safeParse(
      await this.read(`PLAN-${date}-${storyId}`),
    );
    return parsed.success ? parsed.data : null;
  }
  async savePlan(plan: VideoMotionPlan) {
    const checked = videoMotionPlanSchema.parse(plan);
    await this.write(`PLAN-${plan.date}-${plan.storyId}`, checked);
    return checked;
  }
  async reservePlanning(day: string) {
    if (!validDay(day))
      throw new PipelineError(
        "VIDEO_PLAN_BUDGET_INVALID",
        "Invalid planner budget day.",
        422,
      );
    const previous = (await this.read(`PLAN-BUDGET-${day}`)) as {
      calls?: unknown;
    } | null;
    if (
      previous &&
      (typeof previous.calls !== "number" ||
        !Number.isInteger(previous.calls) ||
        previous.calls < 0)
    )
      throw new PipelineError(
        "VIDEO_PLAN_BUDGET_INVALID",
        "The video planning ledger is invalid.",
        503,
      );
    const calls = Number(previous?.calls ?? 0) + 1;
    if (calls > 4)
      throw new PipelineError(
        "VIDEO_PLAN_BUDGET_REACHED",
        "Today's four-call video planning limit has been reached.",
        429,
      );
    await this.write(`PLAN-BUDGET-${day}`, { calls });
  }
  static assetKey(date: string, storyId: string, clipId: string, hash: string) {
    return `VIDEO-${date}-${storyId}-${clipId}-${hash.slice(0, 16)}`;
  }
  async getAsset(key: string): Promise<Asset | null> {
    if (!/^VIDEO-[\w-]{1,190}$/.test(key)) return null;
    return (await this.read(key, true)) as Asset | null;
  }
  async saveAsset(key: string, asset: Asset) {
    if (
      !/^VIDEO-[\w-]{1,190}$/.test(key) ||
      asset.bytes.length > 35 * 1024 * 1024
    )
      throw new PipelineError(
        "VIDEO_ASSET_INVALID",
        "Invalid stored video asset.",
        422,
      );
    await this.write(key, asset, true);
  }
  /** Must run under lock. Attempts are reserved before the paid POST, even if it times out. */
  async reserve(day: string, requestedCredits = 25, maximumCredits = 50) {
    if (!validDay(day))
      throw new PipelineError(
        "VIDEO_BUDGET_INVALID",
        "Invalid video budget day.",
        422,
      );
    const previous = (await this.read(`BUDGET-${day}`)) as {
      reservedCredits?: unknown;
      attempts?: unknown;
    } | null;
    if (
      previous &&
      (typeof previous.reservedCredits !== "number" ||
        !Number.isFinite(previous.reservedCredits) ||
        previous.reservedCredits < 0 ||
        typeof previous.attempts !== "number" ||
        !Number.isInteger(previous.attempts))
    )
      throw new PipelineError(
        "VIDEO_BUDGET_INVALID",
        "The stored video budget is invalid. Generation stopped.",
        503,
      );
    const reservedCredits =
      Number(previous?.reservedCredits ?? 0) + requestedCredits;
    if (reservedCredits > maximumCredits)
      throw new PipelineError(
        "VIDEO_BUDGET_REACHED",
        "Today's video-generation limit has been reached. Existing stories remain available.",
        429,
      );
    const next = {
      reservedCredits,
      attempts: Number(previous?.attempts ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.write(`BUDGET-${day}`, next);
    return next;
  }
  lock() {
    return this.leases.lock();
  }
}
const globalVideos = globalThis as typeof globalThis & {
  halfFullVideoStore?: VideoStore;
};
if (
  process.env.NODE_ENV === "development" &&
  globalVideos.halfFullVideoStore &&
  !(globalVideos.halfFullVideoStore instanceof VideoStore)
)
  globalVideos.halfFullVideoStore = undefined;
export const videoStore = (globalVideos.halfFullVideoStore ??=
  new VideoStore());
