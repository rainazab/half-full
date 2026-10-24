"use client";
import { useState } from "react";
import { dateLabel, type ArchiveEntry } from "@/lib/daily";
export default function ArchiveCalendar({
  entries,
  today,
  onSelect,
}: {
  entries: ArchiveEntry[];
  today: string;
  onSelect: (entry: ArchiveEntry) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = new Date(`${month}-01T12:00:00Z`),
    count = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
  function move(delta: number) {
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + delta);
    setMonth(next.toISOString().slice(0, 7));
  }
  return (
    <section className="archive-page">
      <div className="page-heading">
        <p className="eyebrow">A moment, saved</p>
        <h1>Every day has a story.</h1>
        <p>Come back to an edition. No catching up required.</p>
      </div>
      <div className="archive-layout">
        <div className="calendar">
          <div className="calendar-heading">
            <button aria-label="Previous month" onClick={() => move(-1)}>
              ‹
            </button>
            <h2>
              {dateLabel(`${month}-01`, { month: "long", year: "numeric" })}
            </h2>
            <button
              aria-label="Next month"
              disabled={month >= today.slice(0, 7)}
              onClick={() => move(1)}
            >
              ›
            </button>
          </div>
          <div className="calendar-grid">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
              <span key={i} aria-hidden="true">
                {day}
              </span>
            ))}
            {Array.from({ length: first.getUTCDay() }, (_, i) => (
              <span key={`empty${i}`} />
            ))}
            {Array.from({ length: count }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, "0")}`,
                entry = entries.find((e) => e.date === date);
              return (
                <button
                  key={date}
                  disabled={!entry}
                  className={`${date === today ? "today" : ""} ${entry ? "available" : ""}`}
                  aria-label={`${dateLabel(date)}, ${entry ? `${entry.mode === "demo" ? "archived sample" : "published edition"}, ${entry.count} stories` : "no edition"}`}
                  onClick={() => entry && onSelect(entry)}
                >
                  {i + 1}
                  {entry && <i />}
                </button>
              );
            })}
          </div>
          <p className="note">● Saved edition · outlined date is today</p>
        </div>
        <div className="archive-list">
          <p className="eyebrow">On the shelf</p>
          {[...entries]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((entry) => (
              <button
                key={`${entry.date}-${entry.mode}`}
                onClick={() => onSelect(entry)}
              >
                <span className="archive-day">
                  {dateLabel(entry.date, { day: "numeric" })}
                  <small>{dateLabel(entry.date, { month: "short" })}</small>
                </span>
                <span>
                  <strong>
                    {entry.label ??
                      (entry.mode === "demo"
                        ? "The archive collection"
                        : "The daily edition")}
                  </strong>
                  <small>
                    {entry.count} stories ·{" "}
                    {entry.mode === "demo"
                      ? "Saved demo / retrospective"
                      : "Published"}
                  </small>
                </span>
                <span>↗</span>
              </button>
            ))}
          <p className="note">
            Past sample collections are clearly labeled. They keep the original
            reporting dates and are never presented as freshly retrieved news.
          </p>
        </div>
      </div>
    </section>
  );
}
