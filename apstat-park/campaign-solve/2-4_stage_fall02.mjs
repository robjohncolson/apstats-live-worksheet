// 2-4 GO TOGETHER (stage_fall02).
// Map (party 2): a ledge (top 288, x 48..960) holding two push boxes (451 and 551, 38 x 40) and a one-chip notch
// (624..672) holding a JumpStandEx (solid 632..664, top 288, launch (3, -18) per tick) on a Rect (322..370); a FallBox
// bridge (23 boxes, body top 288, x 960..2064) over a Thunder pit; a slab (top 288, x 2064..2352); the WeightedLift
// (2350.6..2544.6, top 288) between the slab and a roof (top 288, x 2544..2784) over the sunken room (floor 432,
// x 2112..2784, 96 high) that holds the Key (2216) under the slab and the door (2568) under the roof. Column 36
// (x 1728..1776) is solid from the top down to y 144: any stack taller than 144 is stopped there.
// The lift (lua flags {0, 4, 1} at party <= 2) needs 4 bodies at party 2: both cats and both push boxes (a box on a
// cat's head counts).
// Route:
// 1. Cat 1 hops over both boxes and the stand and waits on the ledge with its centre at 790. Cat 0 pushes both boxes
//    right (one cat pushes the pair): each box reaches the stand and is thrown up 258 and ~168 right, so box 551
//    lands on cat 1's head and box 451 on top of it (cat 1 + 2 boxes = 126 tall, clears the y-144 column by 18).
// 2. Cat 1 walks to 900; cat 0 walks onto the stand, is launched straight up and steered right onto the top of the
//    stack (feet 162). Both hold right: the carrier walks onto the bridge and cat 0 walks forward off the stack top,
//    dropping onto the bridge right in front of the carrier. From there they walk nose to tail (touching).
//    FallBox trap: a box drops 14 frames after the FRONT cat triggers it (trigger overlap 6..10.9), so the rear cat
//    survives only when the front cat's trigger came late enough (measured: overlap 6.6 survives, 6.5 drops the rear
//    cat). The phase set by step 2 (front cat at 1028.6 + 4.9 n) keeps every trigger >= 6.6 from box 1152 on; walking
//    the pair onto the bridge from the ledge instead puts box 1008 at 6.5 and the carrier falls.
// 3. On the slab cat 0 walks across the lift onto the roof, cat 1 walks fully onto the lift (3 of 4), then cat 0
//    steps back on: the lift sinks to the room floor. (Boarding with the 4th body only 1 px over the lift edge makes
//    the lift move the carried boxes but not their carrier: the boxes sink into the cat and fall off.)
// 4. In the room cat 1 (west of cat 0) walks under the slab to the key; cat 0 walks past the door to the room's
//    east end (the room is too low to hop a cat), cat 1 opens the door and enters, then cat 0.
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
    api.walkTo(1, 790, { tol: 1 });
    api.land(1);
    // Cat 0 pushes both boxes into the stand; they land stacked on cat 1's head.
    const onHead = () => game.pushBoxes.every((box) => box.rect.y < 210 && box.rect.x > 740);
    api.until(onHead, () => [{ right: api.centreX(cats[0]) < 590 }, {}], 400, 'the stand did not throw both boxes onto cat 1');
    api.wait(20);
    if (!game.pushBoxes.every((box) => Math.abs(box.rect.y + box.rect.height - 242) < 41)) {
      api.block('the push boxes did not settle on cat 1\'s head');
    }
    // 2. Cat 0 rides the stand up onto the stack top, then the pair crosses the bridge nose to tail.
    api.walkTo(1, 900, { tol: 2 });
    api.until(() => cats[0].grounded && api.feetY(cats[0]) < 170, () => [{ right: true }, {}], 300,
      'cat 0 did not land on top of the stack');
    api.until(() => api.centreX(cats[1]) > 2300, () => {
      const fell = cats.find((cat) => cat.rect.y > 300);
      if (fell) api.block(`cat ${cats.indexOf(fell)} fell through the FallBox bridge at x ${Math.round(fell.rect.x)}`);
      return [{ right: true }, { right: true }];
    }, 400, 'the pair did not cross the bridge');
    if (game.pushBoxes.some((box) => box.rect.y > 210)) api.block('a push box slid off cat 1 on the bridge');
    // 3. Cat 0 to the roof, cat 1 fully onto the lift, cat 0 back on: 4 bodies.
    api.walkTo(0, 2590, { tol: 3, max: 200 });
    api.walkTo(1, 2440, { tol: 3, max: 200 });
    api.walkTo(0, 2495, { tol: 3, max: 200 });
    api.until(() => lift.rect.y > 430, [], 300, () => `the lift did not sink (top ${lift.rect.y}, sign ${lift.signText?.text})`);
    api.land();
    // 4. Cat 1 to the key under the slab; then the door.
    api.walkTo(1, 2232, { tol: 3, max: 300 });
    if (api.carrierOfKey() < 0) api.block('nobody picked up the key');
    // Cat 0 clears the way to the far side of the door (the 96-high room is too low to hop a cat), then the key
    // carrier opens the door and both enter.
    api.walkTo(0, 2720, { tol: 4, max: 200 });
    api.enterOne(1);
    api.enterGoal();
  },
};
