// 6-2 PUSH OR JUMP (stage_auto_scroll01). Auto-scrolling stage (1 px/tick at N=2; cats left behind are not killed).
// Map: floor 432; WeightedLift 620..814 (rises 206 with both cats) to the block 816..1152 (top 192); Rect stone
// 1244..1348 (top 192) over the Thunder pit; second block 1440..1680; floor again; goal block x >= 2448, top 144
// (door 2904..2952 at y 114). Key 2096..2128, y 68..124.
// The puzzle: a pre-built leaning stair of eight ColorBoxes, bodies 102 x 44 (drawn 106 x 48, inset 2), box k at
// x 1773 + 16k (box 7 at 1887), settled top 80 (box 0 on the floor). Colours at N=2 alternate 0,1,0,1,...; a box
// moves only for its colour's cat (anywhere in the side-contact chain) and boxes resting on a pushed box ride it.
// Treads: 16 px of each box's top face west of the box above (18 under box 7).
// Route (party 2):
//  1. Both cats ride the lift up, cross the stone and the second block, and drop to the floor west of the stair.
//  2. Cat 1 climbs the west treads to the top box (box 7, top 80), standing on its east half.
//  3. Cat 0 (colour 0) pushes box 0 east ~477 from the floor; the whole stair rides it until box 6 (y 124..168)
//     meets the goal block face (2448). Box 7 rides on top: its bottom (124) is above the block top (144) and it
//     overhangs the block by 18. Cat 1, riding box 7 (head 34..80), passes through the key (x 2096..2128).
//  4. Cat 0 climbs the same treads (relative positions unchanged) onto box 7; both walk east off it onto the block
//     (a 20 drop) and enter the door.
export default {
  party: 2,
  budget: 6000,
  async solve(stage, api) {
    const { cats, game } = api;
    const lift = game.weightedLifts[0];
    const boxes = game.pushBoxes;   // 0 = bottom .. 7 = top
    const dbg = (m) => api.block(m + ' boxes ' + JSON.stringify(boxes.map((b) => [Math.round(b.rect.x * 10) / 10, Math.round(b.rect.y * 10) / 10])));
    // Jump straight up and only steer toward x once the feet are above `clear` (a colour-1 cat must not press a
    // colour-1 box face on the way up, or it slides that box and everything above it).
    const hop = (who, x, clear, label) => {
      const cat = cats[who];
      let f = 0, left = false;
      api.until(() => f > 2 && left && cat.grounded, () => {
        if (!cat.grounded) left = true;
        const dx = x - api.centreX(cat);
        const go = api.feetY(cat) <= clear && Math.abs(dx) > 1.5;
        const s = [{}, {}];
        s[who] = { jump: f < 16, ...(go ? (dx > 0 ? { right: true } : { left: true }) : {}) };
        f++;
        return s;
      }, 150, label || `cat ${who} hop to ${x}`);
    };
    // 1. Lift (both cats), block, stone, second block, down to the floor west of the stair.
    api.walkTo([0, 1], [540, 580]);
    api.jumpTo([0, 1], [700, 780]);
    // Ride up at the lift's east end (814): its top stops 4.6 below the block (192), a step a walk does not climb, and
    // a 3 px/tick jump from mid-lift falls back onto the sinking lift.
    api.walkTo([0, 1], [754, 792], { tol: 2 });
    api.until(() => lift.rect.y <= 197.5, [], 600, 'the lift did not rise with both cats');
    api.jumpTo([0, 1], [860, 920]);
    for (const i of [1, 0]) {
      api.walkTo(i, 1134, { tol: 2 });
      api.jumpTo(i, 1268);
      if (api.feetY(cats[i]) > 193) api.block(`cat ${i} missed the stone`);
      api.walkTo(i, 1330, { tol: 2 });
      api.jumpTo(i, i === 1 ? 1520 : 1470);
    }
    api.walkTo([0, 1], [1700, 1735], { max: 300 });
    api.land();
    // Climb the west treads (aim 4 short of the next box face) and finish on box 7 at endX().
    const climb = (who, endX) => {
      for (let k = 0; k < 7; k++) {
        const step = boxes[k], next = boxes[k + 1];
        hop(who, next.rect.x - 20, step.rect.y - 1);
        if (Math.abs(api.feetY(cats[who]) - step.rect.y) > 2) dbg(`cat ${who} missed the tread of box ${k}`);
      }
      hop(who, endX(), boxes[7].rect.y - 1);
      if (Math.abs(api.feetY(cats[who]) - boxes[7].rect.y) > 2) dbg(`cat ${who} missed box 7`);
    };
    // 2. Cat 1 to the top.
    climb(1, () => boxes[7].rect.x + 80);
    // 3. Cat 0 pushes the stair until box 6 touches the goal block.
    api.walkTo(0, boxes[0].rect.x - 30, { tol: 2 });
    api.until(() => boxes[6].rect.x + boxes[6].rect.width >= 2447.5, [{ right: true }, {}], 600, 'box 6 did not reach the goal block');
    api.wait(2);
    // 4. Cat 0 climbs; both step off box 7 onto the block and enter.
    climb(0, () => boxes[7].rect.x + 24);
    if (api.carrierOfKey() < 0) dbg('nobody took the key');
    api.walkTo([0, 1], [2500, 2540], { max: 300 });
    api.land();
    api.enterGoal();
  },
};
