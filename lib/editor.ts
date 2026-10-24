import "server-only";
import type { EditorConfig } from "./config";
import type { CandidateStory } from "./types";
import { reviewWithAnthropic } from "./anthropic";
import { reviewWithOpenAI } from "./openai";

export function reviewCandidates(config: EditorConfig, candidates: CandidateStory[]) {
  return config.provider === "openai" ? reviewWithOpenAI(config, candidates) : reviewWithAnthropic(config, candidates);
}
