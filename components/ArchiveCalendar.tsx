"use client";
import { useEffect, useState } from "react";
import {
  dateLabel,
  earliestEditionDay,
  selectableDay,
  shiftDay,
  type ArchiveEntry,
} from "@/lib/daily";
import DitheredAtmosphere from "./DitheredAtmosphere";
import Icon from "./Icon";

/** Published dots and completed checks describe real records; unprepared days stay honest. */
export default function ArchiveCalendar({
  entries,
  today,
  onSelect,
  date = today,
  completedDays = [],
  onOpenDate,
  onPickDate,
}: {
  entries: ArchiveEntry[];
  today: string;
  onSelect?: (entry: ArchiveEntry) => void;
  date?: string;
  completedDays?: string[];
  onOpenDate?: (day: string) => void;
  onPickDate?: () => void;
}) {
  const [month, setMonth] = useState(date.slice(0, 7));
  const [selected, setSelected] = useState(date);
  const [focused, setFocused] = useState("");
  const minimum = earliestEditionDay(today);
  const first = new Date(`${month}-01T12:00:00Z`);
  const count = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const published = entries.filter((entry) => entry.mode === "live");
  const chosen = published.find((entry) => entry.date === selected);
  const completed = completedDays.includes(selected);
  useEffect(() => {
    setSelected(date);
    setMonth(date.slice(0, 7));
  }, [date]);
  useEffect(() => {
    if (focused)
      document
        .querySelector<HTMLButtonElement>(
          `.edition-calendar [data-calendar-day="${focused}"]`,
        )
        ?.focus();
  }, [focused, month]);
  function move(delta: number) {
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + delta);
    setMonth(next.toISOString().slice(0, 7));
  }
  function openDay(day: string) {
    const entry = published.find((item) => item.date === day);
    if (onOpenDate) onOpenDate(day);
    else if (entry) onSelect?.(entry);
  }
  return (
    <section
      className="library-screen edition-calendar"
      aria-labelledby="edition-calendar-title"
    >
      <DitheredAtmosphere tone="lavender" intensity={0.1} />
      <header className="library-page-intro">
        <p className="eyebrow">A day worth opening</p>
        <h1 id="edition-calendar-title">Your days with half full.</h1>
        <p>A little perspective from another day.</p>
      </header>
      <div className="calendar-library-layout">
        <div className="calendar-surface">
          {onPickDate && (
            <button className="calendar-quick-jump" onClick={onPickDate}>
              Jump to a date <Icon name="calendar" size={15} />
            </button>
          )}
          <div className="calendar-heading">
            <button
              aria-label="Previous month"
              disabled={month <= minimum.slice(0, 7)}
              onClick={() => move(-1)}
            >
              <Icon name="back" size={17} />
            </button>
            <h2>
              {dateLabel(`${month}-01`, { month: "long", year: "numeric" })}
            </h2>
            <button
              aria-label="Next month"
              disabled={month >= today.slice(0, 7)}
              onClick={() => move(1)}
            >
              <Icon name="next" size={17} />
            </button>
          </div>
          <div
            className="calendar-grid"
            role="group"
            aria-label={dateLabel(`${month}-01`, {
              month: "long",
              year: "numeric",
            })}
          >
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <span
                className="weekday"
                key={`weekday-${index}`}
                aria-hidden="true"
              >
                {day}
              </span>
            ))}
            {Array.from({ length: first.getUTCDay() }, (_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {Array.from({ length: count }, (_, index) => {
              const day = `${month}-${String(index + 1).padStart(2, "0")}`;
              const entry = published.find((item) => item.date === day);
              const done = completedDays.includes(day);
              const available =
                selectableDay(day, today) &&
                (Boolean(onOpenDate) || Boolean(entry));
              return (
                <button
                  key={day}
                  data-calendar-day={day}
                  disabled={!available}
                  className={`${day === today ? "today" : ""} ${entry ? "available" : ""} ${done ? "completed" : ""} ${day === selected ? "selected" : ""}`}
                  aria-current={day === today ? "date" : undefined}
                  aria-pressed={day === selected}
                  aria-label={`${dateLabel(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${done ? "completed edition" : entry ? `${entry.count} stories, published edition` : available ? "not prepared yet" : "unavailable"}`}
                  onClick={() => setSelected(day)}
                  onKeyDown={(event) => {
                    const delta = (
                      {
                        ArrowLeft: -1,
                        ArrowRight: 1,
                        ArrowUp: -7,
                        ArrowDown: 7,
                      } as Record<string, number>
                    )[event.key];
                    if (!delta) return;
                    event.preventDefault();
                    const target = shiftDay(day, delta);
                    if (selectableDay(target, today)) {
                      setMonth(target.slice(0, 7));
                      setFocused(target);
                    }
                  }}
                >
                  {index + 1}
                  {done ? (
                    <span
                      className="calendar-completed-mark"
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  ) : entry ? (
                    <i aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span>
              <i className="legend-published" />
              Published
            </span>
            <span>
              <i className="legend-completed">✓</i>Finished
            </span>
            <span>
              <i className="legend-today" />
              Today
            </span>
          </div>
        </div>
        <section
          className="selected-edition-preview"
          aria-live="polite"
          aria-labelledby="selected-edition-title"
        >
          <div className="selected-edition-art" aria-hidden="true"><Icon name="calendar" size={34} /></div>
          <p className="eyebrow">
            {completed
              ? "Already finished"
              : chosen
                ? "Ready to open"
                : "A new day to explore"}
          </p>
          <h2 id="selected-edition-title">
            {dateLabel(selected, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </h2>
          <p>
            {chosen
              ? `${chosen.count} stories · ${completed ? "Finished" : "Published edition"}`
              : "This day hasn’t been prepared. Opening it starts a search for reporting from that date."}
          </p>
          <button
            className="primary"
            onClick={() => openDay(selected)}
            disabled={!chosen && !onOpenDate}
          >
            Open this day <Icon name="next" size={15} />
          </button>
        </section>
      </div>
      <p className="calendar-range-note">
        Up to ten years back. A day is published only when enough reporting
        passes the evidence checks.
      </p>
      {published.length > 0 && (
        <section
          className="calendar-saved-editions"
          aria-labelledby="calendar-saved-title"
        >
          <h2 id="calendar-saved-title">On the shelf</h2>
          {[...published]
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 8)
            .map((entry) => (
              <button key={entry.id} onClick={() => openDay(entry.date)}>
                <span>
                  {dateLabel(entry.date, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <small>
                  {entry.count} stories{" "}
                  {completedDays.includes(entry.date) ? "· ✓" : "↗"}
                </small>
              </button>
            ))}
        </section>
      )}
    </section>
  );
}
