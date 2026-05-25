/**
 * activity-level.js
 *
 * Live Classroom V7 -- Unit D level scene renderer.
 *
 * Public API (attached to window.ActivityLevel):
 *
 *   var handle = ActivityLevel.mount(mountEl, opts);
 *   handle.updateState(activityState);     // redraw scene + actors + players + tooltip
 *   handle.showOutcome('success' | 'timeout' | 'cancel');
 *   handle.destroy();                      // remove canvas, tooltip, drop refs
 *
 * The renderer is plain 2D canvas + a single DOM tooltip overlay so it works
 * in jsdom tests with a recording context stub as well as on the real Desk page.
 *
 * activityState shape (per LIVE_CLASSROOM_V7_BUILD.md C4 wire protocol):
 *   {
 *     levelKey:   'U1.1',
 *     lessonKey:  '1.1',
 *     startedAt:  <ms>,
 *     durationMs: 180000,
 *     state: {
 *       players:    { [username]: { x, y, inReflection } },
 *       coins:      [{ id, collected }],
 *       switches:   [{ id, voteCount, pressed }],
 *       gates:      [{ id, opened }],
 *       goal:       { reached, reachedBy },
 *       reflection: { active, doorId, returnedCount, totalCount },
 *       tally:      { sips, votes }
 *     },
 *     level: <LevelDef from C3 -- sent ONCE on start>
 *   }
 *
 * Actor rendering (v7 = programmatic colored rects + text labels):
 *   - Text         -- small dark background + white text label
 *   - SipStation   -- cup-icon rect with the drink letter (A/B) inside; greyed when collected
 *   - PlayerSpawn  -- NOT rendered (marker only)
 *   - TallyDisplay -- panel showing the bound value (e.g., for binds: 'tally.sips' shows "A: 3   B: 2")
 *   - QuestionDoor -- portal-arch rect + text label below; opened gate => tint
 *   - Goal         -- gold rect with "GOAL" label
 *   - ReturnWarp   -- concentric circles + "RETURN" label
 *
 * Players are rendered as 16x16 filled rects tinted by hashStringToHue(username),
 * matching classroom-board.js's parity hash exactly.
 *
 * Tooltip: when the LOCAL player (opts.currentUsername) is within proximity=32 px
 * of a Text actor, an absolutely-positioned DOM div appears above the player.
 *
 * ASCII-only.  LF line endings.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  var DEFAULT_CHIP_SIZE   = 24;
  var DEFAULT_MOUNT_W     = 320;
  var DEFAULT_MOUNT_H     = 240;

  var PLAYER_SIZE_PX      = 16;
  var TOOLTIP_PROXIMITY   = 32;     // CSS px between local player center and Text actor center

  // Scene palette
  var BG_COLOR            = '#1a1f2e';
  var GRID_LINE_COLOR     = 'rgba(255, 255, 255, 0.05)';
  var TEXT_LABEL_BG       = 'rgba(34, 34, 34, 0.85)';
  var TEXT_LABEL_COLOR    = '#ffffff';

  var SIPSTATION_FILL     = '#55ccbb';
  var SIPSTATION_BORDER   = '#226e62';
  var SIPSTATION_LETTER   = '#0a2926';
  var SIPSTATION_GREY     = '#5a5a5a';
  var SIPSTATION_FADED_A  = 0.4;

  var TALLY_BG            = 'rgba(40, 40, 80, 0.85)';
  var TALLY_COLOR         = '#fff8c0';

  var DOOR_BORDER         = '#a8a8d8';
  var DOOR_INTERIOR_CLOSED= '#332244';
  var DOOR_INTERIOR_OPEN  = '#cccc66';
  var DOOR_LABEL_COLOR    = '#f0f0ff';

  var GOAL_FILL           = '#ffcc33';
  var GOAL_BORDER         = '#8a6a00';
  var GOAL_LABEL_COLOR    = '#3a2400';

  var RETURN_WARP_OUTER   = '#88ccff';
  var RETURN_WARP_INNER   = '#bbeeff';
  var RETURN_LABEL_COLOR  = '#dde9ff';

  var PLAYER_BORDER       = '#000000';
  var PLAYER_LABEL_COLOR  = '#ffffff';
  var PLAYER_LABEL_BG     = 'rgba(0, 0, 0, 0.6)';

  // Outcome overlays
  var SUCCESS_OVERLAY     = 'rgba(40, 200, 90, 0.45)';
  var TIMEOUT_OVERLAY     = 'rgba(230, 140, 40, 0.45)';
  var CANCEL_OVERLAY      = 'rgba(120, 120, 120, 0.5)';
  var SUCCESS_TEXT_COLOR  = '#0a3d18';
  var TIMEOUT_TEXT_COLOR  = '#3a1f00';
  var CANCEL_TEXT_COLOR   = '#1a1a1a';

  // Fonts
  var TEXT_LABEL_FONT     = '11px monospace';
  var TALLY_FONT          = 'bold 11px monospace';
  var DOOR_LABEL_FONT     = 'bold 10px monospace';
  var GOAL_LABEL_FONT     = 'bold 12px monospace';
  var RETURN_LABEL_FONT   = 'bold 10px monospace';
  var PLAYER_LABEL_FONT   = 'bold 9px monospace';
  var SIPSTATION_FONT     = 'bold 12px monospace';
  var OUTCOME_FONT        = 'bold 22px sans-serif';

  // Reflection overlay
  var REFLECTION_PANEL_BG = 'rgba(20, 40, 50, 0.85)';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve devicePixelRatio.  In jsdom there is no devicePixelRatio,
   * so we fall back to 1.  Matches the V4/V5/V6 helpers.
   */
  function resolveDpr() {
    if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number') {
      var dpr = window.devicePixelRatio;
      if (isFinite(dpr) && dpr > 0) { return dpr; }
    }
    return 1;
  }

  /**
   * Hash a username to a hue in [0, 359].  EXACT copy from
   * classroom-board.js's hashStringToHue.  Used to tint Player rects so a
   * Desk's local player always matches its classroom-board avatar.
   */
  function hashStringToHue(input) {
    var hash = 0;
    if (input == null) { return 0; }
    var s = String(input);
    for (var i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash) + s.charCodeAt(i);
      hash = hash | 0;  // keep 32-bit signed
    }
    return Math.abs(hash) % 360;
  }

  function fallbackHueForUsername(username) {
    return hashStringToHue(username);
  }

  /**
   * Read a dotted-path value from an object (e.g. "tally.sips" -> obj.tally.sips).
   * Returns null if any segment is missing.
   */
  function readBinding(obj, path) {
    if (!obj || !path) { return null; }
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) { return null; }
      cur = cur[parts[i]];
    }
    return (cur == null) ? null : cur;
  }

  /**
   * Get the active map: either the main map (default) or the reflection room
   * map (when reflection.active === true).
   */
  function activeMap(levelDef, reflection) {
    if (reflection && reflection.active && levelDef && levelDef.reflection_room
        && levelDef.reflection_room.map) {
      return levelDef.reflection_room.map;
    }
    return (levelDef && levelDef.map) ? levelDef.map : null;
  }

  /**
   * Get the active actor list: main `actors` (default) or
   * reflection_room.actors when reflection.active === true.
   */
  function activeActors(levelDef, reflection) {
    if (reflection && reflection.active && levelDef && levelDef.reflection_room) {
      return levelDef.reflection_room.actors || [];
    }
    return (levelDef && levelDef.actors) ? levelDef.actors : [];
  }

  /**
   * For a given door id, find the matching QuestionDoor actor in the level's
   * main actors and return its `reflection` field.  Returns null if not found.
   */
  function reflectionTextForDoor(levelDef, doorId) {
    if (!levelDef || !doorId) { return null; }
    var actors = levelDef.actors || [];
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (a && a.type === 'QuestionDoor' && a.id === doorId) {
        return (a.reflection != null) ? String(a.reflection) : null;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Actor renderers (canvas)
  // ---------------------------------------------------------------------------

  function drawBackground(ctx, cssW, cssH) {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  function drawGrid(ctx, cssW, cssH, chipSize) {
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth   = 1;
    for (var gx = 0; gx <= cssW; gx += chipSize) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, cssH);
      ctx.stroke();
    }
    for (var gy = 0; gy <= cssH; gy += chipSize) {
      ctx.beginPath();
      ctx.moveTo(0,    gy);
      ctx.lineTo(cssW, gy);
      ctx.stroke();
    }
  }

  function drawTextActor(ctx, actor, chipSize) {
    var px = actor.x * chipSize;
    var py = actor.y * chipSize;
    var label = (actor.text != null) ? String(actor.text) : '';
    var measureW = approxTextWidth(label, 7);
    var boxW = measureW + 8;
    var boxH = 18;
    ctx.fillStyle = TEXT_LABEL_BG;
    ctx.fillRect(px - boxW / 2, py - boxH / 2, boxW, boxH);
    ctx.fillStyle    = TEXT_LABEL_COLOR;
    ctx.font         = TEXT_LABEL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px, py);
    resetTextDefaults(ctx);
  }

  function drawSipStation(ctx, actor, chipSize, collected) {
    var px = actor.x * chipSize;
    var py = actor.y * chipSize;
    var w = chipSize;
    var h = chipSize;
    var prevAlpha = (typeof ctx.globalAlpha === 'number') ? ctx.globalAlpha : 1;
    if (collected) {
      ctx.fillStyle = SIPSTATION_GREY;
      ctx.globalAlpha = SIPSTATION_FADED_A;
    } else {
      ctx.fillStyle = SIPSTATION_FILL;
    }
    ctx.fillRect(px - w / 2, py - h / 2, w, h);

    ctx.strokeStyle = SIPSTATION_BORDER;
    ctx.lineWidth   = 1;
    ctx.strokeRect(px - w / 2, py - h / 2, w, h);

    var drink = (actor.drink != null) ? String(actor.drink) : '?';
    ctx.fillStyle    = SIPSTATION_LETTER;
    ctx.font         = SIPSTATION_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(drink, px, py);

    ctx.globalAlpha = prevAlpha;
    resetTextDefaults(ctx);
  }

  function drawTallyDisplay(ctx, actor, chipSize, state) {
    var px = actor.x * chipSize;
    var py = actor.y * chipSize;
    var binds = (actor.binds != null) ? String(actor.binds) : '';
    var value = readBinding(state, binds);
    var label = formatTallyValue(binds, value);
    var measureW = approxTextWidth(label, 7);
    var boxW = measureW + 10;
    var boxH = 20;
    ctx.fillStyle = TALLY_BG;
    ctx.fillRect(px - boxW / 2, py - boxH / 2, boxW, boxH);
    ctx.fillStyle    = TALLY_COLOR;
    ctx.font         = TALLY_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px, py);
    resetTextDefaults(ctx);
  }

  function drawQuestionDoor(ctx, actor, chipSize, opened) {
    var px = actor.x * chipSize;
    var py = actor.y * chipSize;
    var w = chipSize;
    var h = chipSize + 6;

    // Interior (tinted based on opened/closed)
    ctx.fillStyle = opened ? DOOR_INTERIOR_OPEN : DOOR_INTERIOR_CLOSED;
    ctx.fillRect(px - w / 2, py - h / 2, w, h);
    // Border
    ctx.strokeStyle = DOOR_BORDER;
    ctx.lineWidth   = 2;
    ctx.strokeRect(px - w / 2, py - h / 2, w, h);

    var label = (actor.text != null) ? String(actor.text) : '';
    // Compose a short label that fits roughly under the arch.
    var trimmed = (label.length > 32) ? (label.substring(0, 29) + '...') : label;
    ctx.fillStyle    = DOOR_LABEL_COLOR;
    ctx.font         = DOOR_LABEL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(trimmed, px, py + h / 2 + 2);
    resetTextDefaults(ctx);
  }

  function drawGoal(ctx, actor, chipSize) {
    var px = actor.x * chipSize;
    var py = actor.y * chipSize;
    var w = chipSize;
    var h = chipSize;
    ctx.fillStyle = GOAL_FILL;
    ctx.fillRect(px - w / 2, py - h / 2, w, h);
    ctx.strokeStyle = GOAL_BORDER;
    ctx.lineWidth   = 2;
    ctx.strokeRect(px - w / 2, py - h / 2, w, h);
    ctx.fillStyle    = GOAL_LABEL_COLOR;
    ctx.font         = GOAL_LABEL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GOAL', px, py);
    resetTextDefaults(ctx);
  }

  function drawReturnWarp(ctx, actor, chipSize) {
    var px = actor.x * chipSize;
    var py = actor.y * chipSize;
    var radii = [chipSize * 0.5, chipSize * 0.35, chipSize * 0.2];
    ctx.strokeStyle = RETURN_WARP_OUTER;
    ctx.lineWidth   = 2;
    for (var i = 0; i < radii.length; i++) {
      ctx.beginPath();
      ctx.arc(px, py, radii[i], 0, Math.PI * 2);
      ctx.stroke();
    }
    // Center dot
    ctx.fillStyle = RETURN_WARP_INNER;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle    = RETURN_LABEL_COLOR;
    ctx.font         = RETURN_LABEL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('RETURN', px, py + chipSize * 0.55);
    resetTextDefaults(ctx);
  }

  function drawReflectionPanel(ctx, cssW, cssH, levelDef, doorId) {
    var text = reflectionTextForDoor(levelDef, doorId);
    if (text == null) { return; }
    var boxH = 50;
    var boxY = cssH * 0.15;
    ctx.fillStyle = REFLECTION_PANEL_BG;
    ctx.fillRect(8, boxY, cssW - 16, boxH);

    ctx.fillStyle    = TEXT_LABEL_COLOR;
    ctx.font         = TEXT_LABEL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    // Render the reflection text (wrap mock -- we don't truly wrap here; the
    // panel is wide enough for short reflection lines).
    var trimmed = (text.length > 80) ? (text.substring(0, 77) + '...') : text;
    ctx.fillText(trimmed, cssW / 2, boxY + boxH / 2);
    resetTextDefaults(ctx);
  }

  function drawPlayer(ctx, username, posX, posY) {
    var hue = fallbackHueForUsername(username);
    var fill = 'hsl(' + hue + ', 70%, 50%)';
    var w = PLAYER_SIZE_PX;
    var h = PLAYER_SIZE_PX;
    var px = posX - w / 2;
    var py = posY - h / 2;

    ctx.fillStyle = fill;
    ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = PLAYER_BORDER;
    ctx.lineWidth   = 1;
    ctx.strokeRect(px, py, w, h);

    // Username label above
    var nameW = approxTextWidth(username, 6);
    var labelBoxW = nameW + 6;
    var labelBoxH = 12;
    var labelX = posX - labelBoxW / 2;
    var labelY = posY - h / 2 - labelBoxH - 2;

    ctx.fillStyle = PLAYER_LABEL_BG;
    ctx.fillRect(labelX, labelY, labelBoxW, labelBoxH);

    ctx.fillStyle    = PLAYER_LABEL_COLOR;
    ctx.font         = PLAYER_LABEL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(username), posX, labelY + labelBoxH / 2);
    resetTextDefaults(ctx);
  }

  // ---------------------------------------------------------------------------
  // Helpers (text formatting + measure)
  // ---------------------------------------------------------------------------

  function approxTextWidth(text, pxPerChar) {
    if (text == null) { return 0; }
    return String(text).length * (pxPerChar || 7);
  }

  function resetTextDefaults(ctx) {
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function formatTallyValue(binds, value) {
    if (value == null) { return ''; }
    if (typeof value === 'number' || typeof value === 'string') {
      return String(value);
    }
    // Object -> "K: v   K: v"
    var keys = Object.keys(value);
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      out.push(keys[i] + ': ' + String(value[keys[i]]));
    }
    return out.join('   ');
  }

  // ---------------------------------------------------------------------------
  // Render passes
  // ---------------------------------------------------------------------------

  /**
   * Render the static actor layer (background, grid, all non-Player actors).
   * Called every updateState (we redraw the whole canvas to keep things
   * simple; the actor list is small and the canvas is small).
   */
  function renderScene(handle, activityState) {
    var ctx = handle.ctx;
    if (!ctx) { return; }
    var levelDef   = handle._levelDef;
    if (!levelDef) {
      // No level def yet; just paint the background.
      drawBackground(ctx, handle.cssW, handle.cssH);
      return;
    }

    var sState = (activityState && activityState.state) ? activityState.state : {};
    var reflection = sState.reflection || { active: false };
    var map  = activeMap(levelDef, reflection)   || levelDef.map || { chipSize: DEFAULT_CHIP_SIZE };
    var chipSize = (map && typeof map.chipSize === 'number' && map.chipSize > 0)
                   ? map.chipSize : DEFAULT_CHIP_SIZE;
    var actors = activeActors(levelDef, reflection);

    drawBackground(ctx, handle.cssW, handle.cssH);
    drawGrid(ctx, handle.cssW, handle.cssH, chipSize);

    // Build lookup tables for dynamic per-actor state.
    var coinCollected = {};
    if (Array.isArray(sState.coins)) {
      for (var c = 0; c < sState.coins.length; c++) {
        var coin = sState.coins[c];
        if (coin && coin.id != null) { coinCollected[coin.id] = !!coin.collected; }
      }
    }
    var gateOpened = {};
    if (Array.isArray(sState.gates)) {
      for (var g = 0; g < sState.gates.length; g++) {
        var gate = sState.gates[g];
        if (gate && gate.id != null) { gateOpened[gate.id] = !!gate.opened; }
      }
    }

    // Actor pass
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a || !a.type) { continue; }
      switch (a.type) {
        case 'Text':
          drawTextActor(ctx, a, chipSize);
          break;
        case 'SipStation':
          drawSipStation(ctx, a, chipSize, !!coinCollected[a.id]);
          break;
        case 'PlayerSpawn':
          // marker only -- not rendered
          break;
        case 'TallyDisplay':
          drawTallyDisplay(ctx, a, chipSize, sState);
          break;
        case 'QuestionDoor':
          drawQuestionDoor(ctx, a, chipSize, !!gateOpened[a.id]);
          break;
        case 'Goal':
          drawGoal(ctx, a, chipSize);
          break;
        case 'ReturnWarp':
          drawReturnWarp(ctx, a, chipSize);
          break;
        default:
          break;
      }
    }

    // Reflection panel: render the chosen door's reflection text on top.
    if (reflection.active && reflection.doorId) {
      drawReflectionPanel(ctx, handle.cssW, handle.cssH, levelDef, reflection.doorId);
    }

    // Player pass
    var players = sState.players || {};
    var names = Object.keys(players);
    for (var p = 0; p < names.length; p++) {
      var name = names[p];
      var pos = players[name] || {};
      var x = (typeof pos.x === 'number') ? pos.x : 0;
      var y = (typeof pos.y === 'number') ? pos.y : 0;
      drawPlayer(ctx, name, x, y);
    }
  }

  // ---------------------------------------------------------------------------
  // Tooltip
  // ---------------------------------------------------------------------------

  /**
   * Decide whether the tooltip should be visible based on local player
   * proximity to any Text actor.  Returns the matching Text actor (or null).
   */
  function nearestTextActor(handle, activityState) {
    if (!handle.currentUsername) { return null; }
    var levelDef = handle._levelDef;
    if (!levelDef) { return null; }
    var sState = (activityState && activityState.state) ? activityState.state : {};
    var players = sState.players || {};
    var local = players[handle.currentUsername];
    if (!local) { return null; }
    var reflection = sState.reflection || { active: false };
    var map = activeMap(levelDef, reflection) || levelDef.map
              || { chipSize: DEFAULT_CHIP_SIZE };
    var chipSize = (map && typeof map.chipSize === 'number' && map.chipSize > 0)
                   ? map.chipSize : DEFAULT_CHIP_SIZE;
    var actors = activeActors(levelDef, reflection);

    var lx = (typeof local.x === 'number') ? local.x : 0;
    var ly = (typeof local.y === 'number') ? local.y : 0;

    var best = null;
    var bestDist = TOOLTIP_PROXIMITY + 1;
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a || a.type !== 'Text') { continue; }
      var ax = a.x * chipSize;
      var ay = a.y * chipSize;
      var dx = ax - lx;
      var dy = ay - ly;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= TOOLTIP_PROXIMITY && dist < bestDist) {
        bestDist = dist;
        best = a;
      }
    }
    return best;
  }

  function syncTooltip(handle, activityState) {
    var target = nearestTextActor(handle, activityState);
    if (!target) {
      removeTooltip(handle);
      return;
    }

    var ownerDoc = handle._mountEl && handle._mountEl.ownerDocument;
    if (!ownerDoc) { return; }

    // Build or reuse the tooltip element.
    var tip;
    if (handle._tooltip && handle._tooltip.el) {
      tip = handle._tooltip.el;
    } else {
      tip = ownerDoc.createElement('div');
      tip.className              = 'activity-level-tooltip';
      tip.style.position         = 'absolute';
      tip.style.zIndex           = '30';
      tip.style.maxWidth         = '240px';
      tip.style.padding          = '6px 10px';
      tip.style.background       = '#222230';
      tip.style.color            = '#f4f4f4';
      tip.style.border           = '1px solid #555577';
      tip.style.borderRadius     = '4px';
      tip.style.fontFamily       = 'monospace';
      tip.style.fontSize         = '12px';
      tip.style.pointerEvents    = 'none';
      tip.style.boxShadow        = '0 2px 8px rgba(0,0,0,0.4)';
      handle._mountEl.appendChild(tip);
      handle._tooltip = { el: tip };
    }
    tip.textContent = String(target.text || '');

    // Position above the local player.
    var sState = (activityState && activityState.state) ? activityState.state : {};
    var local = (sState.players || {})[handle.currentUsername] || { x: 0, y: 0 };
    var lx = (typeof local.x === 'number') ? local.x : 0;
    var ly = (typeof local.y === 'number') ? local.y : 0;
    tip.style.left = (lx - 30) + 'px';
    tip.style.top  = (ly - 40) + 'px';
  }

  function removeTooltip(handle) {
    if (!handle._tooltip) { return; }
    if (handle._tooltip.el && handle._tooltip.el.parentNode) {
      handle._tooltip.el.parentNode.removeChild(handle._tooltip.el);
    }
    handle._tooltip = null;
  }

  // ---------------------------------------------------------------------------
  // Outcome overlay
  // ---------------------------------------------------------------------------

  function renderOutcome(handle, outcome) {
    var ctx = handle.ctx;
    if (!ctx) { return; }
    var fill, text, textColor;
    if (outcome === 'success') {
      fill = SUCCESS_OVERLAY;
      text = 'LEVEL CLEARED!';
      textColor = SUCCESS_TEXT_COLOR;
    } else if (outcome === 'timeout') {
      fill = TIMEOUT_OVERLAY;
      text = 'TIME UP';
      textColor = TIMEOUT_TEXT_COLOR;
    } else {
      fill = CANCEL_OVERLAY;
      text = 'CANCELLED';
      textColor = CANCEL_TEXT_COLOR;
    }

    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, handle.cssW, handle.cssH);

    ctx.fillStyle    = textColor;
    ctx.font         = OUTCOME_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, handle.cssW / 2, handle.cssH / 2);
    resetTextDefaults(ctx);
  }

  // ---------------------------------------------------------------------------
  // mount()
  // ---------------------------------------------------------------------------

  function mount(mountEl, opts) {
    if (!mountEl) {
      return noopHandle();
    }
    var ownerDoc = mountEl.ownerDocument
                || (typeof document !== 'undefined' ? document : null);
    if (!ownerDoc) {
      return noopHandle();
    }

    opts = opts || {};
    var canvas = ownerDoc.createElement('canvas');
    var cssW = (typeof opts.width  === 'number' && opts.width  > 0) ? opts.width
             : (mountEl.clientWidth || DEFAULT_MOUNT_W);
    var cssH = (typeof opts.height === 'number' && opts.height > 0) ? opts.height
             : (mountEl.clientHeight || DEFAULT_MOUNT_H);
    var dpr  = resolveDpr();

    canvas.style.position      = 'absolute';
    canvas.style.left          = '0';
    canvas.style.top           = '0';
    canvas.style.width         = cssW + 'px';
    canvas.style.height        = cssH + 'px';
    canvas.style.pointerEvents = 'none';
    canvas.style.display       = 'block';
    canvas.width  = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));

    mountEl.appendChild(canvas);

    var ctx = (typeof canvas.getContext === 'function') ? canvas.getContext('2d') : null;
    if (ctx && dpr !== 1 && typeof ctx.scale === 'function') {
      ctx.scale(dpr, dpr);
    }

    var handle = {
      _canvas:         canvas,
      _mountEl:        mountEl,
      _tooltip:        null,
      _levelDef:       null,
      _heightAuto:     !(typeof opts.height === 'number' && opts.height > 0),
      ctx:             ctx,
      cssW:            cssW,
      cssH:            cssH,
      currentUsername: opts.currentUsername || null,
      boardHandle:     opts.boardHandle    || null,
      destroyed:       false
    };

    handle.updateState = function (activityState) {
      if (handle.destroyed || !handle.ctx) { return; }

      // First call: stash the level def if present and (optionally) auto-size.
      if (!handle._levelDef && activityState && activityState.level) {
        handle._levelDef = activityState.level;
        maybeResizeForLevel(handle);
      }

      renderScene(handle, activityState);
      syncTooltip(handle, activityState);
    };

    handle.showOutcome = function (outcome) {
      if (handle.destroyed || !handle.ctx) { return; }
      renderOutcome(handle, outcome || 'cancel');
      removeTooltip(handle);
    };

    handle.destroy = function () {
      if (handle.destroyed) { return; }
      handle.destroyed = true;
      removeTooltip(handle);
      if (handle._canvas && handle._canvas.parentNode) {
        handle._canvas.parentNode.removeChild(handle._canvas);
      }
      handle._canvas = null;
      handle._mountEl = null;
      handle.ctx = null;
    };

    // Initial empty render so the canvas is not blank before the first
    // activity state arrives.
    if (handle.ctx) {
      drawBackground(handle.ctx, cssW, cssH);
    }

    return handle;
  }

  /**
   * If the level was mounted without an explicit height, derive the height
   * from the level's map.height * map.chipSize so the scene actually fits.
   */
  function maybeResizeForLevel(handle) {
    if (!handle._heightAuto) { return; }
    var def = handle._levelDef;
    if (!def || !def.map) { return; }
    var chipSize = (typeof def.map.chipSize === 'number' && def.map.chipSize > 0)
                   ? def.map.chipSize : DEFAULT_CHIP_SIZE;
    var newH = (typeof def.map.height === 'number' && def.map.height > 0)
               ? def.map.height * chipSize : handle.cssH;
    if (newH === handle.cssH) { return; }
    var canvas = handle._canvas;
    var dpr = resolveDpr();
    canvas.style.height = newH + 'px';
    canvas.height = Math.max(1, Math.floor(newH * dpr));
    if (handle.ctx && dpr !== 1 && typeof handle.ctx.scale === 'function') {
      handle.ctx.scale(dpr, dpr);
    }
    handle.cssH = newH;
  }

  function noopHandle() {
    return {
      destroy:     function () {},
      updateState: function () {},
      showOutcome: function () {}
    };
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  var ActivityLevel = {
    mount:               mount,
    _hashStringToHue:    hashStringToHue,      // exposed for tests / cross-renderer parity
    _fallbackHueForUser: fallbackHueForUsername
  };

  if (typeof window !== 'undefined') {
    window.ActivityLevel = ActivityLevel;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActivityLevel;
  }
})();
