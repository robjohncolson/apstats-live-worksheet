// Rectangles of pico-desk.png and pico-glyphs.png (built by build-desk-atlas.mjs) for the
// Pico Desk sketch (PICO_DESK_SPEC.md, Phase 0). `src` is the position on the recovered sheet
// named by `sheet`. Only sprites the spec names; no Switch logo, controller art or PICO PARK
// logo. pico-desk-preview.html keeps a copy of DESK_ATLAS (it is a single self-contained
// page); tests/pico-desk-preview.test.js checks the two agree.
//   main = tga_carved/tga_0002_0x4a1018.png  (1 sheet px = 1 art px; the page draws it at 2x)
//   menu = tga_carved/tga_0004_0xabaab4.png  (already at display size: 4 px per art px; 1x)
export const DESK_ATLAS_SIZE = { w: 256, h: 128 };

export const DESK_ATLAS = {
  doorOpen:     { x: 0,   y: 0,  w: 48, h: 48, sheet: 'main', src: [96, 576] },  // lesson = open door
  pushBox:      { x: 48,  y: 0,  w: 48, h: 48, sheet: 'main', src: [464, 32] },  // the floor's push block
  arrowOutline: { x: 96,  y: 0,  w: 44, h: 48, sheet: 'main', src: [2, 640] },   // week paging, idle (points left)
  arrowFilled:  { x: 140, y: 0,  w: 44, h: 48, sheet: 'main', src: [50, 640] },  // week paging, hover / focus
  signPost:     { x: 184, y: 0,  w: 24, h: 19, sheet: 'main', src: [388, 581] }, // post + foot under the Do Now sign
  lyingCat:     { x: 208, y: 0,  w: 31, h: 25, sheet: 'main', src: [835, 916] }, // NO CLASS day
  catBlue:      { x: 0,   y: 48, w: 20, h: 24, sheet: 'main', src: [838, 825] }, // the student's cat (blue)
  catPink:      { x: 20,  y: 48, w: 20, h: 24, sheet: 'main', src: [584, 523] }, // a classmate's cat
  tick:         { x: 40,  y: 48, w: 16, h: 16, sheet: 'main', src: [512, 240] }, // lesson complete
  bang:         { x: 56,  y: 48, w: 14, h: 14, sheet: 'main', src: [64, 336] },  // "!" block: a zero is coming / counting
  flag:         { x: 70,  y: 48, w: 16, h: 32, sheet: 'main', src: [32, 320] },  // Progress Check day
  triangleBlue: { x: 86,  y: 48, w: 17, h: 18, sheet: 'main', src: [721, 33] },  // continue here / recommended (cat colour)
  zzz:          { x: 103, y: 48, w: 20, h: 20, sheet: 'main', src: [609, 92] },  // NO CLASS day
  tileRaised:   { x: 123, y: 48, w: 48, h: 16, sheet: 'main', src: [224, 576] }, // today's day position stands on it
  close:        { x: 171, y: 48, w: 12, h: 12, sheet: 'menu', src: [404, 12] },  // the menu window's ✕ (on its orange bar)
  crown:        { x: 183, y: 48, w: 32, h: 24, sheet: 'main', src: [929, 4] },   // whole week finished (vocabulary strip)
  signboard:    { x: 215, y: 48, w: 34, h: 40, sheet: 'main', src: [383, 560] }, // review / poster / exam day (vocabulary strip)
  // Layout B (stage select): the stage tile's platform line, its "?" mark, and the main menu's
  // small outline carousel arrows (orange, the fifth player colour).
  platform:     { x: 0,   y: 88, w: 64, h: 8,  sheet: 'main', src: [512, 696] },
  question:     { x: 64,  y: 88, w: 20, h: 35, sheet: 'main', src: [534, 651] }, // lesson with no published content
  triOutRight:  { x: 84,  y: 88, w: 17, h: 18, sheet: 'main', src: [797, 1] },
  triOutLeft:   { x: 101, y: 88, w: 17, h: 18, sheet: 'main', src: [797, 65] },
};

// Glyph sheet tga_carved/tga_0000_0x28cd94.png: white glyphs, 64 px cells, 16 per row, each
// glyph in the cell's left 32 px. The built strip keeps only these characters (no lower case,
// no katakana), one 32x64 cell each, 16 per row, in this order.
export const GLYPH_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789=.-!?*+[]><:_';
export const GLYPH_CELL = { w: 32, h: 64, perRow: 16 };
export const GLYPH_SIZE = { w: 512, h: 256 };

// Index of a character on the recovered glyph sheet (a-z, A-Z, 0-9, then the punctuation,
// with one empty cell between ':' and '_').
export function glyphSourceIndex(ch) {
  const punct = '=.-!?*+[]><:';
  if (ch >= 'A' && ch <= 'Z') return 26 + ch.charCodeAt(0) - 65;
  if (ch >= '0' && ch <= '9') return 52 + ch.charCodeAt(0) - 48;
  if (ch === '_') return 75;
  const p = punct.indexOf(ch);
  if (p < 0) throw new Error('not on the glyph sheet: ' + ch);
  return 62 + p;
}
