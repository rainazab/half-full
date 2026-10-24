import { createHash } from "node:crypto";
import type { CandidateStory, RejectedStory } from "./types";

type Row = Record<string, unknown>;
const object = (value: unknown): Row =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : {};

function first(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function isServicePage(url: string) {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "");
  return ["bbc.com", "bbc.co.uk"].includes(host) && /^\/(weather|iplayer|sounds|schedules)(?:\/|$)/.test(parsed.pathname);
}

export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["fbclid", "gclid"].includes(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}

function articleMetadata(metadata: Row, url: string | null): Row {
  function nodes(value: unknown, depth = 0): Row[] {
    if (depth > 4) return [];
    if (Array.isArray(value)) return value.flatMap((item) => nodes(item, depth + 1));
    const row = object(value);
    return [row, ...nodesArray(row["@graph"], depth + 1)];
  }
  function nodesArray(value: unknown, depth: number): Row[] {
    return value ? nodes(value, depth) : [];
  }
  return nodes(metadata.jsonLd ?? metadata["json-ld"]).find((entry) => {
    const types = Array.isArray(entry["@type"]) ? entry["@type"] : [entry["@type"]];
    if (!types.some((type) => typeof type === "string" && /(?:^|\/)\w*Article$/.test(type))) return false;
    const page = object(entry.mainEntityOfPage);
    const articleUrl = first(entry.url, typeof entry.mainEntityOfPage === "string" ? entry.mainEntityOfPage : "", page["@id"]);
    return !articleUrl || safeUrl(articleUrl) === url;
  }) ?? {};
}

function publishedDate(row: Row, metadata: Row, article: Row): string | null {
  const openGraph = Array.isArray(metadata.openGraph) ? metadata.openGraph.map(object) : [];
  const values = [row.publishedAt, row.publishedDate, row.publishedTime, row.publicationDate,
    row.datePublished, row.pubDate, row.date, metadata.publishedAt, metadata.datePublished,
    metadata.publishedTime, row["metadata.publishedAt"], row["metadata.datePublished"],
    openGraph.find((entry) => entry.property === "article:published_time")?.content,
    article.datePublished];
  // Relative strings like "2 hours ago" are left unknown; crawl times are never publication dates.
  for (const value of values) {
    if (typeof value !== "string" || !/\d{4}/.test(value)) continue;
    const raw = value.trim();
    const calendar = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(raw);
    if (calendar) {
      const [year, month, day] = calendar.slice(1).map(Number);
      const check = new Date(Date.UTC(year, month - 1, day));
      if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) continue;
    }
    // Offset-less timestamps otherwise depend on the server's time zone.
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) continue;
    const timestamp = Date.parse(raw);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return null;
}

function flatten(items: unknown[], depth = 0): Row[] {
  if (depth > 4) return [];
  return items.flatMap((item) => {
    const row = object(item);
    const nested = ["organicResults", "newsResults", "nonPromotedSearchResults", "articles", "results", "items"]
      .flatMap((key) => Array.isArray(row[key]) ? row[key] as unknown[] : []);
    // A search envelope's URL is the search page, not an article source.
    return nested.length ? flatten(nested, depth + 1) : [row];
  });
}

export function normalizeStories(items: unknown[], limit = 20) {
  const candidates: CandidateStory[] = [];
  const rejectedStories: RejectedStory[] = [];
  const seen = new Set<string>();
  const seenContent = new Set<string>();

  for (const row of flatten(items)) {
    const metadata = object(row.metadata);
    const search = object(row.searchResult);
    const source = object(row.source);
    const crawl = object(row.crawl);
    const title = first(row.title, row.headline, metadata.title, row["metadata.title"], search.title).slice(0, 500);
    const rawUrl = first(row.url, row.URL, row.link, metadata.url, row["metadata.url"], search.url);
    const url = safeUrl(rawUrl);
    const article = articleMetadata(metadata, url);
    const description = first(row.description, row.snippet, row.summary, metadata.description,
      row["metadata.description"], search.description).slice(0, 3000);
    const text = first(row.text, row.markdown, row.content, row.articleText, row.body, row.extractedText).slice(0, 18000);
    const urlKey = url ? url.replace(/\/(?=\?|$)/, "") : "";
    const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim();
    const contentKey = normalizedText.length >= 300 && new Set(normalizedText.split(" ")).size >= 15
      ? createHash("sha256").update(normalizedText).digest("hex") : null;
    let reason: string | undefined;
    if (!title || !url) reason = "Missing a title or a valid HTTP(S) article URL.";
    else if (isServicePage(url)) reason = "This is a weather, schedule, or media service page rather than a reported news article.";
    else if (row.error || row.fetchError || (typeof crawl.httpStatusCode === "number" && crawl.httpStatusCode >= 400)) {
      reason = typeof crawl.httpStatusCode === "number"
        ? `The Actor could not retrieve the article (HTTP ${crawl.httpStatusCode}); no article evidence was available.`
        : "The Actor reported an article retrieval error.";
    } else if (!description && !text) reason = "No description or article text was retrieved.";
    else if (seen.has(urlKey)) reason = "Duplicate source URL in the Actor dataset.";
    else if (contentKey && seenContent.has(contentKey)) reason = "Duplicate retrieved article text; copied or syndicated material is not independent evidence.";
    else if (candidates.length >= limit) reason = `Not evaluated: the bounded candidate limit is ${limit}.`;

    if (reason) {
      rejectedStories.push({ title: title || "Untitled Actor result", url: url ?? "", reason,
        confidence: 0, verificationStatus: "rejected" });
      continue;
    }
    seen.add(urlKey);
    if (contentKey) seenContent.add(contentKey);
    const publisher = first(typeof row.source === "string" ? row.source : "", source.name,
      source.title, row.publisher, object(row.publisher).name, metadata.siteName,
      row["metadata.siteName"], object(article.publisher).name) || new URL(url!).hostname;
    candidates.push({
      id: `candidate-${createHash("sha256").update(url!).digest("hex").slice(0, 16)}`,
      title, url: url!, source: publisher.slice(0, 200), description, text,
      publishedAt: publishedDate(row, metadata, article),
    });
  }
  return { candidates, rejectedStories };
}
