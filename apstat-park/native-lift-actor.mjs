import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { canMoveNativeActor } from './native-actor-carry.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
import { carryNativeLiftRiders } from './native-lift-carry.mjs';
const f = Math.fround;
const integer = value => typeof value === 'number' ? Math.trunc(f(value)) | 0 : 0;

// bb550a0/bb551f0/bb55370/bb55ab0. Period5, midpoint2.5, blocked-phase wrap7.5;
// bc4cd48 resolves to CRT sin. Preserve float32 operations around that call.
export function createNativeLiftActor({ spawn, partySize }) {
  const params = spawn.raw.slice(6);
  const amplitude = {
    x: f((integer(params[0]) + Math.imul(integer(params[2]), partySize)) | 0),
    y: f((integer(params[1]) + Math.imul(integer(params[3]), partySize)) | 0),
  };
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), managerPriority: 0,
    networkType: 15, networkMode: 0, flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    liftFlags: (integer(params[5]) ? 2 : 0) | (integer(params[6]) ? 8 : 4), offset: { x: 0, y: 0 }, previousPhase: 0, nextPhase: 0,
    blockedSeconds: 0, blockedPhaseSkip: 0, amplitude,
    speed: params.length > 4 ? (typeof params[4] === 'number' ? f(params[4]) : 0) : 1,
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
    onCommand(command) {
      if (command !== 9 || !(actor.liftFlags & 8) || actor.scene?.networkMode === 1) return;
      if (actor.scene) actor.scene.scrollFlags |= 0x1000;
      actor.liftFlags |= 4;
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
        if (actor.liftFlags & 4) actor.blockedSeconds = f(dt + actor.blockedSeconds);
        resetWait = actor.blockedSeconds >= actor.blockedPhaseSkip;
        if (resetWait) phase = f(phase + actor.blockedPhaseSkip);
      }
      if (resetWait) actor.blockedSeconds = actor.blockedPhaseSkip = 0;
      actor.liftFlags &= ~1;
      actor.previousPhase = phase;
      let next = phase;
      if (actor.liftFlags & 4) {
        next = f(f(dt * actor.speed) + phase);
        if ((actor.liftFlags & 8) && next >= (actor.liftFlags & 2 ? 2.5 : 5)) {
          actor.liftFlags &= ~4;
          actor.previousPhase = next = 0;
          if (actor.scene && actor.scene.networkMode !== 1) actor.scene.scrollFlags &= ~0x1000;
        }
      }
      if (next > 5) next = f(next - 5); // exactly one subtraction, not modulo
      actor.nextPhase = next;
      const fraction = f(next / 5), angle = f(f(fraction + fraction) * f(Math.PI));
      let wave = f(Math.sin(angle));
      if ((actor.liftFlags & 2) && wave < 0) wave = f(-wave);
      const offset = { x: f(wave * amplitude.x), y: f(wave * amplitude.y) };
      const movement = { x: f(offset.x - actor.offset.x), y: f(offset.y - actor.offset.y) };
      if (!canMoveNativeActor(actor, movement, 0, 0)) { actor.liftFlags |= 1; return; }
      actor.offset = offset;
      actor.position = { x: f(actor.spawnPosition.x + actor.offset.x), y: f(actor.spawnPosition.y + offset.y) };
      carryNativeLiftRiders(actor, movement);
    },
  };
  actor.body = createNativeActorRectangle(actor, { x: -59, y: -9, width: 118, height: 18 }, 2, true);
  actor.body.flags |= 2;
  actor.body.category = 5;
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
