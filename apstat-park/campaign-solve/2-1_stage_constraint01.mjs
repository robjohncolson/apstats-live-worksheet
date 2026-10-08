// 2-1 GO TOGETHER (stage_constraint01).
// The puzzle: the cats are tied by a DistanceConstraint rope (170 at party 2). Up a staircase, over a pit by a
// floating Rect stepping stone, onto a long block; then a 672-wide bottomless pit with a ceiling bar (y 144..192)
// above it and the Key hanging below the bar. A CollisionConstraintMove sensor over the bar (x 1612..2304) latches
// the rope for a cat on the bar: a downward pull on that cat turns into a sideways pull, so the bar cat can carry its
// partner hanging beneath it. Route: stairs, stone, block; at the block's east end cat 1 climbs onto cat 0's head
// and jumps onto the bar; cat 1 walks east along the bar while cat 0 swings beneath it through the Key; at the
// bar's east end cat 1 steps down onto the goal block and hauls cat 0 up; both enter.
export default {
  party: 2,
  budget: 5000,
  blocker: 'DistanceConstraint rope (audit: params ok; mechanism unknown): rope corrections move cats through solid tiles (applyResolvedCollision with no tile test)',
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
    // Cat 1 walks east along the bar; cat 0 is pulled off the block and hangs beneath it.
    api.until(() => api.centreX(cats[1]) >= 2600 || api.carrierOfKey() >= 0 && api.centreX(cats[1]) >= 2400, () => {
      if (cats[0].rect.y > 480) api.block(`cat 0 fell instead of hanging from the rope (cat 1 on the bar at x ${Math.round(cats[1].rect.x)})`);
      const c = cats[0].rect;
      if (api.game.tileMap.rectHitsSolid({ x: c.x + 8, y: c.y + 8, width: c.width - 16, height: c.height - 16 })) {
        api.block(`the rope pulled cat 0 up into the bar tiles at ${JSON.stringify(api.snapshot()[0])} (cat 1 on the bar at x ` +
          `${Math.round(cats[1].rect.x)}) instead of letting it hang beneath the bar through the key`);
      }
      return [{}, { right: true }];
    }, 600, 'cat 1 could not carry cat 0 along the bar');
    if (api.carrierOfKey() < 0) api.block('cat 0 swung under the bar without touching the key');
    api.walkTo(1, 2700, { max: 300 });
    api.until(() => cats.every((cat) => cat.grounded && api.feetY(cat) < 242), [{}, { right: true }], 300,
      'cat 1 on the goal block could not haul cat 0 up');
    api.enterGoal();
  },
};
