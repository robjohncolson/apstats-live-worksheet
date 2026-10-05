const f = Math.fround;

// bb5a8e0/bb5ac70. Random values are supplied by the native RNG adapter;
// preserving call count matters, including the probability call at capacity.
export function stepNativeMagnetParticles(magnet, randomFloat) {
  if (magnet.scene.actorManager.flags & 8) return;
  const active = Boolean(magnet.magnetFlags & 2);
  const right = magnet.owner.scale.x > 0;
  for (let i = 0; i < magnet.particles.length;) {
    const particle = magnet.particles[i];
    let x = f(-particle.x), y = f(-particle.y);
    if (particle.moving) {
      x = f(x + (right ? 18 : -18));
      particle.moving = right ? x < 0 : x > 0;
    }
    if (particle.moving) {
      particle.x = f(particle.x + f(x * f(.03)));
      particle.y = f(particle.y + f(y * f(.04)));
      const distance = f(Math.sqrt(f(f(x * x) + f(y * y))));
      if (distance < 30 || !active) particle.alpha = f(particle.alpha - f(.02));
    } else particle.alpha = f(particle.alpha - f(.02));
    if (particle.alpha > 0) i++;
    else magnet.particles.splice(i, 1);
  }
  if (!active) return;
  if (magnet.particles.length && !(f(randomFloat()) > f(.8))) return;
  if (magnet.particles.length === 16) return;
  const amount = f(randomFloat());
  const x = f(f(30 * amount) + 80);
  const height = f(f(10 * amount) + 30);
  const y = f(f(randomFloat()) * height);
  const positiveY = f(randomFloat()) > .5;
  magnet.particles.push({ x: right ? x : f(-x), y: positiveY ? y : f(-y), alpha: .5, moving: true });
}
