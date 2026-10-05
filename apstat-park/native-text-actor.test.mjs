import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeTextActor } from './native-text-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (...params) => ({ actorName: 'Text', label: '', x: 100, y: 200, raw: [0, 0, 'Text', '', 100, 200, ...params] });
const scene = () => ({ viewPosition: { x: 20, y: 40 }, viewOffset: { x: 1, y: 2 }, actorManager: { flags: 0 } });

test('Text substitutes party count once and preserves native draw options and camera offset', () => {
  const actor = createNativeTextActor({ spawn: row('[pl] PLAYERS [pl]', 40, 1, 6, 1, 1), partySize: 8 });
  actor.onAdded(scene());
  assert.equal(actor.text, '8 PLAYERS [pl]');
  assert.deepEqual(actor.readTextDisplay(), { visible: true, text: '8 PLAYERS [pl]', x: 79, y: 158,
    fontSize: 40, horizontalAlignment: 2, verticalAlignment: 2, color: 0xffffffff,
    outline: true, outlineColor: 0xffff864d, depth: Math.fround(.1), fontKind: 'pixel' });
  actor.onPre(.01); assert.equal(actor.position.x, 106, 'speed is per frame, not dt');
  actor.setVisible(0); assert.equal(actor.readTextDisplay().visible, false);
  assert.equal(actor.bodies.length, 0);
});

test('Text uses inherited font size for absent/nonpositive sizes and removes at expired lifetime', () => {
  const actor = createNativeTextActor({ spawn: row('THANK YOU', 0), partySize: 2 });
  actor.onAdded(scene()); assert.equal(actor.fontSize, -1); assert.equal(actor.textDepth, Math.fround(-.4));
  actor.beforeMotion(10); assert.equal(actor.flags & 0x20, 0);
  actor.lifetime = .25; actor.beforeMotion(.25); assert.equal(actor.flags & 0x20, 0x20);
});

test('input labels refresh on revision changes while preserving recovered prefix-copy behavior', () => {
  const actor = createNativeTextActor({ spawn: row('PRESS [shot] TO SHOOT', 30), partySize: 2 });
  const owner = scene(); owner.resolveNativeInputLabel = action => { assert.equal(action, 11); return 'X'; };
  actor.onAdded(owner); assert.equal(actor.text, 'PRESS X TO SHOOT');
  owner.resolveNativeInputLabel = () => 'Y'; actor.beforeMotion(.1); assert.equal(actor.text, 'PRESS X TO SHOOT');
  owner.nativeInputLabelRevision = 3; actor.beforeMotion(.1); assert.equal(actor.text, 'PRESS Y TO SHOOT');
  assert.equal(actor.readTextDisplay().horizontalAlignment, 0);
  const odd = createNativeTextActor({ spawn: row('LONG PREFIX [shot]!'), partySize: 2 });
  odd.onAdded(owner); assert.equal(odd.text, 'LONG PY!');
});

const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: {
  wasmBinary: await readFile(new URL('./recovered/box2d.wasm', import.meta.url)) } });
const stages = JSON.parse(await readFile(new URL('./recovered/stages.json', import.meta.url)));
for (const count of [2, 8]) test(`original auto_scroll02 assembles for ${count} players`, () => {
  const game = createNativeGameScene({ playerCount: count, createRigidWorld,
    stage: stages.find(stage => stage.name === 'stage_auto_scroll02'),
    playerInput: { held: () => false, pressed: () => false }, playSound() {}, stageRetryEligible: () => false,
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  try {
    game.setActive(true); assert.equal(game.players.length, count);
    assert.equal(game.creationSchedule.state.cursor, 20, 'last two enemies wait for camera trigger');
    for (let i = 0; i < 30; i++) game.step();
    assert.equal(game.findActor('Text').text, 'THANK YOU');
    assert.equal(game.findActor('Text').fontSize, 100);
    assert.ok(game.players.every(player => player.health === 1));
    game.creationSchedule.update(1968);
    assert.equal(game.creationSchedule.state.cursor, game.creationSchedule.state.entries.length);
    assert.ok(game.findActor('StepEnemy'));
  } finally { game.rigidWorld.dispose(); }
});
