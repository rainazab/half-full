import type { ApprovedStory } from "@/lib/types";
import { formatDate } from "@/lib/navigation";
export default function StoryReceipts({
  story,
  date,
}: {
  story: ApprovedStory;
  date?: string;
}) {
  const primary = story.sources.filter((source) =>
    story.sourceAssessments?.some(
      (a) => a.sourceId === source.id && a.kind === "primary",
    ),
  );
  return (
    <details className="story-receipts">
      <summary>
        See the receipts{" "}
        <span>
          {story.sources.length}{" "}
          {story.sources.length === 1 ? "source" : "sources"}
        </span>
      </summary>
      <p className="receipt-claim">
        <strong>The claim</strong>
        {story.centralClaim}
      </p>
      {!primary.length && (
        <p className="receipt-notice">
          No original document was retained. This story relies on attributed
          reporting.
        </p>
      )}
      {story.sources.map((source) => {
        const assessment = story.sourceAssessments?.find(
          (a) => a.sourceId === source.id,
        );
        const references = story.contentSupport
          ?.find((field) => field.field === "centralClaim")
          ?.evidence.filter((e) => e.sourceId === source.id);
        const evidence = references?.length
          ? references
          : (story.evidence?.filter((e) => e.sourceId === source.id) ?? []);
        return (
          <section className="receipt-source" key={source.id ?? source.url}>
            <div>
              <span>
                {assessment?.kind === "primary"
                  ? "Original document"
                  : assessment?.kind === "reporting"
                    ? "Reporting"
                    : "Source type not established"}
              </span>
              {source.publishedAt && (
                <time dateTime={source.publishedAt}>
                  {formatDate(source.publishedAt)}
                </time>
              )}
            </div>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.publisher}: {source.title} ↗
            </a>
            {evidence.length ? (
              <details>
                <summary>Read the cited passage</summary>
                {evidence.slice(0, 2).map((e) => (
                  <blockquote key={`${e.sourceId}/${e.passageId}`}>
                    <p>{e.excerpt}</p>
                    <cite>Retained passage {e.passageId}</cite>
                  </blockquote>
                ))}
              </details>
            ) : (
              <p>No passage was retained for this source.</p>
            )}
          </section>
        );
      })}
      {story.limitations?.length ? (
        <details className="receipt-limits">
          <summary>What remains uncertain</summary>
          <ul>
            {story.limitations.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="receipt-footer">
        Reviewed against retrieved evidence. This is not independent
        professional fact-checking.
      </p>
      <a
        href={`/studio?date=${date ?? ""}&story=${encodeURIComponent(story.id)}`}
      >
        Full evidence trail ↗
      </a>
    </details>
  );
}
