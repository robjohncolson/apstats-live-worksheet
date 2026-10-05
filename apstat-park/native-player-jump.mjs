import { hasNativeDirectionalContact } from './native-body-query.mjs';
import { propagateNativeJumpImpulse } from './native-player-impulse.mjs';
const f = Math.fround;
const holding = state => ((state.holdTicks - 1) >>> 0) < 13;

// Fields of walking controller bb6f020 used by bb6f0e0's vertical branch.
export function createNativeJumpState() {
  return { flags: 0, bounceVelocity: 0, holdTicks: 0, jumpCount: 0, graceSeconds: 0, jumpStarted: 0 };
}

// bb68770, ordinary form. Special form 3 supplies its transformed base speed
// through baseVelocity; shrinking scales it, enlargement does not.
export function nativePlayerJumpVelocity(scaleY = 1, baseVelocity = f(-5.1)) {
  if (scaleY >= 1) return f(baseVelocity);
  return f(baseVelocity * f(f(scaleY * f(.19999998807907104)) + f(.800000011920929)));
}

// bb6f608..6f8ac. Called AFTER airborne/grounded velocity preparation. Input
// edge/held filtering belongs to the caller.
export function stepNativePlayerJump(state, {
  body, velocity, dt, playerFlags = 0, jumpLimit = 0, pressed = false, held = false,
  jumpVelocity = nativePlayerJumpVelocity(), playSound, setAnimation,
  ceilingJump = propagateNativeJumpImpulse, transferControl,
}) {
  if (velocity.y >= 0) state.holdTicks = 0;
  let eligible = false;
  if (body) {
    if (hasNativeDirectionalContact(body, { x: 0, y: 1 })) {
      state.graceSeconds = f(.07);
      state.jumpCount = 0;
      eligible = true;
    } else if (state.graceSeconds > 0) {
      state.graceSeconds = f(state.graceSeconds - f(dt));
      eligible = true; // native allows the tick which crosses below zero
    }
    if (holding(state)) eligible = true;
  }

  if (!body || (!(playerFlags & 2) && !eligible)) {
    if (!(state.flags & 1)) return;
    if (state.flags & 2) { playSound('jump'); velocity.y = state.bounceVelocity; setAnimation(2); }
    state.bounceVelocity = 0;
    state.flags &= ~3;
    return;
  }

  if ((jumpLimit < 1 || state.jumpCount < jumpLimit) && pressed && !(state.flags & 1)) {
    state.graceSeconds = 0;
    state.jumpCount = (state.jumpCount + 1) >>> 0;
    state.jumpStarted = 1;
    playSound('jump');
    setAnimation(2);
    if (hasNativeDirectionalContact(body, { x: 0, y: -1 })) {
      // bc15c70 distributes a jump through the overhead contact chain.
      ceilingJump(body, jumpVelocity, 2);
    } else {
      state.holdTicks = 1;
      if (velocity.y < jumpVelocity) { state.holdTicks = 14; jumpVelocity = velocity.y; }
      velocity.x = 0;
      velocity.y = f(jumpVelocity);
      if (playerFlags & 4) transferControl();
    }
  } else if (holding(state) && held) {
    const factor = f(f(1 - f(state.holdTicks / f(14))) * f(.2));
    velocity.y = f(velocity.y + f(jumpVelocity * factor));
    state.holdTicks++;
  } else {
    state.holdTicks = 0;
  }

  if (state.holdTicks) { state.flags &= ~3; return; }
  if (!(state.flags & 1)) return;
  playSound('jump');
  velocity.y = state.bounceVelocity;
  state.bounceVelocity = 0;
  setAnimation(2);
  state.flags &= ~1;
}
