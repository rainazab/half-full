"use client";
import { useEffect, useRef, useState } from "react";
import {
  dateLabel,
  earliestEditionDay,
  selectableDay,
  shiftDay,
  type ArchiveEntry,
} from "@/lib/daily";

export default function DatePicker({
  open,
  date,
  today,
  entries,
  onClose,
  onSelect,
}: {
  open: boolean;
  date: string;
  today: string;
  entries: ArchiveEntry[];
  onClose: () => void;
  onSelect: (day: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [month, setMonth] = useState(date.slice(0, 7));
  const [jump, setJump] = useState(date);
  const [focused, setFocused] = useState<string>();
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      trigger.current = document.activeElement as HTMLElement;
      setMonth(date.slice(0, 7));
      setJump(date);
      dialog.current?.showModal();
    } else if (dialog.current?.open) dialog.current.close();
  }, [open, date]);
  useEffect(() => {
    if (focused)
      dialog.current
        ?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)
        ?.focus();
  }, [focused, month]);
  function close() {
    dialog.current?.close();
    onClose();
    trigger.current?.focus();
  }
  function pick(day: string) {
    if (selectableDay(day, today)) {
      close();
      onSelect(day);
    }
  }
  const minimum = earliestEditionDay(today);
  const first = new Date(`${month}-01T12:00:00Z`);
  const days = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const move = (delta: number) => {
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + delta);
    setMonth(next.toISOString().slice(0, 7));
  };
  return (
    <dialog
      className="date-picker"
      ref={dialog}
      aria-labelledby="date-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
    >
      <div className="date-picker-content">
        <div className="date-picker-heading">
          <div>
            <h2 id="date-picker-title">Pick a day.</h2>
          </div>
          <button
            type="button"
            className="date-picker-close"
            aria-label="Close date picker"
            onClick={close}
          >
            ×
          </button>
        </div>
        <p className="date-picker-intro">
          Daily editions from the last ten years.
        </p>
        <div className="date-month-controls">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => move(-1)}
            disabled={month <= minimum.slice(0, 7)}
          >
            ‹
          </button>
          <label>
            <span className="sr-only">Month</span>
            <select
              aria-label="Month"
              value={month.slice(5)}
              onChange={(e) =>
                setMonth(`${month.slice(0, 4)}-${e.target.value}`)
              }
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option
                  key={i}
                  value={String(i + 1).padStart(2, "0")}
                  disabled={
                    (month.slice(0, 4) === today.slice(0, 4) &&
                      i + 1 > Number(today.slice(5, 7))) ||
                    (month.slice(0, 4) === minimum.slice(0, 4) &&
                      i + 1 < Number(minimum.slice(5, 7)))
                  }
                >
                  {dateLabel(`2000-${String(i + 1).padStart(2, "0")}-01`, {
                    month: "long",
                  })}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Year</span>
            <select
              aria-label="Year"
              value={month.slice(0, 4)}
              onChange={(e) => {
                const candidate = `${e.target.value}-${month.slice(5)}`;
                setMonth(
                  candidate < minimum.slice(0, 7)
                    ? minimum.slice(0, 7)
                    : candidate > today.slice(0, 7)
                      ? today.slice(0, 7)
                      : candidate,
                );
              }}
            >
              {Array.from(
                {
                  length:
                    Number(today.slice(0, 4)) - Number(minimum.slice(0, 4)) + 1,
                },
                (_, i) => (
                  <option key={i} value={Number(today.slice(0, 4)) - i}>
                    {Number(today.slice(0, 4)) - i}
                  </option>
                ),
              )}
            </select>
          </label>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => move(1)}
            disabled={month >= today.slice(0, 7)}
          >
            ›
          </button>
        </div>
        <div
          className="date-picker-grid"
          role="group"
          aria-label={dateLabel(`${month}-01`, {
            month: "long",
            year: "numeric",
          })}
        >
          {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
            <span className="weekday" key={`weekday${i}`} aria-hidden="true">
              {day}
            </span>
          ))}
          {Array.from({ length: first.getUTCDay() }, (_, i) => (
            <span key={`blank${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const day = `${month}-${String(i + 1).padStart(2, "0")}`;
            const saved = entries.some(
              (e) => e.date === day && e.mode === "live",
            );
            return (
              <button
                type="button"
                key={day}
                data-day={day}
                disabled={!selectableDay(day, today)}
                aria-label={`${dateLabel(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${saved ? ", saved edition" : ""}`}
                aria-pressed={date === day}
                aria-current={day === today ? "date" : undefined}
                className={`${saved ? "saved" : ""} ${day === today ? "is-today" : ""}`}
                onClick={() => pick(day)}
                onKeyDown={(event) => {
                  const delta = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    ArrowUp: -7,
                    ArrowDown: 7,
                  }[event.key as "ArrowLeft"];
                  if (delta) {
                    event.preventDefault();
                    const target = shiftDay(day, delta);
                    if (selectableDay(target, today)) {
                      setMonth(target.slice(0, 7));
                      setFocused(target);
                    }
                  }
                }}
              >
                {i + 1}
                {saved && <i aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="date-picker-footer">
          <span>
            <i /> Saved edition
          </span>
          <button type="button" onClick={() => pick(today)}>
            Today
          </button>
        </div>
        <form
          className="date-jump"
          onSubmit={(event) => {
            event.preventDefault();
            pick(jump);
          }}
        >
          <label htmlFor="edition-date-jump">Jump straight to a date</label>
          <div>
            <input
              id="edition-date-jump"
              type="date"
              min={minimum}
              max={today}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              required
            />
            <button type="submit" disabled={!selectableDay(jump, today)}>
              Go ↗
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
