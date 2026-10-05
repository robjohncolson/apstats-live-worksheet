import { createNativeActorCircle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
const f = Math.fround;
const integer = value => typeof value === 'number' ? Math.trunc(f(value)) | 0 : 0;

// Ordinary Switch: bb5e8c0(mode0/style0), bb5eef0, bb5f1d0, bb5ebb0.
// Specialized Switch subclasses and mode2 PhysicsSwitch use separate factories.
export function createNativeSwitchActor({ spawn }) {
  const params = spawn.raw.slice(6);
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31),
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    switchFlags: integer(params[0]) > 0 ? 0x40 : 0, commandValue: integer(params[1]),
    extraTarget: typeof params[2] === 'string' ? params[2].slice(0, 31) : '',
    lastContactBody: null, spriteFlags: 0x18, spriteDepth: f(.1),
    spriteBounds: { x: -16, y: -32, width: 32, height: 32 },
    spriteUV: { x: .15625, y: .4375, width: .015625, height: .015625 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt),
    onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    beforeMotion() {
      let flags = actor.switchFlags;
      actor.switchFlags = flags & 0x10 ? (flags & ~0x10) | 0x20 : flags & ~0x20;
      const pressed = Boolean(actor.switchFlags & 2);
      actor.spriteUV.x = pressed ? .171875 : .15625;
      if (pressed !== Boolean(actor.switchFlags & 1)) {
        if (!(actor.switchFlags & 0x100)) publish(pressed);
        if (pressed) actor.scene.playSound?.('switch');
        actor.onSwitchChanged?.(pressed); // native virtual +108, after publication/sound
      }
      flags = actor.switchFlags;
      flags = flags & 2 ? flags | 1 : flags & ~1;
      actor.lastContactBody = null;
      if (flags & 0x40) flags &= ~2;
      actor.switchFlags = flags & ~8;
      if (flags & 4) actor.switchFlags = (flags & ~6) | 8;
    },
    onCommand(command) {
      if (command === 0x14 && (actor.switchFlags & 2)) actor.switchFlags = (actor.switchFlags & ~2) | 0x10;
      return 0;
    },
    // bb5ed50/bb5eda0 state snapshot adapter; transport remains scene-owned.
    readPressedState: () => actor.switchFlags & 2 ? 1 : 0,
    applyPressedState(value) {
      actor.switchFlags = actor.switchFlags & 2 ? actor.switchFlags | 1 : actor.switchFlags & ~1;
      const pressed = Boolean(value & 1);
      if (pressed !== Boolean(actor.switchFlags & 2)) {
        if (pressed) actor.scene.playSound?.('switch');
        actor.spriteUV.x = pressed ? .171875 : .15625;
      }
      actor.switchFlags = pressed ? actor.switchFlags | 2 : actor.switchFlags & ~2;
    },
  };
  function replica() { return actor.replication && actor.scene.networkMode === 1; }
  function publish(pressed) {
    if (replica()) return;
    const index = actor.name.indexOf('Switch');
    if (index < 0) return;
    actor.scene.sendCommand(actor.name.slice(index + 6), pressed ? 9 : 10, actor.commandValue);
    if (actor.extraTarget) actor.scene.sendCommand(actor.extraTarget, pressed ? 9 : 10, actor.commandValue);
  }
  actor.publishSwitchState = publish; // shared native bb5ebb0, also called by DelaySwitch expiry
  actor.body = createNativeActorCircle(actor, { x: 0, y: 0, radius: 12 }, 0, true);
  actor.body.category = 5;
  actor.body.onOverlap = other => {
    if (!other || !(other.type & 2) || ((other.category - 1) >>> 0) > 2) return;
    const recipient = other.actor;
    if (!replica()) {
      let flags = actor.switchFlags;
      if (!(flags & 0x30)) {
        actor.lastContactBody = other;
        if (!(flags & 2)) {
          if ((flags & 8) && (flags & 1)) {
            actor.switchFlags &= ~1;
            if (!(flags & 0x100)) publish(false);
          }
          actor.switchFlags |= 2;
          if (!recipient) return;
          if (actor.switchFlags & 0x80) recipient.onCommand?.(0x1a);
        }
      } else {
        recipient?.onCommand?.(0, { x: -3, y: -7 });
        actor.switchFlags |= 0x10;
      }
    }
    if (recipient) recipient.renderOffset = { x: 0, y: -3 };
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
