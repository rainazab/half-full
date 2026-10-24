import type { StoryMedia } from "./types";
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
function url(value: unknown) { try { const u = new URL(String(value)); return u.protocol === "https:" && !u.username && !u.password ? u.href : undefined; } catch { return undefined; } }
/** Discovery is not a license. Scraped images stay linked unless separately authorized. */
export function normalizeMedia(row: Record<string, unknown>, sourceUrl: string, publisher: string, now = new Date().toISOString()): StoryMedia[] {
  const metadata = obj(row.metadata), og = Array.isArray(metadata.openGraph) ? metadata.openGraph.map(obj) : [];
  const options = [row.image, row.imageUrl, row.thumbnail, row.thumbnailUrl, metadata.image, obj(metadata.og).image,
    ...og.filter((e) => e.property === "og:image").map((e) => e.content)];
  const seen = new Set<string>();
  return options.flatMap((value) => {
    const item = obj(value), mediaUrl = url(typeof value === "string" ? value : item.url ?? item.contentUrl);
    if (!mediaUrl || seen.has(mediaUrl)) return []; seen.add(mediaUrl);
    return [{ url: mediaUrl, sourceUrl, publisher, type: "image" as const, alt: typeof item.description === "string" ? item.description.slice(0, 300) : "Image linked by the original publisher",
      attribution: publisher, rights: "unknown" as const, retrievedAt: now }];
  }).slice(0, 3);
}
export function displayableMedia(media: StoryMedia) {
  // Only local assets reviewed and bundled by the project are displayed. No arbitrary remote pixel requests.
  return media.rights === "licensed" && /^\/media\/[a-zA-Z0-9_.-]+$/.test(media.url) && !!media.licenseUrl;
}
/** Reviewed contextual asset, explicitly separate from an article/event photograph. */
export function contextualMedia(headline: string): StoryMedia[] {
  return /\bPHP\b/.test(headline) ? [{ url: "/media/php-logo.png", sourceUrl: "https://www.php.net/download-logos.php", publisher: "PHP Group", type: "image", alt: "PHP programming language logo; contextual illustration, not an event photograph", attribution: "PHP logo by Colin Viebrock · unchanged · CC BY-SA 4.0 · contextual illustration", rights: "licensed", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", retrievedAt: "2026-10-24T21:44:00.000Z" }] : [];
}
