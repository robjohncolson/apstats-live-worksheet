// bb68830: actor virtual80 is input/network authority, not a health check.
export function nativePlayerHasInputAuthority(actor) {
  if (!actor.networkOwner) return true;
  if (actor.scene.networkMode === 2) return actor.playerIndex === 0;
  return actor.playerIndex === actor.scene.localPlayerIndex;
}

// bb68300. Remote held bits use jump40/left10/right20; those bit positions
// differ from ordinary action masks (jump is action2). A remote special form
// may fall back to its locally owned component only when the replay bit is off.
export function nativePlayerHeld(actor, action) {
  if (actor.inputEnabled === 0) return false;
  const scene = actor.scene;
  if (scene.debugForcedRightPlayer >= 0 && scene.debugForcedRightPlayer === actor.playerIndex && action === 6) return true;
  if (actor.networkOwner && scene.networkMode === 1 && !nativePlayerHasInputAuthority(actor)) {
    const replayMask = action === 2 ? 0x40 : action === 5 ? 0x10 : action === 6 ? 0x20 : 0;
    if (actor.remoteHeldBits & replayMask) return true;
    if (actor.inputMode !== 3 || actor.specialInputOwner !== scene.localPlayerIndex) return false;
    return Boolean(actor.inputStates[3].current & (1 << (action & 31)));
  }
  if (scene.inputFlags & 8) return Boolean(actor.replayInput.current & (1 << (action & 31)));
  if (actor.inputMode === 0) return Boolean(scene.playerInput.held(action, actor.playerIndex));
  if (actor.inputMode === 1) return Boolean(actor.aiInput.held(action));
  if (actor.inputMode < 2 || actor.inputMode > 5) return false;
  return Boolean(actor.inputStates[actor.inputMode].current & (1 << (action & 31)));
}

// bb68510/bb6ad30: PRESSED has no remote-held or debug-right branch. It uses
// the selected input source's current/previous state, even for remote actors.
export function nativePlayerPressed(actor, action) {
  if (actor.inputEnabled === 0) return false;
  const scene = actor.scene;
  let state;
  if (scene.inputFlags & 8) state = actor.replayInput;
  else {
    if (actor.inputMode === 0) return Boolean(scene.playerInput.pressed(action, actor.playerIndex));
    if (actor.inputMode === 1) return Boolean(actor.aiInput.pressed(action));
    if (actor.inputMode < 2 || actor.inputMode > 5) return false;
    state = actor.inputStates[actor.inputMode];
  }
  const mask = 1 << (action & 31);
  return Boolean(state.current & mask) && !(state.previous & mask);
}
