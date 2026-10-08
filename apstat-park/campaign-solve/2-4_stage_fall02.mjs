// 2-4 GO TOGETHER (stage_fall02).
// The puzzle (party 2): a ledge with two small push boxes and a JumpStandEx in a one-chip notch, then a 1104-wide
// FallBox bridge (top 286) over a Thunder pit, then a sunken room with the Key, WeightedLift (whole party) and the
// door. Intended route: run the FallBox bridge (each box drops 0.22 s after a cat lands on it), drop into the room,
// take the key, enter.
// Runtime finding (2026-10-08): as in 2-2, a FallBox stops being solid the frame it is armed, so the first cat on
// the bridge drops straight through. This solver runs the bridge at full speed and reports where the cat fell.
export default {
  party: 2,
  budget: 3000,
  blocker: 'FallBox (audit: Misread, batch 8 fixed only its anchor): an armed FallBox is no longer solid during its 0.22 s arm delay',
  async solve(stage, api) {
    const { cats, game } = api;
    const runner = cats[1];
    // Along the ledge (over the push boxes and the jump stand notch) to the bridge's west end (x 960).
    api.walkTo([0, 1], [880, 930], { hop: true, max: 900 });
    // The box row is 2 units above the ledge: hop onto it, then run.
    api.hold((i) => [{}, { right: true, jump: i < 10 }], 12);
    let landedAt = -1;
    api.until(() => api.centreX(runner) > 2080, () => {
      const onBridge = api.centreX(runner) > 970;
      if (onBridge && landedAt < 0 && runner.grounded) landedAt = api.frame;
      if (landedAt >= 0 && api.feetY(runner) > 300) {
        const armed = game.fallBoxes.filter((box) => box.falling).map((box) => Math.round(box.rect.x));
        api.block(`cat 1 fell through the FallBox bridge at x ${Math.round(runner.rect.x)}, ${api.frame - landedAt} frames ` +
          `after stepping onto it at full speed; armed boxes (still in place, already non-solid): ${armed.join(', ')}`);
      }
      return [{}, { right: true }];
    }, 400, 'cat 1 did not cross the bridge');
    api.enterGoal();
  },
};
