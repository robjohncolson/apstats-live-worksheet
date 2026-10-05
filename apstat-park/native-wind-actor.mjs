import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;
const numeric = value => typeof value === 'number' ? f(value) : 0;

// bb6e140 ctor, bb6e910 Lua, bb6e6d0 overlap; factory bb75e3a party Y offset.
export function createNativeWindActor({ spawn, partySize }) {
  const params = spawn.raw.slice(6), slot = Math.max(1, ((partySize >>> 0) - 1) | 0);
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), managerPriority: 0,
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    strength: slot < 32 ? numeric(params[slot]) : 0, networkType: 0x2d, replicationMode: 1,
    spriteFlags: 8, spriteDepth: f(-.1),
    spriteBounds: { x: -32, y: -76, width: 64, height: 76 },
    spriteUV: { x: .453125, y: .322265625, width: .03125, height: .037109375 },
    fanSprite: { flags: 9, depth: f(-.1), bounds: { x: -64, y: -68, width: 24, height: 34 },
      uv: { x: .43359375, y: .3125, width: .01171875, height: .0166015625 },
      action: { name: 'default', node: 'root', keys: [
        { frame: 0, uvX: 0, uvY: 0 }, { frame: 12, uvX: .00390625, uvY: 0 }, { frame: 24, uvX: 0, uvY: 0 },
      ] } },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
  };
  actor.body = createNativeActorRectangle(actor, { x: -31, y: -75, width: 62, height: 74 }, 2, true);
  actor.windBody = createNativeActorRectangle(actor, { x: -1280, y: -60, width: 1280, height: 16 }, 0, true);
  actor.windBody.category = 4;
  // The native callback assigns, rather than adds, the actor+140 vector.
  actor.windBody.onOverlap = other => { other.actor.externalVelocity = { x: actor.strength, y: 0 }; };
  placeNativeActorBodies(actor, { x: spawn.x, y: f(f(spawn.y) + f(numeric(params[0]) * f(partySize >>> 0))) });
  return actor;
}
