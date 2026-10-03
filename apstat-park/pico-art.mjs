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
  let image = null, ready = false, cats = null, tiles = null, tilesFor = null;
  function canvas(w, h) {
    const c = doc.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext && c.getContext('2d');
    return ctx ? { c, ctx } : null;
  }
  function load() {
    if (image || !win || typeof win.Image !== 'function') return;
    image = new win.Image();
    image.onload = () => { ready = !!image.naturalWidth; try { bake(); } catch { cats = null; } };
    image.src = ATLAS_URL;
  }
  // Tinted cat frames, baked once: cats[colour][cell] = { right, left } 20x24 canvases.
  function bake() {
    const art = ATLAS.cats.art, cell = ATLAS.cats.cell, cellCount = ATLAS.cats.w / cell;
    const source = canvas(ATLAS.cats.w, ATLAS.cats.h);
    if (!source) return;
    source.ctx.drawImage(image, ATLAS.cats.x, ATLAS.cats.y, ATLAS.cats.w, ATLAS.cats.h, 0, 0, ATLAS.cats.w, ATLAS.cats.h);
    const pixels = source.ctx.getImageData(0, 0, ATLAS.cats.w, ATLAS.cats.h);
    cats = PLAYER_COLOURS.map(colour => {
      const frames = [];
      for (let n = 0; n < cellCount; n++) {
        const right = canvas(art.w, art.h), left = canvas(art.w, art.h);
        const out = right.ctx.createImageData(art.w, art.h);
        for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++) {
          const from = ((art.y + y) * ATLAS.cats.w + n * cell + art.x + x) * 4, to = (y * art.w + x) * 4;
          const a = pixels.data[from + 3];
          if (!a) continue;
          const [r, g, b] = tintPixel(pixels.data[from], pixels.data[from + 1], pixels.data[from + 2], colour);
          out.data.set([r, g, b, a], to);
        }
        right.ctx.putImageData(out, 0, 0);
        left.ctx.translate(art.w, 0); left.ctx.scale(-1, 1); left.ctx.drawImage(right.c, 0, 0);
        frames.push({ right: right.c, left: left.c });
      }
      return frames;
    });
  }
  // The static tile map, rendered once per level into a level-sized canvas.
  function tileLayer(level) {
    if (!ready || !level.tiles) return null;
    if (tiles && tilesFor === level) return tiles;
    const size = level.tiles.size, layer = canvas(level.width, level.height);
    if (!layer) return null;
    layer.ctx.imageSmoothingEnabled = false;
    level.tiles.columns.forEach((column, col) => {
      for (let row = 0; row < column.length; row++) {
        const window = TILE_WINDOWS[tileCodeAt(level, col, row)];
        if (!window) continue;
        layer.ctx.drawImage(image, ATLAS.square.x + window[0], ATLAS.square.y + window[1], size, size, col * size, row * size, size, size);
      }
    });
    tiles = layer.c; tilesFor = level;
    return tiles;
  }
  const sprite = (ctx, rect, dx, dy, dw = rect.w, dh = rect.h) => ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, dx, dy, dw, dh);
  return {
    load,
    get ready() { return ready; },
    get baked() { return !!cats; },
    tiles(ctx, level) {
      const layer = tileLayer(level);
      if (layer) { ctx.drawImage(layer, 0, 0); return; }
      ctx.fillStyle = FLAT_COLOUR;
      for (const p of level.platforms) if (p.kind === 'tile') ctx.fillRect(p.x, p.y, p.w, p.h);
    },
    // Stair blocks: nine-slice of the 48x48 square in 16 px cells.
    block(ctx, r) {
      if (!ready) { ctx.fillStyle = FLAT_COLOUR; ctx.fillRect(r.x, r.y, r.w, r.h); return; }
      const s = ATLAS.square, c = 16, half = Math.min(c, r.w / 2, r.h / 2);
      const xs = [[0, r.x, half], [c, r.x + half, r.w - 2 * half], [2 * c + (c - half), r.x + r.w - half, half]];
      const ys = [[0, r.y, half], [c, r.y + half, r.h - 2 * half], [2 * c + (c - half), r.y + r.h - half, half]];
      for (const [sx, dx, dw] of xs) for (const [sy, dy, dh] of ys) {
        if (dw <= 0 || dh <= 0) continue;
        const sw = sx === c ? c : half, sh = sy === c ? c : half;
        ctx.drawImage(image, s.x + sx, s.y + sy, sw, sh, dx, dy, dw, dh);
      }
    },
    bridge(ctx, left, right, y) {
      for (let x = right - 10; x > left - 10; x -= 10) {
        const dx = Math.max(left, x);
        if (ready) sprite(ctx, ATLAS.bridge, dx, y, 10, 10);
        else { ctx.fillStyle = FLAT_COLOUR; ctx.fillRect(dx, y, 10, 10); }
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
    cat(ctx, colour, cell, facingRight, x, y) {
      const frame = cats?.[colour % cats.length]?.[cell];
      if (frame) { ctx.drawImage(facingRight ? frame.right : frame.left, x, y); return; }
      ctx.fillStyle = PLAYER_COLOURS[colour % PLAYER_COLOURS.length];
      ctx.fillRect(x + 2, y + 2, 16, 22);
    },
  };
}
