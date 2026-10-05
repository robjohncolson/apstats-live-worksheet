import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createNativeRigidWorld } from './native-rigid-world.mjs';
import { createNativeRigidBody, createNativeRigidCircle } from './native-rigid-body.mjs';
import { createNativeRevoluteJoint } from './native-rigid-joint.mjs';

const wasmBinary = await readFile(new URL('./recovered/box2d.wasm', import.meta.url));
const makeWorld = () => createNativeRigidWorld({ moduleOptions: { wasmBinary } });
function makeBody(world, angle = 0) {
  const body = createNativeRigidBody({ type: 1, angle,
    shape: createNativeRigidCircle({ radius: 20, density: 1 }) });
  body.attach(world);
  return body;
}

test('native revolute uses pixel local anchors and zero reference angle even for rotated bodies', async () => {
  const world = await makeWorld();
  try {
    const a = makeBody(world, .25), b = makeBody(world, .75);
    const joint = createNativeRevoluteJoint();
    joint.setBodies(a, b);
    joint.setAnchors({ x: 123.456, y: -50 }, { x: 20, y: 30 });
    joint.setLimits(-.5, .5);
    joint.flags = 3;
    assert.equal(joint.attach(world), true);
    assert.equal(joint.attach(world), false);
    const state = joint.joint.read();
    assert.equal(state.anchorA.x, Math.fround(Math.fround(123.456) * Math.fround(.01)));
    assert.equal(state.anchorA.y, -.5);
    assert.equal(state.referenceAngle, 0);
    assert.equal(state.angle, .5);
    assert.equal(state.limit, true);
    assert.equal(state.lower, -.5);
    assert.equal(state.collideConnected, true);
  } finally { world.dispose(); }
});

test('null first body anchors to ground and the solver enforces stored angle limits', async () => {
  const world = await makeWorld();
  try {
    const body = makeBody(world);
    const joint = createNativeRevoluteJoint();
    joint.setBodies(null, body);
    joint.setLimits(-.2, .2);
    joint.attach(world);
    body.setAngularVelocity(3);
    for (let i = 0; i < 120; i++) world.step(Math.fround(1 / 60));
    assert.ok(body.getAngle() > .19 && body.getAngle() < .24);
    assert.deepEqual(body.getPosition(), { x: 0, y: 0 });
  } finally { world.dispose(); }
});

test('definition edits are deferred until reattachment and explicit detach unlinks both bodies', async () => {
  const world = await makeWorld();
  try {
    const a = makeBody(world), b = makeBody(world);
    const joint = createNativeRevoluteJoint();
    joint.setBodies(a, b);
    joint.attach(world);
    joint.setLimits(-1, 1);
    joint.setAnchors({ x: 100, y: 0 }, { x: 0, y: 0 });
    assert.equal(joint.joint.read().limit, false);
    assert.equal(joint.joint.read().anchorA.x, 0);
    const oldHandle = joint.joint;
    joint.detach();
    assert.equal(a.joints.length, 0);
    assert.equal(b.joints.length, 0);
    assert.throws(() => oldHandle.read(), /not live/);
    joint.attach(world);
    assert.equal(joint.joint.read().limit, true);
    assert.equal(joint.joint.read().anchorA.x, 1);
  } finally { world.dispose(); }
});

test('body removal clears every attached joint in newest-first order without skipping mutated links', async () => {
  const world = await makeWorld();
  try {
    const a = makeBody(world), b = makeBody(world), c = makeBody(world);
    const first = createNativeRevoluteJoint(), second = createNativeRevoluteJoint();
    first.setBodies(a, b); first.attach(world);
    second.setBodies(a, c); second.attach(world);
    const handles = [first.joint, second.joint];
    assert.deepEqual(a.joints, [second, first]);
    a.detach();
    assert.equal(first.isAttached(), false);
    assert.equal(second.isAttached(), false);
    assert.equal(b.joints.length, 0);
    assert.equal(c.joints.length, 0);
    for (const handle of handles) assert.throws(() => handle.read(), /not live/);
    a.attach(world);
    assert.equal(first.attach(world), true);
  } finally { world.dispose(); }
});

test('missing target does not attach and cross-world bodies are rejected before entering WASM', async () => {
  const first = await makeWorld(), second = await makeWorld();
  try {
    const joint = createNativeRevoluteJoint();
    assert.equal(joint.attach(first), false);
    joint.setBodies(makeBody(first), makeBody(second));
    assert.throws(() => joint.attach(first), /supplied world/);
  } finally { first.dispose(); second.dispose(); }
});
