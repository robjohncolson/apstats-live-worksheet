import { createNativePitcher } from './native-pitcher.mjs';
import { createNativePhysicsBall } from './native-physics-ball.mjs';
import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { queueNativeActor } from './native-actor-manager.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';

// Local mode-4 bb37d70/bb383e0 adapter. The shared controller owns timing,
// party parameters and commands; the scene owns each spawned actor's lifetime.
export function createNativePhysicsBallPitcher({ spawn, partySize }) {
  const actor = {
    scene: null, flags: 0, bodies: [], components: [],
    position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre(dt) { runNativeCommonActorPre(actor, dt); },
    onPost(dt) { runNativeCommonActorPost(actor, dt); },
    onAlternatePre(dt) { runNativeCommonActorAlternatePre(actor, dt); },
    beforeMotion() { actor.controller.tick(); },
    onCommand(command, payload) { return actor.controller.receiveCommand(command, payload); },
  };
  actor.body = createNativeActorRectangle(actor, { x: -40, y: -18, width: 54, height: 40 }, 3, true);
  actor.body.category = 4;
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  const launch = { ...spawn, actorName: 'PhysicsBallPitcher',
    get x() { return actor.position.x; }, get y() { return actor.position.y; } };
  actor.controller = createNativePitcher({ spawn: launch, partySize,
    sendCommand: (...args) => actor.scene.sendCommand(...args),
    createProjectile(spec) {
      const ball = createNativePhysicsBall();
      ball.velocity = { ...spec.velocity };
      for (const component of ball.components) component.consumeVelocity?.(ball.velocity);
      placeNativeActorBodies(ball, { x: spec.x, y: spec.y });
      queueNativeActor(actor.scene.actorManager, ball, 0, actor.scene);
      // bb38130 checks child+58 membership, not a timer or a death flag.
      return { actor: ball, get removed() { return !ball.manager; } };
    },
  });
  return actor;
}
