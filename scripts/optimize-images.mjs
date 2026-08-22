/**
 * One-shot image optimizer.
 *
 * The legacy Next.js project shipped photos straight off the camera — several
 * were 8–11 MB each, which is fine behind next/image but not in a static
 * public/ folder. This resizes everything in public/ to sane web dimensions
 * and re-encodes as WebP.
 *
 *   node scripts/optimize-images.mjs [sourceDir] [outDir]
 *
 * Defaults to optimizing public/ in place.
 */
import { readdir, mkdir, stat, rename } from 'node:fs/promises';
import { join, extname, dirname, relative } from 'node:path';
import sharp from 'sharp';

const SRC = process.argv[2] ?? 'public';
const OUT = process.argv[3] ?? SRC;
const MAX_WIDTH = 2000;
const QUALITY = 80;
const EXTENSIONS = new Set(['.webp', '.jpg', '.jpeg', '.png']);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

let before = 0;
let after = 0;
let count = 0;

for await (const file of walk(SRC)) {
  if (!EXTENSIONS.has(extname(file).toLowerCase())) continue;

  const original = (await stat(file)).size;
  const target = join(OUT, relative(SRC, file)).replace(/\.[^.]+$/, '.webp');
  await mkdir(dirname(target), { recursive: true });

  const tmp = `${target}.tmp`;
  const info = await sharp(file)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 5 })
    .toFile(tmp);

  await rename(tmp, target);

  before += original;
  after += info.size;
  count += 1;
  console.log(
    `${relative(SRC, file).padEnd(34)} ${kb(original).padStart(9)} -> ${kb(info.size).padStart(9)}  (${info.width}x${info.height})`,
  );
}

console.log(
  `\n${count} images  ${kb(before)} -> ${kb(after)}  (${(100 - (after / before) * 100).toFixed(0)}% smaller)`,
);
