// 6-2 PUSH OR JUMP (stage_auto_scroll01). Auto-scrolling stage.
// The puzzle: a WeightedLift (whole party) up onto a high block, a Rect stone over a Thunder pit, a second block,
// then a staircase-tower of eight 106 x 48 ColorBoxes (each 16 east of the one below; party-2 colours
// alternate 0,1,0,1,...: a box moves only for its colour's cat) standing before the 288-high goal block. The Key hangs
// east of the tower top.
// Route: lift, block, stone, block, down to the floor. Then "walk the tower" east: a cat standing on the tower's
// base box pushes the box above it off; the rest of the tower drops onto the pusher's head and rides it; the pusher
// walks off the base box's east end and the tower settles onto the pushed box, one box lower and ~150 further east.
// Cycle 1 (cat 1 pushes box 1) leaves box 7 right at the key's height and x: a cat climbs the treads and takes it.
// Cycles 2 (cat 0, box 2) and 3 (cat 1, box 3) were meant to bring the tower top next to the goal block (top 144)
// -- see the UNSOLVED note in the code: that part of the route was not found.
export default {
  party: 2,
  budget: 6000,
  async solve(stage, api) {
    const { cats, game } = api;
    const lift = game.weightedLifts[0];
    const boxes = game.pushBoxes;   // 0 = bottom .. 7 = top
    // 1. Both onto the lift (620..814, top 403); it rises 206 with two cats; then the block (816..1152, top 192).
    api.walkTo([0, 1], [540, 580]);
    api.jumpTo([0, 1], [700, 780]);
    api.until(() => lift.rect.y <= 197.5, [], 600, 'the lift did not rise with both cats');
    api.jumpTo([0, 1], [860, 920]);
    // 2. Stone (1244..1348, top 192) and the second block (1440..1680).
    // One cat at a time: from the block's east edge to the stone (gaps 92), then on to the block.
    for (const i of [1, 0]) {
      api.walkTo(i, 1134, { tol: 2 });
      api.jumpTo(i, 1268);
      if (api.feetY(cats[i]) > 193) api.block(`cat ${i} missed the stone`);
      api.walkTo(i, 1330, { tol: 2 });
      api.jumpTo(i, i === 1 ? 1520 : 1470);
    }
    // 3. Down to the floor west of the tower (box 0 at 1771).
    api.walkTo([0, 1], [1700, 1735], { max: 300 });
    api.land();
    const bottomOf = (box) => box.rect.y + box.rect.height;
    const settled = () => boxes.every((box) => !box.falling && Math.abs(box.velocityY || 0) < 1e-6);
    // One cycle: cat `pusher` hops onto the west tread of base box `base` and walks east, pushing box base + 1
    // off; the rest of the tower rides the pusher's head; it walks off the base box's east end and the tower
    // settles on the pushed box, which is now on the floor.
    const cycle = (pusher, base) => {
      const next = boxes[base + 1];
      api.jumpTo(pusher, next.rect.x - 17);
      if (Math.abs(api.feetY(cats[pusher]) - boxes[base].rect.y) > 2) api.block(`cat ${pusher} missed the tread of box ${base}`);
      const specs = () => { const s = [{}, {}]; s[pusher] = { right: true }; return s; };
      api.until(() => bottomOf(next) > 431 && api.feetY(cats[pusher]) > 431, specs, 300, `cat ${pusher} could not push box ${base + 1} off box ${base}`);
      api.until(() => settled() && boxes.slice(base + 2).every((box, k) => {
        const below = boxes[base + 1 + k];
        return Math.abs(bottomOf(box) - below.rect.y) < 1.5;
      }), [], 200, `the tower did not settle on box ${base + 1} after cycle ${base + 1}`);
    };
    // Climb the tower's west treads from box `from` up to the top box. A tread is the 11..16 px of a box not covered
    // by the box above. A cat touching the west face of a box of its colour pushes it, so each hop rises straight up
    // and only moves east once its feet are above the box it lands on, stopping 4 short of the next face.
    const climb = (who, from) => {
      const cat = cats[who];
      api.walkTo(who, boxes[from].rect.x - 20, { tol: 2 });
      for (let k = from; k < boxes.length; k++) {
        const box = boxes[k];
        const target = k + 1 < boxes.length ? boxes[k + 1].rect.x - 20 : box.rect.x + 40;
        let f = 0, left = false;
        api.until(() => left && cat.grounded, () => {
          const specs = [{}, {}];
          if (!cat.grounded) left = true;
          const dx = target - api.centreX(cat);
          const above = api.feetY(cat) < box.rect.y - 1;
          specs[who] = { jump: f < 16, ...(above && Math.abs(dx) > 1.5 ? (dx > 0 ? { right: true } : { left: true }) : {}) };
          f++;
          return specs;
        }, 120, `cat ${who} could not hop onto box ${k}`);
        if (Math.abs(api.feetY(cat) - box.rect.y) > 2) {
          api.block(`cat ${who} missed the tread of box ${k} (feet ${Math.round(api.feetY(cat))}, box top ${Math.round(box.rect.y)})`);
        }
      }
    };
    cycle(1, 0);
    // The top box now sits at the key's height (key 2096..2128, 68..124): cat 0 climbs and walks through it.
    climb(0, 0);
    api.walkTo(0, 2110, { tol: 3 });
    if (api.carrierOfKey() !== 0) api.block('cat 0 on the tower top did not take the key');
    // UNSOLVED beyond this point (solver, not runtime): cycle 1 leaves the pusher (cat 1) east of the tower, and a
    // cat cannot get back west (box 1 top and box 2 bottom touch: no gap to pass), so cycle 3 (box 3, colour 1)
    // has no pusher; cycle 2 alone moves the tower only ~15 east (box 3 lands across boxes 1 and 2), leaving its
    // top (144) ~290 short of the goal block. Colours here alternate 0,1,0,1,... (box k: k % 2).
    api.block('UNSOLVED: no party-2 route found from the key to the goal block (tower cycles stall ~2050; goal block at 2448)');
  },
};
