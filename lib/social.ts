import type { ApprovedStory, SocialPost } from "./types";
const STOP = new Set("the and for with that this from what why how into their after says news people have about more could would should over under amid new are was has its not say than will story".split(" "));
export function topicWords(text: string) { return [...new Set((text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []).filter((v) => !STOP.has(v)))]; }
export function socialQueries(stories: ApprovedStory[]) { return stories.slice(0, 5).map((s) => topicWords(s.headline).slice(0, 5).join(" ")); }
export function normalizeSocial(rows: unknown[], now = new Date()): SocialPost[] {
  const seen = new Set<string>(), bodies = new Set<string>(); const posts: SocialPost[] = [];
  for (const raw of rows.slice(0, 50)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (row.error || row.reasonCode || row.isNsfw === true || row.over_18 === true) continue;
    const title = typeof row.title === "string" ? row.title.trim().slice(0, 400) : "";
    const body = [row.body, row.selftext, row.text].find((v) => typeof v === "string") as string | undefined;
    const text = (body ?? "").slice(0, 2500);
    const rawId = String(row.id ?? row.postId ?? "").replace(/^t3_/, "");
    let rawUrl = typeof row.url === "string" ? row.url : typeof row.permalink === "string" ? row.permalink : "";
    if (rawUrl.startsWith("/r/")) rawUrl = `https://www.reddit.com${rawUrl}`;
    // Actor IDs identify the source post even when its url field links to an external article.
    let parsed: URL; try { parsed = new URL(rawUrl); } catch { parsed = new URL("https://www.reddit.com"); }
    if (!/(^|\.)reddit\.com$/.test(parsed.hostname) || !/\/comments\//.test(parsed.pathname)) {
      if (!/^[a-z0-9]{5,12}$/.test(rawId)) continue;
      parsed = new URL(`https://www.reddit.com/comments/${rawId}/`);
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) continue;
    parsed.search = ""; parsed.hash = "";
    const id = /\/comments\/([a-z0-9]+)/i.exec(parsed.pathname)?.[1]; if (!id) continue;
    const dateValue = row.createdAt ?? row.createdUtc ?? row.created_utc;
    const date = typeof dateValue === "number" ? new Date(dateValue < 1e12 ? dateValue * 1000 : dateValue) : new Date(String(dateValue));
    const age = now.getTime() - date.getTime();
    if (!title || !Number.isFinite(age) || age < -300000 || age > 7 * 86400000 || seen.has(id)) continue;
    const fingerprint = (title + text).toLowerCase().replace(/\W/g, ""); if (bodies.has(fingerprint)) continue;
    seen.add(id); bodies.add(fingerprint);
    posts.push({ id, title, text, url: parsed.href, publishedAt: date.toISOString(), platform: "Reddit",
      community: typeof row.communityName === "string" ? row.communityName.slice(0, 100) : null,
      questions: (title + ". " + text).match(/[^.!?\n]{10,220}\?/g)?.slice(0, 3).map((q) => q.trim()) ?? [] });
  }
  return posts;
}
export function relevantPosts(story: ApprovedStory, posts: SocialPost[]) {
  const anchors = topicWords(story.headline), full = new Set(topicWords(`${story.headline} ${story.summary}`));
  return posts.map((post) => { const words = new Set(topicWords(`${post.title} ${post.text}`));
    const titleWords = new Set(topicWords(post.title));
    const anchorCount = anchors.filter((w) => titleWords.has(w)).length;
    return { post, score: anchorCount >= 2 ? [...full].filter((w) => words.has(w)).length : 0 };
  }).filter((value) => value.score >= 3).sort((a, b) => b.score - a.score).slice(0, 2).map(({ post }) => post);
}
