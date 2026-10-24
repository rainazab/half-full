import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('public/icons', { recursive: true });
// Letter paths avoid dependence on local fonts. All artwork is within the maskable safe zone.
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#183f35"/><g fill="none" stroke="#fafbf9" stroke-width="25" stroke-linecap="square"><path d="M145 180v102q0 50 43 50t43-50V180"/><path d="M363 195q-65-40-85 15q-10 30 36 45t43 45q-15 50-80 20"/></g></svg>`);
for (const [name, size] of [['icon-192',192],['icon-512',512],['maskable-512',512],['apple-touch-icon',180]]) await sharp(svg).resize(size,size).png().toFile(`public/icons/${name}.png`);
