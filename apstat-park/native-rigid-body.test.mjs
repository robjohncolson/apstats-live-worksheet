import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNativeRigidWorld } from './native-rigid-world.mjs';
import { createNativeRigidBody, createNativeRigidCircle, createNativeRigidRectangle } from './native-rigid-body.mjs';
const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const makeWorld = gravity => createNativeRigidWorld({ gravity, moduleOptions: { wasmBinary } });
const f = Math.fround, scale = f(.01), dt = f(1 / 60);

test('native rectangle flips Y, builds a hull in pixels, then scales vertices without scaling its centroid', async () => {
  const world = await makeWorld({ x: 0, y: 0 });
  try {
    const wrapper = createNativeRigidBody({ type: 1,
      shape: createNativeRigidRectangle({ x: 10, y: 20, width: 30, height: 40, density: 2 }) });
    wrapper.attach(world);
    const polygon = wrapper.body.readPolygonFixture();
    assert.equal(polygon.radius, f(.01));
    assert.ok(Math.abs(polygon.centroid.x - 25) < 1e-5);
    assert.ok(Math.abs(polygon.centroid.y + 40) < 1e-5);
    assert.deepEqual(polygon.vertices, [[40, -60], [40, -20], [10, -20], [10, -60]]
      .map(([x, y]) => ({ x: f(x * scale), y: f(y * scale) })));
    assert.deepEqual(polygon.normals, [{ x: 1, y: -0 }, { x: 0, y: 1 }, { x: -1, y: -0 }, { x: 0, y: -1 }]);
    assert.ok(Math.abs(wrapper.body.read().mass - .24) < 1e-6);
    assert.equal(wrapper.body.readPolygonFixture(1), null);
  } finally { world.dispose(); }
});

test('native rectangle lands on the actual solver floor using its inverted local Y bounds', async () => {
  const world = await makeWorld({ x: 0, y: 10 });
  try {
    world.createBody({ y: 5 }).addBox({ halfWidth: 10, halfHeight: .5 });
    const wrapper = createNativeRigidBody({ type: 1,
      shape: createNativeRigidRectangle({ x: -50, y: 0, width: 100, height: 100, density: 1 }) });
    wrapper.attach(world);
    for (let i = 0; i < 240; i++) world.step(dt);
    const state = wrapper.body.read();
    assert.ok(state.y > 4.47 && state.y < 4.5, 'local bottom is zero, rather than half-height below the origin');
    assert.equal(state.vy, 0);
    assert.equal(state.awake, false);
  } finally { world.dispose(); }
});

test('rigid wrapper applies native float32 pixel conversions and exposes itself to the shape callback', async () => {
  const world = await makeWorld({ x: 0, y: 0 });
  try {
    let observed;
    const wrapper = createNativeRigidBody({ type: 1, position: { x: 123.456, y: 76.543 },
      velocity: { x: 300, y: -200 }, angularVelocity: 2, angle: .25,
      shape: { attach(value) { observed = [value.world, value.body.userData, value.body.read()]; } } });
    assert.equal(wrapper.attach(world), true);
    assert.equal(wrapper.attach(world), false);
    assert.equal(observed[0], world);
    assert.equal(observed[1], wrapper);
    assert.equal(observed[2].x, f(f(123.456) * scale));
    assert.equal(observed[2].vx, f(300 * scale));
    assert.equal(observed[2].vy, f(-200 * scale));
    assert.equal(observed[2].angularVelocity, 2);
    assert.deepEqual(wrapper.getPosition(), { x: f(observed[2].x / scale), y: f(observed[2].y / scale) });
    assert.equal(wrapper.getAngle(), f(.25));
  } finally { world.dispose(); }
});

test('only native type 1 creates a dynamic body; other values remain static', async () => {
  const world = await makeWorld({ x: 0, y: 10 });
  try {
    const wrappers = [0, 1, 2, -1].map((type, index) => createNativeRigidBody({ type, position: { x: index * 100, y: 0 },
      shape: createNativeRigidCircle({ radius: 12, density: 1 }), velocity: { x: 100, y: 0 } }));
    for (const wrapper of wrappers) wrapper.attach(world);
    world.step(dt);
    assert.ok(wrappers[1].body.read().mass > 0);
    assert.ok(wrappers[1].body.read().x > 1);
    for (const index of [0, 2, 3]) {
      assert.equal(wrappers[index].body.read().mass, 0);
      assert.deepEqual(wrappers[index].getPosition(), { x: f(f(index * 100 * scale) / scale), y: 0 });
    }
  } finally { world.dispose(); }
});

test('velocity setters preserve the other component and do not replace reattachment snapshots', async () => {
  const world = await makeWorld({ x: 0, y: 0 });
  try {
    const wrapper = createNativeRigidBody({ type: 1, velocity: { x: 100, y: 200 }, angularVelocity: 3,
      shape: createNativeRigidCircle({ radius: 12, density: 1 }) });
    wrapper.attach(world);
    wrapper.setVelocity({ x: 400, y: 500 });
    assert.equal(wrapper.body.read().angularVelocity, 3);
    wrapper.setAngularVelocity(6);
    assert.equal(wrapper.body.read().vx, f(400 * scale));
    wrapper.detach();
    assert.deepEqual(wrapper.getPosition(), { x: 0, y: 0 });
    assert.equal(wrapper.getAngle(), 0);
    wrapper.attach(world);
    assert.equal(wrapper.body.read().vx, f(100 * scale));
    assert.equal(wrapper.body.read().angularVelocity, 3);
  } finally { world.dispose(); }
});

test('stored damping survives detach; live active state resets at reattachment', async () => {
  const world = await makeWorld({ x: 0, y: 10 });
  try {
    const wrapper = createNativeRigidBody({ type: 1, shape: createNativeRigidCircle({ radius: 10, density: 1 }) });
    assert.equal(wrapper.isActive(), false);
    assert.equal(wrapper.isAwake(), false);
    wrapper.setAngularDamping(2);
    wrapper.attach(world);
    assert.equal(wrapper.body.read().angularDamping, 2);
    wrapper.setAngularDamping(4);
    wrapper.setActive(false);
    world.step(dt);
    assert.equal(wrapper.isActive(), false);
    assert.equal(wrapper.getPosition().y, 0);
    wrapper.detach();
    wrapper.attach(world);
    assert.equal(wrapper.isActive(), true);
    assert.equal(wrapper.body.read().angularDamping, 4);
  } finally { world.dispose(); }
});

test('circle radius converts to meters while stored local center is passed through unchanged', async () => {
  const world = await makeWorld({ x: 0, y: 0 });
  try {
    const wrapper = createNativeRigidBody({ type: 1,
      shape: createNativeRigidCircle({ radius: 12, x: 2, density: 1 }) });
    wrapper.attach(world);
    wrapper.setAngularVelocity(1);
    world.step(dt);
    const state = wrapper.body.read();
    assert.ok(Math.abs(state.mass - Math.PI * f(12 * scale) ** 2) < 1e-6);
    assert.ok(Math.abs(state.y + 2 * Math.sin(dt)) < 1e-6,
      'the center offset is 2 meters, not 2 pixels');
  } finally { world.dispose(); }
});

test('native circle material default is zero friction, permitting unbraked contact sliding', async () => {
  const world = await makeWorld({ x: 0, y: 10 });
  try {
    world.createBody({ y: 5 }).addBox({ halfWidth: 10, halfHeight: .5, friction: 1 });
    const wrapper = createNativeRigidBody({ type: 1, position: { x: 0, y: 400 }, velocity: { x: 100, y: 0 },
      shape: createNativeRigidCircle({ radius: 50, density: 1 }) });
    wrapper.attach(world);
    for (let i = 0; i < 120; i++) world.step(dt);
    assert.equal(wrapper.body.read().vx, f(100 * scale));
    assert.equal(wrapper.body.read().angularVelocity, 0);
    assert.ok(wrapper.getPosition().y < 401);
  } finally { world.dispose(); }
});

test('missing world/shape prevent attachment and registered joint notifications precede body destruction', async () => {
  const world = await makeWorld({ x: 0, y: 0 });
  try {
    assert.equal(createNativeRigidBody().attach(world), false);
    const wrapper = createNativeRigidBody({ shape: createNativeRigidCircle({ radius: 12 }) });
    assert.equal(wrapper.attach(null), false);
    wrapper.attach(world);
    let calls = 0;
    wrapper.joints = [{ onBodyRemoved() { assert.ok(wrapper.body); assert.equal(wrapper.world, world); calls++; } }];
    wrapper.detach();
    wrapper.detach();
    assert.equal(calls, 1);
    assert.equal(wrapper.body, null);
  } finally { world.dispose(); }
});
