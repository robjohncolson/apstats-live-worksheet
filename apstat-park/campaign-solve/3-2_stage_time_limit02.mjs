// 3-2 TIME LIMIT (stage_time_limit02).
// The puzzle (party 2): a DeadTimer starts at 3 s and every Switch adds 1 s the first time it is pressed; at zero
// the whole party dies. Switches: two on the floor, a row of six on top of the west block (y 144), six on the floor
// of the key corridor (y 288, x 1472..1640) and a row on the roof (y 96). The Key hangs in the corridor
// (x 816..1632, y 144..288), whose only way in is the pit under its west end; the door is at the bottom of the east
// shaft, reached along the low corridor under the big Rect (y 384..432).
// Runtime finding (2026-10-08): JumpStand 2 (p0 -10, present only at party 2) bounces a cat to feet ~328, 40 short of
// the corridor floor (288), and nothing else reaches the 48-tall band the corridor opens on; cat 0's half of the
// route (block switches, roof switches, down the shaft to the door) works.
// Route: cat 1 taps the two floor switches (+2 s). Cat 0 leaves its pocket, drops to the west floor, rides
// JumpStand 1 up the west shaft, walks the six block-top switches (+6 s), jumps down onto the small Rect, hops up the
// Rect steps onto the roof, walks its switches and drops down the east shaft to the door. Cat 1 should ride
// JumpStand 2 up the pit onto the corridor floor, take the key, walk the six corridor switches and come back down;
// then both enter.
export default {
  party: 2,
  budget: 3000,
  blocker: 'JumpStand (audit: partial; batch 25 jumpstand-launch-boxes): the p0 -10 launch (one -600/s impulse, no held-jump ramp) peaks at feet ~327, 105 above the pit floor; the key corridor floor is 144 above it',
  async solve(stage, api) {
    const { cats, game } = api;
    const timer = game.deadTimers[0];
    const timeUp = () => timer.expired && api.block(`the DeadTimer ran out (${timer.durationSeconds} s + switch time)`);
    const guard = (fn) => (i) => { timeUp(); return typeof fn === 'function' ? fn(i) : fn; };
    // Cat 1: the two floor switches (464..496, 608..640).
    api.walkTo(1, 480, { tol: 4 });
    api.walkTo(1, 626, { tol: 4 });
    // Cat 0: out of the pocket to the right, down to the west floor, left to JumpStand 1 (x 56..88).
    api.walkTo(0, 330, { stall: 200 });
    api.land(0);
    // A JumpStand launches a cat that lands on it from above: hop onto it.
    api.walkTo(0, 140, { tol: 4 });
    api.until(() => api.feetY(cats[0]) < 330, guard((i) => [{ jump: i < 12, ...(api.centreX(cats[0]) > 74 ? { left: true } : {}) }, {}]),
      120, 'JumpStand 1 did not launch cat 0');
    // Launched up the west shaft (x 48..96): steer right once above the block top (144) and walk the switches.
    api.until(() => cats[0].grounded && api.feetY(cats[0]) <= 145, guard(() => [api.feetY(cats[0]) < 140 ? { right: true } : {}, {}]),
      200, 'JumpStand 1 did not lift cat 0 onto the west block');
    api.walkTo(0, 330, { tol: 4 });
    timeUp();
    // Running jump off the block's east end (384) down onto the small Rect (576..624, top 240), then up the steps:
    // the block 624..720 (top 192), the Rect 724..776 (top 148) and onto the roof (top 96).
    api.walkTo(0, 360, { tol: 3 });
    api.jumpTo(0, 600, { holdJump: 16 });   // may land short, on the 288 ledge: the next hops still climb
    for (let hop = 0; hop < 3 && !(api.feetY(cats[0]) < 193 && api.centreX(cats[0]) > 640); hop++) {
      api.jumpTo(0, api.feetY(cats[0]) > 241 ? 600 : 660);
      timeUp();
    }
    api.land(0);
    // Up onto the Rect 724..776 (top 148): rise beside it, move right once above its top.
    api.until(() => cats[0].grounded && api.feetY(cats[0]) < 149, guard((i) => [{ jump: i < 16, ...(api.feetY(cats[0]) < 146 ? { right: true } : {}) }, {}]),
      80, 'cat 0 could not climb onto the Rect at 724');
    api.land(0);
    // Straight up beside the roof's west end (768), then right onto it once above its top (the map ceiling at 48
    // caps the jump at feet 94.5: a 1.5-unit window).
    api.until(() => cats[0].grounded && api.feetY(cats[0]) < 97, guard((i) => [{ jump: i < 16, ...(api.feetY(cats[0]) < 95.9 ? { right: true } : {}) }, {}]),
      80, 'cat 0 could not climb from the Rect onto the roof');
    if (api.feetY(cats[0]) > 97) api.block('cat 0 did not reach the roof: ' + JSON.stringify(api.snapshot()[0]));
    // Along the roof over its switches (1464..1656) and down the east shaft to the floor by the door.
    api.walkTo(0, 1660, { tol: 4 });
    timeUp();
    api.walkTo(0, 1720, { stall: 200 });
    api.land(0);
    timeUp();
    // Cat 1: JumpStand 2 (656..688, filter -2: it exists only for a party of 2, so it is the way into the key
    // corridor). Hop onto it from x 704 (east of there the low corridor's ceiling, y 384, stops a jump) and ride the
    // bounce; steer east once the feet are above the corridor floor (288).
    api.walkTo(1, 720, { tol: 3 });
    api.until(() => api.feetY(cats[1]) < 380, guard((i) => [{}, { jump: i < 12, ...(api.centreX(cats[1]) > 674 ? { left: true } : {}) }]),
      120, 'JumpStand 2 did not launch cat 1');
    let apex = 999;
    api.until(() => cats[1].grounded && api.feetY(cats[1]) <= 289 && api.centreX(cats[1]) > 800, guard((i) => {
      apex = Math.min(apex, api.feetY(cats[1]));
      if (i > 150) {
        api.block(`JumpStand 2 bounces cat 1 to feet ${apex.toFixed(1)} at best (a rise of ${(398 - apex).toFixed(0)} from the stand top 398); ` +
          'the corridor floor is 288 (the pit floor 432), so the key corridor stays out of reach');
      }
      return [{}, api.feetY(cats[1]) < 287 ? { right: true } : {}];
    }), 200, 'cat 1 never reached the corridor');
    // Key (1376..1408, 164..220): jump under it; then the six corridor switches.
    api.walkTo(1, 1392);
    api.jump(1, { frames: 36 });
    if (api.carrierOfKey() !== 1) api.block('cat 1 jumped under the key without taking it');
    api.walkTo(1, 1630, { tol: 4 });
    timeUp();
    // Back down the pit and along the low corridor to the door.
    api.walkTo(1, 700, { stall: 200 });
    api.land(1);
    timeUp();
    api.enterGoal({ max: 900 });
  },
};
