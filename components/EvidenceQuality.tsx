import type { EditionResult } from "@/lib/types";
import { evidenceReport } from "@/lib/evidence-report";
export default function EvidenceQuality({ result }: { result: EditionResult }) {
  const report = result.evidenceReport ?? evidenceReport(result);
  const metrics = [
    ["Approved stories", report.approvedStories],
    ["With primary passages", report.storiesWithPrimaryPassages],
    ["Valid retained passages", report.validPassageReferences],
    ["Publisher domains", report.publisherDomains],
  ] as const;
  const rows = [
    ["Retrieved candidate records", report.retrievedCandidates],
    ["Normalized unique articles", report.normalizedArticles],
    ["Articles submitted for review", report.eligibleArticles],
    ["Excluded candidate records", report.excludedCandidates],
    [
      "Supporting document candidates retrieved",
      report.originalDocumentCandidatesRetrieved,
    ],
    ["Retained primary documents", report.retainedOriginalDocuments],
    ["Identified reporting-origin groups", report.identifiedReportingGroups],
    ["Unresolved retained references", report.unresolvedPassageReferences],
    [
      "Excluded for invalid evidence structure",
      report.excludedForInvalidEvidence,
    ],
    ["Failed processing steps", report.failedSteps],
    ["Recorded skips", report.skippedSteps],
  ] as const;
  return (
    <section className="quality-report" aria-label="Behind this edition">
      <div className="quality-heading">
        <div>
          <p className="eyebrow">Behind this edition</p>
          <h2>Reporting you can trace.</h2>
        </div>
        <span>
          {report.basis === "pipeline"
            ? "Recorded at publication"
            : "Read-only summary of retained records"}
        </span>
      </div>
      <div className="quality-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="quality-note">
        These are retrieval and reference counts, not a truth score. “Primary”
        and reporting-origin labels include editorial judgments. Different
        publishers do not automatically mean independent reporting.
      </p>
      <details>
        <summary>Counts, timing & definitions</summary>
        <dl className="quality-counts">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? "Not recorded"}</dd>
            </div>
          ))}
        </dl>
        <p>
          Unique articles are normalized before date filtering and the
          20-article review cap. Supporting document candidates are separately
          retrieved leads, not automatically primary evidence. A valid retained
          passage matches its source ID, URL and exact stored excerpt.
          Unresolved references concern retained copy only; invalid exclusions
          are counted separately. Origin groups are conservative
          classifications, not a count of independently verified claims.
        </p>
        <ul>
          {Object.entries(report.stageDurationsMs).map(([step, ms]) => (
            <li key={step}>
              {step}: {(ms / 1000).toFixed(1)} s
            </li>
          ))}
        </ul>
        {!Object.keys(report.stageDurationsMs).length && (
          <p>Stage durations: Not recorded.</p>
        )}
        <h3>Recorded retrieval runs</h3>
        <ul>
          {report.actorRuns.map((run) => (
            <li key={run.runId}>
              <a
                href={`https://console.apify.com/actors/runs/${run.runId}`}
                target="_blank"
                rel="noreferrer"
              >
                {run.actorId} · {run.runId}
              </a>
              {" → "}
              <a
                href={`https://console.apify.com/storage/datasets/${run.datasetId}`}
                target="_blank"
                rel="noreferrer"
              >
                Dataset {run.datasetId}
              </a>
              {run.usageTotalUsd !== undefined &&
                ` · Provider-reported run usage $${run.usageTotalUsd.toFixed(5)}`}
            </li>
          ))}
        </ul>
        <p>
          Run usage is shown only when Apify records it. Parent and child usage
          can overlap; these figures are not added into an edition price.
        </p>
      </details>
    </section>
  );
}
