// 10-2 TWO PLAYERS (stage_jump04).
// The map (party 2, cats 32x46, walk/air speed 4.9 per tick, gravity 0.65 per tick^2):
// - Spawn floor y 432 (x 48..672). A 144-tall block (x 384..672, top 288) stands between the spawn and the rest.
//   On top: the Bridge "1" switch (x 464..496) with a CollisionChangePlayer sensor above it. Bridge 1 is a head-push
//   bridge: while the switch is held it grows a 64-wide step out of the block's WEST face (x 320..384, top 360, 72
//   above the floor) and shoves a cat standing there west.
// - Past the block: a pit x 672..864 (Warp at y 480+ returns a fallen cat to the block top, x 576). A ceiling slab
//   x 816..1104 hangs from the map top down to y 288, so over x 816+ only a cat whose feet are >= 334 fits.
// - East floor y 432 from x 864: Bridge 2 switch (x 944..976) grows Bridge 2 west from x 912 across the pit at floor
//   level; a JumpStand (x 1400..1432, solid 32x34 since batch 7, launches a resting cat); the Gate (x 1497.6, 151 tall)
//   opened from its far-side switch (x 1568..1600); two RouletteLifts (x 1968, 2208) under the Key (2072, y 68);
//   the door (2328..2376).
// - CollisionChangePlayer sensors above the three switches rotate the input slots by the party size through
//   controllerInputSlotPermutation; with party 2 the permutation has length 2, so the rotation is the identity
//   (playerInputSlots stays [1, 0]; the driver's step() already maps cats to slots).
// - The camera keeps both cats in one view: a cat walking ahead of its partner on the block stops ~262 units ahead.
// - A cat carrying another on its head cannot jump. A rider walking on a walking carrier moves at 9.8 per tick, but
//   drops to 4.9 the tick it leaves the head (no air momentum). A rider on a falling carrier is not grounded: its jump
//   only works in the ~4-tick coyote window after the carrier leaves the ground.
//
// Route:
// 1. Block (RELAY jump, works): cat 1 stands against the block's west face (x 366), cat 0 climbs onto its head; cat 0
//    presses+holds jump, cat 1 presses+holds jump 2 ticks later; cat 0 lands back on the rising cat 1 near its apex,
//    jumps again holding right and lands on the block top (feet ~287).
// 2. Cat 0 stands on the Bridge 1 switch (x ~480); the step grows and shoves cat 1 to x ~304; cat 1 hops onto the
//    step (feet 360) and then onto the block.
// 3. Pit (BLOCKED in the current runtime): nobody can reach the east floor. To land, a cat must be under the ceiling
//    (feet >= 334) at centre x 800 and have its right edge past x 864 (centre >= 848) before its feet pass y 432;
//    that needs a fall apex below ~y 298, i.e. lower than the block top, and nothing east of x 672 can support a cat.
//    Best measured: one cat, short jump at the edge: centre 834 at feet 432. Rider walking on its falling partner's
//    head (9.8 per tick until it walks off): centre ~844 at feet 432 -- 4 units short of the floor.
// 4. (Not reached) Cat on the Bridge 2 switch spans the pit for the partner, JumpStand / Gate switch, RouletteLifts to
//    the key, door.

export default {
  party: 2,
  budget: 3000,
  blocker: 'Pit x 672..864 under the ceiling slab x 816+ (bottom y 288): no cat reaches the east floor (best landing ' +
    'centre ~844 at feet 432, needs >= 848), and Bridge 2 that spans the pit is switched from the far side',
  async solve(stage, api) {
    const { cats, game } = api;
    const cx = api.centreX;
    const feet = api.feetY;

    // 1. Relay jump onto the block.
    api.walkTo(1, 366, { tol: 2 });
    api.climbOnto(0, 1, { from: 300 });
    api.wait(5);
    let relayAt = null;
    let wasAirborne = false;
    for (let f = 0; f < 90; f++) {
      const top = { jump: f < 16 };
      const carrier = { jump: f >= 2 && f < 18 };
      if (f > 3 && !cats[0].grounded) wasAirborne = true;
      if (wasAirborne && cats[0].grounded && relayAt == null) relayAt = f;
      if (relayAt != null) {
        top.jump = f > relayAt && f < relayAt + 17;
        top.right = true;
        if (cats[0].grounded && feet(cats[0]) <= 289) break;
      }
      api.step([top, carrier]);
    }
    api.land();
    if (feet(cats[0]) > 289) api.block(`relay jump failed: cat 0 feet ${feet(cats[0]).toFixed(1)}, block top 288`);

    // 2. Cat 0 holds the Bridge 1 switch; cat 1 climbs the step, then the block.
    api.walkTo(0, 480, { tol: 3 });
    const step = game.bridges.find((bridge) => bridge.spawn?.label === '1') || game.bridges[0];
    api.until(() => step.rect.x <= 321 && cats[1].grounded, [], 120, 'Bridge 1 step never grew');
    api.hold((f) => [{}, { jump: f < 16, right: f > 2 && feet(cats[1]) < 395 }], 40);
    api.land();
    api.hold((f) => [{}, { jump: f < 16, right: cx(cats[1]) < 420 }], 40);
    api.land();
    if (feet(cats[1]) > 289) api.block(`cat 1 did not reach the block top via the step (feet ${feet(cats[1]).toFixed(1)})`);

    // 3. Pit: best attempt. Cat 0 carries cat 1 east off the edge; cat 1 starts at the west end of cat 0's head and
    //    walks east on it (9.8 per tick while riding), then falls on toward the east floor.
    api.walkTo(0, 520, { tol: 3 });
    api.climbOnto(1, 0, {});
    api.until(() => cx(cats[1]) <= cx(cats[0]) - 26, [{}, { left: true }], 30, 'cat 1 could not shuffle back on the head');
    api.wait(2);
    let started = -1;
    let xAtFloorLevel = null;
    for (let f = 0; f < 160; f++) {
      if (started < 0 && cx(cats[0]) >= 664) started = f;
      const t = started < 0 ? -99 : f - started;
      api.step([{ right: true }, { right: t >= -14 }]);
      if (cats[1].grounded && cx(cats[1]) > 848 && feet(cats[1]) < 433) break;
      if (feet(cats[1]) >= 432) { xAtFloorLevel = cx(cats[1]); break; }
    }
    if (!(cats[1].grounded && cx(cats[1]) > 848)) {
      api.block(`pit: cat 1 (riding cat 0 off the block edge, walking on its head) reached feet y 432 at centre x ` +
        `${xAtFloorLevel?.toFixed(1)}; landing on the east floor (x 864) needs centre >= 848. Under the ceiling ` +
        `slab (x 816+, bottom 288) a cat needs feet >= 334, so its fall apex must be below ~y 298 -- lower than the ` +
        `block top (288) -- and a carried cat cannot jump from a falling carrier after the ~4-tick coyote window`);
    }

    // 4. (Not reached in the current runtime.)
    api.enterGoal();
  },
};
