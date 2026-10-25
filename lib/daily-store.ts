import "server-only";
import { randomUUID } from "node:crypto";
import { parseEdition } from "./edition-schema";
import { editionDay, validDay, type ArchiveEntry } from "./daily";
import { PipelineError } from "./errors";
import { checkpointSchema } from "./run-checkpoint";
import type { RunRecord } from "./types";
import type { EditionResult } from "./types";

/** Apify KV owns published editions. One locked Apify queue item serializes writers across instances. */
export class DailyStore {
  private kv?: Promise<string>;
  private queue?: Promise<string>;
  private cache = new Map<string, EditionResult>();
  private memoryLocked = false;
  private checkpoints = new Map<string, RunRecord>();
  constructor(
    private token = process.env.APIFY_API_TOKEN?.trim(),
    private name = process.env.APIFY_EDITION_STORE_NAME?.trim() ||
      "us-daily-editions",
    private fetcher: typeof fetch = fetch,
    private memory = process.env.EDITION_STORAGE === "memory" || !token,
  ) {}
  private async api(path: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await this.fetcher(`https://api.apify.com/v2${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
    } catch {
      throw new PipelineError(
        "EDITION_STORAGE_UNAVAILABLE",
        "The saved-edition store could not be reached. Generation was stopped to avoid duplicate daily editions. Try again shortly.",
        503,
      );
    }
    if (response.status === 404) return null;
    if (!response.ok)
      throw new PipelineError(
        "EDITION_STORAGE_ERROR",
        `Apify edition storage returned HTTP ${response.status}. Check token access to key-value stores and request queues.`,
        503,
      );
    if (response.status === 204) return null;
    try {
      const raw = await response.text();
      return raw ? JSON.parse(raw) : null;
    } catch {
      throw new PipelineError(
        "EDITION_STORAGE_INVALID",
        "The edition store returned an unreadable response.",
        503,
      );
    }
  }
  private storeId() {
    return (this.kv ??= this.api(
      `/key-value-stores?name=${encodeURIComponent(this.name)}`,
      { method: "POST" },
    )
      .then((body) => {
        if (!body?.data?.id) throw Error("Missing storage ID");
        return body.data.id as string;
      })
      .catch((e) => {
        this.kv = undefined;
        throw e;
      }));
  }
  private queueId() {
    return (this.queue ??= this.api(
      `/request-queues?name=${encodeURIComponent(`${this.name}-publisher`)}`,
      { method: "POST" },
    )
      .then((body) => {
        if (!body?.data?.id) throw Error("Missing queue ID");
        return body.data.id as string;
      })
      .catch((e) => {
        this.queue = undefined;
        throw e;
      }));
  }
  private async record(key: string, value?: unknown) {
    const id = await this.storeId();
    return this.api(
      `/key-value-stores/${encodeURIComponent(id)}/records/${encodeURIComponent(key)}`,
      value === undefined ? {} : { method: "PUT", body: JSON.stringify(value) },
    );
  }
  private remember(result: EditionResult) {
    const date =
      result.edition.date ?? editionDay(new Date(result.edition.createdAt));
    this.cache.set(date, result);
    if (this.cache.size > 35)
      this.cache.delete(this.cache.keys().next().value!);
  }
  async get(date = editionDay()): Promise<EditionResult | null> {
    if (!validDay(date))
      throw new PipelineError(
        "INVALID_DATE",
        "Use an actual calendar date in YYYY-MM-DD format.",
        400,
      );
    if (this.cache.has(date)) return this.cache.get(date)!;
    if (this.memory) return null;
    const value = await this.record(`EDITION-${date}`);
    if (!value) return null;
    try {
      const result = parseEdition(value);
      if (result.edition.date !== date || result.edition.mode !== "live")
        throw Error();
      this.remember(result);
      return result;
    } catch {
      throw new PipelineError(
        "SAVED_EDITION_INVALID",
        "The saved edition failed schema validation. It was not presented as current news.",
        502,
      );
    }
  }
  async list(): Promise<ArchiveEntry[]> {
    if (this.memory)
      return [...this.cache].map(([date, result]) => ({
        date,
        id: result.edition.id,
        count: result.stats.approved,
        mode: "live",
      }));
    const index = await this.record("INDEX");
    return Array.isArray(index)
      ? index
          .filter(
            (e): e is ArchiveEntry =>
              e &&
              validDay(e.date) &&
              typeof e.id === "string" &&
              Number.isInteger(e.count) &&
              e.count >= 3 &&
              e.count <= 5 &&
              e.mode === "live",
          )
          .slice(-366)
      : [];
  }
  async byId(id: string) {
    if (!/^[\w-]{1,100}$/.test(id)) return null;
    const cached = [...this.cache.values()].find((r) => r.edition.id === id);
    if (cached) return cached;
    if (this.memory) return null;
    const pointer = await this.record(`RUN-${id}`);
    return pointer && typeof pointer.date === "string" && validDay(pointer.date)
      ? this.get(pointer.date)
      : null;
  }
  async publish(
    result: EditionResult,
    date = editionDay(),
  ): Promise<EditionResult> {
    const existing = await this.get(date);
    if (existing) return existing;
    const checked = parseEdition({
      ...result,
      edition: { ...result.edition, date, mode: "live" },
    });
    if (!this.memory) {
      // The edition itself is the commit point. Index/pointer failures do not lose the published result.
      await this.record(`EDITION-${date}`, checked);
      try {
        const index = await this.list();
        await this.record(
          "INDEX",
          [
            ...index.filter((e) => e.date !== date),
            {
              date,
              id: checked.edition.id,
              count: checked.stats.approved,
              mode: "live",
            },
          ]
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-366),
        );
        await this.record(`RUN-${checked.edition.id}`, { date });
      } catch {
        console.warn(
          "Published edition saved; archive index update was unavailable.",
        );
      }
    }
    this.remember(checked);
    return checked;
  }
  async saveRun(run: RunRecord) {
    const checked = checkpointSchema.parse(run);
    if (!validDay(checked.date))
      throw new PipelineError("INVALID_DATE", "Invalid edition date.", 400);
    if (this.memory) {
      this.checkpoints.set(checked.date, checked);
      if (this.checkpoints.size > 35)
        this.checkpoints.delete(this.checkpoints.keys().next().value!);
    } else await this.record(`PROCESS-${checked.date}`, checked);
  }
  async getRun(date: string): Promise<RunRecord | null> {
    if (!validDay(date)) return null;
    const value = this.memory
      ? this.checkpoints.get(date)
      : await this.record(`PROCESS-${date}`);
    if (!value) return null;
    const parsed = checkpointSchema.safeParse(value);
    return parsed.success && parsed.data.date === date ? parsed.data : null;
  }
  async lock(): Promise<() => Promise<void>> {
    if (this.memory) {
      if (this.memoryLocked)
        throw new PipelineError(
          "RUN_IN_PROGRESS",
          "Today’s edition is already being prepared. Check it again shortly.",
          409,
        );
      this.memoryLocked = true;
      return async () => {
        this.memoryLocked = false;
      };
    }
    const id = await this.queueId(),
      client = randomUUID().replaceAll("-", "");
    // This URL is only an opaque queue key; it is never fetched.
    await this.api(`/request-queues/${id}/requests`, {
      method: "POST",
      body: JSON.stringify({
        url: "https://us.invalid/daily-publisher",
        uniqueKey: "daily-publisher",
        method: "GET",
      }),
    });
    const locked = await this.api(
      `/request-queues/${id}/head/lock?lockSecs=360&limit=1&clientKey=${client}`,
      { method: "POST" },
    );
    const item = locked?.data?.items?.[0];
    if (!item?.id)
      throw new PipelineError(
        "RUN_IN_PROGRESS",
        "An edition is already being prepared. Refresh today’s edition in a few minutes.",
        409,
      );
    return async () => {
      try {
        await this.api(
          `/request-queues/${id}/requests/${item.id}/lock?clientKey=${client}`,
          { method: "DELETE" },
        );
      } catch {
        console.warn("Daily publisher lock will expire automatically.");
      }
    };
  }
}
const globalDaily = globalThis as typeof globalThis & {
  usDailyStore?: DailyStore;
};
export const dailyStore = (globalDaily.usDailyStore ??= new DailyStore());
