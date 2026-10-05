const f = Math.fround;

// bb7bbe0 tail, with bb7c950's attachment traversal and bb67e40's depth.
// resolveGoalFollower supplies the native RTTI checks (c62a103, then c62a101)
// and attachment +430 pointer. It must return null for a failed check. Keep
// this explicit until the corresponding attachment actors are assembled.
export function updateNativeSceneOutcomes(scene) {
  const players = scene.players;
  let attachmentCount = 0;
  let doorCount = 0;
  for (const player of players) {
    if (player.controllerKind !== 4) continue;
    doorCount++;
    let current = player;
    while (current.carriedAttachments?.[0]) {
      if (typeof scene.resolveGoalFollower !== 'function') {
        throw new Error('Native goal counting requires attachment RTTI resolution');
      }
      current = scene.resolveGoalFollower(current.carriedAttachments[0]);
      if (!current) break;
      // Native has ten pointer slots and no cycle/deduplication check. Fail
      // explicitly at its capacity rather than inventing a result on overflow.
      if (++attachmentCount > 10) throw new Error('Native goal attachment capacity exceeded');
    }
  }
  scene.goalCount = doorCount + attachmentCount;
  if (players.length > 0 && scene.goalCount === players.length) {
    scene.flags |= 4;
  } else if (scene.stageRetryEligible && !(scene.scrollFlags & 0x40)) {
    const allUnavailable = players.length > 0 && players.every(player =>
      (player.playerFlags & 0x10) || player.controllerKind === 1);
    if ((scene.flags & 8) || allUnavailable) scene.flags |= 2;
  }

  if (!(scene.scrollFlags & 0x800)) return;
  if (players.length > 10) throw new Error('Native player depth capacity exceeded');
  // Stable insertion sort preserves equal-height order, including native's
  // comparison behavior. Do not reorder the scene's player/input slots.
  const ordered = players.slice();
  for (let i = 1; i < ordered.length; i++) {
    const player = ordered[i];
    let slot = i;
    while (slot > 0 && ordered[slot - 1].position.y < player.position.y) {
      ordered[slot] = ordered[slot - 1];
      slot--;
    }
    ordered[slot] = player;
  }
  for (let i = 0; i < ordered.length; i++) {
    ordered[i].spriteDepth = f(f(-0.3) - f(f(i) * f(0.01)));
  }
}
