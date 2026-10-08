// 12-3 LAST PARK (stage_plane02).
// The puzzle: a long auto-scrolling flight; every cat is a PlanePlayer (left/right/up/down, no gravity). Seven
// PlaneObstacles (Road, RoadUp, RoadDown, UpCurve, DownCurve, Road, Road) are each a pair of DamageRects leaving a
// band 85..112 tall; the Key floats high (y 116..172) between the RoadDown and the UpCurve (its x moves +60 per extra
// player); the door is at 8232 (y 208..240).
// Route: both planes fly single file; each frame a plane steers to the middle of the open band it is in (or the
// next one ahead, read live from the DamageRects so moving obstacles are followed), detours up through the key,
// and the pair enters the door with UP.
export default {
  party: 2,
  budget: 5000,
  async solve(stage, api) {
    const { cats, game } = api;
    const [goal] = game.goals;
    const [key] = game.keys;
    // The open band over [x0, x1]: lowest bottom of the upper DamageRects to the highest top of the lower ones.
    const band = (x0, x1) => {
      let top = -Infinity, bottom = Infinity, any = false;
      for (const d of game.damageRects) {
        const r = d.rect ?? d;
        if (r.x >= x1 || r.x + r.width <= x0) continue;
        any = true;
        if (r.y < 0) top = Math.max(top, r.y + r.height); else bottom = Math.min(bottom, r.y);
      }
      return any ? { top, bottom } : null;
    };
    const targetY = (cat) => {
      const x0 = cat.rect.x, x1 = cat.rect.x + cat.rect.width;
      const here = band(x0 - 4, x1 + 30);
      if (here) return (here.top + here.bottom) / 2;
      const kx = key.rect.x + key.rect.width / 2;
      if (api.carrierOfKey() < 0 && Math.abs(api.centreX(cat) - kx) < 160) return key.rect.y + key.rect.height / 2;
      for (let ahead = 40; ahead < 400; ahead += 20) {
        const next = band(x1 + ahead, x1 + ahead + 1);
        if (next) return (next.top + next.bottom) / 2;
      }
      return goal.rect.y + goal.rect.height / 2;
    };
    const fly = (cat, xLimit) => {
      const cy = cat.rect.y + cat.rect.height / 2;
      const ty = targetY(cat);
      const spec = {};
      if (cy < ty - 3) spec.down = true; else if (cy > ty + 3) spec.up = true;
      // Only advance while near the line, and never into a band the plane does not fit yet.
      const ahead = band(cat.rect.x + cat.rect.width, cat.rect.x + cat.rect.width + 8);
      const fits = !ahead || (cat.rect.y > ahead.top + 1 && cat.rect.y + cat.rect.height < ahead.bottom - 1);
      if (Math.abs(cy - ty) < 30 && fits && api.centreX(cat) < xLimit) spec.right = true;
      return spec;
    };
    const gx = goal.rect.x + goal.rect.width / 2;
    api.until(() => api.centreX(cats[0]) >= gx - 4 && api.centreX(cats[1]) >= gx - 74, () => {
      cats.forEach((cat, i) => { if (cat.deathTimer > 0) api.block(`plane ${i} died at x ${Math.round(cat.rect.x)}, y ${Math.round(cat.rect.y)}`); });
      return [fly(cats[0], gx), fly(cats[1], Math.min(gx - 70, api.centreX(cats[0]) - 70))];
    }, 4500, () => `the planes did not reach the door (plane 0 at ${JSON.stringify(api.snapshot()[0])}, plane 1 at ${JSON.stringify(api.snapshot()[1])})`);
    if (api.carrierOfKey() < 0) api.block('the planes flew past the key without taking it');
    // Door entry for planes: UP also flies the plane up, so each plane holds the door centre (x, and y = the door
    // sensor centre) and alternates an UP tap with a DOWN tap. The key carrier goes first (its UP opens the door).
    const gy = goal.rect.y + goal.rect.height / 2;
    const entered = (cat) => game.goalClearedPlayers?.has(cat);
    const enterPlane = (i, slotX) => {
      let f = 0;
      api.until(() => entered(cats[i]) || api.cleared, () => {
        f++;
        const cat = cats[i];
        const cx = api.centreX(cat), cy = cat.rect.y + cat.rect.height / 2;
        const spec = {};
        if (cx < slotX - 2) spec.right = true; else if (cx > slotX + 2) spec.left = true;
        const aligned = Math.abs(cx - slotX) <= 6 && Math.abs(cy - gy) <= 6;
        if (!aligned) { if (cy < gy - 2) spec.down = true; else if (cy > gy + 2) spec.up = true; }
        else if (f % 2 === 0) spec.up = true; else spec.down = true;
        const specs = [{}, {}];
        specs[i] = spec;
        return specs;
      }, 400, () => `plane ${i} could not enter the door (door opened: ${!!goal.opened}, key carrier: ${api.carrierOfKey()})`);
    };
    const carrier = api.carrierOfKey();
    const other = 1 - carrier;
    // The other plane moves aside (above) first.
    api.until(() => cats[other].rect.y + cats[other].rect.height < goal.rect.y - 20, () => {
      const specs = [{}, {}]; specs[other] = { up: true }; return specs;
    }, 60, 'the other plane could not move aside');
    enterPlane(carrier, gx);
    // An entered plane is hidden and bodiless (goal-enter-native): the other flies straight into the door.
    enterPlane(other, gx);
    if (!api.cleared) api.block('both planes entered but the stage did not clear');
  },
};
