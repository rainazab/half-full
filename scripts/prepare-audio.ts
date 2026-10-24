import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEdition } from "../lib/edition-schema";
import { narrationFor, hasNarrationEvidence } from "../lib/narration";
import { synthesize } from "../lib/cartesia";
async function main() {
  const edition = parseEdition(JSON.parse(await readFile("public/demo-edition.json", "utf8")));
  await mkdir("public/demo-audio", { recursive: true });
  for (const story of edition.edition.stories) {
    if (!hasNarrationEvidence(story)) throw new Error("Missing narration evidence");
    const narration = narrationFor(story);
    const filename = `${createHash("sha256").update(narration.script).digest("hex").slice(0, 20)}.mp3`;
    try { await readFile(`public/demo-audio/${filename}`); console.log("Reusing", story.id); }
    catch { const bytes = await synthesize(narration.script); await writeFile(`public/demo-audio/${filename}`, bytes); console.log("Cartesia MP3 generated", story.id, bytes.length, "bytes"); }
    story.narration = { ...narration, audioUrl: `/demo-audio/${filename}`, provider: "Cartesia" };
    await writeFile("public/demo-edition.json", JSON.stringify(parseEdition(edition), null, 2) + "\n");
    if (process.argv.includes("--one")) break;
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Audio failed"); process.exitCode = 1; });
