import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeDelaySwitchActor } from './native-delay-switch-actor.mjs';
import { createNativeGameScene } from './native-game-scene.mjs';
import { createNativeRigidWorldFactory } from './native-rigid-world.mjs';
import { spawnNativeStageActor } from './native-stage-actors.mjs';
const row = (actorName, x, y, ...params) => ({ actorName, label: '', x, y, raw: [0, 0, actorName, '', x, y, ...params] });
function fixture(seconds = .5) {
  const actor = createNativeDelaySwitchActor({ spawn: { ...row('DelaySwitch', 100, 200, seconds), label: 'Target' } });
  const events = [];
  actor.scene = { sendCommand: (...args) => events.push(args), playSound: name => events.push(name),
    viewPosition: { x: 20, y: 0 }, viewOffset: { x: 0, y: 0 } };
  const touch = () => actor.body.onOverlap({ type: 3, category: 1, actor: {} });
  return { actor, events, touch };
}
test('DelaySwitch waits until expiry, publishes once and rearms on a later contact', () => {
  const { actor, events, touch } = fixture();
  touch(); actor.beforeMotion(.25);
  assert.equal(actor.remainingSeconds, .5); assert.deepEqual(events, ['switch']);
  actor.beforeMotion(.25); assert.equal(actor.remainingSeconds, .25);
  actor.beforeMotion(.25); assert.deepEqual(events, ['switch', ['Target', 9, 0]]);
  assert.equal(actor.switchFlags & 2, 0); assert.equal(actor.readDelayLabel(), null);
  actor.beforeMotion(.25); assert.equal(events.length, 2, 'no ordinary release command');
  touch(); actor.beforeMotion(.1); assert.equal(actor.remainingSeconds, .5);
  assert.equal(events.at(-1), 'switch');
});
test('zero delay remains pressed without publishing; timer labels preserve native rounding', () => {
  const { actor, events, touch } = fixture(0);
  touch(); actor.beforeMotion(1); actor.beforeMotion(100);
  assert.deepEqual(events, ['switch']); assert.equal(actor.readPressedState(), 1);
  actor.remainingSeconds = .001;
  assert.equal(actor.readDelayLabel().text, '0'); assert.equal(actor.readDelayLabel().x, 80);
  actor.remainingSeconds = 1.02; assert.equal(actor.readDelayLabel().text, '2');
});
test('snapshot restores countdown and suppresses expiry publication for a client replica', () => {
  const { actor, events } = fixture(); actor.replication = {}; actor.scene.networkMode = 1;
  actor.applyDelayState({ pressed: 1, seconds: .125 });
  assert.deepEqual(actor.readDelayState(), { pressed: 1, seconds: .125 });
  actor.beforeMotion(.125);
  assert.ok(events.every(event => typeof event === 'string'));
});
const createRigidWorld = await createNativeRigidWorldFactory({ moduleOptions: {
  wasmBinary: await readFile(new URL('./recovered/box2d.wasm', import.meta.url)) } });
test('actual Player contact reveals a target platform only after the delay', () => {
  const trigger = { ...row('DelaySwitch', 200, 664, .25), label: 'SwitchRect1' };
  const platform = { ...row('SwitchRect', 400, 600, 96, 48), label: '1' };
  const game = createNativeGameScene({ playerCount: 1, createRigidWorld,
    stage: { createTable: [row('Player', 200, 640), trigger, platform],
      map: { width: 40, height: 24, chipSize: 32, table: Array.from({ length: 960 }, (_, i) => i >= 840 ? 2 : 1) } },
    playerInput: { held: () => false, pressed: () => false }, playSound() {},
    spawnActor: (scene, spawn) => spawnNativeStageActor(scene, spawn, {
      playerPresentation: { setAnimation() {}, setScale() {}, resetSpriteBounds() {} } }) });
  try {
    game.setActive(true); for (let i = 0; i < 8; i++) game.step();
    assert.equal(game.findActor('SwitchRect1').activationCount, 0);
    for (let i = 0; i < 20; i++) game.step();
    assert.ok(game.findActor('SwitchRect1').activationCount >= 1);
    assert.equal(game.findActor('SwitchRect1').body.flags & 1, 1);
  } finally { game.rigidWorld.dispose(); }
});
