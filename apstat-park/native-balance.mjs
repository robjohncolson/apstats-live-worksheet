import { countNativeContactBodies } from './native-body-contact-count.mjs';
const f = Math.fround;
const EPSILON = 2 ** -23;
const MIN_SPEED = f(.2); // bc7d858
const MAX_SLOPE = f(Math.tan(.12217304855585098)); // bcb6210 double, tan import

// bb31050's first operation counts category-1 players through UP contacts,
// including stacks; non-player bodies are neither counted nor traversed.
export function refreshNativeBalanceLoad(platform) {
  platform.supportCount = countNativeContactBodies(platform.body, { x: 0, y: -1 }, 2);
}

// bb315f0 was absent from the C export. Reconstructed from its machine code.
// Children expose +3f8 targetOffset, +3fc currentOffset, +400 speed, +404 load.
export function updateNativeBalance(balance, { playerCount, sendCommand }) {
  if (balance.remote) return;
  const { left, right } = balance;
  const countDifference = (right.supportCount - left.supportCount) | 0;
  const load = f(f(countDifference) / f(f(playerCount >>> 0) * .5));
  const ratio = Math.max(-1, Math.min(1, load));
  const halfSpan = f(f(balance.span) * .5);
  const extent = f(MAX_SLOPE * halfSpan);
  left.targetOffset = Math.abs(ratio) > EPSILON ? f(f(-ratio) * extent) : 0;
  right.targetOffset = f(-left.targetOffset);

  let speed = Math.max(Math.abs(ratio), MIN_SPEED);
  if (ratio > 0 && (f(right.targetOffset - right.currentOffset) < 0
    || f(left.targetOffset - left.currentOffset) > 0)) speed = MIN_SPEED;
  if (ratio < 0 && (f(left.targetOffset - left.currentOffset) < 0
    || f(right.targetOffset - right.currentOffset) > 0)) speed = MIN_SPEED;
  left.speed = right.speed = speed;

  const height = Math.max(Math.abs(left.currentOffset), Math.abs(right.currentOffset));
  const signedHeight = f((right.currentOffset >= 0 ? 1 : -1) * height);
  const angle = f(Math.atan2(signedHeight, halfSpan));
  // Actor name is class name + row label, e.g. BalanceSeesawParent.
  const target = balance.name.length > 7 ? balance.name.slice(7, 32) : '';
  sendCommand(target, 12, angle);
}
