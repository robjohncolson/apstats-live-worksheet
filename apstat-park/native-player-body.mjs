import { createNativeActorRectangle } from './native-actor-bodies.mjs';

// bb6a3b0's ordinary constructor path, including raw c62d1a8 bounds. Alternate
// shape construction (nonzero native parameter) belongs to its form adapter.
export function createNativePlayerBody(actor) {
  const body = createNativeActorRectangle(actor, { x: -16, y: -47, width: 32, height: 46 }, 3, true);
  if (!body.world) body.priority = -1;
  body.category = 1;
  body.flags |= 4; // native narrow UP-contact refresh
  body.pivot = { x: 0, y: -1 }; // body+44; unit scale leaves local bounds unchanged
  body.onContactBegin = (other, normal, kind) => actor.controller?.contact?.(actor, other, normal, kind);
  return body;
}

// bb67cc0. This is stronger than the hidden-controller enter/leave: it also
// forwards visibility to components and stops/resumes manager scheduling.
export function setNativePlayerEnabled(actor, enabled) {
  actor.spriteFlags = enabled ? actor.spriteFlags | 8 : actor.spriteFlags & ~8;
  for (const component of actor.components) component.setEnabled?.(enabled);
  const body = actor.bodies[0].body;
  body.flags = enabled ? body.flags | 1 : body.flags & ~1;
  if (!actor.manager) return;
  actor.flags = enabled ? actor.flags & ~1 : actor.flags | 1;
  if (enabled) actor.onResumed();
  else actor.onStopped();
}
