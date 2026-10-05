import { receiveNativePlayerDamage } from './native-player-damage.mjs';

// bb69440. Actor-specific form/message hooks are required where the original
// dispatcher calls embedded components; controller.receive runs last unless
// a damage or player-number query has already returned a result.
export function receiveNativePlayerCommand(actor, command, value) {
  if (command === 0x1f) return actor.playerIndex === 10 ? 10 : (actor.playerIndex + 1) | 0;
  const damageResult = receiveNativePlayerDamage(actor, command, value);
  if (damageResult !== null) return damageResult;
  if (command === 6) actor.playerFlags |= 0x10;
  else if (command === 9 || command === 10) {
    if (actor.inputMode === 2) actor.formInput.receive(command, value);
    if (command === 9 && actor.inputMode === 3) actor.jumpLimit = (actor.jumpLimit * 2) | 0;
  } else if (command === 0x17) {
    if (actor.inputMode === 3) actor.specialInput.receive(command, value);
  } else if (command === 0x1a) {
    if (actor.inputEnabled > 0) actor.inputEnabled--;
  } else if (command === 0x1b) {
    if (actor.inputEnabled < actor.defaultInputEnabled) actor.inputEnabled++;
  } else if (command === 0x14) actor.inputEnabled = actor.defaultInputEnabled;
  else if (command === 0x1c && actor.manager) {
    actor.flags |= 1;
    actor.onStopped(); // bb38b60 virtual40, including repeated stops
  } else if (command === 0x1d && actor.manager) {
    actor.flags &= ~1;
    actor.onResumed(); // bb6af20 virtual48
  } else if (command === 0x27) {
    actor.playerFlags = value == null || value !== 0 ? actor.playerFlags | 0x80 : actor.playerFlags & ~0x80;
  } else if (command === 0x2b && value != null) actor.setMessage(value); // bb68020
  return actor.controller?.receive(actor, command, value) ?? 0;
}
