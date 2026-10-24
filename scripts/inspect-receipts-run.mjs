import env from "@next/env";
import { writeFile, mkdir } from "node:fs/promises";
env.loadEnvConfig(process.cwd());
const get = async (p) => {
  const r = await fetch(`https://api.apify.com/v2${p}`, {
    headers: { Authorization: `Bearer ${process.env.APIFY_API_TOKEN}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  return r.json();
};
const runs = (await get("/actor-runs?limit=12&desc=true")).data.items;
console.log(
  runs.map((r) => ({
    id: r.id,
    actor: r.actId,
    status: r.status,
    memory: r.options?.memoryMbytes,
    statusMessage: r.statusMessage,
  })),
);
const me = (await get("/users/me")).data;
console.log({
  maxActorMemoryGbytes: me.limits?.maxActorMemoryGbytes,
  maxConcurrentActorJobs: me.limits?.maxConcurrentActorJobs,
});
const data = await get("/datasets/wfb8GNrrxP5vWwuCj/items?clean=true&limit=40");
await mkdir("generated", { recursive: true });
await writeFile("generated/receipts-packets.json", JSON.stringify(data));
console.log(
  data.map((p) => ({
    title: p.article.title,
    evidence: p.evidenceSources.map((s) => ({ title: s.title, url: s.url })),
    limitations: p.limitations,
  })),
);
