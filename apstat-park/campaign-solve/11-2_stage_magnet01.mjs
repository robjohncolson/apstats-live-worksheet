// 11-2 HAND GIMMICK (stage_magnet01).
// The puzzle: MagnetPlayers pull the nearest cat in a 110x80 field to cross Thunder gaps.
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// MagnetPlayer (audit: Unimpl -- the magnet does nothing; batch 20 magnet-grab) and Thunder (audit: Misread; batch 6).
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "MagnetPlayer (audit: Unimpl -- the magnet does nothing; batch 20 magnet-grab) and Thunder (audit: Misread; batch 6).",
  async solve() {},
};
