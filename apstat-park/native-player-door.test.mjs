import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeDoorController, requestNativePlayerDoorEntry } from './native-player-door.mjs';
import { createNativePlayer } from './native-player-actor.mjs';
import { createNativeBodyRegistry, attachNativeBody } from './native-body-registry.mjs';
import { createNativeBody, initializeNativeRectangleBody } from './native-body.mjs';
import { applyNativePlayerControllerChange } from './native-player-death.mjs';
import { dispatchNativeOverlapCallbacks } from './native-body-contacts.mjs';

const fixture = () => {
  const world = createNativeBodyRegistry(), events = [];
  world.map = { width: 40, height: 24, chipSize: 32, table: Array(960).fill(1), customFlags: [] };
  world.collisionMatrix[33] = 1;
  const actor = createNativePlayer({ position: { x: 100, y: 100 }, presentation: {} });
  actor.scene = { bodyWorld: world, playerInput: { pressed: action => action === 3 } };
  attachNativeBody(world, actor.body);
  actor.components = [{ consumeVelocity: value => events.push(['velocity', value]) }];
  const other = initializeNativeRectangleBody(createNativeBody(), { x: -16, y: -47, width: 32, height: 46 }, 2);
  other.category = 1; other.position = { x: 100, y: 100 }; other.previousPosition = { ...other.position };
  attachNativeBody(world, other);
  actor.body.contacts.push({ bodyId: other.id, state: 0, normal: { x: 1, y: 0 } });
  other.contacts.push({ bodyId: actor.body.id, state: 1, normal: { x: -1, y: 0 } });
  actor.body.mapContacts.push({ x: 0, y: 1 });
  actor.body.onContactEnd = (body, normal, kind) => events.push(['end', body?.id, normal.x, kind]);
  return { actor, world, other, events };
};

test('door enter hides and clears own contacts, then waits before allowing an unblocked exit', () => {
  const { actor, other, events } = fixture();
  const controller = createNativeDoorController();
  controller.enter(actor);
  assert.equal(actor.body.flags & 1, 0);
  assert.equal(actor.spriteFlags & 8, 0);
  assert.deepEqual(events, [['end', other.id, 1, 1]], 'END occurs even for unaccepted contact');
  assert.equal(actor.body.contacts.length, 0);
  assert.equal(actor.body.mapContacts.length, 1);
  assert.equal(other.contacts.length, 1);
  actor.velocity = { x: 3, y: 5 };
  controller.pre(actor, .5);
  assert.deepEqual(actor.velocity, { x: 0, y: 0 });
  controller.pre(actor, .5); controller.post(actor);
  assert.equal(actor.fallState, 0);
  controller.pre(actor, .5); controller.post(actor);
  assert.equal(actor.fallState, 0, 'disabled player still checks exit occupancy');
  other.flags &= ~1;
  controller.post(actor);
  assert.equal(actor.fallState, 2);
  controller.leave(actor);
  assert.equal(actor.body.flags & 1, 1);
  assert.equal(actor.spriteFlags & 8, 8);
});

test('door exit requires a fresh press, checks map occupancy and preserves alternate controller kind', () => {
  const { actor, world, other } = fixture();
  other.flags &= ~1;
  const controller = createNativeDoorController();
  controller.enter(actor); controller.pre(actor, 1); controller.pre(actor, 1);
  actor.scene.playerInput.pressed = () => false;
  controller.post(actor);
  assert.equal(actor.fallState, 0);
  actor.scene.playerInput.pressed = () => true;
  world.map.table[3 * 40 + 3] = 2;
  controller.post(actor);
  assert.equal(actor.fallState, 0);
  world.map.table.fill(1); actor.playerFlags |= 0x40;
  controller.post(actor);
  assert.equal(actor.fallState, 5);
  actor.fallState = 0; actor.networkOwner = {}; actor.scene.networkMode = 1;
  controller.post(actor);
  assert.equal(actor.fallState, 0);
});

test('Goal contact gates door entry and the assembled Player can construct its door controller', () => {
  const { actor } = fixture();
  const goal = { opened: false, scene: actor.scene };
  requestNativePlayerDoorEntry(goal, actor.body);
  assert.equal(actor.fallState, 0);
  goal.opened = true;
  requestNativePlayerDoorEntry(goal, actor.body);
  assert.equal(actor.fallState, 4);
  // Exercise the assembled actor's actual factory in PRE, not a test factory.
  actor.beforeMotion(1 / 60);
  assert.equal(actor.controllerKind, 4);
  assert.equal(actor.controller.state.phase, 1);
  assert.equal(actor.spriteFlags & 8, 0);
  actor.fallState = 0; goal.networkOwner = {}; actor.scene.networkMode = 1;
  requestNativePlayerDoorEntry(goal, actor.body);
  assert.equal(actor.fallState, 0);
  actor.fallState = 2;
  // Leave restores collision before the next controller enters.
  applyNativePlayerControllerChange(actor, () => null);
  assert.equal(actor.body.flags & 1, 1);
});

test('native Goal sensor accepts a later Up press during continuous overlap', () => {
  const { actor, world, other } = fixture();
  other.flags &= ~1;
  const goal = { opened: true, scene: actor.scene };
  const sensor = initializeNativeRectangleBody(createNativeBody(), { x: -24, y: -32, width: 48, height: 32 }, 0);
  sensor.category = 10;
  sensor.position = { x: 100, y: 100 };
  sensor.previousPosition = { ...sensor.position };
  sensor.onOverlap = body => requestNativePlayerDoorEntry(goal, body);
  attachNativeBody(world, sensor);
  world.collisionMatrix[1 * 32 + 10] = 1;
  world.collisionMatrix[10 * 32 + 1] = 1;
  actor.scene.playerInput.pressed = () => false;
  dispatchNativeOverlapCallbacks(world);
  assert.equal(actor.fallState, 0);
  actor.scene.playerInput.pressed = action => action === 3;
  dispatchNativeOverlapCallbacks(world);
  assert.equal(actor.fallState, 4);
});
