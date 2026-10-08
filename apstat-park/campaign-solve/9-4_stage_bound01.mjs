// 9-4 BALL PARK (stage_bound01).
// The puzzle: A BoundBallPitcher launches a bouncing ball the party keeps in play into the BallBox.
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// BoundBallPitcher (audit: Misread -- jump-controlled instead of a launched bouncing ball; batch 22 ball-pitchers) and BallBox (audit: Misread -- 44x60 vs 48x48).
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "BoundBallPitcher (audit: Misread -- jump-controlled instead of a launched bouncing ball; batch 22 ball-pitchers) and BallBox (audit: Misread -- 44x60 vs 48x48).",
  async solve() {},
};
