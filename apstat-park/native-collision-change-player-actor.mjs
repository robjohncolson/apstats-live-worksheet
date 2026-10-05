import { createNativeActorRectangle, unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost,
  runNativeCommonActorAlternatePre } from './native-actor-lifecycle.mjs';
import { applyNativePlayerSlot } from './native-player-slot.mjs';
const f = Math.fround;
const numeric = value => typeof value === 'number' ? f(value) : 0;

// Factory bb75ccd->bb3a210, Lua bb3a300, PRE bb3a2a0, overlap LAB_bb3a420.
// This is an invisible sensor that rotates input ownership, not a Player form.
export function createNativeCollisionChangePlayerActor({ spawn }) {
  const params = spawn.raw.slice(6);
  const actor = {
    name: (spawn.actorName + (spawn.label ?? '')).slice(0, 31),
    flags: 0, motionFlags: 12, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    triggered: false, overlapSeen: false, rearm: Math.trunc(numeric(params[2])) > 0,
    spriteFlags: 8, spriteBounds: { x: 0, y: 0, width: 0, height: 0 },
    onAdded(scene) { actor.scene = scene; runNativeCommonActorAdded(actor, scene); },
    onRemoved() { unregisterNativeActorBodies(actor); actor.scene = null; },
    onPre: dt => runNativeCommonActorPre(actor, dt), onPost: dt => runNativeCommonActorPost(actor, dt),
    onAlternatePre: dt => runNativeCommonActorAlternatePre(actor, dt),
    beforeMotion() {
      if (!actor.rearm) return;
      if (actor.overlapSeen) { actor.overlapSeen = false; return; }
      actor.triggered = false;
    },
  };
  actor.body = createNativeActorRectangle(actor,
    { x: 0, y: 0, width: numeric(params[0]), height: numeric(params[1]) }, 0, true);
  actor.body.category = 4;
  actor.body.onOverlap = other => {
    const scene = actor.scene;
    if ((scene.flags & 0x100) && scene.networkMode === 1) return;
    actor.overlapSeen = true; // Even a non-player overlap delays rearming.
    if (actor.triggered || other.category !== 1) return;
    const count = scene.players.length, party = scene.playerCount >>> 0;
    const host = (scene.flags & 0x100) && scene.networkMode === 2;
    if (party > 2) {
      scene.playSound('generate');
      if (host) scene.sendNativeControlPacket({ transport: 'host', target: 0xff,
        channel: 1, kind: 2, command: 3, value: 0 });
    }
    for (let i = 0; i < count; i++) {
      const player = scene.players[i];
      let index = scene.playerSlots.indexOf(player.playerIndex);
      if (index < 0) index = 0;
      const next = ((index + count) >>> 0) % party;
      let slot = scene.playerSlots[next] ?? 0;
      // bc22ce0 treats host slot0 as connected. Other slots use host peers;
      // falling back to the old slot bounds the original search.
      if (host) {
        while (slot !== 0 && !scene.isNativePlayerConnected(slot) && slot !== player.playerIndex) {
          slot = ((slot + 1) >>> 0) % party;
        }
      }
      applyNativePlayerSlot(player, slot);
    }
    actor.triggered = true;
  };
  placeNativeActorBodies(actor, { x: spawn.x, y: spawn.y });
  return actor;
}
