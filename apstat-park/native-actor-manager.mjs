// Recovered bba62b0/bba63e0 scheduler and bb9d140/bb9d1f0 dispatch.
// Actor virtual hooks are supplied by the actor implementation. This scheduler
// does not replace their common motion, body, presentation or history logic.
export function createNativeActorManager(priorityCount) {
  return { flags: 0, buckets: Array(priorityCount).fill(null), pending: null };
}

function appendActor(head, actor) {
  if (!head) {
    actor.managerNext = actor;
    actor.managerPrevious = actor;
    return actor;
  }
  actor.managerNext = head;
  actor.managerPrevious = head.managerPrevious;
  head.managerPrevious.managerNext = actor;
  head.managerPrevious = actor;
  return head;
}

// bb9cfe0/bba6530 always queue, even outside a pass. The on-added hook is
// immediate and can register physics bodies before the actor's first PRE.
export function queueNativeActor(manager, actor, priority, context) {
  if (actor.manager) return false;
  const bucket = priority >>> 0;
  const inserted = bucket < manager.buckets.length;
  if (inserted) {
    manager.pending = appendActor(manager.pending, actor);
    actor.references = (actor.references ?? 0) + 1;
    actor.manager = manager;
  }
  actor.managerPriority = bucket;
  actor.onAdded?.(context);
  return inserted;
}

export function markNativeActorForRemoval(actor) { actor.flags = (actor.flags ?? 0) | 0x20; }

// bb9d2b0 -> bba6600. Normal callers request removal with bit 0x20; a queued
// actor is promoted before removal. Immediate removal from the pending ring
// is outside this recovered active-list routine's valid call contract.
export function removeNativeActor(actor) {
  const manager = actor.manager;
  if (!manager) return;
  actor.onRemoved?.();
  manager.onRemoving?.(actor);
  const bucket = actor.managerPriority;
  if (manager.buckets[bucket] === actor) {
    manager.buckets[bucket] = actor.managerNext === actor ? null : actor.managerNext;
  }
  actor.managerPrevious.managerNext = actor.managerNext;
  actor.managerNext.managerPrevious = actor.managerPrevious;
  actor.managerPrevious = null;
  actor.managerNext = null;
  actor.manager = null;
  if (actor.references) {
    actor.references--;
    if (!actor.references) actor.onReleased?.();
  }
}

function promotePendingActors(manager) {
  const first = manager.pending;
  if (!first) return;
  do {
    const actor = manager.pending;
    manager.pending = actor.managerNext;
    actor.managerNext = null;
    actor.managerPrevious = null;
    const bucket = actor.managerPriority;
    manager.buckets[bucket] = appendActor(manager.buckets[bucket], actor);
    if (actor.flags & 0x20) removeNativeActor(actor);
  } while (manager.pending !== first);
  manager.pending = null;
}

function visitActors(manager, dt, dispatch) {
  manager.flags |= 4;
  for (let bucket = 0; bucket < manager.buckets.length; bucket++) {
    let actor = manager.buckets[bucket];
    if (!actor) continue;
    do {
      // Native captures NEXT before invoking the actor, then rereads HEAD.
      const next = actor.managerNext;
      if (!(actor.flags & 1)) dispatch(actor, dt);
      const head = manager.buckets[bucket];
      if (!head || next === head) break;
      actor = next;
    } while (actor);
  }
  manager.flags &= ~4;
}

export function runNativeActorPre(manager, dt) {
  if (manager.flags & 1) return;
  promotePendingActors(manager);
  visitActors(manager, dt, dispatchNativeActorPre);
}

export function runNativeActorPost(manager, dt) {
  if (manager.flags & 1) return;
  visitActors(manager, dt, dispatchNativeActorPost);
}

// historyCursor/+38, historyDelay/+3c and historyCapacity/+40 retain raw
// integer semantics. The actor's history callbacks implement actual snapshots.
export function dispatchNativeActorPre(actor, dt) {
  const flags = actor.flags ?? 0;
  if ((actor.manager.flags & 8) && !(flags & 4)) {
    actor.onAlternatePre?.(dt);
    return;
  }
  if ((flags & 4) && !(flags & 8)) {
    if (!(actor.historyDelay ?? 0) && (flags & 0x10)) actor.historyDelay = 2;
    if ((actor.historyDelay ?? 0) <= (actor.historyCursor ?? 0)) {
      actor.onAlternatePre?.(dt);
      return;
    }
  }
  actor.onPre?.(dt);
  if ((actor.flags & 0x20) && actor.manager) removeNativeActor(actor);
}

export function dispatchNativeActorPost(actor, dt) {
  if (!(actor.manager.flags & 8)) {
    const delay = actor.historyDelay ?? 0;
    if (delay) {
      if (!(actor.flags & 0x10)) actor.historyDelay = delay - 1;
      else actor.historyDelay = Math.min((delay + 2) >>> 0,
        actor.historyCursor ?? 0, actor.historyCapacity ?? 0);
    }
    actor.historyCursor = 0;
  } else {
    if (!(actor.flags & 4)) return;
    const cursor = actor.historyCursor ?? 0;
    actor.historyCursor = (cursor + 1) >>> 0;
    if (!(actor.flags & 8) && (actor.historyDelay ?? 0) <= cursor) return;
  }
  actor.onPost?.(dt);
  if ((actor.flags & 0x20) && actor.manager) removeNativeActor(actor);
}
