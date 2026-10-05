// Original 5x7 block lettering for the Park scenery. No web-font load or LCD raster.
const glyphs = {
  A:'01110/10001/10001/11111/10001/10001/10001', B:'11110/10001/10001/11110/10001/10001/11110',
  C:'01111/10000/10000/10000/10000/10000/01111', D:'11110/10001/10001/10001/10001/10001/11110',
  E:'11111/10000/10000/11110/10000/10000/11111', F:'11111/10000/10000/11110/10000/10000/10000',
  G:'01111/10000/10000/10111/10001/10001/01111', H:'10001/10001/10001/11111/10001/10001/10001',
  I:'11111/00100/00100/00100/00100/00100/11111', J:'00111/00010/00010/00010/00010/10010/01100',
  K:'10001/10010/10100/11000/10100/10010/10001', L:'10000/10000/10000/10000/10000/10000/11111',
  M:'10001/11011/10101/10101/10001/10001/10001', N:'10001/11001/11001/10101/10011/10011/10001',
  O:'01110/10001/10001/10001/10001/10001/01110', P:'11110/10001/10001/11110/10000/10000/10000',
  Q:'01110/10001/10001/10001/10101/10010/01101', R:'11110/10001/10001/11110/10100/10010/10001',
  S:'01111/10000/10000/01110/00001/00001/11110', T:'11111/00100/00100/00100/00100/00100/00100',
  U:'10001/10001/10001/10001/10001/10001/01110', V:'10001/10001/10001/10001/10001/01010/00100',
  W:'10001/10001/10001/10101/10101/10101/01010', X:'10001/10001/01010/00100/01010/10001/10001',
  Y:'10001/10001/01010/00100/00100/00100/00100', Z:'11111/00001/00010/00100/01000/10000/11111',
  0:'01110/10001/10011/10101/11001/10001/01110', 1:'00100/01100/00100/00100/00100/00100/01110',
  2:'01110/10001/00001/00010/00100/01000/11111', 3:'11110/00001/00001/01110/00001/00001/11110',
  4:'00010/00110/01010/10010/11111/00010/00010', 5:'11111/10000/10000/11110/00001/00001/11110',
  6:'01110/10000/10000/11110/10001/10001/01110', 7:'11111/00001/00010/00100/01000/01000/01000',
  8:'01110/10001/10001/01110/10001/10001/01110', 9:'01110/10001/10001/01111/00001/00001/01110',
  '-':'00000/00000/00000/11111/00000/00000/00000', '+':'00000/00100/00100/11111/00100/00100/00000',
  '=':'00000/00000/11111/00000/11111/00000/00000', '.':'00000/00000/00000/00000/00000/00110/00110',
  ':':'00000/00110/00110/00000/00110/00110/00000', ',':'00000/00000/00000/00000/00110/00100/01000',
  '>':'10000/01000/00100/00010/00100/01000/10000', '<':'00001/00010/00100/01000/00100/00010/00001',
  '/':'00001/00001/00010/00100/01000/10000/10000', '^':'00100/01010/10001/00000/00000/00000/00000',
  '(':'00010/00100/01000/01000/01000/00100/00010', ')':'01000/00100/00010/00010/00010/00100/01000',
  '[':'01110/01000/01000/01000/01000/01000/01110', ']':'01110/00010/00010/00010/00010/00010/01110',
  '{':'00010/00100/00100/01000/00100/00100/00010', '}':'01000/00100/00100/00010/00100/00100/01000',
  '!':'00100/00100/00100/00100/00100/00000/00100', '?':'01110/10001/00001/00010/00100/00000/00100',
  '*':'00000/10101/01110/11111/01110/10101/00000', "'":'00100/00100/00000/00000/00000/00000/00000',
  'Σ':'11111/10000/01000/00100/01000/10000/11111', 'Θ':'01110/10001/10001/11111/10001/10001/01110',
};
const pixels = Object.fromEntries(Object.entries(glyphs).map(([key, rows]) => [key,
  rows.split('/').flatMap((row, y) => [...row].flatMap((bit, x) => bit === '1' ? [[x, y]] : []))]));
const textCaches = new WeakMap();
// Limit both entry count and pixels: changing countdowns/names cannot grow this
// cache indefinitely. Each document retains at most about 4 MB of text bitmaps.
function cachedText(doc, text, unit, color, width) {
  if (!doc?.createElement || typeof color !== 'string' || !width || width > 4096) return null;
  let cache = textCaches.get(doc);
  if (!cache) { cache = { entries: new Map(), pixels: 0 }; textCaches.set(doc, cache); }
  const key = JSON.stringify([text, unit, color]);
  const hit = cache.entries.get(key);
  if (hit) { cache.entries.delete(key); cache.entries.set(key, hit); return hit; }
  const area = width * unit * 7;
  if (area > 1048576) return null;
  const canvas = doc.createElement('canvas'); canvas.width = width; canvas.height = unit * 7;
  const paint = canvas.getContext('2d');
  if (!paint) return null;
  paint.fillStyle = color;
  paintGlyphs(paint, text, 0, 0, unit);
  while (cache.entries.size >= 256 || cache.pixels + area > 1048576) {
    const oldest = cache.entries.keys().next().value, image = cache.entries.get(oldest);
    cache.pixels -= image.width * image.height; cache.entries.delete(oldest);
  }
  cache.entries.set(key, canvas); cache.pixels += area;
  return canvas;
}
function paintGlyphs(ctx, text, start, top, unit) {
  [...text].forEach((character, index) => {
    if (character === ' ') return;
    for (const [px, py] of pixels[character] || pixels['?']) {
      ctx.fillRect(start + (index * 6 + px) * unit, top + py * unit, unit, unit);
    }
  });
}
export function pixelText(ctx, value, x, y, size = 14, color = '#3a3045', align = 'left') {
  const text = String(value).toUpperCase().replace(/→/g, '>').replace(/[−⁻]/g, '-')
    .replace(/¹/g, '1').replace(/²/g, '2').replace(/×/g, '*').replace(/÷/g, '/').replace(/·/g, '.');
  const unit = Math.max(1, Math.round(size / 7));
  const width = Math.max(0, text.length * 6 - 1) * unit;
  const start = Math.round(x - (align === 'center' ? width / 2 : align === 'right' ? width : 0));
  ctx.fillStyle = color;
  const top = Math.round(y - 7 * unit);
  const image = cachedText(ctx.canvas?.ownerDocument, text, unit, color, width);
  if (image) ctx.drawImage(image, start, top);
  else paintGlyphs(ctx, text, start, top, unit);
}
