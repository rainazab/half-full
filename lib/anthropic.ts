import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { EditorConfig } from "./config";
import type { CandidateStory } from "./types";
import {
  editorialGenerationSchema,
  editorialSchemaFor,
  assembleEditorialResult,
} from "./validation";
import { PipelineError } from "./errors";
import { EDITOR_SYSTEM_PROMPT, editionContext } from "./editor-prompt";
import { EXPERIENCE_PROMPT } from "./experience";
import { editorialCandidates } from "./evidence";

export async function reviewWithAnthropic(
  config: EditorConfig,
  candidates: CandidateStory[],
  supportingSources: CandidateStory[] = [],
  log?: (
    step: string,
    status: "started" | "completed" | "failed",
    message: string,
  ) => void,
) {
  const deadline = Date.now() + 105000;
  const client = new Anthropic({
    apiKey: config.apiKey,
    timeout: 85000,
    maxRetries: 0,
  });
  async function request(
    selected: CandidateStory[],
    sources: CandidateStory[],
    instruction: string,
    timeout = 85000,
  ) {
    const message = await client.messages.create(
      {
        model: config.model,
        max_tokens: 20000,
        system: `${EDITOR_SYSTEM_PROMPT}\n${EXPERIENCE_PROMPT}`,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              ...editionContext(config.editionDate),
              candidates: editorialCandidates(selected),
              supportingSources: editorialCandidates(sources),
              instruction,
            }),
          },
        ],
        output_config: {
          effort: "medium",
          format: zodOutputFormat(editorialSchemaFor(selected)),
        },
      },
      { timeout: Math.min(timeout, deadline - Date.now()) },
    );
    if (message.stop_reason !== "end_turn")
      throw new PipelineError(
        "CLAUDE_INCOMPLETE",
        `Claude stopped before completing the editorial response (${message.stop_reason === "max_tokens" ? "output token limit" : "incomplete or refused output"}). No edition was published.`,
      );
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new PipelineError(
        "CLAUDE_INVALID_JSON",
        "Claude returned invalid JSON. No edition was published.",
      );
    }
  }
  try {
    const raw = await request(
      candidates,
      supportingSources,
      "Return one decision for every candidate using the required JSON schema. Every selected source needs an assessment and an actual central-claim or contentEvidence reference. sourceIds must match the sources cited by evidence or contentEvidence, not sources used only in optional experience. Do not list sources merely because they were retrieved.",
    );
    // A single bounded repair can fix missing IDs/field references. It never overturns evidence-based exclusions.
    try {
      const checked = assembleEditorialResult(
        raw,
        candidates,
        config.editionDate
          ? new Date(`${config.editionDate}T23:59:59.999Z`)
          : new Date(),
        supportingSources,
      );
      const invalid = checked.rejectedStories.filter((s) =>
        s.reason.startsWith("Editorial validation failed:"),
      );
      const repairCandidates = candidates.filter((c) =>
        invalid.some((r) => r.url === c.url),
      );
      if (
        repairCandidates.length &&
        repairCandidates.length <= 3 &&
        deadline - Date.now() > 12000
      ) {
        log?.(
          "anthropic.repair",
          "started",
          `Repairing ${repairCandidates.length} malformed source-reference decisions within the original review deadline. Evidence exclusions remain unchanged.`,
        );
        const repair = await request(
          repairCandidates,
          [
            ...supportingSources,
            ...candidates.filter((c) => !repairCandidates.includes(c)),
          ],
          `Repair ONLY these structurally invalid decisions. Return experience:null for this bounded repair; optional presentation can be omitted. Do not select a source unless a central-claim or contentEvidence passage references it. Do not change the evidence standard or manufacture references. Use source IDs actually supported by the relevant passages; remove unused source IDs. Validation feedback: ${invalid.map((r) => `${r.title}: ${r.reason}`).join(" | ")}. Already approved events, which must not be duplicated: ${checked.stories.map((s) => s.headline).join(" | ")}.`,
          Math.min(25000, deadline - Date.now()),
        );
        const parsed = editorialGenerationSchema.safeParse(repair);
        if (
          parsed.success &&
          raw &&
          typeof raw === "object" &&
          "decisions" in raw &&
          Array.isArray(raw.decisions)
        ) {
          const expected = new Set(repairCandidates.map((c) => c.id));
          if (
            parsed.data.decisions.length === expected.size &&
            new Set(parsed.data.decisions.map((d) => d.candidateId)).size ===
              expected.size &&
            parsed.data.decisions.every((d) => expected.has(d.candidateId))
          ) {
            log?.(
              "anthropic.repair",
              "completed",
              "Repaired structured decisions received; all evidence thresholds will be checked again by the server.",
            );
            return {
              ...raw,
              decisions: raw.decisions.map(
                (d) =>
                  parsed.data.decisions.find(
                    (f) => f.candidateId === d.candidateId,
                  ) ?? d,
              ),
            };
          }
        }
      }
    } catch {
      log?.(
        "anthropic.repair",
        "failed",
        "Optional reference repair could not complete. Original decisions remain subject to server validation.",
      );
    }
    return raw;
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    if (error instanceof Anthropic.APIError)
      throw new PipelineError(
        "ANTHROPIC_API_ERROR",
        `Anthropic returned HTTP ${error.status ?? "unknown"}. Check ANTHROPIC_API_KEY, credits/rate limits, and access to ANTHROPIC_MODEL.`,
      );
    throw new PipelineError(
      "ANTHROPIC_REQUEST_FAILED",
      "Anthropic could not complete the request within its 105-second deadline. Check connectivity, model configuration, and API availability.",
      504,
    );
  }
}
