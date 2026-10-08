// 4-3 GIMMICK GIMMICK (stage_stopwatch01).
// The puzzle (party 2): each cat has a 10-second StopWatch counting down and a floor Switch that stops it. The
// CoopStopWatch panel reveals the hidden Key only when every watch is stopped and the total time left is between
// 0 and n * 0.4 = 0.8 s (raw params after the CoopStopWatch point: lower bound 0, then one factor per party size);
// otherwise the watches reset after 2 s and the party tries again.
// Route: each cat waits beside its switch and steps onto it when its watch shows ~0.3 s left (total ~0.6 s);
// the Key appears at the right wall; cat 1 takes it and both enter the door below it.
export default {
  party: 2,
  budget: 2400,
  async solve(stage, api) {
    const { cats, game } = api;
    const [watch1, watch2] = game.stopWatches;
    const [pad1, pad2] = game.switches;
    const padX = (pad) => pad.rect.x + pad.rect.width / 2;
    // Each cat backs off ~70 units left of its pad (cats keep sliding a little after the button is released).
    api.walkTo([0, 1], [padX(pad1) - 90, padX(pad2) - 90], { tol: 2 });
    api.wait(20);
    // Walking onto the pad takes ~12 frames (0.2 s): start when 0.5 s are left, so each watch stops at ~0.3 s.
    api.until(() => watch1.remainingSeconds <= 0.5, [], 700, 'the stopwatches never ran down');
    api.until(() => watch1.activated && watch2.activated, () => [
      watch1.activated ? {} : { right: true }, watch2.activated ? {} : { right: true },
    ], 60, () => `the cats could not stop their watches (pads pressed: ${pad1.pressed}, ${pad2.pressed})`);
    const total = watch1.remainingSeconds + watch2.remainingSeconds;
    api.until(() => game.keys[0].active, [], 30, `the Key stayed hidden: watches stopped at ${watch1.remainingSeconds.toFixed(2)} + ` +
      `${watch2.remainingSeconds.toFixed(2)} = ${total.toFixed(2)} s (needs 0 < total < 0.8)`);
    // Cat 1 takes the key (right wall, x 752..784) and both enter the door under it.
    api.walkTo(1, 768, { max: 300 });
    api.jump(1, { frames: 40 });
    if (api.carrierOfKey() < 0) api.block('cat 1 could not reach the revealed key');
    api.enterGoal();
    void cats;
  },
};
