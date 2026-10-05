import { fileURLToPath } from 'node:url';

export function patchNativeLasers(source, replace, file) {
  const helper = fileURLToPath(new URL('../apstat-park/native-laser-runtime.mjs', import.meta.url));
  source = `import { createLaserRewardBox, tickNativeLasers, contactNativeLasers } from ${JSON.stringify(helper)};\n` + source;
  source = replace(source, `LaserKeyBox: (spawn) => {
      const normalBox = new NormalBox(spawn);
      this.normalBoxes.push(normalBox);
      this.addActorView(spawn, normalBox.view);
    },`, `LaserKeyBox: (spawn) => {
      createLaserRewardBox(this, spawn, makeNativeLaserView, spawn => new Key(spawn));
    },`, file);
  source = replace(source, 'this.endlessLaserBallPitchersWithReceiverContact.clear();',
    'this.endlessLaserBallPitchersWithReceiverContact.clear();\n    this.nativeLaserBoxes = [];', file);
  source = replace(source, 'this.updateDeadBallPitcherViews();',
    `tickNativeLasers(this, makeNativeLaserView, (view, name) => { view.children[0].texture = frameTexture(name); });
    this.updateDeadBallPitcherViews();`, file);
  source = replace(source, 'this.updateGhosts(ghostPreKeyTarget);',
    'contactNativeLasers(this);\n    this.updateGhosts(ghostPreKeyTarget);', file);
  source = replace(source, 'const hitPitcher = this.deadBallPitchers.find((pitcher) => {',
    "const hitPitcher = this.deadBallPitchers.find((pitcher) => {\n      if (pitcher.spawn.actorName === 'LaserBallPitcher') return false;", file);
  return source + `
function makeNativeLaserView(name, width, height, centered = false) {
  const view = new Container();
  const sprite = new Sprite(frameTexture(name));
  sprite.anchor.set(0.5, centered ? 0.5 : 1);
  sprite.width = width; sprite.height = height;
  view.addChild(sprite);
  return view;
}
`;
}
