// 5-1 ALL FOR ONE (stage_majo01).
// The puzzle: one shared MajorityPlayer cat (majority-player). Every button is a vote over the party's input slots:
// it turns on when ceil(0.7 n) players hold it (party 2: both; party 3: all three) and stays on while half that
// ratio still holds it (party 2: one; party 3: two). So at party 2 BOTH players must press every button; the last
// player only helps to start one (majority-route.mjs), the others keep it on.
// Route: hop the first pit, climb the 2-step block while its UpDownEnemy is retracted, ride the UpDownLift up onto
// the long block, jump the StepEnemy, drop past the Rect pit (its Warp, x 1968..2352, hangs below the map since
// warp-sensor-top-left), jump the second Thunder pit to the key (2688, 336), come back and enter the door at 2400.
// The solver runs at any party size (api.n slots); party 2 is recorded.

import { createMajorityRoute } from './majority-route.mjs';

export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const r = createMajorityRoute(api);
    const { game, cat } = r;
    const enemy = game.upDownEnemies[0];
    const lift = game.weightedLifts[0];
    const stepEnemy = game.stepEnemies[0];

    // Pit 1 (x 432..480): a running jump.
    r.walk(380);
    r.jumpTo(560, 'pit 1');
    // The 2-step block (x 624..768): onto step 1 (top 384) at x 650, wait for the enemy (x 692..748) to retract
    // below the block top (336), then jump over it and land past x 768.
    r.walk(600);
    r.jumpTo(645, 'step 1');
    r.waitUntil(() => enemy.rect.y >= 340, 600, 'enemy retract');
    r.jumpTo(800, 'over the block');
    // UpDownLift (x 1189..1307, top 259..395): stand at the pit edge, hop on while it is low, ride it to the top.
    r.walk(1130);
    r.waitUntil(() => lift.rect.y >= 390, 600, 'lift low');
    r.jumpTo(1250, 'onto the lift');
    r.waitUntil(() => lift.rect.y <= 262, 600, 'lift high');
    r.jumpTo(1400, 'onto the long block');
    // StepEnemy patrols the block top (x 1591..1909) between the two bumps (x 1536..1584, 1920..1968; top 240).
    // Wait on bump 1 until it has turned at its east end, walk to meet it and jump over it, then hop bump 2.
    r.walk(1500);
    r.jumpTo(1560, 'onto bump 1');
    r.waitUntil(() => stepEnemy.rect.x >= 1850, 900, 'step enemy east end');
    r.waitUntil(() => stepEnemy.rect.x <= 1840, 120, 'step enemy turns');
    api.until(() => stepEnemy.rect.x - (cat.rect.x + cat.rect.width) <= 40, () => r.all({ right: true }), 200, 'meet the step enemy');
    r.jumpTo(stepEnemy.rect.x + 48 + 60, 'over the step enemy');
    r.walk(1880);
    r.jumpTo(2000, 'over bump 2');
    // The pit east of the block (x 2112..2232): drop off the block edge onto the Rect / floor below.
    r.walk(2090);
    r.jumpTo(2300, 'down past the Rect pit');
    // Pit 3 (x 2544..2592) with the Thunder under it: jump across, take the key with a jump under it.
    r.walk(2500);
    r.jumpTo(2660, 'pit 3');
    r.walk(2688);
    r.jumpTo(2688, 'key');
    r.walk(2640);
    r.jumpTo(2480, 'pit 3 back');
    r.enter();
  },
};
