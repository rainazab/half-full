import "server-only";
import { z } from "zod";
export const retrievalRunSchema = z.object({
  actorId: z.string().max(100),
  runId: z.string().max(100),
  datasetId: z.string().max(100),
  usageTotalUsd: z.number().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});
import { actorRunner, gatherReceipts } from "../actors/news-receipts/core.mjs";
import type { AppConfig } from "./config";
import { PipelineError } from "./errors";
import type { RunLogEntry } from "./types";
type Log = (
  step: string,
  status: RunLogEntry["status"],
  message: string,
) => void;
export async function retrieveReceipts(
  config: AppConfig,
  log: Log,
  onRun: (runId: string, datasetId: string) => void,
) {
  const runner = actorRunner(config.apifyToken, log);
  let first = true;
  try {
    return await gatherReceipts(
      config.editionDate ? { date: config.editionDate } : {},
      async (...args) => {
        const result = await runner(...args);
        if (first) {
          onRun(String(result.run.id), String(result.run.defaultDatasetId));
          first = false;
        }
        return result;
      },
      log,
    );
  } catch {
    throw new PipelineError(
      "APIFY_RECEIPTS_FAILED",
      "The News Receipts engine could not retrieve article data. Check Apify access/credits and the discovery stage log. No evidence standards were lowered.",
      502,
    );
  }
}
export function unpackReceipts(items: unknown[]) {
  const articles: unknown[] = [],
    sources: unknown[] = [],
    limitations: string[] = [];
  const retrievalRuns: z.infer<typeof retrievalRunSchema>[] = [];
  for (const value of items) {
    const packet = value as Record<string, unknown> | null;
    if (
      packet?.kind === "news-receipt" &&
      packet.schemaVersion === "us-receipts/1"
    ) {
      const metadata = z
        .object({ runs: z.array(retrievalRunSchema).max(10) })
        .safeParse(packet.retrieval);
      if (metadata.success) retrievalRuns.push(...metadata.data.runs);
      articles.push(packet.article);
      if (Array.isArray(packet.evidenceSources))
        sources.push(...packet.evidenceSources);
      if (Array.isArray(packet.limitations))
        limitations.push(
          ...packet.limitations.filter(
            (x): x is string => typeof x === "string",
          ),
        );
    } else articles.push(value);
  }
  return { articles, sources, limitations, retrievalRuns };
}
