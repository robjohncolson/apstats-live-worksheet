// 2-2 GO TOGETHER (stage_fall01).
// Map (party 2): floor top 432 to x 1008 with a bump (864..912, top 384) and the left Rect block (912..1008, top 336);
// a 1296-wide pit (Thunder beam at y 454) bridged by 27 FallBoxes (drawn top 334, body top 336, x 1008..2304);
// the right Rect block (2304..2400, top 336), then floor top 432 to the door (x 2856). Three Rect stepping stones
// float over the bridge (x 1488 / 1872 / 2256, y 240..288): their undersides are 2 above a walking cat's head
// (bridge cat 290..336), so a cat on the bridge passes under them but nothing standing on its head does. The Key
// sits on the first stone (1496, 173..229), reachable only by standing on that stone.
// FallBox rules that shape the route: a box arms when a body rests on it and drops 14 frames later; a walking cat
// (4.9/frame) clears each box in time, but a cat walking behind another one falls (it would need to trail by
// < ~20 px, and cats are 32 wide); boxes outside the camera view are not solid, and the camera only scrolls as far
// as the trailing cat allows, so the party has to cross as one body.
// Route: both cats onto the left block; cat 0 climbs onto cat 1's head; cat 1 walks the bridge at full speed with
// cat 0 riding (rider steers to stay centred). ~55 px before each stone the rider jumps (14-frame hold, still
// moving right at the carrier's speed): it lands on the stone, runs off its right edge and drops back onto cat 1's
// head. Stone 1 gives the key. At stone 3 the rider stays up and runs on to the right block and the floor; cat 1
// walks off the last FallBox onto the right block, then both go to the door.
// The FallBox -> Rect step at x 2304 relies on the runtime setting a cat back on the body it stands on before any
// side push (fallbox-solid-while-armed), as native does.
export default {
  party: 2,
  budget: 3000,
  async solve(stage, api) {
    const { cats } = api;
    const rider = cats[0], carrier = cats[1];   // cat 1 spawns in front
    // Up the bump onto the left block, cat 1 at its right end, cat 0 behind it; then cat 0 onto cat 1's head.
    api.walkTo([0, 1], [760, 800]);
    api.jumpTo(1, 890); api.jumpTo(1, 985);
    api.jumpTo(0, 890); api.jumpTo(0, 930);
    api.climbOnto(0, 1);
    // The bridge: the carrier walks at full speed; the rider stays centred and jumps over each stepping stone.
    const STONES = [1488, 1872, 2256];
    let jumpedAt = -Infinity;
    let stalledSince = -1;
    api.until(() => api.centreX(carrier) > 2340, () => {
      const riderX = api.centreX(rider);
      const beforeStone = STONES.some((x) => riderX > x - 70 && riderX < x - 40);
      if (beforeStone && rider.grounded && api.frame - jumpedAt > 30) jumpedAt = api.frame;
      // Past the last stone the rider runs on to the right block; before it, it keeps over the carrier.
      const keepUp = api.centreX(carrier) - riderX > -1 || riderX > 2200;
      // Report the FallBox -> Rect step (carrier blocked at the Rect side while still on the last box).
      if (Math.abs(carrier.velocity.x) < 0.01 && carrier.grounded && api.centreX(carrier) > 2250) {
        if (stalledSince < 0) stalledSince = api.frame;
        if (api.frame - stalledSince >= 3) {
          api.block(`cat 1 stopped at x ${Math.round(carrier.rect.x)} (right edge ${Math.round(carrier.rect.x + carrier.rect.width)}) ` +
            `on the last FallBox, feet ${api.feetY(carrier)}, against the right Rect block (x 2304, top 336) while holding right; ` +
            `key carrier: cat ${api.carrierOfKey()}`);
        }
      }
      return [{ jump: api.frame - jumpedAt < 14, right: keepUp }, { right: true }];
    }, 600, 'cat 1 did not cross the bridge');
    api.land();
    api.enterGoal();
  },
};
