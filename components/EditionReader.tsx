"use client";
import { useEffect, useRef, useState } from "react";
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
import { navigate, progressLabel, swipeDirection } from "@/lib/navigation";
import { displayableScenes, type StoryboardIndex } from "@/lib/storyboard";
import {
  defaultPreferences,
  type ListeningPreferences,
} from "@/lib/preferences";

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
  const [index, setIndex] = useState(initialIndex);
  const [through, setThrough] = useState(
    initialListen || preferences.autoplayNext,
  );
  const [autoPlay, setAutoPlay] = useState(initialListen);
  const heading = useRef<HTMLHeadingElement>(null);
  const gesture = useRef<{ x: number; y: number; time: number } | null>(null);
  const completion = useRef(false);
  // Arriving at the ending through reading animates; opening on it does not.
  const [arrived, setArrived] = useState(false);
  const [playback, setPlayback] = useState<PlaybackState>();
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const controller = useRef<PlaybackController | null>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [index]);
  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);
  useEffect(() => {
    if (index === stories.length && !completion.current) {
      completion.current = true;
      onComplete?.();
    }
  }, [index, stories.length, onComplete]);
  const go = (direction: -1 | 1) => {
    setAutoPlay(false);
    setIndex((current) => {
      const next = navigate(current, direction, stories.length);
      if (next === stories.length && current < stories.length) setArrived(true);
      return next;
    });
  };
  const story = stories[index];
  const finished = index >= stories.length;
  const storyboard = story ? storyboards[story.id] : undefined;
  const illustrated =
    !!story &&
    !!storyboard &&
    date !== undefined &&
    displayableScenes(storyboard).length > 0 &&
    !unavailable.includes(story.id);
  const interactive = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest("a,button,summary,input,select,textarea,dialog");
  return (
    <section
      className="edition-reader"
      aria-label="Finite edition"
      onKeyDown={(event) => {
        if (
          interactive(event.target) ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        )
          return;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          go(event.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <header className="reading-header">
        <button className="reader-exit" onClick={onExit}>
          <Icon name="back" />
          Back to cover
        </button>
        <span>
          {date
            ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })
            : "half full"}
        </span>
      </header>
      <div className={`reader-progress${finished ? " complete" : ""}`}>
        <span aria-live="polite">{progressLabel(index, stories.length)}</span>
        <div aria-hidden="true">
          {stories.map((s, i) => (
            <i
              key={s.id}
              className={
                i < index || finished ? "filled" : i === index ? "filled" : ""
              }
              style={{ animationDelay: `${i * 70}ms` }}
            />
          ))}
        </div>
      </div>
      <div
        className="reader"
        onPointerDown={(event) => {
          if (
            !event.isPrimary ||
            event.button !== 0 ||
            interactive(event.target)
          )
            return;
          gesture.current = {
            x: event.clientX,
            y: event.clientY,
            time: Date.now(),
          };
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onPointerUp={(event) => {
          const start = gesture.current;
          gesture.current = null;
          if (!start || window.getSelection()?.toString()) return;
          const direction = swipeDirection(
            event.clientX - start.x,
            event.clientY - start.y,
            Date.now() - start.time,
          );
          if (direction) go(direction);
        }}
      >
        {story ? (
          <article key={story.id}>
            <div className="story-copy">
              <p className="eyebrow">{story.category}</p>
              <h2 ref={heading} tabIndex={-1}>
                {story.headline}
              </h2>
              {illustrated ? (
                <IllustratedStoryPlayer
                  key={`illustrated-${story.id}`}
                  manifest={storyboard!}
                  date={date!}
                  playback={playback}
                  controller={controller}
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
                autoPlay={autoPlay}
                preferences={preferences}
                onPreferences={onPreferences}
                onPlayback={setPlayback}
                controller={controller}
                onEnded={() => {
                  setAutoPlay(true);
                  setIndex((current) => navigate(current, 1, stories.length));
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
                    A question from {story.publicQuestion.community || "Reddit"}{" "}
                    ↗
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
          </article>
        ) : (
          <article className={`ending${arrived ? " arrived" : ""}`}>
            <div className="ending-charm">
              <Charm mood="mint" />
              <span className="ending-halo" aria-hidden="true" />
            </div>
            <h2 ref={heading} tabIndex={-1}>
              You’re caught up.
            </h2>
            <p>
              {stories.length} {stories.length === 1 ? "story" : "stories"}{" "}
              read. That’s the whole edition.
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
                  setAutoPlay(false);
                  setArrived(false);
                  setIndex(0);
                }}
              >
                Read again ↗
              </button>
            </div>
            <Crossword stories={stories} demo={demo} date={date} />
          </article>
        )}
      </div>
      <nav className="story-navigation buttons" aria-label="Story navigation">
        <button disabled={index === 0} onClick={() => go(-1)}>
          Back
        </button>
        <span className="dock-progress">
          {index < stories.length
            ? `${index + 1} / ${stories.length}`
            : "Complete"}
        </span>
        {index < stories.length ? (
          <button className="primary" onClick={() => go(1)}>
            {index === stories.length - 1 ? "Done" : "Next"}{" "}
            <span aria-hidden="true">→</span>
          </button>
        ) : (
          <button className="primary" onClick={onExit}>
            Finish
          </button>
        )}
      </nav>
    </section>
  );
}
