import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { parseEdition } from "../lib/edition-schema";
import { experienceSchema, attachExperience, EXPERIENCE_PROMPT } from "../lib/experience";
import { getEditorConfig } from "../lib/config";
async function main() {
  const edition = parseEdition(JSON.parse(await readFile("public/demo-edition.json", "utf8")));
  const config = getEditorConfig();
  if (config.provider !== "anthropic") throw Error("This script requires the configured Claude editor.");
  const client = new Anthropic({ apiKey: config.apiKey, timeout: 105000, maxRetries: 0 });
  const schema = z.object({ stories: z.array(z.object({ id: z.string(), experience: experienceSchema }).strict()).max(5) }).strict();
  const result = await client.messages.create({ model: config.model, max_tokens: 16000, system: `You are a cautious news editor adapting an archived verified edition for listening. Use ONLY the retained evidence passages and reviewed copy. Do not imply the archive is current news. ${EXPERIENCE_PROMPT}`,
    messages: [{ role: "user", content: JSON.stringify(edition.edition.stories.map((story) => ({ id: story.id, headline: story.headline, summary: story.summary, whyItMatters: story.whyItMatters, action: story.action, evidence: story.evidence }))) }], output_config: { effort: "medium", format: zodOutputFormat(schema) } });
  if (result.stop_reason !== "end_turn") throw Error("Claude did not finish; archive unchanged.");
  const text = result.content.filter((part) => part.type === "text").map((part) => part.text).join("");
  const parsed = schema.parse(JSON.parse(text));
  if (new Set(parsed.stories.map((s) => s.id)).size !== edition.edition.stories.length) throw Error("Incomplete archive coverage");
  for (const story of edition.edition.stories) {
    const extra = parsed.stories.find((s) => s.id === story.id);
    if (!extra || !attachExperience(story, extra.experience, [])) throw Error(`Invalid optional explanation: ${story.id}`);
  }
  await writeFile("public/demo-edition.json", JSON.stringify(parseEdition(edition), null, 2) + "\n");
  console.log("Claude produced five grounded archived explanations, glossaries and narration scripts; references validated.");
}
main().catch((error) => { console.error(error instanceof Anthropic.APIError ? `Claude HTTP ${error.status}` : error instanceof Error ? error.message : "Preparation failed"); process.exitCode = 1; });
