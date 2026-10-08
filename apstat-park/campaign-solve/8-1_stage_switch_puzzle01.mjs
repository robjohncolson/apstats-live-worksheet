// 8-1 RETRO GAME (stage_switch_puzzle01).
// The puzzle: A sliding-switch puzzle sub-stage (Puzzle / PuzzleMain) the party solves together; PuzzlePredictProxy marks the win cells.
// SKIPPED-UNIMPLEMENTED: the stage's core mechanic is not in the runtime yet (state/pico-campaign-fidelity-audit-2026-10-07.md):
// Puzzle (audit: Unimpl -- sub-stage not simulated; batch 27 puzzle-substage, research first) and PuzzlePredictProxy (audit: Misread -- port solid 32x32 proxies as a win sensor).
// Write the route here once that batch lands, and record the stage as SOLVED in manifest.json.
export default {
  party: 2,
  skip: "Puzzle (audit: Unimpl -- sub-stage not simulated; batch 27 puzzle-substage, research first) and PuzzlePredictProxy (audit: Misread -- port solid 32x32 proxies as a win sensor).",
  async solve() {},
};
