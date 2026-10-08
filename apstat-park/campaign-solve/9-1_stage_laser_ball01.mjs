// 9-1 BALL PARK (stage_laser_ball01).
// The puzzle: LaserBallPitchers fire balls left; LaserKeyBoxes break after three hits to release the key.
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// LaserBallPitcher (audit: Misread -- fires up not left, speed as seconds, no cannon; batch 22 ball-pitchers) and LaserKeyBox (audit: Misread+unimpl -- waits for an absent Key instead of breaking after 3 hits).
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "LaserBallPitcher (audit: Misread -- fires up not left, speed as seconds, no cannon; batch 22 ball-pitchers) and LaserKeyBox (audit: Misread+unimpl -- waits for an absent Key instead of breaking after 3 hits).",
  async solve() {},
};
