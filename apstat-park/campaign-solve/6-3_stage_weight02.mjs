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
    // Off a topped-out slab: both cats move up to its east end (cat 1 overhanging the edge by ~13). Jumps start at the
    // slab's east edge: slab 3 tops out at 325.5 (37.5 below the ledge, 90 from it) and a 3 px/tick jump that rises
    // 37.5 and comes back down to the ledge covers only ~90. The slab sinks 0.5 per tick once a cat leaves, so cat 0
    // follows at once: it steps up to the edge 6 ticks after cat 1 took off and jumps the moment it gets there, ~15
    // ticks (45 px) behind cat 1, which walks on east to clear the landing spot.
    const hopOff = (lift, x) => {
      const east = lift.rect.x + lift.rect.width;
      const [c0, c1] = cats;
      api.walkTo([0, 1], [east - 37, east - 3], { tol: 2 });
      let f = 0, takeoff = -1, left0 = false, left1 = false;
      api.until(() => f > 2 && left0 && left1 && c0.grounded && c1.grounded, () => {
        if (!c0.grounded) left0 = true;
        if (!c1.grounded) left1 = true;
        const s = [{}, {}];
        s[1] = { jump: f < 14, ...(api.centreX(c1) < x + 100 ? { right: true } : {}) };
        if (f >= 6) {
          if (takeoff < 0 && api.centreX(c0) >= east - 4.5) takeoff = f;
          s[0] = takeoff < 0 ? { right: true } : { jump: f - takeoff < 14, ...(api.centreX(c0) < x + 30 ? { right: true } : {}) };
        }
        f++;
        return s;
      }, 240, 'both cats off the slab onto the block at ' + x);
      if (cats.some((cat) => api.feetY(cat) > 289)) api.block('a cat missed the block at ' + x);
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
