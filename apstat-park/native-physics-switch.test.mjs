import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNativeRigidWorld } from './native-rigid-world.mjs';
import { createNativePhysicsSwitch } from './native-physics-switch.mjs';
import { createNativePhysicsBall } from './native-physics-ball.mjs';
import { createNativeActorManager, queueNativeActor } from './native-actor-manager.mjs';
import { createNativeBodyRegistry } from './native-body-registry.mjs';
import { stepNativeSceneFrame, stepNativeGameScenePhysics } from './native-scene-frame.mjs';
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const f = Math.fround;
async function makeScene() {
  const scene = { flags: 0x20, frame: 0n, highestFrame: 0n, viewPosition: { x: 0, y: 0 },
    actorManager: createNativeActorManager(1), bodyWorld: createNativeBodyRegistry(),
    rigidWorld: await createNativeRigidWorld({ gravity: { x: 0, y: 10 }, moduleOptions: { wasmBinary } }),
    updateCamera() {}, updateOutcomes() {} };
  scene.onStep = dt => stepNativeGameScenePhysics(scene, dt);
  return scene;
}

test('PhysicsSwitch publishes its rigid hit one PRE later and keeps the latch after the ball leaves', async () => {
  const scene = await makeScene();
  const commands = [], sounds = [];
  scene.sendCommand = (...args) => commands.push(args);
  scene.playSound = name => sounds.push(name);
  try {
    const sensor = createNativePhysicsSwitch({ name: 'PhysicsSwitchKey', position: { x: 100, y: 100 } });
    queueNativeActor(scene.actorManager, sensor, 0, scene);
    const ball = createNativePhysicsBall({ position: { x: 100, y: 80 } });
    queueNativeActor(scene.actorManager, ball, 0, scene);
    assert.equal(sensor.bodies.length, 0);
    stepNativeSceneFrame(scene);
    assert.equal(sensor.pressed, true);
    assert.equal(sensor.previousPressed, false);
    assert.equal(sensor.spriteUV.x, .15625);
    assert.deepEqual(commands, []);
    ball.body.body.setTransform(3, .8, 0);
    stepNativeSceneFrame(scene);
    assert.equal(sensor.spriteUV.x, .171875);
    assert.deepEqual(commands, [['Key', 9, 0]]);
    assert.deepEqual(sounds, ['switch']);
    for (let i = 0; i < 120; i++) stepNativeSceneFrame(scene);
    assert.equal(sensor.pressed, true);
    assert.equal(commands.length, 1);
    assert.equal(sounds.length, 1);
  } finally { scene.rigidWorld.dispose(); }
});

test('PhysicsSwitch uses display position and accepts inactive sensors without category filtering', async () => {
  const scene = await makeScene();
  scene.sendCommand = () => {};
  try {
    const sensor = createNativePhysicsSwitch({ position: { x: 100, y: 100 } });
    queueNativeActor(scene.actorManager, sensor, 0, scene);
    const body = scene.rigidWorld.createBody({ x: 1.5, y: .9 }).addCircle({ radius: .03, sensor: true });
    body.setActive(false);
    sensor.beforeMotion();
    assert.equal(sensor.pressed, false);
    sensor.renderOffset.x = 50;
    sensor.beforeMotion();
    assert.equal(sensor.pressed, true);
  } finally { scene.rigidWorld.dispose(); }
});

test('a ray starting inside a fixture does not count as a PhysicsSwitch press', async () => {
  const scene = await makeScene();
  scene.sendCommand = () => {};
  try {
    const sensor = createNativePhysicsSwitch({ position: { x: 100, y: 100 } });
    queueNativeActor(scene.actorManager, sensor, 0, scene);
    scene.rigidWorld.createBody({ x: 1, y: 1 }).addCircle({ radius: .1 });
    stepNativeSceneFrame(scene);
    assert.equal(sensor.pressed, false);
  } finally { scene.rigidWorld.dispose(); }
});
