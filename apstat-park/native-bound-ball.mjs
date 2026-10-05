// Literal BoundBall (bb36d10), not the unrelated input-controlled bb3b5e0 actor.
// Coordinates and velocities are native actor units per 60 Hz frame.
const f = Math.fround;
const GRAVITY = f(0.65);
const EPSILON = 1.1920928955078125e-7;
const BOUNCE_THRESHOLD = f(1.2);
const dot = (a, b) => f(f(a.x * b.x) + f(a.y * b.y));

// bb37500 reconstructs vertical velocity after positional collision resolution.
export function boundContactVelocity({ velocity, y, previousY, previousVelocityY }) {
  const potential = f(f(y * GRAVITY) - f(f(previousY * GRAVITY)
    - f(f(previousVelocityY * previousVelocityY) * f(0.5))));
  const magnitude = f(Math.sqrt(f(potential + potential)));
  return { x: velocity.x, y: f((velocity.y < 0 ? -1 : 1) * magnitude) };
}

export function boundBodyResponse(velocity, normal, otherVelocity, otherMass, restitution) {
  const ballNormal = dot(velocity, normal);
  const otherNormal = dot(otherVelocity, normal);
  if (ballNormal < otherNormal) return { ...velocity };
  // Native mass is 50, and both masses participate (no infinite-mass shortcut).
  const numerator = f(f(f(50 - f(otherMass * restitution)) * ballNormal)
    + f(f(f(restitution + 1) * otherMass) * otherNormal));
  let replacement = f(numerator / f(otherMass + 50));
  if (Math.abs(replacement) < BOUNCE_THRESHOLD) replacement = 0;
  return {
    x: f(f(velocity.x - f(normal.x * ballNormal)) + f(normal.x * replacement)),
    y: f(f(velocity.y - f(normal.y * ballNormal)) + f(normal.y * replacement)),
  };
}

export function boundMapResponse(velocity, normal) {
  const projected = dot(velocity, normal);
  let component = { x: f(normal.x * projected), y: f(normal.y * projected) };
  if (Math.hypot(component.x, component.y) < BOUNCE_THRESHOLD) component = { x: 0, y: 0 };
  return {
    x: f(f(velocity.x - component.x) - component.x),
    y: f(f(velocity.y - component.y) - component.y),
  };
}

export function createNativeBoundBall({ x, y, velocity, partySize, localMode = false }) {
  let previousY = y, previousVelocityY = velocity.y;
  let remaining = 0, stoppedContacts = 0, supportLastTick = false;
  let alpha = 1, scale = 1, removed = false, captured = false;
  const largeNetworkParty = !localMode && partySize > 4;
  const restitution = largeNetworkParty ? 1 : BOUNCE_THRESHOLD;
  function stop() { remaining = 30; velocity = { x: 0, y: 0 }; }

  return {
    get x() { return x; },
    get removed() { return removed; },
    get state() { return { x, y, velocity: { ...velocity }, previousY, previousVelocityY,
      radius: 12, remaining, stoppedContacts, alpha, scale, removed, captured }; },
    // Native movement runs after the actor PRE hook (bc16120).
    tick(supported = false) {
      if (removed) return;
      if (stoppedContacts && !remaining) {
        if (Math.abs(velocity.y) > EPSILON) stoppedContacts = 0;
        else {
          if (stoppedContacts >= (largeNetworkParty ? 0 : 2)) stop();
          stoppedContacts++;
        }
      }
      if (remaining) {
        if (remaining >= 20) {
          scale = f(Math.pow(1.0499999523162842, 31 - remaining));
          alpha = f((remaining - 20) / 10);
        }
        remaining--;
        if (!remaining) { removed = true; return; }
      } else {
        if (supported && (supportLastTick || largeNetworkParty)) velocity.x = f(velocity.x * f(0.95));
        supportLastTick = supported;
      }
      previousY = y; previousVelocityY = velocity.y;
      x = f(x + velocity.x);
      y = f(y + f(velocity.y + f(GRAVITY * f(0.5))));
      velocity.y = f(velocity.y + GRAVITY);
    },
    resolvePosition(nextX, nextY) { x = f(nextX); y = f(nextY); },
    contact(normal, other) {
      if (remaining || removed) return;
      velocity = boundContactVelocity({ velocity, y, previousY, previousVelocityY });
      if (!other) {
        velocity = boundMapResponse(velocity, normal);
        if (Math.abs(normal.y - 1) <= EPSILON) stop();
        return;
      }
      velocity = boundBodyResponse(velocity, normal, other.velocity, other.mass, restitution);
      if ((other.category === 1 || other.category === 5) && Math.abs(velocity.y) <= EPSILON) stoppedContacts++;
    },
    receiveCommand(command, nextX) {
      if (command !== 11 || removed) return 0;
      remaining = 30; captured = true;
      velocity = { x: 0, y: 3 };
      if (nextX !== undefined) x = f(nextX);
      return 1;
    },
  };
}
