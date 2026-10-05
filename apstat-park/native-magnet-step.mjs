import { selectNativeMagnetTarget, nativeMagnetPullDisplacement } from './native-magnet-target.mjs';
import { nativeMagnetHeldPosition, releaseNativeMagnetTarget } from './native-magnet-position.mjs';
import { isNativePlayerAirborne, nativePlayerGravityDelta } from './native-player-motion.mjs';
const f = Math.fround;

// bb59530 input section. The toggle preference is global c6301b0, exposed
// through scene.magnetToggleInput until the application settings are connected.
export function stepNativeMagnetInput(magnet, dt) {
  const owner = magnet.owner, scene = magnet.scene;
  let active = false;
  if (owner && (owner.spriteFlags & 8)) {
    if (!magnet.replication || scene.networkMode !== 1 || owner.canReceiveDamage()) {
      active = owner.input.held(11);
      if (scene.magnetToggleInput) {
        const pressed = owner.input.pressed(11);
        active = magnet.magnetFlags & 2 ? !pressed : pressed;
      }
    } else active = Boolean(magnet.magnetFlags & 2);
  }
  magnet.magnetFlags = active ? magnet.magnetFlags | 2 : magnet.magnetFlags & ~2;
  if (!(scene.actorManager.flags & 8)) {
    if (!active) magnet.soundSeconds = 0;
    else {
      if (magnet.soundSeconds <= 0) {
        scene.playSound('magnet');
        magnet.soundSeconds = f(.6);
      }
      magnet.soundSeconds = f(magnet.soundSeconds - f(dt));
    }
  }
  return Boolean(active);
}

// bb59530 target lifetime and displacement. Candidate contacts are consumed
// once each PRE. Acquisition does not also move the target on that frame.
export function stepNativeMagnetGrab(magnet, dt) {
  const active = stepNativeMagnetInput(magnet, dt);
  const owner = magnet.owner;
  if (!magnet.target) {
    if (active && magnet.candidates.length) selectNativeMagnetTarget(magnet);
  } else if (!active || !magnet.candidates.includes(magnet.target)) {
    releaseNativeMagnetTarget(magnet);
  } else {
    const target = magnet.target;
    const movement = nativeMagnetPullDisplacement(magnet, nativeMagnetHeldPosition(magnet));
    const otherMagnet = target.carriedAttachments?.[0];
    const mutual = magnet.scene.players.includes(target) && otherMagnet?.isNativeMagnet && otherMagnet.target === owner;
    if (mutual) {
      target.velocity.x = 0;
      for (const component of target.components) component.consumeVelocity?.(target.velocity);
      if (isNativePlayerAirborne(owner)) {
        const delta = nativePlayerGravityDelta(owner.velocity, owner.gravityDirection);
        owner.velocity = { x: f(owner.velocity.x + delta.x), y: f(owner.velocity.y + delta.y) };
        for (const component of owner.components) component.consumeVelocity?.(owner.velocity);
      }
    } else {
      target.velocity = { ...movement };
      for (const component of target.components) component.consumeVelocity?.(target.velocity);
    }
    target.position = { x: f(target.position.x + movement.x), y: f(target.position.y + movement.y) };
  }
  magnet.candidates.length = 0;
  owner.motionFlags = magnet.target ? owner.motionFlags & ~4 : owner.motionFlags | 4;
}
