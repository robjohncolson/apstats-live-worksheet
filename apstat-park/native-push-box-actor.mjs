import { createNativeActorRectangle, unregisterNativeActorBodies, nativeActorDisplayPosition } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
import { receiveNativePushBoxCommand, tryNativePushBoxRelocation } from './native-push-box-commands.mjs';
import { stepNativePushBoxMotion, nativePushBoxRequiredPlayers } from './native-push-box-motion.mjs';
import { propagateNativeJumpImpulse } from './native-player-impulse.mjs';
import { hasNativeDirectionalContact } from './native-body-query.mjs';
import { findNativeBody } from './native-body-registry.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;

// bb334f0/bb33780/bb340f0. Ordinary PushBox (custom-shape variants have
// separate factories). Sprite patches and text are exposed as presentation
// data; they do not replace the scene renderer.
export function createNativePushBoxActor({ spawn }) {
  const params = spawn.raw.slice(6);
  const width = f(params[1]), height = f(params[2]);
  const bounds = { x: f(-width * .5), y: f(-height), width, height };
  const amount = typeof params[0] === 'number' ? Math.trunc(f(params[0])) | 0 : 0;
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), managerPriority: 2,
    flags: 0, motionFlags: 12, cameraRelative: true, isNativePushBox: true,
    bodies: [], components: [], velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 },
    renderOffset: { x: 0, y: 0 }, pendingPosition: { x: 0, y: 0 },
    externalVelocity: { x: 0, y: 0 }, boxFlags: 0,
    requiredPercent: amount > 0 ? amount : 100, requiredOffset: amount > 0 ? 0 : amount,
    pusherCount: 0, replicatedPusherCount: 0, spriteFlags: 8, patchFlags: 8,
    counterVisible: 1, spriteBounds: bounds, spriteDepth: f(-.4), counterDepth: f(-.5),
    patch: { tileWidth: 24, tileHeight: 24, uvWidth: .015625, uvHeight: .015625,
      uvX: .453125, uvY: .03125, insetU: .015625, insetV: .015625 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt),
    onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    beforeMotion: () => stepNativePushBoxMotion(actor),
    afterMotion() {
      tryNativePushBoxRelocation(actor);
      updateReplicaMotionFlag(actor);
    },
    onCommand: (command, value) => receiveNativePushBoxCommand(actor, command, value),
    // bb346a0: centered 32px label shows remaining pushers, not party size.
    counterPresentation() {
      const position = nativeActorDisplayPosition(actor);
      const count = actor.replication && actor.scene.networkMode === 1 ? actor.replicatedPusherCount : actor.pusherCount;
      return { visible: Boolean(actor.counterVisible), fontSize: 32, alignX: 2, alignY: 2,
        x: Math.trunc(position.x), y: Math.trunc(f(f(position.y + bounds.y) + f(bounds.height * .5))),
        text: String(Math.max(0, (nativePushBoxRequiredPlayers(actor) - count) | 0)) };
    },
  };
  actor.body = createNativeActorRectangle(actor, {
    x: f(bounds.x + 1), y: f(bounds.y + 1), width: f(width - 2), height: f(height - 2),
  }, 3, true);
  actor.body.category = 2;
  // bb348b0 is BEGIN only; STAY must not repeat the launch impulse.
  actor.body.onContactBegin = (other, normal) => {
    if (!(normal.y < 0 && actor.velocity.y < 0)) return;
    if (other) propagateNativeJumpImpulse(other, actor.velocity.y, 0, true);
    actor.velocity.y = 0;
    for (const component of actor.components) component.consumeVelocity?.(actor.velocity);
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}

// Raw bb33b20. This branch is for client replicas only (bc11800); local
// actors still run the pending relocation before reaching it.
function updateReplicaMotionFlag(actor) {
  if (!actor.replication || actor.scene.networkMode !== 1 || (actor.manager.flags & 8)) return;
  let moving = false;
  if (actor.pusherCount > 0) {
    for (const x of [1, -1]) {
      const neighbors = actor.body.contacts.filter(({ normal }) =>
        Math.abs(f(normal.x - x)) <= EPSILON && Math.abs(f(normal.y)) <= EPSILON)
        .map(contact => findNativeBody(actor.body.world, contact.bodyId)).filter(Boolean);
      if (neighbors.length > 16) throw new Error('Native PushBox replica contact capacity exceeded');
      if (neighbors.some(body => body.actor.flags & 0x18)) { moving = true; break; }
    }
  } else if (actor.flags & 0x10) {
    moving = f(f(actor.velocity.x * actor.velocity.x) + f(actor.velocity.y * actor.velocity.y)) > 0;
  }
  if ((actor.boxFlags & 2) || !hasNativeDirectionalContact(actor.body, { x: 0, y: 1 })) moving = true;
  actor.flags = moving ? actor.flags | 0x10 : actor.flags & ~0x10;
}
