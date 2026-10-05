// Rect factory: FUN_7ff72bb72ae0, instructions bb76872..bb76970.
// The four body coordinates pass unchanged through FUN_7ff72bb77c10.
export function nativeRect(spawn, partySize) {
  const f = Math.fround;
  const parameter = index => typeof spawn.raw[index] === 'number' ? f(spawn.raw[index]) : 0;
  const extraPlayers = f(partySize - 2);
  let width = f(parameter(6) + f(extraPlayers * parameter(8)));
  const height = f(parameter(7) + f(extraPlayers * parameter(9)));
  let x = f(f(spawn.x) + f(extraPlayers * parameter(10)));
  const bottom = f(f(spawn.y) + f(extraPlayers * parameter(11)));
  if (width < 0) {
    x = f(x + width);
    width = f(-width);
  }
  return { x, y: f(bottom - height), width, height };
}
