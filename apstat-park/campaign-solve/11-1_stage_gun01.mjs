// 11-1 HAND GIMMICK (stage_gun01).
// The puzzle: WarpGunPlayers pick up and carry partners with the warp gun on a separate action button.
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// WarpGunPlayer (audit: Misread -- gun bound to jump, so gun cats cannot jump; native input bit 11; batch 20 warpgun-action-button).
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "WarpGunPlayer (audit: Misread -- gun bound to jump, so gun cats cannot jump; native input bit 11; batch 20 warpgun-action-button).",
  async solve() {},
};
