/**
 * Operator-only Runway tool. Inspect/poll are non-generative; submit requires an
 * explicit bounded credit allowance. No browser HTTP route can submit a task.
 * node --conditions=react-server --import tsx scripts/video-story.ts inspect YYYY-MM-DD STORY_ID
 * ... submit YYYY-MM-DD STORY_ID --scene scene-2 --ratio 1104:832 --prompt-file /absolute/prompt.txt --max-credits 25
 * ... poll YYYY-MM-DD STORY_ID
 * ... export YYYY-MM-DD STORY_ID --out generated/video-proof
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
for (const file of [".env", ".env.local"])
  if (existsSync(file)) process.loadEnvFile(file);
const [action, date, storyId, ...flags] = process.argv.slice(2);
const flag = (name: string) => {
  const i = flags.indexOf(name);
  return i >= 0 ? flags[i + 1] : undefined;
};
async function main() {
  const { videoStore } = await import("../lib/video-store");
  const { submitVideo, pollVideo, prepareVideo, reviewVideo } =
    await import("../lib/video-generation");
  if (
    !date ||
    !storyId ||
    ![
      "inspect",
      "prepare",
      "submit",
      "poll",
      "export",
      "approve",
      "reject",
      "plan",
    ].includes(action)
  )
    throw Error(
      "Usage: video-story.ts inspect|prepare|submit|poll|export YYYY-MM-DD STORY_ID [--scene scene-1 --ratio 1104:832 --prompt-file FILE --max-credits 25]",
    );
  if (action === "inspect") {
    console.log(
      JSON.stringify(await videoStore.getManifest(date, storyId), null, 2),
    );
    return;
  }
  if (action === "poll") {
    console.log(JSON.stringify(await pollVideo(date, storyId), null, 2));
    return;
  }
  if (action === "plan") {
    const { planVideoMotion } = await import("../lib/video-plan");
    const result = await planVideoMotion(
      date,
      storyId,
      flag("--scene") ?? "scene-1",
      flags.includes("--replace-plan"),
    );
    const out = flag("--prompt-output");
    if (out) await writeFile(out, result.prompt);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action === "approve" || action === "reject") {
    const notes = flag("--notes") ?? "";
    const file = flag("--file"),
      processingFile = flag("--processing-file");
    let derivative;
    if (file) {
      if (!processingFile)
        throw Error(
          "A derivative requires --processing-file with its exact crop, source hash, dimensions and measured duration.",
        );
      const metadata = JSON.parse(await readFile(processingFile, "utf8"));
      derivative = {
        bytes: new Uint8Array(await readFile(file)),
        width: metadata.width,
        height: metadata.height,
        durationSeconds: metadata.durationSeconds,
        processing: metadata.processing,
      };
    }
    console.log(
      JSON.stringify(
        await reviewVideo(date, storyId, {
          approved: action === "approve",
          notes,
          derivative,
        }),
        null,
        2,
      ),
    );
    return;
  }
  if (action === "export") {
    const manifest = await videoStore.getManifest(date, storyId);
    if (!manifest) throw Error("No stored video manifest.");
    const out = path.resolve(flag("--out") ?? "generated/video-proof");
    await mkdir(out, { recursive: true });
    await writeFile(
      path.join(out, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    for (const clip of manifest.clips)
      if (clip.asset) {
        const asset = await videoStore.getAsset(clip.asset.key);
        if (asset)
          await writeFile(path.join(out, `${clip.id}.mp4`), asset.bytes);
      }
    console.log(
      JSON.stringify({
        out,
        status: manifest.status,
        taskIds: manifest.clips.map((c) => c.taskId),
      }),
    );
    return;
  }
  const promptFile = flag("--prompt-file");
  if (!promptFile) throw Error("A reviewed --prompt-file is required.");
  const ratio = flag("--ratio") ?? "1104:832";
  if (
    ![
      "1280:720",
      "720:1280",
      "1104:832",
      "960:960",
      "832:1104",
      "1584:672",
    ].includes(ratio)
  )
    throw Error("Unsupported ratio.");
  const request = {
    date,
    storyId,
    sceneId: flag("--scene") ?? "scene-1",
    prompt: (await readFile(promptFile, "utf8")).trim(),
    ratio: ratio as "1104:832",
  };
  if (action === "prepare") {
    const result = await prepareVideo(request);
    console.log(
      JSON.stringify(
        {
          headline: result.headline,
          keyframeBytes: result.image.bytes.length,
          manifest: result.manifest,
        },
        null,
        2,
      ),
    );
  } else
    console.log(
      JSON.stringify(
        await submitVideo(request, {
          maxCredits: Number(flag("--max-credits")),
          retry: flags.includes("--retry"),
        }),
        null,
        2,
      ),
    );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Video operation failed.",
  );
  process.exitCode = 1;
});
