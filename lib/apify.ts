import "server-only";
import {
  historicalQueries,
  defaultQueries,
} from "../actors/news-receipts/core.mjs";
import { retrieveReceipts } from "./receipts";
import { boundedRetry } from "./retry";
import type { AppConfig } from "./config";
import { PipelineError } from "./errors";
import type { RunLogEntry } from "./types";

type Log = (
  step: string,
  status: RunLogEntry["status"],
  message: string,
) => void;
type ActorRun = {
  id: string;
  status: string;
  defaultDatasetId: string;
  usageTotalUsd?: number;
};
const API = "https://api.apify.com/v2";
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

export type RetrievalOptions = {
  /** Total retrieval budget for this call; the default is the first-pass 165 seconds. */
  budgetMs?: number;
  /** Replacement discovery lanes (second pass); the Actor still enforces its own limits. */
  queries?: string[];
  /** Skip original-document investigation for a quick supplementary pass. */
  investigate?: boolean;
  label?: string;
};
/** Official Apify REST API. Tokens only travel in Authorization headers. */
export async function retrieveNews(
  config: AppConfig,
  log: Log,
  onRun: (runId: string, datasetId: string) => void,
  options: RetrievalOptions = {},
): Promise<unknown[]> {
  const budgetMs = Math.max(
    30000,
    Math.min(165000, options.budgetMs ?? 165000),
  );
  if (config.receiptsEnabled && !config.receiptsActorId)
    return retrieveReceipts(config, log, onRun, options);
  if (config.receiptsActorId)
    config = {
      ...config,
      actorId: config.receiptsActorId,
      actorInput: {
        investigate: options.investigate ?? true,
        maxResultsPerQuery: 8,
        queries:
          options.queries ??
          (config.editionDate
            ? historicalQueries(config.editionDate)
            : defaultQueries()),
        ...(options.budgetMs
          ? { budgetMs: Math.max(20000, budgetMs - 15000) }
          : {}),
      },
    };
  else if (options.queries)
    config = {
      ...config,
      actorInput: { ...config.actorInput, query: options.queries.join(" OR ") },
    };
  const deadline = Date.now() + budgetMs;
  const actorTimeoutSecs = Math.max(20, Math.floor(budgetMs / 1000) - 15);
  const label = options.label ?? "current news discovery and article retrieval";
  let run: ActorRun | undefined;

  async function request(
    path: string,
    options: RequestInit = {},
    timeout = 20000,
  ) {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new PipelineError(
        "APIFY_TIMEOUT",
        `Apify exceeded the ${Math.round(budgetMs / 1000)}-second retrieval deadline.`,
        504,
      );
    return boundedRetry(
      async (remainingMs) => {
        let response: Response;
        try {
          response = await fetch(`${API}${path}`, {
            ...options,
            headers: {
              Authorization: `Bearer ${config.apifyToken}`,
              "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(Math.min(timeout, remainingMs)),
            cache: "no-store",
          });
        } catch {
          throw new PipelineError(
            "APIFY_UNREACHABLE",
            "Apify could not be reached or a request timed out. Check network access and the Actor run in Apify Console.",
            504,
          );
        }
        if (!response.ok) {
          throw new PipelineError(
            "APIFY_API_ERROR",
            `Apify returned HTTP ${response.status}. Check your API token, Actor access/credits, and APIFY_ACTOR_INPUT_JSON against the Actor input schema.`,
          );
        }
        try {
          return await response.json();
        } catch {
          throw new PipelineError(
            "APIFY_INVALID_RESPONSE",
            "Apify returned an unreadable JSON response.",
          );
        }
      },
      {
        budgetMs: remaining,
        retryable: (error) =>
          (!options.method || options.method === "GET") &&
          error instanceof PipelineError &&
          (error.code === "APIFY_UNREACHABLE" ||
            /HTTP (429|502|503|504)\b/.test(error.message)),
        onRetry: () =>
          log(
            "apify.retry",
            "started",
            "Retrying one transient Apify read failure within the existing deadline.",
          ),
      },
    );
  }

  function readRun(body: unknown): ActorRun {
    const data = (body as { data?: Partial<ActorRun> } | null)?.data;
    if (
      !data ||
      typeof data.id !== "string" ||
      !data.id ||
      typeof data.defaultDatasetId !== "string" ||
      !data.defaultDatasetId ||
      typeof data.status !== "string" ||
      !data.status
    ) {
      throw new PipelineError(
        "APIFY_INVALID_RUN",
        "Apify did not return a run ID, dataset ID, and status.",
      );
    }
    return data as ActorRun;
  }

  try {
    log(
      "apify.start",
      "started",
      `Starting configured Actor ${config.actorId}; ${label}.`,
    );
    run = readRun(
      await request(
        `/actors/${encodeURIComponent(config.actorId)}/runs?timeout=${actorTimeoutSecs}`,
        {
          method: "POST",
          body: JSON.stringify(config.actorInput),
        },
      ),
    );
    onRun(run.id, run.defaultDatasetId);
    log(
      "apify.start",
      "completed",
      `Apify run ID: ${run.id}; dataset ID: ${run.defaultDatasetId}.`,
    );
    log(
      "apify.wait",
      "started",
      `Waiting for the Actor to finish (bounded retrieval deadline: ${Math.round(budgetMs / 1000)} seconds).`,
    );
    while (!TERMINAL.has(run.status)) {
      if (Date.now() >= deadline)
        throw new PipelineError(
          "APIFY_TIMEOUT",
          `The Apify Actor exceeded the ${Math.round(budgetMs / 1000)}-second retrieval deadline.`,
          504,
        );
      run = readRun(
        await request(
          `/actor-runs/${encodeURIComponent(run.id)}?waitForFinish=10`,
          {},
          15000,
        ),
      );
      if (!TERMINAL.has(run.status)) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (run.status !== "SUCCEEDED") {
      throw new PipelineError(
        "APIFY_ACTOR_FAILED",
        `Apify run ${run.id} ended with status ${run.status}. Inspect its log in Apify Console; check Actor input, blocked pages, credits, and time limits.`,
        run.status === "TIMED-OUT" ? 504 : 502,
      );
    }
    log("apify.wait", "completed", `Actor ${run.id} succeeded.`);
    if (Number.isFinite(run.usageTotalUsd))
      log(
        "apify.usage",
        "completed",
        `Apify reported run ${run.id} usageTotalUsd: ${run.usageTotalUsd}. This is provider-reported run usage, not a total edition cost.`,
      );
    log(
      "apify.dataset",
      "started",
      `Fetching structured results from dataset ${run.defaultDatasetId}.`,
    );
    const items: unknown = await request(
      `/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?format=json&clean=true&limit=100`,
    );
    if (!Array.isArray(items) || items.length === 0) {
      throw new PipelineError(
        "APIFY_EMPTY_DATASET",
        "The Actor succeeded but returned no dataset items. Check its input query, result limits, and output dataset.",
      );
    }
    log(
      "apify.dataset",
      "completed",
      `Retrieved ${items.length} dataset items (bounded to the first 100).`,
    );
    return items;
  } catch (error) {
    if (run && !TERMINAL.has(run.status)) {
      // Avoid a paid Actor continuing after the HTTP pipeline has failed.
      try {
        const aborted = await fetch(
          `${API}/actor-runs/${encodeURIComponent(run.id)}/abort`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${config.apifyToken}` },
            signal: AbortSignal.timeout(5000),
          },
        );
        log(
          "apify.abort",
          aborted.ok ? "completed" : "failed",
          aborted.ok
            ? `Abort requested for Apify run ${run.id}.`
            : `Could not abort Apify run ${run.id}; inspect it in Apify Console.`,
        );
      } catch {
        log(
          "apify.abort",
          "failed",
          `Could not abort Apify run ${run.id}; its Actor timeout is ${actorTimeoutSecs} seconds.`,
        );
      }
    }
    throw error;
  }
}
