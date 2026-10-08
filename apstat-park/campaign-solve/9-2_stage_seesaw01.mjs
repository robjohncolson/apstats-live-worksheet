// 9-2 BALL PARK (stage_seesaw01).
// The puzzle: Seesaws and a Balance tip under the party; a PhysicsSwitch pressed by the balls reveals the key.
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// SeesawParent (audit: Misread -- p1/p2 become a 365x915 wall), Balance (audit: Unimpl), PhysicsSwitch (audit: Misread+unimpl) and PhysicsBallPitcher (audit: motion); batches 22 ball-pitchers / 23 seesaw-balance.
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "SeesawParent (audit: Misread -- p1/p2 become a 365x915 wall), Balance (audit: Unimpl), PhysicsSwitch (audit: Misread+unimpl) and PhysicsBallPitcher (audit: motion); batches 22 ball-pitchers / 23 seesaw-balance.",
  async solve() {},
};
