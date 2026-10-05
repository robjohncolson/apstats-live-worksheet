import { nativeDirectionalContactResponse } from './native-body-query.mjs';
const f = Math.fround;

// bb6f0e0 horizontal branch, before gravity/jump. Inputs have already passed
// bb68300's ownership/control gates. Ordinary scene movement uses bb7b700;
// mode5 bypasses that camera/group clipping callback.
export function prepareNativePlayerWalk({
  body, velocity, playerFlags, right = false, left = false, inputEnabled = true,
  animation = 0, speed = 3, inputMode = 0, clipMovement, faceDirection, setAnimation,
}) {
  velocity.x = playerFlags & 1 ? 0 : f(velocity.x * f(.98));
  const direction = right ? 1 : left ? -1 : 0;
  if (!direction) {
    if (!inputEnabled) {
      if (animation !== 5) setAnimation(5);
    } else if ([1, 3, 5].includes(animation)) setAnimation(0);
    return;
  }
  faceDirection(direction);
  const contact = nativeDirectionalContactResponse(body, { x: direction, y: 0 });
  if ((playerFlags & 1) && !(contact.responseFlags & 1)) {
    const requested = f(direction * f(speed));
    velocity.x = inputMode === 5 ? requested : f(clipMovement(requested));
  }
  setAnimation(contact.hit ? 3 : 1);
}
