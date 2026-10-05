// Key variant 1: FUN_bb64f20 starts hidden; FUN_bb65430 queries
// FUN_bc30790 for chip codes 0x1e..0x22 (BR1..BR5) on every Key PRE.
export function activateNativeBreakoutKeys(runtime) {
  const hidden = runtime.keys.filter(key => key.spawn.actorName === 'BreakoutKey' && !key.active && !key.collected);
  if (!hidden.length || !runtime.tileMap) return;
  if (runtime.tileMap.map.table.some(chip => /^MC_BR[1-5]$/.test(chip))) return;
  for (const key of hidden) key.activate();
}
