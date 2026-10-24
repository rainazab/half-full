import { environmentStatus, getConfig } from "@/lib/config";
import { publicError } from "@/lib/errors";
import { json } from "@/lib/http";
import { getEditorSettings } from "@/lib/editor-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  let configurationError: string | null = null;
  let editor: ReturnType<typeof getEditorSettings> | null = null;
  try { editor = getEditorSettings(process.env); } catch { /* getConfig reports the safe error below. */ }
  try { getConfig(); } catch (error) { configurationError = publicError(error).message; }
  return json({
    ok: true, server: "running", ready: configurationError === null,
    environment: environmentStatus(),
    editor,
    requiredEnvironment: ["APIFY_API_TOKEN", "APIFY_ACTOR_ID", ...(editor ? [editor.keyEnv] : [])],
    modelUsesDefault: editor?.modelUsesDefault ?? true,
    configurationError, timestamp: new Date().toISOString(),
  });
}
