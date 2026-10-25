/**
 * Explicit operator tool: illustrate a published edition with Recraft.
 *   node --conditions=react-server --import tsx scripts/illustrate-edition.ts 2026-10-24 --stories 1 --scenes 2 --max-images 2
 * Spends Recraft credits only for scenes that do not already exist. Never edits the edition record.
 */
import { existsSync } from "node:fs";
for (const file of [".env", ".env.local"])
  if (existsSync(file)) process.loadEnvFile(file);
const [date, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : undefined;
};
if (!date) {
  console.error(
    "Usage: illustrate-edition.ts YYYY-MM-DD [--stories N] [--scenes 2|3] [--max-images N] [--story-id ID]",
  );
  process.exit(1);
}
async function main() {
  const { illustrateEdition, planMotion } = await import("../lib/illustrate");
  const { dailyStore } = await import("../lib/daily-store");
  const { illustrationStore } = await import("../lib/illustration-store");
  const edition = await dailyStore.get(date);
  if (!edition) {
    console.error(`No published edition for ${date}.`);
    process.exit(1);
  }
  const count = Number(flag("--stories"));
  const storyIds = flag("--story-id")
    ? [flag("--story-id")!]
    : Number.isInteger(count) && count > 0
      ? edition.edition.stories.slice(0, count).map((s) => s.id)
      : undefined;
  const scenes =
    flag("--scenes") === "3" ? 3 : flag("--scenes") === "2" ? 2 : undefined;
  const maxImages = flag("--max-images")
    ? Number(flag("--max-images"))
    : undefined;
  // Explicit single-scene regeneration after visual inspection: marks one scene
  // pending so the normal bounded pipeline redraws only that image.
  const regenerate = flag("--regenerate-scene");
  if (regenerate && storyIds?.length === 1) {
    const manifest = await illustrationStore.getManifest(date, storyIds[0]);
    const scene = manifest?.scenes.find((item) => item.id === regenerate);
    if (!manifest || !scene) {
      console.error(`No stored scene ${regenerate} for ${storyIds[0]}.`);
      process.exit(1);
    }
    scene.status = "pending";
    delete scene.asset;
    manifest.status = "partial";
    await illustrationStore.saveManifest(manifest);
    console.error(`Marked ${regenerate} for regeneration.`);
  }
  if (rest.includes("--motion")) {
    // Planner-only: layered animation for existing scenes. No Recraft credits are spent.
    const motion = await planMotion(date, {
      storyIds,
      replace: rest.includes("--replace-motion"),
      log: (message) => console.error(message),
    });
    console.log(JSON.stringify(motion, null, 2));
    return;
  }
  const summary = await illustrateEdition(date, {
    storyIds,
    scenesPerStory: scenes,
    maxImages,
    log: (message) => console.error(message),
  });
  console.log(JSON.stringify(summary, null, 2));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
