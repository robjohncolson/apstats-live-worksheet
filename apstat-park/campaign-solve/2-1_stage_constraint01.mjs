// 2-1 GO TOGETHER (stage_constraint01; the runtime loads the 48-chip variant, lua stage_constraint01_2).
// Map: start floor 432, a staircase (cols 12..15) up to the 240 level (720..1296), pit 1296..1536 with a floating
// Rect stepping stone (1388..1444, top 240), a long block 1536..1968 (top 240), then a 672-wide bottomless pit
// 1968..2640 with a ceiling bar (y 144..192) spanning it, the Key hanging under the bar (2288..2320, y 244..300),
// and the goal block 2640.. (top 240, door at 2952). No gate.
// Rope (native DistanceConstraint): at party 2 maxDistance 170, hanging weight 1.0, measured between the cats' feet.
// It only pulls when stretched (0.2 x overshoot per tick, velocity changes by the same amount -- springy), and a
// grounded cat ignores an upward pull weaker than 0.65/tick. A CollisionConstraintMove sensor over the bar
// (1958..2650, y 96..144) latches the rope for a cat standing on the bar: the hanging partner can no longer drag it
// back, so the bar cat carries the hanger.
// Route: stairs, stone (cat 1 on the stone, cat 0 hops over via its head), block. At the block's east end cat 1
// climbs onto cat 0's head and jumps onto the bar, steps a little east (centre 2030 -- farther and the rope's
// upward pull on cat 0 (> 0.65/tick) yanks cat 0 off the block up onto the bar's west end, missing the key). Cat 0
// walks off the block into the pit and hangs (feet ~315..330, under the key's band). Both hold right: cat 0's air
// control keeps it under cat 1, so it hangs at feet ~322 and sweeps through the key (if cat 0 trails instead, the
// rope angle lifts it against the bar's underside at feet ~239, 5 above the key's top 244, and it misses). Cat 1
// walks off the bar's east end onto the goal block; the hanging cat meets the block's west wall, the blocked
// sideways pull turns upward and the rope hauls it up the wall onto the block. Both enter.
export default {
  party: 2,
  budget: 5000,
  async solve(stage, api) {
    const { cats } = api;
    // Staircase (cols 12..15 rise 48 each to the 240 level).
    api.walkTo([0, 1], [1150, 1200], { hop: true, max: 600 });
    // Pit 1296..1536 with the stone 1388..1444 (top 240). The rope (170) is shorter than edge-to-edge (272), so the
    // cats cross together: cat 1 onto the stone, cat 0 onto its head, cat 0 on to the block, then cat 1.
    api.walkTo([0, 1], [1230, 1275]);
    api.jumpTo(1, 1416);
    api.climbOnto(0, 1, { from: 1278 });
    api.jumpTo(0, 1600);
    api.jumpTo(1, 1556);
    // East end of the block (1968): cat 0 stands at the edge, cat 1 climbs onto its head and jumps onto the bar.
    api.walkTo([0, 1], [1945, 1880], { tol: 2 });
    api.climbOnto(1, 0);
    api.jumpTo(1, 1995);
    if (api.feetY(cats[1]) > 145) api.block('cat 1 could not get onto the bar from the head of cat 0');
    // Cat 1 steps east on the bar, staying within rope reach of cat 0 on the block.
    api.walkTo(1, 2030);
    // Cat 0 walks off the block into the pit and hangs from cat 1; let the springy rope settle.
    api.until(() => api.feetY(cats[0]) > 260, [{ right: true }, {}], 60, 'cat 0 did not walk off the block');
    api.wait(60);
    if (cats[0].grounded || api.feetY(cats[0]) < 280) api.block('cat 0 is not hanging under the bar after the drop');
    // Both walk east: cat 1 along the bar (latched), cat 0 hanging beneath it, through the key.
    api.until(() => api.centreX(cats[1]) >= 2700, () => {
      if (api.feetY(cats[0]) > 480) api.block('cat 0 fell instead of hanging from the rope');
      return [{ right: true }, { right: true }];
    }, 400, 'cat 1 could not carry cat 0 along the bar');
    if (api.carrierOfKey() < 0) api.block('cat 0 swung under the bar without touching the key');
    // Cat 1 walks on along the goal block and hauls cat 0 up the block's west wall.
    api.until(() => cats.every((cat) => cat.grounded && api.feetY(cat) < 242), [{}, { right: true }], 300,
      'cat 1 on the goal block could not haul cat 0 up');
    api.enterGoal();
  },
};
