import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeThunderActor } from './native-thunder-actor.mjs';
import { createNativeBody, initializeNativeRectangleBody } from './native-body.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const f = Math.fround;
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
function body(x, y, width = 20, height = 20) {
  const result = initializeNativeRectangleBody(createNativeBody(), { x: 0, y: 0, width, height }, 3);
  result.position = { x, y }; result.actor = {};
  return result;
}
function fixture(direction = 3, transparent = 0, retainProbe = 0) {
  const actor = createNativeThunderActor({ spawn: row('Thunder', 160, 320, direction, transparent, retainProbe) });
  actor.scene = { players: [], bodyWorld: { map: { chipSize: 32, width: 40, height: 24,
    table: Array.from({ length: 960 }, (_, i) => i % 40 === 30 || Math.floor(i / 40) === 2 ? 2 : 1) } } };
  return actor;
}
function player(index, x, y) {
  const commands = [], rectangle = body(x, y);
  const result = { playerIndex: index, bodies: [{ body: rectangle }], onCommand: command => commands.push(command), commands };
  rectangle.actor = result;
  return result;
}

test('Thunder retains four native sensor orientations, flag parameters and emitter rotation', () => {
  const expected = [[-2, -2400, 4, 2400], [-2, 0, 4, 2400], [-2400, -2, 2400, 4], [0, -2, 2400, 4]];
  for (let direction = 0; direction < 4; direction++) {
    const actor = fixture(direction);
    assert.deepEqual(Object.values(actor.body.rawBounds), expected[direction]);
    assert.equal(actor.body.category, 5); assert.equal(actor.body.type, 0);
    assert.equal(actor.mapProbe.type, 3); assert.equal(actor.mapProbe.category, 0);
    assert.equal(actor.spriteAngle, [0, 0x8000, 0xc000, 0x4000][direction]);
  }
  const transparent = fixture(3, 1, 1);
  assert.equal(transparent.thunderFlags, 6); assert.equal(transparent.spriteBounds, null);
  assert.equal(transparent.mapProbe.type, 2);
});

test('first PRE probes map once, adds square width and optionally retains its collision body', () => {
  for (const retain of [0, 1]) {
    const actor = fixture(3, 0, retain);
    actor.beforeMotion(0);
    assert.equal(actor.maximumBeamLength, f(f(960 - 16 - 160 - f(.01)) + 32));
    assert.equal(actor.mapProbe.flags & 1, retain);
    actor.scene.bodyWorld.map.table.fill(1);
    actor.beforeMotion(1 / 60);
    assert.equal(actor.beamLength, actor.maximumBeamLength, 'cached map range does not rescan');
  }
  const up = fixture(0); up.beforeMotion(0);
  assert.equal(up.maximumBeamLength, f(f(320 - 96 - 16 - f(.01)) + 32));
});

test('dynamic cover shortens every direction and hidden-emitter mode ignores actor cover', () => {
  const blockers = [body(150, 200), body(150, 400), body(80, 310), body(240, 310)];
  const lengths = [100, 80, 60, 80];
  for (let direction = 0; direction < 4; direction++) {
    const actor = fixture(direction); actor.beamLength = actor.maximumBeamLength = 500; actor.thunderFlags |= 1;
    actor.body.onOverlap(blockers[direction]);
    assert.equal(actor.beamLength, lengths[direction]);
    actor.beforeMotion(0); assert.equal(actor.beamLength, 500);
  }
  const actor = fixture(3, 1); actor.beamLength = 500;
  actor.body.onOverlap(blockers[3]); assert.equal(actor.beamLength, 500);
  actor.thunderFlags = 0; blockers[3].actor.isNativeThunder = true;
  actor.body.onOverlap(blockers[3]); assert.equal(actor.beamLength, 500);
  blockers[3].actor = { isNativeMagnetCompanion: true };
  actor.body.onOverlap(blockers[3]); assert.equal(actor.beamLength, 500);
});

test('damage needs consecutive overlap and uses the entire older contact mask', () => {
  const actor = fixture(), a = player(0, 200, 310), b = player(1, 250, 310);
  actor.scene.players = [a, b]; actor.beforeMotion(0);
  const tick = players => {
    actor.beforeMotion(1 / 60);
    for (const p of players) actor.body.onOverlap(p.bodies[0].body);
    actor.afterMotion();
  };
  tick([a]); assert.deepEqual(a.commands, []);
  tick([a, b]); assert.deepEqual(a.commands, [5]);
  tick([b]); assert.deepEqual(b.commands, [], 'older contact from player A suppresses B');
  tick([]); tick([]); tick([b]); tick([b]); assert.deepEqual(b.commands, [5]);
  actor.scene.networkMode = 1; tick([a]); tick([a]); assert.deepEqual(a.commands, [5]);
});

test('cover is resolved before POST damage regardless of callback order; circles and excess candidates are ignored', () => {
  const actor = fixture(), p = player(0, 300, 310);
  actor.scene.players = [p]; actor.beforeMotion(0); actor.previousHits = 1;
  actor.body.onOverlap(p.bodies[0].body); actor.body.onOverlap(body(240, 310)); actor.afterMotion();
  assert.equal(actor.currentHits, 0); assert.deepEqual(p.commands, []);
  actor.beamLength = 500; p.bodies[0].body.shape = 1; actor.afterMotion();
  assert.equal(actor.currentHits, 0);
  for (let i = 0; i < 20; i++) actor.body.onOverlap(p.bodies[0].body);
  assert.equal(actor.candidates.length, 10);
});

test('beam artwork alternates only after .1 seconds and crops its final strip', () => {
  const actor = fixture(); actor.beforeMotion(.1);
  assert.equal(actor.animationFrame, 0);
  actor.beforeMotion(.001); assert.equal(actor.animationFrame, 1); assert.equal(actor.animationSeconds, 0);
  actor.beamLength = 48;
  assert.deepEqual(actor.getBeamStrips(), [
    { bounds: { x: -16, y: -37, width: 32, height: 33 }, uv: { x: .1875, y: .390625, width: .03125, height: .03125 } },
    { bounds: { x: -16, y: -53, width: 32, height: 17 }, uv: { x: .1875, y: .40625, width: .03125, height: .015625 } },
  ]);
  actor.beamLength = 32;
  assert.equal(actor.getBeamStrips().length, 2, 'exact multiples retain a zero-UV-height final strip');
});

test('native Player walks into Thunder and enters original death controller without respawning', () => {
  const sounds = [], animations = [];
  let specialDamage = 0;
  const scene = createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { createTable: [row('Thunder', 420, 624, 0), row('Player', 320, 620)],
      map: { width: 40, height: 24, chipSize: 32, table: Array.from({ length: 960 }, (_, i) => i >= 40 * 20 ? 2 : 1) } },
    playerInput: { held: action => action === 6, pressed: () => false },
    playSound: sound => sounds.push(sound), stageRetryEligible: () => true,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation: (_actor, value) => animations.push(value), setScale() {}, resetSpriteBounds() {} } }) });
  scene.recordSpecialDamage = () => specialDamage++;
  try {
    scene.setActive(true);
    for (let i = 0; i < 90; i++) scene.step();
    assert.equal(scene.players[0].health, 0); assert.equal(scene.players[0].controllerKind, 3);
    assert.equal(specialDamage, 1); assert.ok(sounds.includes('hit')); assert.ok(animations.includes(4));
    assert.notEqual(scene.players[0].position.x, 320);
  } finally { scene.rigidWorld.dispose(); }
});
