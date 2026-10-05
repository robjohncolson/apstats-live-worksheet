// Draw-only interpolation. Collision, keys, timers and the local cat use real positions.
export function createPoseSmoothing({ now = () => performance.now() } = {}) {
  const tracks = new Map();
  function interpolate(track, time) {
    const fraction = Math.max(0, Math.min(1, (time - track.at) / track.duration));
    return { x: track.from.x + (track.to.x - track.from.x) * fraction,
      y: track.from.y + (track.to.y - track.from.y) * fraction };
  }
  return {
    sample(name, pose, { epoch, direct = false, snap = false } = {}) {
      const time = now(), previous = tracks.get(name);
      if (!previous || previous.epoch !== epoch || snap
        || Math.hypot(pose.x - previous.to.x, pose.y - previous.to.y) > 120) {
        tracks.set(name, { from: { ...pose }, to: { ...pose }, at: time, duration: 1, epoch });
        return pose;
      }
      if (pose.x !== previous.to.x || pose.y !== previous.to.y) {
        tracks.set(name, { from: interpolate(previous, time), to: { x: pose.x, y: pose.y },
          at: time, duration: direct ? 50 : 100, epoch });
      }
      return interpolate(tracks.get(name), time);
    },
    retain(names) { for (const name of tracks.keys()) if (!names.has(name)) tracks.delete(name); },
  };
}
