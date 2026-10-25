"use client";
import { useEffect, useRef, useState } from "react";
import type { EditionResult, RejectedStory, RunLogEntry } from "@/lib/types";
import { parseEdition } from "@/lib/edition-schema";
import { LiveRunError, runLive } from "@/lib/client";
import {
  dateLabel,
  editionDay,
  markRead,
  readingStreak,
  selectableDay,
  type ArchiveEntry,
  type ReadingProgress,
} from "@/lib/daily";
import EditionReader from "./EditionReader";
import Transparency, { RunLog } from "./Transparency";
import PWAStatus from "./PWAStatus";
import Charm from "./Charm";
import StoryVisual from "./StoryVisual";
import DatePicker from "./DatePicker";
import Crossword from "./Crossword";
type View = "today" | "reader" | "archive" | "mini" | "you" | "receipts";
type Health = {
  ready: boolean;
  configurationError: string | null;
  editor: { label: string; model: string } | null;
};
const moods = ["blue", "pink", "mint", "yellow", "blue"] as const;
export default function USApp() {
  const [edition, setEdition] = useState<EditionResult | null>(null);
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
    [today, setToday] = useState(editionDay);
  const [selectedDate, setSelectedDate] = useState(editionDay);
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedDateRef = useRef(selectedDate);
  const generation = useRef(0);
  const heading = useRef<HTMLDivElement>(null);
  function display(result: EditionResult) {
    setEdition(result);

    setAudit(result.rejectedStories);
    setLog(result.runLog);
    setRunId(result.edition.id);
    setStartIndex(0);
    setView("today");
    try {
      localStorage.setItem("half-full-last-edition", JSON.stringify(result));
    } catch {}
  }
  async function refreshDates() {
    try {
      const r = await fetch("/api/editions", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) setEntries(await r.json());
    } catch {
      /* The picker also works before any editions have been saved. */
    }
  }
  useEffect(() => {
    const current = editionDay();
    setToday(current);
    try {
      const p = JSON.parse(localStorage.getItem("us-reading-v1") ?? "null");
      if (p && Array.isArray(p.days) && p.reactions) setProgress(p);
    } catch {}
    const requested = new URLSearchParams(window.location.search).get("date");
    const day =
      requested && selectableDay(requested, current) ? requested : current;
    const online = () => setOffline(!navigator.onLine);
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    void refreshDates();
    void fetch("/api/health", { signal: AbortSignal.timeout(10000) })
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
    void openDate(day);
    let lastToday = current;
    const rollover = () => {
      const next = editionDay();
      if (next !== lastToday) {
        if (selectedDateRef.current === lastToday) void openDate(next);
        lastToday = next;
        setToday(next);
      }
    };
    const timer = window.setInterval(rollover, 60000);
    window.addEventListener("focus", rollover);
    return () => {
      generation.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", rollover);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
    // A date is loaded once on mount; date changes go through the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function openDate(day: string) {
    if (!selectableDay(day)) return;
    const version = ++generation.current;
    const current = () => version === generation.current;
    selectedDateRef.current = day;
    setSelectedDate(day);
    setPickerOpen(false);
    setLoading(true);
    setBusy(false);
    setError(null);
    setEdition(null);
    setAudit([]);
    setLog([]);
    setRunId(undefined);
    setView("today");
    window.history.replaceState(
      null,
      "",
      day === editionDay() ? "/" : `/?date=${day}`,
    );
    const saved = async () => {
      const r = await fetch(`/api/editions/${day}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (r.status === 404) return null;
      if (!r.ok)
        throw Error(
          "This edition could not be reached. Try this date again shortly.",
        );
      const result = parseEdition(await r.json());
      if (result.edition.date !== day || result.edition.mode !== "live")
        throw Error("The returned edition did not match your selected date.");
      return result;
    };
    try {
      let result = await saved();
      if (!current()) return;
      if (!result) {
        if (!navigator.onLine)
          throw Error(
            "Connect to the internet to prepare this date’s edition.",
          );
        setLoading(false);
        setBusy(true);
        const deadline = Date.now() + 360000;
        while (!result && current()) {
          try {
            result = await runLive(
              (event) => {
                if (!current()) return;
                if (event.type === "run") setRunId(event.runId);
                if (event.type === "log") setLog((l) => [...l, event.entry]);
              },
              fetch,
              day,
            );
          } catch (e) {
            if (
              !(e instanceof LiveRunError) ||
              e.failure.error.code !== "RUN_IN_PROGRESS" ||
              Date.now() >= deadline
            )
              throw e;
            // Another tab/server already owns publication. Reuse its edition when ready.
            await new Promise((resolve) => window.setTimeout(resolve, 5000));
            if (!current()) return;
            result = await saved();
          }
        }
      }
      if (result && current()) {
        if (result.edition.date !== day)
          throw Error("The generated edition did not match the selected date.");
        display(result);
        try {
          localStorage.setItem(
            "half-full-last-edition",
            JSON.stringify(result),
          );
        } catch {}
        void refreshDates();
      }
    } catch (e) {
      if (!current()) return;
      if (e instanceof LiveRunError) {
        setError(
          e.failure.error.code === "INSUFFICIENT_VERIFIED_STORIES" ||
            e.failure.error.code === "NO_USABLE_CANDIDATES"
            ? `We couldn’t retrieve enough well-supported reporting for ${dateLabel(day, { month: "long", day: "numeric", year: "numeric" })}. Nothing was published. Try another date.`
            : e.message,
        );
        setAudit(e.failure.rejectedStories ?? []);
        setLog(e.failure.runLog ?? []);
        setRunId(e.failure.runId);
      } else {
        // A dropped stream can still finish on the server. Check without starting another job.
        try {
          const recovered = await saved();
          if (recovered && current()) {
            display(recovered);
            return;
          }
        } catch {}
        if (current())
          setError(
            e instanceof Error
              ? e.message
              : "This edition isn’t available yet. Try the date again shortly.",
          );
      }
    } finally {
      if (current()) {
        setLoading(false);
        setBusy(false);
      }
    }
  }
  function tab(next: View) {
    if (next === "archive") {
      setPickerOpen(true);
      return;
    }
    if (next === "today" && selectedDate !== editionDay()) {
      void openDate(editionDay());
      return;
    }
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
  const date = selectedDate;
  const stories = edition?.edition.stories ?? [],
    complete = progress.days.includes(date);
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
          <div ref={heading} tabIndex={-1} className="date-picker-anchor">
            <button
              className="topbar-date date-trigger"
              onClick={() => setPickerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={pickerOpen}
            >
              {dateLabel(date, {
                weekday: "long",
                month: "short",
                day: "numeric",
                ...(date !== today ? { year: "numeric" } : {}),
              })}
              <span>
                {date === today
                  ? "Your daily edition"
                  : "Your edition, on this day"}{" "}
                <i aria-hidden="true">⌄</i>
              </span>
            </button>
          </div>
          <span className="mode-pill">
            <i />
            Live edition
          </span>
          <DatePicker
            open={pickerOpen}
            date={date}
            today={today}
            entries={entries}
            onClose={() => setPickerOpen(false)}
            onSelect={openDate}
          />
        </header>
        {offline && (
          <p className="status-banner" role="status">
            You’re offline. Reconnect to open another date.
          </p>
        )}
        {error && (
          <div className="error" role="alert">
            <strong>A little pause.</strong>
            <p>{error}</p>
            <div className="buttons">
              <button onClick={() => setPickerOpen(true)} disabled={busy}>
                Choose another date
              </button>
              <button
                onClick={() => openDate(selectedDate)}
                disabled={busy || offline}
              >
                Try this date again
              </button>
              <button onClick={() => tab("receipts")}>See what happened</button>
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
            <h2>
              {date === today
                ? "Finding the stories worth your time."
                : `A little window into ${dateLabel(date, { month: "long", day: "numeric", year: "numeric" })}.`}
            </h2>
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
            <p>
              {date === today
                ? "A few minutes of care. Once ready, today’s picks stay put."
                : "Retrieving original reporting from this day. We’ll keep this edition for next time."}
            </p>
            <details>
              <summary>Follow the evidence trail</summary>
              <RunLog log={log} />
            </details>
          </section>
        )}
        {!loading && view === "today" && !busy && stories.length > 0 && (
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
                ) : null}
                <p className="daily-promise">
                  {date === today
                    ? "One edition for today. Picked once, here whenever you are."
                    : `Reporting from ${dateLabel(date, { month: "long", day: "numeric", year: "numeric" })}. Retrieved and reviewed today.`}
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
              demo={false}
              date={date}
              initialIndex={startIndex}
              onComplete={() => {
                saveProgress(markRead(progress, date));
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
                demo={false}
                initialOpen
              />
            ) : (
              <div className="empty-card">
                <p>Open an edition to get its Mini.</p>
                <button onClick={() => openDate(today)}>
                  Open today’s edition
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
                  for taking a break. Past editions keep their original dates.
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
            {runId && (
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
