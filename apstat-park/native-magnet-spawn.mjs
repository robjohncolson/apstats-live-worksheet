import { spawnNativePlayerRow } from './native-player-spawn.mjs';
import { createNativeMagnetActor } from './native-magnet-actor.mjs';

// bb72d37..72daf -> bb774a0, bb678f0, bb59090. Local campaign branch.
// The companion is placed before the final Player insertion/Lua settings.
export function spawnNativeMagnetPlayerRow(scene, spawn, { presentation, extensions, randomFloat }) {
  if (scene.limitPlayer && scene.players.length >= scene.playerCount) return null;
  if (!presentation) throw new Error('Native MagnetPlayer requires presentation callbacks');
  if (typeof randomFloat !== 'function') throw new Error('Native MagnetPlayer requires a native random-float adapter');
  return spawnNativePlayerRow(scene, { ...spawn, actorName: 'Player' }, {
    presentation, extensions,
    configureActor(owner) {
      owner.name = (spawn.actorName + (spawn.label ?? '')).slice(0, 31);
      // bb678f0 offsets the texture rectangle, not the collision rectangle.
      owner.spriteUV = { x: .0009765625, y: .0322265625, width: .0302734375, height: .0302734375 };
      presentation.setSpriteUV?.(owner, owner.spriteUV);
      scene.addActor(createNativeMagnetActor({ owner, position: owner.position, randomFloat }));
    },
  });
}
