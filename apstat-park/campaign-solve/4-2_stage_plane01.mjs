// 4-2 GIMMICK GIMMICK (stage_plane01).
// The puzzle: an auto-scrolling flight; every cat is a PlanePlayer (left/right/up/down, no gravity). PlaneObstacles:
// a Road strip (1392..1872, y 324..348), a BlockRoad corridor (2592..3072, open only y 147.5..232.5) plugged at its
// far end by an 80 x 85 PushBox the planes must shove out, the Key low at x 3440 (y 356..412), an UpCurve corridor
// (3551..4031, the 100-unit gap stepping up 10 per 96) and a DownCurve corridor (4511..4991, stepping down), then the
// door at 5448 (y 208..240).
// Route: both planes fly a single file along a centre-line path: above the Road strip, into the corridor (pushing
// the box out), dive for the key, climb into the UpCurve, follow both curves, and enter the door with UP.
export default {
  party: 2,
  budget: 4000,
  async solve(stage, api) {
    const { cats, game } = api;
    const [goal] = game.goals;
    // Centre-line y for a plane whose centre is at x (the open band of each obstacle, see the header).
    const pathY = (x) => {
      if (x < 1300) return 240;
      if (x < 2400) return 240;                        // above the Road strip (324..348)
      if (x < 3150) return 190;                        // BlockRoad gap 147.5..232.5 (lookahead: stay in it to 3150)
      if (x < 3300) return 300;
      if (x < 3500) return 384;                        // the Key (356..412)
      if (x < 3551) return 168;                        // up to the UpCurve entrance
      // Curves: a plane spans two 96-wide steps at once, so aim between them (lookahead x is 24 ahead).
      if (x < 4100) return 168 - 10 * Math.min(4, Math.floor((x - 3551) / 96)) + 5;
      if (x < 4400) return 200;
      if (x < 5060) return 312 + 10 * Math.min(4, Math.floor((x - 4511) / 96)) - 5;
      return 224;                                       // the door (208..240)
    };
    const fly = (cat, xTarget) => {
      const cx = api.centreX(cat), cy = cat.rect.y + cat.rect.height / 2;
      const ty = pathY(cx + 24);
      const spec = {};
      if (cy < ty - 4) spec.down = true; else if (cy > ty + 4) spec.up = true;
      // Hold back horizontally while far off the line (the corridor walls are DamageRects). A plane is carried by the
      // auto-scroll (FUN_7ff72bb708d0: its velocity starts at the scroll step), so holding back means holding LEFT.
      if (Math.abs(cy - ty) < 30 && cx < xTarget) spec.right = true;
      else if (Math.abs(cy - ty) >= 30) spec.left = true;
      return spec;
    };
    // Plane 0 (upper at spawn) leads; plane 1 follows 70 units behind.
    const gx = goal.rect.x + goal.rect.width / 2;
    api.until(() => api.centreX(cats[0]) >= gx - 4 && api.centreX(cats[1]) >= gx - 74, () => {
      cats.forEach((cat, i) => { if (cat.deathTimer > 0) api.block(`plane ${i} died at x ${Math.round(cat.rect.x)}, y ${Math.round(cat.rect.y)}`); });
      // In the BlockRoad corridor plane 1 closes up behind plane 0 so both push the box.
      const gap = api.centreX(cats[0]) > 2900 && api.centreX(cats[0]) < 3150 ? 0 : 70;
      return [fly(cats[0], gx), fly(cats[1], Math.min(gx - 70, api.centreX(cats[0]) - gap))];
    }, 3000, () => `the planes did not reach the door (plane 0 at ${JSON.stringify(api.snapshot()[0])}, plane 1 at ${JSON.stringify(api.snapshot()[1])})`);
    if (api.carrierOfKey() < 0) api.block('the planes flew past the key without taking it');
    api.enterGoal();
  },
};
