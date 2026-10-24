import "server-only";
import { getConfig } from "./config";
import { retrieveNews } from "./apify";
import { reviewCandidates } from "./anthropic";
import { normalizeStories } from "./normalize";
import { assembleEditorialResult } from "./validation";
import { PipelineError, publicError } from "./errors";
import { finishRun } from "./store";
import type { EditionResult, RunLogEntry, RunRecord } from "./types";

export async function generateEdition(run: RunRecord): Promise<EditionResult> {
  let stage = "configuration";
  const log = (step: string, status: RunLogEntry["status"], message: string) => {
    if (status === "started") stage = step;
    const entry = { step, status, message, timestamp: new Date().toISOString() };
    run.runLog.push(entry);
    // Only controlled messages and public IDs; never raw SDK errors or secrets.
    console.info(JSON.stringify({ runId: run.id, ...entry }));
  };
  try {
    log("configuration", "started", "Checking required server configuration.");
    const config = getConfig();
    log("configuration", "completed", "Apify and Anthropic configuration is present; secrets stay on the server.");
    const items = await retrieveNews(config, log, (runId, datasetId) => {
      run.apify = { runId, datasetId };
    });
    log("normalize", "started", "Normalizing Actor results, removing duplicate URLs, and bounding evidence size.");
    const normalized = normalizeStories(items);
    run.rejectedStories = normalized.rejectedStories;
    run.stats = {
      candidatesFound: normalized.candidates.length + normalized.rejectedStories.length,
      approved: 0, rejected: normalized.rejectedStories.length,
    };
    if (!normalized.candidates.length) {
      throw new PipelineError("NO_USABLE_CANDIDATES", "The Actor returned no usable article candidates. Each item needs a title, an HTTP(S) URL, and a description or text. Inspect the rejection audit and Actor dataset fields.");
    }
    log("normalize", "completed", `${normalized.candidates.length} candidates ready; ${normalized.rejectedStories.length} normalization rejections.`);
    log("anthropic.review", "started", `Sending ${normalized.candidates.length} candidates to Claude for cautious evidence review and editorial decisions.`);
    const response = await reviewCandidates(config, normalized.candidates);
    log("anthropic.review", "completed", "Received Claude's structured editorial response.");
    log("validate", "started", "Checking complete candidate coverage, source IDs, verbatim evidence, confidence, and edition size.");
    let reviewed: ReturnType<typeof assembleEditorialResult>;
    try { reviewed = assembleEditorialResult(response, normalized.candidates); }
    catch {
      throw new PipelineError("CLAUDE_VALIDATION_FAILED", "Claude's response failed strict validation of decision coverage, fields, source IDs, or evidence quotes. No edition was published; retry with substantive article text.");
    }
    const rejectedStories = [...normalized.rejectedStories, ...reviewed.rejectedStories];
    run.rejectedStories = rejectedStories;
    run.stats = {
      candidatesFound: normalized.candidates.length + normalized.rejectedStories.length,
      approved: reviewed.stories.length,
      rejected: rejectedStories.length,
    };
    if (reviewed.stories.length < 3) {
      throw new PipelineError("INSUFFICIENT_VERIFIED_STORIES", `Only ${reviewed.stories.length} stories passed verification; at least three are required. Inspect rejectedStories. Use an Actor/query that returns substantive, recent article text; standards were not lowered.`, 422);
    }
    log("validate", "completed", `${reviewed.stories.length} verified stories selected; ${rejectedStories.length} stories excluded with reasons.`);
    log("edition", "started", "Publishing this finite edition to the latest-edition store.");
    const result: EditionResult = {
      edition: { id: run.id, createdAt: new Date().toISOString(), stories: reviewed.stories },
      rejectedStories, stats: run.stats, runLog: run.runLog,
    };
    finishRun(run, result);
    log("edition", "completed", "Edition is ready. You're caught up.");
    return result;
  } catch (error) {
    const safe = publicError(error);
    run.error = { code: safe.code, message: safe.message };
    log(stage, "failed", safe.message);
    finishRun(run);
    throw safe;
  }
}
