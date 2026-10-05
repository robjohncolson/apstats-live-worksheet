import { createNativeSeesaw } from './native-seesaw.mjs';
import { createNativeBalance } from './native-balance-actor.mjs';
import { createNativePhysicsArea } from './native-physics-area.mjs';
import { createNativePhysicsBallPitcher } from './native-physics-ball-pitcher.mjs';
import { createNativePhysicsSwitch } from './native-physics-switch.mjs';
import { createNativeGoalActor } from './native-goal-actor.mjs';
import { createNativeKeyActor } from './native-key-actor.mjs';
import { queueNativeActor } from './native-actor-manager.mjs';

// bb72ae0's rigid-puzzle and Goal factory branches. Other stage actors are left to
// the caller; they must share this scene for native custom-body interactions.
// Lookup is immediate against earlier rows, not a second-pass reordering.
export function populateNativeSeesawActors(scene, spawns) {
  const entries = [];
  for (const spawn of spawns) {
    const position = { x: spawn.x, y: spawn.y };
    const name = (spawn.actorName + (spawn.label ?? '')).slice(0, 31);
    const params = spawn.raw.slice(6);
    let actor;
    switch (spawn.actorName) {
      case 'Key':
        if (scene.findActor ? scene.findActor(name) : entries.some(entry => entry.actor.name === name)) continue;
        actor = createNativeKeyActor({ name, position, params, partySize: scene.playerCount });
        break;
      case 'BreakoutKey':
        actor = createNativeKeyActor({ name, position, params, partySize: scene.playerCount,
          mode: 1 });
        break;
      case 'Goal':
        actor = createNativeGoalActor({ name, position });
        break;
      case 'SeesawParent':
      case 'Seesaw': {
        const parent = spawn.actorName === 'SeesawParent';
        actor = createNativeSeesaw({ position, parent, type: Math.trunc(params[0] ?? 0) });
        if (!parent && Math.trunc(params[1] ?? 0)) {
          const target = scene.findActor ? scene.findActor('SeesawParent') :
            entries.find(entry => entry.actor.name === 'SeesawParent')?.actor;
          if (target) actor.connectParent(target);
        }
        break;
      }
      case 'Balance':
        actor = createNativeBalance({ name, position, span: params[0] ?? 0 });
        break;
      case 'PhysicsArea':
      case 'PhysicsRect':
        actor = createNativePhysicsArea({ position, area: spawn.actorName === 'PhysicsArea',
          x: params[0] ?? 0, y: params[1] ?? 0, width: params[2] ?? 0, height: params[3] ?? 0 });
        break;
      case 'PhysicsBallPitcher':
        actor = createNativePhysicsBallPitcher({ spawn, partySize: scene.playerCount });
        break;
      case 'PhysicsSwitch':
        actor = createNativePhysicsSwitch({ name, position });
        break;
      default:
        continue;
    }
    actor.name = name;
    if (scene.addActor) scene.addActor(actor);
    else queueNativeActor(scene.actorManager, actor, 0, scene);
    entries.push({ spawn, actor });
  }
  return entries;
}
