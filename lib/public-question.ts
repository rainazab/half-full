import { z } from "zod";
import type { ApprovedStory, SocialPost } from "./types";
const ref = z.object({ sourceId: z.string(), passageId: z.string() }).strict();
export const questionAnswersSchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            storyId: z.string(),
            postId: z.string(),
            question: z.string().min(10).max(300),
            answer: z.string().min(1).max(1100),
            evidence: z.array(ref).min(1).max(5),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export const answerReviewSchema = z
  .object({
    reviews: z
      .array(
        z
          .object({
            storyId: z.string(),
            postId: z.string(),
            fullySupported: z.boolean(),
            safeAndRelevant: z.boolean(),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
/** Exact public quotation + exact retained evidence; unsupported responses are omitted. */
export function validateQuestionAnswers(
  raw: unknown,
  review: unknown,
  stories: ApprovedStory[],
  posts: SocialPost[],
  allowed: Set<string>,
) {
  const parsed = questionAnswersSchema.safeParse(raw),
    checked = answerReviewSchema.safeParse(review);
  const results = new Map<
    string,
    NonNullable<ApprovedStory["publicQuestion"]>
  >();
  if (!parsed.success || !checked.success) return results;
  for (const a of parsed.data.answers) {
    const story = stories.find((s) => s.id === a.storyId),
      post = posts.find((p) => p.id === a.postId),
      key = `${a.storyId}/${a.postId}`;
    if (!story || !post || results.has(story.id) || !allowed.has(key)) continue;
    if (
      !post.questions.includes(a.question) ||
      !/\?$/.test(a.question) ||
      !/^https:\/\/(?:www\.)?reddit\.com\//.test(post.url)
    )
      continue;
    if (
      /https?:|www\./i.test(a.answer) ||
      !checked.data.reviews.some(
        (r) =>
          r.storyId === a.storyId &&
          r.postId === a.postId &&
          r.fullySupported &&
          r.safeAndRelevant,
      )
    )
      continue;
    const evidence = a.evidence.map((ref) =>
      story.evidence?.find(
        (e) =>
          e.sourceId === ref.sourceId &&
          e.passageId === ref.passageId &&
          story.sources.some((s) => s.id === e.sourceId && s.url === e.url),
      ),
    );
    if (evidence.some((e) => !e)) continue;
    results.set(story.id, {
      question: a.question,
      answer: a.answer,
      postId: post.id,
      url: post.url,
      community: post.community,
      publishedAt: post.publishedAt,
      evidence: evidence.map((e) => e!),
    });
  }
  return results;
}
