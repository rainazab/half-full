import type { CandidateStory, SourceAssessment } from "./types";
const host = (url: string) => {
  try {
    return new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/^bbc\.co\.uk$/, "bbc.com");
  } catch {
    return "unknown";
  }
};
function wire(text: string) {
  const byline = text.slice(0, 2000) + "\n" + text.slice(-900);
  if (
    /\(Reuters\)|\bBy[^\n]{0,100}\bReuters\b|\bReuters\s*[—–-]|copyright[^\n]{0,80}\bReuters\b/i.test(
      byline,
    )
  )
    return "reuters";
  if (
    /\bBy[^\n]{0,100}\bAssociated Press\b|\bAssociated Press\s*(?:[—–-]|\n)|copyright[^\n]{0,80}\bAssociated Press\b/i.test(
      byline,
    )
  )
    return "associated-press";
  return null;
}
function shingles(text: string) {
  const words =
    text
      .replace(/https?:\/\/\S+/g, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length < 80) return new Set<string>();
  return new Set(
    words
      .slice(0, 2200)
      .slice(4)
      .map((_, i) => words.slice(i, i + 5).join(" ")),
  );
}
export function nearDuplicate(a: string, b: string) {
  const x = shingles(a),
    y = shingles(b);
  if (!x.size || !y.size) return false;
  const shared = [...x].filter((s) => y.has(s)).length;
  return shared / (x.size + y.size - shared) >= 0.82;
}
/** Only merges known relationships. Different domains never establish independence. */
export function reportingOrigins(
  sources: CandidateStory[],
  assessments: SourceAssessment[],
) {
  const ids = sources.map((s) => s.id),
    parent = new Map(ids.map((id) => [id, id]));
  const root = (id: string): string =>
    parent.get(id) === id ? id : root(parent.get(id)!);
  const signals = new Set<string>();
  const join = (a: string, b: string, reason: string) => {
    parent.set(root(b), root(a));
    signals.add(reason);
  };
  for (let i = 0; i < sources.length; i++)
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i],
        b = sources[j],
        aa = assessments.find((s) => s.sourceId === a.id),
        bb = assessments.find((s) => s.sourceId === b.id);
      if (a.url === b.url || host(a.url) === host(b.url))
        join(a.id, b.id, "Same publisher or canonical URL");
      if (
        aa?.independenceGroup.toLowerCase() ===
          bb?.independenceGroup.toLowerCase() &&
        aa &&
        bb
      )
        join(
          a.id,
          b.id,
          "Shared reporting group identified during editorial review",
        );
      if (aa?.kind === "reporting" && bb?.kind === "reporting") {
        const wa = wire(a.text),
          wb = wire(b.text);
        if (wa && wa === wb) join(a.id, b.id, `Shared ${wa} byline`);
        if (nearDuplicate(a.text, b.text))
          join(a.id, b.id, "Near-identical retrieved reporting");
      }
      if (
        (aa?.kind === "primary" && b.text.includes(a.url)) ||
        (bb?.kind === "primary" && a.text.includes(b.url))
      )
        join(
          a.id,
          b.id,
          "Reporting links to the same retained primary document",
        );
    }
  const groups = new Map<string, string>();
  for (const source of sources) {
    const members = sources.filter((s) => root(s.id) === root(source.id));
    const origin = members
      .map((s) =>
        wire(s.text) ? `wire:${wire(s.text)}` : `publisher:${host(s.url)}`,
      )
      .sort()[0];
    groups.set(source.id, origin);
  }
  return { count: new Set(ids.map(root)).size, groups, signals: [...signals] };
}
