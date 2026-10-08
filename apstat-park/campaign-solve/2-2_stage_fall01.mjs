// 2-2 GO TOGETHER (stage_fall01).
// The puzzle (party 2): a 1296-wide pit bridged by a row of FallBoxes (top 334) between two Rect blocks (top 336).
// A FallBox arms when a cat lands on it and drops 0.22 s later, so the party has to keep running. Rect stepping
// stones float above the bridge (x 1488 / 1872 / 2256, top 240, 94 above the boxes: out of reach of one cat); at
// party 2 the Key sits on the first stone. A Thunder beam runs through the pit.
// Intended route: cat 1 runs the bridge with cat 0 riding its head; near x 1440 cat 0 jumps from the head onto the
// first stone (the key) and back down onto cat 1, which carries it to the right block.
// Runtime finding (2026-10-08): a FallBox stops being solid the frame it is armed (GameRuntime
// stationaryActiveFallBoxRects() drops every box with falling = true, although the box itself keeps its place for
// the 0.22 s arm delay), so the cat that lands on the bridge drops straight through it into the Thunder pit. This
// solver runs the first leg (cat 1 at full speed) and reports where the cat fell through.
export default {
  party: 2,
  budget: 3000,
  blocker: 'FallBox (audit: Misread, batch 8 fixed only its anchor): an armed FallBox is no longer solid during its 0.22 s arm delay',
  async solve(stage, api) {
    const { cats, game } = api;
    const runner = cats[1];   // cat 1 spawns in front
    // Climb the bump and the left block (912..1008, top 336), cat 1 in front.
    api.walkTo([0, 1], [760, 800]);
    api.jumpTo(1, 890); api.jumpTo(1, 980);
    api.jumpTo(0, 890); api.jumpTo(0, 940);
    // Cat 1 hops onto the bridge and runs right at full speed (the fastest anyone can cross).
    api.hold((i) => [{}, { right: true, jump: i < 10 }], 12);
    let landedAt = -1;
    api.until(() => api.centreX(runner) > 2320, () => {
      if (landedAt < 0 && runner.grounded) landedAt = api.frame;
      if (landedAt >= 0 && api.feetY(runner) > 345) {
        const armed = game.fallBoxes.filter((box) => box.falling).map((box) => Math.round(box.rect.x));
        api.block(`cat 1 fell through the FallBox bridge at x ${Math.round(runner.rect.x)}, ${api.frame - landedAt} frames ` +
          `after landing on it at full speed; armed boxes (still in place, already non-solid): ${armed.join(', ')}`);
      }
      return [{}, { right: true }];
    }, 400, 'cat 1 did not cross the bridge');
    // (Not reached in the current runtime.) The key stone and the ride to the door would follow here.
    api.enterGoal();
  },
};
