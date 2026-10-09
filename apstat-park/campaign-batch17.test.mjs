// Batch 17 (scripts/pico-campaign-patches.mjs 'native-camera' + campaign-engine.mjs campaignProjection): the native
// follow camera. One horizontal scroll value, no zoom, no vertical follow (projection FUN_7ff72bc1a830 translates y by
// a literal 0): the Desk shows the whole band y 0..720/scale; mode 1 snaps to the group at frame 0 then eases 10 % of
// the gap at most 3 px per tick; mode 2 advances min(speed, room) and stops while a cat dies; walking cats stay on the
// screen; the auto-scroll left edge carries cats and kills one pinned behind it; planes ride the auto-scroll.
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

const { loadStage, STAGES, IDLE } = await import('./campaign-solve/driver.mjs');
const { campaignProjection, campaignSpawnFloor, nativeScreen } = await import('./campaign-engine.mjs');
const PARTIES = [2, 4, 8];
const CANVAS_H = 750;
const EPS = 1e-9;

/** Inputs for one tick: buttons[i] is a partial button set for cat i, placed at its input slot. */
function inputsFor(run, buttons = []) {
  const game = run.game;
  run.held ||= [];
  const inputs = Array.from({ length: 8 }, () => IDLE);
  game.players.forEach((cat, i) => {
    const slot = game.playerInputSlots[i] ?? i;
    const spec = { ...IDLE, ...(buttons[i] || {}) };
    const prev = run.held[slot] || {};
    inputs[slot] = { ...spec, jumpPressed: spec.jump && !prev.jump, upPressed: spec.up && !prev.up };
  });
  run.held = inputs;
  return inputs;
}
const tick = (run, buttons) => run.tick(inputsFor(run, buttons));
const stageOf = (tag) => STAGES.find((stage) => stage.tag === tag);
const load = (tag, party = 2) => loadStage(stageOf(tag).source, party, 1);
const centre = (cat) => cat.rect.x + cat.rect.width / 2;
const viewWidth = (game) => 1280 / game.scrollCameraConfig.scale;
const scrollOf = (game) => game.scrollCameraState.scroll;
const dying = (game, cat) => cat.deathTimer > 0 || game.deathFallPlayers.has(cat);

// Frame-0 left edge of the native view (FUN_7ff72bb7b9c0 snap for mode 1, 0 for modes 0 / 2), decoded per stage and
// party in scratchpad b17/camera (table.md), rounded to whole px: parties 2 / 4 / 8.
const NATIVE_X = {"1-1":[0,0,0],"1-2":[0,0,28],"1-3":[0,0,0],"1-4":[0,0,0],"2-1":[0,0,0],"2-2":[0,0,0],"2-3":[0,0,48],
  "2-4":[0,0,0],"3-1":[437,437,437],"3-2":[0,41,53],"3-3":[0,0,0],"3-4":[0,0,0],"4-1":[0,0,0],"4-2":[0,0,0],"4-3":[0,0,0],
  "4-4":[0,0,0],"5-1":[0,0,0],"5-2":[0,0,0],"5-3":[0,0,0],"5-4":[0,0,0],"6-1":[0,0,0],"6-2":[0,0,0],"6-3":[0,0,0],
  "6-4":[0,0,0],"7-1":[0,0,0],"7-2":[0,0,0],"7-3":[0,0,48],"7-4":[0,0,0],"8-1":[0,0,0],"8-2":[0,0,0],"8-3":[0,0,0],
  "8-4":[0,0,0],"9-1":[0,0,0],"9-2":[0,0,0],"9-3":[0,0,0],"9-4":[0,0,0],"10-1":[0,0,0],"10-2":[0,0,0],"10-3":[0,0,0],
  "10-4":[0,0,0],"11-1":[0,0,0],"11-2":[0,0,0],"11-3":[0,0,0],"11-4":[0,0,0],"12-1":[0,0,0],"12-2":[0,0,77],
  "12-3":[0,0,0],"12-4":[0,0,0]};

test('native-camera frame 0: the runtime view equals the decoded native view for every stage at parties 2 / 4 / 8', () => {
  for (const stage of STAGES) {
    PARTIES.forEach((party, p) => {
      const { game, definition } = loadStage(stage.source, party, 1);
      const label = `${stage.tag} party ${party}`;
      const mode = definition.autoScroll ? 2 : definition.scrollable ? 1 : 0;
      assert.equal(game.scrollCameraConfig.mode, mode, label + ': mode from autoScroll / scrollable (FUN_7ff72bb7a9b0)');
      // No zoom: the view is 1280 / scale wide whatever the party.
      assert.equal(viewWidth(game), 1280 / (definition.scale || 1), label);
      assert.equal(Math.round(scrollOf(game)), NATIVE_X[stage.tag][p], label + ': frame-0 left edge');
      assert.equal(game.scrollCameraState.accum, 1, label + ': the follow accumulator starts at 1.0');
    });
  }
});

test('presentation: the whole native band y 0..720/scale is on the 750-px canvas at frame 0 (every stage, 2 / 4 / 8)', () => {
  for (const stage of STAGES) {
    for (const party of PARTIES) {
      const { definition } = loadStage(stage.source, party, 1);
      const floor = campaignSpawnFloor(definition);
      const placed = campaignProjection(definition, floor, 720, 0);
      const band = Math.min(720 / (definition.scale || 1), definition.map.height * definition.map.chipSize);
      const label = `${stage.tag} party ${party}`;
      assert.ok(placed.y >= 0, `${label}: band top at canvas y ${placed.y}`);
      assert.ok(placed.y + band * placed.scale <= CANVAS_H + EPS, `${label}: band bottom at canvas y ${placed.y + band * placed.scale}`);
    }
  }
});

test('presentation: the 720 column shows exactly the native screen (1280 x 720 / scale), the clamp rect, at every scale', () => {
  const scales = new Set();
  for (const stage of STAGES) {
    for (const party of PARTIES) {
      const { game, definition } = loadStage(stage.source, party, 1);
      const placed = campaignProjection(definition, campaignSpawnFloor(definition), 720, scrollOf(game));
      const label = `${stage.tag} party ${party}`;
      scales.add(definition.scale || 1);
      // The picture width in world px is the native screen width, the same rect the runtime camera and the walking
      // clamp use (1280 / scale).
      assert.ok(Math.abs(720 / placed.scale - viewWidth(game)) < 1e-9, label);
      assert.ok(Math.abs(nativeScreen(definition).width - viewWidth(game)) < 1e-9, label);
      // The column's left edge is the camera's left edge.
      assert.ok(Math.abs(placed.x + scrollOf(game) * placed.scale) < 1e-9, label);
      // A wider page keeps the scale (more world, faded, on both sides).
      assert.equal(campaignProjection(definition, campaignSpawnFloor(definition), 1000, 0).scale, placed.scale);
    }
  }
  assert.deepEqual([...scales].sort(), [1, 1.5], 'both native scales are covered');
});

test('presentation: a walking cat reaches the right edge of the picture and stops exactly there (1-4 scale 1.5, 3-3 scale 1)', () => {
  for (const tag of ['1-4', '3-3']) {
    const run = load(tag);
    const { game, definition } = run;
    // Cat 1 walks right; the other cat stays (3-3's mode-0 screen does not scroll: the map's own wall is at its edge).
    for (let i = 0; i < 700; i++) tick(run, [{}, { right: true }]);
    const placed = campaignProjection(definition, campaignSpawnFloor(definition), 720, scrollOf(game));
    const cat = game.players[1];
    const canvasX = placed.x + centre(cat) * placed.scale;
    const blockedByMap = game.tileMap.rectHitsSolid({ ...cat.rect, x: cat.rect.x + 1.5 });
    assert.ok(canvasX <= 720 + 1e-6, `${tag}: the cat never leaves the picture (${canvasX})`);
    if (!blockedByMap) assert.ok(canvasX >= 720 - 1e-6, `${tag}: it stops at the picture's right edge, not before (${canvasX})`);
  }
});

test('presentation 2-3: the pit under the row-2 floor is on the canvas at frame 0 and mid-stage', () => {
  const run = load('2-3');
  const { game, definition } = run;
  const chip = definition.map.chipSize;
  const floor = campaignSpawnFloor(definition);
  assert.equal(floor, 96, 'the cats spawn on the row-2 floor');
  const frame0 = campaignProjection(definition, floor, 720, scrollOf(game));
  assert.equal(frame0.y, 750 - 480 * frame0.scale, 'band bottom on the canvas bottom (the old floor anchor put rows 4..9 below it)');
  // Every map row, the bottom one (432..480) included, is on the canvas; rows 4..9 hold the pit's walls.
  assert.ok(Math.abs(frame0.y + definition.map.height * chip * frame0.scale - CANVAS_H) < 1e-9);
  const solidBelow = [];
  for (let row = 4; row < definition.map.height; row++) {
    for (let col = 0; col < definition.map.width; col++) {
      const probe = { x: col * chip + 2, y: row * chip + 2, width: chip - 4, height: chip - 4 };
      if (game.tileMap.rectHitsSolid(probe)) { solidBelow.push(row); break; }
    }
  }
  assert.ok(solidBelow.length >= 4, 'the lower rows hold terrain: ' + solidBelow);
  for (let i = 0; i < 150; i++) tick(run, game.players.map(() => ({ right: true })));
  const later = campaignProjection(definition, floor, 720, scrollOf(game));
  assert.equal(later.y, frame0.y, 'the camera never scrolls vertically (FUN_7ff72bc1a830 y = 0)');
  assert.ok(later.x < frame0.x, 'only the x scroll moves');
});

/** One native mode-1 step (FUN_7ff72bb7c150) with the accumulator at 1: 10 % of the gap, capped at 3. */
function expectedFollow(game, scroll) {
  const xs = game.players.filter((cat) => !cat.parkHelper && !(cat.view.visible === false
    && !game.goalClearedPlayers.has(cat) && !dying(game, cat))).map(centre);
  const W = viewWidth(game);
  const target = Math.max(0, (Math.min(...xs) + Math.max(...xs)) * 0.5 - W * 0.5);
  const gap = (1 + (0.1 - 1) * 1) * (target - scroll);
  const cap = Math.abs(gap) + (3 - Math.abs(gap)) * 1;
  let step = Math.min(cap, Math.max(-cap, gap));
  const room = game.tileMap.pixelWidth - (scroll + W);
  if (Math.abs(step) > 1.1920928955078125e-7) step = Math.min(room, Math.max(-scroll, step));
  return Math.max(0, scroll + step);
}

test('1-1 follow: the camera tracks the midpoint at 10 % of the gap per tick, capped at 3 px; no zoom', () => {
  const run = load('1-1');
  const { game } = run;
  const scale = game.world.scale.x;
  // Cat 1 walks right, the camera follows the pair's midpoint.
  for (let i = 0; i < 240; i++) {
    const before = scrollOf(game);
    tick(run, [{}, { right: true }]);
    assert.ok(Math.abs(scrollOf(game) - expectedFollow(game, before)) < EPS, `tick ${i}`);
    assert.ok(scrollOf(game) - before <= 3 + EPS);
  }
  assert.ok(scrollOf(game) > 0, 'the camera moved');
  // Native has no zoom: the world scale never changes (the coordinator assumed a zoom-out; there is none).
  assert.equal(game.world.scale.x, scale);
});

test('follow cap (1-4): a far jump of the target pans at exactly 3 px per tick until the gap is under 30', () => {
  const run = load('1-4');
  const { game } = run;
  // Cat 1 moved 1000 right on its own floor (test setup): the target jumps ~500 ahead of the camera.
  const cat = game.players[1];
  cat.applyResolvedCollision({ ...cat.rect, x: cat.rect.x + 1000 }, { x: 0, y: 0 }, cat.grounded);
  let capped = 0;
  for (let i = 0; i < 260; i++) {
    const before = scrollOf(game);
    tick(run);
    assert.ok(Math.abs(scrollOf(game) - expectedFollow(game, before)) < EPS, `pan tick ${i}`);
    if (Math.abs(scrollOf(game) - before - 3) < 1e-9) capped++;
  }
  assert.ok(capped >= 50, `the 3 px cap bound for ${capped} ticks`);
});

test('1-4: a walking cat cannot leave the screen, so the pair spreads to at most 1280 / 1.5 (FUN_7ff72bb7b700)', () => {
  for (const party of [2]) {
    const run = load('1-4', party);
    const { game } = run;
    for (let i = 0; i < 420; i++) tick(run, [{}, { right: true }]);
    const [a, b] = game.players;
    const W = viewWidth(game);
    assert.ok(centre(b) - scrollOf(game) <= W + 1e-6, 'the walker stops at the right edge');
    assert.ok(centre(a) - scrollOf(game) >= -1e-6, 'the idle cat stays on the left edge');
    assert.ok(Math.abs(centre(b) - centre(a) - W) < 0.5, `spread ${centre(b) - centre(a)}`);
  }
});

test('auto-scroll 6-2 / 12-4: min(speed, room) per tick, speed + offset * (n - 2), paused while a cat is dying', () => {
  for (const [tag, speed, offset] of [['6-2', 1.0, -0.07], ['12-4', 2.0, -0.04]]) {
    for (const party of PARTIES) {
      const run = load(tag, party);
      const { game } = run;
      const expected = speed + (party - 2) * offset;
      assert.ok(Math.abs(game.scrollCameraConfig.autoScrollSpeed - expected) < 1e-9, `${tag} party ${party}`);
      assert.equal(scrollOf(game), 0, 'mode 2 starts at 0 (FUN_7ff72bb79d40)');
      for (let i = 1; i <= 30; i++) {
        tick(run);
        assert.ok(Math.abs(scrollOf(game) - i * expected) < 1e-6, `${tag} party ${party} tick ${i}`);
      }
      // A fatal hit: the whole state-3 sequence (hold and fall) stops the scroll (FUN_7ff72bb7b610).
      game.startPlayerDeathSequence(game.players[0], game.playerInputSlots[0] ?? 0);
      const held = scrollOf(game);
      for (let i = 0; i < 90 && game.restartFadeSeconds === 0; i++) {
        tick(run);
        if (dying(game, game.players[0])) assert.equal(scrollOf(game), held, `${tag} party ${party}: paused`);
      }
    }
  }
  // autoScrollEndOffset is multiplied by (playerCount - 2) (FUN_7ff72bb7a9b0 lines 148-150): 12-3's right stop moves.
  for (const party of PARTIES) {
    assert.equal(load('12-3', party).game.scrollCameraConfig.autoScrollEndOffset, 150 * (party - 2));
    assert.equal(load('6-2', party).game.scrollCameraConfig.autoScrollEndOffset, 0);
  }
});

test('auto-scroll left edge (6-2): idle cats are carried along, never into a solid; one pinned behind the edge (the Rect) dies and the stage restarts', () => {
  for (const party of PARTIES) {
    const run = load('6-2', party);
    const { game } = run;
    let death = null;
    for (let i = 0; i < 2000 && !death; i++) {
      tick(run);
      game.players.forEach((cat) => {
        if (death || cat.parkHelper) return;
        if (dying(game, cat)) { death = { sx: centre(cat) - scrollOf(game), tick: i }; return; }
        // Never embedded: the edge push goes through the chips + solid-actor sweep (6-2's Rect pins, never swallows).
        const inner = { x: cat.rect.x + 0.5, y: cat.rect.y + 0.5, width: cat.rect.width - 1, height: cat.rect.height - 1 };
        assert.ok(!game.tileMap.rectHitsSolid(inner), `party ${party} tick ${i}: cat inside a chip`);
        for (const block of game.staticRects) {
          const r = block.rect;
          const inside = inner.x < r.x + r.width && r.x < inner.x + inner.width && inner.y < r.y + r.height && r.y < inner.y + inner.height;
          assert.ok(!inside, `party ${party} tick ${i}: cat inside the ${block.spawn.actorName} at ${r.x},${r.y}`);
        }
        // A carried cat never falls more than the death margin (+ one step) behind the edge.
        const margin = (32 - game.scrollCameraConfig.autoScrollSpeed) / 2 + game.scrollCameraConfig.autoScrollSpeed;
        assert.ok(centre(cat) - scrollOf(game) >= -margin - 1e-9, `party ${party} tick ${i}: cat at ${centre(cat) - scrollOf(game)}`);
      });
    }
    assert.ok(death, `party ${party}: an idle cat is eventually pinned`);
    // (32 + screenX) - move < 0 with move = step - screenX: dies about (32 - step) / 2 behind the edge.
    const step = game.scrollCameraConfig.autoScrollSpeed;
    assert.ok(death.sx <= -(32 - step) / 2 && death.sx >= -(32 - step) / 2 - 2 * step - 1e-9, `party ${party}: died at ${death.sx}`);
    let restarted = false;
    for (let i = 0; i < 900 && !restarted; i++) {
      tick(run);
      restarted = scrollOf(game) === 0 && game.players.every((cat) => !dying(game, cat));
    }
    assert.ok(restarted, `party ${party}: the death restarts the stage (batch-16 lifecycle)`);
  }
});

test('planes ride the auto-scroll (12-3, FUN_7ff72bb708d0): idle keeps the screen x, right adds 3 per tick', () => {
  for (const party of PARTIES) {
    const run = load('12-3', party);
    const { game } = run;
    tick(run);
    const before = game.players.map((cat) => centre(cat) - scrollOf(game));
    for (let i = 0; i < 30; i++) tick(run);
    game.players.forEach((cat, i) => assert.ok(Math.abs(centre(cat) - scrollOf(game) - before[i]) < 1e-6, `party ${party} plane ${i}`));
    const x0 = centre(game.players[0]);
    tick(run, [{ right: true }]);
    assert.ok(Math.abs(centre(game.players[0]) - x0 - 9) < 1e-6, 'speed 6 + walk 3');
  }
});

test('a switch-driven Lift on its trip snaps the camera (11-4, stage flag 0x1000, float32 accumulator)', () => {
  const run = load('11-4');
  const { game } = run;
  const lift = game.weightedLifts[0];
  for (let i = 0; i < 5; i++) tick(run);
  lift.activateBaseLift();   // what the DelaySwitch does 10 s after its press (test setup)
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    tick(run);
    assert.equal(lift.travellingForSwitch, true);
    if (i >= 25) seen.add(game.scrollCameraState.accum);
  }
  assert.deepEqual([...seen].sort(), [Math.fround(-1.564621925354004e-7), Math.fround(0.049999844282865524)].sort(),
    'the linear float32 0.05 steps end oscillating around 0');
  for (let i = 0; i < 2000 && lift.travellingForSwitch; i++) tick(run);
  assert.equal(lift.travellingForSwitch, false, 'the trip ends');
  for (let i = 0; i < 40; i++) tick(run);
  assert.equal(game.scrollCameraState.accum, 1, 'and the accumulator lands exactly back on 1.0');
});

test('a warp-gun-held cat (hidden, live) leaves the follow set; an entered cat stays in it', () => {
  // 1-4's long flat floor; the rule is stage-independent (FUN_7ff72bb7c150 skips +0x410 == 2 with +0x178 bit 8 clear).
  const run = load('1-4');
  const { game } = run;
  const [a, b] = game.players;
  for (let i = 0; i < 420; i++) tick(run, [{}, { right: true }]);
  for (let i = 0; i < 60; i++) tick(run);
  const withB = scrollOf(game);
  // The warp gun's hold (FUN_7ff72bb580a0 command 0xe payload 0 -> player vtable +0xc0 = FUN_7ff72bb67cc0 clears
  // +0x178 bit 8, RAM vtable 0x7ff72bcbde80), as the runtime applies it: hidden and disabled.
  b.view.visible = false;
  game.warpGunDisabledPlayers.add(b);
  for (let i = 0; i < 400; i++) tick(run);
  const aloneTarget = Math.max(0, centre(a) - viewWidth(game) / 2);
  assert.ok(withB > aloneTarget + 50, `both cats were followed (${withB} vs ${aloneTarget})`);
  assert.ok(Math.abs(scrollOf(game) - aloneTarget) < 1, `the held cat is not followed (${scrollOf(game)} vs ${aloneTarget})`);
  // An entered cat (state 4) is hidden too but still counts.
  game.warpGunDisabledPlayers.delete(b);
  game.goalClearedPlayers.add(b);
  for (let i = 0; i < 400; i++) tick(run);
  assert.ok(Math.abs(scrollOf(game) - withB) < 1, 'the entered cat is followed again');
});

test('native-camera determinism: the same inputs give the same camera and cats (parties 2 / 4 / 8)', () => {
  const script = (i, n) => Array.from({ length: n }, (_, c) => ({ right: (i + c * 7) % 90 < 60, left: (i + c * 7) % 90 >= 75,
    jump: (i + c * 13) % 45 < 12, up: (i + c) % 120 > 110 }));
  for (const tag of ['1-4', '6-2', '12-3', '11-4', '2-3']) {
    for (const party of PARTIES) {
      const trace = () => {
        const run = load(tag, party);
        const out = [];
        for (let i = 0; i < 400; i++) {
          tick(run, script(i, run.game.players.length));
          if (i % 20 === 0) out.push([scrollOf(run.game), run.game.scrollCameraState.accum, ...run.game.players.flatMap((cat) => [cat.rect.x, cat.rect.y])]);
        }
        return JSON.stringify(out);
      };
      assert.equal(trace(), trace(), `${tag} party ${party}`);
    }
  }
});
