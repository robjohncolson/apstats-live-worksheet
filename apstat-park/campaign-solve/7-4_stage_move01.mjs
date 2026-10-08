// 7-4 MOVE AND STOP (stage_move01).
// The puzzle: a shared MoveEnergy meter drains 0.005 per tick while any cat moves and refills 0.01 per tick while
// all stand still; empty = every cat dies. Three StepEnemies patrol the floor between two bumps; a JumpStand (power
// -35) launches a cat onto a tall block (top 240) carrying a 120 x 96 PushBox (weight 100: the whole party); the
// Key hangs in a sunken gap east of the block; then steps down to the door.
// Route: move in short bursts and stand still to recharge; jump each StepEnemy; each cat jumps off the JumpStand
// onto the block; both push the box east off the block into the gap, where it lands as a step; drop onto the box
// (through the key), up the far side, down the steps to the door.
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
    function travel(targets, label) {
      const who = Object.keys(targets).map(Number);
      const jumpLeft = [0, 0];
      const lastX = cats.map((cat) => cat.rect.x);
      let resting = false;
      api.until(() => who.every((i) => Math.abs(api.centreX(cats[i]) - targets[i]) < 4 && cats[i].grounded), () => {
        alive(label);
        const grounded = cats.every((cat) => cat.grounded);
        if (meter.energy < 0.25 && grounded) resting = true;
        if (resting && meter.energy >= 0.999) resting = false;
        if (resting) return [{}, {}];
        const specs = [{}, {}];
        for (const i of who) {
          const cat = cats[i];
          const dx = targets[i] - api.centreX(cat);
          const ahead = enemies.some((enemy) => {
            const gap = dx > 0 ? enemy.rect.x - (cat.rect.x + 32) : cat.rect.x - (enemy.rect.x + enemy.rect.width);
            return gap > -20 && gap < 45 && Math.abs(enemy.rect.y + enemy.rect.height - api.feetY(cat)) < 30;
          });
          const stuck = Math.abs(cat.rect.x - lastX[i]) < 0.01 && Math.abs(dx) >= 4;
          lastX[i] = cat.rect.x;
          if (cat.grounded && jumpLeft[i] === 0 && (ahead || stuck)) jumpLeft[i] = 16;
          specs[i] = { ...(Math.abs(dx) < 4 ? {} : dx > 0 ? { right: true } : { left: true }), jump: jumpLeft[i] > 0 };
          if (jumpLeft[i] > 0) jumpLeft[i]--;
        }
        return specs;
      }, 1500, label);
      rest();
    }
    rest();
    travel({ 0: 1700, 1: 1760 }, 'along the floor past the StepEnemies');
    // Each cat stands on the JumpStand (1808..1840) and jumps: the stand launches it high; steer onto the block.
    for (const [i, x] of [[1, 2060], [0, 1990]]) {
      api.walkTo(i, 1824, { tol: 2 });
      // Hop straight up and land on the stand's top: that landing is the launch; then steer east onto the block.
      let launched = false;
      api.until(() => launched && cats[i].grounded, (f) => {
        if (api.feetY(cats[i]) < 330) launched = true;   // higher than any normal jump from the floor
        const specs = [{}, {}];
        const dx = x - api.centreX(cats[i]);
        specs[i] = { jump: f < 14, ...(launched && Math.abs(dx) > 3 ? (dx > 0 ? { right: true } : { left: true }) : {}) };
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
