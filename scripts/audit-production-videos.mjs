#!/usr/bin/env node
const date = process.argv[2];
const base = process.env.HALF_FULL_URL || "https://news-ten-omega-68.vercel.app";
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
  console.error("Usage: node scripts/audit-production-videos.mjs YYYY-MM-DD");
  process.exit(2);
}
const get = (path, options) => fetch(`${base}${path}`, { ...options, cache: "no-store" });
const editionResponse = await get(`/api/editions/${date}`);
if (!editionResponse.ok) throw new Error(`Edition request failed: ${editionResponse.status}`);
const edition = await editionResponse.json();
const videosResponse = await get(`/api/videos?date=${date}`);
if (!videosResponse.ok) throw new Error(`Video manifest request failed: ${videosResponse.status}`);
const payload = await videosResponse.json();
for (const story of edition.edition.stories) {
  const manifest = payload.videos?.[story.id];
  const clip = manifest?.clips?.[0];
  const ready = manifest?.status === "ready" && clip?.status === "ready" && clip?.asset?.contentType === "video/mp4";
  let endpoint = "-";
  let endpointStatus = "-";
  if (ready) {
    endpoint = clip.asset.url;
    const response = await get(endpoint, { headers: { Range: "bytes=0-15" } });
    endpointStatus = `${response.status} ${response.headers.get("content-type") || ""}`.trim();
  }
  console.log(JSON.stringify({ storyId: story.id, headline: story.headline, status: manifest?.status || "no-manifest", clipStatus: clip?.status || "none", ready, endpoint, endpointStatus }));
}
