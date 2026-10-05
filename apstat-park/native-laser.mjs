// Laser child: bb4e470 / bb4e6f0 / bb4ea70 / bb4ec10.
export function createNativeLaser({ x, y, velocity, scale = 1, target = '',
  sendCommand = () => {}, onContact = () => {} }) {
  const f = Math.fround;
  let remaining = 0, alpha = 1, visualScale = scale, removed = false;
  return {
    get state() { return { x, y, radius: 12 * scale, remaining, alpha, scale: visualScale, removed }; },
    get removed() { return removed; },
    contact(category) {
      if (remaining || removed) return false;
      remaining = 30;
      velocity = { x: 0, y: 0 };
      if (category === 1 && target) sendCommand(target, 0x25);
      onContact();
      return true;
    },
    tick() {
      if (removed) return;
      if (remaining) {
        if (remaining >= 20) {
          visualScale = f(Math.pow(1.0499999523162842, 31 - remaining));
          alpha = f((remaining - 20) / 10);
        }
        remaining--;
        removed = remaining === 0;
        return;
      }
      x = f(x + velocity.x);
      y = f(y + velocity.y);
    },
  };
}

export function laserTouchesRect(state, rect) {
  // bc119c0 uses circle distance only when BOTH shapes are circles.
  // Mixed circle/rectangle pairs use bb4e260 bounds and strict AABB overlap.
  return state.x + state.radius > rect.x && state.x - state.radius < rect.x + rect.width
    && state.y + state.radius > rect.y && state.y - state.radius < rect.y + rect.height;
}
