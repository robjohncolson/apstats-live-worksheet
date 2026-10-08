// 7-1 MOVE AND STOP (stage_bowwow01).
// The puzzle: one flat room. A sleeping BowwowEnemy floats over the Key (x 768); the door is at x 1056. The dog
// wakes when a cat within range moves, chases moving cats, and a touch kills. Intended route ("move and stop"):
// creep toward the key, freeze whenever the dog opens its eyes, take the key and reach the door the same way.
// Runtime finding (2026-10-08): the port's BowwowEnemy never goes back to sleep. Wake states: 0 -> 1 when a cat is
// within 300; 1 -> 2 on a frame with |velocity| > 1.5; 2 -> 3 on a frame with > 2.5 (any walking frame is 4.9);
// state 3 chases the in-range cat at 10 per tick whether or not it moves, aiming its 60 x 78 body at 64 above the
// cat's feet, which overlaps a standing cat. So the first step within 300 of the dog is fatal and freezing does
// not help. This solver walks cat 1 toward the key and reports the kill.
export default {
  party: 2,
  budget: 1500,
  blocker: 'BowwowEnemy (audit: Misread, 28x22 vs 60x78; wake rule): chase state 3 is permanent and ignores whether the cats move',
  async solve(stage, api) {
    const { cats, game } = api;
    const dog = game.bowwowEnemies[0];
    // Cat 1 walks to the key (752..784); cat 0 stays home, far out of range.
    api.until(() => api.carrierOfKey() === 1, () => {
      if (cats[1].deathTimer > 0) {
        api.block(`the dog (state ${dog.state}) killed cat 1 at x ${Math.round(cats[1].rect.x)} on its way to the key; ` +
          `cat 1 froze as soon as the dog woke and was still caught`);
      }
      // Move and stop: walk only while the dog sleeps (state 0/1); freeze otherwise.
      return [{}, dog.state <= 1 ? { right: true } : {}];
    }, 600, 'cat 1 never reached the key');
    api.enterGoal();
  },
};
