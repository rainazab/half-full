// Upload ONLY this explicit source list. Never include .env, generated files or local credentials.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const token = process.env.APIFY_API_TOKEN;
if (!token) throw Error("Set APIFY_API_TOKEN first.");
const api = async (path, init = {}) => {
  const response = await fetch(`https://api.apify.com/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) {
    let code;
    try {
      code = JSON.parse(text).error?.type;
    } catch {}
    throw Error(`Apify HTTP ${response.status}: ${code ?? "request failed"}`);
  }
  return text ? JSON.parse(text) : null;
};
const names = [
  ".actor/actor.json",
  ".actor/input_schema.json",
  ".actor/output_schema.json",
  "Dockerfile",
  "README.md",
  "package.json",
  "main.mjs",
  "core.mjs",
];
const sourceFiles = await Promise.all(
  names.map(async (name) => ({
    name,
    format: "TEXT",
    content: await readFile(`actors/news-receipts/${name}`, "utf8"),
  })),
);
const version = {
  versionNumber: "0.1",
  sourceType: "SOURCE_FILES",
  buildTag: "latest",
  sourceFiles,
};
const list = await api("/actors?my=true&limit=100");
let actor = list.data?.items?.find((a) => a.name === "us-news-receipts");
if (actor) {
  if (actor.isPublic)
    throw Error(
      "The existing Actor is public; this script only updates a private development Actor.",
    );
  await api(`/actors/${actor.id}/versions/0.1`, {
    method: "PUT",
    body: JSON.stringify(version),
  });
} else
  actor = (
    await api("/actors", {
      method: "POST",
      body: JSON.stringify({
        name: "us-news-receipts",
        title: "US News Receipts — Reporting to Evidence",
        description:
          "Discover reporting, investigate original sources, preserve exact passages and provenance for editorial review.",
        isPublic: false,
        versions: [version],
        defaultRunOptions: {
          build: "latest",
          timeoutSecs: 150,
          memoryMbytes: 256,
        },
      }),
    })
  ).data;
const build = (
  await api(`/actors/${actor.id}/builds?version=0.1`, { method: "POST" })
).data;
await mkdir("generated", { recursive: true });
await writeFile(
  "generated/receipts-actor-build.json",
  JSON.stringify(
    {
      actorId: actor.id,
      username: actor.username,
      name: actor.name,
      buildId: build.id,
      isPublic: actor.isPublic,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    actorId: actor.id,
    name: actor.name,
    buildId: build.id,
    isPublic: actor.isPublic,
  }),
);
