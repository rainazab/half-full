import { PipelineError } from "./errors";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

/** Pure selection logic; no API errors ever trigger a silent provider switch. */
export function getEditorSettings(env: Record<string, string | undefined>) {
  const explicit = env.LLM_PROVIDER?.trim();
  if (explicit && explicit !== "anthropic" && explicit !== "openai") {
    throw new PipelineError("INVALID_LLM_PROVIDER", "LLM_PROVIDER must be anthropic or openai (or unset to use Anthropic).", 503);
  }
  const provider = explicit || "anthropic";
  const keyEnv = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  const modelEnv = provider === "openai" ? "OPENAI_MODEL" : "ANTHROPIC_MODEL";
  const model = env[modelEnv]?.trim() || (provider === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL);
  return { provider, label: provider === "openai" ? "OpenAI" : "Claude", keyEnv, modelEnv, model,
    modelUsesDefault: !env[modelEnv]?.trim() };
}
