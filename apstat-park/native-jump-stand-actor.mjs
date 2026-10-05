import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { countNativeContactBodies } from './native-body-contact-count.mjs';
import { findNativeBody } from './native-body-registry.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;
const numeric = value => typeof value === 'number' ? f(value) : 0;
const UP = { x: 0, y: -1 };

// bb649a0 constructor, bb64c70 PRE, factory bb74957/bb749e7.
export function createNativeJumpStandActor({ spawn }) {
  const params = spawn.raw.slice(6), extended = spawn.actorName === 'JumpStandEx';
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31),
    flags: 12, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    impulse: { x: extended ? numeric(params[0]) : 0, y: numeric(params[extended ? 1 : 0]) },
    spriteFlags: 9, spriteDepth: f(-.1),
    spriteBounds: { x: -16, y: -40, width: 32, height: 42 },
    spriteUV: { x: .1875, y: .359375, width: .015625, height: .0205078125 },
    // Embedded action track c62abf0 -> seven20-byte keys at c62ab60.
    // Shared skeletal sprite playback/render integration remains separate.
    spriteAction: { name: 'action', node: 'root', keys: [
      { frame: 0, uvX: 0 }, { frame: 4, uvX: .03125 }, { frame: 8, uvX: .0625 },
      { frame: 12, uvX: .09375 }, { frame: 16, uvX: .0625 }, { frame: 20, uvX: .03125 }, { frame: 24, uvX: 0 },
    ] },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    beforeMotion() {
      const count = countNativeContactBodies(actor.body, UP, 0xffffffff, false);
      // Preserve bb64d15: count UP neighbors, then inspect the first count
      // raw contact records. Native does not filter that second traversal.
      for (let index = 0; index < count; index++) {
        const contact = actor.body.contacts[index];
        const other = contact && actor.body.world && findNativeBody(actor.body.world, contact.bodyId);
        if (!other || countNativeContactBodies(other, UP, 0xffffffff, false)) continue;
        const recipient = other.actor;
        if (!recipient) return;
        if (other.category === 1) {
          const impulse = { x: 0, y: actor.impulse.y };
          recipient.onCommand?.(0, impulse);
          recipient.onCommand?.(0x2d, impulse);
        } else recipient.onCommand?.(0, { ...actor.impulse });
      }
    },
  };
  actor.body = createNativeActorRectangle(actor, { x: -16, y: -34, width: 32, height: 34 }, 3, true);
  actor.body.category = 5;
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
