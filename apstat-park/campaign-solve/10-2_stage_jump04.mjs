// 10-2 TWO PLAYERS (stage_jump04).
// The puzzle (party 2): a 144-tall block (x 384..672, top 288) stands between the spawn and everything else. On
// top: the Bridge "1" switch (480) -- Bridge 1 (head-push) grows out of the block's west face at y 360 as a step.
// Past the block: a pit (672..864, Warp back to the block top) bridged by Bridge 2 from its far-side switch (960),
// a Gate (1497.6) opened from its far-side switch (1584) with a JumpStand before it, two RouletteLifts under the
// high Key (2072, y 68), and the door (2352).
// Intended route: both cats climb the block, one holds switch 1 ... (the rest follows the switches west to east).
// Runtime finding (2026-10-08): the block cannot be climbed by two cats. A cat jumping from its partner's head peaks
// with its feet at y 307 (stack reach 46 + 78.6 = 124.6 above the floor), 19 units short of the block top (288); the
// partner jumping underneath adds nothing (head-stack hand-off), and the Bridge 1 step only appears once someone is
// already on top. This solver performs the stack jump at the block's west face and reports the shortfall.

export default {
  party: 2,
  budget: 3000,
  blocker: 'Player jump height / Bridge "1" (audit: Bridge geometry ok, state/motion fixed in batch 3): a two-cat stack cannot reach the first block top',
  async solve(stage, api) {
    const { cats } = api;
    // Cat 1 (east) stands against the block's west face (x 384); cat 0 climbs onto its head and jumps east.
    api.walkTo(1, 366, { tol: 2 });
    api.climbOnto(0, 1, { from: 300 });
    let peak = Infinity;
    api.hold((f) => { peak = Math.min(peak, api.feetY(cats[0])); return [{ jump: f < 20, right: true }, {}]; }, 50);
    api.land();
    if (api.feetY(cats[0]) > 289) {
      api.block(`cat 0 jumping from the head of cat 1 at the block's west face peaked with its feet at y ${peak.toFixed(1)}; ` +
        `the block top is y 288 (the stack reaches ${(432 - peak).toFixed(1)} of the 144 needed)`);
    }
    // (Not reached in the current runtime.) Then: switch 1 for the partner's step, the Bridge 2 / Gate switches, the
    // RouletteLifts to the key and the door.
    api.enterGoal();
  },
};
