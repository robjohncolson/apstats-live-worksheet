import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeBody } from './native-body.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
import { nativeStackMovementExtreme, nativePlayerDisplayRange,
  nativePlayerMovementBoundary, nativeAutoScrollSpeed, checkNativePlayerFallBounds,
  carryNativeScrollNeighbors, applyNativePlayerScrollBoundary } from './native-player-boundary.mjs';

const fixture = () => {
  const world = createNativeBodyRegistry();
  const scene = { players: [], viewScale: 1, viewPosition: { x: 0, y: 0 },
    viewOffset: { x: 0, y: 0 }, scrollMode: 0, scrollLimit: -1, flags: 0,
    scrollFlags: 0, scrollSpeed: 3, mapWidth: 80, chipSize: 32, mapOffset: 0 };
  const add = x => {
    const body = createNativeBody();
    const actor = { position: { x, y: 0 }, scene, cameraRelative: true,
      controllerKind: 2, spriteFlags: 8, bodies: [{ body }] };
    body.actor = actor; body.category = 1;
    attachNativeBody(world, body); scene.players.push(actor);
    return actor;
  };
  const up = (lower, upper) => lower.bodies[0].body.contacts.push({
    bodyId: upper.bodies[0].body.id, normal: { x: 0, y: -1 } });
  return { scene, add, up };
};

test('viewport clipping follows the player stack, display offsets, and stale contacts', () => {
  const { scene, add, up } = fixture();
  const lower = add(1250), upper = add(1278), ignored = add(1400);
  up(lower, upper); up(lower, ignored); ignored.bodies[0].body.category = 2;
  lower.bodies[0].body.contacts.push({ bodyId: 999999, normal: { x: 0, y: -1 } });
  assert.equal(nativePlayerMovementBoundary(scene, lower, 3), 2);
  assert.equal(nativePlayerMovementBoundary(scene, lower, -3), -3);
  upper.renderOffset = { x: 1, y: 0 };
  assert.equal(nativePlayerMovementBoundary(scene, lower, 3), 1);
  scene.viewPosition.x = 1251;
  assert.equal(nativePlayerMovementBoundary(scene, lower, -3), 1);
  assert.equal(nativePlayerMovementBoundary(scene, lower, 2 ** -23), 0);
  scene.viewPosition.x = 0; scene.viewScale = 2;
  assert.equal(nativePlayerMovementBoundary(scene, lower, 3), -639);
});

test('stack traversal terminates cyclic contacts at the original depth limit', () => {
  const { add, up } = fixture();
  const a = add(5), b = add(9);
  up(a, b); up(b, a);
  assert.equal(nativeStackMovementExtreme(a.bodies[0].body, 1), 9);
  assert.equal(nativeStackMovementExtreme(a.bodies[0].body, -1), 5);
  assert.equal(nativeStackMovementExtreme(a.bodies[0].body, 1, 64), 5);
});

test('scrolling spread preserves the native left/right asymmetry and active-player filter', () => {
  const { scene, add } = fixture();
  scene.scrollMode = 1;
  const left = add(10), right = add(1257), hidden = add(1600);
  hidden.spriteFlags = 0;
  assert.deepEqual(nativePlayerDisplayRange(scene), { min: 10, max: 1257 });
  assert.equal(nativePlayerMovementBoundary(scene, right, 3), 1);
  assert.equal(nativePlayerMovementBoundary(scene, left, -3), -1);
  left.position.x = 11;
  assert.equal(nativePlayerMovementBoundary(scene, left, -1), -1);
  hidden.controllerKind = 3;
  assert.equal(nativePlayerDisplayRange(scene).max, 1600);
  scene.cameraAnchor = { position: { x: -20, y: 0 } };
  assert.equal(nativePlayerDisplayRange(scene).min, -20);
  scene.scrollLimit = 0;
  assert.equal(nativePlayerMovementBoundary(scene, right, 3), 3, 'past scroll limit uses viewport');
});

test('autoscroll stops at map extent and respects controller/network gates and endless flag', () => {
  const { scene, add } = fixture();
  const player = add(200);
  assert.equal(nativeAutoScrollSpeed(scene), 0);
  scene.scrollMode = 2;
  assert.equal(nativeAutoScrollSpeed(scene), 3);
  scene.viewPosition.x = 1279;
  assert.equal(nativeAutoScrollSpeed(scene), 1);
  scene.viewPosition.x = 1281;
  assert.equal(nativeAutoScrollSpeed(scene), -1);
  scene.scrollFlags = 8;
  assert.equal(nativeAutoScrollSpeed(scene), 3);
  player.controllerKind = 3;
  assert.equal(nativeAutoScrollSpeed(scene), 0);
  player.controllerKind = 2; scene.flags = 0x100; scene.networkMode = 1;
  assert.equal(nativeAutoScrollSpeed(scene), 0);
  scene.networkMode = 0;
  assert.equal(nativeAutoScrollSpeed(scene), 3);
});

test('fall boundaries defer death during relocation and preserve local authority and retry eligibility', () => {
  const { scene, add } = fixture();
  const actor = add(100), commands = [], velocities = [];
  scene.maximumPlayerY = 720; scene.minimumPlayerY = -100;
  scene.stageRetryEligible = true;
  actor.components = [{ consumeVelocity: value => velocities.push({ ...value }) }];
  actor.onCommand = command => commands.push(command);
  const state = { pendingPosition: { x: 100, y: 600 } };
  actor.position.y = 721; actor.velocity = { x: 3, y: 5 }; actor.acceleration = { x: 1, y: 2 };
  checkNativePlayerFallBounds(scene, actor, state);
  assert.deepEqual(commands, []);
  assert.deepEqual(velocities, [{ x: 0, y: 0 }]);
  assert.deepEqual(actor.acceleration, { x: 0, y: 0 });
  assert.equal(scene.flags, 0);
  state.pendingPosition = { x: 0, y: 0 };
  actor.networkOwner = {}; scene.networkMode = 1;
  checkNativePlayerFallBounds(scene, actor, state);
  assert.deepEqual(commands, []);
  scene.networkMode = 0;
  checkNativePlayerFallBounds(scene, actor, state);
  assert.deepEqual(commands, [4]);
  assert.equal(actor.fallState, 1);
  assert.equal(scene.flags & 2, 2);
  commands.length = 0; scene.flags = 0; scene.stageRetryEligible = false;
  actor.position.y = -100;
  checkNativePlayerFallBounds(scene, actor, state);
  assert.deepEqual(commands, []);
  actor.position.y = -101;
  checkNativePlayerFallBounds(scene, actor, state);
  assert.deepEqual(commands, [4]);
  assert.equal(scene.flags, 0);
  commands.length = 0; scene.minimumPlayerY = 0;
  checkNativePlayerFallBounds(scene, actor, state);
  assert.deepEqual(commands, [], 'nonnegative upper boundary is disabled');
});

test('scroll carry follows right category1 contacts, synchronizes bodies and moves shared descendants once', () => {
  const { add } = fixture();
  const actors = [add(-5), add(10), add(20), add(30), add(40), add(50)];
  for (const actor of actors) actor.bodies[0].followsActor = true;
  const link = (a, b) => actors[a].bodies[0].body.contacts.push({
    bodyId: actors[b].bodies[0].body.id, normal: { x: 1, y: 0 } });
  link(0, 1); link(0, 2); link(1, 3); link(2, 3); link(0, 4); link(0, 5);
  actors[4].bodies[0].body.category = 2;
  actors[5].bodies[0].body.flags |= 16;
  const order = [];
  actors.forEach((actor, index) => { actor.onCarried = delta => {
    order.push(index);
    assert.deepEqual(actor.bodies[0].body.position, actor.position);
    delta.x = 99;
  }; });
  carryNativeScrollNeighbors(actors[0], { x: 5, y: 0 });
  assert.deepEqual(order, [1, 3, 2]);
  assert.deepEqual(actors.map(actor => actor.position.x), [-5, 15, 25, 35, 40, 50]);
  assert.deepEqual(actors[3].postResetVector, { x: 5, y: 0 });
});

test('scroll boundary corrects velocity before death threshold and honors damage eligibility', () => {
  const { scene, add } = fixture();
  const actor = add(-14.5), commands = [];
  actor.canReceiveDamage = () => true;
  actor.onCommand = command => commands.push(command);
  scene.scrollMode = 2;
  const velocity = { x: -3, y: 4 };
  applyNativePlayerScrollBoundary(scene, actor, velocity);
  assert.deepEqual(velocity, { x: 17.5, y: 4 });
  assert.deepEqual(commands, [], 'exact boundary equality is not death');
  actor.position.x = -15; velocity.x = -3;
  applyNativePlayerScrollBoundary(scene, actor, velocity);
  assert.deepEqual(commands, [4]);
  assert.equal(actor.position.x, -15, 'the current actor moves later through its velocity');
  commands.length = 0; actor.canReceiveDamage = () => false;
  applyNativePlayerScrollBoundary(scene, actor, velocity);
  assert.deepEqual(commands, []);
  scene.scrollMode = 0; velocity.x = -3;
  applyNativePlayerScrollBoundary(scene, actor, velocity);
  assert.equal(velocity.x, -3);
  scene.scrollFlags = 0x1000;
  applyNativePlayerScrollBoundary(scene, actor, velocity);
  assert.equal(velocity.x, 15, 'flag1000 applies the edge constraint without autoscroll');
});
