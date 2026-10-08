// 12-4 LAST PARK (stage_auto_scroll02).
// The puzzle: an auto-scrolling run (the camera moves east 2 units per tick). A pit with a pillar in it, a staircase
// up to a ledge (top 288), a wide pit (1584..1776, a Bridge whose Switch is on the far side), a JumpStand that
// launches a cat through the Key (x 2192..2224, y 68..124) onto a long high platform, two StepEnemies on it, a run
// of single-chip stepping stones, a DeadSwitch ("DON'T PUSH!") on the last platform and the door at x 4320.
// Thunder beams run along the pit floors (y 454).
// Route (native 3 px/tick walk, so a jump spans ~115 px and every hop starts from a lip): run east with the camera;
// hop the pillar pit from its lip; climb the stairs; the wide pit is too long for one jump (lands ~12 short), so cat 1
// stands at the ledge lip and cat 0 jumps across from the east end of its head, then holds the Bridge switch while
// cat 1 walks over the unfolded Bridge; cat 0 bounces off the JumpStand through the key and onto the platform, cat 1
// after it; along the platform hopping the StepEnemies and the stones; jump over the DeadSwitch from its west edge;
// both enter.
export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const { cats, game } = api;
    const cx = api.centreX;
    const steer = (cat, x, tol = 2) => { const d = x - cx(cat); return Math.abs(d) <= tol ? {} : d > 0 ? { right: true } : { left: true }; };
    const alive = () => { cats.forEach((cat, i) => { if (cat.deathTimer > 0) api.block(`cat ${i} died at ${JSON.stringify(api.snapshot()[i])}`); }); };

    // East to the pillar pit (816..902; the pillar 902..950 is level with the floor) and over it.
    // At 3 px/tick a jump spans ~115 px, so each cat takes off from the pit lip (centre ~806).
    api.walkTo([0, 1], [760, 806]);
    api.jumpTo(1, 1000);
    api.walkTo([0, 1], [806, 1040]);
    api.jumpTo(0, 980);
    alive();
    // The staircase (tops 384 / 336 / 288) up to the ledge 1440..1584.
    api.walkTo([0, 1], [1500, 1560], { hop: true, max: 600 });
    alive();
    // The wide pit (1584..1756.8; landing on the Rect 1756.8.. / floor 1776.., top 432). At 3 px/tick a full jump from
    // the ledge lip (x 1582) comes down at x ~1714, ~12 short. So cat 1 (in front) stands at the lip as a step, cat 0
    // climbs its head and walks out to its east end (overhang, rider x = carrier x + 24): from feet 242 with ~110 px to
    // go the rider lands across. Cat 0 then holds the Bridge switch (2048..2080); the Bridge unfolds west from 1776 over
    // the pit at floor level and cat 1 drops off the ledge onto it and walks across. From here cat 0 LEADS.
    const LEAD = 0, TRAIL = 1;
    const both = (lead, trail) => { const v = []; v[LEAD] = lead; v[TRAIL] = trail; return v; };
    api.walkTo(TRAIL, 1598, { tol: 1 });
    api.land();
    api.climbOnto(LEAD, TRAIL, { from: 1540 });
    api.until(() => cats[LEAD].rect.x >= cats[TRAIL].rect.x + 24 || !cats[LEAD].grounded,
      () => both({ right: true }, {}), 30, 'the rider could not walk out to the east end of the carrier head');
    alive();
    let fr = 0, upr = false;
    api.until(() => upr && cats[LEAD].grounded, () => {
      if (!cats[LEAD].grounded) upr = true;
      return both({ jump: fr++ < 20, right: true }, {});
    }, 120, 'the rider could not jump from the carrier head over the wide pit');
    alive();
    if (api.feetY(cats[LEAD]) < 431 || cats[LEAD].rect.x + 32 < 1757) api.block('the rider did not land across the wide pit: ' + JSON.stringify(api.snapshot()[LEAD]));
    const bridge = game.bridges[0];
    api.walkTo(LEAD, 2064, { tol: 2 });
    api.until(() => bridge.rect.x <= 1590, [], 300, () => 'the Bridge never reached the ledge side: ' + JSON.stringify(bridge.rect));
    api.walkTo(TRAIL, 2000, { max: 300 });
    alive();
    // The lead cat bounces off the JumpStand (2096..2128) and steers through the key onto the platform (2208.., top
    // 288); then the trailing cat.
    function bounce(i, target) {
      const cat = cats[i];
      let launched = false, f = 0;
      api.until(() => launched && cat.grounded, () => {
        if (cat.velocity.y < -600) launched = true;
        const specs = [{}, {}];
        specs[i] = { jump: f < 14 && !launched, ...steer(cat, launched ? target : 2112) };
        f++;
        alive();
        return specs;
      }, 200, `cat ${i} could not bounce from the JumpStand onto the high platform`);
    }
    bounce(LEAD, 2230);
    if (api.carrierOfKey() !== LEAD) api.block('the lead cat bounced past the key without taking it');
    api.walkTo(LEAD, 2400);
    api.walkTo(TRAIL, 2040);
    bounce(TRAIL, 2260);
    // East along the platform; hop the StepEnemies and the stepping stones (gaps at 3360, 3456, 3552..3648).
    api.until(() => cx(cats[LEAD]) > 3300 && cx(cats[TRAIL]) > 3240, () => {
      alive();
      return cats.map((cat, i) => {
        const ahead = game.stepEnemies.some((enemy) => enemy.rect.x > cat.rect.x && enemy.rect.x - cat.rect.x < 90 &&
          Math.abs(enemy.rect.y + enemy.rect.height - api.feetY(cat)) < 40);
        return { ...steer(cat, i === LEAD ? 3320 : 3260), jump: ahead };
      });
    }, 900, 'the party could not get along the platform past the StepEnemies');
    // Stones 3408..3456 and 3504..3552, then the platform from 3648 (a 96 gap). At 3 px/tick a jump spans ~115 px,
    // so every hop starts from the east lip of the current surface (platform lip 3350, stone lips 3446 / 3544).
    const hopFrom = (i, lip, to) => { api.walkTo(i, lip, { tol: 1 }); api.jumpTo(i, to); alive(); };
    hopFrom(LEAD, 3350, 3432);
    hopFrom(LEAD, 3446, 3528);
    hopFrom(TRAIL, 3350, 3432);
    hopFrom(LEAD, 3544, 3700);
    api.walkTo(LEAD, 3800); alive();
    hopFrom(TRAIL, 3446, 3528);
    hopFrom(TRAIL, 3544, 3700);
    // Over the DeadSwitch (3918..3954) without touching it, then the door.
    // Each cat takes off right at its west edge (centre 3899, x 3883..3915): at 3 px/tick a jump stays above the
    // switch top (282) for ~30 ticks, ~90 px, and touching it resets the stage.
    api.walkTo([TRAIL, LEAD], [3850, 3899], { tol: 1 });
    api.jumpTo(LEAD, 4040); alive();
    api.walkTo(TRAIL, 3899, { tol: 1 });
    api.jumpTo(TRAIL, 3990); alive();
    api.enterGoal();
    alive();
  },
};
