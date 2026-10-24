import type { ApprovedStory } from "./types";
/** Links actually present in retained evidence; a linked document is not new retrieved evidence. */
export function originalDocuments(story: ApprovedStory) {
  const found = new Map<string, { title: string; url: string; pdf: boolean }>();
  for (const passage of story.evidence ?? []) for (const match of passage.excerpt.matchAll(/\[([^\]]{1,200})\]\((https?:\/\/[^\s)]+)\)/g)) {
    try { const url = new URL(match[2]);
      const pdf = /\.pdf$/i.test(url.pathname);
      if (url.protocol !== "https:" || url.username || url.password || (!pdf && !/(^|\.)(ncsc\.gov\.uk|nsa\.gov|cisa\.gov|gov\.uk)$/.test(url.hostname))) continue;
      found.set(url.href, { title: match[1], url: url.href, pdf });
    } catch { /* Ignore malformed extracted links. */ }
  }
  return [...found.values()].slice(0, 4);
}
