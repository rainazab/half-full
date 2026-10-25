"use client";
import { useId } from "react";
import { dateLabel, readingStreak, type ArchiveEntry } from "@/lib/daily";
import type { ProfileState } from "./ProfileCard";
import Charm from "./Charm";
import DitheredAtmosphere from "./DitheredAtmosphere";
import Icon from "./Icon";

const REACTIONS = [
  { label: "Interesting", image: "interesting" },
  { label: "Insightful", image: "insightful" },
  { label: "Hopeful", image: "hopeful" },
  { label: "Stressed", image: "stressed" },
] as const;
const MOODS = ["mint", "yellow", "pink", "blue"] as const;
const normalized = (value: string) =>
  value === "Clearer" ? "Insightful" : value === "A lot" ? "Stressed" : value;

/** The fill is a picture of real completed editions, never invented activity. */
function JarIllustration({
  days,
  reactions,
}: {
  days: number;
  reactions: string[];
}) {
  const id = useId().replace(/:/g, "");
  return (
    <div className="memory-jar-art" aria-hidden="true">
      <svg className="memory-jar-vessel" viewBox="0 0 360 350" fill="none">
        <defs>
          <linearGradient
            id={`${id}-glass`}
            x1="86"
            y1="96"
            x2="277"
            y2="294"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#ffffff" stopOpacity=".65" />
            <stop offset=".55" stopColor="#eff9ed" stopOpacity=".13" />
            <stop offset="1" stopColor="#c0d6cf" stopOpacity=".72" />
          </linearGradient>
        </defs>
        <ellipse
          cx="184"
          cy="322"
          rx="119"
          ry="16"
          fill="#719783"
          opacity=".15"
        />
        <path
          d="M105 86H256V106C255 117 281 125 282 157L291 277C293 307 278 320 250 322H111C83 322 68 309 70 280L79 157C81 127 105 117 105 106V86Z"
          fill={`url(#${id}-glass)`}
          stroke="#53796b"
          strokeWidth="3"
        />
        <path
          d="M109 108H252M89 161L82 276C80 297 92 309 112 310M269 156L278 274"
          stroke="#fffdf5"
          strokeWidth="7"
          strokeLinecap="round"
          opacity=".77"
        />
        <path
          d="M98 69C98 61 104 57 113 57H249C258 57 264 61 264 69V88C264 96 258 99 249 99H113C104 99 98 96 98 88V69Z"
          fill="#e4d7be"
          stroke="#53796b"
          strokeWidth="3"
        />
        <path
          d="M109 69H252M110 86H252"
          stroke="#c8b692"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M143 188C158 180 203 180 219 188L223 247C205 256 156 256 139 247L143 188Z"
          fill="#faf4df"
          stroke="#e3d8bc"
          strokeWidth="1.5"
        />
        <text
          x="181"
          y="230"
          textAnchor="middle"
          fill="#315748"
          fontSize="46"
          fontWeight="750"
          fontFamily="inherit"
        >
          ½
        </text>
        <path
          d="M54 262C35 249 34 234 46 228C59 230 64 244 60 254M52 270C38 269 29 275 34 284C46 286 54 281 57 275"
          fill="#789b7a"
        />
        <path
          d="M53 291L60 252"
          stroke="#527762"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <div className="memory-jar-keepsakes">
        {Array.from({ length: Math.min(days, 9) }, (_, index) => (
          <div
            className={`jar-keepsake keepsake-${index}`}
            key={`edition-${index}`}
          >
            <Charm mood={MOODS[index % MOODS.length]} />
          </div>
        ))}
        {reactions.slice(0, 3).map((reaction, index) => {
          const item = REACTIONS.find(
            (entry) => entry.label === normalized(reaction),
          );
          return item ? (
            <img
              className={`jar-reaction-keepsake reaction-keepsake-${index}`}
              key={`${item.image}-${index}`}
              src={`/reactions/${item.image}.webp`}
              alt=""
              width={55}
              height={55}
            />
          ) : null;
        })}
      </div>
      {days > 9 && (
        <span className="jar-more-keepsakes">+{days - 9} more inside</span>
      )}
    </div>
  );
}

export default function JarExperience({
  profile,
  today,
  entries,
  selectedDate,
  onOpenDate,
  onOpenToday,
  onOpenProfile,
}: {
  profile: ProfileState;
  today: string;
  entries: ArchiveEntry[];
  selectedDate: string;
  onOpenDate: (day: string) => void;
  onOpenToday: () => void;
  onOpenProfile?: () => void;
}) {
  const { progress } = profile;
  const reactions = Object.values(progress.reactions).filter(Boolean);
  const streak = readingStreak(progress.days, today);
  const finished = [...progress.days].sort((a, b) => b.localeCompare(a));
  return (
    <section
      className="library-screen jar-experience"
      aria-labelledby="your-jar-title"
    >
      <DitheredAtmosphere tone="mint" intensity={0.17} />
      <header className="library-page-intro jar-intro">
        <p className="eyebrow">A little collection of perspective</p>
        <h1 id="your-jar-title">Your jar.</h1>
        <p>
          {finished.length
            ? "The days you made a little more sense of."
            : "A place for the days you get caught up."}
        </p>
      </header>
      <div className="jar-memory-hero">
        <JarIllustration days={finished.length} reactions={reactions} />
        <div className="jar-collection-caption">
          <strong>{finished.length}</strong>
          <span>
            {finished.length === 1 ? "edition collected" : "editions collected"}
          </span>
          {streak > 1 && (
            <small>{streak} days in a row · at your own pace</small>
          )}
        </div>
        <button className="primary jar-open-edition" onClick={onOpenToday}>
          {progress.days.includes(today)
            ? "Visit today’s edition"
            : "Get caught up"}
          <Icon name="next" size={17} />
        </button>
      </div>
      <div className="jar-memory-library">
        <section
          className="jar-reaction-shelf"
          aria-labelledby="jar-reaction-title"
        >
          <div className="library-section-title">
            <h2 id="jar-reaction-title">How it landed</h2>
            <span>
              {reactions.length}{" "}
              {reactions.length === 1 ? "reaction" : "reactions"}
            </span>
          </div>
          <div className="jar-reaction-lineup">
            {REACTIONS.map((item) => {
              const count = reactions.filter(
                (reaction) => normalized(reaction) === item.label,
              ).length;
              return (
                <div key={item.label} className={count ? "has-reactions" : ""}>
                  <img
                    src={`/reactions/${item.image}.webp`}
                    alt=""
                    width={54}
                    height={54}
                  />
                  <span>{item.label}</span>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
        </section>
        <section
          className="jar-edition-shelf"
          aria-labelledby="jar-editions-title"
        >
          <div className="library-section-title">
            <h2 id="jar-editions-title">Days in your jar</h2>
            <span>
              {profile.user ? "Synced to your account" : "Saved on this device"}
            </span>
          </div>
          {finished.length ? (
            <ul className="memory-edition-list">
              {finished.slice(0, 30).map((day) => {
                const entry = entries.find(
                  (item) => item.date === day && item.mode === "live",
                );
                return (
                  <li key={day}>
                    <button
                      onClick={() => onOpenDate(day)}
                      aria-current={day === selectedDate ? "date" : undefined}
                    >
                      <span className="memory-edition-date">
                        <b>{dateLabel(day, { day: "numeric" })}</b>
                        <small>{dateLabel(day, { month: "short" })}</small>
                      </span>
                      <span>
                        <strong>
                          {dateLabel(day, { weekday: "long" })}’s edition
                        </strong>
                        <small>
                          {day.slice(0, 4)}
                          {entry ? ` · ${entry.count} stories` : ""} · Finished
                        </small>
                      </span>
                      <Icon name="check" size={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="library-empty-note">
              Finish an edition and your first little keepsake lands here.
            </p>
          )}
        </section>
        {!profile.user && onOpenProfile && (
          <button className="jar-account-link" onClick={onOpenProfile}>
            Keep your jar across devices <Icon name="next" size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
