// 10-1 TWO PLAYERS (stage_jump07).
// The puzzle (party 2): SwitchRects are platforms that exist only while their (resetting) Switch is held, so one cat
// holds a switch while the other crosses. Gap 1 (x 432..576): SwitchRect "1" (480..528) appears while a cat stands
// on switch 288 or 720. The long gap (1344..1824): four pads on the stage top (1160..1307) raise SwitchRects 2..5 as
// stepping stones; the far block holds switch 6 (the whole bridge 1344..1824) for the partner. Past the Key, a
// FallBox pit (each FallBox holds 0.22 s after a landing, so the cats hop straight on); then the ScaleSwitches
// (walking over them only nudges the size), the SwitchRect "7" step switch (3336; a twin at 3912 inside), the Gate 1
// switch (3408) and the door room behind Gate "1": cat 0 holds the step for cat 1, then the gate; cat 1 walks in and
// holds the inside step switch while cat 0 climbs and slips through the closing gate (it closes at 1/tick).
// Note: at party 2 the runtime binds cat i to input slot playerInputSlots[i] ([1, 0] here); the driver places
// each cat's buttons in its slot.

export default {
  party: 2,
  budget: 9000,
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
    // FallBox pit (2208..2400, Thunder at the bottom): FallBoxes are solid (body = drawn rect inset 2) while armed
    // (0.22 s after a body lands on top) and while falling, but only inside the camera view. Middle box 2280..2328
    // (top 336), low boxes 2232..2280 and 2328..2376 (top 384). Cat 1 lands on the middle box and jumps on to the far
    // ledge (2400.., top 336) before it drops; cat 0 follows box-to-box over the low pair.
    const hopVia = (who, xs, label, { pit = false } = {}) => {
      for (const x of xs) {
        let f = 0, left = false;
        api.until(() => left && cats[who].grounded, () => {
          if (!cats[who].grounded) left = true;
          const specs = [{}, {}];
          specs[who] = { jump: f++ < 14, ...steer(cats[who], x, 2) };
          return specs;
        }, 150, `${label}: cat ${who} jumping to x ${x}`);
        if (pit && api.feetY(cats[who]) > 390) api.block(`${label}: cat ${who} fell into the FallBox pit near x ${Math.round(api.centreX(cats[who]))}`);
      }
    };
    api.walkTo([0, 1], [2120, 2185], { tol: 3 });
    hopVia(1, [2304, 2440], 'middle FallBox', { pit: true });
    hopVia(0, [2256, 2352, 2420], 'low FallBoxes', { pit: true });
    // On east: the 336 ledge (2400..2544) steps down to 384 (2544..2592) and the 432 floor, over the ScaleSwitches.
    api.walkTo([0, 1], [3336, 3500], { tol: 2, max: 600 });
    // Door room (block 3696.., top 336; ceiling to 144) behind Gate 1 (3744..3774, nine 30-high segments: opening
    // retracts them at 2/tick, closing extends them at 1/tick). Floor switches: SwitchRect7 (3320) raises the step
    // SwitchRect 7 (3648..3744, top 384, the only way up the 96 face); Gate1 (3392) opens the gate. Inside, a second
    // SwitchRect7 switch (3896) holds the step for whoever is left outside.
    const gate = game.gates[0];
    const step7 = game.switchRects.find((rect) => rect.spawn.label === '7');
    api.until(() => step7.collisionPublished, [{}, {}], 30, 'cat 0 on the 3320 switch did not raise SwitchRect 7');
    hopVia(1, [3672, 3718], 'up SwitchRect 7');
    if (api.feetY(cats[1]) > 337) api.block('cat 1 did not reach the door-room block top (336) west of Gate 1');
    // Cat 0 opens the gate and stays until it is fully retracted.
    api.walkTo(0, 3408, { tol: 3 });
    api.until(() => gate.opened && gate.segmentMotion.progress <= 0, [{}, {}], 300, 'Gate 1 did not open');
    // Cat 1 walks in onto the inside switch (the step comes back); cat 0 then has ~160 ticks of closing gate.
    api.walkTo(1, 3912, { tol: 3, max: 200 });
    api.until(() => step7.collisionPublished, [{}, {}], 30, 'the inside switch did not raise SwitchRect 7');
    api.walkTo(0, 3615, { tol: 3 });
    hopVia(0, [3672, 3718], 'cat 0 up SwitchRect 7');
    api.walkTo(0, 3820, { tol: 3, max: 120, label: 'cat 0 through the closing Gate 1' });
    api.enterGoal();
  },
};
