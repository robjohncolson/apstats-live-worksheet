// 5-3 ALL FOR ONE (stage_majo02).
// The puzzle: one shared MajorityPlayer cat (majority-player), every button a party vote (start ceil(0.7 n) of n,
// keep half that ratio). At party 2 both players must press every button; the last player only helps to start one
// (majority-route.mjs), the first keeps it on alone.
// Route: hop the three single blocks over the first Thunder pit, ride UpDownLift 1 up to the StepEnemy platform's
// west bump and jump straight to its east bump, climb the big block, cross the tower while its UpDownEnemy is
// retracted, ride UpDownLift 2 up to the high ledge (top 96), walk onto the top block (top 144), drop off its east end
// and steer back under it onto the key ledge (top 288, key at 2496, 240), then drop off the ledge's west end and
// steer under it to the door (2448) on the floor below.

import { createMajorityRoute } from './majority-route.mjs';

export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const r = createMajorityRoute(api);
    const { game, cat } = r;
    const [lift1, lift2] = game.weightedLifts;
    const tower = game.upDownEnemies[0];

    // Single blocks (top 384) at x 288..336, 384..432, 528..576 over the first Thunder pit.
    r.walk(225);
    r.jumpTo(312, 'block 1');
    r.jumpTo(408, 'block 2');
    r.jumpTo(552, 'block 3');
    // UpDownLift 1 (x 661..779, top 267..419): hop on while it is low, ride it up.
    r.waitUntil(() => lift1.rect.y >= 410, 600, 'lift 1 low');
    r.jumpTo(720, 'onto lift 1');
    r.waitUntil(() => lift1.rect.y <= 268, 600, 'lift 1 high');
    // The StepEnemy platform (x 864..1104, top 336) has bumps (top 288) at both ends: bump to bump over the enemy.
    r.jumpTo(888, 'west bump');
    r.jumpTo(1080, 'east bump');
    // The big block: top 288 (x 1200..1344), 240 (1344..1392), 192 (1392..1584).
    r.jumpTo(1270, 'big block');
    r.jumpTo(1368, 'big block step 1');
    r.jumpTo(1440, 'big block step 2');
    // The tower (x 1680..1776, top 192): its UpDownEnemy (x 1700..1756) pokes up to 43 above the top. Cross it while
    // the enemy is hidden: onto the tower and straight off its east side to the block at x 1872..2016 (top 192).
    r.walk(1560);
    r.waitUntil(() => tower.rect.y >= 197, 900, 'tower enemy hidden');
    r.jumpTo(1728, 'onto the tower');
    r.jumpTo(1930, 'off the tower');
    // UpDownLift 2 (x 2101..2219, top 164..442): the block at x 2064..2112 (y 96..144) hangs over its west end, so
    // walk (no jump: the head would hit it) off the block onto the lift while it is a little lower, keep walking to
    // x 2160 (clear of both hanging blocks), ride it up and jump to the high ledge (x 2208..2304, top 96).
    r.walk(1995);
    r.waitUntil(() => lift2.rect.y >= 215 && lift2.rect.y <= 235 && lift2.velocity?.y !== 0, 900, 'lift 2 level');
    api.until(() => cat.grounded && r.centre() > 2125, () => r.all({ right: true }), 60, 'onto lift 2');
    r.walk(2160);
    r.waitUntil(() => lift2.rect.y <= 166, 600, 'lift 2 high');
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
