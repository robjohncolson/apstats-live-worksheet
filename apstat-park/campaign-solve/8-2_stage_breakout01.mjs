// 8-2 RETRO GAME (stage_breakout01).
// The puzzle: Breakout: every cat steers a paddle (BreakoutPlayer); the balls break blocks to free the BreakoutKey.
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// BreakoutPlayer (audit: Misread -- one ball per row), BreakoutSyncArea (audit: Misread -- made-up clear) and BreakoutKey (audit: Misread+unimpl -- visible from frame 0, never carried); batch 21 breakout-key-and-balls.
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "BreakoutPlayer (audit: Misread -- one ball per row), BreakoutSyncArea (audit: Misread -- made-up clear) and BreakoutKey (audit: Misread+unimpl -- visible from frame 0, never carried); batch 21 breakout-key-and-balls.",
  async solve() {},
};
