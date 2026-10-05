// Packed native colors at c62a040. bc181f0 defaults the input-slot color map
// to identity; saved/custom mappings can be supplied by the scene adapter.
export const NATIVE_PLAYER_COLORS = Object.freeze([
  0xff7fbfff, 0xffff8c8c, 0xffffff8c, 0xffa8ffa8, 0xffffb782,
  0xffffa8ff, 0xffcf9fff, 0xffe0e0e0, 0xffcfb79f, 0xffffffff,
]);

// bb67670. Slot changes affect live input (player+400), sprite color+378,
// embedded input owner+1958, then the two carried attachments+c98/ca0.
export function applyNativePlayerSlot(actor, slot) {
  actor.playerIndex = slot >>> 0;
  if (actor.playerIndex < 10) {
    const colorIndex = actor.scene.playerColorIndices?.[actor.playerIndex] ?? actor.playerIndex;
    actor.spriteColor = actor.appearanceMode === 1 ? 0xffbfffdf : NATIVE_PLAYER_COLORS[colorIndex];
    actor.sharedInputOwner = actor.playerIndex;
  }
  for (let index = 0; index < 2; index++) actor.carriedAttachments[index]?.onCommand(0x2e, null);
}
