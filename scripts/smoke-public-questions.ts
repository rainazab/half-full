// Isolated live enrichment test: it never writes an already-published edition.
import { loadEnvConfig } from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import { getConfig } from "../lib/config";
import { parseEdition } from "../lib/edition-schema";
import { enrichStories } from "../lib/enrichment";
async function main() {
  loadEnvConfig(process.cwd());
  const original = parseEdition(
    JSON.parse(await readFile("/tmp/news-current-edition.json", "utf8")),
  );
  const copy = structuredClone(original.edition.stories);
  for (const s of copy) {
    delete s.publicQuestion;
    delete s.socialContext;
  }
  const log: {
    step: string;
    status: string;
    message: string;
    timestamp: string;
  }[] = [];
  await enrichStories(
    copy,
    getConfig(),
    Date.now() + 45000,
    (step, status, message) => {
      const event = {
        step,
        status,
        message,
        timestamp: new Date().toISOString(),
      };
      log.push(event);
      console.log(JSON.stringify(event));
    },
  );
  const result = {
    log,
    retained: copy.map((s) => ({
      id: s.id,
      headline: s.headline,
      posts: s.socialContext?.posts ?? [],
      publicQuestion: s.publicQuestion ?? null,
    })),
  };
  await writeFile(
    "generated/master-public-questions.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      retainedPosts: result.retained.reduce((n, s) => n + s.posts.length, 0),
      answers: result.retained.filter((s) => s.publicQuestion).length,
      publishedEditionUnchanged: true,
    }),
  );
}
main().catch(() => {
  console.error(
    "Live optional question check failed; no edition was modified.",
  );
  process.exitCode = 1;
});
