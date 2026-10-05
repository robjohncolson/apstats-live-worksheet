import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeDeathController, createNativeHiddenController,
  applyNativePlayerControllerChange } from './native-player-death.mjs';
import { runNativeCommonActorPre, runNativeCommonActorPost } from './native-actor-lifecycle.mjs';
import { createNativeBody } from './native-body.mjs';
import { NATIVE_FRAME_SECONDS } from './native-scene-frame.mjs';

const fixture = () => {
  const events = [];
  const actor = { scene: { flags: 0, viewScale: 1, stageRetryEligible: true },
    position: { x: 100, y: 600 }, velocity: { x: 3, y: 8 }, spriteFlags: 9,
    bodies: [{ body: { flags: 65 } }, { body: { flags: 1 } }],
    components: [{ consumeVelocity: value => events.push(['velocity', { ...value }]) }],
    resetSpriteBounds: () => events.push(['bounds']),
    setAnimation: value => events.push(['animation', value]) };
  return { actor, events };
};

test('death controller stops, selects death art, waits one second, then launches and accelerates', () => {
  const { actor, events } = fixture();
  const controller = createNativeDeathController();
  controller.pre(actor, .5);
  assert.deepEqual(events, [['velocity', { x: 0, y: 0 }], ['bounds'], ['animation', 4]]);
  assert.equal(actor.bodies[0].body.flags, 64);
  assert.equal(actor.bodies[1].body.flags, 1);
  assert.equal(actor.spriteFlags, 9, 'death animation stays visible');
  controller.pre(actor, .5);
  assert.equal(controller.state.phase, 1, 'initialization frame does not advance the delay');
  controller.pre(actor, .5);
  assert.deepEqual(actor.velocity, { x: 0, y: -9 });
  controller.pre(actor, 1 / 60);
  assert.equal(actor.velocity.y, Math.fround(-9 + Math.fround(.65)));
  actor.position.y = 2880;
  controller.pre(actor, 1 / 60);
  assert.equal(actor.fallState, undefined, 'strictly beyond four viewport heights');
  actor.position.y = 2881;
  controller.pre(actor, 1 / 60);
  assert.equal(actor.fallState, 1);
  assert.equal(actor.scene.flags & 2, 2);
});

test('replicated death initializes art once then waits for authoritative motion', () => {
  const { actor, events } = fixture();
  actor.networkOwner = {}; actor.scene.networkMode = 1;
  const controller = createNativeDeathController();
  controller.pre(actor, .5);
  actor.velocity = { x: 3, y: -9 };
  controller.pre(actor, 10);
  assert.deepEqual(actor.velocity, { x: 0, y: 0 });
  assert.equal(controller.state.elapsed, 0);
  assert.equal(events.filter(event => event[0] === 'animation').length, 1);
});

test('hidden controller restores visibility and primary body on exit; transition ordering is native', () => {
  const { actor, events } = fixture();
  actor.fallState = 1;
  actor.controller = { leave: () => events.push(['leave']), dispose: () => events.push(['dispose']) };
  applyNativePlayerControllerChange(actor, kind => {
    events.push(['create', kind, actor.controller]);
    return createNativeHiddenController();
  });
  assert.deepEqual(events.slice(0, 3), [['leave'], ['dispose'], ['create', 1, null]]);
  assert.equal(actor.controllerKind, 1);
  assert.equal(actor.fallState, 0);
  assert.equal(actor.spriteFlags, 1);
  assert.equal(actor.bodies[0].body.flags, 64);
  assert.equal(actor.bodies[1].body.flags, 1);
  actor.fallState = 2;
  applyNativePlayerControllerChange(actor, () => ({ enter: value => {
    assert.equal(value.spriteFlags, 9);
    assert.equal(value.bodies[0].body.flags, 65);
  } }));
  assert.equal(actor.controllerKind, 2);
});

test('death completion uses view scale and does not force retry on ineligible scenes', () => {
  const { actor } = fixture();
  actor.scene.viewScale = 2; actor.scene.stageRetryEligible = false;
  const controller = createNativeDeathController();
  controller.pre(actor, 1);
  controller.pre(actor, 1);
  actor.position.y = 1441;
  controller.pre(actor, 1);
  assert.equal(actor.fallState, 1);
  assert.equal(actor.scene.flags, 0);
});

test('native common actor lifecycle carries the full death arc into hidden state without teleporting', () => {
  const { actor } = fixture();
  actor.bodies = [{ body: createNativeBody(), followsActor: true }];
  actor.acceleration = { x: 0, y: 0 };
  actor.manager = { flags: 0 };
  actor.fallState = 3;
  const createController = kind => kind === 3 ? createNativeDeathController() : createNativeHiddenController();
  actor.beforeMotion = dt => {
    applyNativePlayerControllerChange(actor, createController);
    actor.controller.pre(actor, dt);
  };
  actor.afterMotion = () => actor.controller.post(actor);
  const positions = [];
  for (let frame = 0; frame < 300 && actor.controllerKind !== 1; frame++) {
    runNativeCommonActorPre(actor, NATIVE_FRAME_SECONDS);
    runNativeCommonActorPost(actor, NATIVE_FRAME_SECONDS);
    positions.push({ ...actor.position });
  }
  assert.equal(actor.controllerKind, 1);
  assert.equal(actor.scene.flags & 2, 2);
  assert.ok(positions.slice(0, 61).every(position => position.y === 600));
  assert.equal(positions[61].y, 591, 'float32 delay crosses one second on the 61st accumulated tick');
  assert.ok(Math.min(...positions.map(position => position.y)) < 540);
  assert.ok(actor.position.y > 2880);
  assert.ok(positions.every(position => position.x === 100));
  assert.deepEqual(actor.bodies[0].body.position, actor.position);
  assert.equal(actor.bodies[0].body.flags & 1, 0);
  assert.equal(actor.spriteFlags & 8, 0);
  assert.deepEqual(actor.velocity, { x: 0, y: 0 });
});
