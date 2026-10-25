"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type PanInfo,
} from "motion/react";
import FollowAlong from "./FollowAlong";
import DitheredAtmosphere from "./DitheredAtmosphere";
import BrandWorldArtwork from "./BrandWorldArtwork";
import StoryVideoStage from "./StoryVideoStage";
import type { VideoIndex } from "@/lib/video";
import type { MotionStyle } from "motion/react";
import { narrationFor } from "@/lib/narration";
import type { ApprovedStory } from "@/lib/types";
import StoryReceipts from "./StoryReceipts";
import Icon from "./Icon";
import StoryReactions from "./StoryReactions";
import StoryVisual from "./StoryVisual";
import AudioPlayer, {
  type PlaybackController,
  type PlaybackState,
} from "./AudioPlayer";
import IllustratedStoryPlayer from "./IllustratedStoryPlayer";
import {
  editionProgress,
  DECK_ELASTIC,
  DECK_SPRING,
  isInteractiveTarget,
  neighbourStyle,
  pageOffset,
  progressLabel,
  resolveSwipe,
} from "@/lib/deck";
import { displayableScenes, type StoryboardIndex } from "@/lib/storyboard";
import {
  assignThemes,
  ENDING_THEME,
  mixColor,
  themeVariables,
  type StoryTheme,
} from "@/lib/story-theme";
import {
  defaultPreferences,
  type ListeningPreferences,
} from "@/lib/preferences";

/**
 * The story deck: every approved story is a page in a horizontal track that
 * follows the finger (Motion drag with direction lock), settles with a spring
 * and resists at both edges. Each page scrolls vertically on its own. The
 * last page is "You're caught up"; reaching it records completion once.
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
  videos = {},
  onMini,
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
  storyboards?: StoryboardIndex;
  videos?: VideoIndex;
  onMini?: () => void;
}) {
  const count = stories.length + 1;
  const [index, setIndex] = useState(
    Math.max(0, Math.min(stories.length, initialIndex)),
  );
  const indexRef = useRef(index);
  const [width, setWidth] = useState(0);
  const deck = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const controls = useDragControls();
  const reduced = useReducedMotion();
  const [through, setThrough] = useState(
    initialListen || preferences.autoplayNext,
  );
  const [autoPlayIndex, setAutoPlayIndex] = useState<number | null>(
    initialListen ? initialIndex : null,
  );
  const [playback, setPlayback] = useState<Record<number, PlaybackState>>({});
  const controllers = useRef<Record<number, PlaybackController | null>>({});
  const controllerRefs = useRef<
    Record<number, { current: PlaybackController | null }>
  >({});
  const controllerRef = (i: number) =>
    (controllerRefs.current[i] ??= {
      get current() {
        return controllers.current[i] ?? null;
      },
      set current(value: PlaybackController | null) {
        controllers.current[i] = value;
      },
    });
  const playbackHandlers = useRef<
    Record<number, (state: PlaybackState) => void>
  >({});
  const playbackHandler = (i: number) =>
    (playbackHandlers.current[i] ??= (state: PlaybackState) =>
      setPlayback((previous) => {
        const old = previous[i];
        return old &&
          old.playing === state.playing &&
          old.time === state.time &&
          old.duration === state.duration
          ? previous
          : { ...previous, [i]: state };
      }));
  const [silentVideos, setSilentVideos] = useState<Record<string, boolean>>({});
  const [brokenVideos, setBrokenVideos] = useState<string[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [arrived, setArrived] = useState(false);
  const completed = useRef(false);
  // Story atmospheres. The deck background follows the track position, so the
  // colour environment moves with the finger and settles with the spring.
  const themes = [...assignThemes(stories), ENDING_THEME];
  const blend = (pick: (item: StoryTheme) => string) => (value: number) => {
    if (!(width > 0)) return pick(themes[Math.min(index, themes.length - 1)]);
    const position = Math.max(0, Math.min(themes.length - 1, -value / width));
    const low = Math.floor(position);
    const high = Math.min(themes.length - 1, low + 1);
    return mixColor(pick(themes[low]), pick(themes[high]), position - low);
  };
  const top = useTransform(
    x,
    blend((item) => item.top),
  );
  const glow = useTransform(
    x,
    blend((item) => item.glow),
  );
  const tint = useTransform(
    x,
    blend((item) => item.tint),
  );
  // The deck owns the viewport while reading: the document itself must not scroll.
  useEffect(() => {
    document.documentElement.classList.add("deck-open");
    return () => document.documentElement.classList.remove("deck-open");
  }, []);
  // Measure the deck; pages are exactly one deck wide.
  useEffect(() => {
    const element = deck.current;
    if (!element) return;
    const measure = () => {
      const next = element.clientWidth;
      setWidth(next);
      x.set(pageOffset(indexRef.current, next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [x]);
  const goTo = useCallback(
    (target: number, immediate = false) => {
      const next = Math.max(0, Math.min(count - 1, target));
      if (next !== indexRef.current)
        controllers.current[indexRef.current]?.pause();
      indexRef.current = next;
      setIndex(next);
      const offset = pageOffset(next, deck.current?.clientWidth ?? width);
      if (immediate || reduced) x.set(offset);
      else animate(x, offset, DECK_SPRING);
    },
    [count, width, x, reduced],
  );
  useEffect(() => {
    onIndexChange?.(Math.min(index, stories.length));
    if (index >= stories.length) {
      setArrived(true);
      if (!completed.current && stories.length > 0) {
        completed.current = true;
        onComplete?.();
      }
    }
  }, [index, stories.length, onIndexChange, onComplete]);
  // Arrow keys turn pages from anywhere in the reader, not only when the section has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        isInteractiveTarget(event.target) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(indexRef.current + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(indexRef.current - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);
  function onDragEnd(_event: unknown, info: PanInfo) {
    if (deck.current)
      deck.current.dataset.lastDrag = JSON.stringify({
        offset: Math.round(info.offset.x),
        velocity: Math.round(info.velocity.x),
      });
    goTo(
      resolveSwipe({
        offset: info.offset.x,
        velocity: info.velocity.x,
        width: deck.current?.clientWidth ?? width,
        index: indexRef.current,
        count,
      }),
    );
  }
  const editionFill = useTransform(x, (value) =>
    editionProgress(value, width, stories.length),
  );
  const finished = index >= stories.length;
  return (
    <motion.section
      className="edition-reader story-deck-reader"
      aria-label="Finite edition"
      style={
        {
          ...themeVariables(themes[Math.min(index, themes.length - 1)]),
          "--story-top": top,
          "--story-glow": glow,
          "--story-tint": tint,
        } as MotionStyle
      }
    >
      <DitheredAtmosphere tone="story" intensity={0.14} />
      <header className="deck-top">
        <div
          className={`deck-progress${finished ? " complete" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(
            (index / Math.max(1, stories.length)) * 100,
          )}
          aria-valuetext={
            index < stories.length
              ? `Story ${progressLabel(index, stories.length)}`
              : progressLabel(index, stories.length)
          }
          aria-label={progressLabel(index, stories.length)}
        >
          <motion.i style={{ scaleX: editionFill }} />
        </div>
        <div className="deck-topbar">
          <button
            className="reader-exit"
            onClick={onExit}
            aria-label="Back to cover"
          >
            <Icon name="back" />
          </button>
          <span className="deck-count" aria-live="polite">
            {progressLabel(index, stories.length)}
          </span>
          <span className="deck-date">
            {date
              ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })
              : ""}
          </span>
        </div>
      </header>
      <div className="story-deck" ref={deck}>
        <motion.div
          className="deck-track"
          style={{ x }}
          drag={reduced ? false : "x"}
          dragListener={false}
          dragControls={controls}
          dragDirectionLock
          dragMomentum={false}
          dragElastic={DECK_ELASTIC}
          dragConstraints={{ left: pageOffset(count - 1, width), right: 0 }}
          onDragEnd={onDragEnd}
          onDirectionLock={(direction) => {
            if (direction === "x")
              controllers.current[indexRef.current]?.pause();
          }}
          onPointerDown={(event) => {
            if (reduced || isInteractiveTarget(event.target)) return;
            controls.start(event);
          }}
        >
          {stories.map((story, i) => {
            const storyboard = storyboards[story.id];
            const illustrated =
              !!storyboard &&
              date !== undefined &&
              displayableScenes(storyboard).length > 0 &&
              !unavailable.includes(story.id);
            const video = videos[story.id];
            const realVideo =
              !!video?.clips.some(
                (clip) => clip.status === "ready" && clip.asset,
              ) && !brokenVideos.includes(story.id);
            const silent = !!silentVideos[story.id];
            return (
              <DeckPage
                key={story.id}
                index={i}
                x={x}
                width={width}
                active={i === index}
                id={`story-${i + 1}`}
                label={story.headline}
                theme={themes[i]}
              >
                <div className="story-hero">
                  <p className="eyebrow">
                    <span className="story-ordinal">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span aria-hidden="true"> · </span>
                    {story.category}
                  </p>
                  <h2 id={`story-${i + 1}-title`} tabIndex={-1}>
                    {story.headline}
                  </h2>
                  {realVideo ? (
                    <StoryVideoStage
                      manifest={video}
                      active={active && i === index}
                      playback={playback[i]}
                      getController={() => controllers.current[i] ?? null}
                      silent={silent}
                      onSilentChange={(value) =>
                        setSilentVideos((previous) => ({
                          ...previous,
                          [story.id]: value,
                        }))
                      }
                      onUnavailable={() =>
                        setBrokenVideos((previous) => [...previous, story.id])
                      }
                    />
                  ) : illustrated ? (
                    <IllustratedStoryPlayer
                      key={`illustrated-${story.id}`}
                      manifest={storyboard!}
                      date={date!}
                      playback={playback[i]}
                      getController={() => controllers.current[i] ?? null}
                      active={i === index}
                      onUnavailable={() =>
                        setUnavailable((list) => [...list, story.id])
                      }
                    />
                  ) : (
                    <StoryVisual story={story} />
                  )}
                  <div
                    className="narration-controls"
                    hidden={realVideo && silent}
                  >
                    <AudioPlayer
                      key={story.id}
                      story={story}
                      editionId={editionId}
                      demo={demo}
                      active={active && i === index && !(realVideo && silent)}
                      through={through}
                      onThrough={setThrough}
                      autoPlay={autoPlayIndex === i}
                      preferences={preferences}
                      onPreferences={onPreferences}
                      onPlayback={playbackHandler(i)}
                      controller={controllerRef(i)}
                      onPrevious={i > 0 ? () => goTo(i - 1) : undefined}
                      onNext={() => goTo(i + 1)}
                      transportLabel={
                        i + 1 < stories.length ? "Next story" : "Finish"
                      }
                      onEnded={() => {
                        // Listen-through is the only mode that turns the page by itself.
                        if (i + 1 < stories.length) setAutoPlayIndex(i + 1);
                        goTo(i + 1);
                      }}
                    />
                  </div>
                  {realVideo && silent && (
                    <div className="silent-transport">
                      <button
                        onClick={() => goTo(i - 1)}
                        disabled={i === 0}
                        aria-label="Previous story"
                      >
                        <Icon name="back" size={20} />
                      </button>
                      <span>Silent viewing</span>
                      <button
                        onClick={() => goTo(i + 1)}
                        aria-label={
                          i + 1 < stories.length ? "Next story" : "Finish"
                        }
                      >
                        <Icon name="next" size={20} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="story-sheet">
                  <FollowAlong
                    script={
                      playback[i]?.ready
                        ? narrationFor(story).script
                        : (story.experience?.explanation.text ?? story.summary)
                    }
                    playback={playback[i]}
                    onSeekFraction={(fraction) =>
                      controllers.current[i]?.seekFraction(fraction)
                    }
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
                  <p className="page-hint" aria-hidden="true">
                    {i + 1 < stories.length
                      ? "Swipe for the next story"
                      : "Swipe to finish"}
                  </p>
                </div>
              </DeckPage>
            );
          })}
          <DeckPage
            index={stories.length}
            x={x}
            width={width}
            active={finished}
            id={`story-${stories.length + 1}`}
            label="You're caught up"
            theme={ENDING_THEME}
          >
            <article
              className={`ending${arrived ? " arrived" : ""}`}
              aria-label="End of the edition"
            >
              <BrandWorldArtwork variant="completion" className="ending-art" />
              <p className="ending-kicker">
                A little perspective. A whole day ahead.
              </p>
              <h2 tabIndex={-1}>You’re caught up.</h2>
              <p>{stories.length} stories. Your edition is complete.</p>
              <div className="ending-actions">
                <button className="primary ending-cover" onClick={onExit}>
                  Back to your day
                  <Icon name="next" size={18} />
                </button>
                {onMini && (
                  <button className="ending-mini" onClick={onMini}>
                    <Icon name="mini" size={18} />
                    Try the Mini
                  </button>
                )}
                <button
                  className="ending-reread"
                  onClick={() => {
                    setArrived(false);
                    goTo(0);
                  }}
                >
                  Read again
                </button>
              </div>
            </article>
          </DeckPage>
        </motion.div>
      </div>
    </motion.section>
  );
}
/** One page of the deck. Scale and opacity follow the track without rerenders. */
function DeckPage({
  index,
  x,
  width,
  active,
  id,
  label,
  theme,
  children,
}: {
  index: number;
  x: MotionValue<number>;
  width: number;
  active: boolean;
  id: string;
  label: string;
  theme: StoryTheme;
  children: React.ReactNode;
}) {
  const page = useRef<HTMLElement>(null);
  useEffect(() => {
    if (active)
      page.current
        ?.querySelector<HTMLElement>("h2")
        ?.focus({ preventScroll: true });
  }, [active]);
  const scale = useTransform(
    x,
    (value) => neighbourStyle(value, index, width).scale,
  );
  const opacity = useTransform(
    x,
    (value) => neighbourStyle(value, index, width).opacity,
  );
  return (
    <motion.article
      id={id}
      ref={page}
      className={`deck-page theme-${theme.id}${active ? " is-current" : ""}`}
      style={{ scale, opacity, ...themeVariables(theme) }}
      aria-label={label}
      aria-hidden={!active}
      // Inactive pages stay out of the tab order so focus never lands offscreen.
      {...(active ? {} : { inert: true })}
    >
      {children}
    </motion.article>
  );
}
