const V = new URL(import.meta.url).search;
const { createPicoArt } = await import('./pico-art.mjs' + V);
const { ATLAS_URL, PLAYER_COLOURS, WALK_CELLS, WALK_TICKS } = await import('./assets/pico-atlas.mjs' + V);

// Keep the verified 1-1 desk art. The generic recovered preview uses rounded
// rectangles and draws invisible Warp sensors; neither belongs in the game view.
const TILE_CODES = { MC_NON: 'N', MC_FLC: 'C', MC_FLL: 'L', MC_FLR: 'R', MC_WAL: 'W', MC_WAR: 'A', MC_INC: 'I' };
const restoredLifts = new WeakSet();

export function restoreJump01Steps(runtime) {
  for (const block of runtime.staticRects) {
    const { spawn, rect } = block;
    // stage_jump01's Rect rows use a left/bottom anchor and a 25-unit skirt.
    // These are the same measured surfaces used by the working level-6 port.
    const width = spawn.raw[6], height = spawn.raw[7];
    Object.assign(rect, { x: spawn.x, y: spawn.y - height, width, height: height - 25 });
  }
  for (const lift of runtime.weightedLifts) {
    if (restoredLifts.has(lift)) continue;
    // The prior verified lift is 92 x 9.5 at half scale, resting at y=201.5.
    // The preview's generic 64 x 14 body places it too high and too narrow.
    lift.spawn = { ...lift.spawn, y: 412.5 };
    Object.assign(lift.rect, { x: 2444, y: 403, width: 184, height: 19 });
    lift.params.travel = -(184 + 4 * runtime.players.length);
    restoredLifts.add(lift);
  }
}

export async function createJump01Art(doc) {
  const image = new doc.defaultView.Image(); image.src = ATLAS_URL;
  await image.decode();
  const art = createPicoArt(doc); art.load(image);
  let source = null, level = null;
  function terrain(ctx, definition, runtime) {
    if (source !== definition) {
      source = definition;
      const { width, height, chipSize, table } = definition.map;
      level = { width: width * chipSize / 2, height: height * chipSize / 2,
        tiles: { size: chipSize / 2, columns: Array.from({ length: width }, (_, x) =>
          Array.from({ length: height }, (_, y) => TILE_CODES[table[y * width + x]] || 'N').join('')) } };
    }
    // Continue solid bottom columns to the desk's lower edge without filling pits.
    ctx.fillStyle = '#ff864d';
    level.tiles.columns.forEach((column, x) => {
      if (column.at(-1) !== 'N') ctx.fillRect(x * 24, level.height - 1, 24, 28);
    });
    art.tiles(ctx, level);
    for (const { rect } of runtime.staticRects) {
      art.block(ctx, { x: rect.x / 2, y: rect.y / 2, w: rect.width / 2, h: rect.height / 2 });
    }
    for (const lift of runtime.weightedLifts) {
      const r = lift.rect;
      const riders = runtime.players.filter(player => Math.abs(player.rect.y + player.rect.height - r.y) < 3
        && player.rect.x < r.x + r.width && player.rect.x + player.rect.width > r.x).length;
      art.lift(ctx, { x: r.x / 2, w: r.width / 2, h: r.height / 2 }, r.y / 2,
        Math.max(0, runtime.players.length - riders));
    }
    for (const goal of runtime.goals) {
      art.door(ctx, goal.view.x / 2, (goal.view.y - 2) / 2, runtime.keys.every(key => key.collected));
    }
  }
  function cats(ctx, runtime, ticks, colours, focusSlot) {
    runtime.players.forEach((player, index) => {
      if (!player.view.visible || runtime.goalClearedPlayers.has(player)) return;
      const slot = runtime.playerInputSlots[index] ?? index;
      const colour = colours[slot] || PLAYER_COLOURS[slot % PLAYER_COLOURS.length];
      const cell = player.deathTimer > 0 ? 1 : !player.grounded ? 5
        : player.velocity.x ? WALK_CELLS[Math.floor(ticks / WALK_TICKS) % WALK_CELLS.length] : 0;
      const x = Math.round((player.rect.x + player.rect.width / 2) / 2 - 10);
      const y = Math.round((player.rect.y + player.rect.height - 2) / 2 - 24);
      art.cat(ctx, colour, cell, player.getFacingDirection() > 0, x, y);
      if (slot !== focusSlot) return;
      ctx.fillStyle = colour; ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 6, y - 8); ctx.lineTo(x + 14, y - 8); ctx.lineTo(x + 10, y - 3);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    });
  }
  return { terrain, cats };
}
