// 1-1 HELLO PICO PARK (stage_jump01).
// The puzzle: a floor with two pits (each has a Warp below it that returns fallen cats), two Rect steps before the
// second pit, a Bridge whose Switch is on the far side of that pit, a WeightedLift that needs the whole party, a Key
// floating left of the lift, and the Goal on the high wall right of the lift.
// Route: hop the first pit; climb the steps and long-jump the second pit onto the pre-extended bridge stub; stand on
// the Bridge switch (the bridge extends for the partner); both cats ride the lift up; cat 0 jumps left into the key
// and drops; both ride the lift again and jump right onto the high wall; walk to the door and enter.
export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const { cats, game } = api;
    const both = [0, 1];
    // First pit (x 864..912): run and jump over it together.
    api.walkTo(both, [760, 800]);
    api.jump(both, { dir: 1, frames: 40 });
    api.land();
    // Steps: the Rect {1296, 384} then {1344, 336}; jump onto each.
    api.walkTo(both, [1210, 1250]);
    api.jump(both, { dir: 1, frames: 30 });
    api.land();
    api.jump(both, { dir: 1, frames: 30 });
    api.land();
    // The bridge stub folds back (1 unit per tick) while its switch is up, so the 240-wide pit (1536..1776) must be
    // jumped: cat 1 stands at the top step's edge, cat 0 climbs onto its head, edges right on it and jumps from there.
    api.walkTo(1, 1518, { tol: 2 });
    api.walkTo(0, api.centreX(cats[1]) - 50);
    api.jumpTo(0, api.centreX(cats[1]));
    const bottomX = cats[1].rect.x;
    api.until(() => cats[0].rect.x >= bottomX + 26, [{ right: true }], 20, 'cat 0 could not edge right on the head');
    api.jump(0, { dir: 1, frames: 50 });
    api.land(0);
    // Cat 0 holds the bridge switch (1920) while the bridge extends for cat 1.
    api.walkTo(0, 1920, { tol: 4 });
    const bridge = game.bridges[0];
    api.until(() => bridge.rect.x <= 1500, [], 260, 'bridge never fully extended');
    api.walkTo(1, 1870);
    // Lift (2444..2628, top 29 above the floor): both cats hop onto it (cat 0 leads now).
    api.walkTo(both, [2400, 2350]);
    api.jumpTo(both, [2580, 2500]);
    const lift = game.weightedLifts[0];
    const restY = lift.rect.y;
    api.until(() => lift.rect.y <= restY - 150, [], 400, 'lift did not rise with both cats');
    // Cat 1 (left on the slab) jumps left into the key (2336..2368, y 164..220).
    api.walkTo(1, 2462);
    api.jump(1, { dir: -1, frames: 40 });
    api.until(() => api.carrierOfKey() >= 0, [{}, { left: true }], 60, 'cat 1 missed the key');
    api.land(1);
    api.until(() => lift.rect.y >= restY - 0.5, [], 400, 'lift never came back down');
    // Back on the lift together, up, then jump right onto the wall top (x >= 2640, y 192).
    api.walkTo(1, 2400);
    api.jumpTo(1, 2500);
    api.until(() => lift.rect.y <= restY - 180, [], 400, 'lift did not rise the second time');
    api.jump(both, { dir: 1, frames: 40 });
    api.land();
    api.enterGoal();
  },
};
