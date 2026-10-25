/** Re-review a failed historical edition from its actual retained Actor dataset, under normal publication controls. */
import { loadEnvConfig } from "@next/env";
import { DailyStore } from "../lib/daily-store";
import { getConfig } from "../lib/config";
import { generateEdition, pipelineDependencies } from "../lib/pipeline";
import { createRun, finishRun } from "../lib/store";
import { selectableDay, editionDay } from "../lib/daily";
async function main() {
  loadEnvConfig(process.cwd());
  const date = process.argv[2];
  if (!selectableDay(date) || date === editionDay())
    throw Error("Supply a supported historical date.");
  const config = getConfig(date),
    store = new DailyStore(),
    release = await store.lock();
  let record: ReturnType<typeof createRun> | undefined;
  try {
    if (await store.get(date))
      throw Error("Published editions cannot be replayed or replaced.");
    const failed = await store.getRun(date);
    if (failed?.status !== "failed" || !failed.apify)
      throw Error("A failed checkpoint with actual retrieval IDs is required.");
    const api = async (path: string) => {
      const r = await fetch(`https://api.apify.com/v2${path}`, {
        headers: { Authorization: `Bearer ${config.apifyToken}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw Error(`Apify HTTP ${r.status}`);
      return r.json();
    };
    const source = (
      await api(`/actor-runs/${encodeURIComponent(failed.apify.runId)}`)
    ).data;
    if (
      source.status !== "SUCCEEDED" ||
      source.defaultDatasetId !== failed.apify.datasetId ||
      source.actId !== config.receiptsActorId
    )
      throw Error(
        "Checkpoint does not identify a successful configured receipts Actor run.",
      );
    const rows = await api(
      `/datasets/${encodeURIComponent(failed.apify.datasetId)}/items?clean=true&format=json&limit=100`,
    );
    if (!Array.isArray(rows) || !rows.length)
      throw Error("The retained dataset is empty.");
    await store.admit(date);
    record = createRun(date);
    const result = await generateEdition(
      record,
      (entry) => console.log(JSON.stringify(entry)),
      {
        ...pipelineDependencies,
        getConfig: () => config,
        finishRun: () => {},
        retrieveNews: async (_config, log, onRun) => {
          log(
            "apify.start",
            "started",
            `Starting configured Actor ${config.receiptsActorId}; reusing its previously completed historical retrieval, no new crawl.`,
          );
          onRun(failed.apify!.runId, failed.apify!.datasetId);
          log(
            "apify.start",
            "completed",
            `Apify run ID: ${failed.apify!.runId}; dataset ID: ${failed.apify!.datasetId}.`,
          );
          log(
            "apify.dataset",
            "completed",
            `Reused ${rows.length} actual retained dataset packets from the failed attempt. No new Actor call.`,
          );
          return rows;
        },
      },
    );
    result.edition.date = date;
    release.assertOwned?.();
    const saved = await store.publish(result, date);
    finishRun(record, saved);
    await store.saveRun(record);
    console.log(
      JSON.stringify({
        published: saved.edition.id,
        date,
        stories: saved.edition.stories.length,
        evidenceReport: saved.evidenceReport,
        sourceRun: source.id,
      }),
    );
  } catch (error) {
    if (record) {
      finishRun(record);
      await store.saveRun(record).catch(() => {});
    }
    throw error;
  } finally {
    await release();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Replay failed");
  process.exitCode = 1;
});
