"use client";
import { useEffect, useRef, useState } from "react";
import type { EditionResult, RunLogEntry } from "@/lib/types";
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
import PWAStatus from "./PWAStatus";
import Charm from "./Charm";
import StoryVisual from "./StoryVisual";
import DatePicker from "./DatePicker";
import Crossword from "./Crossword";
import GenerationProgress from "./GenerationProgress";
import { mergeRunLogs } from "@/lib/generation-progress";
type View = "today" | "reader" | "archive" | "mini" | "you";
const moods = ["blue", "pink", "mint", "yellow", "blue"] as const;
export default function USApp() {
  const [edition, setEdition] = useState<EditionResult | null>(null);
  const [runLogs, setRunLogs] = useState<RunLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
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
  useEffect(() => {
    if (!busy) return;
    const controller = new AbortController();
    const version = generation.current;
    let active = true;
    async function update() {
      try {
        const response = await fetch(`/api/studio/${selectedDate}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const state = await response.json();
        if (state.status === "failed") return;
        if (active && generation.current === version)
          setRunLogs((previous) =>
            mergeRunLogs(
              previous,
              state.run?.runLog ?? state.result?.runLog ?? [],
            ),
          );
      } catch {
        /* Stream events remain available if the checkpoint cannot be reached. */
      }
    }
    void update();
    const timer = setInterval(update, 4000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [busy, selectedDate]);
  async function openDate(day: string) {
    if (!selectableDay(day)) return;
    const version = ++generation.current;
    const current = () => version === generation.current;
    selectedDateRef.current = day;
    setSelectedDate(day);
    setPickerOpen(false);
    setRunLogs([]);
    setLoading(true);
    setBusy(false);
    setError(null);
    setEdition(null);
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
                if (current() && event.type === "log")
                  setRunLogs((previous) =>
                    mergeRunLogs(previous, [event.entry]),
                  );
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
        <div className="sidebar-note" aria-hidden="true">
          <Charm small mood="mint" />
        </div>
        <a className="studio-link" href={`/studio?date=${date}`}>
          Studio ↗
        </a>
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
            <strong>Edition unavailable</strong>
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
              <a href={`/studio?date=${date}`}>Details ↗</a>
            </div>
          </div>
        )}
        {loading && (
          <div className="loading-state" role="status">
            <Charm />
            <p>Loading edition…</p>
          </div>
        )}
        {busy && <GenerationProgress key={date} date={date} log={runLogs} />}
        {!loading && view === "today" && !busy && stories.length > 0 && (
          <>
            <section className="daily-hero">
              <div>
                <p className="eyebrow">
                  {stories.length} stories · {Math.max(3, stories.length)} min
                </p>
                <h1>
                  A fresh
                  <br />
                  <span>perspective.</span>
                </h1>
                {stories.length ? (
                  <div className="buttons">
                    <button className="primary" onClick={() => read()}>
                      {complete ? "Read again" : "Start reading"}
                      <span>↗</span>
                    </button>
                  </div>
                ) : null}
                {date !== today && (
                  <p className="edition-date-note">
                    {dateLabel(date, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orb orb-one" />
                <div className="orb orb-two" />
                <Charm />

                <span className="hero-spark">✳</span>
              </div>
            </section>
            {stories.length > 0 && (
              <>
                <div className="section-title">
                  <h2>Your edition</h2>
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
                          <span>Read story</span>
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
                    <h3>The Mini</h3>
                    <span>5 × 5 · Play ↗</span>
                  </button>
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
            />
          </>
        )}
        {view === "mini" && (
          <section className="mini-page">
            <div className="page-heading">
              <h1>The Mini</h1>
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
              <h1>Your jar</h1>
            </div>
            <div className="you-layout">
              <div className="jar-card">
                <div className="glass-jar">
                  <span className="jar-rim" />
                  <div className="jar-charms">
                    {Array.from(
                      {
                        length: Math.min(12, progress.days.length),
                      },
                      (_, i) => (
                        <Charm key={i} mood={moods[i % 5]} />
                      ),
                    )}
                  </div>
                  <span className="jar-label">½</span>
                </div>
              </div>
              <div className="you-stats">
                <div>
                  <strong>{progress.days.length}</strong>
                  <span>editions read</span>
                </div>
                <div>
                  <strong>{readingStreak(progress.days, today)}</strong>
                  <span>day streak</span>
                </div>

                <button
                  onClick={() => (stories.length ? read() : tab("today"))}
                >
                  Read your edition ↗
                </button>
              </div>
            </div>
          </section>
        )}
        <PWAStatus />
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
