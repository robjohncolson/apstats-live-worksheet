// 7-4 MOVE AND STOP (stage_move01).
// The puzzle: a shared MoveEnergy meter drains 0.005 per tick while any cat moves and refills 0.01 per tick while
// all stand still; empty = every cat dies. Three StepEnemies patrol the floor between two bumps; a JumpStand (power
// -35; a solid 32x34 block at 1808..1840 that launches any cat resting on its top) launches a cat onto a tall block (top 240) carrying a 120 x 96 PushBox (weight 100: the whole party); the
// Key hangs in a sunken gap east of the block; then steps down to the door.
// Route: move in short bursts and stand still to recharge; jump each StepEnemy; each cat jumps off the JumpStand
// onto the block; both push the box east off the block into the gap, where it lands as a step; drop onto the box
// (through the key), up the far side, down the steps to the door.
// Native speeds (batch 10, walk 3/tick): a full meter is ~600 px of walking and a jump ~0.23 of it. The cats rest on
// the west bump (962..1008, top 384) until the two StepEnemies between the bumps walk west 100+ apart, then meet
// them head-on one at a time; they rest only grounded, under 0.4, keeping a jump in reserve.
export default {
  party: 2,
  budget: 6000,
  async solve(stage, api) {
    const { cats, game } = api;
    const meter = game.moveEnergies[0];
    const enemies = game.stepEnemies;
    const alive = (label) => {
      const dead = cats.findIndex((cat) => cat.deathTimer > 0);
      if (dead >= 0) api.block(`${label}: cat ${dead} died at ${JSON.stringify(api.snapshot()[dead])} (energy ${meter.energy.toFixed(3)})`);
    };
    const rest = () => api.until(() => meter.energy >= 0.999, [], 200, 'the meter did not refill');
    // Walk the listed cats east to their x, jumping any StepEnemy ahead and any step; rest when the meter runs low.
    // At the native 3 px/tick a full meter (200 moving ticks) covers ~600 px and a jump costs ~0.23, so the cats rest
    // (all grounded) once the meter is under REST_AT, keeping a reserve to jump an enemy that walks up to a resting
    // cat (it is jumped toward, i.e. over its back).
    const REST_AT = 0.4;
    function travel(targets, label) {
      const who = Object.keys(targets).map(Number);
      const jumpLeft = [0, 0];
      const jumpDir = [0, 0];
      const lastX = cats.map((cat) => cat.rect.x);
      const pushed = [false, false];   // the cat held a direction last tick (only then is "no x change" a wall)
      let resting = false;
      api.until(() => who.every((i) => Math.abs(api.centreX(cats[i]) - targets[i]) < 4 && cats[i].grounded), () => {
        alive(label);
        const grounded = cats.every((cat) => cat.grounded);
        if (meter.energy < REST_AT && grounded && jumpLeft.every((j) => j === 0)) resting = true;
        if (resting && meter.energy >= 0.999) resting = false;
        const specs = [{}, {}];
        for (const i of who) {
          const cat = cats[i];
          const dx = targets[i] - api.centreX(cat);
          // The nearest same-level enemy within 45 of the cat's front/back.
          const threat = enemies.find((enemy) => {
            if (Math.abs(enemy.rect.y + enemy.rect.height - api.feetY(cat)) >= 30) return false;
            const ahead = enemy.rect.x - (cat.rect.x + 32), behind = cat.rect.x - (enemy.rect.x + enemy.rect.width);
            return resting ? (ahead > -10 && ahead < 30) || (behind > -10 && behind < 30) : dx > 0 ? ahead > -20 && ahead < 45 : behind > -20 && behind < 45;
          });
          const stuck = !resting && pushed[i] && cat.grounded && Math.abs(cat.rect.x - lastX[i]) < 0.01 && Math.abs(dx) >= 4;
          lastX[i] = cat.rect.x;
          if (cat.grounded && jumpLeft[i] === 0 && (threat || stuck)) {
            jumpLeft[i] = 16;
            jumpDir[i] = threat ? Math.sign(threat.rect.x + threat.rect.width / 2 - api.centreX(cat)) || 1 : Math.sign(dx);
          }
          const airborne = jumpLeft[i] > 0 || !cat.grounded;
          const dir = airborne ? jumpDir[i] : resting || Math.abs(dx) < 4 ? 0 : Math.sign(dx);
          specs[i] = { ...(dir > 0 ? { right: true } : dir < 0 ? { left: true } : {}), jump: jumpLeft[i] > 0 };
          pushed[i] = dir !== 0;
          if (jumpLeft[i] > 0) jumpLeft[i]--;
          if (cat.grounded && jumpLeft[i] === 0) jumpDir[i] = Math.sign(dx);
        }
        return specs;
      }, 3000, label);
      rest();
    }
    rest();
    // The two StepEnemies between the bumps (1008..1488) bounce at 1/tick and keep crossing each other; a 3 px/tick
    // jump (~44 ticks, ~132 px) cannot clear two of them bunched together. Wait on top of the west bump (962..1008,
    // top 384, out of their reach) until both walk WEST, 100+ apart (centres): the cats then meet them head-on one at
    // a time (closing 4/tick), landing in the gap between them. The western enemy (spawn 888) falls into the floor pit.
    travel({ 0: 978, 1: 1012 }, 'to the west bump');
    const zone = enemies.filter((enemy) => enemy.rect.x > 1000);
    let prev = zone.map((enemy) => enemy.rect.x);
    api.until(() => {
      const west = zone.every((enemy, k) => enemy.rect.x < prev[k]);
      prev = zone.map((enemy) => enemy.rect.x);
      const xs = prev.slice().sort((a, b) => a - b);
      return west && xs[0] > 1150 && xs[1] - xs[0] >= 100 && meter.energy >= 0.999;
    }, [], 2000, 'the StepEnemies never spread out walking west');
    travel({ 0: 1700, 1: 1760 }, 'along the floor past the StepEnemies');
    // The JumpStand (1808..1840) is a solid 32x34 block (top 398): each cat walks up to its west face, hops onto its
    // top (resting there is the launch, straight up), then steers east onto the block.
    for (const [i, x] of [[1, 2060], [0, 1990]]) {
      api.walkTo(i, 1792, { tol: 2 });
      let launched = false;
      api.until(() => launched && cats[i].grounded, (f) => {
        if (api.feetY(cats[i]) < 330) launched = true;   // higher than any normal jump from the floor
        const specs = [{}, {}];
        const dx = (launched ? x : 1824) - api.centreX(cats[i]);
        specs[i] = { jump: f < 14, ...(Math.abs(dx) > 3 ? (dx > 0 ? { right: true } : { left: true }) : {}) };
        return specs;
      }, 400, `cat ${i} was not launched by the JumpStand`);
      alive('JumpStand launch');
      if (Math.abs(api.feetY(cats[i]) - 240) > 2) api.block(`cat ${i} did not land on the block from the JumpStand: ` + JSON.stringify(api.snapshot()[i]));
      rest();
    }
    // Both push the PushBox (2196..2316 on the block, weight 100) east until it drops off the block's end (2640).
    const box = game.pushBoxes[0];
    let resting = false;
    api.until(() => box.rect.x > 2642, () => {
      alive('pushing the box');
      if (meter.energy < 0.2) resting = true;
      if (resting && meter.energy >= 0.999) resting = false;
      return resting ? [{}, {}] : [{ right: true }, { right: true }];
    }, 1500, 'the box did not reach the end of the block');
    api.until(() => !box.falling && box.rect.y + box.rect.height >= 383, [], 120, () => 'the box did not land in the gap: ' + JSON.stringify(box.rect));
    rest();
    // Drop onto the box (top 288; the key hangs at 260..316 over it), then up to the far side (top 240).
    api.walkTo(1, box.rect.x + 80, { max: 200 });
    if (api.carrierOfKey() < 0) api.block('nobody took the key on the box');
    api.jumpTo(1, 2830);
    api.walkTo(0, box.rect.x + 40, { max: 200 });
    api.jumpTo(0, 2810);
    alive('over the gap');
    rest();
    // Down the steps to the floor and to the door (3456).
    travel({ 0: 3300, 1: 3360 }, 'down the steps');
    api.enterGoal();
  },
};
