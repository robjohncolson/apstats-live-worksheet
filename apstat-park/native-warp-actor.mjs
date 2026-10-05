import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;

// bb78470: numeric Lua values are first float32, then converted to signed int.
function integerParameter(value) {
  if (typeof value !== 'number') return 0;
  value = f(value);
  if (!Number.isFinite(value) || value < -2147483648 || value >= 2147483648) return -2147483648;
  return Math.trunc(value);
}

// bb62ec0, bb63060 and factory bb76a8a/bb76b1e. Warp sensors are invisible
// type0/category2 rectangles with a TOP-left origin; no centered anchor.
export function createNativeWarpActor({ spawn }) {
  const params = spawn.raw.slice(6).map(integerParameter);
  const initialPosition = spawn.actorName.endsWith('InitPos');
  const all = spawn.actorName === 'WarpAll' || spawn.actorName === 'WarpAllInitPos';
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31),
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    spriteFlags: 8, initialPosition, all, destinationIndex: 0,
    destination: { x: initialPosition ? 0 : f(params[2] ?? 0), y: initialPosition ? 0 : f(params[3] ?? 0) },
    destinationOffset: { x: initialPosition ? 0 : f(params[4] ?? 0), y: initialPosition ? 0 : f(params[5] ?? 0) },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt),
    onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
  };
  actor.body = createNativeActorRectangle(actor, { x: 0, y: 0,
    width: f(params[0] ?? 0), height: f(params[1] ?? 0) }, 0, true);
  actor.body.category = 2;
  actor.body.onOverlap = other => {
    if (actor.replication && actor.scene.networkMode === 1) return;
    if (other.category !== 1 && other.category !== 2) return;
    const recipient = other.actor;
    if (actor.initialPosition) {
      if (actor.all) actor.scene.sendCommand(null, 8, null);
      else recipient.onCommand?.(8);
      return;
    }
    if (other.category === 2) {
      recipient.onCommand?.(7, { ...actor.destination });
      return;
    }
    const target = { ...actor.destination };
    const squared = f(f(target.x * target.x) + f(target.y * target.y));
    if (!(Math.abs(squared) > EPSILON)) {
      target.x = recipient.position.x;
      target.y = recipient.position.y;
    } else if (Math.abs(target.x) <= EPSILON) {
      target.x = recipient.position.x;
    }
    const playerCount = actor.scene.players.length;
    if (!actor.all) {
      if (!playerCount) throw new Error('Native Warp destination cycle requires scene players');
      addOffset(target, actor.destinationOffset, actor.destinationIndex);
      recipient.onCommand?.(7, { ...target });
      actor.destinationIndex = ((actor.destinationIndex >>> 0) % playerCount + 1) >>> 0;
      return;
    }
    // Native mutates one vector: offsets are 0,1,3,6... times the increment.
    for (let index = 0; index < playerCount; index++) {
      addOffset(target, actor.destinationOffset, index);
      actor.scene.players[index].onCommand(7, { ...target });
    }
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}

function addOffset(target, offset, index) {
  target.x = f(target.x + f(offset.x * f(index)));
  target.y = f(target.y + f(offset.y * f(index)));
}
