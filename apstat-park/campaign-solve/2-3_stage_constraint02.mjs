// 2-3 GO TOGETHER (stage_constraint02).
// The puzzle: the cats are tied by a DistanceConstraint rope (310 at party 2). They start on a roof; the Key hangs
// in the bottomless shaft west of the roof (a WarpAll there returns everyone to the roof); the door is inside a
// walled room under the roof, reached from the corridor along the bottom.
// Route: cat 0 walks off the roof's west edge and drops straight down the
// shaft at the key's x while cat 1 anchors at the edge; the rope stops cat 0 at the key's height. Cat 1 then walks east and hauls cat 0 back up. Then east off the roof down the east shaft to the corridor floor, west along it, up the step into the
// room, and in at the door.
export default {
  party: 2,
  budget: 4000,
  blocker: 'DistanceConstraint rope (audit: params ok; mechanism unknown): it never holds a hanging cat; it drags the standing partner through solid tiles',
  async solve(stage, api) {
    const { cats, game } = api;
    const [goal] = game.goals;
    api.wait(5);
    // Cat 0 walks off the roof's west edge (x 192) and drops at the key's x (key 94..126); cat 1 follows to the edge
    // (centre 222) as the anchor, so the rope stops cat 0 at the key's height.
    const steer = (cat, x) => (Math.abs(api.centreX(cat) - x) <= 2 ? {} : api.centreX(cat) > x ? { left: true } : { right: true });
    api.until(() => api.carrierOfKey() === 0 || api.feetY(cats[0]) > 470, () => [steer(cats[0], 110), steer(cats[1], 222)],
      300, 'cat 0 did not drop past the key');
    if (api.carrierOfKey() !== 0) api.block('cat 0 hanging on the rope did not reach the key');
    // The anchor holds east (it should hold the hanging cat at the rope's length and then haul it back up).
    api.until(() => cats[0].grounded && api.feetY(cats[0]) < 100, () => {
      const inner = { x: cats[1].rect.x + 8, y: cats[1].rect.y + 8, width: cats[1].rect.width - 16, height: cats[1].rect.height - 16 };   // 8 units deep
      if (game.tileMap.rectHitsSolid(inner)) {
        api.block(`the rope dragged the anchor (cat 1) into the roof tiles at ${JSON.stringify(api.snapshot()[1])} while cat 0 ` +
          `kept falling (cat 0 feet ${Math.round(api.feetY(cats[0]))}); the party then falls into the WarpAll, which drops the key back to its spawn`);
      }
      return [{}, { right: true }];
    }, 400, () => 'cat 1 walking east could not haul cat 0 back onto the roof (cat 0 at ' + JSON.stringify(api.snapshot()[0]) + ')');
    // East along the roof and down the east shaft (x 1056..1104) to the corridor floor (432).
    api.walkTo([0, 1], [1040, 1075], { max: 500 });
    api.until(() => cats.every((cat) => cat.grounded && api.feetY(cat) > 430), [{ right: true }, { right: true }], 300, 'the party did not drop into the corridor');
    // West along the corridor (under the room's floor) to the step block (x 192..432, top 384).
    api.walkTo([0, 1], [520, 560], { max: 600 });
    void goal;
  },
};
