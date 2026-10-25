import type { RunLogEntry } from "./types";

// Stage weights follow observed runs (~90s retrieval, ~30s review). In-flight
// estimates stop at a stage cap; only a published result can ever report 100%.
const stages = [
  {
    match: /^configuration/,
    label: "Getting ready",
    start: 1,
    end: 4,
    seconds: 3,
  },
  {
    match: /^(apify|discovery|investigation)/,
    label: "Finding reporting",
    start: 5,
    end: 68,
    seconds: 100,
  },
  {
    match: /^(normalize|edition\.date)/,
    label: "Checking sources",
    start: 69,
    end: 73,
    seconds: 3,
  },
  {
    match: /review|repair/,
    label: "Selecting stories",
    start: 74,
    end: 92,
    seconds: 40,
  },
  {
    match: /^validate/,
    label: "Checking the edition",
    start: 93,
    end: 95,
    seconds: 3,
  },
  { match: /^images/, label: "Adding photos", start: 96, end: 97, seconds: 5 },
  {
    match: /^(edition$|archive\.save)/,
    label: "Saving your edition",
    start: 98,
    end: 99,
    seconds: 5,
  },
];
export function generationProgress(
  log: RunLogEntry[],
  now = Date.now(),
  published = false,
) {
  if (published) return { percent: 100, label: "Ready" };
  let index = -1;
  let since = now;
  for (const entry of log) {
    if (entry.status === "failed") continue;
    const next = stages.findIndex((stage) => stage.match.test(entry.step));
    if (next > index) {
      index = next;
      since = Date.parse(entry.timestamp);
    }
  }
  if (index < 0) return { percent: 1, label: "Waiting to start" };
  const stage = stages[index];
  const elapsed = Math.max(0, (now - since) / 1000);
  const fraction = Math.min(0.98, elapsed / stage.seconds);
  return {
    percent: Math.min(
      99,
      Math.floor(stage.start + (stage.end - stage.start) * fraction),
    ),
    label: stage.label,
  };
}
export function mergeRunLogs(previous: RunLogEntry[], incoming: RunLogEntry[]) {
  return [
    ...new Map(
      [...previous, ...incoming].map((entry) => [
        `${entry.timestamp}/${entry.step}/${entry.status}`,
        entry,
      ]),
    ).values(),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
