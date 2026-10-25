import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { EditorConfig } from "./config";
import type { ApprovedStory } from "./types";
import { PipelineError } from "./errors";
import { storyboardPlanSchema, type StoryboardPlan } from "./storyboard";
import {
  STORYBOARD_SYSTEM_PROMPT,
  storyboardRequest,
} from "./storyboard-prompt";
import {
  StoryboardValidationError,
  validateStoryboardPlan,
} from "./storyboard-validation";

export type Planner = (
  story: ApprovedStory,
  sceneCount: 2 | 3,
) => Promise<{ plan: StoryboardPlan; calls: number; model: string }>;

/**
 * Plans scenes with the existing Claude editor model. At most two calls per
 * story: one plan and, if deterministic validation fails, one bounded repair.
 */
export function anthropicPlanner(
  config: EditorConfig,
  clientFactory: (apiKey: string) => Pick<Anthropic, "messages"> = (apiKey) =>
    new Anthropic({ apiKey, timeout: 60000, maxRetries: 0 }),
): Planner {
  if (config.provider !== "anthropic")
    throw new PipelineError(
      "STORYBOARD_PLANNER_UNAVAILABLE",
      "Storyboard planning requires the Claude editor (LLM_PROVIDER=anthropic).",
      503,
    );
  const client = clientFactory(config.apiKey);
  return async (story, sceneCount) => {
    let calls = 0;
    async function request(feedback?: string) {
      calls++;
      const message = await client.messages.create({
        model: config.model,
        max_tokens: 4000,
        system: STORYBOARD_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              ...storyboardRequest(story, sceneCount),
              ...(feedback
                ? {
                    repair: `The previous plan failed validation: ${feedback}. Return a corrected plan that satisfies every rule.`,
                  }
                : {}),
            }),
          },
        ],
        output_config: {
          effort: "medium",
          format: zodOutputFormat(storyboardPlanSchema),
        },
      });
      if (message.stop_reason !== "end_turn")
        throw new PipelineError(
          "STORYBOARD_PLAN_INCOMPLETE",
          "Claude stopped before completing the storyboard plan.",
        );
      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new PipelineError(
          "STORYBOARD_PLAN_INVALID_JSON",
          "Claude returned invalid storyboard JSON.",
        );
      }
    }
    try {
      try {
        return {
          plan: validateStoryboardPlan(await request(), story, sceneCount),
          calls,
          model: config.model,
        };
      } catch (error) {
        if (!(error instanceof StoryboardValidationError)) throw error;
        return {
          plan: validateStoryboardPlan(
            await request(error.message),
            story,
            sceneCount,
          ),
          calls,
          model: config.model,
        };
      }
    } catch (error) {
      if (error instanceof StoryboardValidationError)
        throw new PipelineError(
          "STORYBOARD_PLAN_REJECTED",
          `The storyboard plan failed validation twice: ${error.message}`,
          422,
        );
      if (error instanceof PipelineError) throw error;
      if (error instanceof Anthropic.APIError)
        throw new PipelineError(
          "ANTHROPIC_API_ERROR",
          `Anthropic returned HTTP ${error.status ?? "unknown"} while planning scenes.`,
        );
      throw new PipelineError(
        "STORYBOARD_PLAN_FAILED",
        "Scene planning could not complete.",
        504,
      );
    }
  };
}
