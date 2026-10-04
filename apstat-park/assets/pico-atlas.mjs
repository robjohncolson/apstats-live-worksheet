// Rectangles of pico-1-1.png (built by build-atlas.mjs from PICO PARK's 1024x1024 sheet
// tga_0002; `src` is the sheet position). The site owner has the developer's permission to
// use PICO PARK's assets here. Everything is drawn 1:1 at the level's half scale unless noted.
// Carries this module's ?v=<build> so the image comes from the same deploy as the code.
export const ATLAS_URL = new URL('./pico-1-1.png' + new URL(import.meta.url).search, import.meta.url).href;
export const ATLAS_SIZE = { w: 352, h: 112 };

export const ATLAS = {
  // One rounded 48x48 orange square; tiles and stair blocks are windows into it.
  square:      { x: 0,   y: 0,  w: 48, h: 48, src: [0, 528] },
  doorClosed:  { x: 48,  y: 0,  w: 48, h: 48, src: [96, 512] },   // drawn 32x32, smoothing on
  doorOpen:    { x: 96,  y: 0,  w: 48, h: 48, src: [96, 576] },
  // Number panel on a stem over a 96x8 platform; platform top at row 33, columns 1..96.
  lift:        { x: 144, y: 0,  w: 98, h: 42, src: [351, 511], surface: 33, panel: { cx: 49, cy: 11 } },
  switchUp:    { x: 0,   y: 48, w: 16, h: 16, src: [160, 448] },  // art in rows 8..15, base at the bottom
  switchDown:  { x: 16,  y: 48, w: 16, h: 16, src: [176, 448] },
  bridge:      { x: 32,  y: 48, w: 16, h: 16, src: [240, 576] },  // drawn 10x10 per segment
  key:         { x: 48,  y: 48, w: 16, h: 28, src: [112, 640] },  // art 12x24 at (2, 2)
  // Player cat, cells 0..10 of the sheet's row 0 (32 px cells, art 20x24 at (6, 8); the "dead"
  // cell 1 sits 2 px lower, at (6, 10)). Colour-coded: red = body, blue = outline, green = highlight.
  // The calendar strip's cats use the same cells (classroom-board.js CAT_ATLAS).
  cats:        { x: 0,   y: 80, w: 352, h: 32, src: [0, 0], cell: 32, art: { x: 6, y: 8, w: 20, h: 24 }, deadArtY: 10 },
};

// 24x24 tile windows into `square` (atlas offsets), keyed by the relay's tile codes
// (levels.mjs JUMP01_TILE_CODES; stage_common.lua MC_*): C=MC_FLC L=MC_FLL R=MC_FLR
// W=MC_WAL A=MC_WAR I=MC_INC. N (MC_NON) is empty.
export const TILE_WINDOWS = {
  L: [0, 0], C: [16, 0], R: [24, 0],
  W: [0, 16], I: [16, 16], A: [24, 16],
};

// Player colour table (PICO PARK order). rgb = r*C + b*C*0.7 + g, per channel, from the
// colour-coded cat.
export const PLAYER_COLOURS = ['#7fbfff', '#ff8c8c', '#ffff8c', '#a8ffa8', '#ffb782', '#ffa8ff', '#cf9fff', '#e0e0e0'];
export const WALK_CELLS = [4, 5, 4, 3, 2, 5, 2, 3];
export const WALK_TICKS = 12;
export const IDLE_CELL = 0;
export const JUMP_CELL = 5;
export const FLAT_COLOUR = '#FF864D';

// Sounds (Vorbis), from recovered/assets_carved/ogg.
export const SOUNDS = {
  jump: 'pico-jump.ogg',             // ogg_0003_0x36fcc0
  switch: 'pico-switch.ogg',         // ogg_0027_0x966e94
  key: 'pico-key.ogg',               // ogg_0005_0x44b0d8 (key pickup and door opening)
  clear: 'pico-clear.ogg',           // ogg_0018_0x4f7898
  fanfare: 'pico-fanfare.ogg',       // ogg_0013_0x4e3c90
};
