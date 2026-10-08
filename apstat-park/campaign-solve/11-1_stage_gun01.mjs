// 11-1 HAND GIMMICK (stage_gun01) -- party 2, two WarpGunPlayers.
// Warp gun (batch 13, native): the ACTION press fires one horizontal shot (6 px/tick by facing) from the cat's feet - 16;
// the first hit picks up a cat (hidden, inert where it was hit); the next hit places it on the shooter's side of what
// the shot struck (bottom = shot.y - 1), then it falls. A shot dies when it leaves the visible screen, and the camera
// centres on ALL cats, a hidden (held) cat counting at the spot where it was hit.
//
// Route:
// 1. Wall x 864..912: the only gap is the slit y 348..376 (two Rects). Cat 0 picks up cat 1 next to the wall, then
//    jump-fires with its feet 45..63 px up: the shot flies through the slit and strikes the BLK's left face (x 1104),
//    so cat 1 appears just left of the BLK and drops to the floor.
// 2. Cat 1 returns the favour: it jump-fires left through the slit while cat 0 jumps into the shot's path (a standing
//    cat is below the slit), then jump-fires right at the BLK face to place cat 0 beside it.
// 3. Key (above the BLK): the pit x 1392..1536 holds a Warp that re-drops a falling cat from above the BLK; cat 0
//    (placed in front) walks into the pit and steers onto the BLK top, through the key.
// 4. Pit: cat 0 (key) stands on cat 1's head at the pit lip, walks to the front of the head (a centred head jump
//    falls ~6 px short) and jumps across onto the Rect (1536.., top 432). Cat 1 jumps after it and falls short;
//    cat 0, facing left, shoots it as it drops through the shot line, so cat 1 is held at x ~1489.
// 5. Cat 0 walks right (stopping where the placed cat fits) until the camera shows the shot's hit on the right wall
//    (x 2304) and fires: cat 1 appears left of the wall and falls to the floor. Both enter the Goal (1944).
// Note: a held (hidden) cat still blocks the other cat's walking in this runtime, so no cat ever walks into the spot
// where its partner is held (cat 0 fires through the slit from where it picked cat 1 up).

const FLOOR = 432;
const WALL_X = 864;        // left face of the slit wall
const PIT_LIP = 1389;      // furthest rect.x a cat can stand at on the pit's left lip
const RIGHT_WALL = 2304;
const SHOT_DY = -16;       // shot centre y = cat feet - 16

export default {
  party: 2,
  budget: 6000,
  async solve(stage, api) {
    const { cats, game } = api;
    const [A, B] = cats;
    const feet = (cat) => cat.rect.y + cat.rect.height;
    const held = (cat) => game.warpGunDisabledPlayers.has(cat);
    const shotOf = (cat) => game.warpGunShots.get(cat);
    const facing = (cat) => cat.getFacingDirection();
    const steer = (cat, x, tol = 2) => {
      const dx = x - api.centreX(cat);
      if (Math.abs(dx) <= tol) return {};
      return dx > 0 ? { right: true } : { left: true };
    };
    const both = (who, spec, other = {}) => (who === 0 ? [spec, other] : [other, spec]);

    // Walk one cat until its rect.x is at x.
    const walkRect = (who, x, label) => {
      const cat = cats[who];
      api.until(() => Math.abs(cat.rect.x - x) <= 1.5, () => both(who, cat.rect.x < x ? { right: true } : { left: true }),
        600, label);
    };
    // Turn a cat to face dir (a one-frame tap, 3 px of travel).
    const face = (who, dir) => {
      if (facing(cats[who]) === dir) return;
      api.step(both(who, dir > 0 ? { right: true } : { left: true }));
      api.wait(1);
    };
    // Press the action button once (the gun fires on the press edge) and release it next frame.
    const fire = (who, extra = {}) => api.step(both(who, { action: true, ...extra }));
    const waitShotGone = (who) => api.until(() => !shotOf(cats[who]), [], 200, `cat ${who}'s shot never ended`);

    // Jump straight up and press fire on the first rising frame whose feet are in [lo, hi] (absolute y).
    const jumpFire = (who, lo, hi, label) => {
      const cat = cats[who];
      let f = 0, fired = false;
      api.until(() => fired, () => {
        const inWindow = f > 0 && feet(cat) >= lo && feet(cat) <= hi;
        f++;
        if (inWindow) { fired = true; return both(who, { jump: true, action: true }); }
        return both(who, { jump: true });
      }, 40, label);
      api.land();
    };

    // --- 1. cat 0 picks up cat 1 beside the wall and sends it through the slit -----------------------------------
    walkRect(1, 812, 'cat 1 to the wall');
    // Cat 0 shoots from where it will jump-fire: it never walks into the spot where cat 1 is held.
    walkRect(0, 760, 'cat 0 behind cat 1');
    face(0, 1);
    fire(0);
    api.until(() => held(B), [], 60, 'cat 0 did not pick up cat 1');
    waitShotGone(0);
    // Slit 348..376 -> shot centre 353..371 -> feet 369..387.
    jumpFire(0, 369, 387, 'cat 0 jump-fire through the slit');
    api.until(() => !held(B), [], 120, () => `cat 1 was not placed beyond the wall (shot ${JSON.stringify(shotOf(A))})`);
    api.land();
    if (B.rect.x < WALL_X + 48) api.block('cat 1 was placed on the wrong side of the wall at x ' + B.rect.x);
    waitShotGone(0);

    // --- 2. cat 1 catches cat 0 through the slit, then places it beside the BLK ----------------------------------
    walkRect(1, 940, 'cat 1 back to the wall');
    face(1, -1);
    walkRect(0, 790, 'cat 0 waits left of the wall');
    {
      // Cat 1 jump-fires left; cat 0 jumps when the shot is a few ticks away so its body crosses the shot's line.
      let f = 0, fired = false, aJump = -1;
      api.until(() => held(A), () => {
        f++;
        const specs = [{}, {}];
        if (!fired) {
          const inWindow = f > 1 && feet(B) >= 369 && feet(B) <= 387;
          specs[1] = inWindow ? { jump: true, action: true } : { jump: true };
          if (inWindow) fired = true;
        }
        const shot = shotOf(B);
        if (aJump < 0 && shot && shot.hitFadeRemainingSeconds === undefined && shot.x - (A.rect.x + A.rect.width) < 40) aJump = 0;
        if (aJump >= 0) specs[0] = { jump: aJump++ < 14 };
        return specs;
      }, 120, () => `cat 1's slit shot missed cat 0 (cat 0 feet ${feet(A)}, shot ${JSON.stringify(shotOf(B))})`);
    }
    api.land([1]);
    waitShotGone(1);
    walkRect(1, 1000, 'cat 1 left of the BLK');
    face(1, 1);
    // BLK face y 336..384 -> shot centre 341..379 -> feet 357..395.
    jumpFire(1, 362, 390, 'cat 1 jump-fire at the BLK');
    api.until(() => !held(A), [], 60, 'cat 0 was not placed beside the BLK');
    api.land();
    waitShotGone(1);

    // Cat 0 (placed beside the BLK, in front) crosses the pit with the key; cat 1 is carried over by the gun.
    const F = 0, N = 1;
    const far = cats[F], near = cats[N];
    const pair = (fSpec, nSpec) => (F === 0 ? [fSpec, nSpec] : [nSpec, fSpec]);

    // --- 3. key: cat 0 drops into the pit; the Warp puts it on the BLK top, through the key ------------------------
    // The Warp re-drops the cat at x ~1150 from above the screen; it steers onto the key (1112..1144) as it falls.
    let warped = false;
    api.until(() => api.carrierOfKey() === F, () => {
      if (far.rect.y + far.rect.height > FLOOR + 40) warped = true;
      return pair(warped ? steer(far, 1128) : { right: true }, {});
    }, 300, 'cat 0 did not get the key via the pit Warp');
    api.land();

    // --- 4. pit: cat 0 jumps across from cat 1's head ------------------------------------------------------------
    walkRect(N, PIT_LIP, 'cat 1 to the pit lip');
    api.wait(2);
    api.climbOnto(F, N);
    // A centred jump from the head falls ~6 px short of the Rect (1536..): walk to the front of the head first (8 px
    // of overlap left), then a full-hold jump right.
    api.until(() => far.rect.x >= near.rect.x + 24, () => pair({ right: true }, {}), 30, 'cat 0 to the front of cat 1\'s head');
    {
      let f = 0, left = false;
      api.until(() => left && far.grounded, () => {
        if (!far.grounded) left = true;
        return pair({ right: true, jump: f++ < 20 }, {});
      }, 120, 'cat 0 jump across the pit');
    }
    if (far.rect.x + far.rect.width <= 1536 || feet(far) > FLOOR + 1) api.block('cat 0 fell short of the pit at x ' + far.rect.x);
    walkRect(F, 1560, 'cat 0 onto the far side');
    face(F, -1);

    // Cat 1 jumps after it (it falls short); cat 0 shoots it as it drops through the shot line (y 416).
    {
      let f = 0, fired = false;
      const shotY = FLOOR + SHOT_DY;
      api.until(() => held(near), () => {
        f++;
        const fSpec = {};
        // The shot spawns at cat 0 rect.x - 14 and needs ~3 ticks to reach cat 1: fire as cat 1 descends near the line.
        if (!fired && near.velocity.y > 0 && feet(near) >= shotY - 20) { fSpec.action = true; fired = true; }
        return pair(fSpec, { right: true, jump: f < 20 });
      }, 120, () => `cat 0 missed cat 1 over the pit (cat 1 at ${near.rect.x}, feet ${feet(near)})`);
    }
    waitShotGone(F);

    // --- 5. cat 0 places cat 1 against the right wall --------------------------------------------------------------
    // The shot dies when its centre leaves the screen, so the camera (centred on (min + max) / 2 of the cats'
    // centres, the held cat 1 counted where it was hit) must show the shot's hit x on the wall.
    const heldCentre = api.centreX(near);
    const viewW = 1280 / (game.stage?.scale ?? 1);
    // Rightmost standing x for cat 0 that leaves room for the placed cat (placed x = wall - 5 - 1 - 32).
    const standX = RIGHT_WALL - 5 - 1 - near.rect.width - far.rect.width - 2;
    walkRect(F, standX, 'cat 0 to the right wall');
    face(F, 1);
    // The shot steps 6 px from rect.x + 46; it strikes on the first step whose 10 px box crosses the wall.
    let hitX = far.rect.x + 46;
    while (hitX + 5 <= RIGHT_WALL) hitX += 6;
    api.until(() => hitX - game.scrollCameraState.scroll < viewW - 0.5, [], 200,
      () => `the camera never shows the right wall: scroll ${game.scrollCameraState.scroll.toFixed(1)} (needs > ${(hitX - viewW).toFixed(1)}), held cat 1 centre ${heldCentre}, cat 0 centre ${api.centreX(far)}`);
    fire(F);
    api.until(() => !held(near), [], 120, () => `cat 1 was not placed at the right wall (scroll ${game.scrollCameraState.scroll.toFixed(1)})`);
    api.land();

    api.enterGoal();
  },
};
