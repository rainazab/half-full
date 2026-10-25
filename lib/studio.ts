import type { EditionResult, RunRecord, RunLogEntry } from "./types";
export type StudioState = {
  date: string;
  status: "empty" | "running" | "failed" | "completed";
  result?: EditionResult;
  run?: RunRecord;
};
export const flowStages = [
  {
    id: "discovery",
    label: "Discover",
    owner: "Apify",
    match: /^(apify|discovery)/,
    complete: /^(apify\.dataset|discovery)$/,
  },
  {
    id: "investigation",
    label: "Investigate",
    owner: "News Receipts",
    match: /^investigation/,
    complete: /^investigation$/,
  },
  {
    id: "extraction",
    label: "Extract",
    owner: "Apify",
    match: /^normalize/,
    complete: /^normalize$/,
  },
  {
    id: "editorial",
    label: "Compare & review",
    owner: "Claude",
    match: /review|repair|validate/,
    complete: /^validate$/,
  },
  {
    id: "publication",
    label: "Publish",
    owner: "half full",
    match: /^(edition$|archive\.save)/,
    complete: /^(edition$|archive\.save)/,
  },
];
export function stageState(
  stage: (typeof flowStages)[number],
  log: RunLogEntry[],
  status: StudioState["status"],
) {
  const relevant = log.filter((entry) => stage.match.test(entry.step));
  if (stage.id === "publication")
    return status === "completed"
      ? "completed"
      : relevant.length
        ? status === "failed"
          ? "failed"
          : "running"
        : "unrecorded";
  if (
    relevant.some(
      (entry) =>
        entry.status === "completed" && stage.complete.test(entry.step),
    )
  )
    return "completed";
  if (relevant.some((entry) => entry.status === "failed"))
    return stage.id === "investigation"
      ? "limited"
      : status === "failed"
        ? "failed"
        : "limited";
  if (relevant.length && status === "failed") return "failed";
  if (relevant.length && status === "running") return "running";
  return "unrecorded";
}
/** Links come only from actual source provenance or controlled server log IDs. */
export function actorRuns(state: StudioState) {
  const runs = new Map<
    string,
    { runId: string; datasetId: string; actorId?: string; role: string }
  >();
  const log = state.result?.runLog ?? state.run?.runLog ?? [];
  const configured = /Starting configured Actor ([\w~/-]+)/.exec(
    log.find(
      (entry) => entry.step === "apify.start" && entry.status === "started",
    )?.message ?? "",
  )?.[1];
  for (const entry of log) {
    const match =
      /(?:Apify|Social Apify) run ID: ([\w-]+); dataset ID: ([\w-]+)/.exec(
        entry.message,
      );
    if (match)
      runs.set(match[1], {
        runId: match[1],
        datasetId: match[2],
        actorId: entry.step.startsWith("social") ? undefined : configured,
        role: entry.step.startsWith("social")
          ? "Social context"
          : "News Receipts",
      });
  }
  if (state.run?.apify) {
    const a = state.run.apify;
    runs.set(a.runId, { ...a, actorId: configured, role: "News Receipts" });
  }
  for (const story of state.result?.edition.stories ?? [])
    for (const source of story.sources) {
      const p = source.provenance;
      if (p)
        runs.set(p.runId, {
          runId: p.runId,
          datasetId: p.datasetId,
          actorId: p.actorId,
          role:
            p.relationship === "discovery"
              ? "Article retrieval"
              : "Original-source retrieval",
        });
    }
  return [...runs.values()];
}
