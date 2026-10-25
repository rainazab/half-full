import { fetchPublicPreview } from "./public-preview";
import { resolvePublicHost, type HostResolver } from "./network-safety";
import type { ApprovedStory, RunLogEntry, StoryMedia } from "./types";
type Log = (
  step: string,
  status: RunLogEntry["status"],
  message: string,
) => void;

const MAX_HEAD_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;

/** Public HTTPS hosts only: no credentials, IP literals, localhost or private-network names. */
export function publicHttpsUrl(
  value: unknown,
  base?: string,
): string | undefined {
  try {
    const u = new URL(String(value).trim(), base);
    if (u.protocol !== "https:" || u.username || u.password) return undefined;
    const host = u.hostname.toLowerCase();
    if (
      !host.includes(".") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":") ||
      host.startsWith("[")
    )
      return undefined;
    if (
      /(^|\.)(localhost|local|internal|lan|home|test|invalid|example)$/.test(
        host,
      )
    )
      return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** Reads Open Graph / Twitter card image tags in any attribute order. */
export function parseShareImage(
  html: string,
  pageUrl: string,
): { url: string; alt?: string } | undefined {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = Object.fromEntries(
      [...tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(
        (m) => [m[1].toLowerCase(), decode(m[2] ?? m[3] ?? "")],
      ),
    );
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key && attrs.content && !meta.has(key)) meta.set(key, attrs.content);
  }
  for (const key of [
    "og:image:secure_url",
    "og:image",
    "og:image:url",
    "twitter:image",
    "twitter:image:src",
  ]) {
    const url = meta.has(key)
      ? publicHttpsUrl(meta.get(key), pageUrl)
      : undefined;
    if (url)
      return {
        url,
        alt: meta.get("og:image:alt") ?? meta.get("twitter:image:alt"),
      };
  }
  return undefined;
}

/** Fetches only the document head of an already-retrieved article, following a few checked redirects. */
async function fetchHead(
  pageUrl: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
  resolver: HostResolver,
): Promise<{ html: string; url: string } | undefined> {
  let url = publicHttpsUrl(pageUrl);
  for (let hop = 0; url && hop <= MAX_REDIRECTS; hop++) {
    if (!(await resolver(new URL(url).hostname))) return undefined;
    const response = await fetcher(url, {
      redirect: "manual",
      signal,
      cache: "no-store",
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (compatible; USNewsPreview/1.0; link preview)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      url = publicHttpsUrl(response.headers.get("location"), url);
      continue;
    }
    if (
      !response.ok ||
      !response.body ||
      !/html/i.test(response.headers.get("content-type") ?? "text/html")
    )
      return undefined;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "",
      bytes = 0;
    try {
      while (bytes < MAX_HEAD_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        const bounded = value.subarray(0, MAX_HEAD_BYTES - bytes);
        bytes += bounded.byteLength;
        html += decoder.decode(bounded, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return { html, url };
  }
  return undefined;
}

export function publisherPreview(
  image: { url: string; alt?: string },
  story: ApprovedStory,
  now = new Date().toISOString(),
): StoryMedia {
  const source = story.sources[0];
  return {
    url: image.url,
    sourceUrl: source.url,
    publisher: source.publisher,
    type: "image",
    alt: (
      image.alt?.trim() || `Image from ${source.publisher}'s article`
    ).slice(0, 300),
    attribution: `Image: ${source.publisher}`,
    rights: "publisher-preview",
    retrievedAt: now,
  };
}

/**
 * Optional, bounded share-image lookup for approved stories only. The image is the publisher's own
 * link-preview image, shown hotlinked with attribution; it is never downloaded, cached or edited.
 * Failures leave the story with its existing illustration.
 */
export async function attachArticleImages(
  stories: ApprovedStory[],
  enabled: boolean | undefined,
  deadline: number,
  log: Log,
  fetcher: typeof fetch = fetchPublicPreview,
  resolver: HostResolver = resolvePublicHost,
) {
  if (!enabled) return;
  const budget = Math.min(12000, deadline - Date.now() - 3000);
  if (budget < 3000) {
    log(
      "images",
      "completed",
      "Optional article images skipped: edition deadline is near.",
    );
    return;
  }
  log(
    "images",
    "started",
    "Looking up each approved article's publisher share image (Open Graph). Illustrations remain the fallback.",
  );
  const signal = AbortSignal.timeout(budget);
  const found = await Promise.all(
    stories.map(async (story) => {
      try {
        const page =
          story.sources[0]?.url &&
          (await fetchHead(story.sources[0].url, signal, fetcher, resolver));
        const image = page ? parseShareImage(page.html, page.url) : undefined;
        if (!image) return false;
        story.media = [
          publisherPreview(image, story),
          ...(story.media ?? []).filter((m) => m.url !== image.url),
        ].slice(0, 3);
        return true;
      } catch {
        return false;
      }
    }),
  );
  const count = found.filter(Boolean).length;
  log(
    "images",
    "completed",
    `${count} of ${stories.length} stories have a publisher share image, attributed and linked to the original article.`,
  );
}
