import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeDarknessLiftActor } from './native-darkness-lift-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: { wasmBinary } });
function fixture(type = 'InvisibleWeightedLift') {
  const sounds = [];
  const scene = createNativeGameScene({ playerCount: 8, createRigidWorld,
    stage: { createTable: [row(type, 400, 567, 200, 30, -40), row('Player', 450, 520, 0), row('Player', 500, 520, 0)],
      map: { width: 40, height: 24, chipSize: 32,
        table: Array.from({ length: 960 }, (_, i) => i >= 40 * 21 ? 2 : 1) } },
    playerInput: { held: () => false, pressed: () => false }, playSound: sound => sounds.push(sound),
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  return { scene, sounds };
}

test('darkness lift keeps fractional Lua dimensions, top-left origin and explicit return setting', () => {
  const actor = createNativeDarknessLiftActor({ spawn: row('DarknessWeightedLift', 10, 20, 48.5, 480.25, -192.5, 0) });
  assert.deepEqual(actor.body.rawBounds, { x: 0, y: 0, width: 48.5, height: 480.25 });
  assert.equal(actor.maximumOffset, -192.5); assert.equal(actor.returnsWhenEmpty, false);
  assert.equal(actor.body.category, 5); assert.equal(actor.body.flags & 3, 3);
  assert.equal(actor.patchFlags & 8, 8);
  assert.equal(actor.patch.name, 'LiftRect');
});

test('hiding and showing only changes patch visibility, including darkness-expiry command', () => {
  const actor = createNativeDarknessLiftActor({ spawn: row('InvisibleWeightedLift', 0, 0, 100, 20, -40) });
  assert.equal(actor.patchFlags & 8, 0); assert.equal(actor.body.flags & 1, 1);
  assert.equal(actor.spriteFlags & 8, 8);
  actor.onCommand(0xe, 1); actor.onCommand(0xe, null);
  assert.equal(actor.patchFlags & 8, 8, 'null visibility payload is ignored');
  actor.onCommand(0x2c);
  assert.equal(actor.patchFlags & 8, 0); assert.equal(actor.body.flags & 1, 1);
});

test('two native Players ride an invisible lift using actual scene count, despite configured party size8', () => {
  const { scene, sounds } = fixture();
  try {
    scene.setActive(true);
    for (let i = 0; i < 120; i++) scene.step();
    const lift = scene.findActor('InvisibleWeightedLift');
    assert.equal(scene.players.length, 2); assert.equal(scene.playerCount, 8);
    assert.equal(lift.supportCount, 2); assert.equal(lift.offset.y, -40);
    assert.equal(lift.patchFlags & 8, 0);
    assert.ok(scene.players.every(p => Math.abs(p.position.y - 527.99) < .02));
    assert.ok(sounds.length >= 1); assert.ok(sounds.every(sound => sound === 'switch'));
    const previousSounds = sounds.length;
    for (let i = 0; i < 20; i++) scene.step();
    assert.equal(sounds.length, previousSounds, 'steady load does not repeat the hidden-lift cue');
    scene.players.push({});
    lift.beforeMotion(1 / 60);
    assert.equal(lift.offset.y, -39, 'live team count raises the threshold immediately');
  } finally { scene.rigidWorld.dispose(); }
});

test('visible lift is silent on boarding and darkness expiry retains its body and loaded height', () => {
  const { scene, sounds } = fixture('DarknessWeightedLift');
  try {
    scene.setActive(true);
    for (let i = 0; i < 120; i++) scene.step();
    const lift = scene.findActor('DarknessWeightedLift');
    assert.equal(lift.offset.y, -40); assert.deepEqual(sounds, []);
    scene.sendCommand(null, 0x2c, null);
    for (let i = 0; i < 20; i++) scene.step();
    assert.equal(lift.patchFlags & 8, 0); assert.equal(lift.body.flags & 1, 1);
    assert.equal(lift.offset.y, -40); assert.deepEqual(sounds, []);
  } finally { scene.rigidWorld.dispose(); }
});
