"use client";

import { useEffect, useState } from "react";
import type { EditionResult, RejectedStory, RunLogEntry } from "@/lib/types";

type Failure = {
  runId?: string;
  error: { code: string; message: string };
  rejectedStories?: RejectedStory[];
  runLog?: RunLogEntry[];
};
type Health = { ready: boolean; environment: Record<string, boolean>; configurationError: string | null;
  requiredEnvironment: string[]; editor: { label: string; model: string; modelEnv: string } | null };

export default function Home() {
  const [edition, setEdition] = useState<EditionResult | null>(null);
  const [audit, setAudit] = useState<RejectedStory[]>([]);
  const [log, setLog] = useState<RunLogEntry[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(10000) }).then((response) => response.json()),
      fetch("/api/today", { cache: "no-store", signal: AbortSignal.timeout(10000) }).then(async (response) => response.ok ? await response.json() : null),
    ]).then(([status, latest]: [Health, EditionResult | null]) => {
      if (!active) return;
      setHealth(status);
      if (latest) {
        setEdition(latest); setAudit(latest.rejectedStories); setLog(latest.runLog); setRunId(latest.edition.id);
      }
    }).catch(() => { if (active) setError("Could not load server status. Check that the app is running and reload."); });
    return () => { active = false; };
  }, []);

  async function runEdition() {
    setRunning(true); setError(null); setLog([]); setAudit([]); setRunId(null);
    try {
      const response = await fetch("/api/run", { method: "POST", signal: AbortSignal.timeout(295000) });
      const body: EditionResult | Failure = await response.json();
      if (!response.ok || "error" in body) {
        const failure = body as Failure;
        setLog(failure.runLog ?? []); setAudit(failure.rejectedStories ?? []); setRunId(failure.runId ?? null);
        setError(failure.error?.message ?? `The server returned HTTP ${response.status}.`);
        return;
      }
      const result = body as EditionResult;
      setEdition(result); setAudit(result.rejectedStories); setLog(result.runLog); setRunId(result.edition.id);
    } catch {
      setError("The request failed or exceeded its time limit. Check the server terminal and /api/today before retrying; a run may still be finishing.");
    } finally { setRunning(false); }
  }

  return <main>
    <header>
      <h1>US</h1>
      <p>A finite news edition. Three to five stories, then you’re done.</p>
      <p className="note">Apify retrieves current articles. {health?.editor?.label ?? "The AI editor"} reviews their evidence. “Verified” means supported by the retrieved text; it is not a guarantee of truth.</p>
    </header>

    <section aria-label="Generate edition">
      <button onClick={runEdition} disabled={running}>{running ? "Creating edition…" : "Run today’s edition"}</button>
      {running && <p role="status">Discovering news with Apify, then checking it with {health?.editor?.label ?? "the AI editor"}. This can take a few minutes.</p>}
      {health && <details>
        <summary>Server configuration: {health.ready ? "ready" : "setup required"}</summary>
        {health.editor && <p>Editor: {health.editor.label} · {health.editor.model}</p>}
        <ul>{Object.entries(health.environment).map(([name, present]) => <li key={name}>
          <code>{name}</code>: {present ? "set" : health.requiredEnvironment.includes(name) ? "missing" : name === health.editor?.modelEnv ? "using server default" : "optional / not used"}
        </li>)}</ul>
        {health.configurationError && <p>{health.configurationError}</p>}
      </details>}
      {error && <p className="error" role="alert">{error}</p>}
      {runId && <p className="note">Run: <a href={`/api/run/${runId}`}>{runId}</a></p>}
    </section>

    {edition ? <section aria-label="Latest successful edition">
      <h2>Latest successful edition</h2>
      <p>Generated <time dateTime={edition.edition.createdAt}>{new Date(edition.edition.createdAt).toLocaleString()}</time> · {edition.stats.approved} approved · {edition.stats.rejected} excluded</p>
      {edition.edition.stories.map((story) => <article key={story.id}>
        <p className="note">{story.category} · {story.verificationStatus} · confidence {Math.round(story.confidence * 100)}% · hype {Math.round(story.hypeScore * 100)}%</p>
        <h3>{story.headline}</h3>
        <p>{story.summary}</p>
        <p><strong>Why it matters:</strong> {story.whyItMatters}</p>
        <p><strong>One step:</strong> {story.action}</p>
        <details><summary>Claim and evidence review</summary>
          <p><strong>Central claim:</strong> {story.centralClaim}</p>
          <p>{story.verificationReason}</p>
        </details>
        <ul>{story.sources.map((source) => <li key={source.url}>
          <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
          {" — "}{source.publisher}{source.publishedAt ? ` · ${new Date(source.publishedAt).toLocaleDateString()}` : " · publication date unavailable"}
        </li>)}</ul>
      </article>)}
      <p className="caught-up"><strong>You’re caught up.</strong> Close the app and get on with your day.</p>
    </section> : !running && <p>No edition yet. Run the pipeline to create one from real news.</p>}

    <section aria-label="Rejected story audit">
      <h2>Excluded stories from the last attempt ({audit.length})</h2>
      <p className="note">Uncertain stories lack sufficient evidence. Rejected stories fail editorial checks or are outside the finite edition’s limits.</p>
      {audit.map((story, index) => <article key={`${story.url}-${index}`}>
        <h3>{story.title}</h3>
        <p>{story.verificationStatus} · confidence {Math.round(story.confidence * 100)}%</p>
        <p>{story.reason}</p>
        {story.url && <a href={story.url} target="_blank" rel="noopener noreferrer">Original source</a>}
      </article>)}
      {!audit.length && <p>No exclusions to display.</p>}
    </section>

    <section aria-label="Pipeline run log">
      <h2>Run log</h2>
      {log.length ? <ol>{log.map((entry, index) => <li key={index}>
        <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleTimeString()}</time>{" "}
        <strong>{entry.step}</strong> [{entry.status}] — {entry.message}
      </li>)}</ol> : <p>{running ? "The full log will appear when the request finishes." : "Run the pipeline to see its stages."}</p>}
    </section>
  </main>;
}
