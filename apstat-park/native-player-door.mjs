import { findNativeBody } from './native-body-registry.mjs';
import { nativeBodyPlacementBlocked } from './native-body-placement.mjs';
const f = Math.fround;

// Player branch of Goal continuous overlap (bb531d0). Key opening remains the Goal actor's
// separate category8 branch. Both Goal and Player replication gates matter.
export function requestNativePlayerDoorEntry(goal, other) {
  if (goal.networkOwner && goal.scene.networkMode === 1) return;
  if (other.category !== 1 || !goal.opened) return;
  const player = other.actor;
  if (!player.input.pressed(3)) return;
  if (player.networkOwner && player.scene.networkMode === 1) return;
  player.fallState = 4;
}

// Controller kind4, bb6e990/bb6ea00/bb6eab0/bb6eb80. Enter clears own actor
// contacts only. Map contacts and reciprocal contact lists are retained.
export function createNativeDoorController() {
  const state = { phase: 0, remaining: 1 };
  return {
    state,
    enter(actor) {
      actor.spriteFlags &= ~8;
      const body = actor.bodies[0].body;
      body.flags &= ~1;
      for (const contact of body.contacts) {
        const other = body.world ? findNativeBody(body.world, contact.bodyId) : null;
        body.onContactEnd?.(other ?? null, contact.normal, 1);
      }
      body.contacts.length = 0;
    },
    leave(actor) {
      actor.spriteFlags |= 8;
      actor.bodies[0].body.flags |= 1;
    },
    pre(actor, dt) {
      if (state.phase === 0) {
        actor.velocity = { x: 0, y: 0 };
        for (const component of actor.components) component.consumeVelocity?.(actor.velocity);
        state.phase = 1;
      } else if (state.phase === 1) {
        state.remaining = f(state.remaining - f(dt));
        if (state.remaining <= 0) state.phase = 2;
      }
    },
    post(actor) {
      if (state.phase !== 2 || !actor.input.pressed(3)) return;
      const body = actor.bodies[0].body;
      if (nativeBodyPlacementBlocked(body.world, body)) return;
      if (actor.networkOwner && actor.scene.networkMode === 1) return;
      actor.fallState = actor.playerFlags & 0x40 ? 5 : 2;
    },
    receive() { return 0; },
  };
}
