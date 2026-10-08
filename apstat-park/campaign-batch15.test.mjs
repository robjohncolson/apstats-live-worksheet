// Batch 15 (scripts/pico-campaign-patches.mjs): rope-draw, rope-pull-solids, actor-draw-depth and goal-enter-native,
// checked on the real 2-1 stage (stage_constraint01) at parties 2 / 4 / 8.
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
  action: false, actionPressed: false, resetPressed: false, prevStagePressed: false, nextStagePressed: false };
const PARTIES = [2, 4, 8];
const ROPE_STAGE = 'stage_constraint01';   // 2-1
const FLOOR_Y = 240;                        // the 2-1 floor top beside the crevasse and at the door
const CAT_H = 46;

function load(source, partySize = 2, seed = 1) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  const data = partySize >= (entry.largeParty?.minimum ?? Infinity) ? entry.largeParty.data : entry.data;
  runtime.setRandomState(seed);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(data, 720, 750, { partySize, simplifyPassivePlaceholders: false });
  return game;
}
/** One tick; buttons[i] is a partial button set for cat i, placed at its input slot. */
function tick(game, buttons = []) {
  const inputs = Array.from({ length: 8 }, () => IDLE);
  game.players.forEach((cat, i) => {
    if (buttons[i]) inputs[game.playerInputSlots[i] ?? i] = { ...IDLE, ...buttons[i] };
  });
  game.update(1 / 60, inputs[0], inputs);
}
const place = (cat, x, y) => cat.applyResolvedCollision({ ...cat.rect, x, y }, { x: 0, y: 0 }, false);
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const entered = (game, cat) => game.goalClearedPlayers.has(cat);
/** Only one cat taps UP this tick. */
const upFor = (index) => { const buttons = []; buttons[index] = { up: true }; return buttons; };

/** The 2-1 crevasse stone: the party-2 Rect {1388, 240, 56, 56} over the five-chip pit 1296..1536. At parties 4 / 8
 *  the 2-1 rows differ (party terms): the pit is two chips (1296..1392) and the Rect row is absent, so the same Rect
 *  body is put into that pit flush with its right wall ({1336, 240, 56, 56}), leaving a 40 px gap on its left. */
function crevasseStone(game) {
  if (game.staticRects.length > 0) return game.staticRects[0].rect;
  const stone = load(ROPE_STAGE, 2).staticRects[0];
  Object.assign(stone.rect, { x: 1336 });
  game.staticRects.push(stone);
  return stone.rect;
}

/** Every cat but the last two stands on the left floor in a slack row ending 130 px left of `nearX`. */
function parkTheOthers(game, nearX) {
  const cats = game.players;
  for (let k = 0; k < cats.length - 2; k++) place(cats[cats.length - 3 - k], nearX - 130 - 36 * k, FLOOR_Y - CAT_H);
}

test('rope-pull-solids: a cat on the 2-1 stone is never pulled into it by its partner hanging in the pit', () => {
  const stoneAt2 = load(ROPE_STAGE, 2).staticRects[0].rect;
  assert.deepEqual({ ...stoneAt2 }, { x: 1388, y: 240, width: 56, height: 56 });
  for (const party of PARTIES) {
    const game = load(ROPE_STAGE, party);
    const stone = crevasseStone(game);
    const cats = game.players;
    const a = cats[cats.length - 2];
    const b = cats[cats.length - 1];
    parkTheOthers(game, stone.x + 12);
    place(a, stone.x + 12, stone.y - CAT_H);
    place(b, 1300, 200);   // over the pit, left of the stone
    let inside = 0;
    let onTop = 0;
    for (let t = 0; t < 120; t++) {
      tick(game);
      if (overlaps(a.rect, stone)) inside += 1;
      if (Math.abs(a.rect.y + a.rect.height - stone.y) < 0.5) onTop += 1;
    }
    assert.equal(inside, 0, `party ${party}: cat A ended inside the stone on ${inside} ticks`);
    // It stays on the top (dragged sideways along it) until it is dragged off the edge (party 4 / 8: the lighter rope
    // weight lets the hanging cat drag it off after ~30-45 ticks and the chain falls beside the stone, not through it).
    assert.ok(onTop >= 25, `party ${party}: cat A should stay on the stone top (on top ${onTop} / 120 ticks)`);
  }
});

test('rope-pull-solids: a big pull never crosses a chip or a body in one tick', () => {
  for (const party of PARTIES) {
    // Cat A (the chain end) hangs in the pit; its neighbour stands far left on the floor, so one rope correction
    // (c.x uncapped) is far wider than the stone (56) and than the gap to the wall. One rope apply alone:
    const setUp = (ax, ay) => {
      const game = load(ROPE_STAGE, party);
      const stone = crevasseStone(game);
      const cats = game.players;
      for (let k = 0; k < cats.length - 1; k++) place(cats[cats.length - 2 - k], 700 - 36 * k, FLOOR_Y - CAT_H);
      const a = cats[cats.length - 1];
      place(a, ax, ay);
      return { game, stone, a };
    };
    // Body: in the pit beside the stone, level with it, the neighbour far away on the other side -> stops flush at
    // the stone face (party 2: right of the stone, pulled left; parties 4 / 8: in the gap left of it, pulled right).
    {
      const fromRight = party === 2;
      const game = load(ROPE_STAGE, party);
      const stone = crevasseStone(game);
      const cats = game.players;
      const a = cats[cats.length - 1];
      for (let k = 0; k < cats.length - 1; k++) {
        place(cats[cats.length - 2 - k], fromRight ? 700 - 36 * k : 2100 + 36 * k, FLOOR_Y - CAT_H);
      }
      place(a, fromRight ? stone.x + stone.width + 4 : 1298, stone.y + 8);
      game.applyNativeRope(game.distanceConstraints[0]);
      assert.equal(a.rect.x, fromRight ? stone.x + stone.width : stone.x - a.rect.width, `party ${party}: the pull stops at the stone face`);
      assert.ok(!overlaps(a.rect, stone));
      for (let t = 0; t < 20; t++) {
        tick(game);
        assert.ok(!overlaps(a.rect, stone), `party ${party} tick ${t}: cat A inside the stone ${JSON.stringify(a.rect)}`);
      }
    }
    // Chip: beside the left pit wall (face x 1296) below the floor top -> stops flush at the wall (1 px sub-steps).
    {
      const { game, a } = setUp(1300, 300);
      game.applyNativeRope(game.distanceConstraints[0]);
      assert.equal(a.rect.x, 1296, `party ${party}: the pull stops at the wall face`);
      for (let t = 0; t < 20; t++) {
        tick(game);
        assert.ok(!game.tileMap.rectHitsSolid(a.rect), `party ${party} tick ${t}: cat A inside the wall ${JSON.stringify(a.rect)}`);
      }
    }
  }
});

test('rope-draw: one orange line per neighbouring pair between the native anchors; no spawn marker', () => {
  for (const party of PARTIES) {
    const game = load(ROPE_STAGE, party);
    const cats = game.players;
    cats.forEach((cat, i) => place(cat, 2400 + 60 * i, FLOOR_Y - CAT_H - 30 * (i % 2)));
    tick(game);
    assert.equal(game.distanceConstraints[0].view.visible, false, 'the green spawn marker is hidden');
    assert.equal(game.ropeViews.size, 1);
    const view = [...game.ropeViews.values()][0];
    assert.ok(view.visible && view.parent === game.actorLayer, 'the rope view is in the actor layer');
    const squares = view.geometry.graphicsData;
    let expected = 0;
    let at = 0;
    for (let i = 0; i + 1 < cats.length; i++) {
      const ax = cats[i].rect.x + cats[i].rect.width / 2, ay = cats[i].rect.y + cats[i].rect.height + 1;
      const bx = cats[i + 1].rect.x + cats[i + 1].rect.width / 2, by = cats[i + 1].rect.y + cats[i + 1].rect.height + 1;
      const ex = Math.trunc(bx - ax - 5), ey = Math.trunc(by - ay);
      const points = Math.max(Math.abs(ex - 5), Math.abs(ey)) + 1;
      const count = Math.ceil(points / 2);
      expected += count;
      const first = squares[at].shape;
      const last = squares[at + count - 1].shape;
      assert.deepEqual([first.x, first.y, first.width, first.height], [ax + 5, ay - 14, 2, 2], `party ${party} pair ${i}: start anchor`);
      // The last drawn square is the native end anchor B + (-5, -14) (trunc) or the point before it (every 2nd point).
      assert.ok(Math.abs(last.x - (ax + ex)) <= 1 && Math.abs(last.y - (ay + ey - 14)) <= 1,
        `party ${party} pair ${i}: end anchor ${last.x},${last.y} vs ${ax + ex},${ay + ey - 14}`);
      at += count;
    }
    assert.equal(squares.length, expected, `party ${party}: one 2 x 2 square on every 2nd Bresenham point`);
    assert.equal(squares[0].fillStyle.color, 0xff864d);
    assert.equal(squares[0].fillStyle.alpha, 1);
    // Behind every cat, in front of the door.
    for (const cat of cats) assert.ok(view.zIndex < cat.view.zIndex);
    assert.ok(view.zIndex > game.goals[0].view.zIndex);
  }
});

test('actor-draw-depth: every cat draws in front of the Goal door, higher slots over lower', () => {
  for (const party of PARTIES) {
    const game = load(ROPE_STAGE, party);
    const goal = game.goals[0];
    const cats = game.players;
    place(cats[0], goal.rect.x + 8, FLOOR_Y - CAT_H);
    tick(game);
    game.actorLayer.sortChildren();
    const order = game.actorLayer.children;
    for (const cat of cats) {
      assert.ok(cat.view.zIndex > goal.view.zIndex, `party ${party}: cat zIndex ${cat.view.zIndex} vs door ${goal.view.zIndex}`);
      assert.ok(order.indexOf(cat.view) > order.indexOf(goal.view), `party ${party}: a cat view sorts behind the door`);
    }
    const bySlot = cats.map((cat, i) => ({ slot: game.playerInputSlots[i], z: cat.view.zIndex })).sort((p, q) => p.slot - q.slot);
    for (let i = 1; i < bySlot.length; i++) assert.ok(bySlot[i].z > bySlot[i - 1].z, `party ${party}: slot order`);
  }
});

/** 2-1 with every cat lined up left of the door (slack rope), cat 0 standing in the door sensor. */
function atTheDoor(party, { open = true } = {}) {
  const game = load(ROPE_STAGE, party);
  const goal = game.goals[0];
  if (open) goal.setOpened(true);
  const cats = game.players;
  place(cats[0], goal.rect.x + 8, FLOOR_Y - CAT_H);
  for (let i = 1; i < cats.length; i++) place(cats[i], goal.rect.x - 40 * i, FLOOR_Y - CAT_H);
  for (let t = 0; t < 5; t++) tick(game);
  assert.ok(overlaps(cats[0].rect, goal.rect), 'cat 0 stands in the door sensor');
  return { game, goal, cats };
}

test('goal-enter-native: UP held from before does not enter; a fresh press does; a closed door never', () => {
  for (const party of PARTIES) {
    const { game, goal, cats } = atTheDoor(party);
    // Hold UP while walking in from outside: it was already held, so no press edge inside the sensor.
    place(cats[0], goal.rect.x - 60, FLOOR_Y - CAT_H);
    tick(game, upFor(0));
    place(cats[0], goal.rect.x + 8, FLOOR_Y - CAT_H);
    for (let t = 0; t < 30; t++) tick(game, upFor(0));
    assert.equal(entered(game, cats[0]), false, `party ${party}: held UP entered`);
    tick(game);
    tick(game, upFor(0));
    assert.equal(entered(game, cats[0]), true, `party ${party}: a fresh UP press did not enter`);

    const closed = atTheDoor(party, { open: false });
    for (let t = 0; t < 30; t++) tick(closed.game, t % 2 === 0 ? upFor(0) : []);
    assert.equal(entered(closed.game, closed.cats[0]), false, `party ${party}: entered a closed door`);
    assert.equal(closed.cats[0].view.visible, true);
    assert.equal(closed.game.cleared, false);
  }
});

test('goal-enter-native: an entered cat is hidden and not solid, and comes out only after 1 s with an UP press', () => {
  for (const party of PARTIES) {
    const { game, goal, cats } = atTheDoor(party);
    tick(game, upFor(0));
    assert.ok(entered(game, cats[0]));
    assert.equal(cats[0].view.visible, false, 'hidden at once');
    const spot = { ...cats[0].rect };
    // Cat 1 walks right through the entered cat's spot (no body).
    let through = false;
    for (let t = 0; t < 40; t++) {
      tick(game, [undefined, { right: true }]);
      if (overlaps(cats[1].rect, spot)) through = true;
    }
    assert.ok(through, `party ${party}: cat 1 never reached the entered cat's spot`);
    assert.deepEqual({ ...cats[0].rect }, spot, 'the entered cat never moves');
    // While cat 1 stands on its spot, an UP press after 1 s does not bring it out.
    place(cats[1], spot.x, spot.y);
    for (let t = 0; t < 70; t++) tick(game, t % 2 === 0 ? upFor(0) : []);
    assert.ok(entered(game, cats[0]), `party ${party}: came out onto an occupied spot`);
    place(cats[1], goal.rect.x - 40, FLOOR_Y - CAT_H);
    tick(game);
    tick(game, upFor(0));
    assert.equal(entered(game, cats[0]), false, `party ${party}: did not come out with a free spot`);
    assert.equal(cats[0].view.visible, true);

    // Timing: entered on tick e, an UP press on tick e + 59 does nothing, on e + 61 it comes out.
    const run = atTheDoor(party);
    tick(run.game, upFor(0));
    assert.ok(entered(run.game, run.cats[0]));
    for (let k = 1; k <= 61; k++) {
      tick(run.game, k === 30 || k === 59 || k === 61 ? upFor(0) : []);
      if (k === 59) assert.ok(entered(run.game, run.cats[0]), `party ${party}: came out before 1 s`);
    }
    assert.equal(entered(run.game, run.cats[0]), false, `party ${party}: did not come out after 1 s`);
  }
});

test('goal-enter-native: the stage clears when every cat is inside, not before', () => {
  for (const party of PARTIES) {
    const { game, goal, cats } = atTheDoor(party);
    for (let i = 0; i < cats.length; i++) {
      place(cats[i], goal.rect.x + 8, FLOOR_Y - CAT_H);   // the spot of the cats already inside is free
      tick(game);
      assert.equal(game.cleared, false, `party ${party}: cleared with ${i} of ${cats.length} inside`);
      tick(game, upFor(i));
      assert.ok(entered(game, cats[i]), `party ${party}: cat ${i} did not enter`);
    }
    assert.equal(game.cleared, true, `party ${party}: no clear with every cat inside`);
  }
});

test('batch 15 is deterministic', () => {
  const trace = (party) => {
    const game = load(ROPE_STAGE, party);
    const stone = crevasseStone(game);
    const cats = game.players;
    parkTheOthers(game, 1400);
    place(cats[cats.length - 2], 1400, stone.y - CAT_H);
    place(cats[cats.length - 1], 1300, 200);
    const out = [];
    for (let t = 0; t < 90; t++) {
      tick(game, t % 3 === 0 ? upFor(0) : [{ right: t % 5 === 0 }]);
      out.push(cats.map((cat) => [cat.rect.x, cat.rect.y, entered(game, cat)]).flat().join(','));
      out.push([...game.ropeViews.values()][0].geometry.graphicsData.length);
    }
    return out.join('|');
  };
  for (const party of PARTIES) assert.equal(trace(party), trace(party));
});

// ---- review fixes (Codex F1 / F2 / F3) ----------------------------------------------------------------------------

test('goal-enter-native (F1): a same-frame exit is never lost to another cat entering, at either player order', () => {
  for (const party of PARTIES) {
    for (const [ai, bi] of [[0, 1], [1, 0]]) {
      const { game, goal, cats } = atTheDoor(party);
      const a = cats[ai], b = cats[bi];
      // B (and, at parties 4 / 8, every other cat) is inside, its 1 s long past.
      for (let i = 0; i < cats.length; i++) {
        if (i === ai) continue;
        place(cats[i], goal.rect.x + 20, FLOOR_Y - CAT_H);
        tick(game);
        tick(game, upFor(i));
        assert.ok(entered(game, cats[i]), `party ${party}: cat ${i} did not enter`);
      }
      place(a, goal.rect.x - 18, FLOOR_Y - CAT_H);   // in the sensor, clear of B's spot
      for (let t = 0; t < 70; t++) tick(game);
      // One frame: A presses UP to enter, B presses UP to come back out.
      const buttons = [];
      buttons[ai] = { up: true };
      buttons[bi] = { up: true };
      tick(game, buttons);
      assert.equal(entered(game, a), true, `party ${party} order ${ai}${bi}: A entered`);
      assert.equal(entered(game, b), false, `party ${party} order ${ai}${bi}: B came out`);
      assert.equal(game.cleared, false, `party ${party} order ${ai}${bi}: no clear with B outside`);
      // B does not use the same press to go straight back in, and the stage is not cleared on the next frames.
      for (let t = 0; t < 5; t++) tick(game);
      assert.equal(entered(game, b), false);
      assert.equal(game.cleared, false);
    }
  }
});

/** 2-1 with cat A at `aRect`, its neighbour and every other cat far away on the right; all airborne. */
function ropeScene(party, aRect, otherAt = { x: 2200, y: 900 }) {
  const game = load(ROPE_STAGE, party);
  const cats = game.players;
  cats.forEach((cat, i) => {
    if (i === 0) return;
    cat.applyResolvedCollision({ ...cat.rect, x: otherAt.x + 36 * (i - 1), y: otherAt.y }, { x: 0, y: 0 }, false);
  });
  cats[0].applyResolvedCollision({ ...cats[0].rect, ...aRect }, { x: 0, y: 0 }, false);
  return { game, a: cats[0] };
}

test('rope-pull-solids (F2): one swept move per axis never leaves a cat inside a chip or a body', () => {
  for (const party of PARTIES) {
    // Codex repro: a thin body beside the pit wall top; A next to both; the partner far below right.
    {
      const { game, a } = ropeScene(party, { x: 1258, y: 190 });
      const body = crevasseStone(game);
      Object.assign(body, { x: 1294, y: 150, width: 16, height: 70 });
      game.applyNativeRope(game.distanceConstraints[0]);
      assert.ok(!game.tileMap.rectHitsSolid(a.rect), `party ${party}: A inside a chip ${JSON.stringify(a.rect)}`);
      assert.ok(!overlaps(a.rect, body), `party ${party}: A inside the body ${JSON.stringify(a.rect)}`);
    }
    // The crevasse corner: A under the stone's bottom-left corner, the pull up and right (diagonal), a pit wall on
    // its left: every tick for 40 ticks, never inside the stone or a chip.
    {
      const { game, a } = ropeScene(party, {}, { x: 2200, y: 60 });
      const stone = crevasseStone(game);
      a.applyResolvedCollision({ ...a.rect, x: stone.x - 40, y: stone.y + stone.height + 4 }, { x: 0, y: 0 }, false);
      for (let t = 0; t < 40; t++) {
        tick(game);
        assert.ok(!game.tileMap.rectHitsSolid(a.rect), `party ${party} tick ${t}: A inside a chip ${JSON.stringify(a.rect)}`);
        assert.ok(!overlaps(a.rect, stone), `party ${party} tick ${t}: A inside the stone ${JSON.stringify(a.rect)}`);
      }
    }
  }
});

test('goal-enter-native (F3): the wire carries the UP press edge (512); a timeout journal enters once, never exits', async () => {
  const { decodeInput } = await import('./campaign-engine.mjs');
  assert.equal(decodeInput(512).upPressed, true);
  assert.equal(decodeInput(516).up, true);
  for (const bits of [0, 4, 63, 64 | 256 | 2]) {
    const decoded = decodeInput(bits);
    assert.equal(decoded.upPressed, false, 'older inputs carry no UP press');
    assert.deepEqual({ ...decoded, upPressed: undefined }, { ...decodeInput(bits | 512), upPressed: undefined });
  }
  // The relay journal of Codex's timeout repro: press once (4 | 512), hold, timeout zeroes it, the held heartbeat
  // resumes (4, no press).
  for (const party of PARTIES) {
    const { game, cats } = atTheDoor(party);
    const journal = (frame) => (frame === 1 ? 4 | 512 : frame < 91 ? 4 : frame < 106 ? 0 : 4);
    let enteredAt = -1, exitedAt = -1;
    for (let frame = 1; frame <= 200; frame++) {
      const inputs = Array.from({ length: 8 }, () => decodeInput(0));
      inputs[game.playerInputSlots[0] ?? 0] = decodeInput(journal(frame));
      game.update(1 / 60, inputs[0], inputs);
      if (entered(game, cats[0]) && enteredAt < 0) enteredAt = frame;
      if (enteredAt > 0 && !entered(game, cats[0]) && exitedAt < 0) exitedAt = frame;
    }
    assert.equal(enteredAt, 1, `party ${party}: enters on the press`);
    assert.equal(exitedAt, -1, `party ${party}: the resumed held heartbeat (frame 106) is not a press`);
  }
});
