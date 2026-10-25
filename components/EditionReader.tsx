"use client";
import { useEffect, useRef, useState } from "react";
import type { ApprovedStory } from "@/lib/types";
import Crossword from "./Crossword";
import Charm from "./Charm";
import StoryReactions from "./StoryReactions";
import StoryVisual from "./StoryVisual";
import AudioPlayer from "./AudioPlayer";
import {
  formatDate,
  navigate,
  progressLabel,
  swipeDirection,
} from "@/lib/navigation";

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
}: {
  date?: string;
  initialIndex?: number;
  onComplete?: () => void;
  onReaction?: (id: string, reaction: string) => void;
  reactions?: Record<string, string>;
  stories: ApprovedStory[];
  editionId: string;
  demo?: boolean;
  active?: boolean;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [through, setThrough] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const gesture = useRef<{ x: number; y: number; time: number } | null>(null);
  const first = useRef(true);
  const completion = useRef(false);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
  }, [index]);
  useEffect(() => {
    if (index === stories.length && !completion.current) {
      completion.current = true;
      onComplete?.();
    }
  }, [index, stories.length, onComplete]);
  const go = (direction: -1 | 1) => {
    setAutoPlay(false);
    setIndex((current) => navigate(current, direction, stories.length));
  };
  const story = stories[index];
  const interactive = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest("a,button,summary,input,select,textarea");
  return (
    <section
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
      <div className="reader-progress">
        <span aria-live="polite">{progressLabel(index, stories.length)}</span>
        <div aria-hidden="true">
          {stories.map((s, i) => (
            <i key={s.id} className={i <= index ? "filled" : ""} />
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
            <StoryVisual story={story} />
            <div className="story-copy">
              <p className="eyebrow">{story.category}</p>
              <h2 ref={heading} tabIndex={-1}>
                {story.headline}
              </h2>
              <AudioPlayer
                key={story.id}
                story={story}
                editionId={editionId}
                demo={demo}
                active={active}
                through={through}
                onThrough={setThrough}
                autoPlay={autoPlay}
                onEnded={() => {
                  setAutoPlay(true);
                  setIndex((current) => navigate(current, 1, stories.length));
                }}
              />
              <p className="story-intro">{story.summary}</p>
              <div className="why-card">
                <h3>Why it matters</h3>
                <p>{story.whyItMatters}</p>
              </div>
              {story.experience && (
                <details className="reader-context">
                  <summary>More context</summary>
                  <p>{story.experience.explanation.text}</p>
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
              <aside className="bright-side" aria-label="The bright side">
                <span className="bright-side-icon" aria-hidden="true">
                  ✳
                </span>
                <div>
                  <h3>The bright side</h3>
                  <p>{story.action}</p>
                </div>
              </aside>
              <details className="reader-sources">
                <summary>
                  {story.sources.length}{" "}
                  {story.sources.length === 1 ? "source" : "sources"}
                </summary>
                <ul>
                  {story.sources.map((source) => (
                    <li key={source.id ?? source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.publisher} ↗
                      </a>
                      {source.publishedAt && (
                        <time dateTime={source.publishedAt}>
                          {formatDate(source.publishedAt)}
                        </time>
                      )}
                    </li>
                  ))}
                </ul>
                <a
                  className="source-studio-link"
                  href={`/studio?date=${date ?? ""}&story=${encodeURIComponent(story.id)}`}
                >
                  Evidence & decisions ↗
                </a>
              </details>
              <StoryReactions
                value={reactions[story.id]}
                onChange={(reaction) => onReaction?.(story.id, reaction)}
              />
            </div>
          </article>
        ) : (
          <article className="ending">
            <Charm mood="mint" />
            <h2 ref={heading} tabIndex={-1}>
              You’re caught up.
            </h2>
            <p>{stories.length} stories. Done for the day.</p>
            <button
              className="quiet"
              onClick={() => {
                setAutoPlay(false);
                setIndex(0);
              }}
            >
              Read again ↗
            </button>
            <Crossword stories={stories} demo={demo} date={date} />
          </article>
        )}
      </div>
      <nav className="story-navigation buttons" aria-label="Story navigation">
        <button disabled={index === 0} onClick={() => go(-1)}>
          Back
        </button>
        {index < stories.length && (
          <button className="primary" onClick={() => go(1)}>
            {index === stories.length - 1 ? "Done" : "Next"}{" "}
            <span aria-hidden="true">→</span>
          </button>
        )}
      </nav>
    </section>
  );
}
