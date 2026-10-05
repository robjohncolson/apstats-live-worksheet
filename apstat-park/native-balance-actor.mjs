import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { queueNativeActor } from './native-actor-manager.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
import { stepNativeBalancePlatform, updateNativeBalance } from './native-balance.mjs';
const f = Math.fround;

function createBalanceActor() {
  const actor = {
    scene: null, flags: 0, bodies: [], components: [],
    position: { x: 0, y: 0 }, spawnPosition: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre(dt) { runNativeCommonActorPre(actor, dt); },
    onPost(dt) { runNativeCommonActorPost(actor, dt); },
    onAlternatePre(dt) { runNativeCommonActorAlternatePre(actor, dt); },
  };
  return actor;
}

// bb313f0 child construction and bb31eb0 collision-correction hook.
export function createNativeBalancePlatform() {
  const platform = Object.assign(createBalanceActor(), {
    targetOffset: 0, currentOffset: 0, speed: 1, supportCount: 0,
  });
  platform.body = createNativeActorRectangle(platform, { x: -97, y: -7, width: 194, height: 14 }, 2, true);
  platform.beforeMotion = () => stepNativeBalancePlatform(platform);
  platform.onPositionResolved = position => {
    platform.currentOffset = f(position.y - platform.spawnPosition.y);
  };
  return platform;
}

// bb313f0/bb31900. Both child actors are created before scene insertion and
// queued in left/right order during the parent's on-added callback.
export function createNativeBalance({ name = 'Balance', span = 900, position = { x: 0, y: 0 } } = {}) {
  const actor = Object.assign(createBalanceActor(), {
    name, span: f(span), left: createNativeBalancePlatform(), right: createNativeBalancePlatform(),
  });
  placeNativeActorBodies(actor, position);
  const commonAdded = actor.onAdded;
  actor.onAdded = scene => {
    commonAdded(scene);
    const half = f(actor.span * .5);
    for (const [platform, offset] of [[actor.left, f(-half)], [actor.right, half]]) {
      placeNativeActorBodies(platform, { x: f(actor.spawnPosition.x + offset), y: actor.spawnPosition.y });
      queueNativeActor(scene.actorManager, platform, 0, scene);
    }
  };
  actor.beforeMotion = () => updateNativeBalance(actor, {
    playerCount: actor.scene.playerCount,
    sendCommand: (...args) => actor.scene.sendCommand(...args),
  });
  return actor;
}
