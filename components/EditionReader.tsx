"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApprovedStory } from "@/lib/types";
import Crossword from "./Crossword";
import Charm from "./Charm";
import StoryReceipts from "./StoryReceipts";
import Icon from "./Icon";
import StoryReactions from "./StoryReactions";
import StoryVisual from "./StoryVisual";
import AudioPlayer, {
  type PlaybackController,
  type PlaybackState,
} from "./AudioPlayer";
import IllustratedStoryPlayer from "./IllustratedStoryPlayer";
import { progressLabel } from "@/lib/navigation";
import {
  activeStory,
  audioMayContinue,
  ENDING_THRESHOLD,
  READING_BAND_ROOT_MARGIN,
  shouldComplete,
  storyAnchor,
} from "@/lib/feed";
import { displayableScenes, type StoryboardIndex } from "@/lib/storyboard";
import {
  defaultPreferences,
  type ListeningPreferences,
} from "@/lib/preferences";

/**
 * The finite feed. Every approved story renders in order on one vertically
 * scrolling page; a reading band (an IntersectionObserver strip near the top
 * third of the viewport) decides which story is current, and reaching the
 * ending section marks the edition read exactly once.
 */
export default function EditionReader({
  stories,
  editionId,
  demo = false,
  active = true,
  date,
  initialIndex = 0,
  onComplete,
  onReaction,
  reactions = {},
  initialListen = false,
  onExit,
  onIndexChange,
  preferences = defaultPreferences(),
  onPreferences = () => {},
  storyboards = {},
}: {
  initialListen?: boolean;
  onExit?: () => void;
  onIndexChange?: (index: number) => void;
  date?: string;
  initialIndex?: number;
  onComplete?: () => void;
  onReaction?: (id: string, reaction: string) => void;
  reactions?: Record<string, string>;
  stories: ApprovedStory[];
  editionId: string;
  demo?: boolean;
  active?: boolean;
  preferences?: ListeningPreferences;
  onPreferences?: (patch: Partial<ListeningPreferences>) => void;
  /** Optional illustrated scenes, keyed by story ID; missing entries fall back to the article visual. */
  storyboards?: StoryboardIndex;
}) {
  const [current, setCurrent] = useState(
    Math.max(0, Math.min(stories.length, initialIndex)),
  );
  const currentRef = useRef(current);
  const [through, setThrough] = useState(
    initialListen || preferences.autoplayNext,
  );
  // Which story may autoplay: the one entered with Listen, or the next after listen-through.
  const [autoPlayIndex, setAutoPlayIndex] = useState<number | null>(
    initialListen ? initialIndex : null,
  );
  const playingIndex = useRef<number | null>(null);
  const [playback, setPlayback] = useState<Record<number, PlaybackState>>({});
  const controllers = useRef<Record<number, PlaybackController | null>>({});
  const controllerRefs = useRef<
    Record<number, { current: PlaybackController | null }>
  >({});
  const controllerRef = (index: number) =>
    (controllerRefs.current[index] ??= {
      get current() {
        return controllers.current[index] ?? null;
      },
      set current(value: PlaybackController | null) {
        controllers.current[index] = value;
      },
    });
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [arrived, setArrived] = useState(false);
  const completed = useRef(false);
  const feed = useRef<HTMLDivElement>(null);
  const ending = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const intersecting = useRef(new Set<number>());
  const finished = current >= stories.length;
  // Resume: scroll to the remembered story once the layout exists. Stable aspect
  // ratios on every image keep the target from moving under the reader.
  useEffect(() => {
    const target = Math.max(0, Math.min(stories.length, initialIndex));
    const frame = requestAnimationFrame(() => {
      if (target === 0) {
        window.scrollTo({ top: 0, behavior: "instant" });
        heading.current?.focus({ preventScroll: true });
        return;
      }
      const element =
        target >= stories.length
          ? ending.current
          : document.getElementById(storyAnchor(target));
      element?.scrollIntoView({ block: "start", behavior: "instant" });
      element?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
    // Only on mount: later scrolling belongs to the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Active story from the reading band.
  useEffect(() => {
    const root = feed.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const sections = [
      ...root.querySelectorAll<HTMLElement>("[data-story-index]"),
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number(
            (entry.target as HTMLElement).dataset.storyIndex,
          );
          if (entry.isIntersecting) intersecting.current.add(index);
          else intersecting.current.delete(index);
        }
        const next = activeStory(
          currentRef.current,
          intersecting.current,
          stories.length,
        );
        if (next !== currentRef.current) {
          currentRef.current = next;
          setCurrent(next);
          if (next >= stories.length) setArrived(true);
        }
      },
      { rootMargin: READING_BAND_ROOT_MARGIN, threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [stories.length]);
  // Completion when the ending is genuinely on screen.
  useEffect(() => {
    const element = ending.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const ratio = entries[0]?.intersectionRatio ?? 0;
        if (shouldComplete(completed.current, ratio, stories.length)) {
          completed.current = true;
          setArrived(true);
          // Tall viewports can show the ending before it reaches the reading band.
          currentRef.current = stories.length;
          setCurrent(stories.length);
          onComplete?.();
        }
      },
      { threshold: [0, ENDING_THRESHOLD, 1] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [stories.length, onComplete]);
  useEffect(() => {
    onIndexChange?.(Math.min(current, stories.length));
  }, [current, stories.length, onIndexChange]);
  // Scroll-away audio policy: pause a clip once the reader is more than one story away.
  useEffect(() => {
    const index = playingIndex.current;
    if (index !== null && !audioMayContinue(index, current))
      controllers.current[index]?.pause();
  }, [current]);
  const scrollToStory = useCallback(
    (index: number) => {
      const element =
        index >= stories.length
          ? ending.current
          : document.getElementById(storyAnchor(index));
      element?.scrollIntoView({ block: "start", behavior: "smooth" });
    },
    [stories.length],
  );
  const playbackHandlers = useRef<
    Record<number, (state: PlaybackState) => void>
  >({});
  const playbackHandler = (index: number) =>
    (playbackHandlers.current[index] ??= (state: PlaybackState) => {
      setPlayback((previous) => {
        const old = previous[index];
        return old &&
          old.playing === state.playing &&
          old.time === state.time &&
          old.duration === state.duration
          ? previous
          : { ...previous, [index]: state };
      });
      if (state.playing) {
        // One narration at a time.
        const previous = playingIndex.current;
        if (previous !== null && previous !== index)
          controllers.current[previous]?.pause();
        playingIndex.current = index;
      } else if (playingIndex.current === index) playingIndex.current = null;
    });
  return (
    <section className="edition-reader feed-reader" aria-label="Finite edition">
      <header className="reading-header">
        <button className="reader-exit" onClick={onExit}>
          <Icon name="back" />
          Back to cover
        </button>
        <div className={`reader-progress${finished ? " complete" : ""}`}>
          <span aria-live="polite">
            {progressLabel(Math.min(current, stories.length), stories.length)}
          </span>
          <div aria-hidden="true">
            {stories.map((s, i) => (
              <i
                key={s.id}
                className={i <= current || finished ? "filled" : ""}
                style={{ animationDelay: `${i * 70}ms` }}
              />
            ))}
          </div>
        </div>
      </header>
      <div className="feed" ref={feed}>
        {stories.map((story, index) => {
          const storyboard = storyboards[story.id];
          const illustrated =
            !!storyboard &&
            date !== undefined &&
            displayableScenes(storyboard).length > 0 &&
            !unavailable.includes(story.id);
          return (
            <article
              key={story.id}
              id={storyAnchor(index)}
              data-story-index={index}
              className={`feed-story${index === current ? " is-current" : ""}`}
              aria-labelledby={`${storyAnchor(index)}-title`}
            >
              <div className="story-copy">
                <p className="eyebrow">
                  <span className="story-ordinal">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span aria-hidden="true"> · </span>
                  {story.category}
                </p>
                <h2
                  id={`${storyAnchor(index)}-title`}
                  ref={index === 0 ? heading : undefined}
                  tabIndex={-1}
                >
                  {story.headline}
                </h2>
                {illustrated ? (
                  <IllustratedStoryPlayer
                    key={`illustrated-${story.id}`}
                    manifest={storyboard!}
                    date={date!}
                    playback={playback[index]}
                    getController={() => controllers.current[index] ?? null}
                    onUnavailable={() =>
                      setUnavailable((list) => [...list, story.id])
                    }
                  />
                ) : (
                  <StoryVisual story={story} />
                )}
                <p className="story-intro">
                  {story.experience?.explanation.text ?? story.summary}
                </p>
                <AudioPlayer
                  key={story.id}
                  story={story}
                  editionId={editionId}
                  demo={demo}
                  active={active}
                  through={through}
                  onThrough={setThrough}
                  autoPlay={autoPlayIndex === index}
                  preferences={preferences}
                  onPreferences={onPreferences}
                  onPlayback={playbackHandler(index)}
                  controller={controllerRef(index)}
                  onEnded={() => {
                    // Listen-through is the only mode that follows the audio down the page.
                    if (index + 1 < stories.length) {
                      setAutoPlayIndex(index + 1);
                      scrollToStory(index + 1);
                    } else scrollToStory(stories.length);
                  }}
                />
                <div className="why-card">
                  <h3>Why it matters</h3>
                  <p>{story.whyItMatters}</p>
                </div>
                {story.experience && (
                  <details className="reader-context">
                    <summary>More context</summary>
                    <p>{story.experience.background.text}</p>
                    {story.experience.glossary.length > 0 && (
                      <dl>
                        {story.experience.glossary.map((term) => (
                          <div key={term.term}>
                            <dt>{term.term}</dt>
                            <dd>{term.text}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </details>
                )}
                {story.action.trim() && story.closingType !== "none" && (
                  <aside
                    className="bright-side"
                    aria-label={
                      story.closingType === "bright-side"
                        ? "The bright side"
                        : story.closingType === "response"
                          ? "What’s being done"
                          : "Next steps"
                    }
                  >
                    <span className="bright-side-icon" aria-hidden="true">
                      ✳
                    </span>
                    <div>
                      <h3>
                        {story.closingType === "bright-side"
                          ? "The bright side"
                          : story.closingType === "response"
                            ? "What’s being done"
                            : "Next steps"}
                      </h3>
                      <p>{story.action}</p>
                    </div>
                  </aside>
                )}
                {story.publicQuestion && (
                  <section
                    className="public-question"
                    aria-label="A public question explained"
                  >
                    <h3>Wait, what does that mean?</h3>
                    <blockquote>{story.publicQuestion.question}</blockquote>
                    <p>{story.publicQuestion.answer}</p>
                    <a
                      href={story.publicQuestion.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      A question from{" "}
                      {story.publicQuestion.community || "Reddit"} ↗
                    </a>
                    <details>
                      <summary>Evidence for this explanation</summary>
                      {story.publicQuestion.evidence.map((e) => (
                        <blockquote key={`${e.sourceId}/${e.passageId}`}>
                          <p>{e.excerpt}</p>
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {e.publisher} · {e.passageId} ↗
                          </a>
                        </blockquote>
                      ))}
                    </details>
                  </section>
                )}
                <StoryReceipts story={story} date={date} />
                <StoryReactions
                  value={reactions[story.id]}
                  onChange={(reaction) => onReaction?.(story.id, reaction)}
                />
              </div>
              {index < stories.length - 1 && (
                <div className="feed-divider" aria-hidden="true">
                  <span />
                </div>
              )}
            </article>
          );
        })}
        <article
          ref={ending}
          id={storyAnchor(stories.length)}
          data-story-index={stories.length}
          className={`ending${arrived ? " arrived" : ""}`}
          aria-label="End of the edition"
        >
          <div className="ending-charm">
            <Charm mood="mint" />
            <span className="ending-halo" aria-hidden="true" />
          </div>
          <h2 tabIndex={-1}>You’re caught up.</h2>
          <p>
            {stories.length} {stories.length === 1 ? "story" : "stories"} read.
            That’s the whole edition.
          </p>
          <p className="ending-note">
            Nothing more to scroll. Come back tomorrow, or take a minute with
            the Mini.
          </p>
          <div className="ending-actions">
            <button className="ending-cover" onClick={onExit}>
              Back to your edition
            </button>
            <button
              className="quiet"
              onClick={() => {
                setArrived(false);
                scrollToStory(0);
              }}
            >
              Read again ↗
            </button>
          </div>
          <Crossword stories={stories} demo={demo} date={date} />
        </article>
      </div>
    </section>
  );
}
