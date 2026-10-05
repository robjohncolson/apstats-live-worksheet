import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { scaledNativeBounds } from './native-body-support.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost } from './native-actor-lifecycle.mjs';
const f = Math.fround;

// bb64f20/65cf0, bb65430 PRE and bb657c0 continuous overlap. params are the
// Key-specific Lua values: party X/Y offsets, hidden, pickup target, Y offset.
export function createNativeKeyActor({ name = 'Key', position = { x: 0, y: 0 }, mode = 0,
  params = [], partySize = 1 } = {}) {
  const actor = {
    name: name.slice(0, 31), scene: null, flags: 0, motionFlags: 12, cameraRelative: true, isNativeKey: true,
    bodies: [], components: [], velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 },
    renderOffset: { x: 0, y: 0 }, spriteFlags: 8, keyFlags: 0, state: 0, mode,
    carrier: null, selectedCarrier: null, previousCarrier: null, handoffTicks: 0,
    carrierBounds: { x: 0, y: 0, width: 0, height: 0 },
    target: mode === 0 && typeof params[3] === 'string' ? params[3].slice(0, 63) : '',
    verticalOffset: mode === 0 && typeof params[4] === 'number' ? f(params[4]) : 0,
    spriteBounds: { x: -16, y: -28, width: 32, height: 56 },
    spriteUV: { x: .109375, y: .625, width: .015625, height: .02734375 },
    setVisible(visible) {
      actor.body.flags = visible ? actor.body.flags | 1 : actor.body.flags & ~1;
      actor.spriteFlags = visible ? actor.spriteFlags | 8 : actor.spriteFlags & ~8;
      actor.keyFlags = visible ? actor.keyFlags | 1 : actor.keyFlags & ~1;
    },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); },
    onReleased() {
      if (actor.carrier?.references) {
        actor.carrier.references--;
        if (!actor.carrier.references) actor.carrier.onReleased?.();
      }
      actor.carrier = null;
    },
    applyKeyFlags(flags) {
      const visible = Boolean(flags & 1);
      if (visible !== Boolean(actor.keyFlags & 1)) actor.setVisible(visible);
      if (!(actor.keyFlags & 2) && (flags & 2)) actor.scene.playSound('get');
      actor.keyFlags = flags & 2 ? actor.keyFlags | 2 : actor.keyFlags & ~2;
    },
    onPre: dt => runNativeCommonActorPre(actor, dt),
    onPost: dt => runNativeCommonActorPost(actor, dt),
    beforeMotion() {
      let target = null;
      if (actor.carrier) {
        const bounds = actor.carrierBounds, carrier = actor.carrier;
        target = { x: f(carrier.position.x + bounds.x), y: f(carrier.position.y + bounds.y) };
        if (!(carrier.scale.x > 0)) target.x = f(target.x + bounds.width);
      }
      if (actor.state === 0 && mode === 1 && !(actor.keyFlags & 1)) {
        const map = actor.scene.bodyWorld.map;
        if (!map.table.slice(0, map.width * map.height).some(id => ((id - 30) >>> 0) < 5)) {
          actor.setVisible(true);
          actor.scene.scrollFlags |= 0x40;
        }
      } else if (actor.state === 1 && !target) target = { ...actor.spawnPosition };
      else if (actor.state === 2) {
        actor.setVisible(false);
        actor.state = 3;
        if (actor.carrier) {
          actor.carrier.onCommand(0x18);
          if (actor.carrier) {
            const carrier = actor.carrier;
            if (carrier.references) { carrier.references--; if (!carrier.references) carrier.onReleased?.(); }
            actor.carrier = null;
          }
        }
      }
      // Target is sampled before state2 releases the carrier, so this frame
      // still follows its old target once, even though the key is now hidden.
      if (target) {
        target.y = f(target.y + actor.verticalOffset);
        const dx = f(target.x - actor.position.x), dy = f(target.y - actor.position.y);
        if (f(f(dx * dx) + f(dy * dy)) >= f(.1)) {
          actor.position = { x: f(actor.position.x + f(dx * f(.1))), y: f(actor.position.y + f(dy * f(.1))) };
        } else {
          actor.position = target;
          if (actor.state === 1) actor.state = 0;
        }
      }
      actor.selectedCarrier = null;
      if (actor.handoffTicks) actor.handoffTicks--;
      if (!actor.handoffTicks) actor.previousCarrier = null;
    },
    onCommand(command, value) {
      if (command === 9 || command === 13) {
        if (actor.state === 0) actor.setVisible(true);
      } else if (command === 0x14 && actor.carrier === value) {
        actor.carrier = null;
        if (actor.state === 0) actor.state = 1;
      }
      return 0;
    },
    onOverlap(other) {
      if (actor.networkOwner && actor.scene.networkMode === 1) return;
      if (other.category === 10) { actor.state = 2; return; }
      if (other.category !== 1 && other.category !== 9) return;
      const next = other.actor;
      if (actor.carrier === next && other.category !== 1) return;
      if (actor.carrier !== next) {
        if (actor.previousCarrier === next) { actor.handoffTicks = 2; return; }
        if (actor.selectedCarrier) return;
        if (!actor.carrier) {
          if (actor.target) actor.scene.sendCommand(actor.target, 9);
          if (!actor.carrier) actor.scene.playSound('get');
        }
        if (actor.carrier) {
          if (actor.carrier.playerIndex !== undefined) {
            actor.scene.playSound('get');
            if (actor.scene.networkMode === 2) actor.scene.sendNativeDamagePacket({
              transport: 'host', target: 255, channel: 1, kind: 2, command: 6, value: 0 });
          }
          actor.previousCarrier = actor.carrier;
          actor.handoffTicks = 2;
        }
        actor.carrier = next;
        next.references = (next.references ?? 0) + 1;
        actor.selectedCarrier = next;
      }
      if (other.category === 1) actor.carrierBounds = scaledNativeBounds(other.rawBounds, other.scale, other.pivot);
      else actor.carrierBounds = { x: 0, y: 0, width: 0, height: 0 };
    },
  };
  actor.body = createNativeActorRectangle(actor, actor.spriteBounds, 0, true);
  actor.body.category = 8;
  actor.body.onOverlap = other => actor.onOverlap(other);
  actor.setVisible(mode !== 1 && !(typeof params[2] === 'number' && Math.trunc(f(params[2])) > 0));
  const spawn = { ...position };
  if (mode === 0) {
    const xOffset = typeof params[0] === 'number' ? Math.trunc(f(params[0])) : 0;
    const yOffset = typeof params[1] === 'number' ? Math.trunc(f(params[1])) : 0;
    spawn.x = f(f(position.x) + f(f(partySize - 2) * xOffset));
    spawn.y = f(f(position.y) + f(f(f(partySize) * f(.8)) * yOffset));
  }
  placeNativeActorBodies(actor, spawn);
  return actor;
}
