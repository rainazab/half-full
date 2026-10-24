import type { ApprovedStory, EvidenceRecord } from "./types";

/** Legacy editions use only the already reviewed copy; no additional factual content. */
export function narrationFor(story: ApprovedStory) {
  if (story.narration) return story.narration;
  const script = `${story.summary} Here's why it matters. ${story.whyItMatters} ${story.action}`;
  const evidence = [...new Map((story.contentSupport ?? []).flatMap((part) => part.evidence)
    .map((item) => [`${item.sourceId}/${item.passageId}`, item])).values()];
  return { script, evidence, estimatedSeconds: Math.round(script.split(/\s+/).length / 2.5), origin: "reviewed-copy" as const };
}
export function hasNarrationEvidence(story: ApprovedStory) {
  const narration = narrationFor(story);
  return narration.evidence.length > 0 && narration.evidence.every((ref: EvidenceRecord) =>
    story.sources.some((source) => source.id === ref.sourceId && source.url === ref.url) &&
    story.evidence?.some((original) => original.sourceId === ref.sourceId && original.passageId === ref.passageId && original.excerpt === ref.excerpt));
}
export function localDemoAudio(url?: string) {
  return url && /^\/demo-audio\/[a-zA-Z0-9_-]+\.mp3$/.test(url) ? url : undefined;
}
