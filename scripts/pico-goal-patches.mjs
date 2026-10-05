import { fileURLToPath } from 'node:url';

export function patchGoalUnlock(source, replace, file) {
  const helper = fileURLToPath(new URL('../apstat-park/native-goals.mjs', import.meta.url));
  const breakout = fileURLToPath(new URL('../apstat-park/native-breakout-key.mjs', import.meta.url));
  source = `import { contactNativeGoalKeys, consumeNativeGoalKeys, broadcastNativeGoalOpen } from ${JSON.stringify(helper)};\n` + source;
  source = `import { activateNativeBreakoutKeys } from ${JSON.stringify(breakout)};\n` + source;
  source = replace(source, `const breakoutKey = new BreakoutKey(spawn);
      this.breakoutKeys.push(breakoutKey);`, `const breakoutKey = new Key(spawn);
      breakoutKey.active = false;
      breakoutKey.view.visible = false;
      this.keys.push(breakoutKey);`, file);
  source = replace(source, 'const goal = new Goal(spawn.x, spawn.y);',
    `const goal = Object.assign(new Goal(spawn.x, spawn.y), { spawn, opened: false });
      const extraHeight = typeof spawn.raw[6] === 'number' ? spawn.raw[6] : 0;
      goal.rect.y -= extraHeight;
      goal.rect.height += extraHeight;`, file);
  source = replace(source, 'this.advanceCarriedKeys();',
    'consumeNativeGoalKeys(this);\n    activateNativeBreakoutKeys(this);\n    this.advanceCarriedKeys();', file);
  source = replace(source, 'private checkGoals(goalUpPressed = false): void {',
    'private checkGoals(goalUpPressed = false): void {\n    contactNativeGoalKeys(this);', file);
  source = replace(source, ': this.goals\n      : [];',
    ': this.goals.filter(goal => goal.opened)\n      : [];', file);
  source = replace(source, 'private openKeyBroadcastTargets(key: Key): boolean {\n    let opened = false;',
    'private openKeyBroadcastTargets(key: Key): boolean {\n    let opened = broadcastNativeGoalOpen(this, getKeyTargetActorName(key.spawn));', file);
  // FUN_bb778c0 / FUN_bae82a0 provide replication helpers, not a goal sensor.
  source = replace(source, 'this.checkBreakoutSyncAreas();', '// BreakoutSyncArea has no native gameplay-clear contact.', file);
  source = replace(source, 'this.addActorView(spawn, breakoutSyncArea.view);',
    'this.addActorView(spawn, breakoutSyncArea.view);\n      breakoutSyncArea.view.visible = false;', file);
  return source;
}
