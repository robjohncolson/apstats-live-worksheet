// 11-3 HAND GIMMICK (stage_gun02).
// Two WarpGunPlayers (ACTION fires; the first hit picks up a cat or ColorBox, the next hit places it on the shooter's
// side of whatever the shot strikes, bottom = shot.y - 1, then it falls).
// Route:
//   1-3. A picks up the ForceColorBox and places it against the platform's left face: a 48 px step onto the 96 px platform.
//   4.   FallBox staircase: both cats run the same hop policy, B touching A's back, so B lands on each box ~11 ticks after
//        A, while it is still armed (it drops 0.22 s after A's landing). Both end on the plateau.
//   5-6. A picks up B at the plateau's right end, jumps and fires at the wall x 1776 from the top of the jump: B appears
//        in the key shaft at y ~50..96, overlaps the key (1712..1744, y 68..124) as it drops, and lands on the floor.
//   7.   A walks off the plateau into the pit; B, at the pit's right lip, shoots it as it falls (a miss warps A back above
//        the plateau and it tries again).
//   8.   B jump-fires at the wall face (a standing shot flies through the tunnel under it): A drops beside B. Door.
export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const { game, cats, step, hold, until, walkTo, land, block } = api;
    const [A, B] = cats;
    const box = game.colorBoxes[0];
    const shotOf = (cat) => game.warpGunShots.get(cat);
    const heldBy = (cat) => game.warpGunSelectedPlayers.get(cat);

    // Turn cat c to face dir (-1 / 1) with a one-tick tap, then let it settle.
    function face(c, dir) {
      if (cats[c].getFacingDirection() === dir) return;
      const specs = []; specs[c] = dir > 0 ? { right: true } : { left: true };
      step(specs);
      settle();
    }
    // Wait until every cat that is not held by a gun stands still.
    function settle() {
      const still = (cat) => game.warpGunDisabledPlayers.has(cat) || (Math.abs(cat.velocity.x) < 0.5 && cat.grounded);
      until(() => cats.every(still), [], 120, 'cats never settled');
    }
    // Press ACTION once for cat c (extra = the other buttons that tick) and wait until the shot is gone.
    function fire(c, extra = {}) {
      // One live shot per gun: let the last one (incl. its 0.5 s hit fade) finish first.
      until(() => !shotOf(cats[c]), [], 400, `cat ${c}'s previous shot never ended`);
      const specs = []; specs[c] = { ...extra, action: true };
      step(specs);
      until(() => !shotOf(cats[c]), [], 400, `cat ${c}'s shot never ended`);
    }

    land();
    // 1. A picks up the ForceColorBox (the shot spawns 30 px ahead and must not start inside the box).
    walkTo(1, 300);
    walkTo(0, 170);
    settle();
    face(0, -1);
    fire(0);
    if (heldBy(A) !== box) block('A did not pick up the box');
    // 2. B steps back left, A walks to the platform and places the box against its left face.
    walkTo(1, 80, { hop: true });
    walkTo(0, 420);
    settle();
    face(0, 1);
    fire(0);
    if (heldBy(A)) block('A could not place the box against the platform');
    land();
    // 3. Both cats hop box -> platform.
    walkTo(0, 640, { hop: true });
    walkTo(1, 590, { hop: true });
    settle();
    // 4. The staircase. Both cats run the same hop policy; B walks touching A's back, so it reaches every take-off point
    //    ~11 ticks after A and lands on each FallBox while it is still armed (it falls 0.22 s after A's landing).
    walkTo(0, 760);
    settle();
    until(() => B.rect.x + B.rect.width >= A.rect.x - 0.01, [{}, { right: true }], 200, 'B never reached A');
    settle();
    const tops = [game.fallBoxes[0].rect, game.fallBoxes[1].rect, game.fallBoxes[2].rect, { x: 1200, y: 192, width: 192 }];
    const targets = [936, 1032, 1128, 1240];
    const hopper = (cat) => ({ cat, stage: -1, jumpTicks: 0, wasGrounded: true });
    const hoppers = [hopper(A), hopper(B)];
    function hopSpec(h) {
      const cat = h.cat;
      const feet = cat.rect.y + cat.rect.height;
      // Landed on the next step: aim for the following one.
      if (h.stage >= 0 && cat.grounded && !h.wasGrounded) h.stage++;
      h.wasGrounded = cat.grounded;
      if (h.stage >= targets.length) return {};
      if (h.stage < 0) {
        // Walk to the platform edge, then take off.
        if (cat.rect.x + cat.rect.width < 897) return { right: true };
        h.stage = 0;
      }
      const target = targets[h.stage];
      if (cat.grounded && h.jumpTicks === 0) h.jumpTicks = 15;
      const spec = {};
      if (h.jumpTicks > 1) spec.jump = true;
      if (h.jumpTicks > 0) h.jumpTicks--;
      const dx = target - (cat.rect.x + cat.rect.width / 2);
      if (Math.abs(dx) > 2) spec[dx > 0 ? 'right' : 'left'] = true;
      return spec;
    }
    until(() => hoppers.every((h) => h.stage >= targets.length), () => hoppers.map(hopSpec), 600, 'staircase crossing failed');
    settle();
    // 5. On the plateau: B stands at the right end; A stands just far enough left for its shot to spawn clear of B
    //    (shot spawn = A.x + 46, 10 px wide) and picks B up.
    until(() => B.rect.x + B.rect.width >= 1402, [{}, { right: true }], 200, 'B never reached the plateau end');
    settle();
    until(() => A.rect.x >= B.rect.x - 55, [{ right: true }], 200, 'A never got near B');
    settle();
    if (A.rect.x + 51 >= B.rect.x) block(`A too close to B to fire (A.x ${A.rect.x}, B.x ${B.rect.x})`);
    fire(0);
    if (heldBy(A) !== B) block('A did not pick up B on the plateau');
    // 6. The camera centres on both cats (held B counts where it was hit), so with both at the right end the wall x 1776
    //    is on screen. A jumps and fires at the wall from the top of the jump: B appears in the key shaft against the wall
    //    with bottom = shot.y - 1, overlapping the key (1712..1744, y 68..124) on the way down.
    until(() => game.scrollCameraState.scroll > 920, [], 120, () => `camera stuck at ${game.scrollCameraState.scroll}`);
    let fired = false;
    hold((f) => {
      const spec = { jump: f < 14 };
      if (!fired && A.velocity.y >= 0 && f > 2) { spec.action = true; fired = true; }
      return [spec];
    }, 30);
    land();
    until(() => !shotOf(A), [], 400, "A's shot never ended");
    if (api.carrierOfKey() !== 1) block('B was placed in the shaft but did not catch the key');
    // 7. B (with the key) waits at the pit's right lip facing left; A walks off the plateau into the pit.
    walkTo(1, 1652);
    settle();
    face(1, -1);
    //    A falls at up to ~19.5 px/tick and crosses B's shot line (y ~415) near x 1470, ~22 ticks after its feet pass
    //    y 200; B fires then (the shot needs ~21 ticks to cover the 125 px). A missed cat warps back above the plateau,
    //    lands there and walks off again.
    const FIRE_AT_FEET = 200;
    let bFired = false;
    until(() => heldBy(B) === A, () => {
      const falling = A.rect.x > 1392 && !A.grounded && api.feetY(A) >= FIRE_AT_FEET;
      const spec = falling && !bFired && !shotOf(B) ? { action: true } : {};
      if (spec.action) bFired = true;
      if (A.grounded) bFired = false;
      return [{ right: true }, spec];
    }, 600, 'B never caught A falling through the pit');
    // 8. B turns right and fires at the wall: A appears beside it and drops to the floor. Then everybody to the door.
    //    A standing shot (y ~415) would fly through the tunnel (y 384..432) under the wall, so B fires from a jump,
    //    once its feet are above y 380 (shot.y < 380 hits the wall face).
    face(1, 1);
    until(() => !shotOf(B), [], 400, "B's catching shot never ended");
    let bPlaced = false;
    hold((f) => {
      const spec = { jump: f < 14 };
      if (!bPlaced && api.feetY(B) < 380) { spec.action = true; bPlaced = true; }
      return [{}, spec];
    }, 40);
    until(() => !shotOf(B), [], 400, "B's placing shot never ended");
    if (heldBy(B)) block('B could not place A');
    land();
    api.enterGoal();
  },
};
