// 5-2 ALL FOR ONE (stage_multijump01).
// The puzzle: one shared MultiPlayer cat (multi-jump-relay). It may jump in mid air up to 2 times per airtime; only the
// player whose turn it is can start a jump, and every jump passes the turn to the next player. The two "MultiPlayer1"
// switches double the count (2 -> 4 -> 8). Pits have JumpArea nets underneath (jumparea-top-left) that throw a fallen
// cat back up and to the left.
// Route: relay over pit 1 (2 jumps), press switch 1 (4 jumps), relay over pit 2, press switch 2 (8 jumps), then one
// long relay flight across the big pit through the key (2352, 192) up onto the goal ledge (top y 96, x >= 2640).
// Every input is a player's buttons: the relay player presses jump for 14 frames, both players steer.
// At the native 3 px/tick a level jump covers ~100, so pit 1 (192 wide, 2 jumps) needs the first jump from the very
// edge and the relay jump as late as possible (feet ~428, just above the ledge level). The big pit flight stays at
// feet ~230 until past the key (bottom 220) -- a low arc, otherwise the cat passes above it -- then climbs.

const HOLD = 14;

export default {
  party: 2,
  budget: 3000,
  async solve(stage, api) {
    const { game, step } = api;
    const cat = game.players[0];
    const relay = () => [...game.multiRelay.values()][0];
    const n = api.n;
    const holdLeft = new Array(n).fill(0);
    const centre = () => cat.rect.x + cat.rect.width / 2;
    const feet = () => cat.rect.y + cat.rect.height;

    // One frame: everybody steers toward targetX; `press` = the turn player starts a jump now.
    function frame(targetX, press) {
      const dx = targetX - centre();
      const dir = Math.abs(dx) <= 2 ? {} : dx > 0 ? { right: true } : { left: true };
      if (press) holdLeft[relay().turnSlot] = HOLD;
      const specs = [];
      for (let p = 0; p < n; p++) {
        specs[p] = { ...dir, jump: holdLeft[p] > 0 };
        if (holdLeft[p] > 0) holdLeft[p]--;
      }
      step(specs);
    }

    // Fly toward targetX: jump from the ground, then relay a new jump whenever the cat falls below the wanted
    // feet height for its x. Ends once it stands again past `landPast`.
    function fly(targetX, wantFeet, landPast, label, max = 600) {
      let f = 0, left = false;
      while (f++ < max) {
        if (api.cleared) return;
        if (left && cat.grounded) {
          if (centre() >= landPast) return;
          api.block(label + ': landed short at x ' + centre().toFixed(1));
        }
        if (!cat.grounded) left = true;
        const turn = relay().turnSlot;
        const canPress = holdLeft[turn] === 0 && !lastJump[turn];
        const room = cat.maxJumps - cat.jumpsUsed > 0;
        const need = !left || (cat.velocity.y >= 0 && feet() > wantFeet(centre()));
        const press = canPress && room && need && (left || cat.grounded);
        frame(targetX, press);
        for (let p = 0; p < n; p++) lastJump[p] = holdLeft[p] > 0;
      }
      api.block(label + ': no landing in ' + max + ' frames');
    }
    const lastJump = new Array(n).fill(false);

    function walk(x) {
      api.until(() => Math.abs(centre() - x) <= 3, () => {
        const dx = x - centre();
        const dir = dx > 0 ? { right: true } : { left: true };
        return Array.from({ length: n }, () => dir);
      }, 600, 'walk to ' + x);
      api.wait(2);
    }

    // Pit 1 (816..1008): two jumps.
    walk(828);
    fly(1100, () => 428, 1010, 'pit 1');
    // Switch 1 (1200): 2 -> 4 jumps.
    walk(1200);
    if (cat.maxJumps !== 4) api.block('switch 1 did not double the jumps (' + cat.maxJumps + ')');
    // Pit 2 (1392..1728): four jumps.
    walk(1360);
    fly(1800, () => 380, 1730, 'pit 2');
    // Switch 2 (1968): 4 -> 8 jumps.
    walk(1968);
    if (cat.maxJumps !== 8) api.block('switch 2 did not double the jumps (' + cat.maxJumps + ')');
    // The big pit: rise through the key, then up over the goal ledge (top y 96 from x 2640).
    walk(2040);
    fly(2736, (x) => (x < 2380 ? 230 : 60), 2650, 'big pit');
    if (api.carrierOfKey() !== 0) api.block('the cat missed the key');
    // Into the door: both players walk to it and tap UP.
    let f = 0;
    const gx = game.goals[0].rect.x + game.goals[0].rect.width / 2;
    api.until(() => api.cleared, () => {
      f++;
      const dx = gx - centre();
      const dir = Math.abs(dx) <= 4 ? { up: f % 2 === 0 } : dx > 0 ? { right: true } : { left: true };
      return Array.from({ length: n }, () => dir);
    }, 300, 'at the door but no clear');
  },
};
