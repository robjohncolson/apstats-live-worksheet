// Teachers are optional physical cats. Their presence travels in the same input
// journal as student movement, so late joins and replays stay deterministic.
export function createCampaignHelpers(runtime, definition, requiredCount) {
  const helpers = new Map();
  runtime.requiredPlayerCount = requiredCount;
  const spawn = definition.createTable.find(row => /Player/.test(row.actorName));
  return inputs => {
    for (let slot = requiredCount; slot < inputs.length; slot++) {
      if (!(inputs[slot] & 128) || helpers.has(slot)) continue;
      runtime.addRuntimePlayer({ ...spawn, actorName: 'Player', label: String(slot + 1), raw: [...spawn.raw] });
      const player = runtime.players.at(-1);
      player.parkHelper = true;
      runtime.playerInputSlots[runtime.players.length - 1] = slot;
      helpers.set(slot, player);
    }
    for (const [slot, player] of helpers) {
      if (inputs[slot] & 128) continue;
      // removeRuntimePlayer (patch optional-teacher-cats) also clears every retained reference to the cat
      // (a WarpGun hold, magnet, carried key, ride state), so nothing later touches the destroyed view.
      if (runtime.players.includes(player)) {
        runtime.removeRuntimePlayer(player);
        player.view.destroy({ children: true });
      }
      helpers.delete(slot);
    }
  };
}
