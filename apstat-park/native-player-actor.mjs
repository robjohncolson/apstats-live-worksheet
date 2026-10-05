import { createNativePlayerBody, setNativePlayerEnabled } from './native-player-body.mjs';
import { nativePlayerHeld, nativePlayerPressed, nativePlayerHasInputAuthority } from './native-player-input.mjs';
import { receiveNativePlayerCommand } from './native-player-command.mjs';
import { createNativeWalkController } from './native-walk-controller.mjs';
import { createNativeDeathController, createNativeHiddenController, applyNativePlayerControllerChange } from './native-player-death.mjs';
import { createNativeDoorController } from './native-player-door.mjs';
import { nativePlayerJumpVelocity } from './native-player-jump.mjs';
import { isNativePlayerAirborne, recordNativePlayerCorrection, applyNativePlayerCorrectionVelocity } from './native-player-motion.mjs';
import { runNativeCommonActorAdded, runNativeCommonActorPre, runNativeCommonActorPost } from './native-actor-lifecycle.mjs';
import { unregisterNativeActorBodies } from './native-actor-bodies.mjs';
import { placeNativeActorBodies } from './native-actor-motion.mjs';
import { resizeNativePlayer } from './native-player-resize.mjs';
const f = Math.fround;

// Normal Player assembly (bb66e50/69010/690d0/691d0). Presentation implements
// the sprite/atlas interface. Forms, extended controllers and network history
// use explicit extension calls; absent implementations fail when exercised.
export function createNativePlayer({ playerIndex = 0, position, presentation, extensions = {} }) {
  const actor = {
    playerIndex, managerPriority: 1, flags: 0, motionFlags: 0x1c, playerFlags: 8, networkFlags: 0,
    spriteFlags: 9, cameraRelative: true, bodies: [], components: [],
    velocity: { x: 0, y: 0 }, acceleration: { x: 0, y: 0 }, externalVelocity: { x: 0, y: 0 },
    collisionCorrection: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    gravityDirection: { x: 0, y: 1 }, scale: { x: 1, y: 1 },
    health: 1, previousHealth: 0, damageReportPending: 1, fallState: 0, controllerKind: 2,
    baseSpeed: 3, speedScale: 1, jumpLimit: -1, animation: 0,
    inputEnabled: 1, defaultInputEnabled: 1, inputMode: 0, remoteHeldBits: 0,
    historyFlags: 1, positionHistory: [], animationSeek: -1,
    carriedAttachments: [], message: 0, messageSeconds: 0,
    input: { held: action => nativePlayerHeld(actor, action), pressed: action => nativePlayerPressed(actor, action) },
    canReceiveDamage: () => nativePlayerHasInputAuthority(actor),
    getWalkSpeed: () => actor.inputMode === 3 ? f(actor.specialInput.walkSpeed) : f(actor.baseSpeed * actor.speedScale),
    getJumpVelocity: () => nativePlayerJumpVelocity(actor.scale.y,
      actor.inputMode === 3 ? actor.specialInput.getJumpVelocity() : f(-5.1)),
    playSound: name => actor.scene.playSound(name),
    transferControl: () => extensions.transferControl(actor),
    resetSpriteBounds: () => presentation.resetSpriteBounds(actor),
    setAnimation(value, force = false) {
      if (value === actor.animation) return;
      if (!force && value === 1 && actor.animation !== 0 && actor.animation !== 3) return;
      if (!force && value === 3 && actor.animation > 1) return;
      presentation.setAnimation(actor, value);
      if (actor.animationSeek >= 0 && actor.animationSeek === value) presentation.seekAnimation(actor, actor.animationSeekFrame);
      actor.animation = value;
    },
    faceDirection(direction) {
      if (!(actor.motionFlags & 4)) return;
      actor.scale.x = f(Math.abs(actor.scale.x) * (direction < 0 ? -1 : 1));
      presentation.setScale(actor, actor.scale);
    },
    onScaleResolved(x, y) {
      // bb69ab0 corrects attached components, not the main sprite's size.
      const expand = value => value > 1 ? f(f(f(value - 1) / f(.88)) + 1) : value;
      for (const component of actor.components) component.setScale?.(expand(x), expand(y));
    },
    onStopped() { actor.spriteFlags |= 2; actor.stepStartPosition = { ...actor.position }; },
    onResumed() { actor.spriteFlags &= ~2; },
    setEnabled: enabled => setNativePlayerEnabled(actor, enabled),
    setMessage(value) {
      actor.message = value | 0;
      actor.messageSeconds = 3;
      if (value) actor.scene.playSound('message');
      if (nativePlayerHasInputAuthority(actor) && actor.scene.networkMode === 1) extensions.sendMessage(actor, value);
    },
    onAdded(scene) {
      actor.scene = scene;
      runNativeCommonActorAdded(actor, scene);
      if (scene.flags & 0x100) extensions.onNetworkAdded(actor, scene);
    },
    onRemoved() { unregisterNativeActorBodies(actor); },
    onPre: dt => runNativeCommonActorPre(actor, dt),
    onPost: dt => runNativeCommonActorPost(actor, dt),
    beforeMotion(dt) {
      actor.previousHealth = actor.health;
      applyNativePlayerControllerChange(actor, makeController);
      if (actor.inputMode !== 0 || (actor.scene.inputFlags & 8)) extensions.beforeInput(actor, dt);
      actor.controller?.pre(actor, dt);
      if ((!(actor.scene.flags & 0x100) || actor.scene.networkMode === 2) && actor.message) {
        actor.messageSeconds = f(actor.messageSeconds - dt);
        if (actor.messageSeconds <= 0) actor.message = 0;
      }
      if (actor.inputMode !== 0) extensions.afterInput(actor, dt);
      actor.collisionCorrection = { x: 0, y: 0 };
    },
    afterMotion(dt) {
      applyNativePlayerCorrectionVelocity(actor);
      actor.controller?.post(actor, dt);
      if (!(actor.scene.actorManager.flags & 8)) {
        if ((actor.historyFlags & 1) && actor.positionHistory.length === 256) actor.positionHistory.pop();
        if (actor.positionHistory.length < 256) actor.positionHistory.unshift({
          x: f(actor.position.x - actor.stepStartPosition.x), y: f(actor.position.y - actor.stepStartPosition.y) });
        if (!isNativePlayerAirborne(actor) && !(actor.networkFlags & 4)) actor.networkFlags &= ~2;
        actor.networkFlags &= ~4;
        actor.animationSeek = -1;
      }
      if (actor.scene.networkMode === 2) extensions.afterNetworkMotion(actor, dt);
    },
    onPositionResolved: (_position, delta) => recordNativePlayerCorrection(actor, delta),
    onCarried(delta, direction, visited) {
      if (actor.carriedAttachments.some(Boolean)) extensions.carryAttachments(actor, delta, direction, visited);
    },
    onCommand: (command, value) => receiveNativePlayerCommand(actor, command, value),
    handleWalkTransformCommand(state, command, value) {
      if (command === 0x21) {
        const result = extensions.resize ? extensions.resize(actor, state, value) : resizeNativePlayer(actor, value);
        presentation.setScale(actor, actor.scale);
        return result;
      }
      if (!value) actor.setEnabled(false);
      else {
        const pending = state.pendingPosition;
        const lengthSquared = f(f(pending.x * pending.x) + f(pending.y * pending.y));
        if (lengthSquared > 2 ** -23) {
          if (actor.manager) { actor.flags &= ~1; actor.onResumed(); }
          state.flags |= 4;
        } else actor.setEnabled(true);
      }
      return 0;
    },
  };
  function makeController(kind) {
    if (kind === 1) return createNativeHiddenController();
    if (kind === 2) return createNativeWalkController();
    if (kind === 3) return createNativeDeathController();
    if (kind === 4) return createNativeDoorController();
    return extensions.createController(kind, actor);
  }
  actor.controller = makeController(2);
  if (playerIndex !== 10) actor.body = createNativePlayerBody(actor);
  placeNativeActorBodies(actor, position);
  return actor;
}
