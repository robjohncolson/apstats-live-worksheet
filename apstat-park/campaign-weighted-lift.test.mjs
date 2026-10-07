// native-weighted-lift (scripts/pico-campaign-patches.mjs), teacher 2026-10-07: "please study the behaviour of the
// other two platforms" (1-4). Decompile og-capture-2/wlift/decomp/wlift.md:
//   rows (stage_weight01): {0,-4|5, WeightedLift, 1339, 173, 192, 70} (party-size variants of ONE lift: column 1
//   is the spawn filter, FUN_7ff72bc2a1a0) and {0,0, WeightedLift, 2324, 336, -192, -2}; independent lifts.
//   FUN_7ff72bb63cf0 wide body {x-92, y+67, 194, 18}; FUN_7ff72bb72ae0 travel p0 + p2 n, required
//   max(p3 or 2, ceil(p1/100 n)) when p1 > 0 else max(2, ceil(0.2 n)), p4 > 0 = no auto-return, return step
//   1 + p5 max(0, n-2); FUN_7ff72bb64310 1 unit per tick, counts cats and push boxes recursively, 0.06 s freeze
//   while anything touches the underside; FUN_7ff72bb64640 the sign shows max(0, required - count).
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
const FLOOR = 432;

function loadStage(source, seed = 1, partySize = 2) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(entry.data, 720, 750, { partySize, simplifyPassivePlaceholders: false });
  return game;
}
function step(game, frames = 1, inputs = [IDLE, IDLE]) {
  for (let i = 0; i < frames; i++) game.update(1 / 60, inputs[0], inputs);
}
function place(player, x, y) { player.applyResolvedCollision({ ...player.rect, x, y }, { x: 0, y: 0 }, true); }
const plain = (game) => game.weightedLifts.filter((lift) => lift.spawn.actorName === 'WeightedLift');
function liftsOf14() {
  const game = loadStage('stage_weight01');
  const [A, B] = plain(game);
  return { game, A, B, cats: game.players };
}
// Cats stand on the slab centre (the wide body is 194 across).
const onSlab = (cat, lift, dx = 0) => place(cat, lift.rect.x + 84 + dx, lift.rect.y - cat.rect.height);
function trace(game, lift, frames, inputs) {
  const ys = [];
  for (let f = 0; f < frames; f++) { step(game, 1, inputs); ys.push(lift.rect.y); }
  return ys;
}
function spawnBox(game, x, feetY) {
  game.spawnHandlers.PushBox({ raw: [0, 0, 'PushBox', '', x, feetY, 10, 40, 50], actorName: 'PushBox', label: '', x, y: feetY });
  const box = game.pushBoxes.at(-1);
  box.falling = false; box.velocityY = 0; box.wasSupported = true;
  return box;
}

test('1-4 rects are the decoded native bodies; one lift per party-size row pair; independent lifts', () => {
  const two = loadStage('stage_weight01');
  const lifts = plain(two);
  assert.equal(lifts.length, 2, 'two plain WeightedLifts for a 2-player party (the -4 variant + the 2324 lift)');
  assert.deepEqual(lifts.map((lift) => ({ ...lift.rect })), [
    { x: 1339 - 92, y: 173 + 67, width: 194, height: 18 },
    { x: 2324 - 92, y: 336 + 67, width: 194, height: 18 },
  ]);
  assert.deepEqual(lifts.map((lift) => lift.spawn.raw[1]), [-4, 0]);
  const five = plain(loadStage('stage_weight01', 1, 5));
  assert.deepEqual(five.map((lift) => lift.spawn.raw[1]), [5, 0], 'a 5-player party gets the other variant');
});

test('1-4: one cat on a lift does not move it (sign 1); one cat on EACH lift moves neither (independent)', () => {
  const { game, A, B, cats: [a, b] } = liftsOf14();
  onSlab(a, A); onSlab(b, B);
  const ys = [A.rect.y, B.rect.y];
  step(game, 120);
  assert.deepEqual([A.rect.y, B.rect.y], ys);
  assert.deepEqual([A.signText.text, B.signText.text], ['1', '1']);
});

test('1-4: two stacked cats move lift A down exactly 1 unit per tick to its 192 travel (top 432), sign 0; unloaded it returns 1 per tick', () => {
  const { game, A, cats: [a, b] } = liftsOf14();
  onSlab(a, A); place(b, a.rect.x, a.rect.y - b.rect.height);
  const down = trace(game, A, 220);
  const deltas = down.map((y, i) => y - (i ? down[i - 1] : 240));
  const moving = deltas.filter((d) => d !== 0);
  assert.ok(moving.length >= 190 && moving.every((d) => Math.abs(d - 1) < 1e-9), 'down 1 per tick: ' + [...new Set(moving)]);
  assert.equal(A.rect.y, 240 + 192, 'stops at full travel (top flush with the floor)');
  assert.equal(A.signText.text, '0');
  place(a, 1150, 206); place(b, 1180, 206);   // both leave (onto the left ledge)
  const up = trace(game, A, 220);
  const upDeltas = up.map((y, i) => y - (i ? up[i - 1] : 432)).filter((d) => d !== 0);
  assert.ok(upDeltas.every((d) => Math.abs(d + 1) < 1e-9), 'returns 1 per tick: ' + [...new Set(upDeltas)]);
  assert.equal(A.rect.y, 240, 'back at rest, flush with the ledges');
});

test('1-4: lift B rises with two cats side by side (travel -192) and the riders ride it up', () => {
  const { game, B, cats: [a, b] } = liftsOf14();
  onSlab(a, B, -40); onSlab(b, B, 40);
  step(game, 200);
  assert.equal(B.rect.y, 403 - 192);
  for (const cat of [a, b]) assert.ok(Math.abs(cat.rect.y + cat.rect.height - B.rect.y) <= 0.5, 'riding');
});

test('1-4: a push box weighs one: a cat plus a box on lift A move it; a box on a cat on the lift counts too', () => {
  for (const onCat of [false, true]) {
    const { game, A, cats: [a, b] } = liftsOf14();
    place(b, 1150, 206);
    onSlab(a, A);
    const box = onCat ? spawnBox(game, a.rect.x + 13, a.rect.y) : spawnBox(game, A.rect.x + 160, A.rect.y);
    step(game, 60);
    assert.ok(A.rect.y > 240 + 30, (onCat ? 'box on the cat' : 'box beside the cat') + ': the lift went down: ' + A.rect.y);
    assert.equal(A.signText.text, '0');
    assert.ok(box.rect.y + box.rect.height <= (onCat ? a.rect.y : A.rect.y) + 0.5, 'the box rode along');
  }
});

// Codex review: the weight counts a box on a box, so the lift must carry the whole stack (it used to carry only the
// bottom box: contact broke, the sign flipped 0/1 and the lift oscillated by one unit).
for (const [name, build] of [
  ['box on box', (game, A, [a, b]) => { place(a, 1150, 206); place(b, 1180, 206);
    const low = spawnBox(game, A.rect.x + 77, A.rect.y); return [low, spawnBox(game, low.rect.x + 20, low.rect.y)]; }],
  ['cat on box', (game, A, [a, b]) => { place(b, 1150, 206);
    const low = spawnBox(game, A.rect.x + 77, A.rect.y); place(a, low.rect.x + 7, low.rect.y - a.rect.height); return [low, a]; }],
]) {
  test(`1-4: ${name} on lift A: it descends 1 per tick to full travel with the whole stack riding; the sign stays 0`, () => {
    const { game, A, cats } = liftsOf14();
    const [lower, upper] = build(game, A, cats);
    step(game, 1);
    let previous = A.rect.y;
    for (let frame = 0; frame < 200; frame++) {
      step(game);
      const d = A.rect.y - previous; previous = A.rect.y;
      assert.ok(A.rect.y === 432 || Math.abs(d - 1) < 1e-9, 'smooth 1 per tick (frame ' + frame + '): ' + d);
      assert.equal(A.signText.text, '0', 'sign stays 0 (frame ' + frame + ')');
      assert.ok(Math.abs(lower.rect.y + lower.rect.height - A.rect.y) <= 0.5, 'lower box on the slab (frame ' + frame + ')');
      assert.ok(Math.abs(upper.rect.y + upper.rect.height - lower.rect.y) <= 0.5, 'upper body on the lower box (frame ' + frame + ')');
    }
    assert.equal(A.rect.y, 432, 'reached full travel');
  });
}

test('freeze: a cat touching the underside stops a loaded, rising lift; it resumes 0.06 s (4 ticks) after the contact ends', () => {
  const { game, B, cats: [a, b] } = liftsOf14();
  onSlab(a, B, -40); onSlab(b, B, 40);
  step(game, 60);
  const y = B.rect.y;
  // A third cat is not available: spawn a box on a pillar so its top touches the slab underside.
  const bottom = B.rect.y + B.rect.height;
  game.spawnHandlers.Rect({ raw: [0, 0, 'Rect', '', 2400, FLOOR, 20, FLOOR - bottom - 50], actorName: 'Rect', label: '', x: 2400, y: FLOOR });
  const box = spawnBox(game, 2410, bottom + 50);
  assert.equal(box.rect.y, bottom, 'set-up: the box top touches the slab underside');
  const held = trace(game, B, 20);
  assert.ok(held.every((v) => v === y), 'frozen while touched: ' + held);
  box.applyRect({ ...box.rect, x: 3000 });
  const after = trace(game, B, 8);
  const resumed = after.findIndex((v) => v !== y);
  assert.ok(resumed >= 3 && resumed <= 4, 'resumes after the 0.06 s timer: tick ' + resumed);
});

test('row options: p4 > 0 disables auto-return; p5 adds p5 max(0, n-2) to the return step (party of 4)', () => {
  const game = loadStage('stage_weight01', 1, 4);
  const [a, b, c, d] = game.players;
  for (const [name, flags, party] of [['no-return', [0, 0, 1], 4], ['p5', [0, 0, 0, 0.5], 4]]) {
    const x = 400, y = 250;
    game.spawnHandlers.WeightedLift({ raw: [0, 0, 'WeightedLift', '', x, y, 100, 100, ...flags], actorName: 'WeightedLift', label: '', x, y });
    const lift = game.weightedLifts.at(-1);
    assert.deepEqual({ ...lift.rect }, { x: x - 92, y: y + 67, width: 194, height: 18 });
    // required = max(2, ceil(100% of 4)) = 4
    [a, b, c, d].forEach((cat, i) => place(cat, lift.rect.x + 4 + i * 46, lift.rect.y - cat.rect.height));
    step(game, 120);
    assert.equal(lift.rect.y, y + 67 + 100, name + ': full travel with 4 cats');
    [a, b, c, d].forEach((cat, i) => place(cat, 100 + i * 30, FLOOR - cat.rect.height));
    const ys = trace(game, lift, 10);
    if (name === 'no-return') assert.ok(ys.every((v) => v === y + 67 + 100), 'stays down: ' + ys);
    else assert.ok(Math.abs((ys[0] - ys[5]) / 5 - 2) < 1e-9, 'returns 1 + 0.5 * 2 = 2 per tick: ' + ys);
    game.weightedLifts.pop(); lift.view.destroy();
    void party;
  }
});

test('determinism (240 frames): two 1-4 runtimes loading, riding and leaving both lifts, identical state', () => {
  const make = () => { const g = liftsOf14(); onSlab(g.cats[0], g.A); onSlab(g.cats[1], g.A, 30); return g.game; };
  const g1 = make(), g2 = make();
  const snap = (game) => JSON.stringify([game.players.map((p) => p.rect), plain(game).map((l) => l.rect)]);
  for (let frame = 0; frame < 240; frame++) {
    const input = [frame % 90 === 0 ? JUMP : frame > 150 && frame < 160 ? RIGHT : IDLE, frame % 70 === 5 ? JUMP : IDLE];
    step(g1, 1, input); step(g2, 1, input);
    assert.equal(snap(g1), snap(g2), 'frame ' + frame);
  }
});

test('every campaign stage: plain WeightedLifts load as the decoded wide bodies and stay within [rest, rest + travel] (360 frames)', () => {
  let count = 0;
  for (const entry of runtime.stages) {
    const game = loadStage(entry.source);
    const lifts = plain(game);
    const rest = lifts.map((lift) => ({ ...lift.rect }));
    lifts.forEach((lift, i) => {
      count += 1;
      if (entry.source === 'stage_jump01') return;   // 1-1 keeps its verified 184 x 19 slab (campaign-jump01.mjs)
      assert.deepEqual(rest[i], { x: lift.spawn.x - 92, y: lift.spawn.y + 67, width: 194, height: 18 }, entry.source);
    });
    for (let frame = 0; frame < 360; frame++) {
      const phase = frame % 120;
      step(game, 1, [phase < 60 ? RIGHT : { ...IDLE, left: true }, frame % 50 === 0 ? JUMP : IDLE]);
      lifts.forEach((lift, i) => {
        const travel = lift.params.travel + (lift.params.numericFlags[0] ?? 0) * game.players.length;
        const lo = Math.min(rest[i].y, rest[i].y + travel), hi = Math.max(rest[i].y, rest[i].y + travel);
        assert.ok(lift.rect.y >= lo - 1e-6 && lift.rect.y <= hi + 1e-6, entry.source + ' frame ' + frame + ': ' + lift.rect.y);
        assert.deepEqual([lift.rect.x, lift.rect.width, lift.rect.height], [rest[i].x, rest[i].width, rest[i].height]);
      });
    }
  }
  assert.ok(count >= 6, 'plain WeightedLifts checked: ' + count);
});
