// 3-2 TIME LIMIT (stage_time_limit02).
// The puzzle (party 2): a DeadTimer starts at 3 s and every Switch adds 1 s the first time it is pressed; at zero
// the whole party dies. Switches: two on the floor, a row of six on top of the west block (y 144), six on the floor
// of the key corridor (y 288, x 1472..1640) and a row on the roof (y 96). The Key hangs in the corridor
// (x 816..1632, y 144..288), whose only way in is the pit under its west end; the door is at the bottom of the east
// shaft, reached along the low corridor under the big Rect (y 384..432).
// The pit (x 624..792, floor 432, ceiling y 240 over x 624..816) holds JumpStand 2 (solid 656..688, top 398,
// p0 -10, party 2 only) and, on its east side, the ledge = the top of the Rect 744..1680 (y 336..384; the low
// corridor runs under it). The corridor floor is the Rect 792..1680 (top 288) east of the ledge's 48-high wall.
// A plain jump rises ~78 (pit floor 432 -> feet 353: the ledge is 96 up, out of reach); the stand's bounce rises ~82
// (feet 398 -> ~316), so the stand is the step onto the ledge, and from the ledge a jump against the wall at 792
// rises until the head meets the y-240 ceiling with the feet at 287, one unit above the corridor floor, and held
// right carries the cat over the edge.
// Route: cat 1 taps the two floor switches (+2 s). Cat 0 leaves its pocket, drops to the west floor, rides
// JumpStand 1 up the west shaft, walks the six block-top switches (+6 s), jumps down onto the small Rect, hops up the
// Rect steps onto the roof, walks its switches and drops down the east shaft to the door. Cat 1 hops onto JumpStand 2,
// steers east during the bounce onto the ledge, walks to the wall and jumps into the corridor, takes the key, walks
// the six corridor switches, comes back west, steps off the ledge's west end straight down (clear of the stand) and
// walks the low corridor to the door; cat 0 waits past the door, cat 1 opens it and both enter.
// (The DeadTimer never drops below ~2.3 s on this route.)
export default {
  party: 2,
  budget: 3000,
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
    // Cat 1: hop onto JumpStand 2 (656..688, top 398) and ride the bounce (feet ~316), steering east onto the
    // ledge (top of the Rect 744..1680 at y 336).
    api.walkTo(1, 636, { tol: 2 });
    api.until(() => cats[1].grounded && Math.abs(api.feetY(cats[1]) - 398) < 1, guard((i) => {
      const cx = api.centreX(cats[1]);
      const steer = Math.abs(cx - 672) > 2 && api.feetY(cats[1]) < 397 ? (cx < 672 ? { right: true } : { left: true }) : {};
      return [{}, { jump: i < 10, ...steer }];
    }), 80, 'cat 1 could not hop onto JumpStand 2');
    let apex = 999;
    api.until(() => cats[1].grounded && api.feetY(cats[1]) < 390, guard(() => {
      apex = Math.min(apex, api.feetY(cats[1]));
      return [{}, { right: api.feetY(cats[1]) < 335 }];
    }), 120, () => `JumpStand 2 did not put cat 1 on the ledge (apex feet ${apex.toFixed(1)})`);
    if (Math.abs(api.feetY(cats[1]) - 336) > 1) api.block(`cat 1 landed at feet ${api.feetY(cats[1]).toFixed(1)}, not on the 336 ledge`);
    // Against the ledge's wall (792), jump: the head stops at the y-240 ceiling with the feet at 287, one unit above
    // the corridor floor, and the held right carries the cat over the edge.
    api.until(() => cats[1].grounded && api.feetY(cats[1]) < 289 && api.centreX(cats[1]) > 790, guard((i) => [{}, { jump: i > 8 && i < 30, right: true }]),
      80, () => `cat 1 could not climb from the ledge into the key corridor (feet ${api.feetY(cats[1]).toFixed(1)})`);
    // Key (1376..1408, 164..220): jump under it; then the six corridor switches.
    api.walkTo(1, 1392);
    api.jump(1, { frames: 36 });
    if (api.carrierOfKey() !== 1) api.block('cat 1 jumped under the key without taking it');
    api.walkTo(1, 1612, { tol: 4 });
    timeUp();
    // Back west, off the corridor floor onto the ledge, then off the ledge's west end straight down to the pit
    // floor (clear of the stand at 656..688), and east along the low corridor to the door.
    api.walkTo(1, 770, { stall: 200 });
    api.land(1);
    api.until(() => !cats[1].grounded, guard([{}, { left: true }]), 60, 'cat 1 did not step off the ledge');
    api.land(1);
    timeUp();
    // Cat 0 waits at the shaft's east wall, past the door, so the key carrier can reach it.
    api.walkTo(0, 1806, { tol: 3, max: 120 });
    api.enterOne(1, { max: 900 });
    api.enterGoal({ max: 900 });
  },
};
