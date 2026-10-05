import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { patchGoalUnlock } from './pico-goal-patches.mjs';
import { patchNativeLasers } from './pico-laser-patches.mjs';
import { patchNativeBound } from './pico-bound-patches.mjs';
import { patchNativePlayer } from './pico-player-patches.mjs';
import { patchNativeThunderContact } from './pico-contact-patches.mjs';

export const CAMPAIGN_PATCHES = [{
  id: 'warp-sensor-origin',
  files: ['src/engine/actors/Warp.ts', 'src/engine/actors/WarpAll.ts'],
  evidence: ['FUN_7ff72bb62ec0', 'FUN_7ff72bc12370', 'FUN_7ff72bc17170', 'FUN_7ff72bb4e260', 'FUN_7ff72bc119c0'],
  behavior: 'Local [0,0,width,height] sensor translated directly to the actor, without Y inversion. Sensors have no visible artwork.',
}, {
  id: 'goal-entry-edge',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb531d0', 'FUN_7ff72bb68510', 'FUN_7ff72bb6ad30'],
  behavior: 'Each eligible player enters a standard Goal only on a fresh Up press; held Up and another player\'s input cannot admit them.',
}, {
  id: 'goal-key-delivery',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/Goal.ts', 'src/engine/sprites.ts'],
  evidence: ['FUN_7ff72bb531d0', 'FUN_7ff72bb53190', 'FUN_7ff72bb52ec0', 'FUN_7ff72bb53000', 'FUN_7ff72bb657c0', 'FUN_7ff72bb65430'],
  behavior: 'Goals start closed, open on key contact or targeted command 9, and consume delivered keys on the following PRE. Goal sensor defaults to [-24,-32,48,32]; art uses closed/open atlas frames at 64x64.',
}, {
  id: 'breakout-key-activation',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb64f20', 'FUN_7ff72bb65430', 'FUN_7ff72bc30790', 'FUN_7ff72bb778c0', 'FUN_7ff72bae82a0'],
  behavior: 'BreakoutKey uses the shared carried-key path and stays hidden while any BR1..BR5 chip remains. BreakoutSyncArea is not a clear trigger.',
}, {
  id: 'literal-rect-native-body',
  files: ['src/engine/GameRuntime.ts', 'src/engine/actors/StaticRect.ts'],
  evidence: ['FUN_7ff72bb72ae0:bb76872..bb76970', 'FUN_7ff72bb77c10', 'FUN_7ff72bb5b820'],
  behavior: 'Literal Rect uses a bottom-left anchor, full height, party-dependent size and position, and signed-width normalization. Other actor families retain their separate geometry.',
}, {
  id: 'laser-reward-path',
  files: ['src/engine/GameRuntime.ts', 'src/engine/sprites.ts'],
  evidence: ['FUN_7ff72bb37d70', 'FUN_7ff72bb38130', 'FUN_7ff72bb383e0', 'FUN_7ff72bb4e6f0', 'FUN_7ff72bb4ea70', 'FUN_7ff72bb544e0', 'FUN_7ff72bb54860', 'FUN_7ff72bb54940'],
  behavior: 'LaserBallPitcher owns one native-speed projectile. Player contacts reset the named reward box and launcher speed; three actor hits release a Key. Native box/ball atlas frames and removal countdowns replace placeholders. Global contact ordering remains under audit.',
}, {
  id: 'bound-ball-reward-path',
  files: ['src/engine/GameRuntime.ts', 'src/engine/sprites.ts'],
  evidence: ['FUN_7ff72bb36d10', 'FUN_7ff72bb36ee0', 'FUN_7ff72bb37250', 'FUN_7ff72bb37500', 'FUN_7ff72bb53e10', 'FUN_7ff72bb54330', 'FUN_7ff72bc16120'],
  behavior: 'BoundBallPitcher creates the gravity/mass-response ball; floor loss and capture use native removal timers. BallBox accepts command 11 through its narrow top sensor and publishes a Key. Preview collision separation remains an adapter, not a native solver reconstruction.',
}, {
  id: 'player-native-body-and-units',
  files: ['src/engine/actors/PlayerGeometry.ts', 'src/engine/actors/Player.ts', 'src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bb66e50', 'DAT_7ff72c62d1a8', 'FUN_7ff72bb687e0', 'FUN_7ff72bc16120', 'FUN_7ff72bb6f0e0', 'FUN_7ff72bb70860', 'FUN_7ff72bb708d0', 'FUN_7ff72bb679c0'],
  behavior: 'Player body [-16,-47,32,46], ordinary walk 3/frame, plane 4.5/frame, native directional priority. Sprite scale uses requested size while body growth uses the native .88 ratio; reset clears visual scale. Full controller/support graph remains under audit.',
}, {
  id: 'thunder-native-pair-response',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bc1e4a0', 'FUN_7ff72bc11be0', 'FUN_7ff72bc13830', 'FUN_7ff72bb4d330'],
  behavior: 'Stationary active type-3 Thunder support uses native trajectory rollback, float32 actor anchors and .01 separation with a previous-position clamp. Full world ordering and recursive bodies remain separate work.',
}, {
  id: 'bound-native-map-sweep',
  files: ['src/engine/GameRuntime.ts'],
  evidence: ['FUN_7ff72bc2fca0', 'FUN_7ff72bc304f0', 'FUN_7ff72bc12490', 'FUN_7ff72bc14040', 'DAT_7ff72bcc8a30'],
  behavior: 'BoundBall uses native tile-boundary traversal, .01 separation, half-unit probes, sliding and map-contact lifecycle. Player/box pair separation and global ordering remain separate adapters.',
}];

// Fail the build if upstream code changes: never silently skip a correction.
function replaceOnce(source, before, after, file) {
  assert.equal(source.split(before).length - 1, 1, `Patch anchor changed: ${file}: ${before}`);
  return source.replace(before, after);
}

export function patchCampaignSource(file, source) {
  source = patchNativePlayer(file, source, replaceOnce);
  if (file === 'src/engine/actors/StaticRect.ts') {
    source = replaceOnce(source, 'constructor(readonly spawn: ActorSpawnDef)',
      'constructor(readonly spawn: ActorSpawnDef, nativeBody?: Rect)', file);
    return replaceOnce(source, 'this.rect = getStaticRectRect(spawn);',
      'this.rect = nativeBody ?? getStaticRectRect(spawn);', file);
  }
  if (file === 'src/engine/actors/Goal.ts') return patchGoalView(source, file);
  if (file === 'src/engine/sprites.ts') {
    return replaceOnce(source, 'door_black: [96, 576, 48, 48],',
      `door_black: [96, 576, 48, 48],
  door_closed: [96, 512, 48, 48],
  native_laser_box_0: [288, 480, 23, 31],
  native_laser_box_1: [320, 480, 23, 31],
  native_laser_box_2: [352, 480, 23, 31],
  native_laser_ball: [256, 512, 12, 12],
  native_bound_ball: [272, 496, 12, 12],
  native_bound_box: [208, 640, 24, 32],`, file);
  }
  if (file === 'src/engine/GameRuntime.ts') {
    source = patchGoalEntry(source.replaceAll('\r\n', '\n'), file);
    const rectHelper = fileURLToPath(new URL('../apstat-park/native-rect.mjs', import.meta.url));
    source = `import { nativeRect } from ${JSON.stringify(rectHelper)};\n` + source;
    source = replaceOnce(source, 'Rect: (spawn) => {\n      const staticRect = new StaticRect(spawn);',
      'Rect: (spawn) => {\n      const staticRect = new StaticRect(spawn, nativeRect(spawn, this.activePlayerCount));', file);
    source = patchGoalUnlock(source, replaceOnce, file);
    source = patchNativeLasers(source, replaceOnce, file);
    source = patchNativeThunderContact(source, replaceOnce, file);
    return patchNativeBound(source, replaceOnce, file);
  }
  if (!CAMPAIGN_PATCHES[0].files.includes(file)) return source;
  source = replaceOnce(source, 'x: spawn.x - triggerSize.width / 2,', 'x: spawn.x,', file);
  source = replaceOnce(source, 'y: spawn.y - triggerSize.height / 2,', 'y: spawn.y,', file);
  return replaceOnce(source, 'this.view.addChild(g);', 'this.view.addChild(g);\n    this.view.visible = false;', file);
}

function patchGoalView(source, file) {
  source = replaceOnce(source, 'readonly rect: Rect;', `readonly rect: Rect;
  opened = false;
  private doorSprite?: Sprite;

  open(): void {
    this.opened = true;
    const texture = frameTexture('door_black');
    if (texture && this.doorSprite) this.doorSprite.texture = texture;
  }`, file);
  source = replaceOnce(source, 'this.rect = { x: x - 20, y: y - 30, width: 40, height: 60 };',
    'this.rect = { x: x - 24, y: y - 32, width: 48, height: 32 };', file);
  source = replaceOnce(source, "const texture = frameTexture('door_black');\n    if (texture)",
    "const texture = frameTexture('door_closed');\n    if (texture)", file);
  source = replaceOnce(source, 'sprite.scale.set(2);', 'sprite.width = 64; sprite.height = 64;', file);
  source = replaceOnce(source, "sprite.y = 30;", 'sprite.y = 0;', file);
  return replaceOnce(source, 'this.view.addChild(sprite);',
    'this.view.addChild(sprite);\n      this.doorSprite = sprite;', file);
}

function patchGoalEntry(source, file) {
  // Sample resolved input even during death/disabled frames so holding Up
  // through respawn does not synthesize a new press.
  const input = 'const playerInput = this.resolvePlayerInput(input, playerInputs, activePlayers.length, index, playerInputSlot);';
  source = replaceOnce(source, input, '', file);
  source = replaceOnce(source, 'const playerInputSlot = this.playerInputSlots[index] ?? index;',
    `const playerInputSlot = this.playerInputSlots[index] ?? index;
      ${input}
      const goalUpPressed = !!playerInput.up && !this.campaignGoalUpHeld.get(this.player);
      this.campaignGoalUpHeld.set(this.player, !!playerInput.up);
      if (this.goalClearedPlayers.has(this.player)) continue;`, file);
  source = replaceOnce(source, 'this.checkGoals();',
    'this.checkGoals(goalUpPressed && !!resolvedPlayerInput.up);', file);
  source = replaceOnce(source, 'private checkGoals(): void {',
    'private campaignGoalUpHeld = new WeakMap<Player, boolean>();\n\n  private checkGoals(goalUpPressed = false): void {', file);
  source = replaceOnce(source,
    'standardGoals.some((goal) => rectsOverlap(player.rect, goal.rect))',
    'player === this.player && goalUpPressed\n      && standardGoals.some((goal) => rectsOverlap(player.rect, goal.rect))', file);
  source = replaceOnce(source, 'for (const player of playersOnStandardGoal) {\n      this.goalClearedPlayers.add(player);',
    `for (const player of playersOnStandardGoal) {
      this.goalClearedPlayers.add(player);
      // Reuse the runtime's body-disable registry so entered players no longer
      // block teammates or load platforms. Team completion still counts them.
      this.collisionChangePlayersCollisionOff.add(player);
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.view.visible = false;`, file);
  source = replaceOnce(source, 'const goalSatisfiedPlayers = goalEligiblePlayers.filter((player) => (',
    'const goalSatisfiedPlayers = this.players.filter((player) => (', file);
  return replaceOnce(source, `const requiredGoalPlayerCount = this.hasMajorityController
      ? Math.floor(goalEligiblePlayers.length / 2) + 1
      : goalEligiblePlayers.length;`, 'const requiredGoalPlayerCount = this.players.length;', file);
}
