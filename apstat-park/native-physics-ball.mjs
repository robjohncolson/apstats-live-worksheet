import { createNativeRigidBody, createNativeRigidCircle } from './native-rigid-body.mjs';
import { createNativeRigidBodyComponent } from './native-rigid-components.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
import { unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { markNativeActorForRemoval } from './native-actor-manager.mjs';
const f = Math.fround;

// bb55c30/bb55d80/bb55e40/bb56000: local PhysicsBall actor. PhysicsArea's
// discriminator lives at rigid wrapper+c, distinct from custom body category.
export function createNativePhysicsBall({ position = { x: 0, y: 0 } } = {}) {
  const body = createNativeRigidBody({ type: 1, angularDamping: .5,
    shape: createNativeRigidCircle({ radius: 12, density: .1, friction: .5, restitution: .2 }) });
  const actor = {
    body, scene: null, flags: 0, bodies: [], components: [], countdown: 0,
    position: { x: f(position.x), y: f(position.y) }, velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    renderScale: { x: 1, y: 1 }, alphaByte: 255, spriteAngle: 0,
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre(dt) { runNativeCommonActorPre(actor, dt); },
    onPost(dt) { runNativeCommonActorPost(actor, dt); },
    onAlternatePre(dt) { runNativeCommonActorAlternatePre(actor, dt); },
    beforeMotion() {
      const old = actor.countdown;
      if (old === 0) {
        // Native tests neither IsTouching nor manifold point count here.
        for (const contact of body.body.readContacts()) {
          if (contact.body.userData?.discriminator !== 1) continue;
          if (Math.abs(f(1 - Math.abs(contact.localNormal.y))) <= 2 ** -23) actor.countdown = 30;
        }
        return;
      }
      if (old >= 20) {
        const scale = f(Math.pow(1.0499999523162842, 31 - old));
        actor.renderScale = { x: scale, y: scale };
        actor.alphaByte = Math.trunc(f(f((old - 20) / 10) * 255));
      }
      actor.countdown = old - 1;
      if (actor.countdown === 0) { markNativeActorForRemoval(actor); return; }
      if (actor.countdown < 15) body.body.setAwake(false);
    },
    afterMotion() {
      actor.position = body.getPosition();
      actor.spriteAngle = Math.trunc(f(body.getAngle() * f(10430.3779296875)));
    },
  };
  actor.components.push(createNativeRigidBodyComponent(actor, body));
  return actor;
}
