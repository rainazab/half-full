import "server-only";
import { PipelineError } from "./errors";
import { getEditorSettings } from "./editor-settings";

const APIFY_ENV = ["APIFY_API_TOKEN", "APIFY_ACTOR_ID"] as const;

export function environmentStatus() {
  return Object.fromEntries([...APIFY_ENV, "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "OPENAI_API_KEY", "OPENAI_MODEL", "LLM_PROVIDER"]
    .map((name) => [name, Boolean(process.env[name]?.trim())]));
}

export function getEditorConfig() {
  const settings = getEditorSettings(process.env);
  const apiKey = process.env[settings.keyEnv]?.trim();
  if (!apiKey) throw new PipelineError("MISSING_CONFIGURATION", `Missing ${settings.keyEnv} for the selected editor. Set it in .env or .env.local and restart the server.`, 503);
  return { ...settings, apiKey };
}

export type AppConfig = { editor: EditorConfig; apifyToken: string; actorId: string; actorInput: Record<string, unknown>; social?: { enabled: boolean; actorId: string; input?: Record<string, unknown> }; articleImages?: boolean };

export function getConfig(): AppConfig {
  const settings = getEditorSettings(process.env);
  const missing = [...APIFY_ENV, settings.keyEnv].filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new PipelineError("MISSING_CONFIGURATION", `Missing server environment variables: ${missing.join(", ")}. Set them in .env or .env.local and restart the server.`, 503);
  }
  const actorId = process.env.APIFY_ACTOR_ID!.trim().replace("/", "~");
  if (!/^[\w-]+(?:~[\w-]+)?$/.test(actorId)) {
    throw new PipelineError("INVALID_ACTOR_ID", "APIFY_ACTOR_ID must be an Actor ID or an owner/name (owner~name also works).", 503);
  }
  let actorInput: Record<string, unknown>;
  if (process.env.APIFY_ACTOR_INPUT_JSON?.trim()) {
    try {
      const parsed: unknown = JSON.parse(process.env.APIFY_ACTOR_INPUT_JSON);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      actorInput = parsed as Record<string, unknown>;
    } catch {
      throw new PipelineError("INVALID_ACTOR_INPUT", "APIFY_ACTOR_INPUT_JSON must be a valid JSON object matching your Actor's input schema.", 503);
    }
  } else if (actorId === "apify~rag-web-browser") {
    const after = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const year = new Date().getUTCFullYear();
    actorInput = {
      query: `(site:bbc.com/news/articles/ OR site:npr.org/${year}/) after:${after} news (education OR technology OR science OR economy OR climate OR health)`,
      maxResults: 20,
      outputFormats: ["markdown"],
      requestTimeoutSecs: 90,
    };
  } else {
    throw new PipelineError("ACTOR_INPUT_REQUIRED", "This Actor requires APIFY_ACTOR_INPUT_JSON. Copy a working JSON input from its Apify Console Input tab; the built-in input only supports apify/rag-web-browser.", 503);
  }
  return {
    editor: getEditorConfig(),
    apifyToken: process.env.APIFY_API_TOKEN!.trim(),
    actorId, actorInput,
    social: socialConfig(),
    articleImages: process.env.ARTICLE_IMAGES_ENABLED !== "false",
  };
}

function socialConfig(): AppConfig["social"] {
  if (process.env.APIFY_SOCIAL_ENABLED === "false") return { enabled: false, actorId: "apify~reddit-scraper" };
  const actorId = (process.env.APIFY_SOCIAL_ACTOR_ID?.trim() || "apify/reddit-scraper").replace("/", "~");
  if (!/^[\w-]+(?:~[\w-]+)?$/.test(actorId)) return undefined;
  let input: Record<string, unknown> | undefined;
  try { if (process.env.APIFY_SOCIAL_ACTOR_INPUT_JSON) { const value = JSON.parse(process.env.APIFY_SOCIAL_ACTOR_INPUT_JSON); if (!value || typeof value !== "object" || Array.isArray(value)) return undefined; input = value; } } catch { return undefined; }
  if (actorId !== "apify~reddit-scraper" && !input) return undefined;
  return { enabled: true, actorId, input };
}
export type EditorConfig = ReturnType<typeof getEditorConfig>;
