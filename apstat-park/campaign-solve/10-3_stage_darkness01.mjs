// 10-3 TWO PLAYERS (stage_darkness01).
// The puzzle (party 2): a dark room. The cats start in the lower-left room; touching the top of the bump (trigger
// 312..360) creates a Rect step (192..240, top 384); the corridor east leads to DarknessWeightedLift 1 in the east
// shaft, which carries the party up to the 240 floor. Touching 528..576 there creates the Key in the upper-left
// area (past the tall PushBox "1", weight 100: both cats push; it drops from (312, -48) onto the 192 floor at frame 0
// and the pair shoves it west to the wall); touching 124.8..158.4 (far west, upper area)
// creates the Goal on the high east ledge (768, 144) and a JumpStand (552, 240: a solid 32x34 block 536..568, top 206,
// that launches any cat resting on its top) to get up there.
// Route: stack-jump onto the bump (creates the step), the partner climbs step -> bump; east along the corridor onto
// lift 1 (the corridor is one chip tall: cat 0 jumps up the shaft while cat 1 walks under it, so the stack lands on
// the one-cat-wide slab), ride up; trigger the key, push PushBox 1 west along the 192 floor through the key and the goal
// trigger; each cat bounces off the JumpStand east onto DarknessWeightedLift 2 (720..816, top 48), which sinks 144
// under both (the slab ignores map chips) and the riders land on the row-144 chips in the door slot (744..792,
// 112..144); enterGoal then takes both in.

export default {
  party: 2,
  budget: 6000,
  async solve(stage, api) {
    const { cats, game } = api;
    // Bump (288..384, top 336, 96 tall): cat 1 stands at its west face, cat 0 climbs onto its head and jumps on top.
    api.walkTo(1, 270, { tol: 2 });
    api.climbOnto(0, 1, { from: 210 });
    api.jumpTo(0, 330);
    // Cat 1: step (created Rect, top 384) -> bump top (336).
    api.jumpTo(1, 216);
    api.jumpTo(1, 300);
    // East: down the col-8 drop (384..432) and along the corridor (ceiling 384) onto lift 1 (768..816).
    // The lift slab is one cat wide: cat 0 stands on it, cat 1 climbs onto its head (the stack weighs both).
    api.walkTo([0, 1], [792, 730], { max: 600, stall: 120 });
    // The corridor is one chip tall, so nobody can jump onto a head there: cat 0 jumps straight up the shaft and cat 1
    // walks under it onto the slab; cat 0 lands on cat 1's head and the stack (2 bodies) lifts.
    api.walkTo(0, 792, { tol: 2 });
    api.hold((f) => [{ jump: f < 14 }, { right: true }], 14);
    api.until(() => cats[0].grounded && cats[1].grounded, () => [{}, Math.abs(api.centreX(cats[1]) - 792) > 3 ? { right: true } : {}], 120,
      'cat 0 did not land on cat 1 in the shaft');
    // Ride until the top cat reaches the 240 floor's level (the stack stops under the shaft roof), step west off it;
    // the bottom cat jumps west before the lightened slab sinks.
    api.until(() => api.feetY(cats[0]) <= 240, [], 400, 'lift 1 did not raise the stack to the 240 floor');
    api.walkTo(0, 700);
    api.jumpTo(1, 740);
    // Trigger 528..576 creates the Key (upper-left); step up to the 192 floor; both push the 192-tall PushBox 1
    // (weight 100) west to the wall.
    api.walkTo([0, 1], [552, 600]);
    api.walkTo([0, 1], [430, 470], { hop: true });
    // PushBox 1 (48x192) spawns floating at (312, -48) and drops at frame 0 onto the 192 floor (312..360, top 0); both
    // cats push it west to the wall (it stops a push step short of x 48), walking through the Key (it appears at 144,
    // 144) and the far-west trigger (124.8..158.4), which creates the Goal (768, 144) and a JumpStand (552, 240).
    api.walkTo([0, 1], [125, 160], { stall: 30 });
    if (api.carrierOfKey() < 0) api.block('nobody picked up the key at (144, 144)');
    if (game.goals.length === 0 || game.jumpStands.length === 0) api.block('the far-west trigger did not create the Goal / JumpStand');
    api.walkTo([0, 1], [500, 540], { hop: true });
    // JumpStand (536..568): each cat bounces high and steers east over the col-14 wall onto lift 2 (720..816, top 48).
    // The stand is a solid 32x34 block (536..568, top 206): a cat that walks off the 192 floor lands on its top
    // (grounded there for a tick) and is launched straight up on the stand's next update; only a rise that starts
    // from the stand top counts as the launch.
    const stand = game.jumpStands[0];
    const launch = (i, x) => {
      let left = false, onStand = false;
      api.until(() => left && cats[i].grounded, () => {
        const cat = cats[i];
        if (cat.grounded && Math.abs(api.feetY(cat) - stand.rect.y) < 2 && cat.rect.x < stand.rect.x + stand.rect.width && cat.rect.x + cat.rect.width > stand.rect.x) onStand = true;
        if (onStand && !cat.grounded) left = true;
        const specs = [{}, {}];
        const cx = api.centreX(cats[i]);
        // Rise over the stand, then cross the wall (top 48) only while well above it.
        const target = !left ? 552 : api.feetY(cats[i]) < 20 || cx > 700 ? x : 552;
        specs[i] = Math.abs(cx - target) <= 3 ? {} : cx < target ? { right: true } : { left: true };
        return specs;
      }, 300, `cat ${i} could not ride the JumpStand onto lift 2`);
    };
    const lift2 = game.weightedLifts.find((lift) => lift.spawn.actorName === 'DarknessWeightedLift' && lift.spawn.label === '2');
    const [goal] = game.goals;
    launch(1, 795);
    api.walkTo(1, 795);
    api.jumpTo(0, 440);   // back up onto the 192 floor, then walk east off its edge onto the stand
    launch(0, 750);
    // Both on lift 2 (2 bodies): it sinks (travel +144) and should carry them down into the door slot under it
    // (744..792, 112..144; the slot floor is the row-144 chips).
    const onLift = (cat) => Math.abs(api.feetY(cat) - lift2.rect.y) < 1.5 && cat.rect.x >= lift2.rect.x - 4;
    if (!cats.every(onLift)) api.block('the JumpStand did not put both cats on lift 2: ' + JSON.stringify(api.snapshot()));
    let lastY = lift2.rect.y, still = 0;
    api.until(() => still > 30 || cats.some((cat) => api.feetY(cat) > goal.rect.y), () => {
      still = lift2.rect.y === lastY ? still + 1 : 0;
      lastY = lift2.rect.y;
      return [{}, {}];
    }, 400, 'lift 2 never settled');
    if (!cats.some((cat) => api.feetY(cat) > goal.rect.y)) {
      api.block(`lift 2 stopped at y ${lift2.rect.y} (offset ${lift2.rect.y - 48} of its 144 travel): the riders ` +
        `(feet ${Math.round(api.feetY(cats[0]))}) never reached the door slot (sensor y 112..144) below`);
    }
    api.enterGoal();
  },
};
