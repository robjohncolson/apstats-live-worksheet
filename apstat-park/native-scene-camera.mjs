import { nativeAutoScrollSpeed } from './native-player-boundary.mjs';

const f = Math.fround;
const MAX_FLOAT = f(3.4028234663852886e38);

// bb7c150. Camera bounds use WORLD positions, unlike the display-position
// range used by walking boundaries. cameraBlend is +6acfc; cameraMaxStep is
// +6acf8. Both belong to scene state and must survive between frames.
export function updateNativeSceneCamera(scene) {
  let min = MAX_FLOAT, max = -MAX_FLOAT;
  for (const player of scene.players) {
    if (player.controllerKind === 2 && !(player.spriteFlags & 8)) continue;
    min = Math.min(min, player.position.x);
    max = Math.max(max, player.position.x);
  }
  if (scene.cameraAnchor) {
    min = Math.min(min, scene.cameraAnchor.position.x);
    max = Math.max(max, scene.cameraAnchor.position.x);
  }
  scene.playerMinX = min; // +6ad00
  scene.playerMaxX = max; // +6ad04
  if (scene.scrollMode === 0) return;

  const width = f(1280 / scene.viewScale);
  const left = f(scene.viewPosition.x + scene.viewOffset.x);
  const right = f(left + width);
  let mapRight = f(f(Math.imul(scene.mapWidth, scene.chipSize) >>> 0) + scene.mapOffset);
  if (scene.scrollFlags & 8) mapRight = f(right + width);
  const available = f(mapRight - right);
  if (scene.scrollFlags & 0x80) {
    if (available < 0) scene.viewPosition.x = Math.max(0, f(scene.viewPosition.x + available));
    scene.mapViewLeft = f(scene.viewPosition.x + scene.viewOffset.x);
    return;
  }

  let movement = 0;
  if (scene.scrollLimit >= 0) {
    if (scene.scrollLimit <= left) scene.scrollLimit = -1;
    else movement = f(Math.min(f(scene.scrollLimit - left), 3) + f(.01));
  } else if (scene.scrollMode === 2) {
    movement = nativeAutoScrollSpeed(scene);
  } else if (scene.scrollMode === 1 && !(scene.actorManager.flags & 8)) {
    const targetBlend = scene.scrollFlags & 0x1000 ? 0 : 1;
    if (targetBlend !== scene.cameraBlend) {
      const direction = f(targetBlend - scene.cameraBlend) >= 0 ? 1 : -1;
      scene.cameraBlend = f(scene.cameraBlend + f(direction * f(.05)));
    }
    // bb26bf0 is lerp with no clamping. Native blend can overshoot its target
    // by a float step and oscillate; do not replace it with a snapped easing.
    const gain = f(f(f(f(.1) - 1) * scene.cameraBlend) + 1);
    const center = f(f(f(min + max) * .5) - f(width * .5));
    const delta = f(gain * f(Math.max(0, center) - left));
    const magnitude = Math.abs(delta);
    const limit = f(f(f(scene.cameraMaxStep - magnitude) * scene.cameraBlend) + magnitude);
    movement = delta < -limit ? -limit : delta > limit ? limit : delta;
  }
  if (scene.scrollFlags & 0x10) movement = Math.max(0, movement);
  if (Math.abs(movement) > 2 ** -23) {
    // bb ae6bf0 checks lower bound first, even if the map is narrower than
    // the viewport and the lower/upper bounds are reversed.
    movement = movement < -left ? -left : movement > available ? available : movement;
  }
  scene.viewPosition.x = Math.max(0, f(scene.viewPosition.x + movement));
  scene.mapViewLeft = f(scene.viewPosition.x + scene.viewOffset.x);
}

// bb7bbe0 immediately after camera update. Conversion truncates toward zero,
// so a negative left edge is not equivalent to Math.floor.
export function updateNativeVisibleColumns(scene) {
  const width = f(1280 / scene.viewScale);
  const left = f(scene.viewPosition.x + scene.viewOffset.x);
  scene.visibleMapRect = {
    x: Math.trunc(f(left / scene.chipSize)) | 0,
    y: 0,
    width: (Math.trunc(f(width / scene.chipSize)) + 2) | 0,
    height: -1,
  };
}
