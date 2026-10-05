import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNativeRigidWorld } from './native-rigid-world.mjs';
import { createNativeRigidBody, createNativeRigidCircle } from './native-rigid-body.mjs';
import { rayCastNativeRigidWorld } from './native-rigid-raycast.mjs';
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const makeWorld = () => createNativeRigidWorld({ moduleOptions: { wasmBinary } });

test('native ray returns nearest shape hit with float32 pixel interpolation and wrapper identity', async () => {
  const world = await makeWorld();
  try {
    const circle = createNativeRigidBody({ position: { x: 0, y: -10 }, shape: createNativeRigidCircle({ radius: 3 }) });
    circle.attach(world);
    const farther = createNativeRigidBody({ position: { x: 0, y: -14 }, shape: createNativeRigidCircle({ radius: .25 }) });
    farther.attach(world); // visited first, but must lose to the closer circle
    const hit = rayCastNativeRigidWorld(world, { x: 0, y: 0 }, { x: 0, y: -16 });
    assert.equal(hit.body, circle);
    assert.ok(Math.abs(hit.position.y + 7) < 1e-5);
    assert.ok(Math.abs(hit.normal.y - 1) < 1e-6);
    assert.equal(rayCastNativeRigidWorld(world, { x: 100, y: 0 }, { x: 100, y: -16 }), null);
  } finally { world.dispose(); }
});

test('direct native scan includes inactive sensors and equal fractions retain the newest body', async () => {
  const world = await makeWorld();
  try {
    const old = world.createBody({ y: -1 }).addCircle({ radius: .5 });
    const latest = world.createBody({ y: -1, active: false }).addCircle({ radius: .5, sensor: true });
    assert.equal(world.rayCast({ x: 0, y: 0 }, { x: 0, y: -2 }).body, latest);
    latest.destroy();
    assert.equal(world.rayCast({ x: 0, y: 0 }, { x: 0, y: -2 }).body, old);
  } finally { world.dispose(); }
});

test('query honors body transform, accepts endpoint hits, and does not report rays starting inside a shape', async () => {
  const world = await makeWorld();
  try {
    world.createBody({ x: 1, angle: Math.PI / 2 }).addBox({ halfWidth: 1, halfHeight: .25 });
    const hit = world.rayCast({ x: 1, y: -2 }, { x: 1, y: -1 });
    assert.ok(hit && Math.abs(hit.fraction - 1) < 1e-6);
    assert.equal(world.rayCast({ x: 1, y: 0 }, { x: 1, y: -2 }), null);
    world.dispose();
    assert.throws(() => world.rayCast({ x: 0, y: 0 }, { x: 0, y: 1 }), /disposed/);
  } finally { world.dispose(); }
});
