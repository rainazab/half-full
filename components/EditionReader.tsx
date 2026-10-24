"use client";
import { useEffect, useRef, useState } from "react";
import type { ApprovedStory } from "@/lib/types";
import { originalDocuments } from "@/lib/documents";
import Crossword from "./Crossword";
import StoryVisual from "./StoryVisual";
import AudioPlayer from "./AudioPlayer";
import { formatDate, navigate, progressLabel, swipeDirection } from "@/lib/navigation";

export default function EditionReader({ stories, editionId, demo = false, active = true, onTransparency }: { stories: ApprovedStory[]; editionId: string; demo?: boolean; active?: boolean; onTransparency: () => void }) {
  const [index, setIndex] = useState(0);
  const [through, setThrough] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const gesture = useRef<{ x: number; y: number; time: number } | null>(null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: "nearest" }); }, [index]);
  const go = (direction: -1 | 1) => { setAutoPlay(false); setIndex((current) => navigate(current, direction, stories.length)); };
  const story = stories[index];
  const interactive = (target: EventTarget | null) => target instanceof Element && !!target.closest("a,button,summary,input,select,textarea");
  return <section aria-label="Finite edition" onKeyDown={(event) => {
    if (interactive(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); go(event.key === "ArrowRight" ? 1 : -1); }
  }}>
    <p aria-live="polite">{progressLabel(index, stories.length)}</p>
    <progress value={index} max={stories.length} aria-label="Stories completed" />
    <div className="reader" onPointerDown={(event) => {
      if (!event.isPrimary || event.button !== 0 || interactive(event.target)) return;
      gesture.current = { x: event.clientX, y: event.clientY, time: Date.now() };
    }} onPointerCancel={() => { gesture.current = null; }} onPointerUp={(event) => {
      const start = gesture.current; gesture.current = null;
      if (!start || window.getSelection()?.toString()) return;
      const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y, Date.now() - start.time);
      if (direction) go(direction);
    }}>
      {story ? <article key={story.id}>
        <StoryVisual key={story.id} story={story} />
        <div className="story-copy"><p className="eyebrow">{story.category} · The daily edit</p>
        <h2 ref={heading} tabIndex={-1}>{story.headline}</h2>
        <p className="story-intro">{story.experience?.explanation.text ?? story.summary}</p>
        {story.experience && <details className="quick"><summary>The quick version</summary><p>{story.experience.quick.text}</p></details>}
        <AudioPlayer key={story.id} story={story} editionId={editionId} demo={demo} active={active} through={through} onThrough={setThrough} autoPlay={autoPlay} onEnded={() => { setAutoPlay(true); setIndex((current) => navigate(current, 1, stories.length)); }} />
        <h3>Why it matters</h3><p>{story.whyItMatters}</p>
        <h3>What you can do</h3><p>{story.action}</p>
        <div className="understand">{story.experience && <><details><summary>Go deeper</summary><p>{story.experience.background.text}</p></details>{story.experience.glossary.length > 0 && <div className="glossary"><h3>A little context</h3>{story.experience.glossary.map((term) => <details key={term.term}><summary>{term.term}</summary><p>{term.text}</p></details>)}</div>}</>}
        {story.socialContext && <details><summary>From the public conversation</summary><p className="note">{story.socialContext.notice}</p>{story.socialContext.posts.map((post) => <div className="social-post" key={post.id}><a href={post.url} target="_blank" rel="noopener noreferrer">{post.title}</a><p className="note">Reddit{post.community ? ` · ${post.community}` : ""} · {formatDate(post.publishedAt)}</p>{post.questions.length > 0 && <><p>Questions in this post (unverified user wording):</p><ul>{post.questions.map((q) => <li key={q}>{q}</li>)}</ul></>}</div>)}</details>}
        </div><details className="receipts"><summary>Show me the receipts</summary>
          <p><strong>Central claim:</strong> {story.centralClaim}</p>
          <p>{story.verificationReason}</p>
          <p className="note">Supported by retrieved material, not independently fact-checked. Confidence is an editor estimate, not a measured probability of truth.</p>
          <p>Evidence confidence: {Math.round(story.confidence * 100)}%</p>
          <meter min={0} max={1} value={story.confidence} aria-label="Editor confidence" />
          <ul>{story.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> — {source.publisher}<br />{source.publishedAt ? <time dateTime={source.publishedAt}>{formatDate(source.publishedAt)} (UTC)</time> : "Publication date unavailable"}</li>)}</ul>
          {originalDocuments(story).length > 0 && <div><h3>Original documents & advisories</h3><p className="note">Links present in the retrieved reporting. Their full contents were not independently retrieved; no page numbers or extra verification are implied.</p><ul>{originalDocuments(story).map((doc) => <li key={doc.url}><a href={doc.url} target="_blank" rel="noopener noreferrer">{doc.title}{doc.pdf ? " (PDF)" : " ↗"}</a></li>)}</ul></div>}
          {story.sourceAssessments?.map((source) => <p key={source.sourceId}><strong>{source.kind === "primary" ? "Primary material" : source.kind === "reporting" ? "Reported evidence" : "Source type uncertain"}:</strong> {source.explanation}</p>)}
          {story.limitations?.map((limitation) => <p className="note" key={limitation}>{limitation}</p>)}
          {story.evidence?.length ? <><h3>Retrieved passages</h3>{story.evidence.map((evidence) => <blockquote key={`${evidence.sourceId}-${evidence.passageId}`}><p>{evidence.excerpt}</p><cite><a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.publisher}</a> · {evidence.sourceId}/{evidence.passageId}</cite></blockquote>)}</> : <p>Detailed evidence passages were not retained for this older edition. Verification details are limited to the recorded editorial explanation.</p>}
          {story.contentSupport?.length ? <details><summary>How the story text links to evidence</summary><ul>{story.contentSupport.map((support) => <li key={support.field}><strong>{({ centralClaim: "Claim", headline: "Headline", summary: "Summary", whyItMatters: "Relevance", action: "Action" })[support.field]}:</strong> {support.text}<br />{support.evidence.map((e) => `${e.sourceId}/${e.passageId}`).join(", ")}</li>)}</ul></details> : null}
        </details></div>
      </article> : <article className="ending"><p className="note">Daily edition complete</p><h2 ref={heading} tabIndex={-1}>You’re caught up.</h2><p>You’ve reached the end of {stories.length} stories. You can close the app and get on with your day.</p><div className="buttons"><button onClick={() => { setAutoPlay(false); setIndex(0); }}>Review edition</button><button onClick={onTransparency}>View excluded stories</button></div><Crossword stories={stories} demo={demo} /></article>}
    </div>
    <nav className="buttons" aria-label="Story navigation"><button disabled={index === 0} onClick={() => go(-1)}>Back</button>{index < stories.length && <button onClick={() => go(1)}>{index === stories.length - 1 ? "Finish edition" : "Next"}</button>}</nav>
    <p className="note">Swipe left or right, use the buttons, or focus a story heading and use the arrow keys.</p>
  </section>;
}
