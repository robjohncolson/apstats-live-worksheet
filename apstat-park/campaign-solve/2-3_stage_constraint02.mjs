// 2-3 GO TOGETHER (stage_constraint02).
// Map (48 chips): a roof (x 192..1056, top 96, two chips thick) with the start on it; the bottomless west shaft
// (x 48..192) holds the Key (94..126, y 356..412) and a WarpAll (x 0..240, y >= 720) that returns everyone to the
// roof (a carried key that enters it drops and flies home). Under the roof is a walled room: west wall 192..288,
// a step block 192..432 (top 384), floor 432 (192..1104), and a ledge 528..1056 (top 288, west face a column
// 528..576 down to y 384 with a 48-high gap beneath it) carrying the door (840..888). The corridor under the ledge
// (y 336..432) opens east at x 1056 onto a one-chip floor 1056..1104 (top 432); east of 1104 is bottomless.
// Rope (native DistanceConstraint): at party 2 maxDistance 310, hanging weight 1.0, measured between the cats' feet;
// pulls only when stretched (0.2 x overshoot per tick, springy), a grounded cat ignores an upward pull < 0.65/tick,
// a pull blocked by a wall turns up/down along it.
// Route: cat 0 walks off the roof's west edge and drops at the key's x while cat 1 anchors at the edge; the rope
// stops cat 0 at the key's height (it takes the key), and cat 1 walking east hauls it back onto the roof. East along
// the roof; cat 1 drops down the east shaft onto the one-chip floor (steered to centre 1080 -- holding right past
// 1104 falls into the void), then cat 0. West along the corridor (under the column gap) to the step. One cat's jump
// rises only ~79 (step 384 -> feet ~305), short of the ledge (288), so: cat 0 onto the step (centre 360), cat 1 onto
// the step at its east edge (centre 414), cat 0 climbs onto cat 1's head and jumps east onto the ledge. Cat 0 walks
// east; once the rope (310) is taut it drags cat 1 off the step into the column face, the blocked sideways pull
// turns upward and hauls cat 1 up the face onto the ledge. Both enter (the key passes between cats on touch; either
// carrier opens the door).
export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const { cats } = api;
    const steer = (cat, x) => (Math.abs(api.centreX(cat) - x) <= 2 ? {} : api.centreX(cat) > x ? { left: true } : { right: true });
    api.wait(5);
    // Cat 0 walks off the roof's west edge (x 192) and drops at the key's x (key 94..126); cat 1 follows to the edge
    // (centre 222) as the anchor, so the rope stops cat 0 at the key's height.
    api.until(() => api.carrierOfKey() === 0 || api.feetY(cats[0]) > 470, () => [steer(cats[0], 110), steer(cats[1], 222)],
      300, 'cat 0 did not drop past the key');
    if (api.carrierOfKey() !== 0) api.block('cat 0 hanging on the rope did not reach the key');
    // The anchor walks east and hauls cat 0 back onto the roof.
    api.until(() => cats[0].grounded && api.feetY(cats[0]) < 100, [{}, { right: true }], 400,
      () => 'cat 1 walking east could not haul cat 0 back onto the roof (cat 0 at ' + JSON.stringify(api.snapshot()[0]) + ')');
    // East along the roof; cat 1 drops down the east shaft onto the one-chip floor (1056..1104, top 432), then cat 0.
    api.walkTo([0, 1], [960, 1000], { max: 500 });
    api.until(() => cats[1].grounded && api.feetY(cats[1]) > 430, () => [{}, steer(cats[1], 1080)], 200,
      'cat 1 did not land on the floor below the east shaft');
    api.until(() => cats[0].grounded && api.feetY(cats[0]) > 430, () => [steer(cats[0], 1075), steer(cats[1], 1000)], 200,
      'cat 0 did not land on the floor below the east shaft');
    // West along the corridor (under the ledge and the column gap) to the step (192..432, top 384).
    api.walkTo([0, 1], [500, 470], { max: 600 });
    // Both onto the step: cat 0 at 360, cat 1 at its east edge (414); cat 0 on cat 1's head jumps onto the ledge.
    api.jumpTo(0, 360);
    api.jumpTo(1, 414);
    api.walkTo(1, 414, { tol: 1 });
    api.climbOnto(0, 1);
    api.jumpTo(0, 580, { holdJump: 20 });
    if (api.feetY(cats[0]) > 289) api.block('cat 0 on cat 1\'s head could not jump onto the ledge');
    // Cat 0 walks east on the ledge; the taut rope hauls cat 1 off the step and up the column face onto the ledge.
    api.until(() => cats[1].grounded && api.feetY(cats[1]) < 290, () => {
      if (api.feetY(cats[1]) > 440) api.block('cat 1 was dragged under the column instead of up its face');
      return [{ right: true }, {}];
    }, 200, () => 'cat 0 on the ledge could not haul cat 1 up (cat 1 at ' + JSON.stringify(api.snapshot()[1]) + ')');
    api.enterGoal();
  },
};
