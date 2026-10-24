"use client";
import { useEffect, useRef, useState } from "react";
import type { EditionResult, RejectedStory, RunLogEntry } from "@/lib/types";
import { parseEdition } from "@/lib/edition-schema";
import { LiveRunError, loadDemo, runLive } from "@/lib/client";
import { formatDate } from "@/lib/navigation";
import EditionReader from "./EditionReader";
import Transparency, { RunLog } from "./Transparency";
import PWAStatus from "./PWAStatus";
type Health = { ready: boolean; configurationError: string | null; editor: { label: string; model: string } | null };

export default function USApp({ initialMode = "live" }: { initialMode?: "live" | "demo" }) {
  const [mode, setMode] = useState(initialMode);
  const [edition, setEdition] = useState<EditionResult | null>(null);
  const [audit, setAudit] = useState<RejectedStory[]>([]);
  const [log, setLog] = useState<RunLogEntry[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [view, setView] = useState<"reader" | "transparency">("reader");
  const generation = useRef(0);
  const lastLive = useRef<EditionResult | null>(null);
  function display(result: EditionResult) { setEdition(result); setAudit(result.rejectedStories); setLog(result.runLog); setRunId(result.edition.id); setView("reader"); }
  useEffect(() => {
    const version = ++generation.current;
    const online = () => setOffline(!navigator.onLine);
    online(); window.addEventListener("online", online); window.addEventListener("offline", online);
    async function initialize() {
      try {
        if (initialMode === "demo") { const result = await loadDemo(); if (version === generation.current) display(result); }
        else {
          const results = await Promise.allSettled([
            fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(10000) }).then((r) => { if (!r.ok) throw Error("Server unavailable"); return r.json() as Promise<Health>; }),
            fetch("/api/today", { cache: "no-store", signal: AbortSignal.timeout(10000) }).then(async (r) => { if (r.status === 404) return null; if (!r.ok) throw Error("Latest edition unavailable"); return parseEdition(await r.json()); }),
          ]);
          if (version !== generation.current) return;
          if (results[0].status === "fulfilled") setHealth(results[0].value); else setError("The live server is unavailable. You can open the fixed demo below.");
          if (results[1].status === "fulfilled" && results[1].value) { lastLive.current = results[1].value; display(results[1].value); }
          else if (results[1].status === "rejected") setError("Could not load the latest edition. Retry live generation or open the fixed demo.");
        }
      } catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : "Unable to load edition."); }
      finally { if (version === generation.current) setLoading(false); }
    }
    void initialize();
    return () => { generation.current++; window.removeEventListener("online", online); window.removeEventListener("offline", online); };
  }, [initialMode]);
  async function chooseDemo() {
    generation.current++; setLoading(true); setError(null);
    try { const result = await loadDemo(); display(result); setMode("demo"); window.history.replaceState(null, "", "/demo"); }
    catch (e) { setError(e instanceof Error ? e.message : "Demo unavailable."); } finally { setLoading(false); }
  }
  async function chooseLive() {
    const version = ++generation.current;
    setMode("live"); setError(null); setView("reader"); setLoading(true);
    if (lastLive.current) display(lastLive.current); else { setEdition(null); setAudit([]); setLog([]); setRunId(undefined); }
    window.history.replaceState(null, "", "/");
    const results = await Promise.allSettled([
      fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(10000) }).then((r) => { if (!r.ok) throw Error(); return r.json() as Promise<Health>; }),
      fetch("/api/today", { cache: "no-store", signal: AbortSignal.timeout(10000) }).then(async (r) => { if (r.status === 404) return null; if (!r.ok) throw Error(); return parseEdition(await r.json()); }),
    ]);
    if (version !== generation.current) return;
    if (results[0].status === "fulfilled") setHealth(results[0].value);
    if (results[1].status === "fulfilled" && results[1].value) { lastLive.current = results[1].value; display(results[1].value); }
    if (results.some((result) => result.status === "rejected")) setError("The live server or latest edition is unavailable. The fixed demo remains available.");
    setLoading(false);
  }
  async function generate() {
    generation.current++; setBusy(true); setError(null); setAudit([]); setLog([]); setRunId(undefined);
    try {
      const result = await runLive((event) => { if (event.type === "run") setRunId(event.runId); if (event.type === "log") setLog((current) => [...current, event.entry]); });
      lastLive.current = result; display(result);
    } catch (e) {
      if (e instanceof LiveRunError) { setError(e.message); setAudit(e.failure.rejectedStories ?? []); setLog(e.failure.runLog ?? []); setRunId(e.failure.runId); }
      else setError("Generation failed or the connection timed out. Reload to check the latest edition before retrying. You can also open the fixed demo.");
    } finally { setBusy(false); }
  }
  function transparency() { setView("transparency"); setTimeout(() => document.getElementById("transparency-heading")?.focus(), 0); }
  return <main id="main"><header className="masthead"><div className="brand-line"><h1>US<span className="brand-dot">.</span></h1><span className="eyebrow">A little news. A little perspective.</span></div><p className="tagline">The world is a lot.<br />The news doesn’t have to be.</p><p className="note">Five stories or fewer. Read, listen, then get on with your day.</p><details className="about"><summary>How US works</summary><p className="note">Apify retrieves articles. {mode === "demo" ? "An AI editor" : health?.editor?.label ?? "The AI editor"} checks claims against retrieved evidence. This is not independent fact-checking. Cartesia narrates the reviewed stories.</p></details></header>
    {offline && <p className="notice" role="status">You’re offline. Live news requires a connection. The fixed demo may be available if downloaded during a previous visit.</p>}
    <section aria-label="Edition controls"><div className="buttons">{mode === "live" ? <><button disabled={busy || loading || offline} onClick={generate}>{busy ? "Creating edition…" : "Run today’s edition"}</button><button disabled={busy || loading} onClick={chooseDemo}>Open fixed demo</button></> : <button disabled={loading} onClick={chooseLive}>Switch to live mode</button>}</div>
      {mode === "live" && health && <details><summary>Server configuration: {health.ready ? "ready" : "setup required"}</summary><p>{health.editor?.label} · {health.editor?.model}</p>{health.configurationError && <p>{health.configurationError}</p>}</details>}
      {loading && <p role="status">Loading edition…</p>}
      {error && <div role="alert" className="error"><p>{error}</p>{mode === "live" && <p>No new edition was received. Check the latest edition after a connection failure; the server may still be finishing. Any edition shown below retains its original date.</p>}</div>}
      {busy && <div role="status"><p>Retrieving articles with Apify, then reviewing their evidence. This can take up to five minutes.</p><p>{log.at(-1)?.message ?? "Connecting to the server…"}</p></div>}
      {busy && <details><summary>Generation progress</summary><RunLog log={log} /></details>}
    </section>
    {edition?.edition.mode === "demo" && <aside className="demo-banner"><strong>Archived demo · {formatDate(edition.edition.createdAt)}</strong><span> Not freshly retrieved.</span><details><summary>About this archive</summary><p>{edition.edition.demoInfo?.notice}</p><p>Source dates and original evidence are available on every card.</p></details></aside>}
    {edition && <p className="note">Edition generated <time dateTime={edition.edition.createdAt}>{formatDate(edition.edition.createdAt)} (UTC)</time> · {edition.stats.approved} stories · {edition.stats.rejected} exclusions</p>}
    <nav className="buttons" aria-label="Edition sections"><button aria-pressed={view === "reader"} onClick={() => setView("reader")}>Read edition</button><button aria-pressed={view === "transparency"} onClick={transparency}>Exclusions & audit</button></nav>
    <div hidden={view !== "reader"}>{edition ? <EditionReader key={edition.edition.id} stories={edition.edition.stories} editionId={edition.edition.id} demo={mode === "demo"} active={view === "reader"} onTransparency={transparency} /> : !loading && !busy && <p>No edition yet. Run live generation or open the fixed demo. Demo mode needs no API keys.</p>}</div>
    <div hidden={view !== "transparency"}><Transparency audit={audit} log={log} />{runId && mode === "live" && <p className="note"><a href={`/api/run/${runId}`} target="_blank" rel="noopener noreferrer">Run record: {runId}</a></p>}</div>
    <footer><PWAStatus /></footer>
  </main>;
}
