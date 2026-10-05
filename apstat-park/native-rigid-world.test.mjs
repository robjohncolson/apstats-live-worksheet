import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNativeRigidWorld } from './native-rigid-world.mjs';
import { runRigidWorldFixtures } from './native-rigid-world.fixtures.mjs';

const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const reference = JSON.parse(await readFile(new URL('./recovered/box2d-reference.json', import.meta.url), 'utf8'));

test('WASM solver matches independent desktop free-fall, floor contact and revolute-joint fixtures', async () => {
  const result = await runRigidWorldFixtures({ wasmBinary });
  for (const [name, fields] of Object.entries(reference)) {
    for (const [field, expected] of Object.entries(fields)) {
      assert.ok(Math.abs(result[name][field] - expected) < 2e-5,
        `${name}.${field}: WASM ${result[name][field]}, desktop ${expected}`);
    }
  }
  assert.equal(result.floor.awake, false, 'resting body reaches the native sleep state');
});

test('independent WASM worlds produce identical deterministic fixture states', async () => {
  assert.deepEqual(await runRigidWorldFixtures({ wasmBinary }), await runRigidWorldFixtures({ wasmBinary }));
});

test('body destruction and world disposal invalidate handles without crossing world ownership', async () => {
  const a = await createNativeRigidWorld({ moduleOptions: { wasmBinary } });
  const b = await createNativeRigidWorld({ moduleOptions: { wasmBinary } });
  try {
    const bodyA = a.createBody(), bodyB = b.createBody();
    assert.throws(() => a.createRevoluteJoint(bodyA, bodyB, { x: 0, y: 0 }), /not live/);
    bodyA.destroy();
    assert.throws(() => bodyA.read(), /not live/);
    a.dispose();
    assert.throws(() => a.step(1 / 60), /disposed/);
    assert.throws(() => a.createBody(), /disposed/);
    assert.equal(bodyB.read().x, 0);
  } finally { a.dispose(); b.dispose(); }
});

test('sensor fixtures do not stop falling bodies and static bodies ignore requested velocity', async () => {
  const world = await createNativeRigidWorld({ gravity: { x: 0, y: 10 }, moduleOptions: { wasmBinary } });
  try {
    const floor = world.createBody({ y: 2 }).addBox({ halfWidth: 10, halfHeight: .5, sensor: true });
    floor.setVelocity(20, 20);
    const ball = world.createBody({ type: 2 }).addCircle({ radius: .5, density: 1 });
    for (let tick = 0; tick < 60; tick++) world.step(Math.fround(1 / 60));
    assert.equal(floor.read().y, 2);
    assert.ok(ball.read().y > 5);
  } finally { world.dispose(); }
});
