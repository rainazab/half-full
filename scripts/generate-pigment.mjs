import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const PIGMENT_SIZE = 512;
export const PIGMENT_SEED = 0x48464c4c;

/** Stationary, high-frequency stochastic pigment on a torus. Neighbor samples
 * wrap at the boundary, so filtering has exactly the same statistics at seams.
 * A small high-pass suppresses dirty clusters while keeping individual 1px marks.
 */
export function pigmentPixels(size = PIGMENT_SIZE, seed = PIGMENT_SEED) {
  let state = seed >>> 0;
  const samples = new Float64Array(size * size);
  for (let i = 0; i < samples.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    samples[i] = (state >>> 0) / 0x100000000;
  }
  const sample = (x, y) => samples[((y + size) % size) * size + ((x + size) % size)];
  const pixels = Buffer.alloc(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const neighbors = (sample(x - 1, y) + sample(x + 1, y) + sample(x, y - 1) + sample(x, y + 1)) / 4;
      const detail = (sample(x, y) - .5) * 1.2 - (neighbors - .5) * .2;
      const level = Math.max(0, Math.min(15, Math.round(7.5 + detail * 15)));
      pixels[y * size + x] = level * 17;
    }
  }
  return pixels;
}

export async function generatePigment() {
  const directory = new URL("../public/textures/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const pixels = pigmentPixels();
  const png = await sharp(pixels, { raw: { width: PIGMENT_SIZE, height: PIGMENT_SIZE, channels: 1 } })
    .png({ palette: true, colours: 16, dither: 0, compressionLevel: 9 })
    .toBuffer();
  await writeFile(new URL("half-full-pigment.png", directory), png);
  return { bytes: png.length, sha256: createHash("sha256").update(png).digest("hex") };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generatePigment().then((result) => console.log(JSON.stringify(result)));
}
