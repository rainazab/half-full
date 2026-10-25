import type { ApprovedStory } from "./types";
import { ILLUSTRATION_STYLE } from "./illustration-style";
import { narrationFor } from "./narration";
import { storyboardPlanSchema, type StoryboardPlan } from "./storyboard";

export class StoryboardValidationError extends Error {}

const SOBER_PATTERN =
  /\b(killed|killing|dead|deaths?|died|dying|fatal(?:ity|ities)?|shooting|shot|bomb(?:ing|s)?|airstrikes?|massacre|genocide|war|missiles?|earthquake|wildfires?|hurricane|flood(?:ing|s)?|famine|suicide|assault|rape|abuse|overdose|crash(?:ed)?|collapsed?)\b/i;
const STOP = new Set(
  "the a an and or but of to in on at for from with by as is are was were be been being this that these those it its their they them he she his her we our you your not no into than then there here over under about after before during while which who whom whose what when where why how all any each more most some such only also very can could may might will would should shall has have had do does did out up down off per via one two three new old".split(
    " ",
  ),
);
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOP.has(word));
const stem = (word: string) =>
  word.replace(/(ies|ing|ed|es|s|ly)$/, "").slice(0, 6);
/** Approved text that captions and prompts may draw from. */
export function storyCorpus(story: ApprovedStory) {
  return [
    story.headline,
    story.summary,
    story.whyItMatters,
    story.action,
    story.centralClaim,
    story.experience?.explanation.text,
    story.experience?.background.text,
    ...(story.experience?.glossary.map((g) => `${g.term} ${g.text}`) ?? []),
    narrationFor(story).script,
    ...(story.evidence ?? []).map((item) => item.excerpt),
  ]
    .filter(Boolean)
    .join(" ");
}
export function storyIsSober(story: ApprovedStory) {
  return SOBER_PATTERN.test(
    `${story.headline} ${story.summary} ${story.whyItMatters} ${story.category}`,
  );
}
/** Share of a caption's content words that already appear in the approved copy. */
export function groundingScore(caption: string, corpus: string) {
  const vocabulary = new Set(words(corpus).map(stem));
  const content = words(caption);
  if (!content.length) return 1;
  const known = content.filter((word) => vocabulary.has(stem(word))).length;
  return known / content.length;
}
export function unsupportedNumbers(text: string, corpus: string) {
  const numbers = text.match(/\d[\d,.]*%?/g) ?? [];
  return numbers.filter((value) => !corpus.includes(value));
}
export function forbiddenPromptTerm(prompt: string) {
  const lower = ` ${prompt.toLowerCase().replace(/[^a-z0-9 ]/g, " ")} `;
  return ILLUSTRATION_STYLE.forbiddenPromptTerms.find((term) =>
    lower.includes(` ${term} `),
  );
}
/**
 * Deterministic checks on the planner's output. Structural errors throw so the
 * planner can be asked once for a repair; the caller never publishes an
 * unvalidated plan.
 */
export function validateStoryboardPlan(
  raw: unknown,
  story: ApprovedStory,
  sceneCount: 2 | 3,
): StoryboardPlan {
  const parsed = storyboardPlanSchema.safeParse(raw);
  if (!parsed.success)
    throw new StoryboardValidationError(
      "The storyboard JSON violated the required fields or length limits.",
    );
  const plan = parsed.data;
  if (plan.scenes.length !== sceneCount)
    throw new StoryboardValidationError(
      `Exactly ${sceneCount} scenes were requested.`,
    );
  const ids = plan.scenes.map((scene) => scene.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id, index) => id !== `scene-${index + 1}`)
  )
    throw new StoryboardValidationError(
      "Scene IDs must be scene-1, scene-2 and scene-3 in order.",
    );
  const retained = new Set(
    (story.evidence ?? []).map((item) => `${item.sourceId}/${item.passageId}`),
  );
  const corpus = storyCorpus(story);
  const script = narrationFor(story).script.replace(/\s+/g, " ").trim();
  const sober = storyIsSober(story);
  if (sober && plan.tone !== "sober")
    throw new StoryboardValidationError("This story requires the sober tone.");
  let lastCue = -1;
  for (const [index, scene] of plan.scenes.entries()) {
    for (const ref of scene.evidence)
      if (!retained.has(`${ref.sourceId}/${ref.passageId}`))
        throw new StoryboardValidationError(
          `${scene.id} cites a passage that is not retained for this story.`,
        );
    const combined = `${scene.prompt} ${scene.subject} ${scene.setting} ${scene.composition} ${scene.objects.join(" ")}`;
    if (/https?:\/\/|www\./i.test(`${combined} ${scene.caption} ${scene.alt}`))
      throw new StoryboardValidationError(`${scene.id} contains a URL.`);
    const forbidden = forbiddenPromptTerm(combined);
    if (forbidden)
      throw new StoryboardValidationError(
        `${scene.id} prompt requests "${forbidden}", which the house style forbids.`,
      );
    if (groundingScore(scene.caption, corpus) < 0.75)
      throw new StoryboardValidationError(
        `${scene.id} caption introduces wording that is not in the approved copy.`,
      );
    const numbers = unsupportedNumbers(scene.caption, corpus);
    if (numbers.length)
      throw new StoryboardValidationError(
        `${scene.id} caption includes an unsupported number (${numbers[0]}).`,
      );
    const cue = scene.cue.replace(/\s+/g, " ").trim();
    const position = script.indexOf(cue, Math.max(0, lastCue));
    if (position < 0)
      throw new StoryboardValidationError(
        `${scene.id} cue is not a verbatim phrase of the narration in script order.`,
      );
    if (index === 0 && position > 0)
      throw new StoryboardValidationError(
        "scene-1 cue must be the opening words of the narration.",
      );
    if (index > 0 && position <= lastCue)
      throw new StoryboardValidationError(
        "Cues must advance through the script.",
      );
    lastCue = position;
    if (plan.tone === "sober") {
      if (scene.character)
        throw new StoryboardValidationError(
          "Sober stories do not include blob characters.",
        );
      if (
        /\b(cute|playful|smiling|cheerful|happy|celebrat\w*)\b/i.test(combined)
      )
        throw new StoryboardValidationError(
          `${scene.id} uses playful language in a sober story.`,
        );
    }
  }
  return plan;
}
