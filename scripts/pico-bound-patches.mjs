import { fileURLToPath } from 'node:url';

export function patchNativeBound(source, replace, file) {
  const helper = fileURLToPath(new URL('../apstat-park/native-bound-runtime.mjs', import.meta.url));
  source = `import { createBoundRewardBox, tickNativeBoundBalls, contactNativeBoundBalls } from ${JSON.stringify(helper)};\n` + source;
  source = replace(source, `BallBox: (spawn) => {
      const normalBox = new NormalBox(spawn);
      this.normalBoxes.push(normalBox);
      this.addActorView(spawn, normalBox.view);
    },`, `BallBox: (spawn) => {
      createBoundRewardBox(this, spawn, makeNativeLaserView, spawn => new Key(spawn));
    },`, file);
  source = replace(source, 'this.nativeLaserBoxes = [];',
    'this.nativeLaserBoxes = [];\n    this.nativeBoundBoxes = [];', file);
  source = replace(source, 'this.updateBoundBallPitchers(clampedDt, input, playerInputs);',
    'tickNativeBoundBalls(this, makeNativeLaserView, moveRectWithTileCollisions);', file);
  source = replace(source, 'contactNativeLasers(this);',
    'contactNativeLasers(this);\n    contactNativeBoundBalls(this);', file);
  source = replace(source, "if (pitcher.spawn.actorName === 'LaserBallPitcher') return false;",
    "if (['LaserBallPitcher', 'BoundBallPitcher'].includes(pitcher.spawn.actorName)) return false;", file);
  return replace(source, `private updateDeadBallPitcherViews(): void {
    for (const pitcher of this.deadBallPitchers) {`, `private updateDeadBallPitcherViews(): void {
    for (const pitcher of this.deadBallPitchers) {
      if (['LaserBallPitcher', 'BoundBallPitcher'].includes(pitcher.spawn.actorName)) continue;`, file);
}
