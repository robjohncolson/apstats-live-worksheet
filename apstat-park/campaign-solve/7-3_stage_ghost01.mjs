// 7-3 MOVE AND STOP (stage_ghost01).
// The puzzle: a Ghost that drifts after the cats whenever no cat faces it (it grabs a key within 100 of it and
// carries it; touching it kills). A WeightedLift (whole party) lifts the cats onto a long plateau (top 288); a
// floating StepEnemy over the plateau; a 2 x 2 red block (MC_DLU/DRU/DLD/DRD chips, x 1920..2016, y 240..336) that
// an UpDownEnemy pops out of; then a walled hut whose sealed room holds the Key (only the Ghost can reach it), the
// roof route over the hut to a platform, a drop to the lower floor and stairs up to the door.
// Intended route: ride the lift, jump the walking StepEnemy, cross the red block between the enemy's pops, lure the Ghost
// (all cats facing away) through the hut so it picks up the key, take the key from it while facing it, then over
// the hut, down and up the stairs to the door.
// Runtime finding (2026-10-08): the port reads the MC_D* chips as non-solid danger tiles (touching one kills), so
// the red block is a 96-wide kill pit sunk 48 into the plateau: crossing means staying above y 240 for 128 units of
// travel. One jump from the plateau stays above 240 for less than that; cat 0 gets over from cat 1's head, but cat 1
// is then left with no way across. This solver runs that and reports cat 1's best jump.
export default {
  party: 2,
  budget: 3000,
  blocker: 'MC_D* chips (7-3 red block under the UpDownEnemy): non-solid kill tiles in the port, so the second cat cannot cross',
  async solve(stage, api) {
    const { cats, game } = api;
    const lift = game.weightedLifts[0];
    const stepEnemy = game.stepEnemies[0];
    const ghost = game.ghosts[0];
    const alive = (label) => {
      const dead = cats.findIndex((cat) => cat.deathTimer > 0);
      if (dead >= 0) api.block(`${label}: cat ${dead} died at ${JSON.stringify(api.snapshot()[dead])} (ghost at ${Math.round(ghost.rect.x)})`);
    };
    // The ghost (6 per tick, faster than a cat) freezes while one cat faces it. Leapfrog: one cat moves while the
    // other stands facing west (the ghost trails behind); the mover then taps west once to face it.
    const faceGhost = (i) => {
      const specs = [{}, {}];
      specs[i] = api.centreX(cats[i]) > ghost.rect.x + 21 ? { left: true } : { right: true };
      api.step(specs);
    };
    // Lift (772..966, top 403; both cats needed): cat 1 hops on, then cat 0 (cat 1 faces the ghost meanwhile).
    api.walkTo(1, 740);
    api.jumpTo(1, 920); faceGhost(1);
    api.walkTo(0, 700);
    api.jumpTo(0, 840); faceGhost(0);
    alive('boarding the lift');
    api.until(() => lift.rect.y <= lift.spawn.y - 120, [], 400, 'the lift did not rise with both cats');
    // Off the lift's east end onto the plateau (top 288), one at a time.
    api.walkTo(1, 1060, { hop: true, max: 200 }); faceGhost(1);
    api.walkTo(0, 1010, { hop: true, max: 200 }); faceGhost(0);
    alive('onto the plateau');
    // The StepEnemy drops onto the plateau and patrols between the brown bumps (1008 / 1488) at 1 per tick: each cat
    // jumps it as it comes and keeps going over the second bump to the red block's west edge (1920).
    for (const [i, x] of [[1, 1872], [0, 1810]]) {
      let jumpLeft = 0, lastX = cats[i].rect.x;
      api.until(() => Math.abs(api.centreX(cats[i]) - x) < 4, () => {
        const gap = stepEnemy.rect.x - (cats[i].rect.x + 32);
        const stuck = Math.abs(cats[i].rect.x - lastX) < 0.01;
        lastX = cats[i].rect.x;
        if (cats[i].grounded && jumpLeft === 0 && ((gap > -40 && gap < 45 && stepEnemy.rect.x + 48 > cats[i].rect.x) || stuck)) jumpLeft = 16;
        const specs = [{}, {}];
        specs[i] = { right: api.centreX(cats[i]) < x, jump: jumpLeft > 0 };
        if (jumpLeft > 0) jumpLeft--;
        if (cats[i].deathTimer > 0) alive(`cat ${i} passing the StepEnemy`);
        return specs;
      }, 600, `cat ${i} could not get past the StepEnemy to the red block`);
      faceGhost(i);
    }
    alive('to the red block');
    // Cat 0 crosses from cat 1's head (cat 1 keeps facing the ghost).
    // The UpDownEnemy (56 x 48 over the block) rises 50 and drops back on a 9 s cycle: jump while it rests low.
    const popper = game.upDownEnemies[0];
    // Cat 1 at the very edge (right side 1918), cat 0 on its head edges east as far as it can stand.
    api.walkTo(1, 1897); faceGhost(1);   // right side stays west of the block (1920); the west tap faces the ghost
    api.climbOnto(0, 1, { from: 1810 });
    const bottomX = cats[1].rect.x;
    api.until(() => cats[0].rect.x >= Math.min(bottomX + 26, 1885), [{ right: true }, {}], 20, 'cat 0 could not edge east on the head');   // not past 1888: the red block's top row is 1.4 above a head
    api.until(() => popper.phase === 0 && popper.phaseTimer < 0.3, [], 600, 'the UpDownEnemy never rested');
    api.jumpTo(0, 2080); faceGhost(0);
    alive('cat 0 over the red block');
    // Cat 1: the longest running jump from the edge.
    api.walkTo(1, 1780); faceGhost(1);
    api.until(() => popper.phase === 0 && popper.phaseTimer < 0.3, [], 600, 'the UpDownEnemy never rested');
    let airborne = false;
    api.until(() => cats[1].deathTimer > 0 || (airborne && cats[1].grounded), (f) => {
      if (!cats[1].grounded) airborne = true;
      return [{}, { right: true, jump: f > 10 && f < 26 }];
    }, 150, 'cat 1 jump did not resolve');
    alive('cat 1 jumping the red block (MC_D* kill tiles, 96 wide)');
    api.block('unexpected: cat 1 crossed the red block; the Ghost / key / hut part is not scripted');
  },
};
