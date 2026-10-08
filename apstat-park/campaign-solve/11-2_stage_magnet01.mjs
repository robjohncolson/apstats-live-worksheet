// 11-2 HAND GIMMICK (stage_magnet01).
// The puzzle: MagnetPlayers hold the action button to pull the nearest other cat into a hold point 30 px in front of
// them and carry it (a held cat floats, can't move; the holder can't turn, so it walks BACKWARDS to drag the target).
// Spec: scratchpad\b13\spec-magnet.md (rule: magnet-player in scripts/pico-campaign-patches.mjs).
//
// Map (48 px chips): cats start on the floor (feet y 336) either side of the first pit x 96..240 (Thunder at the
// bottom). The floor steps up 96 to y 240 at x 624. The corridor x 1104..1536 has 48 px headroom (ceiling y 192, no
// jumping) and a 48-wide shaft x 1296..1344 with Thunder at y 456. Key (1632,144) hangs 96 above the y-240 floor;
// Goal (1632,242).
//
// Route (party 2, cat A = 0 starts left of the pit, cat B = 1 right of it):
//   1. Pit: B walks left to the pit edge (facing left) and holds; A floats over the pit to B's hold point; B walks
//      right backwards until A is over the floor; release.
//   2. Step: B (now in front) stands at the step; A climbs B's head and jumps onto the ledge; A faces left at the
//      ledge edge and holds while B jumps into the field: B is lifted to ledge level, A drags it onto the ledge.
//   3. Shaft: B (behind) holds A (front) facing right and carries it over the shaft; release onto the far floor.
//      A turns to face left and holds B, then walks right backwards to drag B over; release.
//   4. Key: jump into the key, then both cats enter the Goal.
const A = 0;
const B = 1;
const HOLD = { action: true };

export default {
  party: 2,
  budget: 6000,
  async solve(stage, api) {
    const { cats, walkTo, until, hold, land, climbOnto, jumpTo, enterGoal, game } = api;
    const held = (cat) => game.magnetHeldPlayers.has(cats[cat]);
    const lockedBy = (owner) => game.magnetAuxiliaries.get(cats[owner])?.locked === true;

    // A cat taps a direction for one frame to face that way (dead stop on release: moves 3 px).
    const face = (cat, dir) => hold(() => { const s = []; s[cat] = dir > 0 ? { right: true } : { left: true }; return s; }, 1);
    // `owner` holds the action button until it has locked onto `target`.
    const grab = (owner, target, label) => until(() => held(target) && lockedBy(owner),
      () => { const s = []; s[owner] = HOLD; return s; }, 240, label);

    // 1. The first pit.
    walkTo(B, 256, { tol: 1 });
    walkTo(A, 100, { tol: 1 });
    grab(B, A, 'B could not grab A over the first pit');
    walkTo(B, 306, { tol: 1, extra: { [B]: HOLD } });
    hold([], 1);   // release: A drops straight onto the floor
    land();

    // 2. The 96 px step at x 624 (a jump rises ~78). A climbs B's head and jumps up; then A lifts B.
    walkTo(B, 606, { tol: 1 });
    climbOnto(A, B);
    jumpTo(A, 660);
    walkTo(A, 640, { tol: 1 });   // A now faces left at the ledge edge
    until(() => held(B), (f) => { const s = []; s[B] = { jump: f < 14 }; s[A] = HOLD; return s; }, 60,
      'A could not catch B jumping at the step');
    grab(A, B, 'A could not lock B at ledge level');
    walkTo(A, 690, { tol: 1, extra: { [A]: HOLD } });
    hold([], 1);
    land();

    // 3. The shaft x 1296..1344 in the 48 px corridor. B (behind) carries A (front) over it.
    walkTo(A, 1260, { tol: 1 });
    walkTo(B, 1200, { tol: 1 });
    grab(B, A, 'B could not grab A before the shaft');
    walkTo(B, 1296, { tol: 1, extra: { [B]: HOLD } });   // A floats to ~1342, over the far floor
    hold([], 1);
    land();
    walkTo(A, 1380, { tol: 1 });
    face(A, -1);
    grab(A, B, 'A could not grab B across the shaft');
    walkTo(A, 1402, { tol: 1, extra: { [A]: HOLD } });   // B floats to ~1356, over the far floor
    hold([], 1);
    land();

    // 4. The key (1632,144) hangs 96 above the floor: a jump from under it (clear of the corridor ceiling, which ends
    //    at x 1536) touches it. Then the door.
    walkTo(A, 1632, { tol: 1 });
    jumpTo(A, 1632);
    until(() => api.carrierOfKey() >= 0, [], 60, 'the jump did not take the key');
    enterGoal();
  },
};
