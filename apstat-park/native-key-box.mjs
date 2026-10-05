// Native BallBox/LaserKeyBox reward state, separated from collision detection.
// BallBox: bb53e10 / bb53ff0 / bb54330 / bb54060.
// LaserKeyBox: bb544e0 / bb54780 / bb54940 / bb54860 / bb547f0.
// Their previously documented bb5d420 mapping belongs to a different actor.
export function createNativeKeyBox({ kind, x, y, target = '', multiplier = 1,
  releaseKey, sendCommand = () => {} }) {
  let hits = 0, remaining = 0, alpha = 1, removed = false, released = false;

  function release() {
    remaining = 40;
    if (released) return;
    released = true;
    releaseKey({ x, y: y - 30 });
  }

  return {
    get state() { return { hits, remaining, alpha, removed, released }; },
    setPosition(nextX, nextY) { x = nextX; y = nextY; },
    ballContact(ball) {
      if (kind !== 'BallBox' || removed || released) return false;
      // Native contact hands command 11 the box X and requires positive acceptance.
      if (Math.abs(ball.x - x) > 5 || ball.receiveCommand(11, x) <= 0) return false;
      release();
      return true;
    },
    laserContact(direction, bodyCategory) {
      if (kind !== 'LaserKeyBox' || removed || released) return false;
      if (direction !== 1 || bodyCategory !== 5) return false;
      hits++;
      if (hits < 3) {
        if (target) sendCommand(target, 0x15, multiplier);
      } else {
        release();
      }
      return true;
    },
    receiveCommand(command) {
      if (kind !== 'LaserKeyBox' || command !== 0x25 || hits >= 3) return false;
      hits = 0;
      if (target) sendCommand(target, 0x16);
      return true;
    },
    tick() {
      if (!remaining) return;
      if (remaining >= 20 && remaining < 31) alpha = (remaining - 20) / 10;
      remaining--;
      if (!remaining) removed = true;
    },
  };
}
