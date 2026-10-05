// Dev tool (not shipped to students): crops the Pico Desk sketch art out of the recovered
// PICO PARK sheets into pico-desk.png + pico-glyphs.png, using pico-desk-atlas.mjs.
//   node apstat-park/assets/build-desk-atlas.mjs [path/to/recovered/tga_carved]
// Default source: the recovered sheets in the sibling not-school/hermes/old-app checkout.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  DESK_ATLAS, DESK_ATLAS_SIZE, GLYPH_CHARS, GLYPH_CELL, GLYPH_SIZE, glyphSourceIndex,
} from './pico-desk-atlas.mjs';

const here = new URL('./', import.meta.url);
const carved = process.argv[2] || fileURLToPath(new URL('../../../../not-school/hermes/old-app/recovered/tga_carved/', here));
const SHEETS = {
  main: PNG.sync.read(readFileSync(path.join(carved, 'tga_0002_0x4a1018.png'))),
  menu: PNG.sync.read(readFileSync(path.join(carved, 'tga_0004_0xabaab4.png'))),
};
const glyphSheet = PNG.sync.read(readFileSync(path.join(carved, 'tga_0000_0x28cd94.png')));

function copyRect(from, sx, sy, to, dx, dy, w, h) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = ((sy + y) * from.width + sx + x) * 4, b = ((dy + y) * to.width + dx + x) * 4;
    from.data.copy(to.data, b, a, a + 4);
  }
}

function writePng(png, name) {
  const target = fileURLToPath(new URL(name, here));
  writeFileSync(target, PNG.sync.write(png));
  console.log('wrote', target, png.width + 'x' + png.height);
}

// Sprites.
const atlas = new PNG({ width: DESK_ATLAS_SIZE.w, height: DESK_ATLAS_SIZE.h });
atlas.data.fill(0);
for (const [name, rect] of Object.entries(DESK_ATLAS)) {
  if (rect.x + rect.w > atlas.width || rect.y + rect.h > atlas.height) throw new Error(name + ' outside the atlas');
  copyRect(SHEETS[rect.sheet], rect.src[0], rect.src[1], atlas, rect.x, rect.y, rect.w, rect.h);
}
writePng(atlas, 'pico-desk.png');

// Glyphs: the left 32x64 of each 64x64 source cell.
const glyphs = new PNG({ width: GLYPH_SIZE.w, height: GLYPH_SIZE.h });
glyphs.data.fill(0);
[...GLYPH_CHARS].forEach((ch, i) => {
  const s = glyphSourceIndex(ch);
  const dx = (i % GLYPH_CELL.perRow) * GLYPH_CELL.w, dy = Math.floor(i / GLYPH_CELL.perRow) * GLYPH_CELL.h;
  copyRect(glyphSheet, (s % 16) * 64, Math.floor(s / 16) * 64, glyphs, dx, dy, GLYPH_CELL.w, GLYPH_CELL.h);
});
writePng(glyphs, 'pico-glyphs.png');
