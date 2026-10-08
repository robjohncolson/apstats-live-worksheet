// 5-2 ALL FOR ONE (stage_multijump01).
// The puzzle: One shared MultiPlayer; each player owns a share of the jumps (2 / 10 per airtime) and control passes along the party.
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// MultiPlayer (audit: Unimpl -- one ground jump instead of the 2/10-jump relay; batch 19 multi-jump-relay) and JumpArea (audit: Misread -- centred instead of top-left, pits uncovered; batch 13 jumparea-top-left).
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "MultiPlayer (audit: Unimpl -- one ground jump instead of the 2/10-jump relay; batch 19 multi-jump-relay) and JumpArea (audit: Misread -- centred instead of top-left, pits uncovered; batch 13 jumparea-top-left).",
  async solve() {},
};
