import { scaledNativeBounds } from './native-body-support.mjs';
const f = Math.fround;

// bc11f30. Shape initialization and actor attachment are separate native calls.
export function createNativeBody() {
  return {
    id: 0, category: 0, priority: 0, flags: 0, responseFlags: 0, type: 0, shape: 0,
    actor: null, world: null,
    rawBounds: { x: 0, y: 0, width: 0, height: 0 },
    localBounds: { x: 0, y: 0, width: 0, height: 0 },
    circleCenter: { x: 0, y: 0 }, circleRadius: 0, pivot: { x: 0, y: 0 },
    position: { x: 0, y: 0 }, passPosition: { x: 0, y: 0 }, previousPosition: { x: 0, y: 0 },
    scale: { x: 1, y: 1 }, requestedScale: { x: 1, y: 1 }, acceptedScale: { x: 1, y: 1 },
    contacts: [], contactCapacity: 0, contactsGrow: false,
    mapContacts: [], pendingMapContacts: [], contactMap: null,
  };
}

// bc12370 enables the body and reserves contacts without resetting movement,
// callbacks, ID, existing contacts, or the unused circle descriptor.
export function initializeNativeRectangleBody(body, bounds, type) {
  body.shape = 0;
  body.type = type;
  body.rawBounds = { x: f(bounds.x), y: f(bounds.y), width: f(bounds.width), height: f(bounds.height) };
  body.localBounds = scaledNativeBounds(body.rawBounds, body.scale, body.pivot);
  body.flags |= 1;
  body.contactCapacity = Math.max(body.contactCapacity, 8);
  body.contactsGrow = true;
  return body;
}

// bc123e0 retains the circle descriptor and derives the rectangle used by
// mixed-shape/map tests. Circle/circle tests have their own native center rule.
export function initializeNativeCircleBody(body, circle, type) {
  const x = f(circle.x), y = f(circle.y), radius = f(circle.radius);
  body.shape = 1;
  body.type = type;
  body.circleCenter = { x, y };
  body.circleRadius = radius;
  body.rawBounds = { x: f(x - radius), y: f(y - radius), width: f(radius + radius), height: f(radius + radius) };
  body.localBounds = scaledNativeBounds(body.rawBounds, body.scale, body.pivot);
  body.flags |= 1;
  body.contactCapacity = Math.max(body.contactCapacity, 8);
  body.contactsGrow = true;
  return body;
}
