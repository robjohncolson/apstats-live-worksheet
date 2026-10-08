// 5-1 ALL FOR ONE (stage_majo01).
// The puzzle: One shared MajorityPlayer moves where the majority of the party holds a direction (>= ceil(0.7 n), hysteresis).
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// MajorityPlayer / MajorityController (audit: Unimpl -- no vote, port debug box and a made-up goal rule; batch 18 majority-vote).
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "MajorityPlayer / MajorityController (audit: Unimpl -- no vote, port debug box and a made-up goal rule; batch 18 majority-vote).",
  async solve() {},
};
