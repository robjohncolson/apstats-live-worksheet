import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { markNativeActorForRemoval } from './native-actor-manager.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
import { carryNativeScrollNeighbors } from './native-player-boundary.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;
const integer = value => typeof value === 'number' ? Math.trunc(f(value)) | 0 : 0;
const UV = [[.234375, .5625], [.28125, .5625], [.28125, .578125], [.21875, .5625], [.25, .5625]];

function shell() {
  const actor = { name: '', flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 }, spriteFlags: 8,
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt) };
  return actor;
}

// bb4f630/bb4f9d0: Bridge/KeyBridge use mode0; Gate uses mode1, with
// spread starting positions and negated offsets back to the shared anchor.
export function createNativeBridgeActor({ spawn, partySize }) {
  const params = spawn.raw.slice(6), count = integer(params[0]) >>> 0;
  if (count < 1 || count > 32) throw new Error('Native Bridge requires 1..32 segments');
  const gate = spawn.actorName === 'Gate';
  const directionValue = value => gate ? (typeof value === 'number' ? f(value) : 0) : f(integer(value));
  const direction = { x: directionValue(params[1]), y: directionValue(params[2]) };
  const length = f(Math.sqrt(f(f(direction.x * direction.x) + f(direction.y * direction.y))));
  if (length) { direction.x = f(direction.x / length); direction.y = f(direction.y / length); }
  const size = integer(params[gate ? 3 : 4]) || 32;
  const adjustment = gate ? 0 : integer(params[3]);
  const initialSpread = adjustment > 0 ? Math.trunc(f(f(f(adjustment) * f(8 - partySize)) * f(.1))) : 0;
  const actor = Object.assign(shell(), {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), segments: [], direction, segmentSize: size,
    initialSpread, mode: gate ? 1 : 0, waitForKey: spawn.actorName === 'KeyBridge',
    onAdded(scene) {
      actor.scene = scene; runNativeCommonActorAdded(actor, scene);
      for (let index = 0; index < count; index++) {
        const segment = actor.segments[index];
        const offset = { x: f(f(direction.x * f(size >>> 0)) * f(count - index - 1)),
          y: f(f(direction.y * f(size >>> 0)) * f(count - index - 1)) };
        segment.targetOffset = gate ? { x: -offset.x, y: -offset.y } : offset;
        const start = gate ? { x: f(offset.x + actor.spawnPosition.x), y: f(offset.y + actor.spawnPosition.y) } : actor.spawnPosition;
        placeNativeActorBodies(segment, start);
        if (actor.replication && scene.networkMode === 1) segment.body.flags |= 0x20;
        scene.addActor(segment);
      }
      // Native adjusts transforms AFTER registration. First PRE syncs bodies.
      for (let i = 0; i < Math.min(count, initialSpread >>> 0); i++) {
        actor.segments[i].position = {
          x: f(actor.spawnPosition.x + f(f(direction.x * f(size >>> 0)) * f((initialSpread >>> 0) - i))),
          y: f(actor.spawnPosition.y + f(f(direction.y * f(size >>> 0)) * f((initialSpread >>> 0) - i))) };
      }
    },
    onRemoved() {
      for (const segment of actor.segments) markNativeActorForRemoval(segment);
      unregisterNativeActorBodies(actor); actor.scene = null;
    },
    beforeMotion() {
      if (!actor.waitForKey) return;
      const key = actor.scene.findActor('Key');
      if (key?.isNativeKey && key.carrier) { actor.onCommand(9); actor.waitForKey = false; }
    },
    onCommand(command) {
      const firstState = actor.segments[0].state;
      for (const segment of actor.segments) {
        if (command === 9) {
          if (segment.state === 0 || segment.state === 2) {
            if (firstState === 0) segment.delayTicks = 0;
            segment.state = 1; segment.bridgeFlags |= 1;
          }
          if (initialSpread) segment.delayTicks = 0xffffffff;
        } else if (command === 10 && (segment.state === 1 || segment.state === 3)) {
          if (firstState === 3) segment.delayTicks = 0;
          segment.state = 2; segment.bridgeFlags |= 1;
        }
      }
      return 0;
    },
  });
  const horizontal = Math.abs(direction.y) <= EPSILON;
  const bounds = { x: 0, y: 0, width: f((size >>> 0) + Number(horizontal)), height: f((size >>> 0) + Number(!horizontal)) };
  for (let i = 0; i < count; i++) {
    let art = 0;
    if (!i) art = direction.y < 0 ? 1 : direction.y > 0 ? 2 : direction.x < 0 ? 3 : direction.x > 0 ? 4 : 0;
    const segment = Object.assign(shell(), { parent: actor, state: 0, delayTicks: 0,
      bridgeFlags: i ? 0 : 2 | (!gate && integer(params[5]) > 0 ? 4 : 0),
      targetOffset: { x: 0, y: 0 }, savedPosition: { x: 0, y: 0 }, spriteDepth: f(.1),
      spriteBounds: { ...bounds }, spriteUV: { x: UV[art][0], y: UV[art][1], width: .015625, height: .015625 } });
    segment.beforeMotion = () => stepSegment(segment);
    segment.onPositionResolved = () => { for (const sibling of actor.segments) sibling.bridgeFlags |= 8; };
    segment.body = createNativeActorRectangle(segment, bounds, 2, true);
    segment.body.category = 6; segment.body.flags |= 16; segment.body.responseFlags = 1;
    actor.segments.push(segment);
  }
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}

// bb4f230/bb4f3e0. The saved transform is restored one frame after a solver
// correction. Movement modifies position directly, leaving velocity unchanged.
function stepSegment(segment) {
  if (segment.bridgeFlags & 8) {
    segment.position = { ...segment.savedPosition }; segment.bridgeFlags &= ~8;
  } else if (!(segment.parent.replication && segment.scene.networkMode === 1)) {
    if (segment.state === 1 || segment.state === 2) {
      const extending = segment.state === 1;
      const target = extending ? { x: f(segment.spawnPosition.x + segment.targetOffset.x),
        y: f(segment.spawnPosition.y + segment.targetOffset.y) } : { ...segment.spawnPosition };
      if (moveSegment(segment, target, extending ? 1 : .5)) segment.state = extending ? 3 : 0;
    }
  }
  segment.savedPosition = { ...segment.position };
}

function moveSegment(segment, target, speed) {
  if (!(segment.bridgeFlags & 2) && (segment.delayTicks >>> 0) < 4) {
    segment.delayTicks++; return false;
  }
  const delta = { x: f(target.x - segment.position.x), y: f(target.y - segment.position.y) };
  const squared = f(f(delta.x * delta.x) + f(delta.y * delta.y));
  if (!(segment.bridgeFlags & 1) || squared <= EPSILON) { segment.position = { ...target }; return true; }
  const length = f(Math.sqrt(squared));
  const movement = { x: f(f(f(delta.x / length) * 2) * speed), y: f(f(f(delta.y / length) * 2) * speed) };
  if ((segment.bridgeFlags & 6) === 6 && segment.state === 1) {
    carryNativeScrollNeighbors(segment, { x: movement.x, y: 0 }, movement.x > 0 ? 3 : 2,
      { allCategories: true, compensateOpposingVelocity: true });
  }
  segment.position = { x: f(segment.position.x + movement.x), y: f(segment.position.y + movement.y) };
  const remaining = { x: f(target.x - segment.position.x), y: f(target.y - segment.position.y) };
  if (f(f(delta.x * remaining.x) + f(delta.y * remaining.y)) > 0) return false;
  segment.position = { ...target }; return true;
}
