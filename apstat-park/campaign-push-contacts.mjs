// Plan a horizontal push without mutating any actor. A blocked cat chain blocks
// the box too; native body-graph carry must never teleport through a neighbor.
export function planBoxPush(previousBox, nextBox, players, pusher, blocked) {
  const dx = nextBox.x - previousBox.x;
  const planned = new Map(), visiting = new Set();
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
  if (!dx) return planned;
  function move(index, obstacle) {
    if (index === pusher) return false;
    if (visiting.has(index)) return false;
    const original = players[index];
    const current = planned.get(index) || original;
    if (!overlaps(current, obstacle)) return true;
    const x = dx > 0 ? obstacle.x + obstacle.width : obstacle.x - current.width;
    const destination = { ...current, x };
    if (blocked(destination)) return false;
    visiting.add(index);
    for (let other = 0; other < players.length; other++) {
      if (other === index || !players[other]) continue;
      if (overlaps(destination, planned.get(other) || players[other]) && !move(other, destination)) return false;
    }
    visiting.delete(index);
    planned.set(index, destination);
    return true;
  }
  for (let index = 0; index < players.length; index++) {
    if (index === pusher || !players[index]) continue;
    if (overlaps(nextBox, planned.get(index) || players[index]) && !move(index, nextBox)) return null;
  }
  return planned;
}
