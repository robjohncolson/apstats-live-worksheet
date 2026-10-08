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
    // Original map/physics units, displayed at the desk's existing half scale.
    const spawn = definition.createTable.find(actor => /Player/.test(actor.actorName));
    floor = spawn?.y ?? 432;
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
    if (definition.scrollable || definition.autoScroll) {
      world.scale.set(.5);
      world.x = pad - (runtime.scrollCameraState?.scroll || 0) * .5;
      world.y = 700 - floor * .5;
      if (jump01) {
        const local = runtime.players.find((_, index) => runtime.playerInputSlots[index] === focusSlot) || runtime.players[0];
        const centre = (local.rect.x + local.rect.width / 2) / 2;
        const mapW = definition.map.width * definition.map.chipSize / 2;
        world.x = mapW <= viewW ? (viewW - mapW) / 2 : -Math.max(0, Math.min(mapW - viewW, centre - viewW / 2));
      }
    } else {
      // Fixed-screen puzzles fit entirely above the common floor line.
      const size = Math.min(.5, 680 / (definition.map.width * definition.map.chipSize),
        610 / (definition.map.height * definition.map.chipSize));
      world.scale.set(size);
      world.x = (viewW - definition.map.width * definition.map.chipSize * size) / 2;
      world.y = 700 - (definition.map.height - 1) * definition.map.chipSize * size;
    }
    projection = { x: world.x, y: world.y, scale: world.scale.x };
    // The desk owns the CLEAR celebration; suppress the port's debug instructions.
    runtime.overlayLayer.visible = !stats.cleared;
    ctx.clearRect(0, 0, viewW, 750);
    const hidden = jump01 ? [runtime.tileLayer, ...runtime.staticRects.map(actor => actor.view),
      ...runtime.weightedLifts.map(actor => actor.view), ...runtime.goals.map(actor => actor.view),
      ...runtime.warps.map(actor => actor.view), ...runtime.players.map(player => player.view)] : [];
    const visibility = hidden.map(view => view.visible);
    if (jump01) {
      ctx.save(); ctx.translate(projection.x, projection.y); ctx.imageSmoothingEnabled = false;
      jumpArt.terrain(ctx, definition, runtime); ctx.restore();
      hidden.forEach(view => { view.visible = false; });
    }
    app.render();
    ctx.drawImage(app.view, 0, 0);
    hidden.forEach((view, index) => { view.visible = visibility[index]; });
    if (jump01) {
      ctx.save(); ctx.translate(projection.x, projection.y); ctx.imageSmoothingEnabled = false;
      jumpArt.cats(ctx, runtime, ticks, colours, focusSlot); ctx.restore();
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
