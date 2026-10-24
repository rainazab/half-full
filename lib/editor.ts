import "server-only";
import type { EditorConfig } from "./config";
import type { CandidateStory } from "./types";
import { reviewWithAnthropic } from "./anthropic";
import { reviewWithOpenAI } from "./openai";

export function reviewCandidates(
  config: EditorConfig,
  candidates: CandidateStory[],
  supportingSources: CandidateStory[] = [],
  log?: (
    step: string,
    status: "started" | "completed" | "failed",
    message: string,
  ) => void,
) {
  return config.provider === "openai"
    ? reviewWithOpenAI(config, candidates)
    : reviewWithAnthropic(config, candidates, supportingSources, log);
}
