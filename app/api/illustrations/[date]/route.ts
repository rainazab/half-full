import { dailyStore } from "@/lib/daily-store";
import { illustrationStore } from "@/lib/illustration-store";
import { illustrateEdition } from "@/lib/illustrate";
import { selectableDay } from "@/lib/daily";
import { json } from "@/lib/http";
import { publicError } from "@/lib/errors";
import { ILLUSTRATION_STYLE } from "@/lib/illustration-style";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ date: string }> };
const invalidDate = () =>
  json(
    {
      error: {
        code: "INVALID_DATE",
        message: "Choose a date within the last ten years, through today.",
      },
    },
    400,
  );
/** Reads existing storyboards for a published date. Never generates. */
export async function GET(_request: Request, context: Context) {
  const { date } = await context.params;
  if (!selectableDay(date)) return invalidDate();
  try {
    const edition = await dailyStore.get(date);
    if (!edition)
      return json(
        { date, styleVersion: ILLUSTRATION_STYLE.version, storyboards: {} },
        200,
        {
          "Cache-Control": "no-store",
        },
      );
    const entries = await Promise.all(
      edition.edition.stories.map(
        async (story) =>
          [
            story.id,
            await illustrationStore.getManifest(date, story.id),
          ] as const,
      ),
    );
    return json(
      {
        date,
        styleVersion: ILLUSTRATION_STYLE.version,
        storyboards: Object.fromEntries(entries.filter(([, m]) => m)),
      },
      200,
      { "Cache-Control": "private, max-age=60" },
    );
  } catch (error) {
    const safe = publicError(error);
    return json(
      { error: { code: safe.code, message: safe.message } },
      safe.status,
    );
  }
}
/** Explicit, same-origin, budget-capped generation for a published date. */
export async function POST(request: Request, context: Context) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get("host"))
        return json(
          {
            error: {
              code: "INVALID_ORIGIN",
              message: "Illustrate from half full itself.",
            },
          },
          403,
        );
    } catch {
      return json(
        { error: { code: "INVALID_ORIGIN", message: "Invalid origin." } },
        403,
      );
    }
  }
  const { date } = await context.params;
  if (!selectableDay(date)) return invalidDate();
  let body: {
    storyIds?: unknown;
    scenesPerStory?: unknown;
    maxImages?: unknown;
  } = {};
  try {
    body = await request.json();
  } catch {
    /* An empty body illustrates every story within the caps. */
  }
  const storyIds = Array.isArray(body.storyIds)
    ? body.storyIds
        .filter(
          (id): id is string =>
            typeof id === "string" && /^[\w-]{1,150}$/.test(id),
        )
        .slice(0, 5)
    : undefined;
  const scenesPerStory =
    body.scenesPerStory === 3 ? 3 : body.scenesPerStory === 2 ? 2 : undefined;
  const maxImages =
    typeof body.maxImages === "number" &&
    Number.isInteger(body.maxImages) &&
    body.maxImages >= 0
      ? Math.min(body.maxImages, 15)
      : undefined;
  try {
    const summary = await illustrateEdition(date, {
      storyIds,
      scenesPerStory,
      maxImages,
    });
    return json(summary);
  } catch (error) {
    const safe = publicError(error);
    return json(
      { error: { code: safe.code, message: safe.message } },
      safe.status,
    );
  }
}
