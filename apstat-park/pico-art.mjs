// Level 6 art: PICO PARK's own sprites from assets/pico-1-1.png (see assets/pico-atlas.mjs).
// Loaded lazily when the level mounts; until the image is ready (or in a test DOM without
// canvas) every draw call falls back to flat shapes, so gameplay never waits on art.
// Same build as whoever imported this module: the board imports panel.mjs?v=<APP_BUILD> and every
// park module passes its own query on, so a deploy never mixes old and new modules (HTTP/CDN cache).
const V = new URL(import.meta.url).search;
const { ATLAS, ATLAS_URL, TILE_WINDOWS, PLAYER_COLOURS, FLAT_COLOUR } = await import('./assets/pico-atlas.mjs' + V);
const { tileCodeAt } = await import('./pico-rules.mjs' + V);

const hex = colour => [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16));

// rgb = r*C + b*C*0.7 + g per channel (r, g, b, C as 0..1 fractions of 255).
export function tintPixel(r, g, b, colour) {
  return hex(colour).map(c => Math.min(255, Math.round((r / 255) * c + (b / 255) * c * 0.7 + g)));
}

export function createPicoArt(doc) {
  const win = doc?.defaultView;
  let image = null, ready = false, cats = null, tiles = null, tilesFor = null, tilesAccent = null, catPixels = null;
  // The song palette (park-music.mjs sets --park-accent on <html>) recolours the orange square:
  // floors, stair blocks, tiles and bridges. Read at most every 200 ms; null = the game's orange.
  let accent = null, accentAt = -Infinity;
  const squares = new Map();   // accent -> the 48x48 square sprite recoloured (source-atop)
  function accentNow() {
    const now = Date.now();
    if (now - accentAt < 200) return accent;
    accentAt = now;
    let next = null;
    try { next = win?.getComputedStyle(doc.documentElement).getPropertyValue('--park-accent').trim() || null; } catch { next = null; }
    if (next && next.toLowerCase() === FLAT_COLOUR.toLowerCase()) next = null;
    accent = next;
    return accent;
  }
  // { img, x, y } of the square sprite in the current accent (the atlas itself when none).
  function square() {
    const colour = accentNow();
    if (!colour) return { img: image, x: ATLAS.square.x, y: ATLAS.square.y };
    if (!squares.has(colour)) {
      const s = ATLAS.square, tinted = canvas(s.w, s.h);
      if (!tinted) return { img: image, x: s.x, y: s.y };
      tinted.ctx.drawImage(image, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
      tinted.ctx.globalCompositeOperation = 'source-atop';
      tinted.ctx.fillStyle = colour; tinted.ctx.fillRect(0, 0, s.w, s.h);
      if (squares.size >= 16) squares.delete(squares.keys().next().value);
      squares.set(colour, tinted.c);
    }
    return { img: squares.get(colour), x: 0, y: 0 };
  }
  const flat = () => accentNow() || FLAT_COLOUR;
  const CAT_CACHE_MAX = 64;   // tinted frame sets, one per colour (students' own hues)
  function canvas(w, h) {
    const c = doc.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext && c.getContext('2d');
    return ctx ? { c, ctx } : null;
  }
  // `shared`: the calendar board's already-decoded copy of the same atlas (board.atlas()). With it
  // the level is drawable on its first frame; otherwise load (and decode) our own.
  function load(shared = null) {
    if (image) return;
    const adopt = img => { image = img; ready = !!img.naturalWidth; cats = new Map(); catPixels = null; };
    if (shared && shared.complete && shared.naturalWidth > 0) { adopt(shared); return; }
    if (!win || typeof win.Image !== 'function') return;
    const own = new win.Image();
    own.onload = () => {
      const done = () => { image = null; adopt(own); };
      if (typeof own.decode === 'function') own.decode().then(done, done); else done();
    };
    image = own;
    own.src = ATLAS_URL;
  }
  // Tinted cat frames per colour, baked on first use and cached (at most CAT_CACHE_MAX colours):
  // frames[cell] = { right, left } 20x24 canvases; the dead cell 1 is taken 2 px lower.
  function bakeColour(colour) {
    const art = ATLAS.cats.art, cell = ATLAS.cats.cell, cellCount = ATLAS.cats.w / cell;
    if (!catPixels) {
      const source = canvas(ATLAS.cats.w, ATLAS.cats.h + 2);
      if (!source) return null;
      source.ctx.drawImage(image, ATLAS.cats.x, ATLAS.cats.y, ATLAS.cats.w, ATLAS.cats.h, 0, 0, ATLAS.cats.w, ATLAS.cats.h);
      catPixels = source.ctx.getImageData(0, 0, ATLAS.cats.w, ATLAS.cats.h + 2);
    }
    const frames = [];
    for (let n = 0; n < cellCount; n++) {
      const right = canvas(art.w, art.h), left = canvas(art.w, art.h);
      const out = right.ctx.createImageData(art.w, art.h), top = n === 1 ? (ATLAS.cats.deadArtY ?? art.y) : art.y;
      for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++) {
        const from = ((top + y) * catPixels.width + n * cell + art.x + x) * 4, to = (y * art.w + x) * 4;
        const a = catPixels.data[from + 3];
        if (!a) continue;
        const [r, g, b] = tintPixel(catPixels.data[from], catPixels.data[from + 1], catPixels.data[from + 2], colour);
        out.data.set([r, g, b, a], to);
      }
      right.ctx.putImageData(out, 0, 0);
      left.ctx.translate(art.w, 0); left.ctx.scale(-1, 1); left.ctx.drawImage(right.c, 0, 0);
      frames.push({ right: right.c, left: left.c });
    }
    return frames;
  }
  function framesFor(colour) {
    if (!ready || !cats) return null;
    if (cats.has(colour)) return cats.get(colour);
    let frames = null;
    try { frames = bakeColour(colour); } catch { frames = null; }
    if (cats.size >= CAT_CACHE_MAX) cats.delete(cats.keys().next().value);
    cats.set(colour, frames);
    return frames;
  }
  // The static tile map, rendered once per level into a level-sized canvas.
  function tileLayer(level) {
    if (!ready || !level.tiles) return null;
    const sq = square();
    if (tiles && tilesFor === level && tilesAccent === sq.img) return tiles;
    const size = level.tiles.size, layer = canvas(level.width, level.height);
    if (!layer) return null;
    layer.ctx.imageSmoothingEnabled = false;
    level.tiles.columns.forEach((column, col) => {
      for (let row = 0; row < column.length; row++) {
        const window = TILE_WINDOWS[tileCodeAt(level, col, row)];
        if (!window) continue;
        layer.ctx.drawImage(sq.img, sq.x + window[0], sq.y + window[1], size, size, col * size, row * size, size, size);
      }
    });
    tiles = layer.c; tilesFor = level; tilesAccent = sq.img;
    return tiles;
  }
  const sprite = (ctx, rect, dx, dy, dw = rect.w, dh = rect.h) => ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, dx, dy, dw, dh);
  return {
    load,
    get ready() { return ready; },
    get baked() { return !!cats; },
    framesFor,
    tiles(ctx, level) {
      const layer = tileLayer(level);
      if (layer) { ctx.drawImage(layer, 0, 0); return; }
      ctx.fillStyle = flat();
      for (const p of level.platforms) if (p.kind === 'tile') ctx.fillRect(p.x, p.y, p.w, p.h);
    },
    // Stair blocks: nine-slice of the 48x48 square in 16 px cells.
    block(ctx, r) {
      if (!ready) { ctx.fillStyle = flat(); ctx.fillRect(r.x, r.y, r.w, r.h); return; }
      const sq = square(), s = { x: sq.x, y: sq.y }, c = 16, half = Math.min(c, r.w / 2, r.h / 2);
      const xs = [[0, r.x, half], [c, r.x + half, r.w - 2 * half], [2 * c + (c - half), r.x + r.w - half, half]];
      const ys = [[0, r.y, half], [c, r.y + half, r.h - 2 * half], [2 * c + (c - half), r.y + r.h - half, half]];
      for (const [sx, dx, dw] of xs) for (const [sy, dy, dh] of ys) {
        if (dw <= 0 || dh <= 0) continue;
        const sw = sx === c ? c : half, sh = sy === c ? c : half;
        ctx.drawImage(sq.img, s.x + sx, s.y + sy, sw, sh, dx, dy, dw, dh);
      }
    },
    bridge(ctx, left, right, y) {
      for (let x = right - 10; x > left - 10; x -= 10) {
        const dx = Math.max(left, x);
        if (ready) sprite(ctx, ATLAS.bridge, dx, y, 10, 10);
        else { ctx.fillStyle = flat(); ctx.fillRect(dx, y, 10, 10); }
      }
    },
    switchPad(ctx, cx, floor, down) {
      const rect = down ? ATLAS.switchDown : ATLAS.switchUp;
      if (ready) sprite(ctx, rect, cx - 8, floor - 16);
      else { ctx.fillStyle = '#ff0000'; ctx.fillRect(cx - 5, floor - (down ? 4 : 8), 10, down ? 1 : 5); }
    },
    // Platform top of the lift art sits on the lift surface, centred on the solid.
    lift(ctx, lift, surface, count) {
      const rect = ATLAS.lift, x = lift.x + lift.w / 2 - rect.w / 2, y = surface - rect.surface;
      if (ready) sprite(ctx, rect, x, y);
      else { ctx.fillStyle = FLAT_COLOUR; ctx.fillRect(lift.x, surface, lift.w, lift.h); }
      if (count == null) return;
      ctx.save();
      ctx.fillStyle = FLAT_COLOUR; ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(count), x + rect.panel.cx, y + rect.panel.cy + 1);
      ctx.restore();
    },
    key(ctx, cx, cy) {
      const rect = ATLAS.key;
      if (ready) sprite(ctx, rect, Math.round(cx - rect.w / 2), Math.round(cy - rect.h / 2));
      else { ctx.fillStyle = '#d4d400'; ctx.fillRect(cx - 4, cy - 10, 8, 20); }
    },
    // Doors are 48 px art drawn at 32x32 with smoothing ON (the one non-1:1 sprite).
    door(ctx, cx, floor, open) {
      const rect = open ? ATLAS.doorOpen : ATLAS.doorClosed;
      if (!ready) { ctx.fillStyle = open ? '#000' : '#c0a080'; ctx.fillRect(cx - 16, floor - 32, 32, 32); return; }
      ctx.save(); ctx.imageSmoothingEnabled = true;
      sprite(ctx, rect, cx - 16, floor - 32, 32, 32);
      ctx.restore();
    },
    // colour: '#rrggbb' body colour (the student's own, see pico-rules catColour).
    cat(ctx, colour, cell, facingRight, x, y) {
      const frame = framesFor(colour)?.[cell];
      if (frame) { ctx.drawImage(facingRight ? frame.right : frame.left, x, y); return; }
      ctx.fillStyle = colour;
      ctx.fillRect(x + 2, y + 1, 16, 23);
    },
  };
}
