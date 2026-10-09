const V = new URL(import.meta.url).search;
const recovered = await import('./recovered/runtime.mjs' + V);
const { createJump01Art, restoreJump01Steps } = await import('./campaign-jump01.mjs' + V);
const { createCampaignHelpers } = await import('./campaign-helpers.mjs' + V);

export const campaignStages = recovered.stages;
// Bits: 1 left, 2 right, 4 up, 8 down, 16 jump, 32 jump press edge, 64 action held, 256 action press edge,
// 512 up press edge (door enter / exit, goal-enter-native; older journals never set it)
// (native input bit 11, '[shot]'); 128 is the teacher-helper flag (campaign-helpers.mjs), not a button.
export const decodeInput = bits => ({ left: !!(bits & 1), right: !!(bits & 2), up: !!(bits & 4), down: !!(bits & 8),
  jump: !!(bits & 16), jumpPressed: !!(bits & 32), action: !!(bits & 64), actionPressed: !!(bits & 256), upPressed: !!(bits & 512),
  resetPressed: false, prevStagePressed: false, nextStagePressed: false });

// The first cat spawn's y is the stage's floor line (it sits on the Desk's common 700 line when the band allows).
export function campaignSpawnFloor(definition) {
  const spawn = definition.createTable.find(actor => /Player/.test(actor.actorName));
  return spawn?.y ?? 432;
}

// The native screen: 1280 x 720 (DAT_7ff72bc7db94 / DAT_7ff72bc7db90) divided by the stage scale, in world px. The
// native draw FUN_7ff72bc1a830 translates the world by (-(scroll), 0): x scrolls, y is a literal 0, and the stage
// scale fills the window, so the band y 0..720/scale exactly fills the screen, with no letterbox and no zoom.
export const nativeScreen = (definition) => ({ width: 1280 / (definition.scale || 1), height: 720 / (definition.scale || 1) });

// Where render() draws the recovered world on the 750-tall Desk canvas (presentation only; the simulation keeps its
// own transform). The native screen's width fills the 720 column (720 / (1280 / scale)), so the picture in that
// column is exactly what the native screen shows and a walking cat can reach every x in it (the screen clamp
// FUN_7ff72bb7b700 is the same 1280 / scale rect). A wider page (viewW > 720) shows more world at the same scale on
// both sides, faded (render), because natively it is off the screen. The canvas is nearly square, so the 16:9 native
// picture needs a letterbox: the band keeps the spawn floor on the Desk's common 700 line (its door and exit sit on
// it), and the band's bottom never goes below the canvas (2-3 spawns at y 96: anchoring its floor hid the pit).
// Every mode uses it: modes 0 / 2 natively start at scroll 0 (FUN_7ff72bb79d40), mode 0 never scrolls.
export function campaignProjection(definition, floor, viewW = 720, scroll = 0) {
  const pad = (viewW - 720) / 2;
  const screen = nativeScreen(definition);
  const scale = 720 / screen.width;
  return { x: pad - scroll * scale, y: Math.min(700 - floor * scale, 750 - screen.height * scale), scale };
}

export async function createCampaignEngine({ onEvent = () => {} } = {}) {
  await recovered.loadPicoSpriteAtlas();
  const jumpArt = await createJump01Art(document);
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 750;
  const ctx = canvas.getContext('2d');
  const app = new recovered.Application({ width: 720, height: 750, backgroundAlpha: 0, antialias: false,
    resolution: 1, autoStart: false, preserveDrawingBuffer: true });
  let runtime = null, stats = {}, seed = 1, definition = null, floor = 432;
  let projection = { x: 0, y: 0, scale: .5 };
  // Teacher 2026-10-07: never rescale the stage for the page. A wider page shows MORE world at the
  // same scale, centred where the 720-wide column used to be. Render surface only: the simulation
  // keeps its 720 viewport (loadStage) so every client replays identically.
  let viewW = 720;
  function setViewWidth(width) {
    const next = Math.max(720, Math.round(width));
    if (next === viewW) return;
    viewW = next; canvas.width = viewW; app.renderer.resize(viewW, 750);
  }
  let jump01 = false, ticks = 0, colours = [], focusSlot = 0;
  let syncHelpers = () => {};
  function load(stageIndex, partySize, nextSeed) {
    if (runtime) { app.stage.removeChild(runtime.root); runtime.root.destroy({ children: true }); }
    const entry = campaignStages[stageIndex];
    if (!entry) throw new Error('Unknown campaign stage.');
    definition = partySize >= (entry.largeParty?.minimum ?? Infinity) ? entry.largeParty.data : entry.data;
    seed = nextSeed; recovered.setRandomState(seed);
    runtime = new recovered.GameRuntime(next => { stats = next; }, onEvent);
    runtime.loadStage(definition, 720, 750, { partySize, simplifyPassivePlaceholders: false });
    syncHelpers = createCampaignHelpers(runtime, definition, partySize);
    jump01 = entry.source === 'stage_jump01'; ticks = 0;
    if (jump01) restoreJump01Steps(runtime);
    seed = recovered.getRandomState();
    floor = campaignSpawnFloor(definition);
    app.stage.addChild(runtime.root);
  }
  function step(inputs) {
    recovered.setRandomState(seed);
    syncHelpers(inputs);
    const decoded = inputs.map(decodeInput);
    runtime.update(1 / 60, decoded[0] || decodeInput(0), decoded);
    if (jump01) restoreJump01Steps(runtime);
    ticks++;
    seed = recovered.getRandomState();
  }
  function render() {
    if (!runtime) return;
    const world = runtime.world;
    const original = { x: world.x, y: world.y, scale: world.scale.x };
    const pad = (viewW - 720) / 2;   // extra page width, split evenly so the centre never moves
    const overlayX = runtime.overlayLayer.x;
    runtime.overlayLayer.x = overlayX + pad;   // the port's own text was laid out for 720
    const placed = campaignProjection(definition, floor, viewW, runtime.scrollCameraState?.scroll || 0);
    world.scale.set(placed.scale);
    world.x = placed.x;
    world.y = placed.y;
    projection = { x: world.x, y: world.y, scale: world.scale.x };
    // The desk owns the CLEAR celebration; suppress the port's debug instructions.
    runtime.overlayLayer.visible = !stats.cleared;
    ctx.clearRect(0, 0, viewW, 750);
    const hidden = jump01 ? [runtime.tileLayer, ...runtime.staticRects.map(actor => actor.view),
      ...runtime.weightedLifts.map(actor => actor.view), ...runtime.goals.map(actor => actor.view),
      ...runtime.warps.map(actor => actor.view), ...runtime.players.map(player => player.view)] : [];
    const visibility = hidden.map(view => view.visible);
    if (jump01) {
      ctx.save(); ctx.translate(projection.x, projection.y); ctx.scale(projection.scale * 2, projection.scale * 2);
      ctx.imageSmoothingEnabled = false;   // the 1-1 art is drawn in half-scale world units
      jumpArt.terrain(ctx, definition, runtime); ctx.restore();
      hidden.forEach(view => { view.visible = false; });
    }
    app.render();
    ctx.drawImage(app.view, 0, 0);
    hidden.forEach((view, index) => { view.visible = visibility[index]; });
    if (jump01) {
      ctx.save(); ctx.translate(projection.x, projection.y); ctx.scale(projection.scale * 2, projection.scale * 2);
      ctx.imageSmoothingEnabled = false;
      jumpArt.cats(ctx, runtime, ticks, colours, focusSlot); ctx.restore();
    }
    // A wider page shows the world beyond the native screen faded: natively it is off the screen, and a walking cat
    // cannot go there (FUN_7ff72bb7b700).
    if (pad > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, pad, 750); ctx.fillRect(pad + 720, 0, viewW - pad - 720, 750); ctx.restore();
    }
    // death-restarts-stage: the native 0.5 s fade-out before the stage rebuilds (runtime.restartFadeSeconds).
    const fade = runtime.restartFadeSeconds || 0;
    if (fade > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, Math.max(0, 1 - fade / 0.5)); ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, viewW, 750); ctx.restore();
    }
    // Native camera transforms can participate in hazard bounds. Keep presentation
    // changes out of the next physics tick, including during reconnect replay.
    world.position.set(original.x, original.y); world.scale.set(original.scale);
    runtime.overlayLayer.x = overlayX;
  }
  return { load, step, render, canvas, setViewWidth,
    setPresentation(options) { colours = options.colours; focusSlot = options.focusSlot; },
    get runtime() { return runtime; }, get stats() { return stats; },
    getView: () => ({ stats, projection: { ...projection }, viewW, players: (runtime?.players || []).map(player => ({ ...player.rect })),
      screenPlayers: (runtime?.players || []).map(player => ({
        x: (player.rect.x + player.rect.width / 2) * projection.scale + projection.x,
        feet: (player.rect.y + player.rect.height) * projection.scale + projection.y,
      })),
      stage: definition?.name, seed }),
    dispose() { app.destroy(false, { children: true, texture: false, baseTexture: false }); },
  };
}
