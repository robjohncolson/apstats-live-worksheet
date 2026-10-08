// 5-4 ALL FOR ONE (stage_multijump02).
// The puzzle: as 5-2, one shared MultiPlayer cat played as a jump relay (multi-jump-relay), here with 10 jumps per
// airtime, over two Thunder pits and under a hanging block whose cavity holds a third beam (y 214).
// Route: relay up onto the first block (top y 144), across pit 1 onto the checkpoint pillar (x 960..1248, top 144),
// then one flight: along the ceiling through the key (1424..1456, y 68..124), down under the hanging block
// (x 1536..1872, bottom y 240: feet kept below ~380 so the head never reaches the cavity beam), and up onto the goal
// floor (x >= 2064, top y 288). Every input is a player's buttons: the turn player presses jump for 14 frames, both
// players steer. Jump budget at 3 px/tick (10 per airtime, 9 used): relay late (feet ~165, just under the key bottom
// + cat height) along the ceiling to the key (3 jumps), free-fall, then long low hops at feet ~430 (the floor Thunder
// is at 454) under the hanging block, and two apex relays (feet 330) up onto the goal floor.

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
    const lastJump = new Array(n).fill(false);
    const centre = () => cat.rect.x + cat.rect.width / 2;
    const feet = () => cat.rect.y + cat.rect.height;
    const alive = () => cat.deathTimer <= 0 && !game.deathFallPlayers.has(cat);

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
      for (let p = 0; p < n; p++) lastJump[p] = specs[p].jump;
    }

    // Fly toward targetX: the turn player starts a jump whenever the cat is falling below wantFeet(x).
    // Ends when it stands again; it must stand at or past landPast.
    function fly(targetX, wantFeet, landPast, label, max = 600) {
      let f = 0, left = false;
      while (f++ < max) {
        if (api.cleared) return;
        if (!alive()) api.block(label + ': the cat died at x ' + centre().toFixed(1) + ', feet ' + feet().toFixed(1));
        if (left && cat.grounded) {
          if (centre() >= landPast) return;
          api.block(label + ': landed short at x ' + centre().toFixed(1));
        }
        if (!cat.grounded) left = true;
        const turn = relay().turnSlot;
        const room = cat.maxJumps < 1 || cat.maxJumps - cat.jumpsUsed > 0;
        const need = !left || (cat.velocity.y >= 0 && feet() > wantFeet(centre()));
        frame(targetX, holdLeft[turn] === 0 && !lastJump[turn] && room && need);
      }
      api.block(label + ': no landing in ' + max + ' frames');
    }

    function walk(x) {
      api.until(() => Math.abs(centre() - x) <= 3, () => {
        const dir = x > centre() ? { right: true } : { left: true };
        return Array.from({ length: n }, () => dir);
      }, 600, 'walk to ' + x);
      api.wait(2);
    }

    // Up onto the first block (x 288..576, top 144).
    fly(420, (x) => (x < 300 ? 130 : Infinity), 300, 'first block');
    // Across pit 1 onto the checkpoint pillar (x 960..1248, top 144).
    walk(560);
    fly(1100, (x) => (x < 990 ? 130 : Infinity), 980, 'pit 1');
    // Key along the ceiling, down under the hanging block, up onto the goal floor (top 288 from x 2064).
    walk(1230);
    fly(2150, (x) => (x < 1440 ? 165 : x < 1900 ? 430 : x < 2080 ? 330 : Infinity), 2070, 'key and pit 2');
    if (api.carrierOfKey() !== 0) api.block('the cat missed the key');
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
