import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEdition } from "../lib/edition-schema";
import { contextualMedia } from "../lib/media";
import { relevantPosts } from "../lib/social";
import { dailyMini } from "../lib/mini";
async function main() {
  const edition = parseEdition(
    JSON.parse(await readFile("public/demo-edition.json", "utf8")),
  );
  let removed = 0;
  for (const story of edition.edition.stories) {
    story.media = [
      ...contextualMedia(story.headline),
      ...(story.media ?? []).filter((m) => !m.url.startsWith("/media/")),
    ].slice(0, 3);
    if (story.socialContext) {
      const posts = relevantPosts(story, story.socialContext.posts);
      removed += story.socialContext.posts.length - posts.length;
      story.socialContext = posts.length
        ? { ...story.socialContext, posts }
        : undefined;
    }
  }
  if (removed)
    edition.runLog.push({
      step: "archive.enrichment.relevance",
      status: "completed",
      message: `Additional title-level relevance check removed ${removed} unrelated public posts; these were never used as evidence.`,
      timestamp: new Date().toISOString(),
    });
  await writeFile(
    "public/demo-edition.json",
    JSON.stringify(parseEdition(edition), null, 2) + "\n",
  );
  const audio = edition.edition.stories.flatMap((s) =>
    s.narration?.audioUrl ? [s.narration.audioUrl] : [],
  );
  const media = [
    ...new Set(
      edition.edition.stories.flatMap(
        (s) =>
          s.media
            ?.filter((m) => m.url.startsWith("/media/"))
            .map((m) => m.url) ?? [],
      ),
    ),
  ];
  let sw = await readFile("public/sw.js", "utf8");
  sw = sw.replace(
    /const DEMO_ASSETS = .*;/,
    `const DEMO_ASSETS = ${JSON.stringify([...audio, ...media])};`,
  );
  const hash = createHash("sha256")
    .update(await readFile("public/demo-edition.json"))
    .update(await readFile("public/offline.js"))
    .update(await readFile("public/offline.css"))
    .update(await readFile("public/offline-puzzle.js"))
    .digest("hex")
    .slice(0, 12);
  sw = sw.replace(/us-shell-[a-f0-9]+/, `us-shell-${hash}`);
  await writeFile("public/sw.js", sw);
  const puzzle = dailyMini(
    edition.edition.stories,
    edition.edition.date ?? edition.edition.createdAt.slice(0, 10),
  );
  if (!puzzle)
    throw Error("Archived demo must contain a validated playable puzzle");
  await writeFile(
    "public/demo-puzzle.json",
    JSON.stringify(puzzle, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      narrationClips: audio.length,
      licensedVisuals: media.length,
      socialLinks: edition.edition.stories.reduce(
        (n, s) => n + (s.socialContext?.posts.length ?? 0),
        0,
      ),
      crosswordEntries: puzzle?.entries.map((e) => e.answer),
    }),
  );
}
void main();
