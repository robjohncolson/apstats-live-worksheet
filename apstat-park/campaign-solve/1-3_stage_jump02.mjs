// 1-3 HELLO PICO PARK (stage_jump02).
// The puzzle: the party spawns stacked on a one-chip pillar between pits (a Warp under them drops a fallen cat back
// onto the pillar from the sky); at party 2 box "8" falls onto the stack. A Rect staircase (lowest step top 288)
// leads up to a long platform with the Key and the Bridge switch (retaining: it extends the floor bridge across the
// pits AND raises Bridge "2", a wall that cuts the platform off from the stairs). At the platform's right end, Gates
// open only while all four floor switches (SwitchMediator, party 2) are held: here by one cat and the three boxes.
// Route: re-stack as cat 0 / box 8 / cat 1 (cat 1 hops the box, walks off, warps back on top); cat 1 jumps from
// the box to the stairs, climbs, presses the bridge switch and takes the key. Cat 0 hops box 8 off its head onto
// the bridge (jump = head box hops; step back under it) and pushes box 8 into box 4 into box 6: the three-box line
// plus cat 0 hold all four pads. Cat 1 walks through the open gates, drops to
// the floor and both enter the door.
export default {
  party: 2,
  budget: 8000,   // native 1/tick pushes (batch 10)
  async solve(stage, api) {
    const { cats, game } = api;
    const box8 = game.pushBoxes.find((box) => box.spawn.label === '8');
    api.wait(40);   // box 8 lands on cat 1's head
    // Cat 1 presses jump (the head box hops; the cat does not rise) and walks off the stack into the pit; box 8
    // lands back on cat 0; the Warp drops cat 1 onto box 8.
    api.hold((f) => [{}, { jump: f < 2, right: f >= 2 && f < 30 }], 30);
    api.until(() => cats[1].grounded && api.feetY(cats[1]) < box8.rect.y + 2, [], 200, 'cat 1 did not warp back onto box 8');
    api.wait(5);
    // From the box top (feet ~336) up the five steps to the platform (top 96). At the native 3/tick a jump covers
    // ~80 to the first step's top, so cat 1 first edges to the box's right edge (box 388..428 -> cat x ~420).
    api.walkTo(1, 436, { tol: 1 });
    for (const x of [536, 584, 632, 680, 728]) api.jumpTo(1, x);
    api.walkTo(1, 1060);   // over the bridge switch (912) and through the key (1040..1072)
    if (api.carrierOfKey() !== 1) api.block('cat 1 walked the platform without picking up the key');
    // Cat 0, box 8 on its head, steps onto the extended bridge, presses jump (the head box hops; the cat stays) and
    // steps back left under the hop, so box 8 lands on the bridge in front of it, clear of the low first step.
    api.until(() => game.bridges[0].rect.x <= 410, [], 400, 'the floor bridge did not extend');
    api.walkTo(0, 470, { tol: 2 });
    // The hop lasts ~20 ticks; at 3/tick cat 0 needs >= 13 ticks of walking to clear the 40-wide box (16 ticks: x 454 -> 406).
    api.hold((f) => [{ jump: f < 2, left: f >= 2 && f < 18 }], 30);
    api.wait(10);
    if (box8.rect.y + box8.rect.height < 431 || box8.rect.x < cats[0].rect.x + 30) {
      api.block('box 8 did not land on the bridge in front of cat 0: ' + JSON.stringify(box8.rect));
    }
    // Push the line box 8 / box 4 / box 6 onto the switches; cat 0 stops at x 1408 (cat, then each 40-wide box,
    // overlapping one pad each).
    api.until(() => cats[0].rect.x >= 1408, [{ right: true }], 2000, 'the box line did not reach the switches');
    const pressed = () => game.switches.filter((pad) => pad.spawn.label === 'SwitchMediator').every((pad) => pad.pressed);
    api.wait(3);
    if (!pressed()) api.block('cat 0 + boxes 8/4/6 do not hold all four SwitchMediator pads: ' +
      game.switches.map((pad) => pad.pressed).join(','));
    // Cat 1 walks the platform through the opened gates, drops to the floor and enters first (it has the key).
    api.until(() => game.gates.every((gate) => gate.rect.height < 40), [], 200, 'the gates did not open');
    api.walkTo(1, 1790, { max: 400 });
    api.land(1);
    api.enterOne(1);
    // Cat 0 leaves its pad (the gates close behind cat 1), climbs onto the box line, walks across it and enters.
    api.walkTo(0, 1380);
    api.jumpTo(0, 1470);
    api.walkTo(0, 1600);
    api.land(0);
    api.enterGoal();
  },
};
