// 3-4 TIME LIMIT (stage_time_limit01).
// The puzzle (party 2): a DeadTimer starts at 10 s; every Switch adds 1 s the first time it is pressed (five on the
// floor at x 464..656, thirteen on the first slab at x 944..2096, under the second slab). A staircase of long Rect
// slabs rises east, each 96 above the last (tops 336, 240, 144, 48; west edges 720, 912, 1104, 1296; slabs 1..3 end
// at 2160, slab 4 at 2352). Under every slab the slab below leaves a 48-high corridor (a cat fits, a 48-box fits
// exactly, nobody can jump in it). A push box stands near the west end of each of the first three slabs (753.6,
// 945.6, 1137.6); the Key sits on the top slab (x 1616..1648); the door is on the floor at the east end (2280),
// under the low Rect (2256..2496, top 192).
// Native 3 px/tick facts this route is built on:
// - A jump rises ~78.6 but is >= 48 up only from tick 8 to tick 27 (~57 px of travel), so a cat cannot hop OVER a
//   48-high box from beside it; it lands ON the box instead and walks off its far side.
// - A box pushed (1 px/tick) to stand flush against the next slab's west face (box right edge = face) is a step:
//   from the box top (48 below the next slab top) a jump clears the slab top, so one cat climbs a slab alone. A box
//   pushed further slides into the 48-high corridor under that slab.
// Route: walk the floor switches; at slab 1 cat 1 (base) stands against the west face, cat 0 climbs its head onto
// the 33-wide lip west of box 1, jumps onto the box, walks off its east side and pushes it west off the edge (it
// falls to the floor); cat 1 climbs box -> slab 1. Cat 0 stands against slab 2's face as the base, cat 1 climbs its
// head onto slab 2. Then both AT ONCE: cat 0 runs the thirteen-switch corridor under slab 2 and walks off slab 1's
// east end (2160) to the floor by the door; cat 1 pushes box 2 east flush against slab 3's face (1104), climbs box ->
// slab 3, pushes box 3 flush against slab 4's face (1296), climbs box -> slab 4, takes the key on its way east, walks
// off slab 4's end (2352) onto the low Rect and west off it to the floor; both enter.
// Clock: DeadTimer.addSeconds rounds the remaining time UP to a whole second after adding 1, so the corridor switches
// (32 frames apart at 3 px/tick) each net ~+1.5 s; the clock never drops below ~5 s on this route.
export default {
  party: 2,
  budget: 5000,
  async solve(stage, api) {
    const { cats, game } = api;
    const [A, B] = cats;
    const cx = api.centreX, feet = api.feetY;
    const timer = game.deadTimers[0];
    const timeUp = () => { if (timer.expired) api.block(`the DeadTimer ran out at frame ${api.frame}`); };
    const boxOn = (top) => game.pushBoxes.find((box) => Math.abs(box.rect.y + box.rect.height - top) < 2);
    const one = (i, spec) => { const specs = [{}, {}]; specs[i] = spec; return specs; };
    // --- slab 1: cat 1 is the base, cat 0 climbs ---------------------------------------------------------------------
    const box1 = boxOn(336);
    // Floor switches (464..688) on the way; cat 1 against slab 1's west face (720).
    api.walkTo([0, 1], [640, 702], { tol: 2 });
    timeUp();
    api.climbOnto(0, 1);
    api.jumpTo(0, 736);   // the lip 720..753.6 (box 1 starts at 753.6)
    if (Math.abs(feet(A) - 336) > 2) api.block('cat 0 did not land on the lip of slab 1: ' + JSON.stringify(api.snapshot()[0]));
    // Onto box 1 (top 288): rise first, move east only once the feet clear its top; then off its east side.
    let air = false;
    api.until(() => air && A.grounded, (i) => {
      if (!A.grounded) air = true;
      return one(0, { jump: i < 16, ...(feet(A) < 287 && cx(A) < box1.rect.x + 24 ? { right: true } : {}) });
    }, 80, 'cat 0 could not jump onto box 1');
    if (Math.abs(feet(A) - box1.rect.y) > 2) api.block('cat 0 is not on box 1: ' + JSON.stringify(api.snapshot()[0]));
    api.until(() => A.grounded && feet(A) > 335 && A.rect.x >= box1.rect.x + box1.rect.width, one(0, { right: true }), 80,
      'cat 0 did not walk off box 1 to its east');
    // Cat 1 steps back so the box can drop beside it; cat 0 pushes box 1 west off the edge (it falls to the floor).
    api.walkTo(1, 600, { tol: 4 });
    api.until(() => box1.rect.y > 380, one(0, { left: true }), 200,
      () => `box 1 did not drop off slab 1: ${JSON.stringify(box1.rect)} falling ${box1.falling}`);
    api.until(() => !box1.falling && box1.rect.y + box1.rect.height >= 431, [], 120, 'box 1 did not land on the floor');
    timeUp();
    // Cat 0 stands against slab 2's face (912) as the next base; cat 1 climbs box 1 -> slab 1.
    api.walkTo(0, 894, { tol: 2 });
    api.jumpTo(1, box1.rect.x + box1.rect.width / 2);
    api.jumpTo(1, 780);
    if (Math.abs(feet(B) - 336) > 2) api.block('cat 1 did not reach slab 1 from box 1: ' + JSON.stringify(api.snapshot()[1]));
    timeUp();
    // --- slab 2: cat 1 climbs cat 0's head onto the lip 912..945.6 -----------------------------------------------------
    api.climbOnto(1, 0);
    api.jumpTo(1, 928);
    if (Math.abs(feet(B) - 240) > 2) api.block('cat 1 did not land on the lip of slab 2: ' + JSON.stringify(api.snapshot()[1]));
    timeUp();
    // --- both at once: cat 0 the corridor, cat 1 the boxes and the key --------------------------------------------------
    const dir = (cat, x, tol = 2) => (Math.abs(x - cx(cat)) <= tol ? {} : x > cx(cat) ? { right: true } : { left: true });
    function* until(pred, specFn, max, label) {
      for (let f = 0; !pred(); f++) {
        if (f >= max) api.block(typeof label === 'function' ? label() : label);
        yield typeof specFn === 'function' ? specFn(f) : specFn;
      }
    }
    function* walk(cat, x, max = 900) {
      const side = Math.sign(x - cx(cat));
      yield* until(() => Math.abs(x - cx(cat)) <= 3 || Math.sign(x - cx(cat)) !== side, () => dir(cat, x, 3), max,
        () => `cat ${cats.indexOf(cat)} walking to ${x}: ${JSON.stringify(api.snapshot())}`);
    }
    function* land(cat) { yield* until(() => cat.grounded, {}, 240, `cat ${cats.indexOf(cat)} never landed`); }
    // Push `box` east until its right edge meets the face at `face`, then climb box -> next slab (top `top`).
    function* stepUp(box, face, top) {
      yield* until(() => box.rect.x + box.rect.width >= face - 0.5, { right: true }, 300,
        () => `cat 1 could not push the box to the face at ${face}: ${JSON.stringify(box.rect)}`);
      // Onto the box: rise, move east once the feet clear its top, stop with the right edge at the face.
      let up = false;
      yield* until(() => up && B.grounded, (i) => {
        if (!B.grounded) up = true;
        return { jump: i < 16, ...(feet(B) < box.rect.y - 1 ? dir(B, face - 24) : {}) };
      }, 90, 'cat 1 could not jump onto the box at ' + face);
      if (Math.abs(feet(B) - box.rect.y) > 2) api.block(`cat 1 is not on the box at ${face}: ${JSON.stringify(api.snapshot()[1])}`);
      // Straight up beside the slab's face, east over its top, stop just past the face.
      up = false;
      yield* until(() => up && B.grounded, (i) => {
        if (!B.grounded) up = true;
        return { jump: i < 16, ...(feet(B) < top - 1 && B.rect.x < face + 2 ? { right: true } : {}) };
      }, 90, 'cat 1 could not jump from the box onto the slab at ' + face);
      if (Math.abs(feet(B) - top) > 2) api.block(`cat 1 did not reach the slab at ${face}: ${JSON.stringify(api.snapshot()[1])}`);
    }
    function* corridor() {
      // Through the thirteen switches (944..2096), off slab 1's east end (2160) to the floor, wait west of the door.
      yield* walk(A, 2200, 1200);
      yield* land(A);
      yield* walk(A, 2230);
    }
    function* climber() {
      yield* stepUp(boxOn(240), 1104, 144);
      yield* stepUp(boxOn(144), 1296, 48);
      // East along the top slab through the key (1616..1648), off its end (2352) onto the low Rect (top 192), then
      // west off the low Rect (2256) to the floor beside the door.
      yield* walk(B, 2380, 600);
      if (api.carrierOfKey() !== 1) api.block('cat 1 walked through the key spot without the key');
      yield* land(B);
      yield* walk(B, 2236, 200);
      yield* land(B);
    }
    const programs = [corridor(), climber()];
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
    api.enterGoal();
  },
};
