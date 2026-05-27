// Level Editor v1 -- rendering layer.
//
// Pure JS, no DOM access beyond what the caller passes in (canvas ctx + atlas image).
// Exports onto window.LE.render. Other agents own HTML/CSS, model, and UI wiring.
//
// See LEVEL_EDITOR_V1_BUILD.md "Actor schema reference" + "Render contract" for the
// authoritative shape of each actor. Atlas region coords are loaded from
// pico_sprite1.json (40 regions). Procedural draws are ~10% fidelity per spec --
// recognizable, not pixel-perfect; the real cockpit is the sim-mode launcher.

(function () {
  'use strict';

  // Namespace bootstrap. Idempotent so reload order does not matter.
  window.LE = window.LE || {};

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  // Each chip = 30 CSS px in the editor (vs 10 in the cr engine -- 3x zoom for
  // visibility). GRID padding is the inset between the canvas edge and chip (0,0).
  var EDITOR_CHIP_PX = 30;
  var GRID_TOP_PAD = 20;
  var GRID_LEFT_PAD = 20;

  // Camera viewport preview width -- matches the cr engine's 64-chip render window.
  var CAMERA_DEFAULT_WIDTH = 64;

  // Canvas background + chip-grid line colors.
  var BG_COLOR = '#1a1f2b';
  var GRID_LINE_COLOR = 'rgba(255, 255, 255, 0.06)';
  var GRID_LINE_MAJOR_COLOR = 'rgba(255, 255, 255, 0.14)';
  var CAMERA_DIM_COLOR = 'rgba(0, 0, 0, 0.30)';

  // Selection outline.
  var SELECT_COLOR = '#3b82f6';
  var SELECT_LINE_WIDTH = 2;

  // Procedural draw palette. Colors chosen to roughly match the cr renderer.
  var COLOR_TEXT_FILL = '#ffffff';
  var COLOR_TEXT_BORDER = '#222222';
  var COLOR_TEXT_INK = '#111111';
  var COLOR_HUD_FILL = '#fef3c7';
  var COLOR_HUD_BORDER = '#92400e';
  var COLOR_TALLY_FILL = '#fde047';
  var COLOR_TALLY_BORDER = '#a16207';
  var COLOR_CHUTE_A = '#f59e0b';
  var COLOR_CHUTE_B = '#3b82f6';
  var COLOR_CHUTE_DEFAULT = '#6b7280';
  var COLOR_GATE_ALWAYS_FALSE = '#dc2626';
  var COLOR_GATE_ROW_COMPLETE = '#f59e0b';
  var COLOR_GATE_TALLY_NONZERO = '#16a34a';
  var COLOR_GATE_BORDER = '#1f2937';
  var COLOR_SLOT_BORDER = '#475569';
  var COLOR_SLOT_LIT_FILL = '#16a34a';
  var COLOR_SLOT_UNLIT_FILL = '#1f2937';
  var COLOR_GOALPAD_FILL = '#22c55e';
  var COLOR_GOALPAD_RING = '#bbf7d0';
  var COLOR_RETURNWARP_OUTER = '#fb923c';
  var COLOR_RETURNWARP_INNER = '#fff7ed';
  var COLOR_GOAL_TINT = 'rgba(34, 197, 94, 0.45)';
  var COLOR_MISSING_ATLAS_BG = '#fde2e2';
  var COLOR_MISSING_ATLAS_BORDER = '#b91c1c';
  var COLOR_MISSING_ATLAS_INK = '#7f1d1d';

  // Font stack. Px-anchored to chip size so labels scale if EDITOR_CHIP_PX changes.
  var FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  // ---------------------------------------------------------------------------
  // State -- atlas image + sprite region map.
  // ---------------------------------------------------------------------------

  var render = {
    EDITOR_CHIP_PX: EDITOR_CHIP_PX,
    GRID_TOP_PAD: GRID_TOP_PAD,
    GRID_LEFT_PAD: GRID_LEFT_PAD,

    // Populated by loadSpriteRegions(). Keyed by region.name -> {x, y, w, h}.
    spriteRegions: {},

    // Stashed by setAtlas(). null until the UI agent passes in <img id="le-atlas">.
    atlasImg: null,
    atlasReady: false
  };

  // ---------------------------------------------------------------------------
  // Setup -- atlas image + region map.
  // ---------------------------------------------------------------------------

  // Resolve the path to pico_sprite1.json. The editor lives in /tools/, the
  // sprite map lives one dir up. Allow override for tests via window.LE_SPRITE_JSON.
  function spriteJsonUrl() {
    if (window.LE_SPRITE_JSON) return window.LE_SPRITE_JSON;
    return '../pico_sprite1.json';
  }

  // pico_sprite1.json on disk contains literal CR/LF inside the "notes" string
  // literals -- that is invalid JSON. We defensively strip control chars inside
  // strings before parsing so the editor still loads. The map ships with this
  // defect today (40 regions parse cleanly once stripped).
  function parseSpriteJson(rawText) {
    var cleaned = '';
    var inString = false;
    var escape = false;
    for (var i = 0; i < rawText.length; i++) {
      var ch = rawText[i];
      var code = rawText.charCodeAt(i);
      if (inString) {
        if (escape) {
          cleaned += ch;
          escape = false;
          continue;
        }
        if (ch === '\\') {
          cleaned += ch;
          escape = true;
          continue;
        }
        if (ch === '"') {
          cleaned += ch;
          inString = false;
          continue;
        }
        // Strip raw control chars (CR=13, LF=10, TAB=9) from inside strings.
        if (code === 13 || code === 10 || code === 9) {
          cleaned += ' ';
          continue;
        }
        cleaned += ch;
        continue;
      }
      if (ch === '"') {
        cleaned += ch;
        inString = true;
        continue;
      }
      cleaned += ch;
    }
    return JSON.parse(cleaned);
  }

  function indexRegionsFromArray(arr) {
    render.spriteRegions = {};
    for (var i = 0; i < arr.length; i++) {
      var r = arr[i];
      if (!r || typeof r.name !== 'string') continue;
      render.spriteRegions[r.name] = {
        x: r.x | 0,
        y: r.y | 0,
        w: r.w | 0,
        h: r.h | 0
      };
    }
    return render.spriteRegions;
  }

  render.loadSpriteRegions = function loadSpriteRegions() {
    // Prefer inline data (works under file:// where fetch is CORS-blocked).
    if (typeof window !== 'undefined' && Array.isArray(window.LE_SPRITE_REGIONS)) {
      return Promise.resolve(indexRegionsFromArray(window.LE_SPRITE_REGIONS));
    }
    var url = spriteJsonUrl();
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to fetch ' + url + ': ' + res.status);
        return res.text();
      })
      .then(function (rawText) {
        var arr = parseSpriteJson(rawText);
        if (!Array.isArray(arr)) throw new Error('Sprite JSON is not an array');
        return indexRegionsFromArray(arr);
      });
  };

  render.setAtlas = function setAtlas(imgElement) {
    render.atlasImg = imgElement || null;
    if (!imgElement) {
      render.atlasReady = false;
      return;
    }
    // <img> may or may not be loaded yet. Naturalwidth is the truthy signal.
    if (imgElement.complete && imgElement.naturalWidth > 0) {
      render.atlasReady = true;
      return;
    }
    render.atlasReady = false;
    imgElement.addEventListener('load', function () {
      render.atlasReady = imgElement.naturalWidth > 0;
      // Notify the UI so it can re-paint palette icons + grid after a cold-cache
      // image decode. Without this, atlas-backed actors stay as red "?" boxes.
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try { window.dispatchEvent(new Event('le-atlas-ready')); } catch (_) { /* noop */ }
      }
    });
    imgElement.addEventListener('error', function () {
      render.atlasReady = false;
    });
  };

  // True iff we have BOTH an atlas <img> ready AND the region map loaded.
  function canDrawAtlas() {
    if (!render.atlasReady || !render.atlasImg) return false;
    if (!render.spriteRegions) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Coord helpers
  // ---------------------------------------------------------------------------

  function chipToPx(chipCoord, chipPx) {
    // Caller is responsible for adding GRID_*_PAD if drawing on the master grid.
    return chipCoord * chipPx;
  }

  function gridChipX(chipX, chipPx) {
    return GRID_LEFT_PAD + chipX * chipPx;
  }

  function gridChipY(chipY, chipPx) {
    return GRID_TOP_PAD + chipY * chipPx;
  }

  // ---------------------------------------------------------------------------
  // Atlas blit primitive -- draws a named region scaled into a chip-sized box.
  // ---------------------------------------------------------------------------

  // The atlas sprites have varied native sizes (e.g. player_red_idle is 30x32,
  // collectible_coin is 12x22). We scale them to fit inside (chipPx * scale) on
  // the long axis, preserving aspect ratio, then center the result horizontally
  // and bottom-align vertically inside the chip box (so things look like they're
  // "standing on" the chip).
  function blitAtlasRegion(ctx, regionName, dx, dy, chipPx, scale) {
    if (!canDrawAtlas()) {
      drawMissingAtlasFallback(ctx, dx, dy, chipPx, regionName);
      return false;
    }
    var region = render.spriteRegions[regionName];
    if (!region) {
      drawMissingAtlasFallback(ctx, dx, dy, chipPx, regionName);
      return false;
    }
    var box = chipPx * (scale || 1);
    var aspect = region.w / region.h;
    var drawW;
    var drawH;
    if (aspect >= 1) {
      drawW = box;
      drawH = box / aspect;
    } else {
      drawH = box;
      drawW = box * aspect;
    }
    var offsetX = dx + (chipPx - drawW) / 2;
    var offsetY = dy + (chipPx - drawH);
    try {
      ctx.drawImage(
        render.atlasImg,
        region.x, region.y, region.w, region.h,
        offsetX, offsetY, drawW, drawH
      );
      return true;
    } catch (e) {
      drawMissingAtlasFallback(ctx, dx, dy, chipPx, regionName);
      return false;
    }
  }

  // Red "?" box for missing atlas or missing region. Same footprint as a chip
  // so the rest of the layout stays consistent.
  function drawMissingAtlasFallback(ctx, dx, dy, chipPx, hint) {
    ctx.save();
    ctx.fillStyle = COLOR_MISSING_ATLAS_BG;
    ctx.strokeStyle = COLOR_MISSING_ATLAS_BORDER;
    ctx.lineWidth = 1;
    ctx.fillRect(dx + 1, dy + 1, chipPx - 2, chipPx - 2);
    ctx.strokeRect(dx + 1, dy + 1, chipPx - 2, chipPx - 2);
    ctx.fillStyle = COLOR_MISSING_ATLAS_INK;
    ctx.font = 'bold ' + Math.floor(chipPx * 0.55) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', dx + chipPx / 2, dy + chipPx / 2);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // renderGrid -- main entry point. Clears, draws grid lines, dims outside the
  // camera window, draws every actor in z-order, and finally outlines the
  // selected actor (if any).
  // ---------------------------------------------------------------------------

  render.renderGrid = function renderGrid(ctx, state, scope, options) {
    if (!ctx) return;
    options = options || {};
    scope = scope || 'main';

    var levelMap = pickMap(state, scope);
    var actors = pickActors(state, scope);
    var mapW = (levelMap && levelMap.width) | 0;
    var mapH = (levelMap && levelMap.height) | 0;
    if (mapW <= 0) mapW = 32;
    if (mapH <= 0) mapH = 8;

    var chipPx = EDITOR_CHIP_PX;

    // Clear to bg.
    var totalW = GRID_LEFT_PAD * 2 + mapW * chipPx;
    var totalH = GRID_TOP_PAD * 2 + mapH * chipPx;
    ctx.save();
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, Math.max(ctx.canvas.width, totalW), Math.max(ctx.canvas.height, totalH));
    ctx.restore();

    // Grid lines.
    drawChipGrid(ctx, mapW, mapH, chipPx);

    // Camera dim overlay -- ONLY for main scope, ONLY if cameraStart provided.
    if (scope === 'main' && typeof options.cameraStart === 'number') {
      drawCameraDimOverlay(ctx, mapW, mapH, chipPx, options);
    }

    // Actors. Draw in array order; later actors paint over earlier ones.
    // Selected actor gets its outline drawn LAST so it sits on top of everything.
    var selectedIdx = (typeof options.selectedActorIndex === 'number')
      ? options.selectedActorIndex
      : null;

    for (var i = 0; i < actors.length; i++) {
      var actor = actors[i];
      if (!actor) continue;
      var chipX = gridChipX(actor.x | 0, chipPx);
      var chipY = gridChipY(actor.y | 0, chipPx);
      render.drawActor(ctx, actor, chipX, chipY, {
        selected: false,
        chipPx: chipPx,
        scale: 1
      });
    }

    if (selectedIdx !== null && selectedIdx >= 0 && selectedIdx < actors.length) {
      var sel = actors[selectedIdx];
      if (sel) {
        drawSelectionOutline(
          ctx,
          gridChipX(sel.x | 0, chipPx),
          gridChipY(sel.y | 0, chipPx),
          chipPx
        );
      }
    }
  };

  // For 'main' scope read state.map + state.actors. For 'reflection' scope read
  // state.reflection_room.map + state.reflection_room.actors. Defensive against
  // partial state shapes (early UI agent calls may pass just {actors: []}).
  function pickMap(state, scope) {
    if (!state) return null;
    if (scope === 'reflection') {
      if (state.reflection_room && state.reflection_room.map) return state.reflection_room.map;
      return null;
    }
    return state.map || null;
  }

  function pickActors(state, scope) {
    if (!state) return [];
    if (scope === 'reflection') {
      if (state.reflection_room && Array.isArray(state.reflection_room.actors)) {
        return state.reflection_room.actors;
      }
      return [];
    }
    return Array.isArray(state.actors) ? state.actors : [];
  }

  function drawChipGrid(ctx, mapW, mapH, chipPx) {
    ctx.save();
    ctx.lineWidth = 1;
    var x0 = GRID_LEFT_PAD;
    var y0 = GRID_TOP_PAD;
    var x1 = x0 + mapW * chipPx;
    var y1 = y0 + mapH * chipPx;

    // Minor lines every chip.
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.beginPath();
    for (var c = 0; c <= mapW; c++) {
      var x = x0 + c * chipPx + 0.5;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    for (var r = 0; r <= mapH; r++) {
      var y = y0 + r * chipPx + 0.5;
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();

    // Major lines every 8 chips -- helps eyeball the camera frame boundaries.
    ctx.strokeStyle = GRID_LINE_MAJOR_COLOR;
    ctx.beginPath();
    for (var cc = 0; cc <= mapW; cc += 8) {
      var mx = x0 + cc * chipPx + 0.5;
      ctx.moveTo(mx, y0);
      ctx.lineTo(mx, y1);
    }
    for (var rr = 0; rr <= mapH; rr += 8) {
      var my = y0 + rr * chipPx + 0.5;
      ctx.moveTo(x0, my);
      ctx.lineTo(x1, my);
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawCameraDimOverlay(ctx, mapW, mapH, chipPx, options) {
    var camStart = options.cameraStart | 0;
    var camWidth = (typeof options.cameraWidth === 'number')
      ? (options.cameraWidth | 0)
      : CAMERA_DEFAULT_WIDTH;
    if (camWidth <= 0) return;

    // Clamp to map bounds for the dim regions.
    var leftStart = 0;
    var leftEnd = Math.max(0, Math.min(mapW, camStart));
    var rightStart = Math.max(0, Math.min(mapW, camStart + camWidth));
    var rightEnd = mapW;

    ctx.save();
    ctx.fillStyle = CAMERA_DIM_COLOR;
    if (leftEnd > leftStart) {
      ctx.fillRect(
        GRID_LEFT_PAD + leftStart * chipPx,
        GRID_TOP_PAD,
        (leftEnd - leftStart) * chipPx,
        mapH * chipPx
      );
    }
    if (rightEnd > rightStart) {
      ctx.fillRect(
        GRID_LEFT_PAD + rightStart * chipPx,
        GRID_TOP_PAD,
        (rightEnd - rightStart) * chipPx,
        mapH * chipPx
      );
    }
    ctx.restore();
  }

  function drawSelectionOutline(ctx, chipX, chipY, chipPx) {
    ctx.save();
    ctx.strokeStyle = SELECT_COLOR;
    ctx.lineWidth = SELECT_LINE_WIDTH;
    // Inset 1px so the line sits inside the chip footprint.
    ctx.strokeRect(chipX + 1, chipY + 1, chipPx - 2, chipPx - 2);
    // Drag-handle dots at the 4 corners.
    ctx.fillStyle = SELECT_COLOR;
    var dot = 3;
    ctx.fillRect(chipX - dot, chipY - dot, dot * 2, dot * 2);
    ctx.fillRect(chipX + chipPx - dot, chipY - dot, dot * 2, dot * 2);
    ctx.fillRect(chipX - dot, chipY + chipPx - dot, dot * 2, dot * 2);
    ctx.fillRect(chipX + chipPx - dot, chipY + chipPx - dot, dot * 2, dot * 2);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // drawActor -- dispatch by actor.type. Used by renderGrid AND by the palette
  // for icon rendering.
  // ---------------------------------------------------------------------------

  render.drawActor = function drawActor(ctx, actor, chipX, chipY, opts) {
    if (!ctx || !actor || typeof actor.type !== 'string') return;
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;

    switch (actor.type) {
      case 'PlayerSpawn':
        render.drawAtlasPlayerSpawn(ctx, chipX, chipY, opts);
        return;
      case 'SipStation':
        render.drawAtlasSipStation(ctx, actor, chipX, chipY, opts);
        return;
      case 'QuestionDoor':
        render.drawAtlasQuestionDoor(ctx, actor, chipX, chipY, opts);
        return;
      case 'Key':
        render.drawAtlasKey(ctx, chipX, chipY, opts);
        return;
      case 'Goal':
        render.drawAtlasGoal(ctx, chipX, chipY, opts);
        return;
      case 'Text':
        render.drawProceduralText(ctx, actor, chipX, chipY, opts);
        return;
      case 'TallyDisplay':
        render.drawProceduralTallyDisplay(ctx, actor, chipX, chipY, opts);
        return;
      case 'TallyChute':
        render.drawProceduralTallyChute(ctx, actor, chipX, chipY, opts);
        return;
      case 'Tally':
        render.drawProceduralTally(ctx, actor, chipX, chipY, opts);
        return;
      case 'Gate':
        render.drawProceduralGate(ctx, actor, chipX, chipY, opts);
        return;
      case 'ContextSlot':
        render.drawProceduralContextSlot(ctx, actor, chipX, chipY, opts);
        return;
      case 'GoalPad':
        render.drawProceduralGoalPad(ctx, actor, chipX, chipY, opts);
        return;
      case 'ReturnWarp':
        render.drawProceduralReturnWarp(ctx, chipX, chipY, opts);
        return;
      default:
        // Unknown actor type -- draw the missing-atlas fallback as a hint.
        drawMissingAtlasFallback(ctx, chipX, chipY, chipPx, actor.type);
        return;
    }
  };

  // ---------------------------------------------------------------------------
  // Atlas-mapped actor drawers.
  // ---------------------------------------------------------------------------

  render.drawAtlasPlayerSpawn = function drawAtlasPlayerSpawn(ctx, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;
    var scale = (typeof opts.scale === 'number') ? opts.scale : 1;
    blitAtlasRegion(ctx, 'player_red_idle_0', x, y, chipPx, scale);
  };

  render.drawAtlasSipStation = function drawAtlasSipStation(ctx, actor, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;
    var scale = (typeof opts.scale === 'number') ? opts.scale : 1;
    blitAtlasRegion(ctx, 'collectible_coin_0', x, y, chipPx, scale);
    // Drink label centered below the coin.
    var drink = (actor && typeof actor.drink === 'string') ? actor.drink : '?';
    ctx.save();
    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.font = 'bold ' + Math.floor(chipPx * 0.45) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var labelX = x + chipPx / 2;
    var labelY = y + chipPx + 1;
    ctx.strokeText(drink, labelX, labelY);
    ctx.fillText(drink, labelX, labelY);
    ctx.restore();
  };

  render.drawAtlasQuestionDoor = function drawAtlasQuestionDoor(ctx, actor, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;
    var scale = (typeof opts.scale === 'number') ? opts.scale : 1;
    blitAtlasRegion(ctx, 'door_closed', x, y, chipPx, scale);

    // Text snippet floats above the door (first ~14 chars of the question).
    var text = (actor && typeof actor.text === 'string') ? actor.text : '';
    if (text) {
      var snippet = text.length > 14 ? text.slice(0, 14) + '...' : text;
      ctx.save();
      ctx.font = Math.floor(chipPx * 0.30) + 'px ' + FONT_FAMILY;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(snippet, x + chipPx / 2, y - 2);
      ctx.fillText(snippet, x + chipPx / 2, y - 2);
      ctx.restore();
    }

    // Correct marker -- small green check on the right, red X on the left.
    if (actor && actor.correct === true) {
      drawCornerBadge(ctx, x + chipPx - 9, y + 1, '#16a34a', '#ffffff', '+');
    } else if (actor && actor.correct === false) {
      drawCornerBadge(ctx, x + chipPx - 9, y + 1, '#dc2626', '#ffffff', 'x');
    }
  };

  // Tiny colored square with a single-glyph label. Used for badges.
  function drawCornerBadge(ctx, x, y, fill, ink, glyph) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, 8, 8);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, 8, 8);
    ctx.fillStyle = ink;
    ctx.font = 'bold 8px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, x + 4, y + 5);
    ctx.restore();
  }

  render.drawAtlasKey = function drawAtlasKey(ctx, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;
    var scale = (typeof opts.scale === 'number') ? opts.scale : 1;
    blitAtlasRegion(ctx, 'hud_key_icon', x, y, chipPx, scale);
  };

  render.drawAtlasGoal = function drawAtlasGoal(ctx, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;
    var scale = (typeof opts.scale === 'number') ? opts.scale : 1;

    // Draw the door at reduced alpha so the green tint reads as an overlay.
    ctx.save();
    ctx.globalAlpha = 0.7;
    blitAtlasRegion(ctx, 'door_closed', x, y, chipPx, scale);
    ctx.restore();

    // Green tint overlay -- fills the chip footprint with translucent green.
    ctx.save();
    ctx.fillStyle = COLOR_GOAL_TINT;
    ctx.fillRect(x, y, chipPx, chipPx);
    ctx.restore();

    // "GOAL" label so it's distinguishable from a QuestionDoor at a glance.
    ctx.save();
    ctx.font = 'bold ' + Math.floor(chipPx * 0.28) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.strokeText('GOAL', x + chipPx / 2, y + chipPx - 6);
    ctx.fillText('GOAL', x + chipPx / 2, y + chipPx - 6);
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // Procedural actor drawers.
  // ---------------------------------------------------------------------------

  // Text actor -- white box with black border, wraps over multiple chips
  // horizontally based on string length. Truncates if too long for the visible
  // canvas. Footprint is selectable at chip (x, y) but visual extends right.
  render.drawProceduralText = function drawProceduralText(ctx, actor, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;
    var text = (actor && typeof actor.text === 'string') ? actor.text : '';

    // Box extends right based on character count. Cap at 16 chips visual width.
    var charsPerChip = 4;
    var requiredChips = Math.max(2, Math.ceil(text.length / charsPerChip));
    var boxW = Math.min(16, requiredChips) * chipPx;
    var boxH = chipPx;

    ctx.save();
    ctx.fillStyle = COLOR_TEXT_FILL;
    ctx.strokeStyle = COLOR_TEXT_BORDER;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

    // Truncate text to fit the visible box.
    ctx.fillStyle = COLOR_TEXT_INK;
    ctx.font = Math.floor(chipPx * 0.36) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    var displayText = truncateToWidth(ctx, text, boxW - 8);
    ctx.fillText(displayText, x + 4, y + boxH / 2);
    ctx.restore();
  };

  function truncateToWidth(ctx, text, maxW) {
    if (!text) return '';
    if (ctx.measureText(text).width <= maxW) return text;
    var ellipsis = '...';
    var lo = 0;
    var hi = text.length;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      var candidate = text.slice(0, mid) + ellipsis;
      if (ctx.measureText(candidate).width <= maxW) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return text.slice(0, lo) + ellipsis;
  }

  render.drawProceduralTallyDisplay = function drawProceduralTallyDisplay(ctx, actor, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;

    // HUD panel -- 4 chips wide x 1 chip tall. Cream fill, brown border.
    var w = chipPx * 4;
    var h = chipPx;
    render._drawLabeledRect(ctx, x, y, w, h, COLOR_HUD_FILL, COLOR_HUD_BORDER, null, opts);

    // Sample tally text inside.
    ctx.save();
    ctx.fillStyle = '#451a03';
    ctx.font = 'bold ' + Math.floor(chipPx * 0.38) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A:0  B:0', x + w / 2, y + h / 2);
    ctx.restore();

    // Tiny "TALLY" label above the panel.
    ctx.save();
    ctx.fillStyle = COLOR_HUD_BORDER;
    ctx.font = Math.floor(chipPx * 0.26) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('TALLY', x + 2, y - 1);
    ctx.restore();
  };

  render.drawProceduralTallyChute = function drawProceduralTallyChute(ctx, actor, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;

    // Vertical column -- 1 chip wide x 3 chips tall, extending DOWN from (x, y).
    // Color from label: A -> amber, B -> blue, default -> gray.
    var label = (actor && typeof actor.label === 'string') ? actor.label : '';
    var fill = COLOR_CHUTE_DEFAULT;
    if (label === 'A') fill = COLOR_CHUTE_A;
    else if (label === 'B') fill = COLOR_CHUTE_B;

    var colW = chipPx;
    var colH = chipPx * 3;

    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, colW, colH);
    ctx.strokeRect(x + 0.5, y + 0.5, colW - 1, colH - 1);

    // Label glyph centered in the top chip.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.font = 'bold ' + Math.floor(chipPx * 0.55) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(label || '?', x + colW / 2, y + chipPx / 2);
    ctx.fillText(label || '?', x + colW / 2, y + chipPx / 2);
    ctx.restore();
  };

  render.drawProceduralTally = function drawProceduralTally(ctx, actor, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;

    // Yellow box with threshold number.
    var threshold = (actor && typeof actor.threshold === 'number') ? actor.threshold : 0;

    ctx.save();
    ctx.fillStyle = COLOR_TALLY_FILL;
    ctx.strokeStyle = COLOR_TALLY_BORDER;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, chipPx, chipPx);
    ctx.strokeRect(x + 0.5, y + 0.5, chipPx - 1, chipPx - 1);

    ctx.fillStyle = '#451a03';
    ctx.font = 'bold ' + Math.floor(chipPx * 0.60) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(threshold), x + chipPx / 2, y + chipPx / 2);

    // "T" hint in the corner.
    ctx.fillStyle = COLOR_TALLY_BORDER;
    ctx.font = Math.floor(chipPx * 0.26) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('T', x + 2, y + 2);
    ctx.restore();
  };

  render.drawProceduralGate = function drawProceduralGate(ctx, actor, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;

    // Full-height wall -- 1 chip wide x 8 chips tall (per spec).
    // Color from predicate: always_false=red, every_player_row_complete=yellow,
    // tally_nonzero=green.
    var predicate = (actor && typeof actor.predicate === 'string') ? actor.predicate : '';
    var fill = COLOR_GATE_ALWAYS_FALSE;
    if (predicate === 'every_player_row_complete') fill = COLOR_GATE_ROW_COMPLETE;
    else if (predicate === 'tally_nonzero') fill = COLOR_GATE_TALLY_NONZERO;

    var wallW = chipPx;
    var wallH = chipPx * 8;

    // The wall extends UPWARD from y -- gates feel like vertical walls that
    // span the full map height regardless of where the actor's chip lives.
    // To keep things bounded and visible, anchor the wall so y is its center.
    var wallY = GRID_TOP_PAD;

    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = COLOR_GATE_BORDER;
    ctx.lineWidth = 1;
    ctx.fillRect(x, wallY, wallW, wallH);
    ctx.strokeRect(x + 0.5, wallY + 0.5, wallW - 1, wallH - 1);

    // Predicate label rendered vertically on the wall.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.font = 'bold ' + Math.floor(chipPx * 0.30) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var label = predicate || 'gate';
    ctx.translate(x + wallW / 2, wallY + wallH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.strokeText(label, 0, 0);
    ctx.fillText(label, 0, 0);
    ctx.restore();

    // "G" glyph at the actor's anchor chip so the selectable footprint reads.
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.font = 'bold ' + Math.floor(chipPx * 0.55) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('G', x + chipPx / 2, y + chipPx / 2);
    ctx.fillText('G', x + chipPx / 2, y + chipPx / 2);
    ctx.restore();
  };

  render.drawProceduralContextSlot = function drawProceduralContextSlot(ctx, actor, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;

    // P3 sim uses "lit" state; editor shows unlit by default. Caller may pass
    // opts.lit = true to force the lit visual (for sim mode preview).
    var lit = (opts && opts.lit === true);
    var fill = lit ? COLOR_SLOT_LIT_FILL : COLOR_SLOT_UNLIT_FILL;

    // Bordered slot rect -- 1 chip wide x 1 chip tall.
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = COLOR_SLOT_BORDER;
    ctx.lineWidth = 2;
    ctx.fillRect(x + 2, y + 2, chipPx - 4, chipPx - 4);
    ctx.strokeRect(x + 2.5, y + 2.5, chipPx - 5, chipPx - 5);

    // Inner glow / cross-hair to read as a slot.
    ctx.strokeStyle = lit ? '#bbf7d0' : '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + chipPx / 2, y + 6);
    ctx.lineTo(x + chipPx / 2, y + chipPx - 6);
    ctx.moveTo(x + 6, y + chipPx / 2);
    ctx.lineTo(x + chipPx - 6, y + chipPx / 2);
    ctx.stroke();
    ctx.restore();

    // Label text below the slot (truncated to fit ~4 chips wide).
    var label = (actor && typeof actor.label === 'string') ? actor.label : '';
    if (label) {
      ctx.save();
      ctx.font = Math.floor(chipPx * 0.26) + 'px ' + FONT_FAMILY;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#cbd5e1';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      var snippet = truncateToWidth(ctx, label, chipPx * 4 - 4);
      ctx.strokeText(snippet, x, y + chipPx + 2);
      ctx.fillText(snippet, x, y + chipPx + 2);
      ctx.restore();
    }
  };

  render.drawProceduralGoalPad = function drawProceduralGoalPad(ctx, actor, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;

    // Green pad -- filled square with rounded inner concentric rings.
    ctx.save();
    ctx.fillStyle = COLOR_GOALPAD_FILL;
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 1;
    ctx.fillRect(x + 1, y + 1, chipPx - 2, chipPx - 2);
    ctx.strokeRect(x + 1.5, y + 1.5, chipPx - 3, chipPx - 3);

    // Concentric ring icon -- 3 rings, alternating colors.
    var cx = x + chipPx / 2;
    var cy = y + chipPx / 2;
    var radii = [chipPx * 0.38, chipPx * 0.26, chipPx * 0.14];
    for (var i = 0; i < radii.length; i++) {
      ctx.strokeStyle = (i % 2 === 0) ? COLOR_GOALPAD_RING : '#14532d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radii[i], 0, Math.PI * 2);
      ctx.stroke();
    }

    // triggerMs label as a tiny corner badge.
    if (actor && typeof actor.triggerMs === 'number') {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.font = 'bold ' + Math.floor(chipPx * 0.22) + 'px ' + FONT_FAMILY;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      var ms = String(actor.triggerMs) + 'ms';
      ctx.strokeText(ms, x + chipPx - 2, y + 2);
      ctx.fillText(ms, x + chipPx - 2, y + 2);
    }
    ctx.restore();
  };

  render.drawProceduralReturnWarp = function drawProceduralReturnWarp(ctx, x, y, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;

    var cx = x + chipPx / 2;
    var cy = y + chipPx / 2;
    var rOuter = chipPx * 0.45;
    var rInner = chipPx * 0.16;

    ctx.save();
    // Outer disc with a radial gradient if supported (canvas does in browsers).
    try {
      var grad = ctx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);
      grad.addColorStop(0, COLOR_RETURNWARP_INNER);
      grad.addColorStop(0.6, COLOR_RETURNWARP_OUTER);
      grad.addColorStop(1, '#9a3412');
      ctx.fillStyle = grad;
    } catch (e) {
      ctx.fillStyle = COLOR_RETURNWARP_OUTER;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
    ctx.fill();

    // Inner highlight.
    ctx.fillStyle = COLOR_RETURNWARP_INNER;
    ctx.beginPath();
    ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
    ctx.fill();

    // "RETURN" label below.
    ctx.fillStyle = '#fed7aa';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.font = 'bold ' + Math.floor(chipPx * 0.22) + 'px ' + FONT_FAMILY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeText('RETURN', cx, y + chipPx - 8);
    ctx.fillText('RETURN', cx, y + chipPx - 8);
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // Helper -- consistent labeled rect for procedural drawers.
  // ---------------------------------------------------------------------------

  render._drawLabeledRect = function _drawLabeledRect(ctx, x, y, w, h, fillColor, borderColor, label, opts) {
    opts = opts || {};
    var chipPx = (typeof opts.chipPx === 'number') ? opts.chipPx : EDITOR_CHIP_PX;

    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    if (label) {
      ctx.fillStyle = borderColor;
      ctx.font = Math.floor(chipPx * 0.30) + 'px ' + FONT_FAMILY;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var snippet = truncateToWidth(ctx, label, w - 6);
      ctx.fillText(snippet, x + w / 2, y + h / 2);
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // Export.
  // ---------------------------------------------------------------------------

  window.LE.render = render;
})();
