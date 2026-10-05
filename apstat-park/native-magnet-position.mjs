const f = Math.fround;

// bb5a2d0. Account for the target's scaled body origin and width, rather than
// assuming all carried objects have the standard Player rectangle.
export function nativeMagnetHeldPosition(magnet) {
  if (!magnet.target) return { x: 0, y: 0 };
  const body = magnet.target.bodies[0]?.body;
  if (!body) throw new Error('Native magnet target requires its first body');
  const left = f(f(f(body.rawBounds.x - body.pivot.x) * body.scale.x) + body.pivot.x);
  const horizontal = magnet.owner.scale.x > 0 ? f(10 - left)
    : f(f(-10 - left) - f(body.scale.x * body.rawBounds.width));
  return { x: f(f(magnet.position.x + magnet.gripOffset.x) + horizontal),
    y: f(f(magnet.position.y + magnet.gripOffset.y) + 10) };
}

// bb59e50 recovered from x64 (absent from functions_split). Particle updates
// bb5a8e0 run before this transform section and remain a separate dependency.
export function followNativeMagnetOwner(magnet) {
  const owner = magnet.owner, right = owner.scale.x > 0;
  magnet.spriteFlags = owner.spriteFlags & 8 ? magnet.spriteFlags | 8 : magnet.spriteFlags & ~8;
  magnet.position = { x: f(owner.position.x + (right ? 20 : -170)), y: f(owner.position.y - 10) };
  magnet.gripOffset = { x: right ? 0 : 150, y: 0 };
  magnet.scale = { x: right ? 1 : -1, y: 1 };
  if (!(magnet.magnetFlags & 1) || !magnet.target) return;
  const goal = nativeMagnetHeldPosition(magnet);
  const x = f(goal.x - magnet.target.position.x), y = f(goal.y - magnet.target.position.y);
  const distance = f(Math.sqrt(f(f(x * x) + f(y * y))));
  if (distance > 32) magnet.magnetFlags &= ~1;
}

// bb59530 release branch: command first, Player flag restoration second.
// Clearing the POST alignment latch alone must not execute this release.
export function releaseNativeMagnetTarget(magnet) {
  const target = magnet.target;
  if (!target) return;
  magnet.magnetFlags &= ~1;
  target.onCommand(0x1e, 0);
  if (magnet.scene.players.includes(target)) target.playerFlags |= 8;
  magnet.target = null;
}
