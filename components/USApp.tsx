"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
} from "@/lib/daily";
import EditionReader from "./EditionReader";
import PWAStatus from "./PWAStatus";
import Charm from "./Charm";
import DatePicker from "./DatePicker";
import Crossword from "./Crossword";
import useProfile from "@/hooks/useProfile";
import usePreferences from "@/hooks/usePreferences";
import { ProfileAvatar } from "./ProfileCard";
import ProfilePage from "./ProfilePage";
import Icon, { type IconName } from "./Icon";
import { positionKey, validPosition } from "@/lib/reading-position";
import GenerationProgress from "./GenerationProgress";
import TodayHome from "./TodayHome";
import OnboardingFlow from "./OnboardingFlow";
import {
  clearOnboarding,
  ONBOARDING_VERSION,
  readOnboarding,
  shouldShowOnboarding,
  writeOnboarding,
} from "@/lib/onboarding";
import type { StoryboardIndex } from "@/lib/storyboard";
import { mergeRunLogs } from "@/lib/generation-progress";
type View = "today" | "reader" | "archive" | "mini" | "you" | "profile";
const moods = ["blue", "pink", "mint", "yellow", "blue"] as const;
const reactionArt = [
  { label: "Interesting", image: "interesting" },
  { label: "Insightful", image: "insightful" },
  { label: "Hopeful", image: "hopeful" },
  { label: "Stressed", image: "stressed" },
] as const;
const normalizeMood = (mood: string) =>
  mood === "Clearer" ? "Insightful" : mood === "A lot" ? "Stressed" : mood;
export default function USApp() {
  const [edition, setEdition] = useState<EditionResult | null>(null);
  const [runLogs, setRunLogs] = useState<RunLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [offline, setOffline] = useState(false),
    [view, setView] = useState<View>("today");
  const [position, setPosition] = useState(0);
  const [listenFirst, setListenFirst] = useState(false);
  const [storyboards, setStoryboards] = useState<StoryboardIndex>({});
  // First-run intro: decided once from device storage and the URL, never from the edition.
  const [intro, setIntro] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<ArchiveEntry[]>([]),
    [startIndex, setStartIndex] = useState(0);
  const profile = useProfile();
  const settings = usePreferences();
  const { progress, saveProgress } = profile;
  const [today, setToday] = useState(editionDay);
  const [selectedDate, setSelectedDate] = useState(editionDay);
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedDateRef = useRef(selectedDate);
  const generation = useRef(0);
  const heading = useRef<HTMLElement>(null);
  function display(result: EditionResult) {
    setEdition(result);
    setStoryboards({});
    // Existing illustrations are read-only presentation data; this never generates any.
    if (result.edition.date)
      fetch(`/api/illustrations/${result.edition.date}`, {
        signal: AbortSignal.timeout(15000),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((value) => {
          if (value?.date === result.edition.date && value.storyboards)
            setStoryboards(value.storyboards as StoryboardIndex);
        })
        .catch(() => {});

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
    setIntro(
      shouldShowOnboarding(
        readOnboarding(window.localStorage),
        window.location.search,
      ),
    );
    const current = editionDay();
    setToday(current);
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
  useEffect(() => {
    const restore = () => {
      setListenFirst(false);
      setStartIndex(position);
      setView(window.history.state?.halfFullReader ? "reader" : "today");
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [position]);
  function exitReader() {
    if (window.history.state?.halfFullReader) window.history.back();
    else tab("today");
  }
  function read(index = position, listen = false) {
    if (view !== "reader")
      window.history.pushState(
        { halfFullReader: true },
        "",
        window.location.href,
      );
    setListenFirst(listen);
    setStartIndex(index);
    tab("reader");
  }
  useEffect(() => {
    if (edition) {
      try {
        setPosition(
          validPosition(
            JSON.parse(
              localStorage.getItem(
                positionKey(edition.edition.id, profile.user?.uid),
              ) ?? "0",
            ),
            edition.edition.stories.length,
          ),
        );
      } catch {
        setPosition(0);
      }
    }
  }, [edition, profile.user?.uid]);
  const rememberPosition = useCallback(
    (index: number) => {
      setPosition(index);
      if (edition)
        try {
          localStorage.setItem(
            positionKey(edition.edition.id, profile.user?.uid),
            JSON.stringify(index),
          );
        } catch {}
    },
    [edition, profile.user?.uid],
  );
  const date = selectedDate;
  const stories = edition?.edition.stories ?? [],
    complete = progress.days.includes(date);
  function finishIntro(skipped: boolean) {
    writeOnboarding(window.localStorage, {
      version: ONBOARDING_VERSION,
      completedAt: new Date().toISOString(),
      skipped,
    });
    setIntro(false);
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  if (intro) {
    return (
      <div className="app-shell intro-mode">
        <main id="main" className="app-main">
          <OnboardingFlow
            profile={profile}
            settings={settings}
            onDone={finishIntro}
          />
        </main>
      </div>
    );
  }
  const nav: { view: View; label: string; icon: IconName }[] = [
    { view: "today", label: "Today", icon: "today" },
    { view: "archive", label: "Calendar", icon: "calendar" },
    { view: "mini", label: "The Mini", icon: "mini" },
    { view: "you", label: "Your jar", icon: "jar" },
  ];
  return (
    <div className={`app-shell ${view === "reader" ? "reading-mode" : ""}`}>
      <aside className="app-sidebar">
        <button
          className="wordmark"
          onClick={() => tab("today")}
          aria-label="half full home"
        >
          half full
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
              <Icon name={item.icon} />
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
      <main id="main" className="app-main" ref={heading} tabIndex={-1}>
        <header className="app-topbar">
          <button
            className="mobile-wordmark wordmark"
            onClick={() => tab("today")}
            aria-label="half full home"
          >
            half full
          </button>
          <button
            className="profile-trigger"
            onClick={() => tab("profile")}
            aria-label="Profile"
            aria-current={view === "profile" ? "page" : undefined}
            title={profile.user?.displayName || "Profile"}
          >
            <ProfileAvatar profile={profile} />
          </button>
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
          <TodayHome
            date={date}
            today={today}
            stories={stories}
            storyboards={storyboards}
            complete={complete}
            position={position}
            mode={settings.preferences.mode}
            displayName={profile.user?.displayName}
            onRead={(index) => read(index)}
            onListen={() => read(0, true)}
            onMini={() => tab("mini")}
          />
        )}
        {!loading && view === "reader" && edition && (
          <>
            <EditionReader
              key={`${edition.edition.id}-${startIndex}`}
              stories={stories}
              editionId={edition.edition.id}
              demo={false}
              date={date}
              initialIndex={startIndex}
              initialListen={listenFirst}
              onExit={exitReader}
              onIndexChange={rememberPosition}
              onComplete={() => {
                saveProgress((previous) => markRead(previous, date));
              }}
              onReaction={(id, mood) =>
                saveProgress((previous) => ({
                  ...previous,
                  reactions: { ...previous.reactions, [id]: mood },
                }))
              }
              reactions={progress.reactions}
              preferences={settings.preferences}
              onPreferences={settings.update}
              storyboards={storyboards}
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
        {view === "profile" && (
          <ProfilePage
            profile={profile}
            settings={settings}
            onOpenJar={() => tab("you")}
            onReplayIntro={() => {
              clearOnboarding(window.localStorage);
              setIntro(true);
            }}
          />
        )}
        {view === "you" && (
          <section className="you-page">
            <div className="page-heading">
              <h1>Your jar</h1>
              <p className="page-intro">
                {profile.user
                  ? "Your reading, kept across devices."
                  : "Your reading, kept on this device."}
              </p>
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
                  onClick={() =>
                    stories.length
                      ? read(complete ? 0 : position)
                      : tab("today")
                  }
                >
                  Read your edition ↗
                </button>
              </div>
            </div>
            <section className="jar-section" aria-labelledby="jar-reactions">
              <h2 id="jar-reactions">Your reactions</h2>
              {Object.values(progress.reactions).some(Boolean) ? (
                <div className="reaction-tallies">
                  {reactionArt.map((item) => {
                    const count = Object.values(progress.reactions).filter(
                      (mood) => normalizeMood(mood) === item.label,
                    ).length;
                    return (
                      <div key={item.label} className={count ? "" : "empty"}>
                        <img
                          src={`/reactions/${item.image}.webp`}
                          width={48}
                          height={48}
                          alt=""
                        />
                        <strong>{count}</strong>
                        <span>{item.label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="jar-empty">
                  Reactions you leave on stories collect here. They stay
                  private.
                </p>
              )}
            </section>
            <section className="jar-section" aria-labelledby="jar-history">
              <h2 id="jar-history">Editions you’ve finished</h2>
              {progress.days.length ? (
                <ul className="reading-history">
                  {[...progress.days]
                    .reverse()
                    .slice(0, 30)
                    .map((day) => (
                      <li key={day}>
                        <button
                          onClick={() =>
                            day === selectedDate ? tab("today") : openDate(day)
                          }
                        >
                          <span>
                            {dateLabel(day, {
                              weekday: "short",
                              month: "long",
                              day: "numeric",
                              ...(day.slice(0, 4) !== today.slice(0, 4)
                                ? { year: "numeric" }
                                : {}),
                            })}
                          </span>
                          <Icon name="check" size={16} />
                        </button>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="jar-empty">
                  Finish an edition and it lands in the jar.
                </p>
              )}
            </section>
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
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
