// 7-3 MOVE AND STOP (stage_ghost01).
// The puzzle: a Ghost (gaze ratio 0.5 -> with 2 cats ONE cat facing it freezes it; it restarts only when no cat
// faces it; 6 px/tick, faster than a walking cat; touching it kills; it passes through walls). While chasing it heads
// for the nearest cat's feet point (cat x + 16, feet + 1) from a source 50 above its anchor, except that a free Key
// within 100 in x becomes its target: it carries the key, which eases 0.1/frame toward the ghost anchor (key rect
// anchor +-28 vs ghost body anchor -99..-43, so a settled key hangs 15 below the body). A cat overlapping a
// ghost-carried key takes it.
// Map: WeightedLift (772..966, both cats) up to the plateau (top 288); a StepEnemy patrolling the plateau; the red
// block (MC_D* chips, 1920..2016, top 240: a plain solid step) with an UpDownEnemy inside (low 122 frames, rises 50
// over 152, high 122, falls 152); steps 2304 (top 240) / 2352 (top 192) to the hut roof (2400..2592, top 144); the
// sealed room under it (2400..2592, floor 336) holds the Key (2480..2512, 260..316); east of the hut a step
// (2592..2640, top 192) down to a slab (2640..3072, top 288, bottom 336) over a lower floor (top 432, 2640..3120),
// reached through the hole at 3072..3120; stairs 3120 (384) / 3168 (336) / 3216 (288) / 3264 (240) / 3312 (192) to
// the door (3360..3408, on top 192). The ghost spawns far west (171, 93) and never moves while a cat faces it.
// Route: ride the lift, jump the StepEnemy, hop the red block while the enemy is low, up over the hut roof -- always
// one cat facing the ghost so it stays at its spawn. Cat 1 goes down the hole and back west under the slab (x 3040);
// cat 0 waits on the slab (x ~2880). Both turn east: the ghost flies at cat 0 along y ~232, diverts through the hut
// wall to the key, and comes on east carrying it. At ghost x 2760 both turn west (cat 0's gaze holds it); cat 1
// walks under it and jumps -- its head stops on the slab bottom (336) inside the hanging key (~303..359) while the
// slab keeps it off the ghost body (bottom ~288). Cat 0 keeps facing the ghost while cat 1 takes the key up the
// stairs, then cat 1 faces it while cat 0 follows; both enter.
// Native speeds (batch 10, walk 3/tick): the cats hold the raised lift until the StepEnemy has turned east past the
// plateau landing, and cross the red block one per UpDownEnemy low phase (a crossing takes ~80 of its 122 frames).
export default {
  party: 2,
  budget: 5000,
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
    // The StepEnemy patrols the plateau (1008..1488 bumps) at 1/tick; at native walk speed the cats reach the top
    // while it is still walking west over the landing spot (1010..1060). Wait on the raised lift (it stays up while
    // both ride) until it has turned at the west bump and walked east past x 1120.
    let seX = stepEnemy.rect.x;
    api.until(() => { const east = stepEnemy.rect.x > seX; seX = stepEnemy.rect.x; return east && seX > 1120; }, [], 900,
      'the StepEnemy never cleared the plateau landing');
    // Off the lift's east end onto the plateau (top 288), one at a time.
    api.walkTo(1, 1060, { hop: true, max: 200 }); faceGhost(1);
    // Native camera (batch 17): the cats stay within one screen (1280 / 1.5 = 853), so cat 0 stands far enough east
    // for cat 1 to reach x 1872 below.
    api.walkTo(0, 1030, { hop: true, max: 200 }); faceGhost(0);
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
    // The red block (1920..2016, top 240) is a plain solid step; the UpDownEnemy inside it is low (y 251.6, under
    // the block top) for 122 frames, rises 50 over 152, stays high 122, falls 152 (548-frame cycle). Each cat hops
    // over the block right after the enemy settles low.
    const popper = game.upDownEnemies[0];
    const whilePopperLow = () => api.until(() => popper.phase === 0 && popper.phaseTimer < 0.3, [], 600, 'the UpDownEnemy never rested');
    const move = (i, x, opts = {}) => { api.walkTo(i, x, { hop: true, max: 400, ...opts }); faceGhost(i); alive(`cat ${i} to x ${x}`); };
    whilePopperLow();
    move(1, 2110);
    // At 3 px/tick one crossing (~80 ticks) uses most of a 122-frame low phase: cat 0 waits for the next one.
    whilePopperLow();
    move(0, 2060);
    // Up the steps (2304 top 240, 2352 top 192) onto the hut roof (2400..2592, top 144); then down the east step
    // (2592..2640, top 192) to the slab (2640..3072, top 288) east of the hut.
    move(1, 2520);
    move(0, 2440);
    // Cat 1 (the key receiver) goes on down through the slab's east hole (3072..3120) to the lower floor (top 432,
    // 2640..3120), then back west under the slab; cat 0 stands on the slab further west.
    move(1, 3096);
    move(1, 3040);
    move(0, 2900);
    // Release: both cats face east (away), so the ghost chases the nearest cat (cat 0 on the slab) along y ~232;
    // passing x 2396 it diverts to the key (within 100 of it), picks it up through the hut wall, and heads on east
    // toward cat 0 with the key easing 0.1/frame toward its anchor (15 below its body).
    api.step([{ right: true }, { right: true }]);
    const freezeX = 2760;   // ghost centre x where the cats freeze it, well short of cat 0
    api.until(() => ghost.rect.x + 21 >= freezeX, [], 900, () => `the ghost never reached x ${freezeX} (at ${Math.round(ghost.rect.x)})`);
    // Both cats are east of it: both turn west. Cat 0's gaze is the one that holds -- cat 1 will stand right under
    // the ghost's anchor, where its own gaze flips with the sign of dx.
    api.step([{ left: true }, { left: true }]);
    if (ghost.isChasing()) api.block('the cats could not freeze the ghost');
    const ghostHasKey = () => (game.carriedKeys || []).some((entry) => entry.ghost === ghost);
    if (!ghostHasKey()) api.block(`the ghost did not pick up the key on its way (ghost at ${Math.round(ghost.rect.x)},${Math.round(ghost.rect.y)})`);
    // Handoff under the slab: the key hangs at y ~303..359 below the frozen ghost (body bottom ~288 = slab top).
    // Cat 1 walks west under it and jumps; its head stops on the slab bottom (336), inside the key, and the slab keeps
    // it clear of the ghost's body.
    const keyX = () => game.keys[0].rect.x + 16;
    api.walkTo(1, freezeX, { max: 200 });
    api.until(() => api.carrierOfKey() === 1, (f) => {
      const dx = keyX() - api.centreX(cats[1]);
      return [{}, { jump: f % 30 < 14, ...(Math.abs(dx) <= 3 ? {} : dx > 0 ? { right: true } : { left: true }) }];
    }, 240, 'cat 1 could not take the key from the ghost');
    alive('taking the key');
    // Exit: cat 0 (east of the ghost) faces it while cat 1 carries the key east, out of the hole and up the stairs
    // (3120 top 384, 3168 336, 3216 288, 3264 240, 3312 192) next to the door (3360..3408, on top 192); then cat 1
    // faces the ghost while cat 0 follows (off the slab's east end, down the hole, up the stairs).
    api.land();
    api.walkTo(1, 3330, { hop: true, max: 400 }); faceGhost(1);
    alive('cat 1 to the door');
    api.walkTo(0, 3280, { hop: true, max: 400 }); faceGhost(0);
    alive('cat 0 to the door');
    api.enterGoal();
  },
};
