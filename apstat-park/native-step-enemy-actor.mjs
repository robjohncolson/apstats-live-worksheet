import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { hasNativeDirectionalContact } from './native-body-query.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;
const integer = value => typeof value === 'number' ? Math.trunc(f(value)) | 0 : 0;

// bb6c6c0/ca10/cbe0/ce10. Contact callback is BEGIN (+1c0), not STAY.
export function createNativeStepEnemyActor({ spawn }) {
  const params = spawn.raw.slice(6), left = integer(params[0]) < 0;
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31),
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    direction: { x: left ? -1 : 1, y: 0 }, spriteScale: { x: left ? -1 : 1, y: 1 },
    replicationMode: integer(params[1]) > 0 ? 0 : 1,
    spriteFlags: 9, spriteDepth: f(-.1),
    spriteBounds: { x: -25, y: -14, width: 50, height: 28 },
    spriteUV: { x: .349609375, y: .0078125, width: .0244140625, height: .013671875 },
    spriteAction: { name: 'walk', node: 'root', keys: [
      { frame: 0, uvX: 0, uvY: 0 }, { frame: 12, uvX: 0, uvY: .03125 }, { frame: 24, uvX: 0, uvY: 0 },
    ] },
    onAdded(scene) {
      actor.scene = scene;
      // bc17f60 modes0/1: only client replicas change actor scheduling bits.
      if (actor.replication && scene.networkMode === 1) {
        actor.flags = actor.replicationMode ? (actor.flags | 8) & ~16 : actor.flags & ~24;
      }
      runNativeCommonActorAdded(actor, scene);
    },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    beforeMotion() {
      if (!actor.body) return;
      actor.velocity.x = f(1 * actor.direction.x); // global c61f5e0 =1
      notifyVelocity();
      actor.velocity.y = hasNativeDirectionalContact(actor.body, { x: 0, y: 1 }) ? 0 : f(actor.velocity.y + f(.65));
      notifyVelocity();
    },
  };
  function notifyVelocity() {
    for (const component of actor.components) component.consumeVelocity?.(actor.velocity);
  }
  function turn() {
    actor.direction = { x: f(-actor.direction.x), y: f(-actor.direction.y) };
    actor.spriteScale = { x: -actor.spriteScale.x, y: 1 };
  }
  actor.body = createNativeActorRectangle(actor, { x: -24, y: -13, width: 48, height: 26 }, 3, true);
  actor.body.category = 7;
  actor.body.onContactBegin = (other, normal, kind) => {
    if (kind === 0) {
      if (Math.abs(f(normal.x)) > 2 ** -23) turn();
      return;
    }
    const recipient = other?.actor;
    if (kind !== 1 || !recipient) return;
    if (normal.y < 0) { recipient.onCommand?.(0, null); return; }
    if (Math.abs(f(normal.x)) <= 2 ** -23) return;
    if (f(recipient.velocity.x * actor.velocity.x) <= 0) turn();
    if (other.category === 1 && recipient.canReceiveDamage()) recipient.onCommand(4, null);
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
