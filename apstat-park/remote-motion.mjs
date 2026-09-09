const DELAY_MS = 500;
const TELEPORT_DISTANCE = 200;

// Presentation only. Never predicts shared progress or adds network messages.
export class RemoteMotion {
  constructor(now = () => performance.now()) { this.now = now; this.tracks = new Map(); }

  reset(poses = {}) {
    this.tracks.clear();
    for (const [member, pose] of Object.entries(poses)) this.push(member, pose);
  }

  push(member, pose) {
    if (!pose || !['x', 'y', 'vx', 'vy'].every(key => Number.isFinite(pose[key]))) return false;
    const at = this.now(), samples = this.tracks.get(member) ?? [];
    const previous = samples.at(-1);
    if (previous && (at < previous.at || Math.hypot(pose.x - previous.pose.x, pose.y - previous.pose.y) > TELEPORT_DISTANCE)) samples.length = 0;
    if (samples.at(-1)?.at === at) samples.pop();
    samples.push({ at, pose: { x: pose.x, y: pose.y, vx: pose.vx, vy: pose.vy } });
    if (samples.length > 4) samples.shift();
    this.tracks.set(member, samples);
    return true;
  }

  sample(member, moving = true) {
    const samples = this.tracks.get(member);
    if (!samples?.length) return null;
    if (!moving) return { ...samples.at(-1).pose };
    const target = this.now() - DELAY_MS;
    if (target <= samples[0].at) return { ...samples[0].pose };
    for (let i = 1; i < samples.length; i++) {
      const right = samples[i], left = samples[i - 1];
      if (target > right.at) continue;
      const fraction = (target - left.at) / (right.at - left.at);
      return { ...right.pose, x: left.pose.x + (right.pose.x - left.pose.x) * fraction,
        y: left.pose.y + (right.pose.y - left.pose.y) * fraction };
    }
    // No extrapolation: silent or disconnected peers stay at their last anchor.
    return { ...samples.at(-1).pose };
  }
}
