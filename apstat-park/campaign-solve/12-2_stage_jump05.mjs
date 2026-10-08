// 12-2 LAST PARK (stage_jump05).
// The puzzle (party 2): the door is at the far west end; the Key floats high at the east end (x 1736..1768,
// y 20..76) over a bottomless pit (Warp + Thunder below). A JumpStandEx at the floor's east edge (x 1544) bounces a
// cat over the one-pit gap onto WeightedLiftEx2, a narrow 56-wide slab on a one-chip pillar, which rises 192 with
// the whole party on it (stacked cats count). A Wind band at y 290..306 blows west across the rising stack. Two
// KeyBridges unfold from the pillar once a key is held. Wind 1 slows the walk east on the left half of the floor.
// Route: both walk east; cat 1 bounces off the jump stand onto the slab; cat 0 bounces and lands on cat 1's head;
// the slab rises (both hold east against the wind); at the top cat 0 jumps from the head into the key and lands
// back on the head; both drop off the slab west (the slab sinks back once the party leaves), cross the gap and walk
// home to the door with the wind behind them.
export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const { cats, game } = api;
    const [top, bottom] = [0, 1];
    const lift = game.weightedLifts.find((entry) => entry.spawn.actorName === 'WeightedLiftEx2');
    const restY = lift.rect.y;
    const cx = api.centreX;
    const steer = (cat, x, tol = 2) => { const d = x - cx(cat); return Math.abs(d) <= tol ? {} : d > 0 ? { right: true } : { left: true }; };

    // Bounce one cat off the jump stand (1544..1576): jump onto it from the west, then steer to targetX().
    function bounce(i, targetX, isDone, label) {
      const cat = cats[i];
      let launched = false, f = 0;
      api.until(isDone, () => {
        if (cat.velocity.y < -500) launched = true;
        const specs = [{}, {}];
        specs[i] = { jump: f < 14, ...steer(cat, launched ? targetX() : 1560) };
        f++;
        return specs;
      }, 140, label);
    }

    // East along the floor (cat 1 leads), stopping short of the jump stand.
    api.walkTo([0, 1], [1420, 1490], { max: 900 });
    // Cat 1 bounces onto the slab (1676..1732, top 403).
    const onSlab = (cat) => cat.grounded && Math.abs(api.feetY(cat) - lift.rect.y) < 1.5 && cx(cat) > lift.rect.x && cx(cat) < lift.rect.x + lift.rect.width;
    bounce(bottom, () => 1702, () => onSlab(cats[bottom]), 'cat 1 did not bounce from the jump stand onto the WeightedLiftEx2 slab');
    // Cat 0 follows and lands on cat 1's head.
    api.walkTo(top, 1490);
    const onHead = () => cats[top].grounded && Math.abs(api.feetY(cats[top]) - cats[bottom].rect.y) < 1.5;
    bounce(top, () => cx(cats[bottom]) + 4, onHead, 'cat 0 did not bounce onto the head of cat 1 on the slab');
    // The slab rises 192 (0.5 per tick); both lean east against the west-blowing wind band.
    api.until(() => lift.rect.y <= restY - 191, () => [steer(cats[top], cx(cats[bottom]) + 6, 1), steer(cats[bottom], 1716, 1)], 600,
      () => `the slab did not rise with the stack (slab y ${lift.rect.y}, cats ${JSON.stringify(api.snapshot())})`);
    // Cat 0 jumps from the head into the key and lands back on the head.
    let f = 0, left = false;
    api.until(() => left && cats[top].grounded, () => {
      if (!cats[top].grounded) left = true;
      // Lean east into the key (1736..1768) on the way up, then back over the head.
      const spec = { jump: f < 16, ...steer(cats[top], f < 16 ? 1748 : cx(cats[bottom]), 1) };
      f++;
      return [spec, steer(cats[bottom], 1716, 1)];
    }, 120, 'cat 0 did not land again after the key jump');
    if (api.carrierOfKey() < 0) api.block('cat 0 jumped from the head on the raised slab but missed the key');
    // Down: cat 0 steps west off the head and the slab, then cat 1 follows; both land west of the gap.
    api.until(() => cats.every((cat) => cat.grounded && api.feetY(cat) > 430 && cx(cat) < 1580), () => [
      { left: true }, cats[top].grounded && api.feetY(cats[top]) > 430 ? { left: true } : {},
    ], 400, 'the party did not get back down west of the gap');
    // Home: west along the floor to the door at x 144.
    api.walkTo([0, 1], [400, 460], { max: 900 });
    api.enterGoal();
  },
};
