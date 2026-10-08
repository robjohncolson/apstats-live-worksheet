// 12-4 LAST PARK (stage_auto_scroll02).
// The puzzle: an auto-scrolling run (the camera moves east 2 units per tick). A pit with a pillar in it, a staircase
// up to a ledge (top 288), a wide pit (1584..1776, a Bridge whose Switch is on the far side), a JumpStand that
// launches a cat through the Key (x 2192..2224, y 68..124) onto a long high platform, two StepEnemies on it, a run
// of single-chip stepping stones, a DeadSwitch ("DON'T PUSH!") on the last platform and the door at x 4320.
// Thunder beams run along the pit floors (y 454).
// Route: run east with the camera; hop the pillar pit; climb the stairs; long-jump the wide pit from the ledge;
// cat 1 bounces off the JumpStand through the key and onto the platform, cat 0 bounces after it; along the platform
// hopping the StepEnemies and the stones; jump over the DeadSwitch; both enter.
export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const { cats, game } = api;
    const cx = api.centreX;
    const steer = (cat, x, tol = 2) => { const d = x - cx(cat); return Math.abs(d) <= tol ? {} : d > 0 ? { right: true } : { left: true }; };
    const alive = () => { cats.forEach((cat, i) => { if (cat.deathTimer > 0) api.block(`cat ${i} died at ${JSON.stringify(api.snapshot()[i])}`); }); };

    // East to the pillar pit (816..902; the pillar 902..950 is level with the floor) and over it.
    api.walkTo([0, 1], [740, 790]);
    api.jumpTo(1, 1000); api.jumpTo(0, 960);
    alive();
    // The staircase (tops 384 / 336 / 288) up to the ledge 1440..1584.
    api.walkTo([0, 1], [1500, 1560], { hop: true, max: 600 });
    alive();
    // Long jump from the ledge (288) over the wide pit to the Rect / floor beyond (1756.., top 432).
    api.jumpTo(1, 1830); alive();
    api.walkTo(1, 1900);
    api.walkTo(0, 1566, { tol: 2 });
    api.jumpTo(0, 1810); alive();
    // Cat 1 bounces off the JumpStand (2096..2128) and steers through the key onto the platform (2208.., top 288).
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
    api.walkTo(1, 2040);
    bounce(1, 2230);
    if (api.carrierOfKey() !== 1) api.block('cat 1 bounced past the key without taking it');
    api.walkTo(1, 2400);
    api.walkTo(0, 2040);
    bounce(0, 2260);
    // East along the platform; hop the StepEnemies and the stepping stones (gaps at 3360, 3456, 3552..3648).
    api.until(() => cx(cats[1]) > 3300 && cx(cats[0]) > 3240, () => {
      alive();
      return cats.map((cat, i) => {
        const ahead = game.stepEnemies.some((enemy) => enemy.rect.x > cat.rect.x && enemy.rect.x - cat.rect.x < 90 &&
          Math.abs(enemy.rect.y + enemy.rect.height - api.feetY(cat)) < 40);
        return { ...steer(cat, i === 1 ? 3320 : 3260), jump: ahead };
      });
    }, 900, 'the party could not get along the platform past the StepEnemies');
    for (const [a, b] of [[3432, 3376], [3528, 3432], [3700, 3528], [3800, 3700]]) {
      api.jumpTo(1, a); alive();
      api.jumpTo(0, b); alive();
    }
    // Over the DeadSwitch (3918..3954) without touching it, then the door.
    api.walkTo([0, 1], [3830, 3870]);
    api.jumpTo(1, 4040); alive();
    api.jumpTo(0, 3990); alive();
    api.enterGoal();
    alive();
  },
};
