import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { EditorConfig } from "./config";
import type { CandidateStory } from "./types";
import { editorialGenerationSchema } from "./validation";
import { PipelineError } from "./errors";
import { EDITOR_SYSTEM_PROMPT } from "./editor-prompt";
import { EXPERIENCE_PROMPT } from "./experience";
import { editorialCandidates } from "./evidence";

export async function reviewWithAnthropic(config: EditorConfig, candidates: CandidateStory[]) {
  const client = new Anthropic({ apiKey: config.apiKey, timeout: 105000, maxRetries: 0 });
  try {
    const message = await client.messages.create({
      model: config.model,
      max_tokens: 20000,
      system: `${EDITOR_SYSTEM_PROMPT}\n${EXPERIENCE_PROMPT}`,
      messages: [{ role: "user", content: JSON.stringify({
        currentUtcTime: new Date().toISOString(), candidates: editorialCandidates(candidates),
        instruction: "Return one decision for every candidate using the required JSON schema.",
      }) }],
      output_config: { effort: "medium", format: zodOutputFormat(editorialGenerationSchema) },
    });
    if (message.stop_reason !== "end_turn") {
      throw new PipelineError("CLAUDE_INCOMPLETE", `Claude stopped before completing the editorial response (${message.stop_reason === "max_tokens" ? "output token limit" : "incomplete or refused output"}). No edition was published.`);
    }
    const text = message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
    try { return JSON.parse(text) as unknown; }
    catch { throw new PipelineError("CLAUDE_INVALID_JSON", "Claude returned invalid JSON. No edition was published."); }
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    if (error instanceof Anthropic.APIError) {
      throw new PipelineError("ANTHROPIC_API_ERROR", `Anthropic returned HTTP ${error.status ?? "unknown"}. Check ANTHROPIC_API_KEY, credits/rate limits, and access to ANTHROPIC_MODEL.`);
    }
    throw new PipelineError("ANTHROPIC_REQUEST_FAILED", "Anthropic could not complete the request within its 105-second deadline. Check connectivity, model configuration, and API availability.", 504);
  }
}
