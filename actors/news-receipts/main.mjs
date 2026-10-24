import { Actor } from "apify";
import { actorRunner, gatherReceipts } from "./core.mjs";
await Actor.init();
try {
  const input = (await Actor.getInput()) ?? {};
  const log = (step, status, message) =>
    console.log(
      JSON.stringify({
        step,
        status,
        message,
        timestamp: new Date().toISOString(),
      }),
    );
  const packets = await gatherReceipts(
    input,
    actorRunner(process.env.APIFY_TOKEN, log),
    log,
  );
  await Actor.pushData(packets);
  await Actor.setValue("OUTPUT", {
    schemaVersion: "us-receipts/1",
    packets: packets.length,
    assessment: "requires-editorial-review",
    datasetId: Actor.getEnv().defaultDatasetId,
  });
  await Actor.exit();
} catch {
  console.error(
    "News Receipts could not produce packets. Check the controlled stage log, Actor input and account access.",
  );
  await Actor.exit({ exitCode: 1 });
}
