/** Live integration run in a separate Apify KV namespace. Never alters the reader's published edition. */
import { loadEnvConfig } from "@next/env";
import { writeFile } from "node:fs/promises";
import { DailyStore } from "../lib/daily-store";
import { getConfig } from "../lib/config";
import { generateEdition, pipelineDependencies } from "../lib/pipeline";
import { createRun, finishRun } from "../lib/store";
import { editionDay } from "../lib/daily";
async function main() {
  loadEnvConfig(process.cwd());
  const config = getConfig(),
    day = editionDay(),
    namespace = `half-full-integration-${day.replaceAll("-", "")}`;
  const normal = new DailyStore(),
    isolated = new DailyStore(config.apifyToken, namespace),
    release = await normal.lock();
  let record: ReturnType<typeof createRun> | undefined;
  try {
    const current = await normal.get(day);
    if (!current)
      throw Error(
        "An existing published edition with actual retrieval provenance is required.",
      );
    const existing = await isolated.get(day);
    if (existing) {
      console.log(
        JSON.stringify({
          reused: existing.edition.id,
          namespace,
          report: existing.evidenceReport,
        }),
      );
      return;
    }
    const first = current.runLog.find(
      (e) => e.step === "apify.start" && e.status === "completed",
    );
    const ids = /Apify run ID: ([\w-]+); dataset ID: ([\w-]+)/.exec(
      first?.message ?? "",
    );
    if (!ids)
      throw Error("The published edition has no configured receipts run.");
    const api = async (path: string) => {
      const r = await fetch(`https://api.apify.com/v2${path}`, {
        headers: { Authorization: `Bearer ${config.apifyToken}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw Error(`Apify HTTP ${r.status}`);
      return r.json();
    };
    const source = (await api(`/actor-runs/${ids[1]}`)).data;
    if (
      source.status !== "SUCCEEDED" ||
      source.actId !== config.receiptsActorId ||
      source.defaultDatasetId !== ids[2]
    )
      throw Error("Source run does not match configured Actor provenance.");
    const rows = await api(
      `/datasets/${ids[2]}/items?clean=true&format=json&limit=100`,
    );
    if (!Array.isArray(rows) || !rows.length)
      throw Error("No retained evidence.");
    await normal.admit(day);
    record = createRun(day);
    const result = await generateEdition(record, undefined, {
      ...pipelineDependencies,
      getConfig: () => ({
        ...config,
        social: {
          enabled: false,
          actorId: config.social?.actorId ?? "apify~reddit-scraper",
        },
      }),
      finishRun: () => {},
      retrieveNews: async (_config, log, onRun) => {
        log(
          "apify.start",
          "started",
          `Starting configured Actor ${config.receiptsActorId}; integration review of its real retained dataset, no new crawl.`,
        );
        onRun(ids[1], ids[2]);
        log(
          "apify.start",
          "completed",
          `Apify run ID: ${ids[1]}; dataset ID: ${ids[2]}.`,
        );
        log(
          "apify.dataset",
          "completed",
          `Reused ${rows.length} retained packets from the existing edition's actual retrieval.`,
        );
        return rows;
      },
      reviewCandidates: async (...args) => {
        const raw = await pipelineDependencies.reviewCandidates(...args);
        await writeFile(
          "generated/master-editor-review.json",
          JSON.stringify(raw, null, 2),
        );
        return raw;
      },
    });
    result.edition.date = day;
    release.assertOwned?.();
    const saved = await isolated.publish(result, day);
    finishRun(record, saved);
    await isolated.saveRun(record);
    const reread = await new DailyStore(config.apifyToken, namespace).get(day);
    if (!reread?.evidenceReport || reread.edition.id !== saved.edition.id)
      throw Error("Report persistence check failed");
    if ((await new DailyStore().get(day))?.edition.id !== current.edition.id)
      throw Error("Original edition identity changed");
    const summary = {
      namespace,
      id: saved.edition.id,
      date: day,
      report: saved.evidenceReport,
      sourceRun: ids[1],
      sourceDataset: ids[2],
      originalEditionUnchanged: true,
    };
    await writeFile(
      "generated/master-evidence-publication.json",
      JSON.stringify(summary, null, 2),
    );
    console.log(JSON.stringify(summary));
  } finally {
    if (record && record.status === "running") finishRun(record);
    await release();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Integration verification failed",
  );
  process.exitCode = 1;
});
