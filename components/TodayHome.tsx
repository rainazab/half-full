"use client";
import type { ApprovedStory } from "@/lib/types";
import type { StoryboardIndex } from "@/lib/storyboard";
import { assetPath, displayableScenes } from "@/lib/storyboard";
import { displayableMedia } from "@/lib/media";
import { dateLabel } from "@/lib/daily";
import { readingMinutes } from "@/lib/reading-position";
import { greeting } from "@/lib/onboarding";
import { assignThemes } from "@/lib/story-theme";
import type { CatchUpMode } from "@/lib/preferences";
import Icon from "./Icon";

/** The cover image for a story: its illustrated scene when stored, else the publisher preview. */
export function storyCover(
  story: ApprovedStory,
  date: string,
  storyboards: StoryboardIndex,
) {
  const scene = displayableScenes(storyboards[story.id])[0];
  if (scene)
    return {
      src: assetPath(date, story.id, scene.id),
      alt: scene.alt,
      kind: "illustration" as const,
    };
  const media = story.media?.find(
    (m) => displayableMedia(m) && m.rights === "publisher-preview",
  );
  if (media)
    return {
      src: media.url,
      alt: media.alt,
      kind: "photo" as const,
      attribution: media.attribution,
    };
  return null;
}
/**
 * The daily starting point: a greeting, one prominent edition feature with
 * the real date, count and reading estimate, a concise preview of the actual
 * stories, and a quiet entry to The Mini.
 */
export default function TodayHome({
  date,
  today,
  stories,
  storyboards,
  complete,
  position,
  mode,
  displayName,
  onRead,
  onListen,
  onMini,
}: {
  date: string;
  today: string;
  stories: ApprovedStory[];
  storyboards: StoryboardIndex;
  complete: boolean;
  position: number;
  mode: CatchUpMode;
  displayName?: string | null;
  onRead: (index: number) => void;
  onListen: () => void;
  onMini: () => void;
}) {
  const themes = assignThemes(stories);
  const cover =
    stories
      .map((story) => storyCover(story, date, storyboards))
      .find((item) => item?.kind === "illustration") ??
    stories
      .map((story) => storyCover(story, date, storyboards))
      .find(Boolean) ??
    null;
  const heroTheme = themes[0];
  const minutes = readingMinutes(stories);
  const primaryLabel = complete
    ? "Read again"
    : position > 0
      ? "Continue reading"
      : "Start reading";
  const listenFirst = mode === "listen" && !complete;
  return (
    <section className="today-home" aria-label="Today">
      <p className="home-greeting">{greeting(new Date(), displayName)}</p>
      <h1 className="home-title">
        {complete
          ? "You’re caught up."
          : date === today
            ? "Your little catch-up is ready."
            : "An edition from another day."}
      </h1>
      <article
        className="edition-feature"
        style={
          {
            "--story-bg": heroTheme?.background,
            "--story-surface": heroTheme?.surface,
            "--story-accent": heroTheme?.accent,
            "--story-ink": heroTheme?.ink,
          } as React.CSSProperties
        }
      >
        <div className="feature-art" aria-hidden={!cover}>
          {cover ? (
            <img
              src={cover.src}
              alt={cover.alt}
              loading="eager"
              decoding="async"
              draggable={false}
            />
          ) : (
            <div className="feature-placeholder" />
          )}
        </div>
        <div className="feature-copy">
          <p className="feature-date">
            {dateLabel(date, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            {date !== today && <span> · On this day</span>}
          </p>
          <h2>Today’s edition</h2>
          <p className="feature-facts">
            {stories.length} {stories.length === 1 ? "story" : "stories"} ·
            about {minutes} min
            {complete ? " · finished" : ""}
          </p>
          <div className="feature-actions">
            <button
              className={
                listenFirst ? "feature-secondary" : "primary feature-primary"
              }
              onClick={() => onRead(complete ? 0 : position)}
            >
              {primaryLabel}
            </button>
            <button
              className={
                listenFirst ? "primary feature-primary" : "feature-secondary"
              }
              onClick={onListen}
            >
              <Icon name="listen" size={18} />
              Listen
            </button>
          </div>
        </div>
      </article>
      <section className="home-inside" aria-label="What's inside">
        <h2>What’s inside</h2>
        <ol className="inside-list">
          {stories.map((story, i) => {
            const art = storyCover(story, date, storyboards);
            const theme = themes[i];
            return (
              <li key={story.id}>
                <button
                  onClick={() => onRead(i)}
                  style={
                    { "--story-bg": theme.background } as React.CSSProperties
                  }
                >
                  <span className="inside-art" aria-hidden="true">
                    {art ? (
                      <img
                        src={art.src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="inside-placeholder" />
                    )}
                  </span>
                  <span className="inside-copy">
                    <span className="inside-meta">
                      {String(i + 1).padStart(2, "0")} · {story.category}
                    </span>
                    <span className="inside-title">{story.headline}</span>
                  </span>
                  <Icon name="next" size={18} />
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      <button className="home-mini" onClick={onMini}>
        <span className="mini-cover-grid" aria-hidden="true">
          {Array.from({ length: 25 }, (_, i) => (
            <i
              key={i}
              className={[0, 1, 5, 19, 23, 24].includes(i) ? "block" : ""}
            />
          ))}
        </span>
        <span className="home-mini-copy">
          <strong>The Mini</strong>
          <span>A little brain break after the news.</span>
        </span>
        <Icon name="next" size={18} />
      </button>
    </section>
  );
}
