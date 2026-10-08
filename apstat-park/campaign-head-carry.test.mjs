// Teacher 2026-10-07, three campaign rules (scripts/pico-campaign-patches.mjs):
//   push-box-head-carry      — a cat holds a box like a floor; a cat cannot jump through it; a lift / MoveWall
//                              under the cat moves the stack (FUN_7ff72bb33890, FUN_7ff72bb6f0e0); a walking cat
//                              carries it (stack-riding, campaign-stack-ride.test.mjs, retail capture);
//   stacked-cats-weigh-lifts — a cat standing on a cat on the weighted lift counts, and rides;
//   push-box-holds-switches  — a moved, landed push box holds a plain switch down.
// Runs the rebuilt recovered runtime itself (pixi under jsdom, with a no-op canvas context).
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
const IDLE = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false,
  resetPressed: false, prevStagePressed: false, nextStagePressed: false };
const RIGHT = { ...IDLE, right: true };
const JUMP = { ...IDLE, jump: true, jumpPressed: true };

function loadStage(source, seed = 1) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(entry.data, 720, 750, { partySize: 2, simplifyPassivePlaceholders: false });
  return game;
}
// Player 0 is the local cat (`update(dt, input, inputs)`); player 1 follows `inputs[1]`.
function step(game, frames = 1, inputs = [IDLE, IDLE]) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, inputs[0], inputs);
}
function place(player, x, y) { player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true); }
// Put a box on a cat's head: box bottom on the cat's top, centred over the cat.
function boxOnHead(box, player) {
  box.applyRect({ ...box.rect, x: player.rect.x + player.rect.width / 2 - box.rect.width / 2,
    y: player.rect.y - box.rect.height });
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
}

// 1-3 (stage_jump02): floor top at y 432 from x 820 on (a bottomless pit lies left of it); the box is 40 x 50.
// native-player-body: a cat standing on a floor has rect.y = floor - 46 (FLOOR_Y below); the old 26 x 34 body
// was placed at y 400 (bottom 434, 2 units inside the floor), which now buries the 46-tall body 14 deep.
const FLOOR_Y = (player) => 432 - player.rect.height;
// x 1300 is clear of the static block at x 1032 and of the third box floating at x 1180, y 286.
// stack-riding (retail capture og-capture-2 run B2) supersedes the earlier 'walking away leaves the box' rule:
// a box on a walking cat rides it. It only falls when it is stopped (here by a wall at box height) and the cat
// walks out from under it.
test('1-3: a box rests on a standing cat and rides it when it walks; a wall stops the box, the cat walks on, the box falls', () => {
  const game = loadStage('stage_jump02');
  const [cat, other] = game.players;
  place(cat, 1300, FLOOR_Y(cat)); place(other, 900, FLOOR_Y(other));
  const box = game.pushBoxes[0];
  boxOnHead(box, cat);
  step(game, 2);
  assert.equal(box.rect.y + box.rect.height, cat.rect.y, 'the box rests on the head');
  const offset = box.rect.x - cat.rect.x;
  step(game, 5, [RIGHT, IDLE]);
  assert.equal(box.rect.x - cat.rect.x, offset, 'the box rides the walking cat');
  // A wall at box height only (left-bottom anchored Rect), clear of the cat below it.
  const wallX = box.rect.x + box.rect.width + 10, wallBottom = cat.rect.y - 4;
  game.spawnHandlers.Rect({ raw: [0, 0, 'Rect', '', wallX, wallBottom, 20, 80], actorName: 'Rect', label: '', x: wallX, y: wallBottom });
  let fellAt = -1;
  for (let frame = 0; frame < 60; frame++) {
    step(game, 1, [RIGHT, IDLE]);
    assert.ok(box.rect.x + box.rect.width <= wallX + 1e-6, 'the wall holds the box (frame ' + frame + ')');
    if (fellAt < 0 && box.falling) fellAt = frame;
  }
  assert.ok(cat.rect.x > box.rect.x + box.rect.width, 'the cat walked out from under it: ' + cat.rect.x);
  assert.ok(fellAt >= 0, 'the box lost its support and fell');
  step(game, 60);
  assert.equal(box.falling, false, 'it landed');
  assert.ok(Math.abs(box.rect.y + box.rect.height - 432) < 1, 'on the floor: ' + (box.rect.y + box.rect.height));
});

// head-stack-jump-impulse, against the retail capture (og-capture/notes.md): with a box on its head the cat
// rises 0 in every frame; the box hops 22 native units (~0.28 s), hold-independent, keeps its x, and lands
// back with no bounce. Cats in a column pass the hand-off up; a box carrying a cat receives nothing.
const settled = (game) => { step(game, 20); };
function headHop(source, hold, extraInputs = () => IDLE) {
  const game = loadStage(source);
  const [cat, other] = game.players;
  place(cat, 1300, 432 - cat.rect.height); place(other, 900, 432 - other.rect.height);
  settled(game);
  const box = game.pushBoxes[0];
  boxOnHead(box, cat); step(game, 5);
  const rest = { catY: cat.rect.y, boxY: box.rect.y, boxX: box.rect.x };
  const frames = [];
  for (let f = 0; f < 60; f++) {
    const press = f === 0 ? JUMP : f < hold ? { ...IDLE, jump: true } : IDLE;
    const extra = extraInputs(f);
    step(game, 1, [{ ...press, left: extra.left, right: extra.right }, IDLE]);
    frames.push({ catY: cat.rect.y, catX: cat.rect.x, boxY: box.rect.y, boxX: box.rect.x, falling: box.falling });
  }
  return { game, cat, box, rest, frames };
}

test('1-3: jump with a box on the head: the cat never rises, the box hops 22 and lands back exactly, ~0.27 s', () => {
  const { rest, frames, box } = headHop('stage_jump02', 1);
  for (const [f, frame] of frames.entries()) assert.equal(frame.catY, rest.catY, 'the cat stays at its y (frame ' + f + ')');
  const apex = rest.boxY - Math.min(...frames.map((frame) => frame.boxY));
  assert.ok(Math.abs(apex - 22) <= 1, 'the box hops 22 native units: ' + apex);
  const airborne = frames.filter((frame) => frame.boxY < rest.boxY - 1e-3).length;
  assert.ok(airborne / 60 >= 0.25 && airborne / 60 <= 0.30, 'airtime ~0.28 s: ' + (airborne / 60));
  assert.ok(Math.abs(box.rect.y - rest.boxY) < 1e-4, 'back at exactly its rest y: ' + (box.rect.y - rest.boxY));
  assert.equal(box.rect.x, rest.boxX, 'it kept its x');
  assert.equal(box.falling, false, 'it landed (no bounce)');
});

test('1-3: the hop is the same for a jump held 1, 10 or 40 frames (edge-triggered, no held ramp)', () => {
  const runs = [1, 10, 40].map((hold) => JSON.stringify(headHop('stage_jump02', hold).frames));
  assert.equal(runs[1], runs[0]);
  assert.equal(runs[2], runs[0]);
});

// Retail run P: a short walk during the hop left ~22 native units of overlap. native-walk-and-push-speed: the cat
// walks the native 3/tick (was 4.9), so overlap = 32/2 + 40/2 - 5 x 3 = 21 after 5 frames (was 3 frames x 4.9 = 21.3;
// 3 frames now leave 27).
test('1-3: walking 5 frames during the hop: the box keeps its x in the air and lands off-centre on the head (~22 overlap)', () => {
  const { rest, frames, cat, box } = headHop('stage_jump02', 1, (f) => (f < 5 ? { right: true } : {}));
  for (const frame of frames.filter((frame) => frame.falling)) assert.equal(frame.boxX, rest.boxX, 'no horizontal inheritance in flight');
  assert.ok(Math.abs(box.rect.y + box.rect.height - cat.rect.y) <= 0.5, 'it landed on the head');
  const overlap = Math.min(box.rect.x + box.rect.width, cat.rect.x + cat.rect.width) - Math.max(box.rect.x, cat.rect.x);
  assert.ok(Math.abs(overlap - 22) <= 3, 'off-centre on the head, overlap ~22: ' + overlap);
});

test('1-3: walking clear during the hop: the box comes straight down beside the cat, onto the floor', () => {
  // Clearing the 40-wide box from the centred 32-wide cat takes 36: 13 frames x 3/tick native walk (was 8 x 4.9).
  const { rest, cat, box } = headHop('stage_jump02', 1, (f) => (f < 13 ? { right: true } : {}));
  assert.equal(box.rect.x, rest.boxX, 'it kept its x');
  assert.ok(cat.rect.x >= box.rect.x + box.rect.width, 'the cat is clear of it');
  assert.ok(Math.abs(box.rect.y + box.rect.height - 432) < 1e-3, 'it landed on the floor beside the cat');
  assert.equal(box.falling, false);
});

test('1-3: stack cat / cat / box: the cats stay, the top box hops (retail run E)', () => {
  const game = loadStage('stage_jump02');
  const [a, b] = game.players;
  place(a, 1300, 432 - a.rect.height); place(b, 1300, a.rect.y - b.rect.height);
  settled(game);
  const box = game.pushBoxes[0];
  boxOnHead(box, b); step(game, 5);
  const rest = { a: a.rect.y, b: b.rect.y, box: box.rect.y };
  let apex = 0;
  for (let f = 0; f < 60; f++) {
    step(game, 1, [f === 0 ? JUMP : IDLE, IDLE]);
    assert.equal(a.rect.y, rest.a, 'the bottom cat stays (frame ' + f + ')');
    assert.equal(b.rect.y, rest.b, 'the middle cat stays (frame ' + f + ')');
    apex = Math.max(apex, rest.box - box.rect.y);
  }
  assert.ok(Math.abs(apex - 22) <= 1, 'the top box hops 22: ' + apex);
  assert.ok(Math.abs(box.rect.y - rest.box) < 1e-4, 'and lands back on the middle cat');
});

test('1-3: stack cat / box / cat: nothing moves (retail run M: a box carrying a cat receives nothing)', () => {
  const game = loadStage('stage_jump02');
  const [a, b] = game.players;
  place(a, 1300, 432 - a.rect.height); place(b, 900, 432 - b.rect.height);
  settled(game);
  const box = game.pushBoxes[0];
  boxOnHead(box, a);
  place(b, a.rect.x, box.rect.y - b.rect.height);
  step(game, 5);
  const rest = { a: { ...a.rect }, b: { ...b.rect }, box: { ...box.rect } };
  for (let f = 0; f < 60; f++) {
    step(game, 1, [f === 0 ? JUMP : IDLE, IDLE]);
    assert.deepEqual([a.rect.y, box.rect.y, b.rect.y], [rest.a.y, rest.box.y, rest.b.y], 'frame ' + f);
  }
});

test('1-3: cat on cat: the lower cat does not rise and the upper cat is not launched (retail run I)', () => {
  const game = loadStage('stage_jump02');
  const [a, b] = game.players;
  place(a, 1300, 432 - a.rect.height); place(b, 1300, a.rect.y - b.rect.height);
  settled(game);
  const rest = { a: a.rect.y, b: b.rect.y };
  for (let f = 0; f < 40; f++) {
    step(game, 1, [f === 0 ? JUMP : f < 20 ? { ...IDLE, jump: true } : IDLE, IDLE]);
    assert.equal(a.rect.y, rest.a, 'the lower cat stays (frame ' + f + ')');
    assert.equal(b.rect.y, rest.b, 'the upper cat stays (frame ' + f + ')');
  }
});

// 1-2 (stage_push02) is not jump02: cats hold boxes in every stage (native support has no category filter),
// and the walking cat carries it (stack-riding) there too.
test('1-2 (not jump02): a cat holds a box and carries it when it walks', () => {
  const game = loadStage('stage_push02');
  const [cat, other] = game.players;
  place(cat, 1200, FLOOR_Y(cat)); place(other, 100, FLOOR_Y(other));
  const box = game.pushBoxes[2];   // the 96 x 96 block
  boxOnHead(box, cat);
  step(game, 2);
  assert.equal(box.rect.y + box.rect.height, cat.rect.y, 'supported by the head outside jump02');
  const offset = box.rect.x - cat.rect.x, catX = cat.rect.x;
  step(game, 10, [RIGHT, IDLE]);
  assert.ok(cat.rect.x > catX + 20, 'the cat walked: ' + (cat.rect.x - catX));
  assert.equal(box.rect.x - cat.rect.x, offset, 'carried horizontally');
  assert.equal(box.rect.y + box.rect.height, cat.rect.y, 'still on the head');
});

test('determinism (240 frames): two runtimes with a box on a head, same inputs, identical cats and boxes', () => {
  const make = () => {
    const game = loadStage('stage_jump02', 3);
    place(game.players[0], 1300, FLOOR_Y(game.players[0])); place(game.players[1], 900, FLOOR_Y(game.players[1]));
    boxOnHead(game.pushBoxes[0], game.players[0]);
    return game;
  };
  const a = make(), b = make();
  const snap = (game) => JSON.stringify([game.players.map((p) => p.rect), game.pushBoxes.map((box) => [box.rect, box.falling])]);
  for (let frame = 0; frame < 240; frame++) {
    const phase = frame % 80;
    const input = phase < 10 ? IDLE : phase === 10 ? JUMP : phase < 20 ? { ...IDLE, jump: true } : phase < 50 ? RIGHT : { ...IDLE, left: true };
    step(a, 1, [input, IDLE]); step(b, 1, [input, IDLE]);
    assert.equal(snap(a), snap(b), 'frame ' + frame);
  }
});

// 1-4 (stage_weight01): the WeightedLift at x 2292 (travel -192: it rises when loaded) needs two cats.
// (The other one, at x 1307, starts inside the stage's MoveWall, so cats placed there are stuck.)
test('1-4: a cat standing on a cat on the lift counts, and both ride the slab up', () => {
  const game = loadStage('stage_weight01');
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'WeightedLift' && entry.params.travel < 0);
  const [base, top] = game.players;
  const startY = lift.rect.y;
  place(base, lift.rect.x + 19, startY - base.rect.height - 10);
  place(top, base.rect.x, base.rect.y - top.rect.height - 10);
  step(game, 40);
  assert.ok(lift.rect.y < startY - 10, 'the lift rose with two stacked cats: ' + (lift.rect.y - startY));
  assert.ok(Math.abs(base.rect.y + base.rect.height - lift.rect.y) <= 0.5, 'the base cat rides the slab');
  assert.ok(Math.abs(top.rect.y + top.rect.height - base.rect.y) <= 1, 'the top cat rides the base cat: '
    + (top.rect.y + top.rect.height - base.rect.y));
});

test('1-4: one cat alone does not move the two-cat lift (threshold unchanged)', () => {
  const game = loadStage('stage_weight01');
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'WeightedLift' && entry.params.travel < 0);
  const [base, other] = game.players;
  const startY = lift.rect.y;
  place(base, lift.rect.x + 19, startY - base.rect.height - 10); place(other, lift.rect.x - 80, FLOOR_Y(other));
  step(game, 40);
  assert.equal(lift.rect.y, startY);
});

// 1-3: switch pads sit at y 426..442 on the 434 floor, so a box on the floor overlaps them.
test('1-3: a pushed box resting on a switch pad holds the switch down; the box at its spawn does not', () => {
  const game = loadStage('stage_jump02');
  const [cat, other] = game.players;
  place(cat, 100, FLOOR_Y(cat)); place(other, 150, FLOOR_Y(other));
  const pad = game.switches.find((entry) => entry.rect.x === 1384);
  const box = game.pushBoxes[0];
  step(game, 1);
  assert.equal(pad.pressed, false);
  box.applyRect({ ...box.rect, x: pad.rect.x - 4, y: 434 - box.rect.height });
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
  step(game, 2);
  assert.equal(pad.pressed, true, 'a moved, landed box presses the pad');
  box.applyRect({ ...box.rect, x: 2000 });
  step(game, 2);
  assert.equal(pad.pressed, false, 'these pads reset when the box leaves (forceClearPressed)');
});

// Review 2026-10-07 findings (Opus adversarial pass), each reproduced before the fix.
test('1-2: a box left on a cat that dies falls to the ground instead of floating', () => {
  const game = loadStage('stage_push02');
  const [cat, other] = game.players;
  place(cat, 1200, FLOOR_Y(cat)); place(other, 100, FLOOR_Y(other));
  const box = game.pushBoxes[2];
  boxOnHead(box, cat);
  step(game, 2);
  const headY = box.rect.y;
  game.startPlayerDeathSequence(cat);
  step(game, 240);
  assert.ok(box.rect.y > headY + 20, 'the box dropped once its cat died: ' + (box.rect.y - headY));
});

test('10-3: the dark-room lift rises with a cat carrying a box on its head (no jitter)', () => {
  const game = loadStage('stage_darkness01');
  const lift = game.weightedLifts[0];
  const [a, b] = game.players;
  const startY = lift.rect.y;
  // native-player-body: the slab is 48 wide, so only ONE 32-wide cat fits on it (two 26-wide cats used to fit
  // packed edge to edge). The cat plus the 48 x 192 box on its head weigh 2, enough to lift it.
  // Placed touching (no drop gap): 6 units of drop would put the box top 4 into the ceiling (192 > 432 - 6 - 238).
  place(a, lift.rect.x + 8, startY - a.rect.height);
  place(b, lift.rect.x - 200, FLOOR_Y(b));
  const box = game.pushBoxes[0];
  box.applyRect({ ...box.rect, x: lift.rect.x, y: startY - a.rect.height - box.rect.height });
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
  step(game, 90);
  // Without the fix the slab flips between 431 and 432 forever. The ceiling is 240 above the slab at rest, so the
  // stack (46-tall cat + 192 box = 238) lets it rise exactly 240 - 238 = 2 (the 34-tall cat allowed ~14).
  assert.equal(lift.rect.y, startY - 2, 'the lift rose to the ceiling stop: ' + (lift.rect.y - startY));
  const held = lift.rect.y;
  for (let frame = 0; frame < 30; frame++) {
    step(game, 1);
    assert.equal(lift.rect.y, held, 'no jitter (frame ' + frame + ')');
  }
  assert.ok(Math.abs(box.rect.y + box.rect.height - a.rect.y) <= 0.5, 'the box is still on the head');
});

test('1-3: a box resting on two cats: the cat that jumps stays put and the shared box hops and lands back', () => {
  const game = loadStage('stage_jump02');
  const [a, b] = game.players;
  place(a, 1290, 432 - a.rect.height); place(b, 1316, 432 - b.rect.height);
  step(game, 20);
  const box = game.pushBoxes[0];
  box.applyRect({ ...box.rect, x: 1296, y: a.rect.y - box.rect.height }); box.falling = false; box.velocityY = 0; box.wasSupported = true;
  step(game, 5);
  const rest = { a: a.rect.y, b: b.rect.y, box: box.rect.y };
  let apex = 0;
  for (let f = 0; f < 60; f++) {
    step(game, 1, [IDLE, f === 0 ? JUMP : f < 6 ? { ...IDLE, jump: true } : IDLE]);
    assert.equal(b.rect.y, rest.b, 'the jumping cat stays (frame ' + f + ')');
    assert.ok(b.rect.y >= box.rect.y + box.rect.height - 0.5, 'never inside the box');
    apex = Math.max(apex, rest.box - box.rect.y);
  }
  assert.ok(Math.abs(apex - 22) <= 1, 'the shared box hops 22: ' + apex);
  assert.ok(Math.abs(box.rect.y - rest.box) < 1e-4, 'and lands back on both heads');
});


// Codex review (2026-10-07): a lift -> cat -> cat -> box stack lost the box carry (only the cat DIRECTLY
// under a box was checked). The carrier is now found transitively down the frame-start support chain,
// as the native recursive displacement (FUN_7ff72bc17330 / FUN_7ff72bc16780) moves the whole stack.
// 1-4's lift is the one that demonstrably rises with stacked cats, but the stage has no push box, so a
// 1-3-shaped PushBox row (40 x 50) is spawned through the runtime's own handler. (10-3's only box is
// 48 x 192 and is jammed against the ceiling once stacked on two cats; 2-4's lift does not move for 2.)
test('lift -> cat -> cat -> box: the whole stack rides the rising slab together with no penetration', () => {
  const game = loadStage('stage_weight01');
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'WeightedLift' && entry.params.travel < 0);
  const [base, top] = game.players;
  const startY = lift.rect.y;
  place(base, lift.rect.x + 19, startY - base.rect.height);
  place(top, base.rect.x, base.rect.y - top.rect.height);
  const x = top.rect.x + top.rect.width / 2, y = top.rect.y;
  game.spawnHandlers.PushBox({ raw: [0, 0, 'PushBox', '', x, y, 10, 40, 50], actorName: 'PushBox', label: '', x, y });
  const box = game.pushBoxes.at(-1);
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
  assert.equal(box.rect.y + box.rect.height, top.rect.y, 'the box starts on the top cat');
  let rose = 0;
  for (let frame = 0; frame < 60; frame++) {
    step(game);
    rose = Math.max(rose, startY - lift.rect.y);
    const gap = top.rect.y - (box.rect.y + box.rect.height);
    assert.ok(gap >= -0.5, 'frame ' + frame + ': the box never sinks into the top cat (' + gap + ')');
    assert.ok(gap <= 0.5, 'frame ' + frame + ': the box stays seated on the top cat (' + gap + ')');
    assert.ok(Math.abs(top.rect.y + top.rect.height - base.rect.y) <= 1, 'frame ' + frame + ': the top cat rides the base cat');
  }
  assert.ok(rose > 10, 'the slab rose with the stack: ' + rose);
  assert.equal(box.falling, false);
});

// Codex review (head hop): on a RISING lift the cats move before the hand-off check, so "what is on my head"
// is read from frame-start positions. The box hops relative to the moving stack and settles back on it.
test('rising lift: a cat with a box on its head (via the cat it carries) presses jump: the box hops, the cats ride the slab', () => {
  const game = loadStage('stage_weight01');
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'WeightedLift' && entry.params.travel < 0);
  const [base, top] = game.players;
  place(base, lift.rect.x + 19, lift.rect.y - base.rect.height);
  place(top, base.rect.x, base.rect.y - top.rect.height);
  const x = top.rect.x + top.rect.width / 2, y = top.rect.y;
  game.spawnHandlers.PushBox({ raw: [0, 0, 'PushBox', '', x, y, 10, 40, 50], actorName: 'PushBox', label: '', x, y });
  const box = game.pushBoxes.at(-1);
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
  step(game, 10);
  const liftBefore = lift.rect.y;
  step(game, 1);
  assert.ok(lift.rect.y < liftBefore, 'the lift is rising when the jump is pressed');
  let maxGap = 0;
  for (let frame = 0; frame < 40; frame++) {
    step(game, 1, [frame === 0 ? JUMP : IDLE, IDLE]);
    assert.ok(Math.abs(base.rect.y + base.rect.height - lift.rect.y) <= 0.5, 'the jumping cat stays on the slab (frame ' + frame + ')');
    assert.ok(Math.abs(top.rect.y + top.rect.height - base.rect.y) <= 1, 'the top cat rides the base cat (frame ' + frame + ')');
    const gap = top.rect.y - (box.rect.y + box.rect.height);
    assert.ok(gap >= -0.5, 'the box never sinks into the top cat (frame ' + frame + ')');
    maxGap = Math.max(maxGap, gap);
  }
  assert.ok(maxGap > 5, 'the box hopped off the head relative to the rising stack: ' + maxGap);
  assert.ok(Math.abs(top.rect.y - (box.rect.y + box.rect.height)) <= 0.5, 'and it is back on the head');
  assert.equal(box.falling, false);
});

// Codex review (head hop): a hop cut short by a low ceiling settles straight back onto the head (in contact),
// so the next press hops again instead of starting a real cat jump into the box.
// Headrooms found to leave the box hovering 0.4-0.9 above the head in 1-2 before the fix (and one in 1-3).
test('low ceiling: a truncated hop settles back in contact on the head; the next press hops again; the cat never rises', () => {
  const cases = [['stage_jump02', 0.7], ['stage_jump02', 1.5], ['stage_jump02', 10],
    ['stage_push02', 8.34], ['stage_push02', 9.08], ['stage_push02', 16.48], ['stage_push02', 21.66]];
  for (const [source, headroom] of cases) {
    const game = loadStage(source);
    const [cat, other] = game.players;
    place(cat, source === 'stage_jump02' ? 1300 : 1200, 432 - cat.rect.height);
    place(other, source === 'stage_jump02' ? 900 : 100, 432 - other.rect.height);
    step(game, 20);
    const box = source === 'stage_jump02' ? game.pushBoxes[0] : game.pushBoxes[2];
    boxOnHead(box, cat); step(game, 5);
    // A solid just above the box (headroom less than the box's own height): Rect rows are left-bottom anchored.
    const cx = box.rect.x - 10, cy = box.rect.y - headroom;
    game.spawnHandlers.Rect({ raw: [0, 0, 'Rect', '', cx, cy, box.rect.width + 20, 20], actorName: 'Rect', label: '', x: cx, y: cy });
    const rest = { catY: cat.rect.y, boxY: box.rect.y };
    const where = source + ' headroom ' + headroom;
    for (const press of [1, 2]) {
      for (let frame = 0; frame < 60; frame++) {
        step(game, 1, [frame === 0 ? JUMP : IDLE, IDLE]);
        assert.equal(cat.rect.y, rest.catY, where + ' press ' + press + ': the cat never rises (frame ' + frame + ')');
        assert.ok(rest.boxY - box.rect.y <= headroom + 1e-6, where + ': the ceiling caps the hop');
      }
      assert.ok(Math.abs(box.rect.y - rest.boxY) < 1e-4, where + ' press ' + press + ': back in contact on the head: ' + (rest.boxY - box.rect.y));
      assert.equal(box.falling, false, where + ' press ' + press);
    }
  }
});
