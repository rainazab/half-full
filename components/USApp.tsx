"use client";
import { useEffect, useRef, useState } from "react";
import type { EditionResult, RejectedStory, RunLogEntry } from "@/lib/types";
import { parseEdition } from "@/lib/edition-schema";
import { LiveRunError, loadDemo, runLive } from "@/lib/client";
import {
  dateLabel,
  editionDay,
  markRead,
  readingStreak,
  type ArchiveEntry,
  type ReadingProgress,
} from "@/lib/daily";
import EditionReader from "./EditionReader";
import Transparency, { RunLog } from "./Transparency";
import PWAStatus from "./PWAStatus";
import Charm from "./Charm";
import StoryVisual from "./StoryVisual";
import ArchiveCalendar from "./ArchiveCalendar";
import Crossword from "./Crossword";
type View = "today" | "reader" | "archive" | "mini" | "you" | "receipts";
type Health = {
  ready: boolean;
  configurationError: string | null;
  editor: { label: string; model: string } | null;
};
const moods = ["blue", "pink", "mint", "yellow", "blue"] as const;
export default function USApp({
  initialMode = "live",
}: {
  initialMode?: "live" | "demo";
}) {
  const [mode, setMode] = useState(initialMode),
    [edition, setEdition] = useState<EditionResult | null>(null);
  const [audit, setAudit] = useState<RejectedStory[]>([]),
    [log, setLog] = useState<RunLogEntry[]>([]);
  const [health, setHealth] = useState<Health | null>(null),
    [error, setError] = useState<string | null>(null),
    [runId, setRunId] = useState<string>();
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [offline, setOffline] = useState(false),
    [view, setView] = useState<View>("today");
  const [entries, setEntries] = useState<ArchiveEntry[]>([]),
    [startIndex, setStartIndex] = useState(0);
  const [progress, setProgress] = useState<ReadingProgress>({
      days: [],
      reactions: {},
    }),
    [today, setToday] = useState("2026-10-24");
  const generation = useRef(0);
  const heading = useRef<HTMLDivElement>(null);
  function display(result: EditionResult) {
    setEdition(result);
    setMode(result.edition.mode === "demo" ? "demo" : "live");
    setAudit(result.rejectedStories);
    setLog(result.runLog);
    setRunId(result.edition.id);
    setStartIndex(0);
    setView("today");
  }
  async function archive() {
    const [saved, live] = await Promise.allSettled([
      fetch("/archive/index.json").then(
        (r) => r.json() as Promise<ArchiveEntry[]>,
      ),
      fetch("/api/editions", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }).then(async (r) => (r.ok ? ((await r.json()) as ArchiveEntry[]) : [])),
    ]);
    const all = [
      ...(saved.status === "fulfilled" ? saved.value : []),
      ...(live.status === "fulfilled" ? live.value : []),
    ];
    setEntries([...new Map(all.map((e) => [e.date, e])).values()]);
  }
  useEffect(() => {
    setToday(editionDay());
    try {
      const p = JSON.parse(localStorage.getItem("us-reading-v1") ?? "null");
      if (p && Array.isArray(p.days) && p.reactions) setProgress(p);
    } catch {}
    const online = () => setOffline(!navigator.onLine);
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    void archive();
    void openMode(initialMode);
    return () => {
      generation.current++;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
    // Initial mode comes from the route; subsequent changes are explicit button actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode]);
  async function openMode(next: "live" | "demo") {
    const version = ++generation.current;
    setLoading(true);
    setError(null);
    setMode(next);
    setView("today");
    setEdition(null);
    setAudit([]);
    setLog([]);
    setRunId(undefined);
    try {
      if (next === "demo") {
        const result = await loadDemo();
        if (version === generation.current) display(result);
      } else {
        const results = await Promise.allSettled([
          fetch("/api/health", {
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
          }).then((r) => r.json() as Promise<Health>),
          fetch("/api/today", {
            cache: "no-store",
            signal: AbortSignal.timeout(12000),
          }).then(async (r) => {
            if (r.status === 404) return null;
            if (!r.ok) throw Error("The daily edition could not be reached.");
            return parseEdition(await r.json());
          }),
        ]);
        if (version !== generation.current) return;
        if (results[0].status === "fulfilled") setHealth(results[0].value);
        if (results[1].status === "fulfilled" && results[1].value)
          display(results[1].value);
        if (results.some((r) => r.status === "rejected"))
          setError(
            "The live edition is unavailable right now. The saved archive is ready to explore.",
          );
      }
      window.history.replaceState(null, "", next === "demo" ? "/demo" : "/");
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : "Unable to open edition.");
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }
  async function generate() {
    generation.current++;
    setBusy(true);
    setError(null);
    setLog([]);
    setAudit([]);
    setRunId(undefined);
    try {
      const result = await runLive((event) => {
        if (event.type === "run") setRunId(event.runId);
        if (event.type === "log") setLog((l) => [...l, event.entry]);
      });
      display(result);
      void archive();
    } catch (e) {
      if (e instanceof LiveRunError) {
        setError(
          e.failure.error.code === "INSUFFICIENT_VERIFIED_STORIES"
            ? "Today’s batch didn’t contain enough well-supported stories. Nothing was published. You can read a saved edition while we leave the standards intact."
            : e.message,
        );
        setAudit(e.failure.rejectedStories ?? []);
        setLog(e.failure.runLog ?? []);
        setRunId(e.failure.runId);
      } else
        setError(
          "The connection ended before we received an edition. Check today’s edition before trying again; the server may still be finishing.",
        );
    } finally {
      setBusy(false);
    }
  }
  async function openArchive(entry: ArchiveEntry) {
    const version = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        entry.mode === "demo" ? entry.url! : `/api/editions/${entry.date}`,
        {
          cache: entry.mode === "demo" ? "default" : "no-store",
          signal: AbortSignal.timeout(12000),
        },
      );
      if (!r.ok)
        throw Error("This saved edition is unavailable. Try another date.");
      const result = parseEdition(await r.json());
      if (version === generation.current) {
        display(result);
        window.history.replaceState(
          null,
          "",
          result.edition.mode === "demo" ? "/demo" : "/",
        );
      }
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : "Archive unavailable.");
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }
  function tab(next: View) {
    setView(next);
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function read(index = 0) {
    setStartIndex(index);
    tab("reader");
  }
  function saveProgress(next: ReadingProgress) {
    setProgress(next);
    try {
      localStorage.setItem("us-reading-v1", JSON.stringify(next));
    } catch {}
  }
  const date =
    edition?.edition.date ?? edition?.edition.createdAt.slice(0, 10) ?? today;
  const stories = edition?.edition.stories ?? [],
    complete = progress.days.includes(date) && mode === "live";
  const nav: { view: View; label: string; icon: string }[] = [
    { view: "today", label: "Today", icon: "◒" },
    { view: "archive", label: "Calendar", icon: "▦" },
    { view: "mini", label: "The Mini", icon: "▧" },
    { view: "you", label: "Your jar", icon: "◡" },
  ];
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <button
          className="wordmark"
          onClick={() => tab("today")}
          aria-label="half full home"
        >
          half full<span aria-hidden="true">◒</span>
        </button>
        <p className="brand-caption">A little perspective.</p>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.view}
              aria-current={
                view === item.view ||
                (item.view === "today" && view === "reader")
                  ? "page"
                  : undefined
              }
              onClick={() => tab(item.view)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Charm small mood="mint" />
          <p>
            A little informed.
            <br />A little more present.
          </p>
        </div>
        <button className="quiet" onClick={() => tab("receipts")}>
          How we made this ↗
        </button>
      </aside>
      <main id="main" className="app-main">
        <header className="app-topbar">
          <button
            className="mobile-wordmark wordmark"
            onClick={() => tab("today")}
            aria-label="half full home"
          >
            half full<span aria-hidden="true">◒</span>
          </button>
          <div ref={heading} tabIndex={-1} className="topbar-date">
            {dateLabel(date, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
            <span>
              {mode === "demo"
                ? "The archive collection"
                : "Your daily edition"}
            </span>
          </div>
          <button
            className="mode-pill"
            disabled={busy || loading}
            onClick={() => openMode(mode === "demo" ? "live" : "demo")}
          >
            <i />
            {mode === "demo" ? "Archived demo" : "Live edition"}
            <span>⌄</span>
          </button>
        </header>
        {offline && (
          <p className="status-banner" role="status">
            You’re offline. Saved demo stories and downloaded audio are still
            here.
          </p>
        )}
        {mode === "demo" && edition && (
          <div className="archive-banner">
            <span>◷</span>
            <p>
              <strong>Saved archive, not breaking news.</strong>{" "}
              {edition.edition.demoInfo?.notice}
            </p>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            <strong>A little pause.</strong>
            <p>{error}</p>
            <div className="buttons">
              <button
                onClick={() => openMode("demo")}
                disabled={loading || busy}
              >
                Read the saved edition
              </button>
              <button onClick={() => tab("receipts")}>See what happened</button>
              {!busy && (
                <button onClick={() => openMode("live")}>
                  Check today’s edition
                </button>
              )}
            </div>
          </div>
        )}
        {loading && (
          <div className="loading-state" role="status">
            <Charm />
            <p>Opening your little window on the world…</p>
          </div>
        )}
        {busy && (
          <section className="generation-card" role="status">
            <Charm mood="mint" />
            <p className="eyebrow">A little care goes into every edition</p>
            <h2>Finding the stories worth your time.</h2>
            <div className="pipeline-steps">
              {["Discover", "Investigate", "Review", "Publish"].map(
                (name, i) => (
                  <span
                    key={name}
                    className={
                      log.some(
                        (l) =>
                          l.step.includes(
                            ["apify", "investigat", "review", "edition"][i],
                          ) && l.status === "completed",
                      )
                        ? "done"
                        : ""
                    }
                  >
                    {i + 1}. {name}
                  </span>
                ),
              )}
            </div>
            <p>{log.at(-1)?.message ?? "Connecting to Apify…"}</p>
            <details>
              <summary>Follow the evidence trail</summary>
              <RunLog log={log} />
            </details>
          </section>
        )}
        {!loading && view === "today" && !busy && (
          <>
            <section className="daily-hero">
              <div>
                <p className="eyebrow">
                  The world is a lot. The news doesn’t have to be.
                </p>
                <h1>
                  A little news.
                  <br />
                  <span>A little perspective.</span>
                </h1>
                <p>
                  {stories.length
                    ? `${stories.length} stories to make sense of your world. Then, back to living it.`
                    : "A few things worth understanding. A clear place to stop."}
                </p>
                {stories.length ? (
                  <div className="buttons">
                    <button className="primary" onClick={() => read()}>
                      {complete ? "Read it again" : "Open your edition"}
                      <span>↗</span>
                    </button>
                    <span className="reading-time">
                      ◷ About {Math.max(3, stories.length)} minutes
                    </span>
                  </div>
                ) : (
                  <div className="buttons">
                    <button
                      className="primary"
                      disabled={offline}
                      onClick={generate}
                    >
                      Prepare today’s edition ↗
                    </button>
                    <button onClick={() => openMode("demo")}>
                      Explore the archive
                    </button>
                  </div>
                )}
                <p className="daily-promise">
                  {stories.length
                    ? mode === "live"
                      ? "One edition for this date. No refresh rabbit hole."
                      : "Real saved reporting. Original source dates preserved."
                    : "Created once, saved for the day. Powered by Apify + Claude."}
                </p>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orb orb-one" />
                <div className="orb orb-two" />
                <Charm />
                <span className="floating-label">a little clarity ✧</span>
                <span className="hero-spark">✳</span>
              </div>
            </section>
            {stories.length > 0 && (
              <>
                <div className="section-title">
                  <h2>In your little edition</h2>
                  <span>{stories.length} stories · that’s all</span>
                </div>
                <div className="cover-grid">
                  {stories.map((story, i) => (
                    <article className={`cover-card tone-${i}`} key={story.id}>
                      <div className="cover-art">
                        <StoryVisual story={story} />
                        <span className="story-number">0{i + 1}</span>
                      </div>
                      <div className="cover-copy">
                        <p className="eyebrow">{story.category}</p>
                        <h3>
                          <button onClick={() => read(i)}>
                            {story.headline}
                          </button>
                        </h3>
                        <p>{story.experience?.quick.text ?? story.summary}</p>
                        <button
                          className="cover-bottom"
                          onClick={() => read(i)}
                        >
                          <span>Read or listen</span>
                          <span>↗</span>
                        </button>
                      </div>
                    </article>
                  ))}
                  <button className="cover-mini" onClick={() => tab("mini")}>
                    <span className="mini-cover-grid" aria-hidden="true">
                      {Array.from({ length: 25 }, (_, i) => (
                        <i
                          key={i}
                          className={
                            [0, 1, 5, 19, 23, 24].includes(i) ? "block" : ""
                          }
                        />
                      ))}
                    </span>
                    <p className="eyebrow">One small puzzle</p>
                    <h3>The daily Mini</h3>
                    <p>
                      A little brain break.
                      <br />
                      No homework energy.
                    </p>
                    <span>Play when you feel like it ↗</span>
                  </button>
                </div>
                <div className="trust-strip">
                  <span>✧</span>
                  <p>
                    <strong>What we leave out matters, too.</strong>
                    <br />
                    {edition!.stats.rejected} candidates excluded. Every
                    published claim has a trail back to retrieved evidence.
                  </p>
                  <button onClick={() => tab("receipts")}>Show me ↗</button>
                </div>
              </>
            )}
          </>
        )}
        {!loading && view === "reader" && edition && (
          <>
            <button
              className="back-to-cover quiet"
              onClick={() => tab("today")}
            >
              ← Back to the edition
            </button>
            <EditionReader
              key={`${edition.edition.id}-${startIndex}`}
              stories={stories}
              editionId={edition.edition.id}
              demo={mode === "demo"}
              date={date}
              initialIndex={startIndex}
              onComplete={() => {
                if (mode === "live") saveProgress(markRead(progress, date));
              }}
              onReaction={(id, mood) =>
                saveProgress({
                  ...progress,
                  reactions: { ...progress.reactions, [id]: mood },
                })
              }
              reactions={progress.reactions}
              onTransparency={() => tab("receipts")}
            />
          </>
        )}
        {view === "archive" && (
          <ArchiveCalendar
            entries={entries}
            today={today}
            onSelect={openArchive}
          />
        )}
        {view === "mini" && (
          <section className="mini-page">
            <div className="page-heading">
              <p className="eyebrow">A good place to end</p>
              <h1>A small square of satisfaction.</h1>
              <p>One original Mini. No extra levels, no pressure.</p>
            </div>
            {edition ? (
              <Crossword
                key={edition.edition.id}
                stories={stories}
                date={date}
                demo={mode === "demo"}
                initialOpen
              />
            ) : (
              <div className="empty-card">
                <p>Open an edition to get its Mini.</p>
                <button onClick={() => openMode("demo")}>
                  Try the archive Mini
                </button>
              </div>
            )}
          </section>
        )}
        {view === "you" && (
          <section className="you-page">
            <div className="page-heading">
              <p className="eyebrow">Your little corner</p>
              <h1>A glass a little fuller.</h1>
              <p>Small moments of understanding add up.</p>
            </div>
            <div className="you-layout">
              <div className="jar-card">
                <div className="glass-jar">
                  <span className="jar-rim" />
                  <div className="jar-charms">
                    {Array.from(
                      {
                        length: Math.min(12, Math.max(1, progress.days.length)),
                      },
                      (_, i) => (
                        <Charm key={i} mood={moods[i % 5]} />
                      ),
                    )}
                  </div>
                  <span className="jar-label">½</span>
                </div>
                <p>
                  {progress.days.length
                    ? "A little clarity, collected."
                    : "Your first little moment is waiting."}
                </p>
              </div>
              <div className="you-stats">
                <div>
                  <strong>{progress.days.length}</strong>
                  <span>daily editions finished</span>
                </div>
                <div>
                  <strong>{readingStreak(progress.days, today)}</strong>
                  <span>day reading streak · no pressure</span>
                </div>
                <p>
                  Saved on this device. No account, no leaderboard, no penalty
                  for taking a break. Archived demos don’t count as today’s
                  read.
                </p>
                <button
                  onClick={() => (stories.length ? read() : tab("today"))}
                >
                  Back to your edition ↗
                </button>
              </div>
            </div>
          </section>
        )}
        {view === "receipts" && (
          <section className="receipts-page">
            <div className="page-heading">
              <p className="eyebrow">Carefully in. Carefully out.</p>
              <h1>A little more transparent.</h1>
              <p>
                Apify gathers the reporting and original evidence. Claude checks
                what it supports. Social conversation informs context, never
                truth.
              </p>
            </div>
            <div className="architecture-strip">
              {["Discover", "Investigate", "Extract", "Review", "Publish"].map(
                (x, i) => (
                  <div key={x}>
                    <small>0{i + 1}</small>
                    <strong>{x}</strong>
                    <span>
                      {i < 3 ? "Apify" : i === 3 ? "Claude" : "half full"}
                    </span>
                  </div>
                ),
              )}
            </div>
            <Transparency audit={audit} log={log} />
            {runId && mode === "live" && (
              <a
                className="note"
                href={`/api/run/${runId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open the complete run record ↗
              </a>
            )}
            <details>
              <summary>Server & edition status</summary>
              <p>
                {health?.ready
                  ? "Server configuration ready."
                  : (health?.configurationError ??
                    "Live status has not been checked.")}
              </p>
              <p>
                Editor: {health?.editor?.label ?? "Anthropic Claude"}. Published
                editions are reused by date. Detailed evidence is available
                inside each story.
              </p>
            </details>
          </section>
        )}
        <footer className="app-footer">
          <span>Stay curious. Then go live a little.</span>
          <PWAStatus />
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.map((item) => (
          <button
            key={item.view}
            aria-current={
              view === item.view || (item.view === "today" && view === "reader")
                ? "page"
                : undefined
            }
            onClick={() => tab(item.view)}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
