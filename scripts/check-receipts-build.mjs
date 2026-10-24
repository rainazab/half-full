import { readFile } from "node:fs/promises";
import env from "@next/env";
env.loadEnvConfig(process.cwd());
const { buildId } = JSON.parse(
  await readFile("generated/receipts-actor-build.json", "utf8"),
);
const r = await fetch(`https://api.apify.com/v2/actor-builds/${buildId}`, {
  headers: { Authorization: `Bearer ${process.env.APIFY_API_TOKEN}` },
  signal: AbortSignal.timeout(15000),
});
if (!r.ok) throw Error(`HTTP ${r.status}`);
const { data } = await r.json();
console.log(
  JSON.stringify({
    id: data.id,
    status: data.status,
    statusMessage: data.statusMessage,
  }),
);
if (data.status === "FAILED") {
  const l = await fetch(`https://api.apify.com/v2/logs/${buildId}`, {
    headers: { Authorization: `Bearer ${process.env.APIFY_API_TOKEN}` },
    signal: AbortSignal.timeout(10000),
  });
  console.log((await l.text()).slice(-5000));
}
