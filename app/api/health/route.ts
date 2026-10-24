import { environmentStatus, getConfig } from "@/lib/config";
import { publicError } from "@/lib/errors";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  let configurationError: string | null = null;
  try { getConfig(); } catch (error) { configurationError = publicError(error).message; }
  return json({
    ok: true, server: "running", ready: configurationError === null,
    environment: environmentStatus(),
    modelUsesDefault: !process.env.ANTHROPIC_MODEL?.trim(),
    configurationError, timestamp: new Date().toISOString(),
  });
}
