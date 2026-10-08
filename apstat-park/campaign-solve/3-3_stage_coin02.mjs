// 3-3 TIME LIMIT (stage_coin02).
// The puzzle (party 2, one screen): collect all 53 Coins before the 40 s DeadTimer runs out; the CoinObserver then
// shows the Key over the middle of the floor, where the door is. The floor is lined with JumpStands (p0 -24: a
// bounce peaks ~415 above the floor) except for the middle (x 576..704). Four rows of coins hang above the stands in
// alternating columns (rows 318/478 at x 50 + 128k, rows 398/558 at x 114 + 128k): a cat bouncing in a column takes
// both of its coins. Small pegs (top 256) stand at x 160 / 288 / 416 / 544 / 704 / 832 / 960 / 1088; two BlinkBlocks
// (top 161, solid about 1 s in 2) sit beside the middle pegs; high platforms (top 128, x 192..416 and 864..1088)
// carry 8 coins; 5 more hang at y 138..162 (two at each wall, one in the middle).
// Route: cat 1 jumps from its peg onto cat 0's head (peg 544), onto the west BlinkBlock, along the west platforms
// (4 coins) and back over the BlinkBlock to peg 544; meanwhile cat 0 hops over to peg 704. Cat 1 jumps onto cat 0's
// head again, onto the east BlinkBlock, along the east platforms (4 coins), down to peg 1088, leaps east through the
// two wall coins and bounces the east columns, landing on the middle floor. Cat 0 leaps west from peg 704 through
// the middle coin, bounces the west columns, lands on peg 160, leaps west through the two west wall coins, bounces
// back east and comes down the middle column (no stand under it) onto the middle floor. The Key appears; cat 1 hops
// onto the first east stand and steers its bounce west, down through the Key; both enter.
export default {
  party: 2,
  budget: 2400,
  async solve(stage, api) {
    const { cats, game } = api;
    const slots = game.playerInputSlots;
    const timer = game.deadTimers[0];
    const cx = api.centreX, feet = api.feetY;
    const [west, east] = game.blinkBlocks.slice().sort((a, b) => a.rect.x - b.rect.x);
    const coinsLeft = () => game.coins.filter((coin) => !coin.collected);
    const listLeft = () => coinsLeft().map((c) => `${Math.round(c.rect.x + 12)},${Math.round(c.rect.y + 12)}`).join(' ');
    const dir = (cat, x, tol = 2) => (Math.abs(x - cx(cat)) <= tol ? {} : x > cx(cat) ? { right: true } : { left: true });
    // --- per-cat programs, run side by side ------------------------------------------------------------------------
    // Steps: ['walk', x] | ['jump', x] (jump, steer to x, until landed) | ['onto', other] (jump onto the other cat's
    // head: close in only once above it) | ['solid', block] (wait until the BlinkBlock is early in a solid phase) |
    // ['bounce', x] (steer to column x through one full JumpStand bounce) | ['leap', x] (jump off a peg toward x, down
    // to the stands) | ['peg', x] (steer a bounce onto the peg at x) | ['wait', fn] | ['land'].
    function makeRunner(i, program) {
      const cat = cats[i];
      const st = { step: 0, f: 0, air: false, lastX: NaN, still: 0, high: false, solidFor: 0 };
      const next = () => { st.step++; st.f = 0; st.air = false; st.still = 0; st.high = false; };
      return {
        get done() { return st.step >= program.length; },
        get where() { return st.step < program.length ? JSON.stringify(program[st.step]) : 'done'; },
        spec() {
          for (let guard = 0; guard < 4 && st.step < program.length; guard++) {
            const [kind, arg] = program[st.step];
            if (kind === 'land') { if (cat.grounded) { next(); continue; } return {}; }
            if (kind === 'wait') { if (arg()) { next(); continue; } return {}; }
            if (kind === 'walk') {
              if (Math.abs(arg - cx(cat)) <= 2.5) { next(); continue; }
              st.still = Math.abs(cat.rect.x - st.lastX) < 0.01 && cat.grounded ? st.still + 1 : 0;
              st.lastX = cat.rect.x;
              if (st.still > 60) api.block(`cat ${i} stalled walking to ${arg}: ${JSON.stringify(api.snapshot()[i])}`);
              return dir(cat, arg, 2.5);
            }
            if (kind === 'solid') {
              // Go while the block is solid and at most 0.3 s into its 1 s solid phase.
              if (arg.solid && arg.elapsed <= 0.3) { next(); continue; }
              return {};
            }
            if (kind === 'jump' || kind === 'onto') {
              if (st.f === 0 && !cat.grounded) return {};
              if (!cat.grounded) st.air = true;
              if (st.air && cat.grounded) {
                if (kind === 'onto' && Math.abs(feet(cat) - cats[arg].rect.y) > 2) {
                  api.block(`cat ${i} missed the head of cat ${arg}: ${JSON.stringify(api.snapshot())}`);
                }
                next(); continue;
              }
              if (st.f++ > 160) api.block(`cat ${i} stuck in ${JSON.stringify(program[st.step])}`);
              if (kind === 'jump') return { jump: st.f < 17, ...dir(cat, arg) };
              const other = cats[arg];
              const dx = cx(other) - cx(cat);
              const move = Math.abs(dx) <= 2 ? {} : (feet(cat) <= other.rect.y - 1 || Math.abs(dx) > 40) ? (dx > 0 ? { right: true } : { left: true }) : {};
              return { jump: st.f < 17, ...move };
            }
            if (kind === 'leap') {   // jump off a peg toward x; done once back down among the stands
              if (feet(cat) > 600) { next(); continue; }
              if (st.f++ > 160) api.block(`cat ${i} stuck in ${JSON.stringify(program[st.step])}`);
              return { jump: st.f < 17, ...dir(cat, arg) };
            }
            if (kind === 'launch') {   // jump onto the JumpStand at x; done once launched upward
              if (st.f > 3 && feet(cat) < 420) { next(); continue; }
              if (st.f++ > 120) api.block(`cat ${i} was not launched by the JumpStand at ${arg}`);
              return { jump: st.f < 17, ...dir(cat, arg) };
            }
            if (kind === 'peg') {    // steer a bounce onto the peg at x
              if (cat.grounded && feet(cat) < 260) { next(); continue; }
              if (st.f++ > 200) api.block(`cat ${i} could not land on the peg at ${arg}: ${JSON.stringify(api.snapshot()[i])}`);
              return feet(cat) < 250 || cx(cat) > arg + 40 || cx(cat) < arg - 40 ? dir(cat, arg, 1) : {};
            }
            if (kind === 'bounce') {
              // Past the apex (a bounce under a peg tops out early, at feet ~335).
              if (!cat.grounded && cat.velocity.y > 0 && feet(cat) < 400) st.high = true;
              if (st.high && feet(cat) > 600) { next(); continue; }
              if (st.f++ > 200) api.block(`cat ${i} is not bouncing (step ${JSON.stringify(program[st.step])}): ${JSON.stringify(api.snapshot()[i])}`);
              return dir(cat, arg, 1);
            }
            throw new Error('unknown step ' + kind);
          }
          return {};
        },
      };
    }
    function run(programs, max, label) {
      const runners = programs.map((program, i) => makeRunner(i, program || []));
      api.until(() => runners.every((runner) => runner.done), () => {
        if (timer.expired) api.block(`the DeadTimer ran out at frame ${api.frame}; ${coinsLeft().length} coins left: ${listLeft()}`);
        const specs = runners.map((runner) => runner.spec());
        const out = []; specs.forEach((spec, i) => { out[slots[i]] = spec; });
        return out;
      }, max, () => `${label}: ${runners.map((runner, i) => `cat ${i} at ${runner.where}`).join('; ')}`);
    }
    const headFree = (i) => () => !cats.some((other, j) => j !== i && Math.abs(feet(other) - cats[i].rect.y) < 2 && Math.abs(other.rect.x - cats[i].rect.x) < 30);
    // --------------------------------------------------------------------------------------------------------------
    // 0. Both land on their pegs (cat 0 on 544..576, cat 1 on 704..736).
    run([[['land']], [['land']]], 60, 'landing');
    // 1. Cat 1 jumps from its peg onto cat 0's head; up onto the west BlinkBlock; along the west platforms and back
    //    over the BlinkBlock to peg 544. Cat 0 hops over to peg 704 once cat 1 has left its head.
    run([
      [['wait', () => cats[1].rect.x < 470], ['jump', 720]],
      [['onto', 0], ['solid', west], ['jump', 494], ['jump', 400], ['walk', 336], ['jump', 270], ['walk', 206],
        ['walk', 270], ['jump', 336], ['walk', 400], ['solid', west], ['jump', 494], ['jump', 560]],
    ], 900, 'west platforms');
    // 2. Cat 1 onto cat 0's head (peg 704), onto the east BlinkBlock, along the east platforms, off their east end onto
    //    peg 1088, then a leap east through the two wall coins (1154 / 1218, y 138..162) down onto the stands, and the
    //    east columns. Cat 0, once its head is free, leaps west through the middle coin (628..652) and bounces the
    //    west columns, ending on peg 160 with a leap west through the two west wall coins.
    const eastColumns = [1202, 1138, 1074, 1010, 946, 882, 818, 754, 690].map((x) => ['bounce', x]);
    const westColumns = [562, 498, 434, 370, 306, 242, 178, 114, 50].map((x) => ['bounce', x]);
    run([
      [['wait', () => cats[1].grounded && feet(cats[1]) < 170], ['wait', headFree(0)], ['jump', 516], ['walk', 515],
        ...westColumns, ['peg', 176], ['walk', 176], ['leap', 20],
        // back east over the stands and down the middle column (614..638: rows 398 / 558) onto the middle floor
        ['bounce', 200], ['bounce', 380], ['bounce', 515], ['bounce', 630], ['land']],
      [['onto', 0], ['solid', east], ['jump', 786], ['jump', 880], ['walk', 944], ['jump', 1010], ['walk', 1112],
        ['land'], ['walk', 1104], ['leap', 1260], ...eastColumns, ['land']],
    ], 1600, 'east platforms and columns');
    if (coinsLeft().length) api.block(`${coinsLeft().length} coins left: ${listLeft()}`);
    // 3. The Key (624..656, 478..534) over the middle floor: cat 1 hops onto the first east stand and steers its
    //    bounce back west so that it comes down through the Key onto the middle floor. Both enter.
    run([[], [['walk', 700], ['launch', 738], ['bounce', 640], ['land']]], 300, 'key run');
    if (api.carrierOfKey() < 0) api.block('the key was not taken');
    api.enterGoal({ max: 300 });
  },
};
