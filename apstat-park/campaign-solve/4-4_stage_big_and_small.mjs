// 4-4 GIMMICK GIMMICK (stage_big_and_small).
// The puzzle: ScaleSwitches on the floor shrink (576, 1296: down to 0.4, 12.8 x 18.4) or grow (768, 1488: up to
// m 3.5, body 102.4 x 147.2) the cat standing on them; a small cat stays small, a big one shrinks back slowly. A Rect
// wall at 1008 leaves a 24-unit crawl space (small cats only). Past it, a shelf Rect (x 1728..2160, top 240) holds
// the Key (x 1808, y 116..172) and a tall PushBox (x 2040, 47 x 192); the wall above the shelf's west end (x
// 1728..1776, bottom 220) leaves a 20-unit slot at y 220..240 -- only a small cat fits. The door (x 1800) is under the
// shelf behind a Gate (x 1728) that sinks into the floor while the Switch at the bottom of the shaft past the shelf's
// east end (x 2160..2208, bottom 624) is pressed; the PushBox (192 tall) dropped into the shaft lands on it with its
// top flush with the floor (432).
// Route: both shrink (576) and hop over the 768 grow pad; crawl under the wall; cat 0 climbs onto small cat 1's head;
// cat 1 grows on the 1488 pad and carries cat 0 up (ScaleSwitch growth lifts the cats on its head; head top 284.2);
// cat 1 walks right until it touches the Gate; cat 0 runs to the head's east edge and jumps holding right: its head
// grazes the wall bottom at 220 on the way up and it slides through the slot onto the shelf. Cat 0 jumps under the
// Key (x 1824) to take it, pushes the PushBox east off the shelf into the shaft (Switch pressed, Gate sinks), drops
// onto the box, opens the door and enters (hidden and bodiless from then on); big cat 1 (147.2 tall, clearance under
// the shelf 154) walks under the shelf and enters.
export default {
  party: 2,
  budget: 3000,
  async solve(stage, api) {
    const { cats, game } = api;
    const [rider, grower] = cats;
    const right = (cat) => cat.rect.x + cat.rect.width;
    // Shrink both on the 576 pad; hop over the 768 grow pad.
    api.walkTo(1, 576);
    api.until(() => grower.rect.height < 19, [], 200, 'cat 1 did not shrink on the 576 pad');
    // Take off close to the pad (small cat 12.8 wide, pad 750..786): at native 3 px/tick a jump covers only ~75 px.
    api.walkTo(1, 728); api.jumpTo(1, 860); api.walkTo(1, 900);   // clear of cat 0's landing spot
    api.walkTo(0, 576);
    api.until(() => rider.rect.height < 19, [], 200, 'cat 0 did not shrink on the 576 pad');
    api.walkTo(0, 728); api.jumpTo(0, 820);
    // Crawl under the Rect wall (1008..1056, gap 408..432).
    api.walkTo([0, 1], [1300, 1430], { max: 900 });
    // Cat 0 climbs onto small cat 1's head; cat 1 grows to full size on the 1488 pad, lifting cat 0.
    api.climbOnto(0, 1);
    api.until(() => grower.rect.height > 146.9, () => [{}, api.centreX(grower) < 1488 ? { right: true } : {}],
      400, 'cat 1 did not grow to full size on the 1488 pad');
    const onHead = () => rider.grounded && Math.abs(api.feetY(rider) - grower.rect.y) < 1.5;
    if (!onHead()) api.block(`growth did not lift cat 0 (feet ${api.feetY(rider).toFixed(1)}, cat 1 top ${grower.rect.y.toFixed(1)})`);
    // Cat 1 carries cat 0 to the Gate; cat 0 runs to the head's east edge.
    api.until(() => right(grower) >= 1727.9, [{}, { right: true }], 200, 'cat 1 did not reach the Gate');
    api.until(() => right(rider) >= 1727.9, [{ right: true }, {}], 200, 'cat 0 did not reach the edge of cat 1\'s head');
    // Jump holding right through the slot (y 220..240) onto the shelf.
    api.until(() => rider.grounded && rider.rect.x > 1780, [{ right: true, jump: true }, {}], 60,
      () => `cat 0 did not get through the slot onto the shelf (x ${rider.rect.x.toFixed(1)}, feet ${api.feetY(rider).toFixed(1)})`);
    // Take the Key with a jump under it.
    api.walkTo(0, 1824);
    api.jump(0, { frames: 40 });
    if (api.carrierOfKey() !== 0) api.block('cat 0 did not take the Key from the shelf');
    // Push the PushBox east off the shelf into the shaft onto the Switch.
    const box = game.pushBoxes[0];
    api.until(() => box.rect.x >= 2160, [{ right: true }, {}], 200, 'cat 0 could not push the PushBox off the shelf');
    api.until(() => game.switches[0].pressed, [], 120, 'the PushBox did not press the shaft Switch');
    // Drop onto the box (top flush with the floor), open the door, enter (an entered cat is bodiless: no step aside).
    api.until(() => rider.rect.x > 2160, [{ right: true }, {}], 60, 'cat 0 did not step off the shelf into the shaft');
    api.land(0);
    api.enterOne(0);
    // The big cat walks under the shelf once the Gate has sunk, and enters.
    api.until(() => game.gates[0].rect.y >= 431.9, [], 200, 'the Gate did not sink');
    api.enterOne(1);
  },
};
