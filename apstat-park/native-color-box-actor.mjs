import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
import { receiveNativePushBoxCommand, tryNativePushBoxRelocation } from './native-push-box-commands.mjs';
import { hasNativeDirectionalContact } from './native-body-query.mjs';
import { findNativeBody } from './native-body-registry.mjs';
import { NATIVE_PLAYER_COLORS } from './native-player-slot.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;
const numeric = value => typeof value === 'number' ? f(value) : 0;

// bb3b350/3b490 and factory bb76d9d/73c9b. BallBox shares this native class,
// but its separately configured jumping mode is not part of these factories.
export function createNativeColorBoxActor({ spawn, partySize }) {
  const params = spawn.raw.slice(6);
  const forced = spawn.actorName === 'ForceColorBox';
  const width = params.length > 1 ? numeric(params[1]) : 32;
  const height = params.length > 2 ? numeric(params[2]) : 32;
  const bounds = { x: f(-width * .5), y: f(-height), width, height };
  let colorSlot = Math.trunc(numeric(params[0])) >>> 0;
  if (!forced) {
    if (!(partySize > 0)) throw new Error('Native ColorBox requires a nonzero party size');
    colorSlot %= partySize;
    const excluded = params.length > 3 ? Math.trunc(numeric(params[3])) | 0 : -1;
    if (excluded >= 0 && colorSlot === excluded % partySize) colorSlot = (colorSlot + 1) % partySize;
  }
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31), managerPriority: 2,
    flags: 0, motionFlags: forced ? 12 : 28, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    pendingPosition: { x: 0, y: 0 }, externalVelocity: { x: 0, y: 0 }, boxFlags: 0,
    colorSlot, networkType: 0x13, replicationMode: 0, mass: forced ? 1 : 100,
    spriteFlags: 8, patchFlags: 8, patchColor: 0xff000000,
    spriteBounds: bounds, spriteDepth: f(-.4),
    patch: { tileWidth: 16, tileHeight: 16, uvWidth: .0078125, uvHeight: .0078125,
      uvX: .140625, uvY: .625, insetU: .0078125, insetV: .0078125,
      uvColumns: [.140625, .15625, .1796875], uvRows: [.625, .640625, .6640625] },
    onAdded(scene) {
      actor.scene = scene;
      actor.patchColor = colorSlot < 10 ? NATIVE_PLAYER_COLORS[scene.playerColorIndices?.[colorSlot] ?? colorSlot] : 0xff000000;
      runNativeCommonActorAdded(actor, scene);
    },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt),
    onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    onStopped() { actor.spriteFlags |= 2; actor.stepStartPosition = { ...actor.position }; },
    onResumed() { actor.spriteFlags &= ~2; },
    beforeMotion() {
      if (actor.boxFlags & 4) return;
      actor.velocity.x = 0;
      if (matchingPusher(-1)) actor.velocity.x = 1;
      else if (matchingPusher(1)) actor.velocity.x = -1;
      notifyVelocity();
      if (!hasNativeDirectionalContact(actor.body, { x: 0, y: -1 }) && Math.abs(actor.externalVelocity.x) > EPSILON) {
        actor.velocity.x = f(actor.velocity.x + actor.externalVelocity.x);
        notifyVelocity();
      }
      if (!hasNativeDirectionalContact(actor.body, { x: 0, y: 1 })) {
        actor.velocity.y = f(actor.velocity.y + f(.65));
      } else {
        actor.velocity.y = 0;
        if (!(actor.boxFlags & 1)) actor.externalVelocity = { x: 0, y: 0 };
      }
      notifyVelocity();
      if (actor.boxFlags & 1) {
        actor.velocity.y = f(actor.velocity.y + actor.externalVelocity.y);
        actor.boxFlags &= ~1;
        notifyVelocity();
      }
    },
    afterMotion() {
      // bb3b920 updates client motion flags before probing pending placement.
      if (actor.replication && actor.scene.networkMode === 1 && !(actor.manager.flags & 8)) {
        const moving = neighbors(actor, 1).concat(neighbors(actor, -1)).some(body => body.actor.flags & 0x18);
        actor.flags = moving ? actor.flags | 0x10 : actor.flags & ~0x10;
      }
      tryNativePushBoxRelocation(actor);
    },
    onCommand(command, value) {
      if (command === 0x1f) return (colorSlot + 1) | 0;
      if (command === 0xe && value != null) {
        actor.patchFlags = value ? actor.patchFlags | 8 : actor.patchFlags & ~8;
        actor.body.flags = value ? actor.body.flags | 1 : actor.body.flags & ~1;
        if (actor.manager) {
          actor.flags = value ? actor.flags & ~1 : actor.flags | 1;
          if (value) actor.onResumed(); else actor.onStopped();
        }
      } else if (command === 0x1e && value != null) {
        actor.boxFlags = value ? actor.boxFlags | 4 : actor.boxFlags & ~4;
        actor.body.nativeField148 = value | 0;
        actor.velocity = { x: 0, y: 0 };
        notifyVelocity();
        return 1;
      } else if ([0, 2, 7, 8].includes(command)) {
        return receiveNativePushBoxCommand(actor, command, value);
      }
      return 0;
    },
  };
  actor.body = createNativeActorRectangle(actor, {
    x: f(bounds.x + 2), y: f(bounds.y + 2), width: f(width - 4), height: f(height - 4),
  }, 3, true);
  actor.body.category = 2;
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;

  function notifyVelocity() {
    for (const component of actor.components) component.consumeVelocity?.(actor.velocity);
  }

  // bb3c2e0 traverses all actor categories, but only Player RTTI + matching
  // input slot and inward velocity may start the block moving. Map is ignored.
  function matchingPusher(direction) {
    const path = new Set();
    function visit(current) {
      if (path.has(current)) throw new Error('Cyclic native ColorBox contact chain');
      path.add(current);
      for (const body of neighbors(current, direction)) {
        const next = body.actor;
        const inward = direction < 0 ? next.velocity.x > EPSILON : next.velocity.x < -EPSILON;
        if (inward && actor.scene.players.includes(next) && next.playerIndex === colorSlot) return true;
        if (visit(next)) return true;
      }
      path.delete(current);
      return false;
    }
    return visit(actor);
  }
}

function neighbors(actor, direction) {
  const body = actor.bodies?.[0]?.body;
  if (!body?.world) return [];
  const result = body.contacts.filter(contact => Math.abs(f(contact.normal.x - direction)) <= EPSILON &&
    Math.abs(contact.normal.y) <= EPSILON).map(contact => findNativeBody(body.world, contact.bodyId)).filter(Boolean);
  if (result.length > 16) throw new Error('Native ColorBox contact capacity exceeded');
  return result;
}
