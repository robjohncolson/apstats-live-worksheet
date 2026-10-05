import { createNativeRigidBody, createNativeRigidRectangle } from './native-rigid-body.mjs';
import { createNativeRevoluteJoint, createNativeGearJoint } from './native-rigid-joint.mjs';
import { createNativeRigidBodyComponent, createNativePivotComponent, createNativeGearComponent } from './native-rigid-components.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
import { unregisterNativeActorBodies } from './native-actor-bodies.mjs';
const f = Math.fround;
const rectangles = [
  { x: -300, y: -10, width: 600, height: 20 },
  { x: -300, y: -10, width: 450, height: 20 },
  { x: -150, y: -10, width: 450, height: 20 },
]; // bcbc230, stride 16
const ANGLE_LIMIT = f(.1745329201221466);
const SPRITE_ANGLE_SCALE = f(10430.3779296875); // bcbb548

// bb5d420/bb5d700/bb5d870 physical actor model. Renderer and campaign factory
// integration are separate; this is not the old weight-based tilt heuristic.
export function createNativeSeesaw({ type = 0, position = { x: 0, y: 0 }, parent = false } = {}) {
  if (!Number.isInteger(type) || !rectangles[type]) throw new Error('Unknown native seesaw type');
  const body = createNativeRigidBody({ type: 1, gravityScale: 0,
    shape: createNativeRigidRectangle({ ...rectangles[type], density: 1, friction: 1 }) });
  const pivot = createNativeRevoluteJoint();
  pivot.setBodies(null, body);
  pivot.setLimits(-ANGLE_LIMIT, ANGLE_LIMIT);
  const gear = createNativeGearJoint();
  const gearComponent = createNativeGearComponent(gear);
  const actor = {
    type, body, pivot, gear, scene: null, flags: 0, bodies: [], components: [],
    position: { x: f(position.x), y: f(position.y) },
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 },
    renderOffset: { x: 0, y: 0 }, targetAngle: 0, spriteAngle: 0,
    onAdded(scene) {
      actor.scene = scene;
      runNativeCommonActorAdded(actor, scene);
    },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre(dt) { runNativeCommonActorPre(actor, dt); },
    onPost(dt) { runNativeCommonActorPost(actor, dt); },
    onAlternatePre(dt) { runNativeCommonActorAlternatePre(actor, dt); },
    beforeMotion(dt) { // bb5da90 only on SeesawParent, confirmed vtable +c8
      if (parent) body.setAngularVelocity(f(f(actor.targetAngle - body.getAngle()) * f(1 / f(dt))));
    },
    afterMotion() { // bb5d870
      actor.position = body.getPosition();
      actor.spriteAngle = Math.trunc(f(body.getAngle() * SPRITE_ANGLE_SCALE));
    },
    setTargetAngle(value) { actor.targetAngle = f(value); }, // bb5db00 command 12 payload
    connectParent(other) { // bb5d9e0
      if (!gear.setConnections(other.body, body, other.pivot, pivot)) return false;
      gear.setRatio(-1);
      if (!actor.components.includes(gearComponent)) actor.components.push(gearComponent);
      if (actor.scene) gearComponent.onAdded(actor.scene);
      return true;
    },
  };
  actor.components.push(createNativeRigidBodyComponent(actor, body), createNativePivotComponent(pivot));
  return actor;
}
