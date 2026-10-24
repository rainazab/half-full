import sharp from "sharp";
import { mkdir } from "node:fs/promises";
await mkdir("public/icons", { recursive: true });
// Letter paths avoid dependence on local fonts. All artwork is within the maskable safe zone.
// An original half-filled glass; geometric artwork is independent of local fonts.
const svg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#dcecf8"/><defs><clipPath id="glass"><path d="M166 153h180l-18 191q-3 27-31 27h-82q-28 0-31-27z"/></clipPath></defs><g clip-path="url(#glass)"><rect x="166" y="250" width="180" height="130" fill="#7298b5"/><path d="M160 254q45-18 92 0t100 0" fill="none" stroke="#f5e5ed" stroke-width="13"/></g><path d="M166 153h180l-18 191q-3 27-31 27h-82q-28 0-31-27z" fill="none" stroke="#273b50" stroke-width="16" stroke-linejoin="round"/><path d="M373 153v-36m-18 18h36" stroke="#273b50" stroke-width="11" stroke-linecap="round"/><circle cx="231" cy="301" r="6" fill="#273b50"/><circle cx="281" cy="301" r="6" fill="#273b50"/><path d="M240 324q16 13 32 0" fill="none" stroke="#273b50" stroke-width="6" stroke-linecap="round"/></svg>`,
);
for (const [name, size] of [
  ["icon-192", 192],
  ["icon-512", 512],
  ["maskable-512", 512],
  ["apple-touch-icon", 180],
])
  await sharp(svg).resize(size, size).png().toFile(`public/icons/${name}.png`);
