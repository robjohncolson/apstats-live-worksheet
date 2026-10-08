// 6-3 PUSH OR JUMP (stage_weight02).
// The puzzle: three pits, each with a wide WeightedLiftEx slab resting 115 below the ledges (Warps under the pits
// drop a fallen cat back at the pit's west side). Each slab needs the whole party (p1 100 -> 2) and then rises
// 0.5 per tick by its party travel (party 2: -150 / -115 / -125.5), high enough to step onto the next block. The
// Key hangs just past the second block's east edge, over the third pit.
// Route: both drop onto slab 1, ride up, hop onto block 1; drop onto slab 2, ride up, hop onto block 2; run off its
// east edge through the key onto slab 3, ride up, hop onto the last ledge and enter.
export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const { cats, game } = api;
    const lifts = [...game.weightedLifts].sort((a, b) => a.rect.x - b.rect.x);
    const onLift = (cat, lift) => cat.grounded && Math.abs(api.feetY(cat) - lift.rect.y) < 1.5 &&
      cat.rect.x + cat.rect.width > lift.rect.x && cat.rect.x < lift.rect.x + lift.rect.width;
    // Both cats onto a slab (cat 1 further east), then wait for it to top out.
    const ride = (lift, label) => {
      const xs = [lift.rect.x + 120, lift.rect.x + 170];   // the east half, near the next block
      api.walkTo([0, 1], xs, { tol: 3, stall: 150, label: 'onto ' + label });
      api.until(() => cats.every((cat) => onLift(cat, lift)), [], 120, 'both cats did not settle on ' + label);
      let last = lift.rect.y, still = 0;
      api.until(() => still > 20, () => { still = Math.abs(lift.rect.y - last) < 1e-6 ? still + 1 : 0; last = lift.rect.y; return []; },
        600, label + ' did not stop rising');
    };
    // Off a topped-out slab: cat 1 jumps to the block first; cat 0 steps to the slab's east end (it sinks only
    // 0.5 per tick once a cat leaves) and follows.
    const hopOff = (lift, x) => {
      api.jumpTo(1, x + 60);
      api.walkTo(0, lift.rect.x + lift.rect.width - 18, { tol: 3 });
      api.jumpTo(0, x + 10);
    };
    ride(lifts[0], 'slab 1');
    hopOff(lifts[0], 960);    // block 1 (960..1200, top 288)
    ride(lifts[1], 'slab 2');
    hopOff(lifts[1], 1488);   // block 2 (1488..1728, top 288)
    // Run off block 2's east edge through the key (1760..1792, bottom 244) and down onto slab 3.
    api.walkTo([0, 1], [1640, 1690]);
    api.jumpTo(1, 1880);
    if (api.carrierOfKey() < 0) api.block('the jump off block 2 missed the key');
    ride(lifts[2], 'slab 3');
    // Last ledge (2064.., top 288) and the door.
    hopOff(lifts[2], 2064);
    api.enterGoal();
  },
};
