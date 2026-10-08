// Batch 13 (scripts/pico-campaign-patches.mjs): the action button (native input bit 11), warp-gun-player (11-1 / 11-3),
// colorbox-gravity (11-3) and magnet-player (11-2 / 11-4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html>', { pretendToBeVisual: true });
const noop = () => {};
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({ canvas: this }, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'measureText') return () => ({ width: 6, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2 });
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return noop;
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['navigator', 'HTMLCanvasElement', 'Image', 'HTMLImageElement']) {
  if (!(key in globalThis)) globalThis[key] = dom.window[key];
}
if (!('self' in globalThis)) globalThis.self = dom.window;
globalThis.requestAnimationFrame ||= (callback) => setTimeout(callback, 16);

const runtime = await import('./recovered/runtime.mjs');
const { decodeInput } = await import('./campaign-engine.mjs');
const IDLE = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false,
  action: false, actionPressed: false, resetPressed: false, prevStagePressed: false, nextStagePressed: false };
const PARTIES = [2, 4, 8];

function load(source, partySize = 2, seed = 1) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  const data = partySize >= (entry.largeParty?.minimum ?? Infinity) ? entry.largeParty.data : entry.data;
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(data, 720, 750, { partySize, simplifyPassivePlaceholders: false });
  return game;
}
const idle = (n) => Array.from({ length: Math.max(n, 8) }, () => IDLE);
function step(game, frames, inputs = idle(game.players.length)) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, inputs[0], inputs);
}
/** Inputs that hold `buttons` for the given cats only (by their input slots). */
function holdFor(game, catIndex, buttons, more = {}) {
  const wanted = new Map([[catIndex, buttons], ...Object.entries(more).map(([index, value]) => [Number(index), value])]);
  return idle(game.players.length).map((input, slot) => {
    const cat = game.playerInputSlots.indexOf(slot);
    return wanted.has(cat) ? { ...IDLE, ...wanted.get(cat) } : IDLE;
  });
}
function place(player, x, y) { player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true); }
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
/** The native origin of a cat: centre x, feet y (body bottom + 1). */
const origin = (cat) => ({ x: cat.rect.x + 16, y: cat.rect.y + 47 });
const ACTION = { action: true };
const FIRE = { action: true, actionPressed: true };

// ---------------------------------------------------------------------------------------------------------------
// action-button

test('action button: bits 64 (held) / 256 (press edge) decode; old packets (bits <= 63) decode as before', () => {
  // upPressed is the batch-15 UP press edge (bit 512); older packets never set it.
  assert.deepEqual(decodeInput(64 | 256 | 2), { ...IDLE, upPressed: false, right: true, action: true, actionPressed: true });
  assert.deepEqual(decodeInput(64), { ...IDLE, upPressed: false, action: true });
  assert.deepEqual(decodeInput(50), { ...IDLE, upPressed: false, jump: true, jumpPressed: true, right: true });
  assert.equal(decodeInput(128).action, false, '128 is the helper flag, not a button');
  for (let bits = 0; bits <= 63; bits++) {
    const decoded = decodeInput(bits);
    assert.equal(decoded.action || decoded.actionPressed, false);
    assert.equal(decoded.jumpPressed, !!(bits & 32));
    assert.equal(decoded.upPressed, false);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// warp-gun-player

test('11-1 / 11-3 at parties 2/4/8: a gun cat jumps normally; the gun fires only on the action press edge', () => {
  for (const source of ['stage_gun01', 'stage_gun02']) {
    for (const party of PARTIES) {
      const game = load(source, party);
      step(game, 10);
      const cat = game.players[0];
      const floor = cat.rect.y;
      step(game, 1, holdFor(game, 0, { jump: true, jumpPressed: true }));
      step(game, 5, holdFor(game, 0, { jump: true }));
      assert.ok(cat.rect.y < floor - 10, `${source} p${party}: the gun cat jumps (${cat.rect.y} vs ${floor})`);
      assert.equal(game.warpGunShots.size, 0, `${source} p${party}: jump never fires`);
      step(game, 60);
      // 11-3: the next cat stands inside the 10 x 10 launch probe (a shot is refused natively): fire from the block top.
      if (source === 'stage_gun02') { place(cat, 700, 336 - 47); step(game, 5); }
      // Held without the edge: nothing.
      step(game, 5, holdFor(game, 0, ACTION));
      assert.equal(game.warpGunShots.size, 0, `${source} p${party}: a held action button does not fire`);
      step(game, 1, holdFor(game, 0, FIRE));
      assert.equal(game.warpGunShots.size, 1, `${source} p${party}: the press edge fires`);
      assert.ok(game.warpGunShots.has(cat));
    }
  }
});

test('11-1: one live shot per gun; a second press while it flies does nothing', () => {
  const game = load('stage_gun01', 2);
  step(game, 10);
  const [a, b] = game.players;
  place(b, 40, b.rect.y);   // out of the line of fire (behind A)
  step(game, 1, holdFor(game, 0, FIRE));
  const shot = game.warpGunShots.get(a);
  assert.ok(shot);
  const x0 = shot.x;
  step(game, 3, holdFor(game, 0, ACTION));
  step(game, 1, holdFor(game, 0, FIRE));
  assert.equal(game.warpGunShots.get(a), shot, 'the same shot');
  assert.equal(game.warpGunShots.size, 1);
  assert.ok(close(shot.x, x0 + 4 * 6), '6 per tick');
});

test('11-1: a shot fired far right in the world (scrolled camera) flies until it leaves the visible screen', () => {
  const game = load('stage_gun01', 2);
  const [a, b] = game.players;
  for (let i = 0; i < 90; i++) { place(a, 1700, 385); place(b, 1650, 385); step(game, 1); }
  assert.ok(game.scrollCameraState.scroll > 853, `the camera scrolled (${game.scrollCameraState.scroll})`);
  step(game, 1, holdFor(game, 0, FIRE));
  const shot = game.warpGunShots.get(a);
  assert.ok(shot, 'fired');
  const x0 = shot.x;
  step(game, 10);
  assert.equal(game.warpGunShots.get(a), shot, 'still flying (was: world x >= 853 died on the first step)');
  assert.ok(close(shot.x, x0 + 60) && shot.hitFadeRemainingSeconds === undefined);
});

/** A (cat 0) shoots B (cat 1), standing just right of it on the 11-1 floor: B is held. */
function pickUp(game) {
  const [a, b] = game.players;
  step(game, 10);
  place(a, 84, 385); place(b, 154, 385);
  step(game, 1, holdFor(game, 0, FIRE));
  for (let i = 0; i < 40 && !game.warpGunDisabledPlayers.has(b); i++) step(game, 1);
  return [a, b];
}

test('11-1 at parties 2/4/8: a picked-up cat is hidden and inert where it was hit; its buttons do nothing', () => {
  for (const party of PARTIES) {
    const game = load('stage_gun01', party);
    const [a, b] = pickUp(game);
    assert.ok(game.warpGunDisabledPlayers.has(b), `p${party}: B is held`);
    assert.equal(game.warpGunSelectedPlayers.get(a), b);
    assert.equal(b.view.visible, false, 'hidden');
    const at = { ...b.rect };
    step(game, 30, holdFor(game, 1, { right: true, jump: true, jumpPressed: true, ...FIRE }));
    assert.deepEqual({ x: b.rect.x, y: b.rect.y }, { x: at.x, y: at.y }, `p${party}: inert where it was hit`);
    assert.equal(game.warpGunShots.has(b), false, 'a held cat cannot fire');
  }
});

test('11-1 at parties 2/4/8: a held cat has its collision off -- the shooter walks straight through its spot', () => {
  for (const party of PARTIES) {
    const game = load('stage_gun01', party);
    const [a, b] = pickUp(game);
    assert.ok(game.warpGunDisabledPlayers.has(b), `p${party}: B is held`);
    const end = b.rect.x + b.rect.width;
    step(game, 40, holdFor(game, 0, { right: true }));
    assert.ok(a.rect.x > end, `p${party}: A passed B (A.x ${a.rect.x}, B right edge ${end})`);
  }
});

test('11-1: placement on the shooter\'s side of the wall; a blocked first spot retries h + 2 lower (party 4)', () => {
  for (const blocked of [false, true]) {
    const game = load('stage_gun01', 4);
    const [a, b] = pickUp(game);
    step(game, 40);   // the first shot fades
    assert.equal(game.warpGunShots.size, 0);
    const c = game.players[2];
    // A in the air left of the wall x 864 (solid at this height), facing right.
    place(a, 780, 200);
    const shotY = a.rect.y + 47 - 17;
    const firstSpot = { x: 864 - 5 - 0.01 - 32 - 1, y: shotY - 46 - 1 };
    if (blocked) place(c, firstSpot.x, firstSpot.y - 13);   // overlaps the first spot, clear of the shot's path
    else place(c, 300, 385);
    step(game, 1, holdFor(game, 0, FIRE));
    for (let i = 0; i < 30 && game.warpGunDisabledPlayers.has(b); i++) {
      if (blocked) place(c, firstSpot.x, firstSpot.y - 13);
      step(game, 1);
    }
    assert.equal(game.warpGunDisabledPlayers.has(b), false, `blocked=${blocked}: B is placed`);
    assert.equal(b.view.visible, true);
    assert.ok(close(b.rect.x, firstSpot.x, 0.02), `blocked=${blocked}: x on the shooter's side ${b.rect.x}`);
    // Placement happens before B's next update, then it falls normally: compare with the fall it already did.
    const expectedTop = blocked ? firstSpot.y + 46 + 2 : firstSpot.y;
    assert.ok(b.rect.y >= expectedTop - 1e-6 && b.rect.y < expectedTop + 2, `blocked=${blocked}: y ${b.rect.y} vs ${expectedTop}`);
    assert.equal(game.warpGunSelectedPlayers.has(a), false, 'the gun is empty again');
    step(game, 120);
    assert.ok(close(b.rect.y + b.rect.height, 432, 1), `blocked=${blocked}: the placed cat fell to the floor (${b.rect.y})`);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// colorbox-gravity

const forceBox = (game) => game.colorBoxes.find((box) => box.spawn.actorName === 'ForceColorBox');
const boxBottom = (box) => box.spawn.y + box.params.height / 2;

test('11-3 at parties 2/4/8: an unsupported ForceColorBox falls and lands on the floor; cats never push it', () => {
  for (const party of PARTIES) {
    const game = load('stage_gun02', party);
    const box = forceBox(game);
    step(game, 5);
    assert.ok(close(boxBottom(box), 432, 0.01), `p${party}: rests on the floor`);
    box.spawn.y -= 120; box.view.y -= 120;
    step(game, 4);
    assert.ok(boxBottom(box) > 312 && boxBottom(box) < 432, `p${party}: falling (${boxBottom(box)})`);
    step(game, 60);
    assert.ok(close(boxBottom(box), 432, 0.01), `p${party}: landed flush (${boxBottom(box)})`);
    const cat = game.players[0];
    const x = box.spawn.x;
    place(cat, 97, 385);
    step(game, 40, holdFor(game, 0, { left: true }));
    assert.equal(box.spawn.x, x, `p${party}: colour 8 matches no slot: never pushed`);
  }
});

test('11-3: the warp gun picks up the ForceColorBox; placed in the air it falls', () => {
  const game = load('stage_gun02', 2);
  const box = forceBox(game);
  const [a, b] = game.players;
  step(game, 10);
  place(b, 400, 385);
  step(game, 2, holdFor(game, 0, { left: true }));   // A turns left toward the box
  assert.equal(a.getFacingDirection(), -1);
  step(game, 1, holdFor(game, 0, FIRE));
  for (let i = 0; i < 40 && game.colorBoxes.includes(box); i++) step(game, 1);
  assert.equal(game.warpGunSelectedPlayers.get(a), box, 'held');
  assert.equal(box.view.visible, false);
  step(game, 40);
  // A in the air facing left: the shot hits the left wall (x 48), the box appears on A's side, bottom = shot.y - 1.
  place(a, 300, 200);
  const shotY = a.rect.y + 47 - 17;
  step(game, 1, holdFor(game, 0, FIRE));
  for (let i = 0; i < 60 && !game.colorBoxes.includes(box); i++) step(game, 1);
  assert.ok(game.colorBoxes.includes(box), 'placed');
  assert.ok(close(box.spawn.x - 24, 48 + 5 + 0.01 + 1, 0.02), `left edge ${box.spawn.x - 24}`);
  assert.ok(boxBottom(box) > shotY - 1 && boxBottom(box) < shotY + 10, `appears at shot.y - 1 and starts falling (${boxBottom(box)})`);
  step(game, 120);
  assert.ok(close(boxBottom(box), 432, 0.01), `fell to the floor (${boxBottom(box)})`);
});

// ---------------------------------------------------------------------------------------------------------------
// magnet-player (11-2 floor x 240..624 at y 336; 11-4 platform x 192..576 at y 144 with the SmallBox)

const aux = (game, cat) => game.magnetAuxiliaries.get(cat);
const FLOOR = 336 - 47;

test('11-2 / 11-4 at parties 2/4/8: every MagnetPlayer carries a magnet; nothing is held without the button', () => {
  for (const source of ['stage_magnet01', 'stage_magnet02']) {
    for (const party of PARTIES) {
      const game = load(source, party);
      assert.equal(game.magnetAuxiliaries.size, game.players.length, `${source} p${party}`);
      step(game, 30);
      assert.equal(game.magnetHeldPlayers.size + game.magnetHeldBoxes.size, 0);
      const a = game.players[0];
      const view = aux(game, a).view;
      assert.ok(close(view.x, origin(a).x + 20 * a.getFacingDirection()) && close(view.y, origin(a).y - 10), 'drawn at cat + (+-20, -10)');
    }
  }
});

test('11-2: the field is {x + 40, y - 60, 110, 80} facing right and {x - 150, ...} facing left', () => {
  const game = load('stage_magnet01', 2);
  const [a, b] = game.players;
  step(game, 5);
  const tryGrab = (bx) => {
    game.magnetAuxiliaries.forEach((entry) => game.releaseMagnetTarget(entry));
    place(a, 400, FLOOR); place(b, bx, FLOOR);
    game.updateMagnets(holdFor(game, 0, ACTION)[0], holdFor(game, 0, ACTION));
    return aux(game, a).target === b;
  };
  assert.equal(a.getFacingDirection(), 1);
  const ax = 416;
  // Facing right: field x 456..566 (B's body is 32 wide: it touches from x 425 to 565).
  assert.equal(tryGrab(ax + 40 - 32 + 0.5), true);
  assert.equal(tryGrab(ax + 40 - 32 - 0.5), false, 'just short of the near edge');
  assert.equal(tryGrab(ax + 150 - 0.5), true);
  assert.equal(tryGrab(ax + 150 + 0.5), false, 'just past the far edge');
  assert.equal(tryGrab(ax - 100), false, 'nothing behind');
  // Facing left: field x 266..376.
  game.magnetAuxiliaries.forEach((entry) => game.releaseMagnetTarget(entry));
  place(a, 400, FLOOR);
  step(game, 1, holdFor(game, 0, { left: true }));
  assert.equal(a.getFacingDirection(), -1);
  const left = (bx) => {
    game.magnetAuxiliaries.forEach((entry) => game.releaseMagnetTarget(entry));
    place(a, 400, FLOOR); place(b, bx, FLOOR);
    game.updateMagnets(holdFor(game, 0, ACTION)[0], holdFor(game, 0, ACTION));
    return aux(game, a).target === b;
  };
  assert.equal(left(ax - 40 - 0.5), true);
  assert.equal(left(ax - 40 + 0.5), false);
  assert.equal(left(ax - 150 - 32 + 0.5), true);
  assert.equal(left(ax - 150 - 32 - 0.5), false);
  // The angle filter |normalize(target - cat).y| < 0.909: high in the field's near corner is out, further out is in.
  game.magnetAuxiliaries.forEach((entry) => game.releaseMagnetTarget(entry));
  step(game, 1, holdFor(game, 0, { right: true }));
  assert.equal(a.getFacingDirection(), 1);
  const high = (bx) => {
    game.magnetAuxiliaries.forEach((entry) => game.releaseMagnetTarget(entry));
    place(a, 400, FLOOR); place(b, bx, 336 - 60 + 1.5 - 46);   // origin 57.5 above A's feet, body inside the field
    game.updateMagnets(holdFor(game, 0, ACTION)[0], holdFor(game, 0, ACTION));
    return aux(game, a).target === b;
  };
  assert.equal(high(ax + 40 - 32 + 0.5), false, 'dx 24.5, dy -57.5: |d.y| 0.92');
  assert.equal(high(ax + 40 - 16), true, 'dx 40, dy -57.5: |d.y| 0.82');
  game.magnetAuxiliaries.forEach((entry) => game.releaseMagnetTarget(entry));
});

test('11-2 at parties 2/4/8: hold the button -> the cat is pulled to the hold point and locks; it floats and cannot move', () => {
  for (const party of PARTIES) {
    const game = load('stage_magnet01', party);
    const [a, b] = game.players;
    step(game, 5);
    game.players.slice(2).forEach((other, i) => place(other, 700 + 40 * i, 240 - 47));   // up on the step, away
    place(a, 300, FLOOR); place(b, 380, FLOOR);
    step(game, 1, holdFor(game, 0, ACTION));
    assert.equal(aux(game, a).target, b, `p${party}: grabbed`);
    assert.ok(game.magnetHeldPlayers.has(b));
    for (let i = 0; i < 40 && !aux(game, a).locked; i++) step(game, 1, holdFor(game, 0, ACTION, { 1: { left: true, jump: true, jumpPressed: i === 3 } }));
    assert.equal(aux(game, a).locked, true, `p${party}: locked`);
    assert.ok(close(b.rect.x, origin(a).x + 30), `p${party}: near edge 30 in front (${b.rect.x})`);
    assert.ok(close(b.rect.y, a.rect.y), `p${party}: feet level`);
    const at = { ...b.rect };
    step(game, 30, holdFor(game, 0, ACTION, { 1: { right: true, jump: true, jumpPressed: true } }));
    assert.ok(close(b.rect.x, at.x) && close(b.rect.y, at.y), `p${party}: the held cat ignores its buttons and gravity`);
  }
});

test('11-2: the holder cannot turn (walks backwards) and a locked target travels with it', () => {
  const game = load('stage_magnet01', 2);
  const [a, b] = game.players;
  step(game, 5);
  place(a, 400, FLOOR); place(b, 470, FLOOR);
  step(game, 40, holdFor(game, 0, ACTION));
  assert.equal(aux(game, a).locked, true);
  step(game, 20, holdFor(game, 0, { ...ACTION, left: true }));
  assert.equal(a.getFacingDirection(), 1, 'facing frozen');
  assert.ok(a.rect.x < 400 - 40, `walked backwards (${a.rect.x})`);
  assert.ok(close(b.rect.x, origin(a).x + 30, 1e-6) && aux(game, a).locked, `B travels with A (${b.rect.x} vs ${origin(a).x + 30})`);
  step(game, 1);
  step(game, 2, holdFor(game, 0, { left: true }));
  assert.equal(a.getFacingDirection(), -1, 'released: it turns again');
});

test('11-2: release drops the target straight down; a locked target more than 32 away unlocks', () => {
  const game = load('stage_magnet01', 2);
  const [a, b] = game.players;
  step(game, 5);
  // A faces left at the pit edge (floor from x 240); B is held over the pit (x 96..240).
  place(a, 250, FLOOR);
  step(game, 1, holdFor(game, 0, { left: true }));
  place(a, 250, FLOOR); place(b, 160, FLOOR);
  step(game, 1, holdFor(game, 0, ACTION));
  assert.equal(aux(game, a).target, b);
  for (let i = 0; i < 60 && !aux(game, a).locked; i++) step(game, 1, holdFor(game, 0, ACTION));
  assert.equal(aux(game, a).locked, true);
  assert.ok(close(b.rect.x + b.rect.width, origin(a).x - 30), `right edge 30 in front (facing left): ${b.rect.x}`);
  // Lock break: 40 px away (still in the field) unlocks but keeps the target.
  place(b, b.rect.x - 40, b.rect.y);
  game.updateMagnets(holdFor(game, 0, ACTION)[0], holdFor(game, 0, ACTION));
  assert.equal(aux(game, a).target, b);
  assert.equal(aux(game, a).locked, false, 'lock broken beyond 32');
  for (let i = 0; i < 80 && !aux(game, a).locked; i++) step(game, 1, holdFor(game, 0, ACTION));
  const x = b.rect.x, y = b.rect.y;
  step(game, 1);   // let go
  assert.equal(game.magnetHeldPlayers.has(b), false);
  step(game, 20);
  assert.equal(b.rect.x, x, 'straight down: no sideways motion');
  assert.ok(b.rect.y > y + 20, `falling (${b.rect.y})`);
});

test('11-2 party 4: the nearest candidate is grabbed first', () => {
  const game = load('stage_magnet01', 4);
  const [a, b, c, d] = game.players;
  step(game, 5);
  place(d, 250, FLOOR - 120);
  place(a, 300, FLOOR); place(b, 420, FLOOR); place(c, 370, FLOOR);
  step(game, 1, holdFor(game, 0, ACTION));
  assert.equal(aux(game, a).target, c, 'the nearer cat');
  step(game, 1);
  place(b, 365, FLOOR); place(c, 430, FLOOR);
  step(game, 1, holdFor(game, 0, ACTION));
  assert.equal(aux(game, a).target, b);
});

test('11-4 at parties 2/4/8: the SmallBox is pulled to the hold point, rides a jump while held, drops straight when released', () => {
  for (const party of PARTIES) {
    const game = load('stage_magnet02', party);
    const box = game.pushBoxes.find((entry) => entry.spawn.actorName === 'SmallBox');
    const a = game.players[0];
    step(game, 5);
    game.players.slice(1).forEach((other, i) => place(other, 100 + 36 * i, 288 - 47));   // on the gate lid, away
    place(a, 420, 144 - 47);
    step(game, 1, holdFor(game, 0, ACTION));
    assert.equal(aux(game, a).target, box, `p${party}: the box is grabbed`);
    for (let i = 0; i < 60 && !aux(game, a).locked; i++) step(game, 1, holdFor(game, 0, ACTION));
    assert.equal(aux(game, a).locked, true);
    assert.ok(close(box.rect.x, origin(a).x + 30) && close(box.rect.y + box.rect.height, origin(a).y), `p${party}: hold point ${box.rect.x}`);
    // A jumps: the locked box travels with it (its own fall is frozen).
    const y0 = box.rect.y;
    step(game, 1, holdFor(game, 0, { ...ACTION, jump: true, jumpPressed: true }));
    step(game, 9, holdFor(game, 0, { ...ACTION, jump: true }));
    assert.ok(box.rect.y < y0 - 20 && close(box.rect.y + box.rect.height, origin(a).y, 1e-6), `p${party}: rides the jump (${box.rect.y})`);
    const x = box.rect.x, y = box.rect.y;
    step(game, 1);   // released in the air
    assert.equal(game.magnetHeldBoxes.has(box), false);
    step(game, 6);
    assert.equal(box.rect.x, x, `p${party}: straight down`);
    assert.ok(box.rect.y > y, `p${party}: falling (${box.rect.y} vs ${y})`);
    step(game, 60);
    assert.ok(close(box.rect.y + box.rect.height, 144, 0.01), `p${party}: back on the platform (${box.rect.y + box.rect.height})`);
  }
});

test('11-4 at parties 2/4/8: a pulled box stops flush under the Lift slab (solid actor bodies block the pull)', () => {
  for (const party of PARTIES) {
    const game = load('stage_magnet02', party);
    const box = game.pushBoxes.find((entry) => entry.spawn.actorName === 'SmallBox');
    const lift = game.weightedLifts[0];
    const a = game.players[0];
    step(game, 5);
    game.players.slice(1).forEach((other, i) => place(other, 100 + 36 * i, 288 - 47));   // on the gate lid, away
    place(a, 640, lift.rect.y - 46);
    box.applyRect({ ...box.rect, x: 690, y: lift.rect.y + lift.rect.height });
    const underside = lift.rect.y + lift.rect.height;
    for (let i = 0; i < 40; i++) {
      step(game, 1, holdFor(game, 0, ACTION));
      assert.equal(aux(game, a).target, box, `p${party} tick ${i}: still held`);
      assert.ok(box.rect.y >= underside - 1e-9, `p${party} tick ${i}: box top ${box.rect.y} inside the slab (underside ${underside})`);
    }
    assert.ok(close(box.rect.y, underside, 1e-9), `p${party}: flush against the underside`);
  }
});

test('11-4 at parties 2/4/8: two magnets can hold one box; either letting go unfreezes it while the other keeps pulling', () => {
  for (const party of PARTIES) {
    const game = load('stage_magnet02', party);
    const box = game.pushBoxes.find((entry) => entry.spawn.actorName === 'SmallBox');
    const [a, b] = game.players;
    step(game, 5);
    game.players.slice(2).forEach((other, i) => place(other, 100 + 36 * i, 288 - 47));
    place(a, 400, 144 - 47); place(b, 520, 144 - 47);
    step(game, 1, holdFor(game, 0, { right: true }, { 1: { left: true } }));
    place(a, 400, 144 - 47); place(b, 520, 144 - 47);
    box.applyRect({ ...box.rect, x: 450, y: 144 - box.rect.height });
    step(game, 1, holdFor(game, 0, ACTION, { 1: ACTION }));
    assert.equal(aux(game, a).target, box, `p${party}: A holds the box`);
    assert.equal(aux(game, b).target, box, `p${party}: B holds the same box`);
    assert.ok(game.magnetHeldBoxes.has(box));
    step(game, 5, holdFor(game, 0, ACTION, { 1: ACTION }));
    assert.equal(aux(game, a).target, box);
    assert.equal(aux(game, b).target, box);
    // A lets go: the one held flag clears (the box is no longer frozen) but B still holds and pulls it.
    step(game, 1, holdFor(game, 1, ACTION));
    assert.equal(aux(game, a).target, undefined, `p${party}: A let go`);
    assert.equal(aux(game, b).target, box, `p${party}: B still holds it`);
    assert.equal(game.magnetHeldBoxes.has(box), false, `p${party}: the release cleared the held flag`);
    const holdX = origin(b).x - 30 - box.rect.width;
    for (let i = 0; i < 40; i++) step(game, 1, holdFor(game, 1, ACTION));
    assert.ok(Math.abs(box.rect.x - holdX) < 1, `p${party}: B pulled it to its hold point (${box.rect.x} vs ${holdX})`);
  }
});

test('a helper cat held by a magnet that leaves is released first (no stale hold)', () => {
  const game = load('stage_magnet01', 2);
  const [a] = game.players;
  game.addRuntimePlayer({ ...game.stage.createTable.find((row) => /Player/.test(row.actorName)), actorName: 'Player', label: '3' });
  const helper = game.players.at(-1);
  helper.parkHelper = true;
  step(game, 5);
  place(a, 300, FLOOR); place(helper, 380, FLOOR);
  step(game, 5, holdFor(game, 0, ACTION));
  assert.equal(aux(game, a).target, helper);
  game.removeRuntimePlayer(helper);
  assert.equal(aux(game, a).target, undefined);
  assert.equal(game.magnetHeldPlayers.has(helper), false);
  assert.equal(game.magnetAuxiliaries.has(a), true, 'the holder keeps its magnet');
  step(game, 5, holdFor(game, 0, ACTION));
});

// ---------------------------------------------------------------------------------------------------------------

test('determinism: two runtimes with the same inputs -> identical cats, shots, holds and boxes (11-1..11-4)', () => {
  for (const [source, party] of [['stage_gun01', 2], ['stage_gun02', 4], ['stage_magnet01', 2], ['stage_magnet01', 8], ['stage_magnet02', 4]]) {
    const run = () => {
      const game = load(source, party);
      const trace = [];
      for (let f = 0; f < 500; f++) {
        const inputs = idle(game.players.length).map((input, i) => ({ ...IDLE, right: (f + 20 * i) % 120 < 50,
          left: (f + 20 * i) % 120 >= 70 && (f + 20 * i) % 120 < 90, jump: f % 70 < 10, jumpPressed: f % 70 === 0,
          action: (f + 13 * i) % 90 < 60, actionPressed: (f + 13 * i) % 90 === 0 }));
        step(game, 1, inputs);
        if (f % 20 === 0) {
          trace.push([
            game.players.map((cat) => [cat.rect.x, cat.rect.y, cat.getFacingDirection()]),
            [...game.warpGunShots.values()].map((shot) => [shot.x, shot.y]),
            [...game.warpGunSelectedPlayers.entries()].map(([owner, target]) => [game.players.indexOf(owner), game.players.indexOf(target)]),
            [...game.magnetAuxiliaries.values()].map((entry) => [entry.locked, entry.target ? entry.target.rect.x : null]),
            game.pushBoxes.map((box) => [box.rect.x, box.rect.y]),
            game.colorBoxes.map((box) => [box.spawn.x, box.spawn.y]),
          ]);
        }
      }
      return JSON.stringify(trace);
    };
    const a = run();
    assert.equal(run(), a, `${source} p${party}`);
  }
});
