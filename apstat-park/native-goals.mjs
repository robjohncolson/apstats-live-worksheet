// Goal contact/command contract: bb531d0, bb53190, bb657c0, bb65430.
// Keep consumption at the following Key PRE, as in the native state-2 path.
const pendingConsumption = new WeakMap();

export function openNativeGoal(runtime, goal) {
  if (goal.opened) return false;
  goal.open?.();
  goal.opened = true;
  runtime.onEvent?.({ type: 'get', playerIndex: -1 });
  return true;
}

export function contactNativeGoalKeys(runtime) {
  let pending = pendingConsumption.get(runtime);
  if (!pending) { pending = new Set(); pendingConsumption.set(runtime, pending); }
  for (const key of runtime.keys) {
    if (!key.active) continue;
    for (const goal of runtime.goals) {
      if (!overlaps(key.rect, goal.rect)) continue;
      openNativeGoal(runtime, goal);
      pending.add(key);
    }
  }
}

export function consumeNativeGoalKeys(runtime) {
  const pending = pendingConsumption.get(runtime);
  if (!pending?.size) return;
  for (const key of pending) key.consume();
  runtime.carriedKeys = runtime.carriedKeys.filter(({ key }) => !pending.has(key));
  pending.clear();
}

export function broadcastNativeGoalOpen(runtime, target) {
  if (!target) return false;
  let changed = false;
  for (const goal of runtime.goals) {
    if (target !== 'Goal' && target !== goal.spawn?.label) continue;
    changed = openNativeGoal(runtime, goal) || changed;
  }
  return changed;
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}
