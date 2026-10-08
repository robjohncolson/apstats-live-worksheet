// 4-1 GIMMICK GIMMICK (stage_thunder01).
// The puzzle: Thunder beams sweep the room; GuardPlayers raise shields that cut a beam so the party can pass behind them.
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// Thunder (audit: Misread -- not swept to the first solid, never cut by a body or guard shield, batch 6 thunder-beam) and GuardPlayer (audit: Misread -- no shield planks, batch 7 guard-shields): the beams the guards must block are always 2400 long and nothing cuts them.
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "Thunder (audit: Misread -- not swept to the first solid, never cut by a body or guard shield, batch 6 thunder-beam) and GuardPlayer (audit: Misread -- no shield planks, batch 7 guard-shields): the beams the guards must block are always 2400 long and nothing cuts them.",
  async solve() {},
};
