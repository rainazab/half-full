import { explainPublicQuestions } from "./question-review";
import "server-only";
import { judgeSocial } from "./social-review";
import type { AppConfig } from "./config";
import type { ApprovedStory, RunLogEntry } from "./types";
import { socialQueries, normalizeSocial, relevantPosts } from "./social";
type Log = (
  step: string,
  status: RunLogEntry["status"],
  message: string,
) => void;
/** A single bounded Actor run for the whole edition; errors are deliberately non-fatal. */
export async function enrichStories(
  stories: ApprovedStory[],
  config: AppConfig,
  deadline: number,
  log: Log,
  fetcher = fetch,
  judge = judgeSocial,
  answerQuestions = explainPublicQuestions,
) {
  if (config.editionDate || !config.social || !config.social.enabled) return;
  const remaining = Math.min(45000, deadline - Date.now());
  if (remaining < 12000) {
    log(
      "social",
      "completed",
      "Optional public conversation search skipped: edition deadline is near.",
    );
    return;
  }
  const end = Date.now() + remaining - 1000;
  const retrievalEnd = Math.min(end, Date.now() + 21000);
  const actorId = config.social.actorId;
  let runId: string | undefined,
    complete = false;
  const auth = {
    Authorization: `Bearer ${config.apifyToken}`,
    "Content-Type": "application/json",
  };
  async function request(path: string, init: RequestInit = {}) {
    const timeout = Math.min(8000, retrievalEnd - Date.now());
    if (timeout < 1) throw Error("deadline");
    const response = await fetcher(`https://api.apify.com/v2${path}`, {
      ...init,
      headers: auth,
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    return response.json();
  }
  try {
    log(
      "social",
      "started",
      "Searching public Reddit discussions in one bounded Apify batch. These are context, never verification.",
    );
    const queries = socialQueries(stories);
    const input = config.social.input
      ? { ...config.social.input, searchQueries: queries }
      : {
          scrapeMode: "posts",
          searchQueries: queries,
          searchSort: "relevance",
          searchTimeFilter: "week",
          maxSearchResultsPerQuery: 3,
          includeNsfw: false,
        };
    let run = (
      await request(
        `/actors/${encodeURIComponent(actorId)}/runs?timeout=${Math.max(5, Math.floor((retrievalEnd - Date.now()) / 1000) - 1)}`,
        { method: "POST", body: JSON.stringify(input) },
      )
    )?.data;
    if (!run?.id || !run.defaultDatasetId) throw Error("invalid run");
    runId = run.id;
    log(
      "social.actor",
      "completed",
      `Social Apify run ID: ${run.id}; dataset ID: ${run.defaultDatasetId}.`,
    );
    while (
      !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)
    ) {
      run = (
        await request(
          `/actor-runs/${encodeURIComponent(runId!)}?waitForFinish=5`,
        )
      )?.data;
      if (!run?.id || !run.defaultDatasetId) throw Error("invalid run");
    }
    complete = true;
    if (run.status !== "SUCCEEDED") throw Error("actor failed");
    const rows: unknown = await request(
      `/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&format=json&limit=30`,
    );
    if (!Array.isArray(rows)) throw Error("invalid data");
    const posts = normalizeSocial(rows);
    log(
      "social.relevance",
      "started",
      "Checking the specific topic connection with Claude; public posts remain unverified context.",
    );
    const allowed = await judge(
      stories,
      posts,
      config.editor,
      Math.max(0, Math.min(6500, end - Date.now())),
    );
    log(
      "social.relevance",
      "completed",
      "Only source-bound, quoted topic matches are eligible for display.",
    );
    let matched = 0;
    const retainedMatches = new Set<string>();
    for (const story of stories) {
      const relevant = relevantPosts(story, posts).filter((post) =>
        allowed.has(`${story.id}/${post.id}`),
      );
      relevant.forEach((post) => retainedMatches.add(`${story.id}/${post.id}`));
      if (relevant.length) {
        story.socialContext = {
          posts: relevant,
          notice:
            "A small set of public posts, not a representative survey. Questions and framing are quoted from users, not verified claims or independent corroboration.",
        };
        matched += relevant.length;
      }
    }
    if (end - Date.now() > 9000) {
      log(
        "social.answers",
        "started",
        "Answering at most one actual public question per story from retained news evidence.",
      );
      try {
        const questions = await answerQuestions(
          stories,
          posts,
          retainedMatches,
          config.editor,
          end - Date.now(),
        );
        for (const story of stories)
          if (questions.has(story.id))
            story.publicQuestion = questions.get(story.id);
        log(
          "social.answers",
          "completed",
          `${questions.size} public-question answers passed exact-reference checks and a separate evidence-support review.`,
        );
      } catch {
        log(
          "social.answers",
          "failed",
          "Optional question answers were unavailable; no answer was added.",
        );
      }
    } else
      log(
        "social.answers",
        "completed",
        "Skipped optional answers: insufficient time remains.",
      );
    log(
      "social",
      "completed",
      `${posts.length} recent public posts retrieved; ${matched} relevant story links retained. Unrelated, duplicate, stale and undated posts were omitted.`,
    );
  } catch {
    log(
      "social",
      "failed",
      "Optional Reddit context is unavailable or exceeded its budget. The verified written edition is unchanged; check the social Actor's access and input schema.",
    );
  } finally {
    if (runId && !complete) {
      try {
        await fetcher(
          `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}/abort`,
          { method: "POST", headers: auth, signal: AbortSignal.timeout(2000) },
        );
      } catch {
        /* Actor also has its own hard timeout. */
      }
    }
  }
}
