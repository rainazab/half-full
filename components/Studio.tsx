"use client";
import { useEffect, useState } from "react";
import {
  actorRuns,
  flowStages,
  stageState,
  type StudioState,
} from "@/lib/studio";
import {
  dateLabel,
  editionDay,
  selectableDay,
  type ArchiveEntry,
} from "@/lib/daily";
import type { ApprovedStory, Source } from "@/lib/types";
import DatePicker from "./DatePicker";
import { RunLog } from "./Transparency";

function SourcePacket({
  story,
  source,
  label,
}: {
  story: ApprovedStory;
  source?: Source;
  label: string;
}) {
  const evidence =
    story.evidence?.filter((item) => item.sourceId === source?.id) ?? [];
  const assessment = story.sourceAssessments?.find(
    (item) => item.sourceId === source?.id,
  );
  return (
    <section className="comparison-card">
      <p className="eyebrow">{label}</p>
      {source ? (
        <>
          <a
            className="comparison-source"
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.publisher} ↗
          </a>
          {evidence[0] ? (
            <blockquote>{evidence[0].excerpt}</blockquote>
          ) : (
            <p className="studio-muted">No retained passage for this source.</p>
          )}
          {assessment && (
            <p className="source-assessment">{assessment.explanation}</p>
          )}
          {source.provenance && (
            <details className="source-provenance">
              <summary>Retrieval record</summary>
              <dl>
                <dt>Actor</dt>
                <dd>{source.provenance.actorId}</dd>
                <dt>Run</dt>
                <dd>
                  <a
                    href={`https://console.apify.com/actors/runs/${encodeURIComponent(source.provenance.runId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.provenance.runId} ↗
                  </a>
                </dd>
                <dt>Dataset item</dt>
                <dd>
                  <a
                    href={`https://console.apify.com/storage/datasets/${encodeURIComponent(source.provenance.datasetId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.provenance.datasetId} · item{" "}
                    {source.provenance.itemIndex} ↗
                  </a>
                </dd>
                <dt>Retrieved</dt>
                <dd>
                  {new Date(source.provenance.retrievedAt).toLocaleString()}
                </dd>
                <dt>SHA-256</dt>
                <dd>
                  <code>{source.provenance.contentHash}</code>
                </dd>
              </dl>
            </details>
          )}
        </>
      ) : (
        <p className="studio-muted">
          {label === "Primary document"
            ? "No primary document was retained for this story. The decision relies on attributed reporting."
            : "No separate reporting source was retained for this story."}
        </p>
      )}
    </section>
  );
}

export default function Studio() {
  const [date, setDate] = useState(editionDay);
  const [ready, setReady] = useState(false);
  const [picker, setPicker] = useState(false);
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [state, setState] = useState<StudioState>();
  const [error, setError] = useState("");
  const [storyId, setStoryId] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requested = params.get("date");
    if (requested && selectableDay(requested)) setDate(requested);
    setStoryId(params.get("story") ?? "");
    setReady(true);
    void fetch("/api/editions", { signal: AbortSignal.timeout(10000) })
      .then((r) => (r.ok ? r.json() : []))
      .then(setEntries)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!ready) return;
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setState(undefined);
    setError("");
    async function load() {
      try {
        const response = await fetch(`/api/studio/${date}`, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20000),
          ]),
        });
        const value = await response.json();
        if (!response.ok)
          throw Error(
            value.error?.message ?? "The generation record is unavailable.",
          );
        if (closed) return;
        setState(value);
        setError("");
        if (value.status !== "completed")
          timer = setTimeout(load, value.status === "running" ? 3000 : 8000);
      } catch (e) {
        if (!closed)
          setError(
            e instanceof Error ? e.message : "Could not load this record.",
          );
      }
    }
    void load();
    return () => {
      closed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [date, ready, refresh]);
  const result = state?.result;
  const log = result?.runLog ?? state?.run?.runLog ?? [];
  const stats = result?.stats ?? state?.run?.stats;
  const audit = result?.rejectedStories ?? state?.run?.rejectedStories ?? [];
  const stories = result?.edition.stories ?? [];
  const story = stories.find((s) => s.id === storyId) ?? stories[0];
  const primary = story?.sources.find((source) =>
    story.sourceAssessments?.some(
      (a) => a.sourceId === source.id && a.kind === "primary",
    ),
  );
  const reporting =
    story?.sources.find((source) =>
      story.sourceAssessments?.some(
        (a) => a.sourceId === source.id && a.kind === "reporting",
      ),
    ) ?? story?.sources.find((source) => source.id !== primary?.id);
  function choose(day: string) {
    setDate(day);
    setPicker(false);
    setStoryId("");
    history.replaceState(null, "", `/studio?date=${day}`);
  }
  return (
    <main id="main" className="studio-shell">
      <header className="studio-header">
        <a className="studio-brand" href="/">
          half full<span aria-hidden="true">◒</span>
        </a>
        <span>Editorial studio</span>
        <a href={date === editionDay() ? "/" : `/?date=${date}`}>
          Open edition ↗
        </a>
      </header>
      <div className="studio-title">
        <div>
          <p className="eyebrow">Generation record</p>
          <h1>From source to story.</h1>
        </div>
        <button
          className="studio-date"
          aria-haspopup="dialog"
          aria-expanded={picker}
          onClick={() => setPicker(true)}
        >
          {dateLabel(date, { month: "short", day: "numeric", year: "numeric" })}{" "}
          ⌄
        </button>
      </div>
      <DatePicker
        open={picker}
        date={date}
        today={editionDay()}
        entries={entries}
        onClose={() => setPicker(false)}
        onSelect={choose}
      />
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          <button onClick={() => setRefresh((v) => v + 1)}>Retry</button>
        </div>
      )}
      {!state && !error && (
        <p role="status" className="studio-muted">
          Loading record…
        </p>
      )}
      {state && (
        <>
          <div className="studio-status">
            <span className={`process-status ${state.status}`}>
              <i />
              {state.status === "completed"
                ? "Published"
                : state.status === "running"
                  ? "In progress"
                  : state.status === "failed"
                    ? "Not published"
                    : "No edition yet"}
            </span>
            <span>
              {result
                ? `Published ${new Date(result.edition.createdAt).toLocaleString()}`
                : state.run
                  ? `Started ${new Date(state.run.createdAt).toLocaleString()}`
                  : "Open this date in the app to prepare its edition."}
            </span>
            {state.status !== "running" && (
              <button
                onClick={() => setRefresh((v) => v + 1)}
                aria-label="Refresh generation record"
              >
                ↻
              </button>
            )}
          </div>
          <div className="studio-stats">
            <div>
              <strong>{stats?.candidatesFound ?? "—"}</strong>
              <span>candidate records</span>
            </div>
            <div>
              <strong>{stats?.approved ?? "—"}</strong>
              <span>
                {state.status === "completed"
                  ? "published stories"
                  : "approved stories"}
              </span>
            </div>
            <div>
              <strong>{stats?.rejected ?? "—"}</strong>
              <span>excluded records</span>
            </div>
            <div>
              <strong>
                {result
                  ? new Set(
                      stories.flatMap((s) =>
                        s.sources.map((source) => source.url),
                      ),
                    ).size
                  : "—"}
              </strong>
              <span>retained sources</span>
            </div>
          </div>
          <section className="studio-flow" aria-label="Generation pipeline">
            {flowStages.map((stage, i) => {
              const status = stageState(stage, log, state.status);
              const latest = log
                .filter((entry) => stage.match.test(entry.step))
                .at(-1);
              return (
                <article key={stage.id} className={`flow-node ${status}`}>
                  <span className="flow-number">0{i + 1}</span>
                  <span className="flow-owner">{stage.owner}</span>
                  <h2>{stage.label}</h2>
                  <span className="flow-state">
                    {status === "unrecorded" ? "Not recorded" : status}
                  </span>
                  {latest && <p>{latest.message}</p>}
                </article>
              );
            })}
          </section>
          {state.run?.error && (
            <div className="studio-failure">
              <strong>{state.run.error.code}</strong>
              <p>{state.run.error.message}</p>
            </div>
          )}
          {actorRuns(state).length > 0 && (
            <section className="studio-section">
              <h2>Actor runs</h2>
              <div className="actor-run-list">
                {actorRuns(state).map((run) => (
                  <article key={run.runId}>
                    <span>{run.role}</span>
                    <strong>{run.actorId ?? "Configured Actor"}</strong>
                    <a
                      href={`https://console.apify.com/actors/runs/${encodeURIComponent(run.runId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Run {run.runId} ↗
                    </a>
                    <a
                      href={`https://console.apify.com/storage/datasets/${encodeURIComponent(run.datasetId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Dataset {run.datasetId} ↗
                    </a>
                  </article>
                ))}
              </div>
            </section>
          )}
          {story && (
            <section className="studio-section">
              <div className="studio-section-title">
                <h2>Source comparison</h2>
                <label>
                  <span className="sr-only">Story to inspect</span>
                  <select
                    aria-label="Story to inspect"
                    value={story.id}
                    onChange={(e) => setStoryId(e.target.value)}
                  >
                    {stories.map((s, i) => (
                      <option key={s.id} value={s.id}>
                        {i + 1}. {s.headline}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="comparison-claim">
                <p className="eyebrow">Claim reviewed</p>
                <h3>{story.centralClaim}</h3>
                <p>{story.verificationReason}</p>
              </div>
              <div className="comparison-grid">
                <SourcePacket
                  story={story}
                  source={reporting}
                  label="Retrieved reporting"
                />
                <SourcePacket
                  story={story}
                  source={primary}
                  label="Primary document"
                />
                <section className="comparison-card published-copy">
                  <p className="eyebrow">Published copy</p>
                  <h3>{story.headline}</h3>
                  <p>{story.summary}</p>
                  {story.action.trim() && (
                    <h4>
                      {story.closingType === "bright-side"
                        ? "The bright side"
                        : story.closingType === "response"
                          ? "What’s being done"
                          : "Next steps"}
                    </h4>
                  )}
                  <p>{story.action}</p>
                  <span className="confidence-label">
                    Editor estimate: {Math.round(story.confidence * 100)}%
                    confidence
                  </span>
                </section>
              </div>
              <details className="studio-details">
                <summary>Field-to-evidence references</summary>
                <div className="field-evidence">
                  {(story.contentSupport ?? []).map((field, i) => (
                    <section key={`${field.field}-${i}`}>
                      <h4>
                        {field.field === "action"
                          ? "The bright side"
                          : field.field.replace(/([A-Z])/g, " $1")}
                      </h4>
                      <p>{field.text}</p>
                      {field.evidence.map((e, j) => (
                        <details key={`${e.sourceId}-${e.passageId}-${j}`}>
                          <summary>
                            {e.publisher} · {e.sourceId}/{e.passageId}
                          </summary>
                          <blockquote>{e.excerpt}</blockquote>
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Original source ↗
                          </a>
                        </details>
                      ))}
                    </section>
                  ))}
                </div>
              </details>
              {story.limitations?.length ? (
                <details className="studio-details">
                  <summary>Limitations</summary>
                  <ul>
                    {story.limitations.map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {story.socialContext?.posts.length ? (
                <details className="studio-details">
                  <summary>
                    Social context · {story.socialContext.posts.length} retained
                    posts
                  </summary>
                  <p>{story.socialContext.notice}</p>
                  {story.socialContext.posts.map((post) => (
                    <p key={post.id}>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {post.title} ↗
                      </a>
                    </p>
                  ))}
                </details>
              ) : null}
            </section>
          )}
          <section className="studio-section">
            <h2>Editorial decisions</h2>
            <p className="studio-muted">
              Evidence support and editorial selection are distinct. Exclusion
              does not establish that a story is false.
            </p>
            <div className="decision-list">
              {audit.map((item, i) => (
                <details key={`${item.url}-${i}`}>
                  <summary>
                    <span className={item.verificationStatus}>
                      {item.verificationStatus === "uncertain"
                        ? "Uncertain"
                        : "Excluded"}
                    </span>
                    <strong>{item.title}</strong>
                  </summary>
                  <p>{item.reason}</p>
                  {item.centralClaim && (
                    <p>
                      <strong>Claim:</strong> {item.centralClaim}
                    </p>
                  )}
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    Original source ↗
                  </a>
                </details>
              ))}
              {!audit.length && (
                <p className="studio-muted">No exclusions recorded.</p>
              )}
            </div>
          </section>
          <details className="studio-details full-run-log">
            <summary>Complete processing log · {log.length} events</summary>
            <RunLog log={log} />
          </details>
          <p className="studio-disclaimer">
            Passages and provenance show what was retrieved. Editorial
            confidence and source classifications are model judgments, not
            independent fact-checking.
          </p>
        </>
      )}
    </main>
  );
}
