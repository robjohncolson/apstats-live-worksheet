// 12-1 LAST PARK (stage_thunder02). Party 2 = cat 0 GuardPlayer DIR_LEFT (6x60 plank at x-15, y-7..y+53) and
// cat 1 plain Player. Input slots are swapped ([1, 0]); step() handles that.
//
// Map (all numbers measured in the runtime):
// - Floor y 384 from x 48 to 672 (cats stand feet 383.7, body y 337.7..383.7). Rect 1 is a ledge from x 667.2 with
//   top y 302.4 (81.3 above the floor). Rect 2 is a pillar x 864..912, top 254.4. PushBox 1 rests on Rect 1 at
//   x 672..720 (top 254.4). Key x 872..904, y 58..114 above the pillar; door x 1128 on Rect 1.
// - Thunder (lower) fires RIGHT from (48, 288): band y 286..290, runs to the first blocker in the band (PushBox at
//   x 672 while it sits on Rect 1, else the pillar at 864, or a guard plank). Thunder (upper) band y 156..160, x 48..1312.
//   Each emitter is also a 32x32 solid block at its spawn (left wall).
// - Max jump rise is 78.57 (any hold >= 14 frames); a cat with anything on its head cannot jump (handOffHeadJump hands the
//   press to the rider). A cat on the floor that rises more than ~47.7 enters the lower band and dies on the 2nd frame
//   (cat 1 jumping in place at x 284 dies at y 282).
// - The guard is immune to both RIGHT beams: its LEFT plank always sits in the band whenever its body does, and the
//   beam is cut at the plank's x. It protects another cat only if that cat is at x >= guard.x - 15, i.e. on its head
//   or to its right, and only while the guard's feet are in (279, 343): on Rect 1, on a dropped PushBox (top 336), or on
//   a floor cat's head.
// - Getting the guard up: cat 1 stands at the wall (x 635.2), the guard climbs onto its head and jumps onto the 4.8-px lip of
//   Rect 1 (x 640, beside the box), then onto the box and down its right side. Pushing the box left drops it to the floor
//   (one probe: lands x 592..640, top 336).
//
// BLOCKED at party 2 (see `blocker`). Nothing here needs a runtime fix to be judged unsolvable: cat 1 must climb
// 81.3 to Rect 1 (or onto the box/guard) through the lower band, and every way up fails by geometry.
export default {
  party: 2,
  budget: 400,
  blocker: 'party 2 cannot get the plain cat above the lower Thunder band (y 286..290). Rect 1 is 81.3 above the floor, ' +
    'max jump rise 78.6, a cat with a rider cannot jump, and the only shield is the guard\'s LEFT plank (protects x >= guard.x-15). ' +
    'Cat 1 can reach the PushBox once the guard shoves it off Rect 1 (it lands on the floor, top 336; a cat on it has y 290, touching ' +
    'but not in the band) by walking off the guard\'s head. From there it needs the guard on Rect 1 to its left: the guard stands at ' +
    'x >= 636 (lip), so cat 1 must clear the guard\'s head (256.4) -- reach from the box top is 336 - 78.57 = 257.4, 1.0 short -- and ' +
    'landing on Rect 1 left of the guard puts it in the beam. Guard on the dropped box (head 290): cat 1 needs 93.7 rise from the floor, ' +
    'or 0 rise from the guard\'s right, where the wall leaves no room. A guard jumping on the floor keeps its plank in the band only ~20 ' +
    'frames per jump (guard y 297..259..297), with ~12-frame gaps; the walk from the ledge to the pillar is ~40+ frames. ' +
    'JumpSwitch "PushBox1" (x 132..168) registers the press (pressedJumpSwitches, alpha .55) but its vy -9 impulse is applied only to ' +
    'normalBoxes, so PushBox 1 never launches (stays y 254.4); even native, the switch is ~470 px from the ledge and the guard (the only shield) ' +
    'would have to be the presser. Needs a larger party (native 8).',
  async solve(stage, api) {
    const { cats, wait, hold, block } = api;
    wait(5);
    // Demonstrate the band: cat 1 jumps in place on the floor and dies in the lower beam.
    hold((f) => [{}, { jump: f < 20 }], 14);
    const died = (cats[1].deathTimer || 0) > 0;
    block('cat 1 jumping in place on the floor ' + (died ? 'dies in the lower Thunder band' : 'survived (band check changed?)'));
  },
};
