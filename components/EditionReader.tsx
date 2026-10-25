"use client";
import { useEffect, useRef, useState } from "react";
import type { ApprovedStory } from "@/lib/types";
import { originalDocuments } from "@/lib/documents";
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
  onTransparency,
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
  onTransparency: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [through, setThrough] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const gesture = useRef<{ x: number; y: number; time: number } | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const go = (direction: -1 | 1) => {
    setAutoPlay(false);
    setIndex((current) => navigate(current, direction, stories.length));
  };
  const story = stories[index];
  const completion = useRef(false);
  useEffect(() => {
    if (index === stories.length && !completion.current) {
      completion.current = true;
      onComplete?.();
    }
  }, [index, stories.length, onComplete]);
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
        <span>A little perspective</span>
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
            <StoryVisual key={story.id} story={story} />
            <div className="story-copy">
              <p className="eyebrow">{story.category} · The daily edit</p>
              <h2 ref={heading} tabIndex={-1}>
                {story.headline}
              </h2>
              <p className="story-intro">
                {story.experience?.explanation.text ?? story.summary}
              </p>
              {story.experience && (
                <details className="quick">
                  <summary>The quick version</summary>
                  <p>{story.experience.quick.text}</p>
                </details>
              )}
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
              <div className="why-card">
                <h3>Why it matters</h3>
                <p>{story.whyItMatters}</p>
              </div>
              <div className="action-card">
                <h3>A small next step</h3>
                <p>{story.action}</p>
              </div>
              <div className="understand">
                {story.experience && (
                  <>
                    <details>
                      <summary>Go deeper</summary>
                      <p>{story.experience.background.text}</p>
                    </details>
                    {story.experience.glossary.length > 0 && (
                      <div className="glossary">
                        <h3>A little context</h3>
                        {story.experience.glossary.map((term) => (
                          <details key={term.term}>
                            <summary>{term.term}</summary>
                            <p>{term.text}</p>
                          </details>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {story.socialContext && (
                  <details>
                    <summary>From the public conversation</summary>
                    <p className="note">{story.socialContext.notice}</p>
                    {story.socialContext.posts.map((post) => (
                      <div className="social-post" key={post.id}>
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {post.title}
                        </a>
                        <p className="note">
                          Reddit{post.community ? ` · ${post.community}` : ""} ·{" "}
                          {formatDate(post.publishedAt)}
                        </p>
                        {post.questions.length > 0 && (
                          <>
                            <p>
                              Questions in this post (unverified user wording):
                            </p>
                            <ul>
                              {post.questions.map((q) => (
                                <li key={q}>{q}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    ))}
                  </details>
                )}
              </div>
              <details className="receipts">
                <summary>Show me the receipts</summary>
                <p>
                  <strong>Central claim:</strong> {story.centralClaim}
                </p>
                <p>{story.verificationReason}</p>
                <p className="note">
                  Supported by retrieved material, not independently
                  fact-checked. Confidence is an editor estimate, not a measured
                  probability of truth.
                </p>
                <p>
                  Evidence confidence: {Math.round(story.confidence * 100)}%
                </p>
                <meter
                  min={0}
                  max={1}
                  value={story.confidence}
                  aria-label="Editor confidence"
                />
                <ul>
                  {story.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.title}
                      </a>{" "}
                      — {source.publisher}
                      <br />
                      {source.publishedAt ? (
                        <time dateTime={source.publishedAt}>
                          {formatDate(source.publishedAt)} (UTC)
                        </time>
                      ) : (
                        "Publication date unavailable"
                      )}
                    </li>
                  ))}
                </ul>
                {originalDocuments(story).length > 0 && (
                  <div>
                    <h3>Original documents & advisories</h3>
                    <p className="note">
                      Links found in retained passages. Sources retrieved for
                      this edition are listed in the evidence trail below; other
                      links are provided for further reading.
                    </p>
                    <ul>
                      {originalDocuments(story).map((doc) => (
                        <li key={doc.url}>
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {doc.title}
                            {doc.pdf ? " (PDF)" : " ↗"}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {story.sources.some((source) => source.provenance) && (
                  <div className="provenance-trail">
                    <h3>From the web to this story</h3>
                    <p className="note">
                      Actual Apify retrievals. Dataset item indexes start at
                      zero. A retrieved document still needs a relevance and
                      evidence assessment.
                    </p>
                    {story.sources
                      .filter((source) => source.provenance)
                      .map((source) => (
                        <details key={source.id}>
                          <summary>
                            {source.provenance!.relationship === "discovery"
                              ? "Reporting"
                              : "Investigated source"}
                            : {source.publisher}
                          </summary>
                          <ol>
                            <li>
                              <strong>Actor</strong>{" "}
                              {source.provenance!.actorId}
                            </li>
                            <li>
                              <strong>Run</strong>{" "}
                              <a
                                href={`https://console.apify.com/actors/runs/${source.provenance!.runId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {source.provenance!.runId} ↗
                              </a>
                            </li>
                            <li>
                              <strong>Dataset</strong>{" "}
                              {source.provenance!.datasetId} · item{" "}
                              {source.provenance!.itemIndex}
                            </li>
                            <li>
                              <strong>Original</strong>{" "}
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {source.title}
                              </a>
                            </li>
                            <li>
                              <strong>Retrieved</strong>{" "}
                              {formatDate(source.provenance!.retrievedAt)}
                            </li>
                            <li>
                              <strong>Text fingerprint</strong>{" "}
                              <code>{source.provenance!.contentHash}</code>
                            </li>
                            <li>
                              <strong>Claude’s decision</strong>{" "}
                              Evidence-supported within this retrieval set;
                              passages below.
                            </li>
                          </ol>
                        </details>
                      ))}
                  </div>
                )}
                {story.sourceAssessments?.map((source) => (
                  <p key={source.sourceId}>
                    <strong>
                      {source.kind === "primary"
                        ? "Primary material"
                        : source.kind === "reporting"
                          ? "Reported evidence"
                          : "Source type uncertain"}
                      :
                    </strong>{" "}
                    {source.explanation}
                  </p>
                ))}
                {story.limitations?.map((limitation) => (
                  <p className="note" key={limitation}>
                    {limitation}
                  </p>
                ))}
                {story.evidence?.length ? (
                  <>
                    <h3>Retrieved passages</h3>
                    {story.evidence.map((evidence) => (
                      <blockquote
                        key={`${evidence.sourceId}-${evidence.passageId}`}
                      >
                        <p>{evidence.excerpt}</p>
                        <cite>
                          <a
                            href={evidence.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {evidence.publisher}
                          </a>{" "}
                          · {evidence.sourceId}/{evidence.passageId}
                        </cite>
                      </blockquote>
                    ))}
                  </>
                ) : (
                  <p>
                    Detailed evidence passages were not retained for this older
                    edition. Verification details are limited to the recorded
                    editorial explanation.
                  </p>
                )}
                {story.contentSupport?.length ? (
                  <details>
                    <summary>How the story text links to evidence</summary>
                    <ul>
                      {story.contentSupport.map((support) => (
                        <li key={support.field}>
                          <strong>
                            {
                              {
                                centralClaim: "Claim",
                                headline: "Headline",
                                summary: "Summary",
                                whyItMatters: "Relevance",
                                action: "Action",
                              }[support.field]
                            }
                            :
                          </strong>{" "}
                          {support.text}
                          <br />
                          {support.evidence
                            .map((e) => `${e.sourceId}/${e.passageId}`)
                            .join(", ")}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
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
            <p className="eyebrow">A little informed. A little more present.</p>
            <h2 ref={heading} tabIndex={-1}>
              You’re caught up.
            </h2>
            <p>
              {stories.length} stories. A little more understanding. That’s your
              edition. The rest of your day is yours.
            </p>
            <div className="buttons">
              <button
                onClick={() => {
                  setAutoPlay(false);
                  setIndex(0);
                }}
              >
                Review edition
              </button>
              <button onClick={onTransparency}>View excluded stories</button>
            </div>
            <Crossword stories={stories} demo={demo} date={date} />
          </article>
        )}
      </div>
      <nav className="story-navigation buttons" aria-label="Story navigation">
        <button disabled={index === 0} onClick={() => go(-1)}>
          Back
        </button>
        {index < stories.length && (
          <button onClick={() => go(1)}>
            {index === stories.length - 1 ? "Finish edition" : "Next"}
          </button>
        )}
      </nav>
      <p className="note">
        Swipe to turn the page. There’s an end, we promise.
      </p>
    </section>
  );
}
