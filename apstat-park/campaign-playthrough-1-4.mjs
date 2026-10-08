// 1-4 (stage_weight01) playthrough at party 2 under the native rules as implemented (batch 4, 2026-10-07).
// Shared by campaign-playthrough-1-4.test.mjs (node, GameRuntime.update) and campaign-playthrough-browser-smoke.mjs
// (Chrome, the real campaign engine). Condition-driven: each phase waits for a game state, never a fixed frame count.
//
// Route (two cats; carrier = cat 1, which spawns east of cat 0):
//  1. Along the floor, under both ledges and lift A, into the pocket below the right ledge: the carrier takes the key.
//  2. Back west to the UpDownLift; the carrier rides it up onto the left ledge. Standing in the wall's sensor band
//     (x >= 1023) starts the MoveWall's endless cycle: slide left 230 ticks, wait 90, return 307, wait 90.
//  3. The other cat rides up and lands on the ledge behind the returning wall; both follow it east onto lift A, which
//     sinks with two bodies (required max(2, ceil(0.7 n)) = 2), so the wall's next sweep passes over them.
//  4. With the pillar west of lift A, one cat hops: in the air it is not resting on the slab, so only one body counts
//     and the lift climbs back to the ledge row with both (net up while airborne > half the time).
//  5. Both walk east past the pillar's home (1504) before it returns, down the stairs to the floor, onto lift B
//     (two bodies raise it 192), and east onto the goal ledge.
//  6. Whoever holds the key (a cat touching a carried key takes it) delivers it with UP; both enter with UP.
export const IDLE = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false,
  resetPressed: false, prevStagePressed: false, nextStagePressed: false };

/** runtime: the stage_weight01 GameRuntime (party 2); advance(inputs): one tick with per-cat InputStates;
 *  cleared(): whether the stage is cleared; onPhase(label, frame): called as each phase completes.
 *  Returns { cleared, frames, failedPhase, state }. */
export function playStage14({ runtime: game, advance, cleared, onPhase = () => {} }) {
  const cats = game.players;
  const [wall] = game.moveWalls;
  const updown = game.weightedLifts.find((l) => l.spawn.actorName === 'UpDownLift');
  const liftA = game.weightedLifts.find((l) => l.spawn.actorName === 'WeightedLift' && l.spawn.x === 1339);
  const liftB = game.weightedLifts.find((l) => l.spawn.actorName === 'WeightedLift' && l.spawn.x === 2324);
  const [goal] = game.goals;
  const stats = { get cleared() { return cleared(); } };
  const cx = (c) => c.rect.x + c.rect.width / 2;
  const feet = (c) => c.rect.y + c.rect.height;
  const walk = (c, x, tol = 2) => { const d = x - cx(c); return Math.abs(d) <= tol ? {} : d > 0 ? { right: true } : { left: true }; };
  const jumpState = cats.map(() => 0);
  const jumpNow = (i, hold = 20) => { jumpState[i] = hold; };
  let frame = 0;
  let failedPhase = null;
  function tick(perCat) {
    const inputs = perCat.map((extra, i) => {
      const held = jumpState[i] > 0;
      const pressed = jumpState[i] === 20;
      if (jumpState[i] > 0) jumpState[i] -= 1;
      return { ...IDLE, ...extra, jump: held, jumpPressed: pressed };
    });
    advance(inputs);
    frame += 1;
  }
  function until(cond, perCat, budget, label) {
    for (let i = 0; i < budget; i++) {
      if (cond()) { onPhase(label, frame); return true; }
      tick(typeof perCat === 'function' ? perCat() : perCat);
    }
    if (cond()) { onPhase(label, frame); return true; }
    failedPhase = label;
    return false;
  }
  const steps = [];
  // Cat 1 spawns east of cat 0 (cats are solid to each other on the floor), so cat 1 carries the key.
  const carrier = cats[1], other = cats[0];
  const both = (a, b) => (carrier === cats[1] ? [b, a] : [a, b]);   // inputs in player order: [cat 0, cat 1]
  // 1. Both walk east along the floor, under the ledges and lift A, into the pocket; the carrier takes the key.
  steps.push(() => until(() => game.carriedKeys.some((e) => e.player === carrier),
    () => both(walk(carrier, 1728), walk(other, 1560)), 900, 'key'));
  // 2. Back west to the UpDownLift column (x 917) on the floor, other first (it is west of the carrier).
  steps.push(() => until(() => Math.abs(cx(carrier) - 870) < 4 && Math.abs(cx(other) - 820) < 4,
    () => both(walk(carrier, 870), walk(other, 820)), 900, 'back west'));
  const onLift = (c) => Math.abs(feet(c) - updown.rect.y) <= 1 && cx(c) > updown.rect.x && cx(c) < updown.rect.x + updown.rect.width;
  const onLedge = (c) => Math.abs(feet(c) - 240) <= 1.5 && c.grounded;
  const ci = (c) => cats.indexOf(c);
  // A per-cat 'program': input for this frame (jumps go through jumpNow).
  const inputsFor = (programs) => cats.map((c) => programs.get(c)?.() ?? {});
  // 3. Line up west of the UpDownLift (other furthest west), board it when it is low, ride up, and the carrier
  //    jumps onto the left ledge inside the wall's sensor band (x >= 1023) to start the MoveWall cycle.
  steps.push(() => until(() => Math.abs(cx(other) - 760) < 3 && Math.abs(cx(carrier) - 815) < 3,
    () => both(walk(carrier, 815), walk(other, 760)), 400, 'west of the lift'));
  const board = (c, targetX) => until(() => onLift(c), () => {
    const lowEnough = updown.rect.y >= 380;
    const input = c.grounded && lowEnough && jumpState[ci(c)] === 0 && !onLift(c) ? (jumpNow(ci(c), 20), {}) : {};
    const move = lowEnough || jumpState[ci(c)] > 0 ? walk(c, targetX) : {};
    return cats.map((x) => (x === c ? { ...input, ...move } : {}));
  }, 700, 'board the lift');
  steps.push(() => board(carrier, 940));
  // The carrier rides up and jumps east onto the left ledge (the pillar is at its home, 1488; nobody is in the
  // sensor band east of 1023 yet... landing there starts the wall, which is what we want next anyway).
  const rideAndJump = (c, landX) => until(() => onLedge(c) && cx(c) > 1012, () => {
    const high = updown.rect.y <= 275;
    if (onLift(c) && high && jumpState[ci(c)] === 0) jumpNow(ci(c), 20);
    const move = jumpState[ci(c)] > 0 || !onLift(c) ? walk(c, landX) : walk(c, 917);
    return cats.map((x) => (x === c ? move : {}));
  }, 900, 'ride up and jump onto the left ledge');
  steps.push(() => rideAndJump(carrier, 1100));
  // The carrier on the ledge is inside the sensor band (x >= 1023): the wall starts its endless cycle (slide left
  // 230 ticks, wait 90, return 307, wait 90). Its first sweep pushes the carrier off the ledge's west end (harmless).
  let wallStart = -1;
  steps.push(() => until(() => wall.rect.x < 1488, () => cats.map(() => ({})), 200, 'the wall starts') && ((wallStart = frame), true));
  // The first sweep pushes the carrier to the ledge's west end (996..1028, still standing on it, next to the wall's
  // far-left stop at 1028). The other cat comes up the UpDownLift and jumps on when the wall is east of 1100.
  steps.push(() => until(() => Math.abs(cx(other) - 760) < 3, () => cats.map((c) => (c === other ? walk(other, 760) : {})), 200, 'other west of the lift'));
  steps.push(() => board(other, 917));
  steps.push(() => until(() => onLedge(other) && onLedge(carrier), () => {
    const window = wall.rect.x > 1100 && updown.rect.y <= 275;
    if (onLift(other) && window && jumpState[ci(other)] === 0) jumpNow(ci(other), 20);
    const move = jumpState[ci(other)] > 0 || !onLift(other) ? walk(other, 1020) : walk(other, 917);
    return cats.map((c) => (c === other ? move : c === carrier && onLedge(carrier) ? walk(carrier, Math.min(1080, wall.rect.x - 30)) : {}));
  }, 2400, 'other jumps onto the left ledge behind the wall'));
  // Follow the wall east onto lift A; both on it before the wall is home, so A sinks during its 90-tick wait.
  const onA = (c) => Math.abs(feet(c) - liftA.rect.y) <= 1.5 && cx(c) > liftA.rect.x && cx(c) < liftA.rect.x + liftA.rect.width;
  steps.push(() => until(() => onA(other) && onA(carrier), () => both(walk(carrier, Math.min(1400, wall.rect.x - 20)), walk(other, Math.min(1340, wall.rect.x - 60))), 400, 'both on lift A'));
  // 4. A sinks; the next sweep passes over them.
  steps.push(() => until(() => wall.rect.x + wall.rect.width < liftA.rect.x - 8, () => both(walk(carrier, 1400), walk(other, 1340)), 900, 'the wall passes over lift A'));
  // 5. With the pillar west of lift A, the other cat hops: while it is in the air only one body rests on the slab, so
  //    the lift climbs (FUN_7ff72bb64310 counts contacts), and it carries both back up to the ledge row.
  steps.push(() => until(() => liftA.rect.y <= 240.01 && onA(carrier), () => {
    if (onA(other) && other.grounded && jumpState[ci(other)] === 0) jumpNow(ci(other), 20);
    return both(walk(carrier, 1400), walk(other, 1340));
  }, 1200, 'hop lift A back up'));
  // 6. Both walk east past the pillar's home (1504) before it comes back.
  steps.push(() => until(() => cx(carrier) > 1600 && onLedge(carrier) && cx(other) > 1545 && onLedge(other),
    () => {
      if (onA(other) && other.grounded && jumpState[ci(other)] === 0 && liftA.rect.y > 241) jumpNow(ci(other), 20);
      return both(walk(carrier, 1610), walk(other, 1550));
    }, 400, 'both past the pillar home'));
  // 7. East along the ledge and down the stairs to the floor, then onto lift B (both), which rises 192.
  steps.push(() => until(() => feet(carrier) >= 431 && cx(carrier) > 2150 && feet(other) >= 431 && cx(other) > 2100,
    () => both(walk(carrier, 2160), walk(other, 2110)), 900, 'down the stairs'));
  const onB = (c) => Math.abs(feet(c) - liftB.rect.y) <= 1 && cx(c) > liftB.rect.x && cx(c) < liftB.rect.x + liftB.rect.width;
  steps.push(() => until(() => onB(carrier) && onB(other), () => {
    for (const c of [carrier, other]) if (!onB(c) && c.grounded && jumpState[ci(c)] === 0) jumpNow(ci(c), 20);
    return both(walk(carrier, 2380), walk(other, 2300));
  }, 400, 'both on lift B'));
  steps.push(() => until(() => liftB.rect.y <= 211.5, () => cats.map(() => ({})), 400, 'lift B up'));
  // 8. Jump east onto the goal ledge, carrier to the door: UP delivers the key, then both enter with UP.
  steps.push(() => until(() => onLedge(carrier) && onLedge(other) && cx(carrier) > 2600 && cx(other) > 2560, () => {
    for (const c of [carrier, other]) if (onB(c) && jumpState[ci(c)] === 0) jumpNow(ci(c), 20);
    return both(walk(carrier, 2616), walk(other, 2580));
  }, 400, 'onto the goal ledge'));
  // Whoever holds the key now delivers it (a cat touching a carried key takes it: FUN_7ff72bb657c0 steal rule; the
  // hop on lift A hands it over), at the door centre with UP; the other cat steps aside first.
  const holder = () => game.carriedKeys[0]?.player ?? carrier;
  steps.push(() => until(() => goal.opened, () => cats.map((c) => (c === holder()
    ? { ...walk(c, 2616), up: Math.abs(cx(c) - 2616) < 6 }
    : walk(c, cx(c) > cx(holder()) ? 2700 : 2530))), 300, 'deliver the key'));
  // Both enter: each walks into the door sensor (x 2592..2640) and holds UP.
  steps.push(() => until(() => !!stats.cleared, () => cats.map((c) => ({ ...walk(c, 2616, 14), up: true })), 300, 'both enter'));
  const ok = steps.every((s) => s());
  return { cleared: ok && cleared(), frames: frame, failedPhase, state: {
    cats: cats.map((c) => [Math.round(c.rect.x), Math.round(c.rect.y)]), wall: wall.rect.x, liftA: liftA.rect.y, liftB: liftB.rect.y } };
}
