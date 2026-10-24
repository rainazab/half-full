import type { ApprovedStory } from "./types";
import type { Puzzle, Entry } from "./crossword";
import { validateCrossword } from "./crossword";

const clues: Record<string, string> = {
  EAST: "Where the sun rises",
  GAME: "Something you play",
  GREW: "Became bigger",
  SHIFT: "Change position, or a keyboard key",
  WEB: "World Wide ___",
  MODE: "A setting, like airplane or dark",
  LARGE: "Bigger than medium",
  ELSE: "What ___ is new?",
  GET: "Understand, informally",
  LEG: "One of a table’s supports",
  MALE: "Opposite of female",
  WORST: "Opposite of best",
  EDGE: "A border or boundary",
  BEE: "A flower-visiting pollinator",
  RNA: "Genetic molecule that helps cells make proteins",
  MEAN: "The average, in math",
  HEAVY: "Hard to lift",
  ONLY: "One and no more",
  GUM: "Something to chew, but not swallow",
  HOG: "Keep all to yourself, as the remote",
  MENU: "A list of choices",
  REALM: "A field or domain",
  NAVY: "A dark shade of blue",
  ANY: "Whichever one",
  NET: "What a goalkeeper defends",
  LOVE: "Zero, in tennis",
  MOVED: "Changed places",
  USER: "Someone operating an app",
  GEL: "Hair-styling substance",
  MUG: "A coffee cup with a handle",
  LOSE: "Misplace",
  NOVEL: "A long work of fiction",
  EVER: "At any time",
  TED: "Nickname for Theodore",
  AGE: "Number of birthdays you’ve had",
  GRAY: "Between black and white",
  PRIME: "A number with exactly two positive divisors",
  ROSE: "A flower, or the past tense of rise",
  OWE: "Have a debt to repay",
  PRO: "Opposite of con",
  GROW: "Become larger",
  ARISE: "Come into being",
  GIVE: "Hand over",
  EYE: "The iris is part of it",
  SEA: "A large body of salt water",
  THAT: "This and ___",
  LEFT: "Opposite of right",
  LET: "Allow",
  ALL: "Every last one",
  TREE: "A plant with a trunk",
  SHIRT: "A top with sleeves",
  EASE: "Make less difficult",
  ATE: "Had a meal",
};
const designs = [
  {
    id: "web",
    title: "A little connected",
    terms: /\b(web|php|software|internet|technology|digital|ai)\b/i,
    rows: ["##WEB", "#MODE", "LARGE", "ELSE#", "GET##"],
  },
  {
    id: "cells",
    title: "The small things",
    terms: /\b(rna|gene|genetic|cancer|cells|health|medicine|clinical)\b/i,
    rows: ["##RNA", "#MEAN", "HEAVY", "ONLY#", "GUM##"],
  },
  {
    id: "perspective",
    title: "A little perspective",
    terms: /\b(growth|rate|age|economy|finance|price)\b/i,
    rows: ["##AGE", "#GRAY", "PRIME", "ROSE#", "OWE##"],
  },
  {
    id: "outside",
    title: "A breath of fresh air",
    terms: /\b(climate|ocean|environment|nature|sea|water)\b/i,
    rows: ["##SEA", "#THAT", "ARISE", "LEFT#", "LET##"],
  },
  {
    id: "pause",
    title: "Take a little pause",
    terms: /\b(sport|football|book|culture)\b/i,
    rows: ["##NET", "#LOVE", "MOVED", "USER#", "GEL##"],
  },
];
export type Mini = Puzzle & {
  id: string;
  title: string;
  themeStoryId?: string;
  notice: string;
};
export function miniFromRows(rows: string[]): Puzzle {
  if (rows.length !== 5 || rows.some((r) => !/^[A-Z#]{5}$/.test(r)))
    throw Error("Mini must be a 5 × 5 grid.");
  const grid = rows.map((row) => [...row].map((c) => (c === "#" ? null : c)));
  const entries: Entry[] = [];
  let number = 0;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      if (!grid[r][c]) continue;
      const across = c === 0 || !grid[r][c - 1],
        down = r === 0 || !grid[r - 1][c];
      if (across || down) number++;
      for (const direction of ["across", "down"] as const) {
        if (!(direction === "across" ? across : down)) continue;
        let answer = "",
          y = r,
          x = c;
        while (grid[y]?.[x]) {
          answer += grid[y][x];
          y += Number(direction === "down");
          x += Number(direction === "across");
        }
        if (answer.length < 3 || !clues[answer])
          throw Error(`Missing original clue: ${answer}`);
        entries.push({
          answer,
          clue: clues[answer],
          row: r,
          col: c,
          direction,
          number,
          storyId: "",
        });
      }
    }
  const puzzle = { grid, entries };
  if (!validateCrossword(puzzle)) throw Error("Invalid mini crossings.");
  return puzzle;
}
export function dailyMini(stories: ApprovedStory[], date: string): Mini {
  const scored = designs.map((design) => ({
    design,
    story: stories.find((s) =>
      design.terms.test(`${s.headline} ${s.category} ${s.summary}`),
    ),
  }));
  const pool = scored.filter((x) => x.story);
  const choices = pool.length ? pool : scored;
  const seed = [...date].reduce((n, c) => n + c.charCodeAt(0), 0);
  const { design, story } = choices[seed % choices.length];
  return {
    ...miniFromRows(design.rows),
    id: `mini-v1-${date}-${design.id}`,
    title: design.title,
    themeStoryId: story?.id,
    notice:
      "An original US mini, selected from our small collection to match the edition’s themes. Clues mix everyday vocabulary with a news-related term. No new reporting is implied.",
  };
}
export const miniDesigns = designs;
export function entryCells(entry: Entry) {
  return [...entry.answer].map(
    (_, i) =>
      `${entry.row + (entry.direction === "down" ? i : 0)},${entry.col + (entry.direction === "across" ? i : 0)}`,
  );
}
