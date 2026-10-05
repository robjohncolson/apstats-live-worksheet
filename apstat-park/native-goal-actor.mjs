import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
import { requestNativePlayerDoorEntry } from './native-player-door.mjs';
const f = Math.fround;

// bb52c20/bb53000. sensorExtension is the decoded bb53000 descriptor, not
// arbitrary Lua parameters: enabled, mode (1 uses height), and integer height.
export function createNativeGoalActor({ name = 'Goal', position = { x: 0, y: 0 }, sensorExtension = null } = {}) {
  const actor = {
    name: name.slice(0, 31), scene: null, flags: 0, motionFlags: 12, cameraRelative: true,
    bodies: [], components: [], velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 },
    renderOffset: { x: 0, y: 0 }, opened: false, spriteAvailable: true,
    spriteBounds: { x: -32, y: -64, width: 64, height: 64 },
    spriteUV: { x: .09375, y: .5, width: .046875, height: .046875 },
    open() {
      if (!actor.spriteAvailable) return;
      if (!actor.opened) actor.scene.playSound('get');
      actor.spriteUV = { x: .09375, y: .5625, width: .046875, height: .046875 };
      actor.opened = true;
    },
    onCommand(command) {
      // Local bb53190. The replicated base command dispatcher remains the
      // network adapter's responsibility before invoking this local handler.
      if (command === 9) actor.open();
      return 0;
    },
    applyOpenedState(opened) { if (!actor.opened && opened) actor.open(); },
    onAdded(scene) {
      actor.scene = scene;
      runNativeCommonActorAdded(actor, scene);
      actor.position.x = f(actor.position.x + f(scene.mapOffset ?? 0));
      // bb53100 offsets actor transform after registration. First PRE syncs body.
    },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt),
    onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
  };
  const bounds = { x: -24, y: -32, width: 48, height: 32 };
  if (sensorExtension?.enabled) {
    const height = sensorExtension.mode === 1 ? f(sensorExtension.height | 0) : 0;
    bounds.y = f(-32 - height);
    bounds.height = f(height + 32);
  }
  actor.body = createNativeActorRectangle(actor, bounds, 0, true);
  actor.body.category = 10;
  actor.body.onOverlap = other => {
    if (actor.networkOwner && actor.scene.networkMode === 1) return;
    if (other.category === 8) actor.open();
    else requestNativePlayerDoorEntry(actor, other);
  };
  placeNativeActorBodies(actor, position);
  return actor;
}
