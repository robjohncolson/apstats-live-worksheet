import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { canMoveNativeActor, carryNativeBalanceRiders } from './native-actor-carry.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;
const integer = value => typeof value === 'number' ? Math.trunc(f(value)) | 0 : 0;

// bb6d980/bb6dac0/bb6db60. Period5, midpoint2.5, blocked-phase wrap7.5;
// bc4cd48 resolves to CRT sin. Preserve float32 operations around that call.
export function createNativeUpDownLiftActor({ spawn, partySize }) {
  const params = spawn.raw.slice(6);
  const amplitude = (integer(params[0]) + Math.imul(integer(params[1]), partySize)) | 0;
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), managerPriority: 0,
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    liftFlags: 0, offset: { x: 0, y: 0 }, previousPhase: 0, nextPhase: 0,
    blockedSeconds: 0, blockedPhaseSkip: 0, amplitude: amplitude ? f(amplitude) : -70,
    speed: typeof params[2] === 'number' && f(params[2]) > 0 ? f(params[2]) : 1,
    spriteFlags: 8, spriteDepth: f(-.1), spriteBounds: { x: -60, y: -10, width: 120, height: 20 },
    spriteUV: { x: .3759765625, y: .0478515625, width: .05859375, height: .009765625 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    onPositionResolved(position) {
      actor.offset = { x: f(position.x - actor.spawnPosition.x), y: f(position.y - actor.spawnPosition.y) };
      actor.liftFlags |= 1;
    },
    beforeMotion(dt) {
      if (!actor.body) return;
      dt = f(dt);
      let phase = actor.nextPhase;
      let resetWait = true;
      if (actor.liftFlags & 1) {
        phase = actor.previousPhase;
        if (Math.abs(actor.blockedPhaseSkip) <= 2 ** -23) {
          const distance = f(phase - (phase > 2.5 ? 2.5 : 0));
          actor.blockedPhaseSkip = f(f(2.5 - distance) - distance);
          if (actor.blockedPhaseSkip < 0) actor.blockedPhaseSkip = f(actor.blockedPhaseSkip + 7.5);
        }
        actor.blockedSeconds = f(dt + actor.blockedSeconds);
        resetWait = actor.blockedSeconds >= actor.blockedPhaseSkip;
        if (resetWait) phase = f(phase + actor.blockedPhaseSkip);
      }
      if (resetWait) actor.blockedSeconds = actor.blockedPhaseSkip = 0;
      actor.liftFlags &= ~1;
      actor.previousPhase = phase;
      let next = f(f(dt * actor.speed) + phase);
      if (next > 5) next = f(next - 5); // exactly one subtraction, not modulo
      actor.nextPhase = next;
      const fraction = f(next / 5), angle = f(f(fraction + fraction) * f(Math.PI));
      const y = f(f(Math.sin(angle)) * actor.amplitude);
      const movement = { x: 0, y: f(y - actor.offset.y) };
      if (!canMoveNativeActor(actor, movement, 0, 0)) { actor.liftFlags |= 1; return; }
      actor.offset.y = y;
      actor.position = { x: f(actor.spawnPosition.x + actor.offset.x), y: f(actor.spawnPosition.y + y) };
      carryNativeBalanceRiders(actor, movement);
    },
  };
  actor.body = createNativeActorRectangle(actor, { x: -59, y: -9, width: 118, height: 18 }, 2, true);
  actor.body.flags |= 2; // Native leaves category0, unlike WeightedLift's category5.
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
