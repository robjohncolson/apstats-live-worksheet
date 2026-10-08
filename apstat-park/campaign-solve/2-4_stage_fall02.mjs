// 2-4 GO TOGETHER (stage_fall02).
// Map (party 2): a ledge (top 288, x 48..960) holding two push boxes (451 and 551, 38 x 40) and a one-chip notch
// (624..672) filled by a JumpStandEx (632..664, top 288, launch (3, -18) per tick) on a Rect (322..370); a FallBox
// bridge (23 boxes, body top 288, x 960..2064) over a Thunder pit; a slab (tile top 288, x 2064..2352); the
// WeightedLift (2351..2545, top 288) over the sunken room (floor 432, x 2112..2784) that holds the Key (2216) and
// the door (2568). A Rect hangs over the bridge at x 1728 (y 48..144): any stack taller than 144 hits it.
// FallBox rules (see 2-2): a cat walking behind another falls, so the party crosses as one body: cat 0 climbs onto
// cat 1's head at the bridge's west end and rides it across (92 tall, clears the hanging Rect); the stack walks onto
// the slab, where both cats step off.
// The lift (lua flags {0, 4, 1} at party <= 2, {0, 5, 1} at party >= 3; runtime: flag 1 = minimum load) needs 4
// bodies at party 2: both cats plus both push boxes (party 3: 3 + 2 boxes, party 4: 4 + the one box, party >= 5:
// the cats alone, and there the notch holds a plain Rect instead of the JumpStandEx). So the design is: bring the
// boxes over the bridge. They cannot be pushed over it (push speed 2.45/frame; a FallBox under a body drops 14
// frames after it arms, so anything slower than ~3.7/frame falls through) and can only cross carried on a cat's
// head. The JumpStandEx (the only launcher, with an x component) is how a box would get onto a head: a box pushed
// into the notch should be thrown up and to the right onto a waiting cat.
// Runtime finding (batch 6): a push box pushed into the notch is never launched -- it drops through the stand to
// rest on the Rect below (box y 282, top 6 above the ledge), and the stand's launch (180, -1080)/s is only applied
// to cats (and without its x part). With no way to lift a box onto a head, only the 2 cats reach the lift: BLOCKED.
export default {
  party: 2,
  budget: 3000,
  blocker: 'WeightedLift needs 4 bodies at party 2 (both push boxes too), and the JumpStandEx never launches a push box onto a head',
  async solve(stage, api) {
    const { cats, game } = api;
    const rider = cats[0], carrier = cats[1];   // cat 1 spawns in front
    // Along the ledge (over the jump stand notch) to the bridge's west end; cat 0 onto cat 1's head.
    api.walkTo([0, 1], [820, 930], { hop: true, max: 900 });
    api.climbOnto(0, 1);
    // Cat 1 walks the bridge at full speed with cat 0 riding (kept centred) onto the slab.
    api.until(() => api.centreX(carrier) > 2200, () => {
      const keepUp = api.centreX(rider) < api.centreX(carrier) - 1;
      return [{ right: keepUp }, { right: true }];
    }, 600, 'cat 1 did not cross the bridge');
    api.land();
    // Both cats onto the lift (cat 0 in front, so cat 1 is not blocked by it).
    api.walkTo([0, 1], [2490, 2420], { max: 200 });
    const lift = game.weightedLifts[0];
    const startY = lift.rect.y;
    api.wait(60);
    if (lift.rect.y === startY) {
      const onLift = cats.filter((cat) => Math.abs(api.feetY(cat) - lift.rect.y) < 1 &&
        cat.rect.x + cat.rect.width > lift.rect.x && cat.rect.x < lift.rect.x + lift.rect.width).length;
      const boxesLeft = game.pushBoxes.map((box) => `(${Math.round(box.rect.x)}, ${Math.round(box.rect.y)})`).join(', ');
      api.block(`both cats crossed; ${onLift} cats on the WeightedLift (top ${lift.rect.y}), sign shows ` +
        `${lift.signText?.text ?? '?'} more, lift has not moved in 60 frames; the push boxes are still at ${boxesLeft}`);
    }
    // (Not reached in the current runtime.) The lift sinks into the room: key, then the door.
    api.until(() => lift.rect.y > startY + 100, [], 300, () => 'lift stuck at y ' + lift.rect.y);
    api.land();
    api.walkTo([0, 1], [2232, 2300], { max: 300 });
    api.enterGoal();
  },
};
