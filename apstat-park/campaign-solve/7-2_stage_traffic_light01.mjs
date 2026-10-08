// 7-2 MOVE AND STOP (stage_traffic_light01).
// The puzzle: a TrafficLight (green 10 s at first, then red 7 s / green 12 s): any cat moving during red dies.
// A staircase (first step x 960..1056, top 384) with a StepEnemy at its foot, a pit with a Warp, a field of 27
// JumpStands with the Key high above it, then a NormalBox (whole party push) and, behind a wall, the raised door
// ledge (x 3696..4008, top 264) with a SmallBox on it.
// StepEnemy (48 x 26, native walker): spawns at x 936 on the first step, walks west at 1 per tick from frame 0, drops
// to the floor at x ~906 (frame ~30) and keeps walking west toward the spawn (turns at walls; the floor pit at
// x 48..144 catches it). Side contact kills, its top is safe. It meets the cats around x ~810 at frame ~115.
// Route: both cats walk east and each makes a plain running jump over the enemy when it is < 36 ahead (26 tall:
// any jump clears it), then they gather at x 860 / 900. Up the stairs, over the pit, stop before the jump field for the
// red. Next green: bounce across the field (the key is taken on a bounce), push the NormalBox to the east wall;
// stop for the red. Next green: cat 0 climbs cat 1 -> NormalBox -> ledge, hops the SmallBox and pushes it off the
// ledge into the gap before the NormalBox; cat 1 climbs SmallBox -> NormalBox -> ledge; both enter.
// Notes: the route's later legs are paced by the light (waitForGreen), so the total frame count is set by the light
// cycle, not by leg 1. The NormalBox -> ledge jump (72 up, peak 78) only works holding west from the box's west end,
// sliding up the ledge face.
export default {
  party: 2,
  budget: 6000,
  async solve(stage, api) {
    const { cats, game } = api;
    const light = game.nativeTrafficLights[0];
    const red = () => light.phase === 1;
    // Start a leg only with enough green left; otherwise stand still through the red.
    function waitForGreen(needSeconds) {
      if (!red() && light.remaining > needSeconds) return;
      api.until(() => red(), [], 1000, 'light never turned red');
      api.until(() => !red(), [], 1000, 'light never turned green');
      api.wait(2);
    }
    const alive = (label) => {
      const dead = cats.findIndex((cat) => cat.deathTimer > 0);
      if (dead >= 0) api.block(`${label}: cat ${dead} died at ${JSON.stringify(api.snapshot()[dead])} (light ${red() ? 'red' : 'green'})`);
    };
    // Leg 1, first green: past the StepEnemy. It walks west at 1 per tick from frame 0, drops off the first step's
    // west end (x ~906) to the floor (top 406, 48 x 26) and keeps walking west toward the cats (turning at walls; the
    // floor pit at x 48..144 west of the spawn eventually swallows it). Each cat walks east and jumps it as it comes.
    const enemy = game.stepEnemies[0];
    const jumpLeft = [0, 0];
    api.until(() => [0, 1].every((i) => cats[i].grounded && cats[i].rect.x > enemy.rect.x + 52 && api.centreX(cats[i]) >= 860 + i * 40), () => {
      alive('jumping the StepEnemy');
      return [0, 1].map((i) => {
        const cat = cats[i];
        const gap = enemy.rect.x - (cat.rect.x + cat.rect.width);
        if (cat.grounded && jumpLeft[i] === 0 && gap > 0 && gap < 36) jumpLeft[i] = 14;
        const jump = jumpLeft[i] > 0;
        if (jumpLeft[i] > 0) jumpLeft[i]--;
        return { right: api.centreX(cat) < 860 + i * 40, jump };
      });
    }, 400, 'the cats could not get past the StepEnemy');
    alive('past the StepEnemy');
    // Up the stairs (tops 336 / 288 / 240) and over the pit (1344..1440) to the floor; stop at x ~1700.
    api.walkTo([0, 1], [1300, 1260], { hop: true, max: 300 });
    alive('stairs');
    api.walkTo([0, 1], [1740, 1690], { hop: true, max: 300 });
    alive('pit');
    // Leg 2: the jump field (1808..3088), key above x 2448; then push the NormalBox to the east wall.
    waitForGreen(7);
    api.walkTo([0, 1], [2500, 2448], { max: 400 });
    // Cat 1 jumps off the stand under the key (a stand jump peaks ~225 above the floor).
    api.until(() => api.carrierOfKey() >= 0, (f) => [{}, { jump: f < 16 }], 120, 'the stand jump under the key missed it');
    alive('jump field');
    api.walkTo([0, 1], [3270, 3230], { max: 400 });   // a landing on a stand bounces again: keep walking
    api.land();
    alive('past the field');
    // Leg 3: push the NormalBox (3312..3408, needs both cats) east to the wall (x 4176).
    waitForGreen(9);
    const normal = game.pushBoxes.find((box) => box.spawn.actorName === 'NormalBox');
    api.until(() => normal.rect.x + normal.rect.width >= 4170, [{ right: true }, { right: true }], 600, 'the NormalBox did not reach the east wall');
    alive('pushing the NormalBox');
    // Leg 4: climb. Both cats are in the gap between the ledge (ends 4008) and the box: cat 1 (west) is the step,
    // cat 0 (east) climbs it, then the box, then the ledge.
    waitForGreen(9);
    api.walkTo(1, 4024, { tol: 2 });
    api.climbOnto(0, 1, { from: api.centreX(cats[0]) });
    api.jumpTo(0, normal.rect.x + 40);
    api.jumpTo(0, 3960);
    alive('climbing to the ledge');
    if (Math.abs(api.feetY(cats[0]) - 264) > 2) api.block('cat 0 did not reach the door ledge');
    // Leg 5: cat 1 steps west under the ledge; cat 0 hops west over the SmallBox and pushes it east off the ledge.
    waitForGreen(7);
    const small = game.pushBoxes.find((box) => box.spawn.actorName === 'SmallBox');
    api.walkTo(1, 3850, { max: 200 });
    api.jumpTo(0, small.rect.x - 50);
    // Push only until the box is wholly past the ledge end (4008): it then drops straight into the 68-wide gap.
    api.until(() => small.rect.x > 4010, [{ right: true }, {}], 200, 'cat 0 could not push the SmallBox to the ledge end');
    api.until(() => small.rect.y + small.rect.height > 431 && !small.falling, [], 120, 'the SmallBox did not drop into the gap');
    api.walkTo(0, 3960);
    alive('SmallBox off the ledge');
    // Leg 6: cat 1 climbs SmallBox (top 384) -> NormalBox (top 336) -> ledge (top 264); both enter.
    waitForGreen(7);
    api.walkTo(1, small.rect.x - 40);
    api.jumpTo(1, small.rect.x + 24);
    if (Math.abs(api.feetY(cats[1]) - small.rect.y) > 2) api.block('cat 1 missed the SmallBox step');
    api.jumpTo(1, game.pushBoxes.find((box) => box.spawn.actorName === 'NormalBox').rect.x + 40);
    // Ledge top is 72 above the box (a full jump peaks 78 up): jump from the box's west end holding west; the cat
    // slides up the ledge face and steps onto it near the top of the jump.
    let up = false;
    api.until(() => up && cats[1].grounded, (f) => {
      if (!cats[1].grounded) up = true;
      return [{}, { jump: f < 16, left: true }];
    }, 90, 'cat 1 could not jump from the NormalBox onto the ledge');
    alive('cat 1 climbing to the ledge');
    if (Math.abs(api.feetY(cats[1]) - 264) > 2) api.block('cat 1 missed the ledge from the NormalBox: ' + JSON.stringify(api.snapshot()[1]));
    waitForGreen(5);
    api.enterGoal();
  },
};
