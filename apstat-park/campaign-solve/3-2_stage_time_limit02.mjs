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
// Clock (native 3 px/tick): done one cat after the other the route needs ~29 s and the DeadTimer runs out on cat 1's
// walk back from the corridor (~1700 px = 9.5 s after its last switch). So both cats run AT ONCE (one generator per
// cat, interleaved frame by frame); cat 1's floor + corridor switches and cat 0's block + roof switches keep the clock
// topped up (each press rounds the remaining time UP to a whole second after adding 1).
export default {
  party: 2,
  budget: 3000,
  async solve(stage, api) {
    const { cats, game } = api;
    const timer = game.deadTimers[0];
    const cx = api.centreX, feet = api.feetY;
    const timeUp = () => timer.expired && api.block(`the DeadTimer ran out at frame ${api.frame}`);
    // --- per-cat generators: each yields its own buttons for one frame -------------------------------------------
    const dir = (i, x, tol) => (Math.abs(x - cx(cats[i])) <= tol ? {} : x > cx(cats[i]) ? { right: true } : { left: true });
    function* until(pred, specFn, max, label) {
      for (let f = 0; !pred(); f++) {
        if (f >= max) api.block(typeof label === 'function' ? label() : label);
        yield typeof specFn === 'function' ? specFn(f) : specFn;
      }
    }
    function* walk(i, x, { tol = 3, max = 900 } = {}) {
      const side = Math.sign(x - cx(cats[i]));
      yield* until(() => Math.abs(x - cx(cats[i])) <= tol || Math.sign(x - cx(cats[i])) !== side, () => dir(i, x, tol), max,
        () => `cat ${i} walking to ${x}: ${JSON.stringify(api.snapshot()[i])}`);
    }
    function* land(i) { yield* until(() => cats[i].grounded, {}, 240, `cat ${i} never landed`); }
    function* jumpTo(i, x, { holdJump = 16 } = {}) {
      let air = false;
      yield* until(() => air && cats[i].grounded, (f) => { if (!cats[i].grounded) air = true; return { jump: f < holdJump, ...dir(i, x, 2) }; },
        150, `cat ${i} jumping to ${x}`);
    }
    // --- cat 0: west floor, JumpStand 1, block-top switches, Rect steps, roof switches, east shaft ---------------
    function* cat0() {
      // Out of the pocket to the right, down to the west floor, left to JumpStand 1 (x 56..88).
      yield* walk(0, 330);
      yield* land(0);
      yield* walk(0, 140, { tol: 4 });
      // A JumpStand launches a cat resting on its top: hop onto it.
      yield* until(() => feet(cats[0]) < 330, (i) => ({ jump: i < 12, ...(cx(cats[0]) > 74 ? { left: true } : {}) }), 120,
        'JumpStand 1 did not launch cat 0');
      // Launched up the west shaft (x 48..96): steer right once above the block top (144) and walk the switches.
      yield* until(() => cats[0].grounded && feet(cats[0]) <= 145, () => (feet(cats[0]) < 140 ? { right: true } : {}), 200,
        'JumpStand 1 did not lift cat 0 onto the west block');
      yield* walk(0, 330, { tol: 4 });
      // Running jump off the block's east end (384) down onto the small Rect (576..624, top 240), then up the steps:
      // the block 624..720 (top 192), the Rect 724..776 (top 148) and onto the roof (top 96).
      yield* walk(0, 360);
      yield* jumpTo(0, 600);   // may land short, on the 288 ledge: the next hops still climb
      for (let hop = 0; hop < 3 && !(feet(cats[0]) < 193 && cx(cats[0]) > 640); hop++) {
        yield* jumpTo(0, feet(cats[0]) > 241 ? 600 : 660, { holdJump: 14 });
      }
      yield* land(0);
      // Up onto the Rect 724..776 (top 148): rise beside it, move right once above its top.
      yield* until(() => cats[0].grounded && feet(cats[0]) < 149, (i) => ({ jump: i < 16, ...(feet(cats[0]) < 146 ? { right: true } : {}) }),
        80, 'cat 0 could not climb onto the Rect at 724');
      yield* land(0);
      // Straight up beside the roof's west end (768), then right onto it once above its top (the map ceiling at 48
      // caps the jump at feet 94.5: a 1.5-unit window, ~2 ticks). Native 3 px/tick: start flush against the roof's
      // end (right edge 766) so one tick of right crosses 768.
      yield* walk(0, 751, { tol: 1 });
      yield* until(() => cats[0].grounded && feet(cats[0]) < 97, (i) => ({ jump: i < 16, ...(feet(cats[0]) < 95.9 ? { right: true } : {}) }),
        80, 'cat 0 could not climb from the Rect onto the roof');
      // Along the roof over its switches (1464..1656), down the east shaft, and wait at its east wall, past the door.
      yield* walk(0, 1660, { tol: 4 });
      yield* walk(0, 1720);
      yield* land(0);
      yield* walk(0, 1806, { max: 120 });
    }
    // --- cat 1: floor switches, JumpStand 2, key corridor + its switches, back to the pit floor -------------------
    function* cat1() {
      // The two floor switches (464..496, 608..640).
      yield* walk(1, 480, { tol: 4 });
      yield* walk(1, 626, { tol: 4 });
      // Hop onto JumpStand 2 (656..688, top 398) ...
      yield* walk(1, 636, { tol: 2 });
      yield* until(() => cats[1].grounded && Math.abs(feet(cats[1]) - 398) < 1, (i) => {
        const steer = Math.abs(cx(cats[1]) - 672) > 2 && feet(cats[1]) < 397 ? dir(1, 672, 2) : {};
        return { jump: i < 10, ...steer };
      }, 80, 'cat 1 could not hop onto JumpStand 2');
      // ... and ride the bounce (feet ~316) onto the ledge (top of the Rect 744..1680 at y 336). Native 3 px/tick:
      // the bounce is above 336 for only ~16 ticks (~47 px), so steer east from the launch (the right edge is only
      // at ~711 when the feet pass 336 going up; the ledge wall is at 744).
      let apex = 999;
      yield* until(() => cats[1].grounded && feet(cats[1]) < 390, () => {
        apex = Math.min(apex, feet(cats[1]));
        return { right: feet(cats[1]) < 397 };
      }, 120, () => `JumpStand 2 did not put cat 1 on the ledge (apex feet ${apex.toFixed(1)})`);
      if (Math.abs(feet(cats[1]) - 336) > 1) api.block(`cat 1 landed at feet ${feet(cats[1]).toFixed(1)}, not on the 336 ledge`);
      // Against the ledge's wall (792), jump: the head stops at the y-240 ceiling with the feet at 287, one unit
      // above the corridor floor, and the held right carries the cat over the edge.
      yield* until(() => cats[1].grounded && feet(cats[1]) < 289 && cx(cats[1]) > 790, (i) => ({ jump: i > 8 && i < 30, right: true }),
        80, () => `cat 1 could not climb from the ledge into the key corridor (feet ${feet(cats[1]).toFixed(1)})`);
      // Key (1376..1408, 164..220): jump under it; then the six corridor switches.
      yield* walk(1, 1392);
      yield* until(() => api.carrierOfKey() === 1, (i) => ({ jump: i < 14 }), 36, 'cat 1 jumped under the key without taking it');
      yield* land(1);
      yield* walk(1, 1612, { tol: 4 });
      // Back west, off the corridor floor onto the ledge, then off the ledge's west end straight down to the pit
      // floor (clear of the stand at 656..688).
      yield* walk(1, 770);
      yield* land(1);
      yield* until(() => !cats[1].grounded, { left: true }, 60, 'cat 1 did not step off the ledge');
      yield* land(1);
    }
    // --- both at once ------------------------------------------------------------------------------------------------
    const programs = [cat0(), cat1()];
    const done = [false, false];
    api.until(() => done.every(Boolean), () => {
      timeUp();
      return programs.map((program, i) => {
        if (done[i]) return {};
        const next = program.next();
        if (next.done) { done[i] = true; return {}; }
        return next.value;
      });
    }, 2400, 'the two routes did not finish');
    timeUp();
    // Cat 1 walks the low corridor to the door and opens it (cat 0 waits past it); both enter.
    api.enterOne(1, { max: 900 });
    api.enterGoal({ max: 900 });
  },
};
