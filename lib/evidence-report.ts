import { z } from "zod";
import { actorRuns } from "./studio";
import type { ApprovedStory, CandidateStory, EditionResult } from "./types";
const count = z.number().int().nonnegative();
export const evidenceReportSchema = z.object({
  schemaVersion: z.literal(1),
  basis: z.enum(["pipeline", "retained-records"]),
  recordedAt: z.string().datetime(),
  retrievedCandidates: count.nullable(),
  normalizedArticles: count.nullable(),
  eligibleArticles: count.nullable(),
  approvedStories: count,
  excludedCandidates: count,
  originalDocumentCandidatesRetrieved: count.nullable(),
  retainedSources: count,
  retainedOriginalDocuments: count,
  storiesWithPrimaryPassages: count,
  publisherDomains: count,
  identifiedReportingGroups: count,
  validPassageReferences: count,
  unresolvedPassageReferences: count,
  excludedForInvalidEvidence: count,
  stageDurationsMs: z.record(z.string(), count),
  failedSteps: count,
  skippedSteps: count,
  actorRuns: z
    .array(
      z.object({
        actorId: z.string(),
        runId: z.string(),
        datasetId: z.string(),
        usageTotalUsd: z.number().nonnegative().optional(),
        durationMs: count.optional(),
      }),
    )
    .max(100),
});
export type EvidenceReport = z.infer<typeof evidenceReportSchema>;
export function evidenceReport(
  result: EditionResult,
  counts?: {
    normalizedArticles: number;
    eligibleArticles: number;
    supportingSources: CandidateStory[];
    retrievalRuns?: EvidenceReport["actorRuns"];
  },
): EvidenceReport {
  const stories = result.edition.stories,
    sources = new Map(stories.flatMap((s) => s.sources).map((s) => [s.url, s]));
  const primaries = new Set<string>(),
    groups = new Set<string>(),
    domains = new Set<string>(),
    passages = new Map<string, boolean>(),
    runs = new Map<string, EvidenceReport["actorRuns"][number]>();
  for (const run of actorRuns({
    date: result.edition.date ?? "",
    status: "completed",
    result,
  }))
    runs.set(run.runId, {
      actorId: run.actorId ?? "Not recorded",
      runId: run.runId,
      datasetId: run.datasetId,
    });
  for (const run of counts?.retrievalRuns ?? []) runs.set(run.runId, run);
  let withPrimary = 0;
  for (const story of stories) {
    let primary = false;
    for (const source of story.sources) {
      try {
        domains.add(new URL(source.url).hostname.replace(/^www\./, ""));
      } catch {}
      const a = story.sourceAssessments?.find((a) => a.sourceId === source.id);
      if (
        a?.kind === "reporting" &&
        !/^(unknown|unclear|unestablished)$/i.test(a.independenceGroup)
      )
        groups.add(a.independenceGroup.toLowerCase());
      const p = source.provenance;
      if (p && !runs.has(p.runId))
        runs.set(p.runId, {
          actorId: p.actorId,
          runId: p.runId,
          datasetId: p.datasetId,
        });
    }
    const refs = [
      ...(story.evidence ?? []),
      ...(story.contentSupport ?? []).flatMap((f) => f.evidence),
      ...(story.publicQuestion?.evidence ?? []),
      ...(story.narration?.evidence ?? []),
      ...[
        story.experience?.quick,
        story.experience?.explanation,
        story.experience?.background,
        ...(story.experience?.glossary ?? []),
      ].flatMap((part) => part?.evidence ?? []),
    ];
    for (const ref of refs) {
      const source = story.sources.find(
        (s) => s.id === ref.sourceId && s.url === ref.url,
      );
      const retained = story.evidence?.find(
        (e) =>
          e.sourceId === ref.sourceId &&
          e.passageId === ref.passageId &&
          e.excerpt === ref.excerpt &&
          e.url === ref.url,
      );
      const valid = !!source && !!retained;
      const key = `${ref.sourceId}/${ref.passageId}`;
      passages.set(key, (passages.get(key) ?? true) && valid);
      if (
        valid &&
        story.sourceAssessments?.some(
          (a) => a.sourceId === source.id && a.kind === "primary",
        )
      ) {
        primaries.add(source!.url);
        primary = true;
      }
    }
    if (primary) withPrimary++;
  }
  const durations: Record<string, number> = {};
  const starts = new Map<string, number>();
  for (const e of result.runLog) {
    if (e.status === "started") starts.set(e.step, Date.parse(e.timestamp));
    else if (starts.has(e.step)) {
      durations[e.step] = Math.max(
        0,
        Date.parse(e.timestamp) - starts.get(e.step)!,
      );
      starts.delete(e.step);
    }
  }
  return {
    schemaVersion: 1,
    basis: counts ? "pipeline" : "retained-records",
    recordedAt: new Date().toISOString(),
    retrievedCandidates: counts ? result.stats.candidatesFound : null,
    normalizedArticles: counts?.normalizedArticles ?? null,
    eligibleArticles: counts?.eligibleArticles ?? null,
    approvedStories: stories.length,
    excludedCandidates: result.rejectedStories.length,
    originalDocumentCandidatesRetrieved: counts
      ? new Set(counts.supportingSources.map((s) => s.url)).size
      : null,
    retainedSources: sources.size,
    retainedOriginalDocuments: primaries.size,
    storiesWithPrimaryPassages: withPrimary,
    publisherDomains: domains.size,
    identifiedReportingGroups: groups.size,
    validPassageReferences: [...passages.values()].filter(Boolean).length,
    unresolvedPassageReferences: [...passages.values()].filter((x) => !x)
      .length,
    excludedForInvalidEvidence: result.rejectedStories.filter((s) =>
      s.reason.startsWith("Editorial validation failed:"),
    ).length,
    stageDurationsMs: durations,
    failedSteps: result.runLog.filter((e) => e.status === "failed").length,
    skippedSteps: result.runLog.filter((e) => /\bskipp?ed?\b/i.test(e.message))
      .length,
    actorRuns: [...runs.values()],
  };
}
