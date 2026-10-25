"use client";
import type { ApprovedStory } from "@/lib/types";
import type { StoryboardIndex } from "@/lib/storyboard";
import { assetPath, displayableScenes } from "@/lib/storyboard";
import { displayableMedia } from "@/lib/media";
import { dateLabel } from "@/lib/daily";
import { readingMinutes } from "@/lib/reading-position";
import { greeting } from "@/lib/onboarding";
import { assignThemes, themeVariables } from "@/lib/story-theme";
import type { CatchUpMode } from "@/lib/preferences";
import DitheredAtmosphere from "./DitheredAtmosphere";
import BrandWorldArtwork from "./BrandWorldArtwork";
import Icon from "./Icon";

/** Reuse the approved scene; opening Home never requests new artwork. */
export function storyCover(story: ApprovedStory, date: string, storyboards: StoryboardIndex) {
  const media = story.media?.find(m => displayableMedia(m) && m.rights === "publisher-preview");
  if (media) return { src: media.url, alt: media.alt, kind: "photo" as const, attribution: media.attribution };
  const scene = displayableScenes(storyboards[story.id])[0];
  return scene ? { src: assetPath(date, story.id, scene.id), alt: scene.alt, kind: "illustration" as const } : null;
}
export default function TodayHome({ date, today, stories, storyboards, complete, position, mode, displayName, onRead, onListen, onMini, onCalendar }: {
  date: string; today: string; stories: ApprovedStory[]; storyboards: StoryboardIndex; complete: boolean; position: number; mode: CatchUpMode; displayName?: string | null; onRead: (index: number) => void; onListen: () => void; onMini: () => void; onCalendar: () => void;
}) {
  const themes = assignThemes(stories);
  const covers = stories.map(story => storyCover(story, date, storyboards));
  const cover = covers.find(item => item?.kind === "illustration") ?? covers.find(Boolean);
  const minutes = readingMinutes(stories);
  const listening = mode === "listen" && !complete;
  const label = complete ? "Read again" : position > 0 ? "Continue" : listening ? "Start listening" : "Start reading";
  return (
    <section className="today-home" aria-label="Today">
      <DitheredAtmosphere tone="home" />
      <header className="home-intro">
        <p className="home-greeting">{greeting(new Date(), displayName)}</p>
        <h1>{complete ? "A little more in the know." : "Your daily dose of perspective."}</h1>
      </header>
      <article className="edition-feature" style={themes[0] ? themeVariables(themes[0]) : undefined}>
        <DitheredAtmosphere tone="story" intensity={0.14} />
        <div className="feature-heading">
          <button className="feature-date" onClick={onCalendar} aria-label="Choose edition date">
            {dateLabel(date, {weekday:"long", month:"short", day:"numeric"})}<Icon name="calendar" size={16}/>
          </button>
          <span className="feature-state">{complete ? "Finished ✓" : date === today ? "Today’s edition" : "On this day"}</span>
        </div>
        <button className="feature-art" onClick={() => onRead(complete ? 0 : position)} aria-label="Open your daily edition">
          {cover ? <img src={cover.src} alt={cover.alt} loading="eager" decoding="async" draggable={false}/> : <BrandWorldArtwork variant="welcome"/>}
        </button>
        <div className="feature-copy">
          <div><h2>Your daily catch-up</h2><p>{stories.length} stories <span>·</span> about {minutes} min</p></div>
        </div>
        <div className="feature-actions">
          <button className="primary feature-primary" onClick={() => listening ? onListen() : onRead(complete ? 0 : position)}>{label}<Icon name="next" size={18}/></button>
          <button className="feature-secondary" onClick={() => listening ? onRead(position) : onListen()}><Icon name={listening ? "today" : "listen"} size={17}/>{listening ? "Read instead" : "Listen"}</button>
        </div>
      </article>
      <section className="home-inside" aria-label="Today's lineup">
        <div className="home-section-title"><h2>In this edition</h2><span>{stories.length} stories</span></div>
        <ol className="inside-list">{stories.map((story,i) => <li key={story.id}><button className="lineup-row" onClick={() => onRead(i)} style={themeVariables(themes[i])}>
          <span className="inside-art" aria-hidden="true">{covers[i] ? <img src={covers[i]!.src} alt="" loading="lazy" decoding="async"/> : <span className="inside-placeholder">{String(i+1).padStart(2,"0")}</span>}</span>
          <span className="inside-copy"><span className="inside-meta">{story.category}</span><span className="inside-title">{story.headline}</span></span><Icon name="next" size={17}/>
        </button></li>)}</ol>
      </section>
      <button className="home-mini" onClick={onMini}><span className="mini-cover-grid" aria-hidden="true">{Array.from({length:25},(_,i)=><i key={i} className={[0,1,5,19,23,24].includes(i)?"block":""}/>)}</span><span className="home-mini-copy"><strong>A little brain break</strong><span>Brain Break</span></span><Icon name="next" size={18}/></button>
    </section>
  );
}
