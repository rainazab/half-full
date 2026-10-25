import "server-only";
import { PipelineError } from "./errors";
import { editionDay, validDay } from "./daily";
import { parseStoryboardManifest, type StoryboardManifest } from "./storyboard";

/**
 * Durable storage for optional illustration assets, in an Apify key-value
 * store namespace separate from the immutable editions
 * (`<edition store>-illustrations`). Manifests are JSON records; images are
 * binary records with their content type. Memory mode mirrors the edition
 * store's explicit local-only behaviour and loses assets on restart.
 */
export type StoredAsset = { bytes: Uint8Array; contentType: string };
export class IllustrationStore {
  private kv?: Promise<string>;
  /** Manifests are cached briefly so another process (operator script, other instance) can update them. */
  private manifests = new Map<
    string,
    { value: StoryboardManifest; at: number }
  >();
  private assets = new Map<string, StoredAsset>();
  private manifestTtlMs = 60000;
  private assetBytes = 0;
  private memoryRecords = new Map<string, unknown>();
  private pendingLocks = new Set<string>();
  constructor(
    private token = process.env.APIFY_API_TOKEN?.trim(),
    private name = process.env.APIFY_ILLUSTRATION_STORE_NAME?.trim() ||
      `${process.env.APIFY_EDITION_STORE_NAME?.trim() || "us-daily-editions"}-illustrations`,
    private fetcher: typeof fetch = fetch,
    private memory = process.env.EDITION_STORAGE === "memory" || !token,
    private assetCacheBytes = 24 * 1024 * 1024,
  ) {}
  get mode() {
    return this.memory ? "memory" : "apify";
  }
  private async api(path: string, init: RequestInit = {}, raw = false) {
    let response: Response;
    try {
      response = await this.fetcher(`https://api.apify.com/v2${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
    } catch {
      throw new PipelineError(
        "ILLUSTRATION_STORAGE_UNAVAILABLE",
        "The illustration store could not be reached.",
        503,
      );
    }
    if (response.status === 404) return null;
    if (!response.ok)
      throw new PipelineError(
        "ILLUSTRATION_STORAGE_ERROR",
        `Apify illustration storage returned HTTP ${response.status}.`,
        503,
      );
    if (response.status === 204) return null;
    if (raw) {
      const contentType =
        response.headers.get("content-type")?.split(";")[0].trim() ??
        "application/octet-stream";
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType,
      } satisfies StoredAsset;
    }
    try {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch {
      throw new PipelineError(
        "ILLUSTRATION_STORAGE_INVALID",
        "The illustration store returned an unreadable response.",
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
        if (!body?.data?.id) throw Error("Missing illustration store ID");
        return body.data.id as string;
      })
      .catch((e) => {
        this.kv = undefined;
        throw e;
      }));
  }
  private async readJson(key: string) {
    if (this.memory) return this.memoryRecords.get(key) ?? null;
    const id = await this.storeId();
    return this.api(
      `/key-value-stores/${encodeURIComponent(id)}/records/${encodeURIComponent(key)}`,
    );
  }
  private async writeJson(key: string, value: unknown) {
    if (this.memory) {
      this.memoryRecords.set(key, structuredClone(value));
      return;
    }
    const id = await this.storeId();
    await this.api(
      `/key-value-stores/${encodeURIComponent(id)}/records/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      },
    );
  }
  static manifestKey(date: string, storyId: string) {
    return `STORYBOARD-${date}-${storyId}`;
  }
  static assetKey(date: string, storyId: string, sceneId: string) {
    return `ASSET-${date}-${storyId}-${sceneId}`;
  }
  async getManifest(date: string, storyId: string) {
    if (!validDay(date) || !/^[\w-]{1,150}$/.test(storyId)) return null;
    const key = IllustrationStore.manifestKey(date, storyId);
    const cached = this.manifests.get(key);
    if (cached && Date.now() - cached.at < this.manifestTtlMs)
      return cached.value;
    const value = await this.readJson(key);
    const manifest = parseStoryboardManifest(value);
    if (manifest) this.manifests.set(key, { value: manifest, at: Date.now() });
    else this.manifests.delete(key);
    return manifest;
  }
  async saveManifest(manifest: StoryboardManifest) {
    const key = IllustrationStore.manifestKey(manifest.date, manifest.storyId);
    await this.writeJson(key, manifest);
    this.manifests.set(key, { value: manifest, at: Date.now() });
    if (this.manifests.size > 200)
      this.manifests.delete(this.manifests.keys().next().value!);
    return manifest;
  }
  /** `version` (the scene's prompt hash) keeps regenerated bytes from being served from an old cache entry. */
  async getAsset(key: string, version = ""): Promise<StoredAsset | null> {
    if (!/^ASSET-[\w-]{1,200}$/.test(key)) return null;
    const cacheKey = `${key}@${version}`;
    const cached = this.assets.get(cacheKey);
    if (cached) return cached;
    let asset: StoredAsset | null = null;
    if (this.memory)
      asset = (this.memoryRecords.get(key) as StoredAsset | undefined) ?? null;
    else {
      const id = await this.storeId();
      asset = (await this.api(
        `/key-value-stores/${encodeURIComponent(id)}/records/${encodeURIComponent(key)}`,
        {},
        true,
      )) as StoredAsset | null;
    }
    if (asset) this.remember(cacheKey, asset);
    return asset;
  }
  private remember(key: string, asset: StoredAsset) {
    this.assets.set(key, asset);
    this.assetBytes += asset.bytes.length;
    while (this.assetBytes > this.assetCacheBytes && this.assets.size > 1) {
      const oldest = this.assets.keys().next().value!;
      this.assetBytes -= this.assets.get(oldest)!.bytes.length;
      this.assets.delete(oldest);
    }
  }
  async saveAsset(key: string, asset: StoredAsset, version = "") {
    if (!/^ASSET-[\w-]{1,200}$/.test(key))
      throw new PipelineError("ILLUSTRATION_KEY_INVALID", "Invalid asset key.");
    if (this.memory) this.memoryRecords.set(key, asset);
    else {
      const id = await this.storeId();
      await this.api(
        `/key-value-stores/${encodeURIComponent(id)}/records/${encodeURIComponent(key)}`,
        {
          method: "PUT",
          headers: { "Content-Type": asset.contentType },
          body: asset.bytes as BodyInit,
        },
      );
    }
    this.remember(`${key}@${version}`, asset);
  }
  /** Apify record keys allow only [a-zA-Z0-9!-_.'()]; versions such as "x/1" are sanitised. */
  static styleKey(version: string) {
    return `STYLE-${version.replace(/[^a-zA-Z0-9!\-_.'()]/g, "_")}`;
  }
  /** The reusable Recraft style ID, created once and persisted with the style version. */
  async getStyle(version: string) {
    const value = await this.readJson(IllustrationStore.styleKey(version));
    return value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "string"
      ? (value as { id: string; createdAt?: string; creditsUsed?: number })
      : null;
  }
  async saveStyle(
    version: string,
    record: {
      id: string;
      createdAt: string;
      creditsUsed?: number;
      references: string[];
    },
  ) {
    await this.writeJson(IllustrationStore.styleKey(version), record);
  }
  /** Pacific-day image ledger shared by every server instance. */
  async countImages(day = editionDay()) {
    const value = await this.readJson(`RECRAFT-BUDGET-${day}`);
    const images = (value as { images?: unknown } | null)?.images;
    return typeof images === "number" && images >= 0 ? images : 0;
  }
  async recordImages(count: number, day = editionDay()) {
    const next = (await this.countImages(day)) + count;
    await this.writeJson(`RECRAFT-BUDGET-${day}`, {
      images: next,
      updatedAt: new Date().toISOString(),
    });
    return next;
  }
  /**
   * Best-effort generation lock: in-process reservations stop duplicate work
   * in one server, and a dated record with a 10-minute expiry guards other
   * instances. Expired locks are reclaimed.
   */
  async lock(date: string): Promise<() => Promise<void>> {
    const key = `LOCK-${date}`;
    if (this.pendingLocks.has(key))
      throw new PipelineError(
        "ILLUSTRATION_IN_PROGRESS",
        "Illustrations for this edition are already being generated.",
        409,
      );
    const existing = (await this.readJson(key)) as { until?: unknown } | null;
    if (
      existing &&
      typeof existing.until === "number" &&
      existing.until > Date.now()
    )
      throw new PipelineError(
        "ILLUSTRATION_IN_PROGRESS",
        "Illustrations for this edition are being generated elsewhere. Try again in a few minutes.",
        409,
      );
    this.pendingLocks.add(key);
    await this.writeJson(key, { until: Date.now() + 600000 });
    return async () => {
      this.pendingLocks.delete(key);
      try {
        await this.writeJson(key, { until: 0 });
      } catch {
        /* The lock expires on its own. */
      }
    };
  }
}
const globalIllustrations = globalThis as typeof globalThis & {
  usIllustrationStore?: IllustrationStore;
};
if (
  process.env.NODE_ENV === "development" &&
  globalIllustrations.usIllustrationStore &&
  !(globalIllustrations.usIllustrationStore instanceof IllustrationStore)
)
  globalIllustrations.usIllustrationStore = undefined;
export const illustrationStore = (globalIllustrations.usIllustrationStore ??=
  new IllustrationStore());
