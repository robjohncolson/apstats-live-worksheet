import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost } from './native-actor-lifecycle.mjs';
import { collectNativeMagnetCandidate } from './native-magnet-target.mjs';
import { stepNativeMagnetGrab } from './native-magnet-step.mjs';
import { followNativeMagnetOwner } from './native-magnet-position.mjs';
import { stepNativeMagnetParticles } from './native-magnet-particles.mjs';
import { NATIVE_PLAYER_COLORS } from './native-player-slot.mjs';
const f = Math.fround;

// bb59090/59390/592d0. A companion owned by Player, not a replacement Player.
// Factory wiring remains separate until carry and replication are integrated.
export function createNativeMagnetActor({ owner, position, randomFloat, carryTarget }) {
  if (typeof randomFloat !== 'function') throw new Error('Native magnet requires its random-float adapter');
  const actor = {
    owner, isNativeMagnet: true, managerPriority: 3, networkType: 4, networkMode: 1,
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    magnetFlags: 0, candidates: [], target: null, particles: [], soundSeconds: 0,
    gripOffset: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, spriteFlags: 8, spriteDepth: f(-.4),
    spriteBounds: { x: -11, y: -22.5, width: 22, height: 30 },
    spriteUV: { x: .203125, y: .484375, width: .0107421875, height: .0146484375 },
    onAdded(scene) {
      actor.scene = scene;
      runNativeCommonActorAdded(actor, scene);
      actor.onCommand(0x2e);
    },
    onRemoved() {
      unregisterNativeActorBodies(actor);
      owner.carriedAttachments[0] = null;
      owner.references--;
      actor.owner = null;
    },
    onPre: dt => runNativeCommonActorPre(actor, dt),
    onPost: dt => runNativeCommonActorPost(actor, dt),
    beforeMotion: dt => stepNativeMagnetGrab(actor, dt),
    afterMotion() {
      stepNativeMagnetParticles(actor, randomFloat);
      followNativeMagnetOwner(actor);
    },
    onCommand(command) {
      if (command === 0x1f) return owner.playerIndex;
      if (command === 0x2e) {
        actor.spriteColor = owner.playerIndex < 10
          ? NATIVE_PLAYER_COLORS[actor.scene?.playerColorIndices?.[owner.playerIndex] ?? owner.playerIndex] : 0xff000000;
      }
      return 0;
    },
    onCarried(delta, direction, visited, options) {
      if (!actor.target) return;
      if (!carryTarget) throw new Error('Native magnet requires the recursive carried-target adapter');
      carryTarget(actor.target, delta, direction, visited, options);
    },
  };
  actor.body = createNativeActorRectangle(actor, { x: 20, y: -50, width: 110, height: 80 }, 0, true);
  actor.body.category = 2;
  actor.body.onOverlap = body => collectNativeMagnetCandidate(actor, body);
  owner.references = (owner.references ?? 0) + 1;
  owner.carriedAttachments[0] = actor;
  actor.onCommand(0x2e);
  placeNativeActorBodies(actor, position);
  return actor;
}
