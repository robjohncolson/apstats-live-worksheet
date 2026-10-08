// 1-4 HELLO PICO PARK (stage_weight01).
// The puzzle: the Key hangs in the pocket under the right ledge (floor level, walk in from the west). Back up top:
// an UpDownLift climbs to the left ledge; the MoveWall pillar (home x 1488) on the right ledge starts its endless
// slide-left / return cycle once a cat stands in its sensor band; WeightedLift A in the gap between the ledges sinks
// to the floor under the whole party (2) so the wall's sweep passes over it; WeightedLift B before the goal ledge
// rises 192 with the whole party.
// Route (same as the batch-4 playthrough, apstat-park/campaign-playthrough-1-4.mjs): cat 1 takes the key; both ride
// the UpDownLift to the left ledge (the first lands in the sensor band and starts the wall); both follow the
// returning wall onto lift A, which sinks; after the sweep passes over, cat 0 hops (airborne = one body on the slab)
// until A is back at the ledge row; both walk east past the pillar's home, down the stairs, onto lift B, up, and in.
export default {
  party: 2,
  budget: 9000,
  async solve(stage, api) {
    const { cats, game } = api;
    const [wall] = game.moveWalls;
    const updown = game.weightedLifts.find((lift) => lift.spawn.actorName === 'UpDownLift');
    const liftA = game.weightedLifts.find((lift) => lift.spawn.actorName === 'WeightedLift' && lift.spawn.x === 1339);
    const liftB = game.weightedLifts.find((lift) => lift.spawn.actorName === 'WeightedLift' && lift.spawn.x === 2324);
    const cx = api.centreX, feet = api.feetY;
    const walk = (cat, x, tol = 2) => { const d = x - cx(cat); return Math.abs(d) <= tol ? {} : d > 0 ? { right: true } : { left: true }; };
    const on = (lift) => (cat) => Math.abs(feet(cat) - lift.rect.y) <= 1.5 && cx(cat) > lift.rect.x && cx(cat) < lift.rect.x + lift.rect.width;
    const onUpDown = on(updown), onA = on(liftA), onB = on(liftB);
    const onLedge = (cat) => Math.abs(feet(cat) - 240) <= 1.5 && cat.grounded;
    // Jump timers: a jump is held 20 frames.
    const jumpLeft = [0, 0];
    const jumpNow = (i) => { jumpLeft[i] = 20; };
    const withJump = (specs) => specs.map((spec, i) => {
      const held = jumpLeft[i] > 0;
      if (jumpLeft[i] > 0) jumpLeft[i]--;
      return { ...spec, jump: held };
    });
    const go = (pred, fn, max, label) => api.until(pred, () => withJump(fn()), max, label);
    const [other, carrier] = cats;   // cat 1 spawns east of cat 0, so it reaches the key first
    // 1. East along the floor under the ledges into the pocket: cat 1 takes the key.
    go(() => api.carrierOfKey() === 1, () => [walk(other, 1560), walk(carrier, 1728)], 900, 'cat 1 did not reach the key');
    // 2. West to the UpDownLift column (x 917), cat 0 furthest west.
    go(() => Math.abs(cx(other) - 760) < 3 && Math.abs(cx(carrier) - 815) < 3, () => [walk(other, 760), walk(carrier, 815)], 900, 'back west');
    // Board the UpDownLift when it is low, then ride up and jump east onto the left ledge.
    const board = (i, x) => go(() => onUpDown(cats[i]), () => {
      const low = updown.rect.y >= 380;
      if (cats[i].grounded && low && jumpLeft[i] === 0 && !onUpDown(cats[i])) jumpNow(i);
      const specs = [{}, {}];
      specs[i] = low || jumpLeft[i] > 0 ? walk(cats[i], x) : {};
      return specs;
    }, 700, `cat ${i} could not board the UpDownLift`);
    board(1, 940);
    go(() => onLedge(carrier) && cx(carrier) > 1012, () => {
      if (onUpDown(carrier) && updown.rect.y <= 275 && jumpLeft[1] === 0) jumpNow(1);
      return [{}, jumpLeft[1] > 0 || !onUpDown(carrier) ? walk(carrier, 1100) : walk(carrier, 917)];
    }, 900, 'cat 1 could not jump from the UpDownLift onto the left ledge');
    // 3. Cat 1 in the sensor band starts the wall (its first sweep pushes cat 1 to the ledge's west end).
    go(() => wall.rect.x < 1488, () => [{}, {}], 200, 'the MoveWall did not start');
    go(() => Math.abs(cx(other) - 760) < 3, () => [walk(other, 760), {}], 200, 'cat 0 back west of the lift');
    board(0, 917);
    go(() => onLedge(other) && onLedge(carrier), () => {
      const window = wall.rect.x > 1100 && updown.rect.y <= 275;
      if (onUpDown(other) && window && jumpLeft[0] === 0) jumpNow(0);
      const move = jumpLeft[0] > 0 || !onUpDown(other) ? walk(other, 1020) : walk(other, 917);
      return [move, onLedge(carrier) ? walk(carrier, Math.min(1080, wall.rect.x - 30)) : {}];
    }, 2400, 'cat 0 could not get onto the left ledge behind the wall');
    // Follow the returning wall east onto lift A; it sinks under both.
    go(() => onA(other) && onA(carrier), () => [walk(other, Math.min(1340, wall.rect.x - 60)), walk(carrier, Math.min(1400, wall.rect.x - 20))],
      400, 'both on lift A');
    // 4. The next sweep passes over the sunken lift.
    go(() => wall.rect.x + wall.rect.width < liftA.rect.x - 8, () => [walk(other, 1340), walk(carrier, 1400)], 900, 'the wall never passed over lift A');
    // 5. Cat 0 hops: while it is airborne only one body counts, so A climbs back to the ledge row with both.
    go(() => liftA.rect.y <= 240.01 && onA(carrier), () => {
      if (onA(other) && other.grounded && jumpLeft[0] === 0) jumpNow(0);
      return [walk(other, 1340), walk(carrier, 1400)];
    }, 1200, 'hopping did not bring lift A back up');
    // 6. Both walk east past the pillar's home (1504) before it returns.
    go(() => cx(carrier) > 1600 && onLedge(carrier) && cx(other) > 1545 && onLedge(other), () => {
      if (onA(other) && other.grounded && jumpLeft[0] === 0 && liftA.rect.y > 241) jumpNow(0);
      return [walk(other, 1550), walk(carrier, 1610)];
    }, 400, 'both past the pillar home');
    // 7. Down the stairs to the floor, onto lift B (both), which rises 192.
    go(() => feet(carrier) >= 431 && cx(carrier) > 2150 && feet(other) >= 431 && cx(other) > 2100,
      () => [walk(other, 2110), walk(carrier, 2160)], 900, 'down the stairs');
    go(() => onB(carrier) && onB(other), () => {
      cats.forEach((cat, i) => { if (!onB(cat) && cat.grounded && jumpLeft[i] === 0) jumpNow(i); });
      return [walk(other, 2300), walk(carrier, 2380)];
    }, 400, 'both on lift B');
    go(() => liftB.rect.y <= 211.5, () => [{}, {}], 400, 'lift B did not rise');
    // 8. Off lift B onto the goal ledge; deliver the key and enter.
    go(() => onLedge(carrier) && onLedge(other) && cx(carrier) > 2560 && cx(other) > 2520, () => {
      cats.forEach((cat, i) => { if (onB(cat) && jumpLeft[i] === 0) jumpNow(i); });
      return [walk(other, 2540), walk(carrier, 2580)];
    }, 400, 'onto the goal ledge');
    api.enterGoal();
  },
};
