import { readFile, writeFile } from "node:fs/promises";
import { attachArticleImages } from "../lib/article-image";
import { parseEdition } from "../lib/edition-schema";
// Adds publisher share images to the archived demo. No API keys; fetches only the archived article pages.
async function main() {
  const edition = parseEdition(JSON.parse(await readFile("public/demo-edition.json", "utf8")));
  await attachArticleImages(edition.edition.stories, true, Date.now() + 20000, (step, status, message) => {
    console.log(step, status, message);
    edition.runLog.push({ step: `archive.enrichment.${step}`, status, message, timestamp: new Date().toISOString() });
  });
  await writeFile("public/demo-edition.json", JSON.stringify(parseEdition(edition), null, 2) + "\n");
}
main().catch(() => { console.error("Archived image lookup failed."); process.exitCode = 1; });
