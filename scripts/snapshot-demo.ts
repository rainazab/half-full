import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEdition } from "../lib/edition-schema";
async function main() {
const path = process.argv[2];
if (!path) throw Error("Usage: npx tsx scripts/snapshot-demo.ts generated/debug/successful-edition.json");
const result = parseEdition(JSON.parse(await readFile(path, "utf8")));
if (!result.runLog.some((entry) => entry.step === "edition" && entry.status === "completed")) throw Error("Only a completed successful run may become the fixed snapshot.");
if (result.edition.stories.some((story) => !story.evidence?.length || story.contentSupport?.length !== 5)) throw Error("This run did not retain complete evidence records; do not invent them.");
const editor = result.runLog.some((entry) => entry.step === "openai.review") ? "OpenAI" : "Claude";
result.edition.mode = "demo";
result.edition.demoInfo = {
  label: "Fixed demo edition", recordedAt: result.edition.createdAt, originRunId: result.edition.id,
  notice: `Saved successful Apify → ${editor} run. This is an archived edition, not freshly retrieved news. Original source dates, evidence passages, exclusions and audit are preserved.`,
};
parseEdition(result);
const serialized = JSON.stringify(result, null, 2) + "\n";
await writeFile("public/demo-edition.json", serialized);
const version = createHash("sha256").update(serialized).digest("hex").slice(0, 12);
const sw = await readFile("public/sw.js", "utf8");
await writeFile("public/sw.js", sw.replace(/const CACHE = 'us-shell-[^']+';/, `const CACHE = 'us-shell-${version}';`));
console.log(`Saved ${result.stats.approved}-story fixed demo with evidence; updated static cache version. No live store was changed.`);

}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Snapshot failed"); process.exitCode = 1; });
