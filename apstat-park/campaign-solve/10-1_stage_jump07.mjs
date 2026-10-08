// 10-1 TWO PLAYERS (stage_jump07).
// The puzzle (party 2): SwitchRects are platforms that exist only while their (resetting) Switch is held, so one cat
// holds a switch while the other crosses. Gap 1 (x 432..576): SwitchRect "1" (480..528) appears while a cat stands
// on switch 288 or 720. The long gap (1344..1824): four pads on the stage top (1160..1307) raise SwitchRects 2..5 as
// stepping stones; the far block holds switch 6 (the whole bridge 1344..1824) for the partner. Past the Key, a
// FallBox pit; then the ScaleSwitches, the Gate switch (3408), the SwitchRect "7" step switch (3336 / 3912 inside)
// and the door room behind Gate "1".
// Note: at party 2 the runtime binds cat i to input slot playerInputSlots[i] ([1, 0] here); the driver places
// each cat's buttons in its slot.

export default {
  party: 2,
  budget: 9000,
  blocker: 'FallBox (audit: Misread, batch 8 fixed only its anchor): an armed FallBox stops being solid the tick it is armed',
  async solve(stage, api) {
    const { cats, game } = api;
    // Gap 1 (floor ends 336; brown blocks 384..432 and 576..624; SwitchRect 1 at 480..528 while a pad is held):
    // cat 0 holds pad 288 while cat 1 hops block -> SwitchRect -> block -> floor and holds pad 720 for cat 0.
    api.walkTo(1, 300);
    api.jumpTo(1, 408);
    api.walkTo(0, 288, { tol: 2 });
    api.wait(3);
    api.jumpTo(1, 504);
    api.jumpTo(1, 600);
    api.jumpTo(1, 700);
    api.walkTo(1, 720, { tol: 2 });
    api.jumpTo(0, 408);
    api.jumpTo(0, 504);
    api.jumpTo(0, 600);
    api.jumpTo(0, 690);
    // Up the stairs (912 / 960 / 1008 / 1056, 48 each) onto the stage top (240).
    api.walkTo([0, 1], [1100, 1330], { hop: true, max: 600 });
    // Long gap: cat 0 straddles pads 2+3 (centre 1195), then 3+4 (1234), then 4+5 (1272) -- the stage top is
    // slippery, so it keeps steering; cat 1 hops P2 (1392..1536, top 192) -> drops onto P3 (1488..1632, 288) ->
    // P4 (1680..1728, 288) -> P5 (1776..1824, 240) -> the far block, and stands on pad 6 (1872): SwitchRect 6 then
    // bridges the whole gap for cat 0.
    let aTarget = 1195;
    const steer = (cat, x, tol = 3) => (Math.abs(api.centreX(cat) - x) <= tol ? {} : api.centreX(cat) < x ? { right: true } : { left: true });
    // Cat 1 moves (walk to x, or jump steering to x) while cat 0 holds its pad pair.
    const bWalk = (x, label) => api.until(() => Math.abs(api.centreX(cats[1]) - x) <= 3 && cats[1].grounded,
      () => [steer(cats[0], aTarget), steer(cats[1], x, 3)], 300, label);
    const bJump = (x, label) => {
      let f = 0, left = false;
      api.until(() => left && cats[1].grounded, () => {
        if (!cats[1].grounded) left = true;
        return [steer(cats[0], aTarget), { jump: f++ < 14, ...steer(cats[1], x, 2) }];
      }, 150, label);
    };
    const aMove = (x) => { aTarget = x; api.until(() => Math.abs(api.centreX(cats[0]) - x) <= 6, () => [steer(cats[0], x), {}], 120, 'cat 0 to pad ' + x); };
    aMove(1195);
    bWalk(1325, 'cat 1 to the gap edge');
    api.wait(3);
    bJump(1440, 'cat 1 onto SwitchRect 2');
    bWalk(1580, 'cat 1 down onto SwitchRect 3');
    aMove(1234);
    bWalk(1600, 'cat 1 to the end of SwitchRect 3');
    bJump(1704, 'cat 1 onto SwitchRect 4');
    aMove(1272);
    bJump(1800, 'cat 1 onto SwitchRect 5');
    bWalk(1872, 'cat 1 onto pad 6');
    api.until(() => api.centreX(cats[0]) > 1822, () => [{ right: true }, steer(cats[1], 1872)], 300, 'cat 0 across SwitchRect 6');
    // Both down the steps (1920 / 1968) to the 336 floor; cat 1 (in front) walks through the Key (2048..2080).
    api.walkTo([0, 1], [2100, 2160], { max: 400 });
    if (api.carrierOfKey() < 0) api.block('nobody picked up the key at 2048');
    // FallBox pit (2208..2400): 192 wide, too far for a jump at the same height, so each cat lands on the middle
    // FallBox (2280..2328, top 336) and jumps again before the armed box drops (0.22 s), then the other cat follows.
    // Runtime finding: the box arms on the landing contact and stops being solid in the same tick, so the cat is
    // never grounded on it and falls into the Thunder pit.
    api.walkTo(1, 2185, { tol: 3 });
    const box = game.fallBoxes.find((fallBox) => fallBox.spawn.x === 2304);
    let f = 0;
    api.until(() => cats[1].grounded && f > 3, () => {
      const over = api.centreX(cats[1]) > box.rect.x && api.centreX(cats[1]) < box.rect.x + box.rect.width;
      if (over && api.feetY(cats[1]) > box.rect.y + 6) {
        api.block(`cat 1 landed on the middle FallBox (x ${box.rect.x}, top ${box.rect.y}) and dropped through it the same ` +
          `tick it armed (falling = ${box.falling}); it was never grounded, so it could not jump on to the far side (2400)`);
      }
      return [{}, { jump: f++ < 14, ...steer(cats[1], 2304, 2) }];
    }, 200, 'cat 1 jumping onto the middle FallBox');
    // (Not reached in the current runtime.) Then: jump on to 2400, the other cat follows; ScaleSwitches; one cat holds
    // the Gate 1 switch (3408) while the other climbs SwitchRect 7 and enters the door room.
    api.enterGoal();
  },
};
