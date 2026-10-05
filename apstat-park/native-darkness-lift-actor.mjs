import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
import { countNativeContactBodies } from './native-body-contact-count.mjs';
import { hasNativeDirectionalContact } from './native-body-query.mjs';
import { canMoveNativeActor, carryNativeBalanceRiders } from './native-actor-carry.mjs';
const f = Math.fround;
const numeric = value => typeof value === 'number' ? f(value) : 0;

// bb62450/bb62580/bb62790. Unlike the styled WeightedLift this class has
// Lua-sized top-left bounds, a tiled Rect component, and a live team threshold.
export function createNativeDarknessLiftActor({ spawn }) {
  const params = spawn.raw.slice(6);
  const bounds = { x: 0, y: 0, width: numeric(params[0]), height: numeric(params[1]) };
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), managerPriority: 0,
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    offset: { x: 0, y: 0 }, maximumOffset: numeric(params[2]), requiredPercent: 100,
    loadSpeed: 1, returnSpeed: 1, returnsWhenEmpty: params.length <= 3 || (Math.trunc(numeric(params[3])) | 0) !== 0,
    supportCount: 0, groundCooldown: 0, spriteFlags: 8, patchFlags: 8,
    spriteBounds: bounds, spriteDepth: f(.2),
    patch: { name: 'LiftRect', tileWidth: 32, tileHeight: 32, uvX: 0, uvY: .515625,
      uvWidth: .015625, uvHeight: .015625, insetU: .015625, insetV: .015625 },
    setVisible(visible) { actor.patchFlags = visible ? actor.patchFlags | 8 : actor.patchFlags & ~8; },
    onCommand(command, value) {
      if (command === 0xe && value != null) actor.setVisible(Boolean(value));
      else if (command === 0x2c) actor.setVisible(false);
      return 0;
    },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    onPositionResolved(position) {
      actor.offset = { x: f(position.x - actor.spawnPosition.x), y: f(position.y - actor.spawnPosition.y) };
    },
    beforeMotion(dt) {
      if (actor.groundCooldown > 0) actor.groundCooldown = f(actor.groundCooldown - f(dt));
      if (hasNativeDirectionalContact(actor.body, { x: 0, y: 1 })) actor.groundCooldown = f(.06);
      const count = countNativeContactBodies(actor.body, { x: 0, y: -1 }, 6, true);
      if (!(actor.patchFlags & 8) && actor.supportCount < count) actor.scene.playSound?.('switch');
      actor.supportCount = count;
      if (actor.groundCooldown > 0) return;
      const required = Math.max(2, Math.ceil(f(f(actor.scene.players.length) * f(f(actor.requiredPercent >>> 0) / 100))));
      let next = actor.offset.y;
      if (count >= required) next = Math.min(Math.abs(actor.maximumOffset), f(Math.abs(next) + actor.loadSpeed));
      else if (actor.returnsWhenEmpty) next = Math.max(0, f(Math.abs(next) - actor.returnSpeed));
      next = f(next * (actor.maximumOffset < 0 ? -1 : 1));
      const movement = { x: 0, y: f(next - actor.offset.y) };
      if (!canMoveNativeActor(actor, movement, 0, 0)) return;
      actor.offset.y = next;
      actor.position = { x: f(actor.spawnPosition.x + actor.offset.x), y: f(actor.spawnPosition.y + next) };
      if (Math.abs(f(movement.y * movement.y)) > 2 ** -23) carryNativeBalanceRiders(actor, movement);
    },
  };
  actor.body = createNativeActorRectangle(actor, bounds, 2, true);
  actor.body.category = 5; actor.body.flags |= 2;
  if (spawn.actorName === 'InvisibleWeightedLift') actor.setVisible(false);
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
