import "server-only";
import { unpackReceipts } from "./receipts";
import { enrichStories } from "./enrichment";
import { attachArticleImages } from "./article-image";
import { getConfig } from "./config";
import { retrieveNews } from "./apify";
import { reviewCandidates } from "./editor";
import { normalizeStories } from "./normalize";
import {
  assembleEditorialResult,
  EditorialValidationError,
} from "./validation";
import { PipelineError, publicError } from "./errors";
import { finishRun } from "./store";
import type {
  CandidateStory,
  EditionResult,
  RunLogEntry,
  RunRecord,
} from "./types";

export const pipelineDependencies = {
  getConfig,
  retrieveNews,
  reviewCandidates,
  finishRun,
  enrichStories,
  attachArticleImages,
};
export async function generateEdition(
  run: RunRecord,
  onLog?: (entry: RunLogEntry) => void,
  dependencies = pipelineDependencies,
): Promise<EditionResult> {
  const deadline = Date.now() + 285000;
  let pendingCandidates: CandidateStory[] = [];
  let stage = "configuration";
  const log = (
    step: string,
    status: RunLogEntry["status"],
    message: string,
  ) => {
    if (status === "started") stage = step;
    const entry = {
      step,
      status,
      message,
      timestamp: new Date().toISOString(),
    };
    run.runLog.push(entry);
    onLog?.(entry);
    // Only controlled messages and public IDs; never raw SDK errors or secrets.
    console.info(JSON.stringify({ runId: run.id, ...entry }));
  };
  try {
    log("configuration", "started", "Checking required server configuration.");
    const config = dependencies.getConfig();
    log(
      "configuration",
      "completed",
      `Apify and ${config.editor.label} configuration is present. Editor model: ${config.editor.model}; secrets stay on the server.`,
    );
    const items = await dependencies.retrieveNews(
      config,
      log,
      (runId, datasetId) => {
        run.apify = { runId, datasetId };
      },
    );
    log(
      "normalize",
      "started",
      "Normalizing Actor results, removing duplicate URLs, and bounding evidence size.",
    );
    const packets = unpackReceipts(items);
    const normalized = normalizeStories(
      packets.articles,
      config.editionDate ? 100 : 20,
    );
    if (config.editionDate) {
      const excluded = normalized.candidates.filter(
        (c) => c.publishedAt?.slice(0, 10) !== config.editionDate,
      );
      const matching = normalized.candidates.filter(
        (c) => c.publishedAt?.slice(0, 10) === config.editionDate,
      );
      normalized.candidates = matching.slice(0, 20);
      normalized.rejectedStories.push(
        ...matching
          .slice(20)
          .map((c) => ({
            title: c.title,
            url: c.url,
            confidence: 0,
            verificationStatus: "rejected" as const,
            reason:
              "Not evaluated: the bounded historical candidate limit is 20.",
          })),
      );
      normalized.rejectedStories.push(
        ...excluded.map((c) => ({
          title: c.title,
          url: c.url,
          confidence: 0,
          verificationStatus: "rejected" as const,
          reason: c.publishedAt
            ? `Published outside the selected day (${config.editionDate}).`
            : "No reliable publication date was retrieved for this historical article.",
        })),
      );
      log(
        "edition.date",
        "completed",
        `Reviewing reporting published on ${config.editionDate}; articles from other dates are excluded.`,
      );
    }
    const supportingSources = normalizeStories(
      packets.sources,
      12,
    ).candidates.filter(
      (source) =>
        !normalized.candidates.some(
          (candidate) => candidate.id === source.id,
        ) &&
        (!config.editionDate ||
          !source.publishedAt ||
          source.publishedAt.slice(0, 10) <= config.editionDate),
    );
    if (packets.sources.length)
      log(
        "investigation",
        "completed",
        `${supportingSources.length} usable supporting documents extracted; ${packets.sources.length - supportingSources.length} duplicate or unavailable leads. Sources remain subject to Claude relevance checks.`,
      );
    for (const limitation of packets.limitations.slice(0, 7))
      log("investigation.limitation", "failed", limitation);
    pendingCandidates = normalized.candidates;
    run.rejectedStories = normalized.rejectedStories;
    run.stats = {
      candidatesFound:
        normalized.candidates.length + normalized.rejectedStories.length,
      approved: 0,
      rejected: normalized.rejectedStories.length,
    };
    if (!normalized.candidates.length) {
      throw new PipelineError(
        "NO_USABLE_CANDIDATES",
        "The Actor returned no usable article candidates. Each item needs a title, an HTTP(S) URL, and a description or text. Inspect the rejection audit and Actor dataset fields.",
      );
    }
    log(
      "normalize",
      "completed",
      `${normalized.candidates.length} candidates ready; ${normalized.rejectedStories.length} normalization rejections.`,
    );
    log(
      `${config.editor.provider}.review`,
      "started",
      `Sending ${normalized.candidates.length} candidates to ${config.editor.label} for cautious evidence review and editorial decisions.`,
    );
    const response = await dependencies.reviewCandidates(
      config.editor,
      normalized.candidates,
      supportingSources,
      log,
    );
    log(
      `${config.editor.provider}.review`,
      "completed",
      `Received ${config.editor.label}'s structured editorial response.`,
    );
    log(
      "validate",
      "started",
      "Checking complete candidate coverage, source IDs, retrieved evidence passages, confidence, and edition size.",
    );
    let reviewed: ReturnType<typeof assembleEditorialResult>;
    try {
      reviewed = assembleEditorialResult(
        response,
        normalized.candidates,
        config.editionDate
          ? new Date(`${config.editionDate}T23:59:59.999Z`)
          : new Date(),
        supportingSources,
      );
    } catch (error) {
      const reason =
        error instanceof EditorialValidationError
          ? error.message
          : "The editorial response could not be validated.";
      run.rejectedStories = [
        ...normalized.rejectedStories,
        ...normalized.candidates.map((candidate) => ({
          title: candidate.title,
          url: candidate.url,
          confidence: 0,
          verificationStatus: "uncertain" as const,
          reason: `Not published because the editorial response was invalid: ${reason}`,
        })),
      ];
      run.stats = {
        candidatesFound: run.rejectedStories.length,
        approved: 0,
        rejected: run.rejectedStories.length,
      };
      throw new PipelineError(
        "EDITOR_VALIDATION_FAILED",
        `${reason} No edition was published; every candidate is included in the audit.`,
      );
    }
    pendingCandidates = [];
    const rejectedStories = [
      ...normalized.rejectedStories,
      ...reviewed.rejectedStories,
    ];
    run.rejectedStories = rejectedStories;
    run.stats = {
      candidatesFound:
        normalized.candidates.length + normalized.rejectedStories.length,
      approved: reviewed.stories.length,
      rejected: rejectedStories.length,
    };
    if (reviewed.stories.length < 3) {
      run.rejectedStories = [
        ...rejectedStories,
        ...reviewed.stories.map((story) => ({
          title: story.headline,
          url: story.sources[0].url,
          reason:
            "Supported but not published: fewer than three stories qualified for an edition.",
          confidence: story.confidence,
          verificationStatus: "rejected" as const,
          reasonCode: "EDITION_TOO_SMALL",
        })),
      ];
      run.stats = {
        candidatesFound: run.stats.candidatesFound,
        approved: 0,
        rejected: run.rejectedStories.length,
      };
      throw new PipelineError(
        "INSUFFICIENT_VERIFIED_STORIES",
        `Only ${reviewed.stories.length} stories passed verification; at least three are required. Inspect rejectedStories. Use an Actor/query that returns substantive, recent article text; standards were not lowered.`,
        422,
      );
    }
    log(
      "validate",
      "completed",
      `${reviewed.stories.length} verified stories selected; ${rejectedStories.length} stories excluded with reasons.`,
    );
    // Both enrichments are optional and independent, so they share the remaining time in parallel.
    await Promise.all([
      dependencies
        .enrichStories(reviewed.stories, config, deadline, log)
        .catch(() =>
          log(
            "enrichment",
            "failed",
            "Optional enrichment was unavailable; publishing the validated text edition.",
          ),
        ),
      dependencies
        .attachArticleImages(
          reviewed.stories,
          config.articleImages,
          deadline,
          log,
        )
        .catch(() =>
          log(
            "images",
            "failed",
            "Optional article images were unavailable; illustrations are shown instead.",
          ),
        ),
    ]);
    log(
      "edition",
      "started",
      "Publishing this finite edition to the latest-edition store.",
    );
    const result: EditionResult = {
      edition: {
        mode: "live",
        id: run.id,
        createdAt: new Date().toISOString(),
        stories: reviewed.stories,
      },
      rejectedStories,
      stats: run.stats,
      runLog: run.runLog,
    };
    dependencies.finishRun(run, result);
    log("edition", "completed", "Edition is ready. You're caught up.");
    return result;
  } catch (error) {
    const safe = publicError(error);
    run.error = { code: safe.code, message: safe.message };
    const audited = new Set(
      (run.rejectedStories ?? []).map((story) => story.url),
    );
    if (pendingCandidates.length) {
      run.rejectedStories = [
        ...(run.rejectedStories ?? []),
        ...pendingCandidates
          .filter((candidate) => !audited.has(candidate.url))
          .map((candidate) => ({
            title: candidate.title,
            url: candidate.url,
            confidence: 0,
            verificationStatus: "uncertain" as const,
            reason:
              "Evidence evaluation could not be completed; no claim of verification is made.",
            reasonCode: safe.code,
          })),
      ];
      run.stats = {
        candidatesFound: run.rejectedStories.length,
        approved: 0,
        rejected: run.rejectedStories.length,
      };
    }
    log(stage, "failed", safe.message);
    dependencies.finishRun(run);
    throw safe;
  }
}
