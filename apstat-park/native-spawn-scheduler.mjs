// bc29bf0's first two Lua columns feed triggerX(float32) and partyRule(int32).
// bc2a1a0 consumes rows in source order. created and cursor are distinct:
// a rejected party condition advances cursor without marking that row created.
export function createNativeSpawnScheduler({ spawns, playerCount, onSpawn = null }) {
  const state = { cursor: 0, playerCount: playerCount >>> 0,
    entries: spawns.map((spawn, index) => {
      const rule = spawn.raw[1];
      // bbd9280 uses cvttsd2si; out-of-range values produce INT_MIN.
      const partyRule = Number.isFinite(rule) && rule >= -2147483648 && rule < 2147483648 ?
        Math.trunc(rule) : -2147483648;
      return { spawn, index, triggerX: Math.fround(spawn.raw[0]), partyRule,
        created: false, payload: null };
    }) };
  return { state,
    update(position) {
      position = Math.fround(position);
      const end = state.entries.length;
      for (let index = state.cursor; index < end; index++) {
        const entry = state.entries[index];
        if (!entry.created) {
          if (!(position >= entry.triggerX)) return; // COMISS/JB also stops on NaN
          const rule = entry.partyRule, count = state.playerCount >>> 0;
          let allowed = rule === 0;
          if (rule < 0) allowed = (count | 0) <= ((-rule) | 0);
          else if (rule > 0 && rule < 10) allowed = rule <= (count | 0);
          else if (rule >= 10) {
            const minimum = Math.trunc(rule / 10);
            allowed = count >= minimum && (minimum >= 10 || count <= rule % 10);
          }
          if (allowed) {
            entry.created = true;
            onSpawn?.(entry.spawn, entry);
          }
        }
        state.cursor++;
      }
    },
    // bc2a2b0: checkpoint seek skips STRICTLY earlier triggers. It neither
    // rewinds cursor nor changes created bits nor invokes actor construction.
    skipBefore(position) {
      position = Math.fround(position);
      while (state.cursor < state.entries.length && position > state.entries[state.cursor].triggerX) {
        state.cursor++;
      }
    },
    // bc2a320: indexed/network creation bypasses position and party gates,
    // preserves cursor, and exposes the packet pointer only during callback.
    spawnIndex(index, payload = null) {
      const entry = state.entries[index >>> 0];
      if (!entry || entry.created) return;
      entry.created = true;
      entry.payload = payload;
      try { onSpawn?.(entry.spawn, entry); }
      finally { entry.payload = null; }
    },
  };
}
