import { resolveNativeRectanglePair } from './native-rectangle-pair.mjs';
import { resolveNativeCirclePair } from './native-circle-pair.mjs';
import { nativeBodiesOverlap } from './native-body-overlap.mjs';

// Registered rectangle-body pair phases (bc1e050), priority-body recursion
// (bc20280/bc203a0) and contact insertion (bc13830). This is not a replacement
// for the whole bc1da80 pass: map sweeps, scale changes and
// contact callback lifecycle must be supplied/ported separately.
const f = Math.fround;
const EPSILON = 2 ** -23;
const ZERO_MOTION = 2 ** -52;
const PAIR_GAP = f(.01);
const CHAIN_GAP = f(.001);

export function solveNativeBodyPairs(world) {
  let operations = 0;
  const countOperation = () => {
    if (++operations > (world.operationLimit ?? 10000)) {
      throw new Error('Native body solver operation limit reached; state is not certified');
    }
  };
  // Native clears the temporary priority-demotion bit once per world pass.
  for (const body of world.bodies) body.flags &= ~8;
  let result;
  do {
    do { result = solvePhase(world, 0, countOperation); } while (result === 0);
    do { result = solvePhase(world, 1, countOperation); } while (result === 0);
  } while (result === 1);
  return { operations };
}

export function moveNativeBodyChain(world, body, target, countOperation = () => {}) {
  // Native bit 0x10 blocks recursive displacement, separately from priority.
  if (body.flags & 0x10) return false;
  const delta = subtract(target, body.position);
  const actual = moveBodyAgainstMap(world, body, delta);
  if (different(delta, actual)) return false;
  if (Math.abs(delta.x) <= ZERO_MOTION && Math.abs(delta.y) <= ZERO_MOTION) return true;
  return propagateChain(world, body, delta, countOperation);
}

function solvePhase(world, phase, countOperation) {
  countOperation();
  const bodies = world.bodies;
  if (bodies.length < 2) return 2;
  const savedPositions = phase ? bodies.map(body => ({ ...body.position })) : [];
  if (phase && !bodies.some(body => body.flags & 0x40)) return 2;
  let result = 2;
  for (let i = 0; i < bodies.length - 1; i++) {
    const a = bodies[i];
    if (!physical(a) || (!phase && priority(a))) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (!physical(b)) continue;
      if (!phase && priority(b)) continue;
      if (phase && !priority(a) && !priority(b)) continue;
      if (priority(a) && priority(b)) continue;
      if (!((a.flags | b.flags) & 0x40) || !allowed(world, a, b)) continue;
      if (!newOverlap(a, b)) continue;
      countOperation();
      const pairResult = resolvePair(world, a, b, countOperation);
      if (pairResult === 2) continue;
      result = pairResult;
      if (result !== 1) continue;
      // Undo positions for the ENTIRE priority pass. Temporary demotion and
      // already-recorded contact rows intentionally survive this rollback.
      for (let k = 0; k < savedPositions.length; k++) setPosition(bodies[k], savedPositions[k]);
      return 1;
    }
  }
  return result;
}

function resolvePair(world, a, b, countOperation) {
  const circles = a.shape === 1 && b.shape === 1;
  // First compute the ordinary candidate positions. Priority bodies use those
  // same candidates, but move the other body by the rejected correction.
  const result = circles ? resolveNativeCirclePair(a, b)
    : resolveNativeRectanglePair({ ...a, flags: a.flags & ~2 }, { ...b, flags: b.flags & ~2 });
  if (result.status !== 'resolved' && result.status !== 'rewound') return 2;
  if (!circles && (priority(a) || priority(b))) {
    const fixed = priority(a) ? a : b;
    const moving = fixed === a ? b : a;
    const fixedCandidate = fixed === a ? result.positionA : result.positionB;
    const movingCandidate = moving === a ? result.positionA : result.positionB;
    const correction = expand(subtract(fixedCandidate, fixed.position), PAIR_GAP);
    const target = subtract(movingCandidate, correction);
    if (!moveNativeBodyChain(world, moving, target, countOperation)) {
      fixed.flags |= 8;
      return 1;
    }
  } else {
    setPosition(a, result.positionA);
    setPosition(b, result.positionB);
  }
  for (const normal of result.contactsA) recordContact(a, b, normal);
  for (const normal of result.contactsB) recordContact(b, a, normal);
  return 0;
}

function propagateChain(world, body, delta, countOperation) {
  countOperation();
  const expanded = expand(delta, CHAIN_GAP);
  if (!(body.type & 2)) return true;
  // Traverse registered order. Moving a neighbor can change later overlaps.
  for (const other of world.bodies) {
    if (other === body || !physical(other) || !allowed(world, body, other)) continue;
    if (!newOverlap(body, other)) continue;
    if ((body.flags | other.flags) & 0x10) return false;
    const actual = moveBodyAgainstMap(world, other, expanded);
    if (different(expanded, actual)) return false;
    // Raw bc2056e passes the expanded vector in R8; Ghidra omits the argument.
    if (!propagateChain(world, other, expanded, countOperation)) return false;
  }
  return true;
}

function moveBodyAgainstMap(world, body, delta) {
  if (!(body.flags & 1)) return { x: 0, y: 0 };
  if (!(body.type & 1)) {
    // bc12490's non-map branch moves directly but does not write its output
    // displacement. The caller initialized that vector to zero.
    setPosition(body, { x: f(body.position.x + delta.x), y: f(body.position.y + delta.y) });
    return { x: 0, y: 0 };
  }
  if (typeof world.moveMap !== 'function') throw new Error('Native map movement handler is required');
  // Handler follows bc12490: mutate position and return total allowed motion.
  const actual = world.moveMap(body, delta);
  setPosition(body, body.position);
  return actual;
}

function physical(body) {
  return (body.flags & 1) !== 0 && (body.type & 2) !== 0;
}

function priority(body) {
  return (body.flags & 2) !== 0 && (body.flags & 8) === 0;
}

function allowed(world, a, b) {
  return a.category >= 0 && a.category < 32 && b.category >= 0 && b.category < 32
    && Boolean(world.collisionMatrix[a.category * 32 + b.category]);
}

function newOverlap(a, b) {
  return overlaps(a, b, 'position') && !overlaps(a, b, 'previousPosition');
}

function overlaps(a, b, key) {
  return nativeBodiesOverlap(a, b, { previous: key === 'previousPosition' });
}

function setPosition(body, position) {
  body.position = { ...position };
  body.flags = different(body.previousPosition, position) ? body.flags | 0x40 : body.flags & ~0x40;
}

function subtract(a, b) {
  return { x: f(a.x - b.x), y: f(a.y - b.y) };
}

function different(a, b) {
  return Math.abs(f(a.x - b.x)) > EPSILON || Math.abs(f(a.y - b.y)) > EPSILON;
}

function expand(delta, gap) {
  return { x: f(delta.x + (Math.abs(delta.x) > EPSILON ? Math.sign(delta.x) * gap : 0)),
    y: f(delta.y + (Math.abs(delta.y) > EPSILON ? Math.sign(delta.y) * gap : 0)) };
}

export function recordContact(body, other, normal) {
  const contacts = body.contacts ??= [];
  if (contacts.some(contact => contact.bodyId === other.id)) return;
  if (normal.x === 0 && normal.y === -1 && other.contacts?.some(contact =>
    contact.bodyId === body.id && contact.normal.x === 0 && contact.normal.y === -1)) return;
  if (contacts.length >= (body.contactCapacity ?? Infinity) && body.contactsGrow === false) return;
  contacts.push({ state: 0, bodyId: other.id, normal: { ...normal } });
}
