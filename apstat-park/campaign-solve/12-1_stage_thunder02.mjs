// 12-1 LAST PARK (stage_thunder02).
// The puzzle: A GuardPlayer shields the party from Thunder beams while a JumpSwitch launches PushBox 1.
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// Thunder (audit: Misread, batch 6 thunder-beam), GuardPlayer (audit: Misread, batch 7 guard-shields) and JumpSwitch (audit: Misread+unimpl -- fires on touch, re-arms, never launches PushBox1 vy -9; batch 17 switch-family-native).
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "Thunder (audit: Misread, batch 6 thunder-beam), GuardPlayer (audit: Misread, batch 7 guard-shields) and JumpSwitch (audit: Misread+unimpl -- fires on touch, re-arms, never launches PushBox1 vy -9; batch 17 switch-family-native).",
  async solve() {},
};
