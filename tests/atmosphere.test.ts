import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { pigmentPixels, PIGMENT_SEED, PIGMENT_SIZE } from "../scripts/generate-pigment.mjs";

test("the original pigment is reproducible and uses tiny stationary tonal marks", () => {
  const pixels = pigmentPixels();
  assert.equal(pixels.length, PIGMENT_SIZE * PIGMENT_SIZE);
  assert.deepEqual(pixels, pigmentPixels());
  assert.notDeepEqual(pixels, pigmentPixels(PIGMENT_SIZE, PIGMENT_SEED + 1));
  const levels = new Set(pixels);
  assert.equal(levels.size, 16);
  const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  assert.ok(mean > 125 && mean < 130, `neutral pigment: ${mean}`);
  // Adjacent pixels should retain high-frequency detail rather than form
  // coarse blocks; every tile edge has the same stochastic construction.
  let differences = 0;
  for (let y = 0; y < PIGMENT_SIZE; y++)
    for (let x = 0; x < PIGMENT_SIZE; x++)
      differences += Math.abs(pixels[y * PIGMENT_SIZE + x] - pixels[y * PIGMENT_SIZE + ((x + 1) % PIGMENT_SIZE)]);
  assert.ok(differences / pixels.length > 70);
});

test("the checked-in texture is the generator's exact small palette PNG", async () => {
  const asset = await readFile(new URL("../public/textures/half-full-pigment.png", import.meta.url));
  const generated = await sharp(pigmentPixels(), { raw: { width: PIGMENT_SIZE, height: PIGMENT_SIZE, channels: 1 } })
    .png({ palette: true, colours: 16, dither: 0, compressionLevel: 9 })
    .toBuffer();
  assert.equal(createHash("sha256").update(asset).digest("hex"), createHash("sha256").update(generated).digest("hex"));
  const metadata = await sharp(asset).metadata();
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
  assert.equal(metadata.isPalette, true);
  assert.ok(asset.length < 140_000);
});
