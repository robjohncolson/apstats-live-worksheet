// 5-3 ALL FOR ONE (stage_majo02).
// The puzzle: one shared MajorityPlayer cat (majority-player), every button a party vote (start ceil(0.7 n) of n,
// keep half that ratio). At party 2 both players must press every button; the last player only helps to start one
// (majority-route.mjs), the first keeps it on alone.
// At the native 3 px/tick a level jump covers ~100: every 96 gap is jumped from its edge.
// Route: hop the three single blocks over the first Thunder pit, ride UpDownLift 1 up to the StepEnemy platform's
// west bump, jump the StepEnemy into the trough and hop up the east bump (bump to bump, 144, is out of reach), climb
// the big block, cross the tower while its UpDownEnemy is retracted, ride UpDownLift 2 up to the high ledge (top 96), walk onto the top block (top 144), drop off its east end
// and steer back under it onto the key ledge (top 288, key at 2496, 240), then drop off the ledge's west end and
// steer under it to the door (2448) on the floor below.

import { createMajorityRoute } from './majority-route.mjs';

export default {
  party: 2,
  budget: 6000,
  async solve(stage, api) {
    const r = createMajorityRoute(api);
    const { game, cat } = r;
    const [lift1, lift2] = game.weightedLifts;
    const tower = game.upDownEnemies[0];
    const stepEnemy = game.stepEnemies[0];

    // Single blocks (top 384) at x 288..336, 384..432, 528..576 over the first Thunder pit.
    r.walk(225);
    r.jumpTo(312, 'block 1');
    r.jumpTo(408, 'block 2');
    r.walk(422, { tol: 2 });   // block 2's east edge (432): the 96 gap is too wide for a 3 px/tick jump from mid-block
    r.jumpTo(552, 'block 3');
    r.walk(562, { tol: 2 });
    // UpDownLift 1 (x 661..779, top 267..419): hop on while it is low, ride it up.
    r.waitUntil(() => lift1.rect.y >= 410, 600, 'lift 1 low');
    r.jumpTo(720, 'onto lift 1');
    r.walk(758, { tol: 2 });   // the lift's east end (779) while it rises
    r.waitUntil(() => lift1.rect.y <= 268, 600, 'lift 1 high');
    // The StepEnemy platform (x 864..1104): bumps (top 288) at both ends, a trough (912..1056, top 336) between them
    // where the StepEnemy (48 x 26, top 310) patrols x 912..1056 at 1 px/tick. Bump to bump is 144: out of reach at
    // 3 px/tick (a level jump covers ~100). So: onto the west bump, wait at its east edge until the enemy has turned
    // at the west end, jump over it into the trough's east end and hop straight up onto the east bump.
    r.jumpTo(888, 'west bump');
    r.walk(920, { tol: 2 });
    r.waitUntil(() => stepEnemy.rect.x <= 914, 600, 'step enemy at the west end');
    r.waitUntil(() => stepEnemy.rect.x >= 916, 60, 'step enemy turns east');
    r.jumpTo(1040, 'over the step enemy into the trough');
    r.jumpTo(1080, 'east bump');
    // The big block: top 288 (x 1200..1344), 240 (1344..1392), 192 (1392..1584). Every 96 gap is jumped from the edge.
    r.walk(1094, { tol: 2 });
    r.jumpTo(1240, 'big block');
    r.walk(1326, { tol: 2 });
    r.jumpTo(1368, 'big block step 1');
    r.jumpTo(1440, 'big block step 2');
    // The tower (x 1680..1776, top 192), 96 from the big block and 96 from the next block (x 1872..2016, top 192):
    // its UpDownEnemy (x 1700..1756) cycles every ~545 ticks: top 199 (hidden) for ~125, rising 0.33/tick to 149,
    // up ~125, back down. Crossing (land, walk over, jump off) takes ~100 ticks at 3 px/tick, so start it the moment
    // the enemy sinks below the tower top (y >= 193 after having been up): ~165 hidden ticks remain.
    r.walk(1590, { tol: 2 });
    r.waitUntil(() => tower.rect.y <= 160, 900, 'tower enemy up');
    r.waitUntil(() => tower.rect.y >= 193, 600, 'tower enemy sinks');
    r.jumpTo(1700, 'onto the tower');
    r.walk(1780, { tol: 2 });
    r.jumpTo(1930, 'off the tower');
    // UpDownLift 2 (x 2101..2219) swings sinusoidally, top 157..449, period 300 (~3 px/tick mid-swing). The block at
    // x 2064..2112 (y 96..144) hangs over its west end, so the cat walks (no jump: the head would hit it) off the block
    // edge (2016) while the lift is low and rising (top ~405): it falls ~105 in the 18 ticks to reach the lift and
    // lands on it as it comes up, then walks on to x 2160 (clear of both hanging blocks) before the lift tops out,
    // moves to the lift's east end and jumps up the high ledge's face (x 2208..2304, top 96: 68 up of the 78 rise).
    r.walk(2008, { tol: 2 });
    let liftPrev = lift2.rect.y;
    r.waitUntil(() => {
      const rising = lift2.rect.y < liftPrev;
      liftPrev = lift2.rect.y;
      return rising && lift2.rect.y <= 410 && lift2.rect.y >= 395;
    }, 900, 'lift 2 low and rising');
    api.until(() => cat.grounded && r.centre() > 2125, () => r.all({ right: true }), 90, 'onto lift 2');
    r.walk(2160);
    r.waitUntil(() => lift2.rect.y <= 158, 600, 'lift 2 high');
    r.walk(2189, { tol: 1 });
    r.jumpTo(2256, 'high ledge');
    // The top block (x 2304..2544, top 144); drop off its east end and steer back west under it onto the key ledge
    // (x 2400..2544, top 288).
    // Only just off the edge (the cat stops the moment right is let go), then west once its head is under the block.
    api.until(() => cat.rect.x > 2544 && !cat.grounded, () => r.all({ right: true }), 200, 'off the top block');
    api.until(() => cat.grounded, () => r.all(cat.rect.y > 192.5 ? { left: true } : {}), 200, 'onto the key ledge');
    if (r.feet() > 290) api.block('missed the key ledge: landed at x ' + r.centre().toFixed(1) + ', feet ' + r.feet().toFixed(1));
    r.walk(2496);
    // Off the ledge's west end, then east under it to the door on the floor (x 2400..2496, top 432).
    api.until(() => !cat.grounded, () => r.all({ left: true }), 200, 'off the key ledge');
    api.until(() => cat.grounded, () => r.all(cat.rect.y > 336.5 ? { right: true } : {}), 200, 'down to the door');
    if (r.feet() > 434) api.block('missed the door floor: x ' + r.centre().toFixed(1));
    r.enter();
  },
};
