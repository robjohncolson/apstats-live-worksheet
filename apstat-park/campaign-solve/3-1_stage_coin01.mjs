// 3-1 TIME LIMIT (stage_coin01).
// The puzzle (party 2): collect all 69 Coins before the 65 s DeadTimer runs out; the CoinObserver then shows the Key
// (x 848..880, y 116..172, over the central pit). The upper floor (top 240) has a pit in the middle (x 720..1008)
// over a stepped pyramid (tops 384 / 336 / 288) that stands on the lower floor (top 432). Upper coins hang in three
// rows (y 84..108, 132..156, 180..204): a walking cat takes the low row, a jump the middle row, and only a cat
// jumping from another cat's head reaches the top row. Lower coins: a walking cat takes the y 372..396 row, a jump
// the 324..348 row. The door is on the lower floor at the east end.
// Route: cat 1 drops into the pit and climbs the pyramid to the upper-west floor. Cat 0 rides cat 1's head while
// cat 1 walks west, jumping at every coin column; back at the pit edge cat 0 leaps east from the head through the
// over-pit coin, into the pit. Cat 1 follows; on the pyramid top cat 0 jumps from cat 1's head for the three middle
// coins, then each cat leaps sideways off the pyramid top through the low over-pit coins. Both go up to the
// upper-east floor and sweep it the same way (ending with cat 0's leap west through the last over-pit coin). Then
// the lower floor: cat 0 sweeps the west half, cat 1 the east half; the Key appears; a cat jumps for it from the
// pyramid top; both enter the door.
// Native 3 px/tick: the climbs between the pyramid's 288 tier and the upper floors (48 up, 96 across) only work from
// the tier's end (the jump is >= 48 up only from tick 8 to 27, dx 24..81); the route clears at ~frame 3400 of the
// 3900-frame (65 s) DeadTimer.
// NOTE: this stage maps cat 0 to input slot 1 and cat 1 to slot 0 (Player row "1" faces left, p0 = 1); the driver
// places each cat's buttons in its slot, so specs here are in cat order.
export default {
  party: 2,
  budget: 4200,
  async solve(stage, api) {
    const { cats, game } = api;
    const timer = game.deadTimers[0];
    const [A, B] = cats;   // A (cat 0) rides, B (cat 1) carries
    const cx = api.centreX, feet = api.feetY;
    const coinsLeft = () => game.coins.filter((coin) => !coin.collected);
    const timeUp = () => { if (timer.expired) api.block(`the DeadTimer ran out at frame ${api.frame} with ${coinsLeft().length} coins left`); };
    // --- helpers --------------------------------------------------------------------------------------------
    const toSlots = (specs) => specs;   // cat order (the driver maps cats to slots)
    const until = (pred, fn, max, label) => api.until(pred, (i) => { timeUp(); return toSlots(fn(i)); }, max, label);
    const dir = (cat, x, tol = 2) => (Math.abs(x - cx(cat)) <= tol ? {} : x > cx(cat) ? { right: true } : { left: true });
    function walk(i, x, { tol = 3, max = 900, hop = false } = {}) {
      const cat = cats[i];
      const side = Math.sign(x - cx(cat));
      let lastX = cat.rect.x, still = 0, hopT = 0;
      until(() => Math.abs(x - cx(cat)) <= tol || Math.sign(x - cx(cat)) !== side, () => {
        still = Math.abs(cat.rect.x - lastX) < 0.01 && cat.grounded ? still + 1 : 0;
        lastX = cat.rect.x;
        if (still > 90) api.block(`cat ${i} stalled walking to ${x} at ${JSON.stringify(api.snapshot()[i])}`);
        if (hop && still > 1 && hopT === 0) hopT = 16;
        const jump = hopT > 2; if (hopT > 0) hopT--;
        const specs = [{}, {}]; specs[i] = { ...(side > 0 ? { right: true } : { left: true }), jump };
        return specs;
      }, max, `cat ${i} walking to ${x}`);
    }
    function jumpTo(i, x, { holdJump = 16, max = 150 } = {}) {
      const cat = cats[i];
      land(i);
      let air = false, f = 0;
      until(() => air && cat.grounded, () => {
        if (!cat.grounded) air = true;
        const specs = [{}, {}]; specs[i] = { jump: f++ < holdJump, ...dir(cat, x) };
        return specs;
      }, max, `cat ${i} jumping to ${x}`);
    }
    function land(i) { api.until(() => cats[i].grounded, [], 240, `cat ${i} never landed`); }
    const onHead = () => A.grounded && Math.abs(feet(A) - B.rect.y) < 1.5 && Math.abs(A.rect.x - B.rect.x) < 30;
    // Cat 0 jumps onto cat 1's head from 56 to the side: it closes in only once its feet are above the head.
    function climbOnto() {
      const side = Math.sign(cx(A) - cx(B)) || -1;
      walk(0, cx(B) + side * 56, { tol: 3 });
      let air = false, f = 0;
      until(() => air && A.grounded, () => {
        if (!A.grounded) air = true;
        const dx = cx(B) - cx(A);
        const move = Math.abs(dx) <= 2 ? {} : (feet(A) <= B.rect.y + 1 || Math.abs(dx) > 40) ? (dx > 0 ? { right: true } : { left: true }) : {};
        return [{ jump: f++ < 16, ...move }, {}];
      }, 150, 'cat 0 could not jump onto cat 1');
      if (!onHead()) api.block('cat 0 landed beside cat 1 instead of on its head');
    }
    // Cat 1 walks to x carrying cat 0, then cat 0 jumps straight up from the head and lands back on it.
    function stackJumpAt(x) {
      walk(1, x, { tol: 2 });
      until(() => B.grounded, () => [{}, {}], 30, 'cat 1 not standing');
      let air = false, f = 0;
      until(() => air && A.grounded, () => {
        if (!A.grounded) air = true;
        return [{ jump: f++ < 16 }, {}];
      }, 90, 'cat 0 did not land back after a head jump');
      if (!onHead()) api.block('cat 0 fell off the head of cat 1 at x ' + x);
    }
    // --------------------------------------------------------------------------------------------------------------
    // 1. Cat 1 drops into the pit, climbs the pyramid and jumps up onto the upper-west floor.
    walk(1, 990);
    land(1);
    walk(1, 850, { hop: true });
    // Native 3 px/tick: a jump is >= 48 up only from tick 8 (dx 24) to tick 27 (dx 81), so take off with the left
    // edge in 784..801 (centre ~808, still on the 816..912 tier) to clear the upper floor's edge at 720.
    walk(1, 808, { tol: 2 });
    jumpTo(1, 700);
    if (feet(B) > 241) api.block('cat 1 did not get back up onto the upper-west floor: ' + JSON.stringify(api.snapshot()[1]));
    // 2. Upper-west: cat 0 climbs onto cat 1 at the pit edge, then the sweep west.
    walk(1, 702, { tol: 2 });
    climbOnto();
    for (const x of [696, 600, 528, 456, 384, 312, 240, 168, 96]) stackJumpAt(x);
    // Back to the edge; cat 0 leaps east from the head through the coin over the pit (756..780, 84..108).
    walk(1, 702, { tol: 2 });
    jumpTo(0, 772);
    land(0);
    // 3. Cat 1 follows into the pit; cat 1 stands on the pyramid top (816..912, top 288), cat 0 climbs its head and
    // jumps for the three middle coins (816, 864, 912 at y 132..156).
    walk(1, 760);
    land(1);
    walk(1, 880, { hop: true, tol: 2 });
    land(1);
    walk(1, 880, { tol: 2 });
    walk(0, 826, { hop: true, tol: 2 });
    land(0);
    climbOnto();
    for (const x of [864, 900, 828]) stackJumpAt(x);
    // 4. Up to the upper-east floor (edge 1008): cat 0 jumps off the head first, then cat 1.
    // Native 3 px/tick: take off from the tier's east end (centre ~922, right edge in 927..944) so the jump is
    // >= 48 up when it crosses the upper floor's edge at 1008 (mirror of step 1).
    walk(1, 922, { tol: 2 });
    jumpTo(0, 1100);
    walk(0, 1110);   // out of cat 1's landing spot at the edge
    jumpTo(1, 1030);
    walk(1, 1026, { tol: 2 });
    climbOnto();
    for (const x of [1026, 1056, 1128, 1200, 1272, 1344, 1416, 1488, 1560, 1632]) stackJumpAt(x);
    // Back to the edge; cat 0 leaps west from the head through the last over-pit coin (948..972, 84..108).
    walk(1, 1026, { tol: 2 });
    jumpTo(0, 958);
    land(0);
    // 5. Lower floor, both cats at once (a program of steps per cat): cat 0 sweeps the west half (walk the low row,
    // jump at each high-row coin) and waits west of the pyramid; cat 1 drops into the pit, runs east along the low
    // row, sweeps the high row coming back west, climbs the pyramid and jumps for the Key (848..880, 116..172) as
    // soon as the last coin is taken.
    const programs = [
      [['walk', 700, true], ['land'], ...[672, 528, 384, 240, 96].flatMap((x) => [['walk', x], ['jump', x]]), ['walk', 600]],
      [['walk', 990], ['land'], ['walk', 1100, true], ['land'], ['walk', 1640],
        ...[1632, 1488, 1344, 1200, 1056].flatMap((x) => [['walk', x], ['jump', x]]),
        ['walk', 880, true], ['land'], ['walk', 864], ['waitCoins'], ['jump', 864], ['land']],
    ];
    const state = cats.map(() => ({ step: 0, f: 0, air: false, lastX: NaN, still: 0, hopT: 0 }));
    const runProgram = (i) => {
      const prog = programs[i], st = state[i], cat = cats[i];
      while (st.step < prog.length) {
        const [kind, x, hop] = prog[st.step];
        const next = () => { st.step++; st.f = 0; st.air = false; st.still = 0; st.hopT = 0; };
        if (kind === 'land') { if (cat.grounded) { next(); continue; } return {}; }
        if (kind === 'waitCoins') { if (!coinsLeft().length) { next(); continue; } return {}; }
        if (kind === 'walk') {
          if (Math.abs(x - cx(cat)) <= 2.5) { next(); continue; }
          st.still = Math.abs(cat.rect.x - st.lastX) < 0.01 && cat.grounded ? st.still + 1 : 0;
          st.lastX = cat.rect.x;
          if (st.still > 90) api.block(`cat ${i} stalled walking to ${x} at ${JSON.stringify(api.snapshot()[i])}`);
          if (hop && st.still > 1 && st.hopT === 0) st.hopT = 16;
          const jump = st.hopT > 2; if (st.hopT > 0) st.hopT--;
          return { ...dir(cat, x, 2.5), jump };
        }
        if (kind === 'jump') {
          if (st.f === 0 && !cat.grounded) return {};
          if (!cat.grounded) st.air = true;
          if (st.air && cat.grounded) { next(); continue; }
          return { jump: st.f++ < 16, ...dir(cat, x) };
        }
      }
      return null;
    };
    until(() => state.every((st, i) => st.step >= programs[i].length), () => cats.map((_, i) => runProgram(i) || {}), 2400, 'the lower-floor sweep did not finish');
    if (coinsLeft().length) {
      api.block(`${coinsLeft().length} coins left after the sweep: ` + coinsLeft().map((c) => `${Math.round(c.rect.x + 12)},${Math.round(c.rect.y + 12)}`).join(' '));
    }
    if (api.carrierOfKey() !== 1) api.block('the key did not appear or was not reached from the pyramid top');
    // 6. Both to the door (1608..1656, lower floor): cat 1 (the carrier) leads and opens it, both enter.
    const goal = game.goals[0];
    const gx = goal.rect.x + goal.rect.width / 2;
    walk(1, 1100);   // down the pyramid's east steps (no hop, or it would jump up onto the upper floor)
    land(1);
    let f = 0;
    const hopT = [0, 0], still = [0, 0];
    until(() => api.cleared, () => {
      f++;
      return cats.map((cat, i) => {
        if (game.goalClearedPlayers?.has(cat)) return {};   // entered: hidden and bodiless; no UP (it would come back out)
        // Cat 1 (the carrier) stands in the door centre; cat 0 waits west, then squeezes into the west half.
        const target = i === 1 ? gx : goal.opened ? gx - 16 : gx - 70;
        const near = Math.abs(target - cx(cat)) <= 6;
        // Blocked by a step: hold jump for 14 frames.
        still[i] = cat.grounded && Math.abs(cat.velocity.x) < 1 && !near ? still[i] + 1 : 0;
        const besideCat = cats.some((other) => other !== cat && Math.abs(other.rect.x - cat.rect.x) < 34 && Math.abs(feet(other) - feet(cat)) < 4);
        if (hopT[i] === 0 && still[i] > 3 && !besideCat) hopT[i] = 16;
        const jump = hopT[i] > 2; if (hopT[i] > 0) hopT[i]--;
        const inDoor = (i === 1 || goal.opened) && cat.rect.x < goal.rect.x + goal.rect.width && goal.rect.x < cat.rect.x + cat.rect.width;
        return { ...dir(cat, target, 6), up: (near || inDoor) && f % 2 === 0, jump };
      });
    }, 900, () => `at the door but no clear (door opened ${goal.opened})`);
  },
};
