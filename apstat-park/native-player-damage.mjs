const f = Math.fround;

// bb69440's command4 client report: low16 is unsigned X modulo1000;
// high16 is truncated Y. This deliberately does not transmit the X band.
export function packNativeDamagePosition(position) {
  const x = Math.trunc(f(position.x)) >>> 0;
  const y = Math.trunc(f(position.y)) | 0;
  return ((y << 16) | (x % 1000)) >>> 0;
}

// Command2f is applied only by a host-owned actor. Keep its current 1000-unit
// X band, never reduce the within-band X, and sign-extend received Y.
export function applyNativeDamagePosition(actor, packed) {
  if (!actor.networkOwner || actor.scene.networkMode !== 2) return;
  const x = Math.trunc(f(actor.position.x)) >>> 0;
  const band = Math.floor(x / 1000) * 1000;
  actor.bodies[0].body.flags &= ~1;
  actor.position = { x: f((band + Math.max(x % 1000, packed & 0xffff)) >>> 0),
    y: f(packed >> 16) };
}

// Damage subset of bb69440, verified from raw disassembly (the function's C
// export is missing). null means continue dispatch to the current controller;
// 1 means handled, matching the native early-return paths. Network callbacks
// expose original packet fields; transporting them remains scene-owned.
export function receiveNativePlayerDamage(actor, command, value) {
  const scene = actor.scene;
  if (command === 0x2f) {
    applyNativeDamagePosition(actor, value);
    return null;
  }
  if (command !== 3 && command !== 4 && command !== 5) return null;
  if (actor.health <= 0 || (actor.playerFlags & 0x80) || scene.damageSuppressed) return null;
  if (command !== 3) {
    scene.playSound('hit');
    if (command === 4) {
      scene.flags |= 0x80; // bc1b7f0
      scene.damageCounter = 0; // scene+51740
    } else scene.recordSpecialDamage(); // bb1b8c0, global one-time flag10
  }
  actor.health = (actor.health - 1) | 0;
  if (actor.health > 0) return 1;
  if (command === 3) {
    if (value != null && value === 0) actor.playerFlags |= 0x10;
    else if (!(actor.networkOwner && scene.networkMode === 1)) actor.fallState = 3;
    return 1;
  }
  if (actor.networkOwner && scene.networkMode === 1) {
    scene.sendNativeDamagePacket({ transport: 'client', target: actor.networkOwner.id,
      channel: 1, kind: 0, command: 3, value: 1 });
    if (command === 4) scene.sendNativeDamagePacket({ transport: 'client', target: actor.networkOwner.id,
      channel: 1, kind: 0, command: 0x2f, value: packNativeDamagePosition(actor.position) });
    scene.sendNativeDamagePacket({ transport: 'client', target: 0xff,
      channel: 1, kind: 2, command: command === 4 ? 1 : 0, value: 0 });
    actor.damageReportPending = 0; // player+428
    return 1;
  }
  if (actor.networkOwner && scene.networkMode === 2) {
    scene.sendNativeDamagePacket({ transport: 'host', target: 0xff,
      channel: 1, kind: 2, command: command === 4 ? 1 : 0, value: 0 });
  }
  actor.fallState = 3;
  return 1;
}
