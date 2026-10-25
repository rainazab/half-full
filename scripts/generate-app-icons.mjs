import sharp from "sharp";
import { writeFile } from "node:fs/promises";
const source = "logo.png";
const metadata = await sharp(source).metadata();
console.log({
  source,
  width: metadata.width,
  height: metadata.height,
  alpha: metadata.hasAlpha,
});
const background = "#3285f5";
async function icon(size, padding = 0) {
  const inner = size - 2 * padding;
  const art = await sharp(source)
    .resize(inner, inner, { fit: "contain", background })
    .flatten({ background })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 3, background },
  })
    .composite([{ input: art, gravity: "centre" }])
    .png()
    .toBuffer();
}
for (const [file, size, pad] of [
  ["app/icon.png", 32, 0],
  ["app/apple-icon.png", 180, 0],
  ["public/icons/apple-touch-icon.png", 180, 0],
  ["public/icons/icon-192.png", 192, 0],
  ["public/icons/icon-512.png", 512, 0],
  ["public/icons/maskable-512.png", 512, 72],
])
  await writeFile(file, await icon(size, pad));
const images = await Promise.all([16, 32, 48].map((n) => icon(n)));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((b, i) => {
  const o = 6 + i * 16;
  header[o] = [16, 32, 48][i];
  header[o + 1] = header[o];
  header.writeUInt16LE(1, o + 4);
  header.writeUInt16LE(32, o + 6);
  header.writeUInt32LE(b.length, o + 8);
  header.writeUInt32LE(offset, o + 12);
  offset += b.length;
});
await writeFile("app/favicon.ico", Buffer.concat([header, ...images]));
