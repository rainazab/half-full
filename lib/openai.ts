import "server-only";
import { boundedRetry } from "./retry";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { EditorConfig } from "./config";
import type { CandidateStory } from "./types";
import { editorialResponseSchema } from "./validation";
import { EDITOR_SYSTEM_PROMPT, editionContext } from "./editor-prompt";
import { PipelineError } from "./errors";
import { editorialCandidates } from "./evidence";

export async function reviewWithOpenAI(
  config: EditorConfig,
  candidates: CandidateStory[],
) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    timeout: 105000,
    maxRetries: 0,
  });
  try {
    const response = await boundedRetry(
      (remainingMs) =>
        client.responses.create(
          {
            model: config.model,
            store: false,
            max_output_tokens: 14000,
            instructions: EDITOR_SYSTEM_PROMPT,
            input: JSON.stringify({
              ...editionContext(config.editionDate),
              candidates: editorialCandidates(candidates),
              instruction:
                "Return one decision for every candidate using the required JSON schema.",
            }),
            text: {
              format: zodTextFormat(
                editorialResponseSchema,
                "news_editorial_review",
              ),
            },
          },
          { timeout: remainingMs },
        ),
      {
        budgetMs: 105000,
        retryable: (error) =>
          error instanceof OpenAI.APIError &&
          [429, 502, 503, 504].includes(error.status ?? 0),
      },
    );
    if (response.status !== "completed") {
      throw new PipelineError(
        "OPENAI_INCOMPLETE",
        "OpenAI did not finish a complete editorial response (possibly output limit). No edition was published.",
      );
    }
    if (
      response.output.some(
        (item) =>
          item.type === "message" &&
          item.content.some((part) => part.type === "refusal"),
      )
    ) {
      throw new PipelineError(
        "OPENAI_REFUSAL",
        "OpenAI declined the editorial request. No edition was published.",
      );
    }
    try {
      return JSON.parse(response.output_text) as unknown;
    } catch {
      throw new PipelineError(
        "OPENAI_INVALID_JSON",
        "OpenAI returned invalid JSON. No edition was published.",
      );
    }
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      throw new PipelineError(
        "OPENAI_TIMEOUT",
        "OpenAI exceeded its 105-second request deadline. No edition was published.",
        504,
      );
    }
    if (error instanceof OpenAI.APIConnectionError) {
      throw new PipelineError(
        "OPENAI_UNREACHABLE",
        "OpenAI could not be reached. Check server network access to api.openai.com; no edition was published.",
        502,
      );
    }
    if (error instanceof OpenAI.APIError) {
      throw new PipelineError(
        "OPENAI_API_ERROR",
        `OpenAI returned HTTP ${error.status ?? "unknown"}. Check OPENAI_API_KEY, credits/rate limits, and access to OPENAI_MODEL.`,
      );
    }
    throw new PipelineError(
      "OPENAI_REQUEST_FAILED",
      "OpenAI could not complete the request. Check connectivity and model configuration; no edition was published.",
      502,
    );
  }
}
