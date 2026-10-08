// 11-3 HAND GIMMICK (stage_gun02).
// The puzzle: As 11-1 with FallBoxes and a ForceColorBox.
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// WarpGunPlayer (audit: Misread; batch 20 warpgun-action-button), ForceColorBox (audit: Misread -- no recolour) and FallBox (armed boxes are non-solid at once, see 2-2).
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "WarpGunPlayer (audit: Misread; batch 20 warpgun-action-button), ForceColorBox (audit: Misread -- no recolour) and FallBox (armed boxes are non-solid at once, see 2-2).",
  async solve() {},
};
