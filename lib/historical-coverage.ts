import { EDITION_TIME_ZONE } from "./daily";

/**
 * Timezone policy for historical editions. An article belongs to an edition
 * day when its publication timestamp falls on that calendar day in UTC OR in
 * the shared Pacific publishing zone. Bay Area evening reporting is published
 * after midnight UTC, so a UTC-only check wrongly excludes it; the Pacific
 * check is a correct reading of the same timestamp, not a borrowed date.
 */
export function publicationDays(publishedAt: string | null | undefined) {
  if (!publishedAt) return null;
  const timestamp = Date.parse(publishedAt);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return {
    utc: date.toISOString().slice(0, 10),
    pacific: new Intl.DateTimeFormat("en-CA", {
      timeZone: EDITION_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date),
  };
}
export function matchesEditionDay(
  publishedAt: string | null | undefined,
  day: string,
) {
  const days = publicationDays(publishedAt);
  return !!days && (days.utc === day || days.pacific === day);
}
/**
 * The latest instant that still belongs to the edition day under this policy:
 * the end of that calendar day in Pacific time (07:59:59.999Z or 06:59:59.999Z
 * the next UTC day). Editorial validation uses it as the reference clock so a
 * same-day Pacific-evening article is never treated as future-dated.
 */
export function editionDayEnd(day: string) {
  const utcEnd = Date.parse(`${day}T23:59:59.999Z`);
  let latest = utcEnd;
  for (const offsetHours of [7, 8]) {
    const candidate = utcEnd + offsetHours * 3600000;
    if (publicationDays(new Date(candidate).toISOString())?.pacific === day)
      latest = Math.max(latest, candidate);
  }
  return new Date(latest);
}
export const COVERAGE_TARGET = 8;
/**
 * Bounded second discovery pass for thin historical days: broader credible
 * publishers and general-news lanes, still restricted to the exact day range.
 * Dates are enforced afterwards by the same publication-date policy.
 */
export function secondPassQueries(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)))
    throw Error("Use a valid edition date.");
  const date = new Date(`${day}T12:00:00Z`);
  const year = date.getUTCFullYear();
  if (year >= 2010) {
    const previous = new Date(date.getTime() - 86400000)
      .toISOString()
      .slice(0, 10);
    const next = new Date(date.getTime() + 86400000).toISOString().slice(0, 10);
    const range = `after:${previous} before:${next}`;
    return [
      `(site:apnews.com OR site:reuters.com OR site:pbs.org/newshour OR site:npr.org/${year}/) ${range} news -inurl:live -inurl:video`,
      `(site:sfchronicle.com OR site:mercurynews.com OR site:sfgate.com OR site:latimes.com OR site:kqed.org) ${range} (California OR "Bay Area" OR "San Francisco" OR Oakland)`,
      `(site:bbc.com/news OR site:theguardian.com OR site:nytimes.com OR site:washingtonpost.com) ${range} (science OR health OR climate OR technology OR economy) -inurl:live`,
    ];
  }
  const dayNumber = date.getUTCDate();
  const month = date.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return [
    `(site:news.bbc.co.uk OR site:cnn.com/${year}/ OR site:npr.org/${year}/) "${month} ${dayNumber}, ${year}" news`,
    `(site:theguardian.com OR site:nytimes.com/${year}/) "${dayNumber} ${month} ${year}" OR "${month} ${dayNumber}, ${year}"`,
  ];
}
export type CoverageCounts = {
  retrieved: number;
  unique: number;
  sameDay: number;
  undated: number;
  otherDay: number;
  secondPass?: { retrieved: number; added: number; reason: string };
};
export function coverageMessage(day: string, counts: CoverageCounts) {
  return `Date coverage for ${day}: ${counts.retrieved} retrieved records, ${counts.unique} unique articles, ${counts.sameDay} published that day (UTC or Pacific), ${counts.undated} without a reliable publication date, ${counts.otherDay} on other days.`;
}
/** Parses the structured coverage line back out of a run log for Studio. */
export function parseCoverageMessage(message: string) {
  const match =
    /Date coverage for (\d{4}-\d{2}-\d{2}): (\d+) retrieved records, (\d+) unique articles, (\d+) published that day \(UTC or Pacific\), (\d+) without a reliable publication date, (\d+) on other days\./.exec(
      message,
    );
  if (!match) return null;
  const [, day, retrieved, unique, sameDay, undated, otherDay] = match;
  return {
    day,
    retrieved: Number(retrieved),
    unique: Number(unique),
    sameDay: Number(sameDay),
    undated: Number(undated),
    otherDay: Number(otherDay),
  };
}
