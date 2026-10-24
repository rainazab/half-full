import "server-only";
import { PipelineError } from "./errors";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const REQUIRED_ENV = ["ANTHROPIC_API_KEY", "APIFY_API_TOKEN", "APIFY_ACTOR_ID"] as const;

export function environmentStatus() {
  return Object.fromEntries([...REQUIRED_ENV, "ANTHROPIC_MODEL"].map((name) => [name, Boolean(process.env[name]?.trim())]));
}

export function getConfig() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new PipelineError("MISSING_CONFIGURATION", `Missing server environment variables: ${missing.join(", ")}. Set them in .env.local and restart the server.`, 503);
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
    actorInput = {
      query: `(site:reuters.com OR site:apnews.com OR site:bbc.com OR site:npr.org) after:${after} news (climate OR science OR education OR economy OR technology OR health)`,
      maxResults: 10,
      outputFormats: ["markdown"],
      requestTimeoutSecs: 60,
    };
  } else {
    throw new PipelineError("ACTOR_INPUT_REQUIRED", "This Actor requires APIFY_ACTOR_INPUT_JSON. Copy a working JSON input from its Apify Console Input tab; the built-in input only supports apify/rag-web-browser.", 503);
  }
  return {
    anthropicKey: process.env.ANTHROPIC_API_KEY!.trim(),
    apifyToken: process.env.APIFY_API_TOKEN!.trim(),
    actorId, actorInput,
    model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export type AppConfig = ReturnType<typeof getConfig>;
