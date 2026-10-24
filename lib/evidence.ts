import type { CandidateStory } from "./types";

/** Deterministic excerpts of retrieved text; the model selects IDs, never writes quotations. */
export function evidencePassages(text: string) {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)) {
    if (current && current.length + paragraph.length + 2 > 1400) {
      chunks.push(current);
      current = "";
    }
    if (paragraph.length > 1400) {
      for (let offset = 0; offset < paragraph.length; offset += 1400) {
        chunks.push(paragraph.slice(offset, offset + 1400));
      }
    } else current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks.map((text, index) => ({ id: `p${index + 1}`, text }));
}

export function editorialCandidates(candidates: CandidateStory[]) {
  return candidates.map(({ text, ...metadata }) => ({ ...metadata, passages: evidencePassages(text) }));
}
