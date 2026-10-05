import assert from 'node:assert/strict';
import { patchGoalUnlock } from './pico-goal-patches.mjs';

export const CAMPAIGN_PATCHES = [{
  id: 'warp-sensor-origin',
  files: ['src/engine/actors/Warp.ts', 'src/engine/actors/WarpAll.ts'],
  evidence: ['FUN_7ff72bb62ec0', 'FUN_7ff72bc12370', 'FUN_7ff72bc17170'],
  behavior: 'Local [0,0,width,height] sensor translated to the actor; downward-Y stage coordinates use a left/bottom anchor. Sensors have no visible artwork.',
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
}];

// Fail the build if upstream code changes: never silently skip a correction.
function replaceOnce(source, before, after, file) {
  assert.equal(source.split(before).length - 1, 1, `Patch anchor changed: ${file}: ${before}`);
  return source.replace(before, after);
}

export function patchCampaignSource(file, source) {
  if (file === 'src/engine/actors/Goal.ts') return patchGoalView(source, file);
  if (file === 'src/engine/sprites.ts') {
    return replaceOnce(source, 'door_black: [96, 576, 48, 48],',
      'door_black: [96, 576, 48, 48],\n  door_closed: [96, 512, 48, 48],', file);
  }
  if (file === 'src/engine/GameRuntime.ts') {
    source = patchGoalEntry(source.replaceAll('\r\n', '\n'), file);
    return patchGoalUnlock(source, replaceOnce, file);
  }
  if (!CAMPAIGN_PATCHES[0].files.includes(file)) return source;
  source = replaceOnce(source, 'x: spawn.x - triggerSize.width / 2,', 'x: spawn.x,', file);
  source = replaceOnce(source, 'y: spawn.y - triggerSize.height / 2,', 'y: spawn.y - triggerSize.height,', file);
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
      player.velocity.x = 0;
      player.velocity.y = 0;
      player.view.visible = false;`, file);
  source = replaceOnce(source, 'const goalSatisfiedPlayers = goalEligiblePlayers.filter((player) => (',
    'const goalSatisfiedPlayers = this.players.filter((player) => (', file);
  return replaceOnce(source, `const requiredGoalPlayerCount = this.hasMajorityController
      ? Math.floor(goalEligiblePlayers.length / 2) + 1
      : goalEligiblePlayers.length;`, 'const requiredGoalPlayerCount = this.players.length;', file);
}
