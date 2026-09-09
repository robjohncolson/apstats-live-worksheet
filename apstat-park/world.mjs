const WIDTH = 24, HEIGHT = 30, STEP = 1 / 60;
const overlap = (left, right) => left.x < right.x + right.w && left.x + left.w > right.x
  && left.y < right.y + right.h && left.y + left.h > right.y;

// Only this player's body is simulated. Teammates contribute through durable
// puzzle actions rather than latency-sensitive body collisions.
export class ParkWorld {
  constructor(level) { this.enter(level); }

  enter(level) {
    this.level = level;
    this.player = { ...level.spawn, vx: 0, vy: 0, grounded: false };
    this.accumulator = 0;
    this.jumpHeld = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
  }

  update(seconds, input, bridgeOpen) {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    if (input.jump && !this.jumpHeld) this.jumpBuffer = 0.12;
    this.jumpHeld = !!input.jump;
    this.accumulator += Math.min(seconds, 0.25);
    while (this.accumulator >= STEP) {
      this.step(input, bridgeOpen);
      this.accumulator -= STEP;
    }
  }

  step(input, bridgeOpen) {
    const p = this.player;
    const platforms = bridgeOpen ? [...this.level.platforms, this.level.bridge] : this.level.platforms;
    this.coyote = p.grounded ? 0.1 : Math.max(0, this.coyote - STEP);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - STEP);
    p.vx = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 220;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      p.vy = -560;
      this.jumpBuffer = 0;
      this.coyote = 0;
    }
    p.vy = Math.min(p.vy + 1200 * STEP, 900);
    const body = () => ({ x: p.x - WIDTH / 2, y: p.y - HEIGHT / 2, w: WIDTH, h: HEIGHT });
    p.x = Math.max(WIDTH / 2, Math.min(this.level.width - WIDTH / 2, p.x + p.vx * STEP));
    for (const platform of platforms) {
      if (!overlap(body(), platform)) continue;
      if (p.vx > 0) p.x = platform.x - WIDTH / 2;
      if (p.vx < 0) p.x = platform.x + platform.w + WIDTH / 2;
    }
    p.y += p.vy * STEP;
    p.grounded = false;
    for (const platform of platforms) {
      if (!overlap(body(), platform)) continue;
      if (p.vy >= 0) { p.y = platform.y - HEIGHT / 2; p.grounded = true; }
      else p.y = platform.y + platform.h + HEIGHT / 2;
      p.vy = 0;
    }
    if (p.y > this.level.height + HEIGHT) {
      Object.assign(p, this.level.spawn, { vx: 0, vy: 0, grounded: false });
    }
  }

  pose() {
    const { x, y, vx, vy } = this.player;
    return { x, y, vx, vy };
  }

  nearby(member, progress) {
    const close = item => Math.hypot(this.player.x - item.x, this.player.y - item.y) <= 45;
    const sample = this.level.samples.find(item => item.owner === member && !progress.samples.includes(item.id) && close(item));
    if (sample) return { kind: 'sample', target: sample.id };
    const parcel = this.level.samples.find(item => item.owner === member && item.destination
      && progress.samples.includes(item.id) && !progress.deliveries.includes(item.id));
    if (parcel && close(this.level.switches.find(station => station.id === parcel.destination))) return { kind: 'deliver', target: parcel.id };
    const station = this.level.switches.find(item => item.owner === member && !progress.switches.includes(item.id) && close(item));
    if (station) return { kind: 'switch', target: station.id };
    if (progress.bridgeOpen && !progress.arrived.includes(member) && close(this.level.goal)) return { kind: 'arrive', target: 'exit' };
    return null;
  }
}
