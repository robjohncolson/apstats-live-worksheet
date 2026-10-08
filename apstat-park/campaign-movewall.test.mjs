// native-movewall + native-lift-and-ledge-look (scripts/pico-campaign-patches.mjs), teacher 2026-10-07 on 1-4:
// "the platforms aren't orange like the real one, and the moving door/wall is HUGE".
// Decompile (og-capture-2/look14/decomp/look.md): MoveWall row {x, y, p0, p1, p2} -> FUN_7ff72bb664e0(trunc(p0),
// trunc(p1), p2): travel p0, sensor width p1, height c = p2; body {x-8, y-c+1, 16, c-2}; spawns idle (state 0) and
// starts only on a sensor begin-contact once its timer reaches 1.5 s; then slides 2/tick past |travel|, waits 1.5 s,
// returns 1.5/tick to 0, waits 1.5 s, cycles (FUN_7ff72bb66be0, FUN_7ff72bb667e0). UpDownLift body {-59,-9,118,18}
// (FUN_7ff72bb6d980). Retail 1-4: the wall never moved while both cats stayed on the floor.
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
function step(game, frames = 1, inputs = [IDLE, IDLE]) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, inputs[0], inputs);
}
function place(player, x, y) { player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true); }
// The row decode, written out independently of the runtime.
function decode(raw, x, y) {
  const at = raw.findIndex((value, index) => value === x && raw[index + 1] === y);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const p2 = num(raw[at + 4]);
  const c = p2 > 0 ? p2 : 260;
  return { body: { x: x - 8, y: y - c + 1, width: 16, height: c - 2 }, travel: Math.trunc(num(raw[at + 2])) || 50 };
}

test('1-4 actor rects equal the decoded native values: MoveWall pillar 1488..1504 x 49..239; UpDownLift 118 x 18 at (917, 336)', () => {
  const game = loadStage('stage_weight01');
  const [wall] = game.moveWalls;
  assert.deepEqual(wall.spawn.raw.slice(4), [1496, 240, -459, -483, 192]);
  assert.deepEqual({ ...wall.rect }, { x: 1488, y: 49, width: 16, height: 190 });
  const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'UpDownLift');
  assert.deepEqual({ ...lift.rect }, { x: 917 - 59, y: 336 - 9, width: 118, height: 18 });
  // One orange slab, no guide line. (jsdom loads no atlas, so this is the orange fallback; the atlas sprite
  // {-60, -10, 120, 20} is checked in Chrome by campaign-look14-browser-smoke.mjs.)
  assert.equal(lift.view.children.length, 1);
});

test('1-4 (retail): with both cats on the floor the MoveWall never moves (600 frames)', () => {
  const game = loadStage('stage_weight01');
  const [wall] = game.moveWalls;
  const [a, b] = game.players;
  // native-player-body: standing on the 432 floor = rect.y 432 - 46 (the 34-tall cat used 398).
  place(a, 820, 432 - a.rect.height); place(b, 900, 432 - b.rect.height);
  const start = { ...wall.rect };
  for (let frame = 0; frame < 600; frame++) {
    step(game, 1, [frame % 60 === 0 ? JUMP : IDLE, IDLE]);
    assert.deepEqual({ ...wall.rect }, start, 'frame ' + frame);
  }
});

test('1-4: a cat walking into the sensor starts the native cycle: 2/tick out past |travel|, 1.5 s wait, 1.5/tick back, 1.5 s wait, again', () => {
  const game = loadStage('stage_weight01');
  const [wall] = game.moveWalls;
  const [a, b] = game.players;
  // On the row-5 ledge (x 1008..1248, top 240). The sensor starts at 1496 - 483 + 10 = 1023: cat a stands on the
  // ledge's left end just outside it (990..1022 with the native 32-wide body), cat b inside it from load
  // (no begin-contact, timer < 1.5 s). Standing on the 240 ledge = rect.y 240 - 46 (native-player-body).
  place(a, 990, 240 - a.rect.height); place(b, 1040, 240 - b.rect.height);
  step(game, 5);
  const x0 = wall.rect.x;
  assert.equal(x0, 1488);
  // b began inside the sensor at load (no begin-contact) and the timer was < 1.5 s: nothing.
  step(game, 120);
  assert.equal(wall.rect.x, x0, 'no begin-contact after the 1.5 s gate yet: idle');
  // a walks right into the sensor band: a begin-contact with the timer past 1.5 s.
  const xs = [];
  for (let frame = 0; frame < 900; frame++) {
    step(game, 1, [frame < 8 ? RIGHT : IDLE, IDLE]);
    xs.push(wall.rect.x);
  }
  const deltas = xs.map((x, i) => Math.round((x - (i ? xs[i - 1] : x0)) * 1000) / 1000);
  const firstMove = deltas.findIndex((d) => d !== 0);
  assert.ok(firstMove >= 0 && firstMove < 10, 'it started when the cat touched the sensor: ' + firstMove);
  const out = deltas.slice(firstMove, firstMove + 230);
  assert.ok(out.every((d) => d === -2), 'slides out 2 per tick: ' + [...new Set(out)]);
  assert.equal(Math.min(...xs), x0 - 460, 'stops once past |travel| = 459 (offset -460)');
  const atOut = xs.indexOf(x0 - 460);
  const wait1 = xs.slice(atOut).findIndex((x) => x !== x0 - 460);
  assert.ok(Math.abs(wait1 - 90) <= 1, 'waits 1.5 s (90 ticks): ' + wait1);
  const back = deltas.slice(atOut + wait1, atOut + wait1 + 300).filter((d) => d !== 0);
  assert.ok(back.slice(0, -1).every((d) => d === 1.5), 'returns 1.5 per tick: ' + [...new Set(back)]);
  assert.ok(xs.slice(atOut + wait1).includes(x0), 'back to its spawn x');
  assert.ok(xs.slice(atOut + wait1 + 320).some((x) => x < x0), 'and starts its next cycle on its own');
});

test('every campaign stage: MoveWall rects are the decoded 16-wide pillars, move only in x, and stay finite (360 frames)', () => {
  let walls = 0;
  for (const entry of runtime.stages) {
    const game = loadStage(entry.source);
    const decoded = game.moveWalls.map((wall) => decode(wall.spawn.raw, wall.spawn.x, wall.spawn.y));
    game.moveWalls.forEach((wall, i) => assert.deepEqual({ ...wall.rect }, decoded[i].body, entry.source + ' wall ' + i));
    walls += decoded.length;
    for (let frame = 0; frame < 360; frame++) {
      const phase = frame % 120;
      step(game, 1, [phase < 60 ? RIGHT : { ...IDLE, left: true }, frame % 50 === 0 ? JUMP : IDLE]);
      game.moveWalls.forEach((wall, i) => {
        const body = decoded[i].body;
        assert.ok(Number.isFinite(wall.rect.x), entry.source + ' frame ' + frame);
        assert.deepEqual([wall.rect.y, wall.rect.width, wall.rect.height], [body.y, body.width, body.height], entry.source + ' frame ' + frame);
        assert.ok(Math.abs(wall.rect.x - body.x) <= Math.abs(decoded[i].travel) + 2, entry.source + ': within its travel at frame ' + frame);
      });
    }
  }
  assert.ok(walls >= 1, 'stages with MoveWalls were checked: ' + walls);
});

test('determinism (240 frames): two 1-4 runtimes with a cat triggering the MoveWall, identical state', () => {
  const make = () => {
    const game = loadStage('stage_weight01', 4);
    place(game.players[0], 1008, 240 - game.players[0].rect.height); place(game.players[1], 900, 432 - game.players[1].rect.height);
    return game;
  };
  const a = make(), b = make();
  const snap = (game) => JSON.stringify([game.players.map((p) => p.rect), game.moveWalls.map((w) => w.rect), game.weightedLifts.map((l) => l.rect)]);
  for (let frame = 0; frame < 240; frame++) {
    const input = [frame > 100 && frame < 110 ? RIGHT : IDLE, frame % 70 === 0 ? JUMP : IDLE];
    step(a, 1, input); step(b, 1, input);
    assert.equal(snap(a), snap(b), 'frame ' + frame);
  }
});
