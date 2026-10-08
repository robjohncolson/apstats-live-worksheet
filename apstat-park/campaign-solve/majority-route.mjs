// Shared route helpers for the MajorityPlayer stages (5-1 stage_majo01, 5-3 stage_majo02).
// One shared cat steered by a vote over the party's input slots (majority-player). Every helper sends the SAME
// buttons from every one of the api.n slots, so each button reaches the start threshold (ceil(0.7 n) of n) on the
// frame it is pressed. Inputs only: nothing here moves the cat by hand.

export function createMajorityRoute(api) {
  const { game } = api;
  const cat = game.players[0];
  const n = api.n;
  const centre = () => cat.rect.x + cat.rect.width / 2;
  const feet = () => cat.rect.y + cat.rect.height;
  // Every slot holds `spec`, except that the last slot only helps to START a button: it lets go of every button the
  // vote already has on (the others keep it on: half the start ratio, e.g. 1 of 2, 2 of 3).
  const BITS = { jump: 2, up: 3, down: 4, left: 5, right: 6 };
  const voted = (key) => ((game.majorityVote?.cur ?? 0) & (1 << BITS[key])) !== 0;
  const all = (spec) => Array.from({ length: n }, (_, slot) => {
    if (slot < n - 1 || n < 2) return { ...spec };
    const lazy = {};
    for (const key of Object.keys(spec)) if (spec[key] && !voted(key)) lazy[key] = true;
    return lazy;
  });
  const toward = (x, tol) => {
    const dx = x - centre();
    return Math.abs(dx) <= tol ? {} : dx > 0 ? { right: true } : { left: true };
  };
  const dead = () => (cat.deathTimer || 0) > 0;

  function check(label) {
    if (dead()) api.block(label + ': the cat died at x ' + centre().toFixed(1) + ', feet ' + feet().toFixed(1));
  }

  // Walk the cat (on the ground) to centre x.
  function walk(x, { tol = 3, max = 900, label } = {}) {
    let last = centre(), still = 0;
    api.until(() => Math.abs(x - centre()) <= tol, () => {
      check(label || 'walk to ' + x);
      if (Math.abs(centre() - last) < 0.01) still++; else still = 0;
      last = centre();
      if (still > 60) api.block((label || 'walk to ' + x) + ': stuck at x ' + centre().toFixed(1));
      return all(toward(x, tol));
    }, max, label || 'walk to ' + x);
  }

  // A full jump (hold 14 frames) steering toward centre x; ends once the cat has left the ground and landed.
  function jumpTo(x, label, { hold = 14, tol = 2, max = 200 } = {}) {
    let f = 0, left = false;
    api.until(() => f > 2 && left && cat.grounded, () => {
      check(label);
      if (!cat.grounded) left = true;
      const spec = { ...toward(x, tol), jump: f < hold };
      f++;
      return all(spec);
    }, max, label + ': no landing');
    check(label);
  }

  // Stand still until pred() holds.
  function waitUntil(pred, max, label) {
    api.until(pred, () => { check(label); return all({}); }, max, label + ': timed out');
  }

  // Walk into the door and press UP until the stage clears.
  function enter({ goal = game.goals[0], max = 400 } = {}) {
    const gx = goal.rect.x + goal.rect.width / 2;
    let f = 0;
    api.until(() => api.cleared, () => {
      check('door');
      f++;
      const inside = Math.abs(gx - centre()) <= 6;
      return all(inside ? { up: f % 2 === 0 } : toward(gx, 6));
    }, max, () => 'no clear at the door (opened: ' + !!goal.opened + ', key carrier: ' + api.carrierOfKey() + ')');
  }

  return { game, cat, n, all, centre, feet, walk, jumpTo, waitUntil, enter };
}
