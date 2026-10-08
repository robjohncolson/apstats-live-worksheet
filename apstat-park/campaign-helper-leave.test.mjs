// optional-teacher-cats (scripts/pico-campaign-patches.mjs), Codex review of batch 1 (2026-10-07): a teacher cat
// that a WarpGun picked up and that then LEFT (campaign-helpers.mjs destroys its view) was still held by the gun;
// the next shot relocated the destroyed cat and the runtime threw ("reading 'position'"). Native holds the target
// in the gun's aux (+0x430, FUN_7ff72bb57200) until the next hit relocates it and clears it (FUN_7ff72bb580a0);
// native cats never leave mid-stage, so removeRuntimePlayer returns the gun to that empty hold and drops every
// other retained reference to the cat.
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
const { createCampaignHelpers } = await import('./campaign-helpers.mjs');
const IDLE = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false,
  resetPressed: false, prevStagePressed: false, nextStagePressed: false };
// Same bit layout as campaign-engine.mjs decodeInput; bit 128 = an optional teacher cat is present.
const decode = (bits) => ({ ...IDLE, left: !!(bits & 1), right: !!(bits & 2), up: !!(bits & 4), down: !!(bits & 8),
  jump: !!(bits & 16), jumpPressed: !!(bits & 32) });

function play(source, party, script, frames) {
  const entry = runtime.stages.find((stage) => stage.source === source);
  runtime.setRandomState(1);
  const game = new runtime.GameRuntime(() => {}, () => {});
  game.loadStage(entry.data, 720, 750, { partySize: party, simplifyPassivePlaceholders: false });
  const syncHelpers = createCampaignHelpers(game, entry.data, party);
  const removed = new Set();
  let teacher = null, teacherWasHeld = false;
  for (let frame = 0; frame < frames; frame++) {
    const inputs = script(frame);
    const before = new Set(game.players);
    syncHelpers(inputs);
    for (const cat of before) if (!game.players.includes(cat)) removed.add(cat);
    teacher ||= game.players.find((cat) => cat.parkHelper) || null;
    if (teacher && [...game.warpGunSelectedPlayers.values()].includes(teacher)) teacherWasHeld = true;
    const decoded = inputs.map(decode);
    game.update(1 / 60, decoded[0], decoded);   // must not throw
  }
  return { game, removed, teacherWasHeld };
}

// Every Map / Set / array the runtime owns, checked for a cat that has left.
function retainedReferences(game, removed) {
  const found = [];
  const names = (value) => removed.has(value) || (value && typeof value === 'object'
    && ['player', 'owner', 'carrier', 'target'].some((key) => removed.has(value[key])));
  for (const [field, value] of Object.entries(game)) {
    if (value instanceof Map) {
      for (const [key, entry] of value) if (removed.has(key) || names(entry)) found.push(field);
    } else if (value instanceof Set) {
      for (const entry of value) if (removed.has(entry)) found.push(field);
    } else if (Array.isArray(value) && value.some(names)) found.push(field);
  }
  return found;
}

test('11-3 (gun02, party 2): P1 picks up the teacher cat, the teacher leaves, P1 keeps shooting: no throw, no stale hold', () => {
  // Reproduced crash (Codex review): P2 walks left out of the line of fire, the teacher steps right, P1 turns left
  // and shoots at frame 80 (the teacher is held), the teacher leaves at 100, P1 shoots at 130/160/190.
  const shots = new Set([80, 130, 160, 190]);
  const { game, removed, teacherWasHeld } = play('stage_gun02', 2, (frame) => [
    (frame >= 60 && frame < 62 ? 2 : 0) | (shots.has(frame) ? 48 : 0),
    frame < 50 ? 2 : 0,
    frame < 100 ? 128 | (frame >= 20 && frame < 26 ? 2 : 0) : 0,
  ], 300);
  assert.equal(teacherWasHeld, true, 'set-up: the gun held the teacher cat before it left');
  assert.equal(removed.size, 1, 'the teacher left');
  assert.deepEqual(retainedReferences(game, removed), []);
  assert.equal(game.players.length, 2);
  // A hidden student is only ever one a gun currently holds (held cats are hidden until the next hit places them).
  const held = new Set(game.warpGunSelectedPlayers.values());
  assert.ok(game.players.every((cat) => cat.view.visible !== false || held.has(cat) || cat.deathTimer > 0), 'no student left hidden');
});

test('every WarpGun / Magnet stage, parties 2 and 4: a teacher joins, is shot at, leaves, the shooting goes on: never throws', () => {
  const sources = runtime.stages.filter((stage) => stage.data.createTable.some((row) => /^(WarpGun|Magnet)Player$/.test(row.actorName)))
    .map((stage) => stage.source);
  assert.deepEqual(sources.sort(), ['stage_gun01', 'stage_gun02', 'stage_magnet01', 'stage_magnet02']);
  for (const source of sources) {
    for (const party of [2, 4]) {
      for (const leave of [60, 100, 140]) {
        for (const away of [1, 2]) {
          for (const aim of [1, 2]) {
            const { game, removed } = play(source, party, (frame) => {
              const students = Array.from({ length: party }, (_, slot) => {
                if (slot === 0) return (frame >= 60 && frame < 62 ? aim : 0) | (frame % 30 === 20 ? 48 : 0);
                return frame < 50 ? away : frame % 45 === 10 ? 48 : 0;
              });
              const teacher = frame < leave ? 128 | (frame >= 20 && frame < 26 ? 2 : 0) | (frame === 40 ? 48 : 0) : 0;
              return [...students, teacher];
            }, leave + 150);
            assert.deepEqual(retainedReferences(game, removed), [], `${source} p${party} leave ${leave}`);
          }
        }
      }
    }
  }
});
