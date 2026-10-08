// 2-4 GO TOGETHER (stage_fall02).
// Map (party 2): a ledge (top 288, x 48..960) holding two push boxes (451 and 551, 38 x 40) and a one-chip notch
// (624..672) holding a JumpStandEx (solid 632..664, top 288, launch (3, -18) per tick) on a Rect (322..370); a FallBox
// bridge (23 boxes, body top 288, x 960..2064) over a Thunder pit; a slab (top 288, x 2064..2352); the WeightedLift
// (2350.6..2544.6, top 288) between the slab and a roof (top 288, x 2544..2784) over the sunken room (floor 432,
// x 2112..2784, 96 high) that holds the Key (2216) under the slab and the door (2568) under the roof. Column 36
// (x 1728..1776) is solid from the top down to y 144: any stack taller than 144 is stopped there.
// The lift (lua flags {0, 4, 1} at party <= 2) needs 4 bodies at party 2: both cats and both push boxes (a box on a
// cat's head counts).
// Route (native 3/tick walk, 1/tick push; batch 10):
// 1. Cat 1 hops over both boxes and the stand and waits on the ledge with its centre at CATCH_X. Cat 0 pushes both
//    boxes right (one cat pushes the pair): each box reaches the stand and is thrown up 258 and ~168 right. Box 551
//    lands on cat 1's head; cat 1 then steps right SHIFT so box 451 lands BESIDE it: both boxes rest side by side on
//    the head (each overlapping it by ~16), stack height cat + box = 86.
// 2. Cat 0 walks onto the stand, is launched straight up and steered right onto the boxes (feet 202). The trio
//    (cat 1 + box + cat 0 = 132 tall) clears the y-144 column by 12 and crosses the FallBox bridge as ONE walking
//    body: a lone walker at 3/tick stays on the bridge (each box drops ~14 frames after it arms, behind the walker;
//    measured: a 1-tick pause every 20 still crosses, 2 ticks every 20 falls). Why not two walkers: a box drops 14
//    frames after the FRONT cat arms it, when a touching rear cat (32 behind) is still wholly on it -- at 3/tick
//    the rear cat always falls at the first box (it needed the 4.9/tick walk); and the old stacked pair (cat + box
//    + box + cat = 172) hits the column.
// 3. On the slab cat 0 steps back off the boxes to the west; cat 1 (boxes on its head, inside the lift shaft
//    2352..2544) walks onto the lift (3 of 4 bodies), then cat 0 boards from the west: 4 bodies, the lift sinks.
// 4. At the bottom the boxes end on the room floor overlapping cat 1 (measured: the lift top stops at 433, 1 below
//    the floor 432; the cat stays on the floor, its head boxes start falling and drop THROUGH it). The lift shaft
//    has no ceiling, so cat 1 hops up out of them to their west side. Cat 0 fetches the key under the slab; cat 1
//    pushes both boxes to the room's east wall (past the door) and waits east of the door; cat 0 opens the door
//    and enters, then cat 1. (The room is 96 high under the slab and the roof: nothing hops a cat or a box there.)
const CATCH_X = 760;   // box 551 lands at x ~760 (head 744..776: it overlaps the head by 16)
const SHIFT = 38;      // box 451 lands beside box 551, both on the head (measured: 30..48 all work)
const LIFT_X = 2470;   // boxes 2429..2508 stay inside the shaft (2352..2544)

export default {
  party: 2,
  budget: 3000,
  async solve(stage, api) {
    const { cats, game } = api;
    const lift = game.weightedLifts[0];
    // 1. Cat 1 over the boxes and the stand to the catch spot.
    api.walkTo(1, 400, { tol: 2 });
    api.jumpTo(1, 520);
    api.jumpTo(1, 720, { holdJump: 16 });
    api.land(1);
    api.walkTo(1, CATCH_X, { tol: 1 });
    api.land(1);
    // Cat 0 pushes both boxes into the stand. Box 551 (thrown first) lands on cat 1's head; cat 1 then steps right
    // SHIFT so box 451 lands BESIDE it (both resting on the head, side by side) instead of on top of it.
    const [box451, box551] = game.pushBoxes;
    const restsOnHead = (box) => Math.abs(box.rect.y + box.rect.height - cats[1].rect.y) < 1 && !box.falling;
    api.until(() => restsOnHead(box551), () => [{ right: api.centreX(cats[0]) < 590 }, {}], 400,
      'the stand did not throw box 551 onto cat 1');
    const target = api.centreX(cats[1]) + SHIFT;
    api.until(() => restsOnHead(box451) && api.centreX(cats[1]) >= target - 1, () => [{ right: api.centreX(cats[0]) < 590 },
      api.centreX(cats[1]) < target - 1 ? { right: true } : {}], 400, 'box 451 did not land beside box 551 on cat 1');
    api.wait(10);
    if (!game.pushBoxes.every(restsOnHead)) api.block('the push boxes did not settle side by side on cat 1 head: ' +
      JSON.stringify(game.pushBoxes.map((box) => box.rect)));
    // 2. Cat 0 rides the stand up onto the boxes (feet 202: cat 1 + box + cat 0 = 132 tall, under the y-144 column),
    //    then cat 1 carries the whole party across the bridge as one walking body.
    api.until(() => cats[0].grounded && api.feetY(cats[0]) < 210, () => [{ right: true }, {}], 300,
      'cat 0 did not land on top of the boxes');
    api.until(() => api.centreX(cats[1]) > 2240, () => {
      const fell = cats.find((cat) => cat.rect.y > 300);
      if (fell) api.block(`cat ${cats.indexOf(fell)} fell through the FallBox bridge at x ${Math.round(fell.rect.x)}`);
      if (game.pushBoxes.some((box) => !restsOnHead(box))) api.block('a push box slid off cat 1 on the bridge');
      return [{}, { right: true }];
    }, 600, 'the trio did not cross the bridge');
    // 3. On the slab cat 0 steps back off the boxes to the west; cat 1 (boxes on its head, inside the lift shaft
    //    2352..2544) walks onto the lift (3 of 4 bodies), then cat 0 boards from the west: 4 bodies, the lift sinks.
    api.walkTo(0, api.centreX(cats[1]) - 70, { tol: 3, max: 200 });
    api.land(0);
    api.walkTo(0, api.centreX(cats[1]) - 130, { tol: 3, max: 200 });
    api.walkTo(1, LIFT_X, { tol: 1, max: 300 });
    api.walkTo(0, 2385, { tol: 2, max: 300 });
    api.until(() => lift.rect.y > 430, [], 300, () => `the lift did not sink (top ${lift.rect.y}, sign ${lift.signText?.text})`);
    api.land();
    api.wait(30);
    // 4. Out of the boxes (west), key, boxes to the east wall, door.
    api.walkTo(0, 2232, { tol: 3, max: 300 });
    if (api.carrierOfKey() !== 0) api.block('cat 0 did not pick up the key under the slab');
    const boxesWest = Math.min(...game.pushBoxes.map((box) => box.rect.x));
    let f = 0;
    api.until(() => f > 4 && cats[1].grounded, () => {
      f++;
      return [{}, { jump: f < 14, left: api.feetY(cats[1]) < 390 && cats[1].rect.x + cats[1].rect.width > boxesWest - 2 }];
    }, 120, 'cat 1 could not hop out of the boxes');
    if (cats[1].rect.x + cats[1].rect.width > boxesWest + 1) api.block('cat 1 did not land west of the boxes');
    api.until(() => Math.max(...game.pushBoxes.map((box) => box.rect.x + box.rect.width)) >= 2783, [{}, { right: true }], 600,
      'cat 1 could not push the boxes to the room east wall');
    api.enterOne(0);
    api.enterGoal();
  },
};
