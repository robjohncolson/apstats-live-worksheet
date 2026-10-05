import { createNativeJumpState, nativePlayerJumpVelocity, stepNativePlayerJump } from './native-player-jump.mjs';
import { prepareNativePlayerWalk } from './native-player-walk.mjs';
import { isNativePlayerAirborne, nativePlayerGravityDelta } from './native-player-motion.mjs';
import { tryNativePlayerRelocation } from './native-player-relocation.mjs';
import { hasNativeDirectionalContact } from './native-body-query.mjs';
import { findNativeBody } from './native-body-registry.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;

function setVelocity(actor, value) {
  actor.velocity = { x: f(value.x), y: f(value.y) };
  for (const component of actor.components) component.consumeVelocity?.(actor.velocity);
}

// bb6f523..608: RIGHT is checked first even when moving left. Map-only
// contacts leave the comparison surface at zero; only body contacts supply Y.
function adjustSmallStep(body, velocity) {
  let direction = 1;
  if (!hasNativeDirectionalContact(body, { x: 1, y: 0 })) {
    if (!hasNativeDirectionalContact(body, { x: -1, y: 0 })) return;
    direction = -1;
  }
  if (!(Math.abs(velocity.x) > EPSILON)) return;
  const others = body.world ? body.contacts.filter(contact =>
    Math.abs(f(contact.normal.x - direction)) <= EPSILON && Math.abs(f(contact.normal.y)) <= EPSILON)
    .map(contact => findNativeBody(body.world, contact.bodyId)).filter(Boolean) : [];
  if (others.length > 16) throw new Error('Native small-step contact capacity exceeded');
  let surface = 0;
  for (let i = 0; i < others.length; i++) {
    const top = f(others[i].localBounds.y + others[i].position.y);
    if (i === 0 || top < surface) surface = top;
  }
  const bottom = f(f(body.localBounds.y + body.position.y) + body.localBounds.height);
  const difference = f(bottom - surface);
  if (difference < .5) velocity.y = f(-difference - f(.01));
}

// Local walking controller, bb6f020/bb6f0e0/bb6fa50. Actor supplies native
// input/state/presentation hooks; scene supplies clipping and boundary rules.
// These required hooks prevent preview rules from silently standing in for
// controller dependencies that have not yet been integrated.
export function createNativeWalkController() {
  const state = { ...createNativeJumpState(), forcedX: 0, pendingPosition: { x: 0, y: 0 },
    jumpObserved: 0, predictionPending: 0 };
  return {
    state,
    pre(actor, dt) {
      const body = actor.bodies[0]?.body;
      if (!body) return;
      if (state.flags & 8) {
        state.holdTicks = state.jumpCount = state.bounceVelocity = 0;
        state.flags &= ~3;
        return;
      }
      const scene = actor.scene, input = actor.input;
      const velocity = { ...actor.velocity };
      prepareNativePlayerWalk({ body, velocity, playerFlags: actor.playerFlags,
        right: input.held(6), left: input.held(5), inputEnabled: actor.inputEnabled,
        animation: actor.animation, speed: actor.getWalkSpeed(), inputMode: actor.inputMode,
        clipMovement: value => scene.clipPlayerMovement(actor, value),
        faceDirection: value => actor.faceDirection(value), setAnimation: value => actor.setAnimation(value) });
      scene.applyPlayerScrollBoundary(actor, velocity);
      if (isNativePlayerAirborne(actor)) {
        const delta = nativePlayerGravityDelta(velocity, actor.gravityDirection);
        velocity.x = f(velocity.x + delta.x); velocity.y = f(velocity.y + delta.y);
      } else {
        if (actor.animation === 2) { actor.setAnimation(0); actor.onCommand(0x17); }
        velocity.y = 0;
        if (!(state.flags & 1)) state.forcedX = state.bounceVelocity = 0;
        actor.playerFlags |= 1;
        adjustSmallStep(body, velocity);
      }
      stepNativePlayerJump(state, { body, velocity, dt, playerFlags: actor.playerFlags,
        jumpLimit: actor.jumpLimit, pressed: input.pressed(2), held: input.held(2),
        jumpVelocity: actor.getJumpVelocity(), playSound: value => actor.playSound(value),
        setAnimation: value => actor.setAnimation(value), transferControl: () => actor.transferControl() });
      if (Math.abs(state.forcedX) > EPSILON) velocity.x = state.forcedX;
      velocity.x = f(velocity.x + actor.externalVelocity.x);
      velocity.y = f(velocity.y + actor.externalVelocity.y);
      actor.externalVelocity = { x: 0, y: 0 };
      setVelocity(actor, velocity);
      scene.checkPlayerFallBounds(actor, state);
    },
    post(actor) {
      tryNativePlayerRelocation(actor, state, actor.scene);
      if (actor.scene.actorManager.flags & 8) return;
      if (!state.predictionPending) {
        if (!state.jumpObserved && state.jumpStarted) state.predictionPending = 1;
      } else if (state.jumpObserved) state.predictionPending = 0;
      else if (!state.jumpStarted) actor.scene.reportPredictionMiss?.(actor);
    },
    // bb6fd20 motion commands. Relocation/resize and enable callbacks remain
    // actor-owned because they also affect bodies, art and activity state.
    receive(actor, command, value) {
      if ((command >>> 0) < 2) {
        if (!state.holdTicks) {
          state.forcedX = value == null ? 0 : f(value.x);
          state.bounceVelocity = value == null ? nativePlayerJumpVelocity() : f(value.y);
          state.flags |= command === 1 ? 3 : 1;
        }
        return 0;
      }
      if (command === 7) {
        if (value != null) state.pendingPosition = { x: f(value.x), y: f(value.y) };
        actor.scene.notifyPlayerRelocation(actor);
      } else if (command === 8) state.pendingPosition = { ...actor.position };
      else if (command === 0x1e && value != null) {
        state.flags = value ? state.flags | 8 : state.flags & ~8;
        setVelocity(actor, { x: 0, y: 0 });
        return 1;
      } else if (command === 0x22 && value != null) {
        actor.speedScale = Math.min(f(actor.speedScale * f(value)), f(2));
      } else if ((command === 0xe || command === 0x21) && value != null) {
        return actor.handleWalkTransformCommand(state, command, value);
      }
      return 0;
    },
  };
}
