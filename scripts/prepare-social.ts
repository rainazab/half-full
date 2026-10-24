import { readFile, writeFile } from "node:fs/promises";
import { getConfig } from "../lib/config";
import { enrichStories } from "../lib/enrichment";
import { parseEdition } from "../lib/edition-schema";
async function main() {
  const edition = parseEdition(JSON.parse(await readFile("public/demo-edition.json", "utf8")));
  const log: { step: string; status: "started" | "completed" | "failed"; message: string; timestamp: string }[] = [];
  await enrichStories(edition.edition.stories, getConfig(), Date.now() + 55000, (step, status, message) => { console.log(step, status, message); log.push({ step, status, message, timestamp: new Date().toISOString() }); });
  // Merge only social fields, preserving any concurrently generated narration.
  const current = parseEdition(JSON.parse(await readFile("public/demo-edition.json", "utf8")));
  for (const story of current.edition.stories) story.socialContext = edition.edition.stories.find((s) => s.id === story.id)?.socialContext;
  current.runLog.push(...log.map((entry) => ({ ...entry, step: `archive.enrichment.${entry.step}` })));
  await writeFile("public/demo-edition.json", JSON.stringify(parseEdition(current), null, 2) + "\n");
}
main().catch(() => { console.error("Archived social enrichment failed; no source secrets logged."); process.exitCode = 1; });
