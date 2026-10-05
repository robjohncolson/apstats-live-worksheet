// Shared launcher: bb37d70, bb37f30, bb38130, bb38210, bb383e0.
// Collision/movement belong to the spawned projectile, not the launcher.
export function createNativePitcher({ spawn, partySize, createProjectile, sendCommand = () => {} }) {
  const angle = Math.trunc(Number(spawn.raw[6]) || 0);
  const halfTurns = Math.fround(Math.fround(angle) / Math.fround(180));
  const units = Math.trunc(Math.fround(halfTurns * Math.fround(32768)));
  const radians = Math.fround(Math.fround(units) * Math.fround(0.0000958738019107841));
  const direction = { x: Math.fround(Math.sin(radians)), y: Math.fround(-Math.cos(radians)) };
  const variableSpeed = ['BoundBallPitcher', 'PhysicsBallPitcher'].includes(spawn.actorName);
  let baseSpeed = 5;
  if (variableSpeed) {
    if (partySize !== 1 && Math.trunc(Number(spawn.raw[7]) || 0) > 0) {
      baseSpeed = Math.fround(Math.fround(Number(spawn.raw[6 + partySize - 1]) || 0) * Math.fround(0.1));
    }
  } else {
    baseSpeed = typeof spawn.raw[7] === 'number' ? Math.fround(spawn.raw[7]) : 0;
  }
  let speed = baseSpeed, scale = 1, firstTick = true, child = null, stopped = false, completionTarget = '';

  return {
    get state() { return { speed, baseSpeed, scale, child, stopped }; },
    receiveCommand(command, payload) {
      if (command === 0x15) speed = Math.fround(speed * (payload === undefined ? 2 : payload));
      else if (command === 0x16) speed = baseSpeed;
      else if (command === 0x23) speed = Math.fround(payload);
      else if (command === 0x21) scale = Math.fround(payload);
      else if (command === 0x2a) scale = Math.fround(1.6);
      else if (command === 0x0d) completionTarget = typeof payload === 'string' ? payload : '';
    },
    tick() {
      if (stopped) return;
      if (firstTick) { firstTick = false; return; }
      if (!child) {
        child = createProjectile({
          kind: spawn.actorName,
          x: Math.fround(Math.fround(spawn.x) + Math.fround(direction.x * 20)),
          y: Math.fround(Math.fround(spawn.y) + Math.fround(direction.y * 20)),
          velocity: { x: Math.fround(direction.x * speed), y: Math.fround(direction.y * speed) },
          scale, target: typeof spawn.raw[8] === 'string' ? spawn.raw[8] : '',
        });
        return;
      }
      if (!child.removed) return;
      child = null;
      if (completionTarget) { sendCommand(completionTarget, 0x0d); stopped = true; }
    },
  };
}
