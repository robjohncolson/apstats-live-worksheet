// 10-4 TWO PLAYERS (stage_darkness02).
// The puzzle (party 2): a dark room. The cats start on DarknessRect 1 (240..528, top 441.6). East over a brick and
// two steps is an alcove (floor 336); its trigger (744..792) creates a floor Rect (528..672, top 432), a JumpStand
// (600, 432) and the Key -- inside the west DarknessWeightedLift 1 (0..96, top 220.8, sinks 192 under 2 bodies).
// Riding lift 1 down reaches the Key and the trigger at 24..72 / 360..408, which creates the Goal (768, 96, on the
// big east block) and a row of stepping stones (y 48). Route: east to the alcove trigger; JumpStand up and west to
// lift 1 (PushBox 1 spawns floating at (336, 0) and drops at frame 0 onto the middle block, walling it off: both
// bounce onto the block, push the box west into the 95.52 gap -- its native body is inset 1 a side, 94 wide -- where
// it lands as a step (top 273.6); cross onto DarknessRect 2 and over lift 2 onto lift 1); both ride it down (key +
// goal trigger); hop it back up (an airborne cat does not weigh); both onto lift 2, which rises to 28.8 (and sinks
// back the moment one cat leaves); east along the created stones (240 and 336, top 48) and the y-48 blocks, drop
// onto the big block and in at the door.

export default {
  party: 2,
  budget: 6000,
  async solve(stage, api) {
    const { cats, game } = api;
    api.wait(10);
    // East: brick (528..576, top 432), gap, step 624..672 (432), 672..720 (384), alcove floor (336) to the trigger.
    const hopTo = (i, xs) => { for (const x of xs) api.jumpTo(i, x); };
    api.walkTo(1, 505, { tol: 2 });
    hopTo(1, [552, 648, 696, 780]);
    api.walkTo(0, 505, { tol: 2 });
    hopTo(0, [552, 648, 696, 740]);
    // JumpStand (584..616, top 398): it bounces a cat up to feet ~232; steering west on the way up the cat slides up the
    // face of the middle block (336..528) and over its top (240).
    const launchToBlock = (i) => {
      let left = false, bounced = false, f = 0;
      api.until(() => bounced && cats[i].grounded, () => {
        if (!cats[i].grounded) left = true;
        if (left && cats[i].velocity.y < -500) bounced = true;   // the stand's launch, far stronger than a jump
        f++;
        const x = bounced && api.feetY(cats[i]) < 380 ? 480 : 600;
        const specs = [{}, {}];
        specs[i] = { jump: f < 14, ...(Math.abs(api.centreX(cats[i]) - x) < 3 ? {} : api.centreX(cats[i]) < x ? { right: true } : { left: true }) };
        return specs;
      }, 300, `cat ${i} could not bounce from the JumpStand onto the middle block`);
      if (api.feetY(cats[i]) > 241) api.block(`cat ${i} bounced off the JumpStand but missed the middle block top (feet ${api.feetY(cats[i])})`);
    };
    launchToBlock(1);
    // PushBox 1 (96x168, weight 100 = both cats) spawns floating at (336, 0) and drops at frame 0 onto the middle
    // block (336..432, top 72): it walls off the way west. Cat 1 waits against its east face for the partner.
    api.walkTo(1, 449, { tol: 2 });
    // Cat 0 drops from the alcove back to the low floor and follows.
    api.walkTo(0, 690);
    api.walkTo(0, 668);
    api.land(0);
    launchToBlock(0);
    // Both push the box west. It has to drop into the gap (240.48..336) to clear the way: as a 168-tall wall on the
    // block (top 72) nobody gets over it at party 2 (jump rise ~79; a two-cat stack reaches feet ~115; the JumpStand
    // apex is feet ~232). Pushed in, it lands on DarknessRect 1 (top 441.6) as a step (top ~273.6).
    const box = game.pushBoxes[0];
    let lastX = box.rect.x, still = 0;
    api.until(() => box.rect.y > 250 || still > 40, () => {
      still = Math.abs(box.rect.x - lastX) < 0.01 ? still + 1 : 0;
      lastX = box.rect.x;
      return [{ left: true }, { left: true }];
    }, 300, 'push PushBox 1 west');
    if (box.rect.y < 250) {
      api.block(`PushBox 1 stopped at x ${box.rect.x.toFixed(2)} on the middle block (top ${box.rect.y.toFixed(1)}) instead of ` +
        `dropping into the gap west of it (DarknessRect 2 ends at 240.48, the block starts at 336)`);
    }
    // West: across the box onto the DarknessRect 2 wall (192..240, top 220.8), over lift 2 onto lift 1 (0..96).
    api.walkTo([0, 1], [330, 296], { tol: 3 });
    api.land();
    api.jumpTo(1, 210, { holdJump: 16 });
    api.jumpTo(1, 140);
    api.jumpTo(1, 30);
    api.jumpTo(0, 210, { holdJump: 16 });
    api.jumpTo(0, 140);
    api.jumpTo(0, 66);
    // Lift 1 sinks 192 under both: the Key (32..64, 356..412) and the trigger (24..72, 360..408) are reached; the
    // trigger creates the Goal and the y-48 stepping stones.
    const lift1 = game.weightedLifts.find((lift) => lift.spawn.label === '1');
    api.until(() => lift1.rect.y >= 412, [], 400, 'lift 1 did not sink under both cats');
    api.wait(2);
    if (api.carrierOfKey() < 0 || game.goals.length === 0) api.block('lift 1 at the bottom but no key / no goal created');
    // Back up: cat 0 keeps hopping (an airborne cat does not weigh), so the slab climbs back with both.
    let jf = 0;
    api.until(() => lift1.rect.y <= 221, () => { jf++; return [{ jump: cats[0].grounded ? jf % 2 === 0 : true }, {}]; }, 800,
      'hopping did not bring lift 1 back up');
    api.land();
    // Both onto lift 2 (96..192): two bodies raise it 192, to top 28.8, above the y-48 stones.
    const lift2 = game.weightedLifts.find((lift) => lift.spawn.label === '2');
    api.jumpTo(0, 168);
    api.jumpTo(1, 118);
    api.until(() => lift2.rect.y <= 29, [], 400, 'lift 2 did not rise under both cats');
    // East along the top: created stones (240..288 and 336..384, top 48) -> blocks at 432 / 528 / 624 / 672 (top 48)
    // -> drop onto the big block (top 96) at the door (744..792).
    // Lift 2 sinks back as soon as one cat leaves it, so cat 1 jumps for the first stone while cat 0 jumps on.
    // At 3 px/tick cat 1 cannot reach stone 1 from the lift's west half: it walks to the lift's east edge (centre 176)
    // while cat 0 jumps to stone 1, then both jump on together (the lift sinks 1/tick under cat 1 alone meanwhile).
    const steerTo = (cat, x) => (Math.abs(api.centreX(cat) - x) <= 2 ? {} : api.centreX(cat) < x ? { right: true } : { left: true });
    let f0 = 0, up0 = false;
    api.until(() => up0 && cats[0].grounded, () => {
      if (!cats[0].grounded) up0 = true;
      return [{ jump: f0++ < 14, ...steerTo(cats[0], 264) }, steerTo(cats[1], 176)];
    }, 150, 'cat 0 could not jump onto stone 1');
    api.jumpTo([0, 1], [365, 264]);
    api.jumpTo(0, 456);
    api.jumpTo(1, 360);
    for (const x of [552, 648, 700]) api.jumpTo(0, x);
    // Cat 0 drops into the door nook (720..816, floor 96) and waits at its east end; cat 1 (key carrier) drops in
    // beside it, opens the door and enters; then cat 0 (still overlapping the door sensor) enters.
    api.walkTo(0, 798, { tol: 2, max: 200 });
    api.land(0);
    for (const x of [456, 552, 648, 690]) api.jumpTo(1, x);
    api.walkTo(1, 745, { max: 200, stall: 40 });
    api.land(1);
    api.enterGoal();
  },
};
