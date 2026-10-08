// 11-4 HAND GIMMICK (stage_magnet02).
// The puzzle: MagnetPlayers, a DelaySwitch (10 s countdown) that sends the Lift across, a SmallBox and a Gate.
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// MagnetPlayer (audit: Unimpl; batch 20 magnet-grab) and DelaySwitch (audit: Misread -- fires at once instead of a 10 s countdown; batch 17 switch-family-native).
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "MagnetPlayer (audit: Unimpl; batch 20 magnet-grab) and DelaySwitch (audit: Misread -- fires at once instead of a 10 s countdown; batch 17 switch-family-native).",
  async solve() {},
};
