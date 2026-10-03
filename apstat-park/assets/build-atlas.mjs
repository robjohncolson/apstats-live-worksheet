// Dev tool (not shipped to students): crops the PICO PARK 1-1 art out of the game's
// 1024x1024 sheet into pico-1-1.png and checks it against pico-atlas.mjs.
//   node apstat-park/assets/build-atlas.mjs [path/to/tga_0002_0x4a1018.png]
// Default source: the recovered sheet in the sibling not-school/hermes/old-app checkout.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { ATLAS, ATLAS_SIZE } from './pico-atlas.mjs';

const here = new URL('./', import.meta.url);
const source = process.argv[2] || fileURLToPath(new URL('../../../../not-school/hermes/old-app/recovered/tga_carved/tga_0002_0x4a1018.png', here));
const sheet = PNG.sync.read(readFileSync(source));
const out = new PNG({ width: ATLAS_SIZE.w, height: ATLAS_SIZE.h });
out.data.fill(0);
for (const [name, rect] of Object.entries(ATLAS)) {
  const [sx, sy] = rect.src;
  for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
    const from = ((sy + y) * sheet.width + sx + x) * 4, to = ((rect.y + y) * out.width + rect.x + x) * 4;
    sheet.data.copy(out.data, to, from, from + 4);
  }
  if (rect.x + rect.w > out.width || rect.y + rect.h > out.height) throw new Error(name + ' outside the atlas');
}
const target = fileURLToPath(new URL('pico-1-1.png', here));
writeFileSync(target, PNG.sync.write(out));
console.log('wrote', target, out.width + 'x' + out.height);
