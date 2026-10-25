"use client";
import { dateLabel, readingStreak, shiftDay, type ArchiveEntry } from "@/lib/daily";
import type { ProfileState } from "./ProfileCard";
import DitheredAtmosphere from "./DitheredAtmosphere";
import Icon from "./Icon";

const REACTIONS = [
  { label: "Interesting", image: "interesting" }, { label: "Insightful", image: "insightful" },
  { label: "Hopeful", image: "hopeful" }, { label: "Stressed", image: "stressed" },
] as const;
const normalized = (value: string) => value === "Clearer" ? "Insightful" : value === "A lot" ? "Stressed" : value;
function longestStreak(days: string[]) {
  const ordered = [...new Set(days)].sort(); let longest = 0, current = 0, previous = "";
  for (const day of ordered) { current = previous && shiftDay(previous, 1) === day ? current + 1 : 1; longest = Math.max(longest, current); previous = day; }
  return longest;
}

export default function JarExperience({ profile, today, entries, selectedDate, onOpenDate, onOpenToday, onOpenProfile }: {
  profile: ProfileState; today: string; entries: ArchiveEntry[]; selectedDate: string; onOpenDate: (day: string) => void; onOpenToday: () => void; onOpenProfile?: () => void;
}) {
  const { progress } = profile, reactions = Object.values(progress.reactions).filter(Boolean);
  const streak = readingStreak(progress.days, today), longest = longestStreak(progress.days);
  const finished = [...progress.days].sort((a, b) => b.localeCompare(a));
  const week = Array.from({ length: 7 }, (_, index) => shiftDay(today, index - 6));
  return <section className="library-screen progress-experience" aria-labelledby="your-days-title">
    <DitheredAtmosphere tone="mint" intensity={0.17} />
    <header className="library-page-intro progress-intro"><p className="eyebrow">A little perspective, every day</p><h1 id="your-days-title">Your days.</h1><p>A record of what you’ve made time for.</p></header>
    <section className="progress-rhythm-card" aria-labelledby="progress-rhythm-title">
      <div className="progress-rhythm-heading"><div><p className="eyebrow">Your rhythm</p><h2 id="progress-rhythm-title">{streak ? `${streak}-day streak` : "Start a streak"}</h2><p>{streak ? "Keep up with the news, at your own pace." : "Finish an edition whenever you’re ready."}</p></div><div className="progress-streak-mark" aria-hidden="true"><Icon name="today" size={34} /></div></div>
      <div className="progress-week" aria-label="Last seven days">{week.map((day) => <div key={day} className={progress.days.includes(day) ? "is-complete" : ""}><span>{dateLabel(day, { weekday: "short" }).slice(0, 2)}</span><i aria-hidden="true">{progress.days.includes(day) ? "✓" : ""}</i></div>)}</div>
      <div className="progress-stats"><div><strong>{finished.length}</strong><span>editions finished</span></div><div><strong>{longest}</strong><span>longest streak</span></div></div>
      <button className="primary progress-open-edition" onClick={onOpenToday}>{progress.days.includes(today) ? "Visit today’s edition" : "Get caught up"}<Icon name="next" size={17} /></button>
    </section>
    <div className="progress-library">
      <section className="progress-reaction-shelf" aria-labelledby="progress-reaction-title"><div className="library-section-title"><h2 id="progress-reaction-title">How it landed</h2><span>{reactions.length} {reactions.length === 1 ? "reaction" : "reactions"}</span></div><div className="progress-reaction-lineup">{REACTIONS.map((item) => { const count = reactions.filter((reaction) => normalized(reaction) === item.label).length; return <div key={item.label} className={count ? "has-reactions" : ""}><img src={`/reactions/${item.image}.webp`} alt="" width={48} height={48} /><span>{item.label}</span><strong>{count}</strong></div>; })}</div></section>
      <section className="progress-recent-shelf" aria-labelledby="progress-recent-title"><div className="library-section-title"><h2 id="progress-recent-title">Recently explored</h2><span>{profile.user ? "Synced to your account" : "Saved on this device"}</span></div>{finished.length ? <ul className="memory-edition-list">{finished.slice(0, 7).map((day) => { const entry = entries.find((item) => item.date === day && item.mode === "live"); return <li key={day}><button onClick={() => onOpenDate(day)} aria-current={day === selectedDate ? "date" : undefined}><span className="memory-edition-date"><b>{dateLabel(day, { day: "numeric" })}</b><small>{dateLabel(day, { month: "short" })}</small></span><span><strong>{dateLabel(day, { weekday: "long" })}’s edition</strong><small>{day.slice(0, 4)}{entry ? ` · ${entry.count} stories` : ""} · Finished</small></span><Icon name="check" size={18} /></button></li>; })}</ul> : <p className="library-empty-note">Finish an edition and your first day will show up here.</p>}</section>
      {!profile.user && onOpenProfile && <button className="jar-account-link" onClick={onOpenProfile}>Keep your progress across devices <Icon name="next" size={16} /></button>}
    </div>
  </section>;
}
