/**
 * activity-level.js -- Live Classroom V7.1 additive-overlay renderer.
 *
 * Public API (attached to window.ActivityLevel):
 *   var handle = ActivityLevel.mount(mountEl, opts);
 *   handle.updateState(activityState);
 *   handle.showOutcome('success' | 'timeout' | 'cancel');
 *   handle.destroy();
 *
 * V7.1 (LIVE_CLASSROOM_V7_1_BUILD.md):
 *   - Additive overlay on TOP of the existing classroom-board canvas.
 *   - Players + QuestionDoors are NOT rendered here.
 *   - We paint Text actors, Coins (SipStations), the Goal flag (gated by
 *     phase), the Reflection panel, and a DOM proximity Tooltip.
 *
 * ASCII-only.  LF line endings.
 */

(function () {
  'use strict';

  var DEFAULT_CHIP_SIZE = 10;     // V7.1: 10 px chips
  var DEFAULT_OVERLAY_W = 320;
  var DEFAULT_OVERLAY_H = 80;
  var TOOLTIP_PROXIMITY = 32;

  var C = {
    coinLive:    '#55ccbb',
    coinGrey:    '#5a5a5a',
    coinBorder:  '#226e62',
    coinLetter:  '#0a2926',
    coinAlpha:   0.4,
    textBg:      'rgba(34, 34, 34, 0.85)',
    label:       '#ffffff',
    goalBase:    '#ffcc33',
    goalEdge:    '#8a6a00',
    goalFlag:    '#cc2222',
    reflDim:     'rgba(0, 0, 0, 0.55)',
    reflBox:     'rgba(20, 40, 50, 0.95)',
    reflEdge:    '#88ccff',
    success:     'rgba(40, 200, 90, 0.45)',
    timeout:     'rgba(230, 140, 40, 0.45)',
    cancel:      'rgba(120, 120, 120, 0.5)',
    successText: '#0a3d18',
    timeoutText: '#3a1f00',
    cancelText:  '#1a1a1a'
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function resetText(ctx) {
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function approxTextWidth(text, pxPerChar) {
    return (text == null) ? 0 : String(text).length * (pxPerChar || 6);
  }

  /**
   * Find the existing classroom-board canvas so the overlay can mirror its
   * dims.  Search order: parent's #classroom-board-mount canvas, then
   * document-wide, then a sibling canvas of mountEl.
   */
  function findBoardCanvas(mountEl) {
    if (!mountEl) { return null; }
    var doc = mountEl.ownerDocument;
    if (mountEl.parentNode && mountEl.parentNode.querySelector) {
      var p = mountEl.parentNode.querySelector('#classroom-board-mount canvas');
      if (p) { return p; }
    }
    if (doc && doc.querySelector) {
      var d = doc.querySelector('#classroom-board-mount canvas');
      if (d) { return d; }
    }
    if (mountEl.parentNode && mountEl.parentNode.childNodes) {
      var kids = mountEl.parentNode.childNodes;
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k && k !== mountEl && k.tagName && String(k.tagName).toLowerCase() === 'canvas') {
          return k;
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Decoration draws
  // ---------------------------------------------------------------------------

  function drawCoin(ctx, coin, chipSize) {
    var px = coin.x * chipSize;
    var py = coin.y * chipSize;
    var s  = chipSize;
    var prevAlpha = (typeof ctx.globalAlpha === 'number') ? ctx.globalAlpha : 1;

    if (coin.collected) {
      ctx.fillStyle   = C.coinGrey;
      ctx.globalAlpha = C.coinAlpha;
    } else {
      ctx.fillStyle = C.coinLive;
    }
    ctx.fillRect(px - s / 2, py - s / 2, s, s);

    ctx.strokeStyle = C.coinBorder;
    ctx.lineWidth   = 1;
    ctx.strokeRect(px - s / 2, py - s / 2, s, s);

    if (coin.drink != null) {
      ctx.fillStyle    = C.coinLetter;
      ctx.font         = 'bold 10px monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(coin.drink), px, py);
    }
    ctx.globalAlpha = prevAlpha;
    resetText(ctx);
  }

  function drawTextActor(ctx, actor, chipSize, cssW) {
    var px   = actor.x * chipSize;
    var py   = actor.y * chipSize;
    var label = (actor.text != null) ? String(actor.text) : '';
    var boxW = approxTextWidth(label, 6) + 6;
    var boxH = 14;

    // Clamp horizontally so the box stays inside the canvas. If the
    // string is wider than the canvas (long welcome / explanation
    // strings authored at chip x=4 etc.), flush-left at x=2 and let the
    // text run rightward; otherwise center on the actor coord.
    var boxX = px - boxW / 2;
    if (typeof cssW === 'number' && cssW > 0) {
      if (boxW + 4 >= cssW) {
        boxX = 2;
      } else if (boxX < 2) {
        boxX = 2;
      } else if (boxX + boxW > cssW - 2) {
        boxX = Math.max(2, cssW - boxW - 2);
      }
    }
    var boxY = py - boxH / 2;

    ctx.fillStyle = C.textBg;
    ctx.fillRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle    = C.label;
    ctx.font         = '10px monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, boxX + 3, boxY + boxH / 2);
    resetText(ctx);
  }

  function drawGoalFlag(ctx, goal, chipSize) {
    var px = goal.x * chipSize;
    var py = goal.y * chipSize;
    var s  = chipSize;

    ctx.fillStyle = C.goalBase;
    ctx.fillRect(px - s / 2, py - s / 2, s, s);
    ctx.strokeStyle = C.goalEdge;
    ctx.lineWidth   = 1;
    ctx.strokeRect(px - s / 2, py - s / 2, s, s);

    // Triangle pennant on top of the post.
    ctx.fillStyle = C.goalFlag;
    if (typeof ctx.beginPath === 'function') {
      ctx.beginPath();
      ctx.moveTo(px - s / 2, py - s / 2);
      ctx.lineTo(px + s / 2, py - s / 2 - s * 0.4);
      ctx.lineTo(px - s / 2, py - s);
      if (typeof ctx.closePath === 'function') { ctx.closePath(); }
      if (typeof ctx.fill === 'function')      { ctx.fill();      }
    }
  }

  function drawReflectionPanel(ctx, cssW, cssH, reflection) {
    ctx.fillStyle = C.reflDim;
    ctx.fillRect(0, 0, cssW, cssH);

    var boxW = Math.max(180, cssW - 24);
    var boxH = Math.max(40,  cssH - 24);
    var boxX = (cssW - boxW) / 2;
    var boxY = (cssH - boxH) / 2;

    ctx.fillStyle = C.reflBox;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = C.reflEdge;
    ctx.lineWidth   = 1;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    var text    = (reflection && reflection.reflectionText != null) ? String(reflection.reflectionText) : '';
    var trimmed = (text.length > 64) ? (text.substring(0, 61) + '...') : text;

    ctx.fillStyle    = C.label;
    ctx.font         = 'bold 12px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(trimmed, cssW / 2, boxY + boxH * 0.4);

    if (reflection && typeof reflection.autoCloseAt === 'number') {
      var secs = Math.max(0, Math.ceil((reflection.autoCloseAt - Date.now()) / 1000));
      ctx.font = '10px monospace';
      ctx.fillText(secs + 's', cssW / 2, boxY + boxH * 0.75);
    }
    resetText(ctx);
  }

  function renderOutcome(handle, outcome) {
    var ctx = handle.ctx;
    if (!ctx) { return; }
    var fill = C.cancel, text = 'CANCELLED', textColor = C.cancelText;
    if (outcome === 'success') {
      fill = C.success; text = 'LEVEL CLEARED!'; textColor = C.successText;
    } else if (outcome === 'timeout') {
      fill = C.timeout; text = 'TIME UP';        textColor = C.timeoutText;
    }
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, handle.cssW, handle.cssH);

    ctx.fillStyle    = textColor;
    ctx.font         = 'bold 22px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, handle.cssW / 2, handle.cssH / 2);
    resetText(ctx);
  }

  // ---------------------------------------------------------------------------
  // Scene render
  // ---------------------------------------------------------------------------

  function findActorOfType(levelDef, type) {
    var actors = (levelDef && Array.isArray(levelDef.actors)) ? levelDef.actors : [];
    for (var i = 0; i < actors.length; i++) {
      if (actors[i] && actors[i].type === type) { return actors[i]; }
    }
    return null;
  }

  function renderScene(handle, activityState) {
    var ctx = handle.ctx;
    if (!ctx) { return; }
    if (typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, handle.cssW, handle.cssH);
    }

    var levelDef = handle._levelDef;
    if (!levelDef) { return; }

    var sState     = (activityState && activityState.state) ? activityState.state : {};
    var chipSize   = handle.chipSize || DEFAULT_CHIP_SIZE;
    var phase      = sState.phase || null;
    var reflection = sState.reflection || { active: false };
    var actors     = Array.isArray(levelDef.actors) ? levelDef.actors : [];
    var yOffset    = (typeof handle.contentYOffset === 'number') ? handle.contentYOffset : 0;
    var cssW       = handle.cssW;

    // Apply the y-offset for chip-coord paints so y=0 actors don't clip
    // above the canvas top. Reflection panel + outcome paint at the full
    // canvas so they stay outside the save/restore.
    var canSaveRestore = (typeof ctx.save === 'function' && typeof ctx.translate === 'function' && typeof ctx.restore === 'function');
    if (canSaveRestore && yOffset !== 0) { ctx.save(); ctx.translate(0, yOffset); }

    // Text actors (always visible)
    for (var i = 0; i < actors.length; i++) {
      if (actors[i] && actors[i].type === 'Text') {
        drawTextActor(ctx, actors[i], chipSize, cssW);
      }
    }

    // V7.2 sprite-collide: coins moved off the overlay onto the avatar
    // canvas as engine entities (classroom-board CoinSprite). Skipped
    // here so coins don't double-render.
    // var coins = Array.isArray(sState.coins) ? sState.coins : [];
    // for (var c = 0; c < coins.length; c++) { ... drawCoin ... }

    // Goal flag (only when reachable or cleared)
    if (phase === 'GOAL_AVAILABLE' || phase === 'LEVEL_CLEARED') {
      var goal = findActorOfType(levelDef, 'Goal');
      if (goal) { drawGoalFlag(ctx, goal, chipSize); }
    }

    if (canSaveRestore && yOffset !== 0) { ctx.restore(); }

    // Reflection panel (covers the whole canvas, no y-offset)
    if (reflection && reflection.active) {
      drawReflectionPanel(ctx, handle.cssW, handle.cssH, reflection);
    }

    // DOM tooltip
    syncTooltip(handle, activityState);
  }

  // ---------------------------------------------------------------------------
  // Tooltip (DOM)
  // ---------------------------------------------------------------------------

  function nearestTextActor(handle, activityState) {
    if (!handle.currentUsername || !handle._levelDef) { return null; }
    var sState = (activityState && activityState.state) ? activityState.state : {};
    var local  = (sState.players || {})[handle.currentUsername];
    if (!local) { return null; }

    var chipSize = handle.chipSize || DEFAULT_CHIP_SIZE;
    var actors   = Array.isArray(handle._levelDef.actors) ? handle._levelDef.actors : [];
    var lx = (typeof local.x === 'number') ? local.x : 0;
    var ly = (typeof local.y === 'number') ? local.y : 0;
    var best = null;
    var bestDist = TOOLTIP_PROXIMITY + 1;

    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a || a.type !== 'Text') { continue; }
      var dx = a.x * chipSize - lx;
      var dy = a.y * chipSize - ly;
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
    if (!target) { removeTooltip(handle); return; }
    var ownerDoc = handle._mountEl && handle._mountEl.ownerDocument;
    if (!ownerDoc) { return; }

    var tip;
    if (handle._tooltip && handle._tooltip.el) {
      tip = handle._tooltip.el;
    } else {
      tip = ownerDoc.createElement('div');
      tip.className = 'activity-level-tooltip';
      var s = tip.style;
      s.position = 'absolute'; s.zIndex = '30'; s.maxWidth = '240px';
      s.padding = '6px 10px';  s.background = '#222230'; s.color = '#f4f4f4';
      s.border = '1px solid #555577'; s.borderRadius = '4px';
      s.fontFamily = 'monospace'; s.fontSize = '12px';
      s.pointerEvents = 'none';   s.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
      handle._mountEl.appendChild(tip);
      handle._tooltip = { el: tip };
    }
    tip.textContent = String(target.text || '');

    var sState = (activityState && activityState.state) ? activityState.state : {};
    var local  = (sState.players || {})[handle.currentUsername] || { x: 0, y: 0 };
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
  // mount()
  // ---------------------------------------------------------------------------

  function mount(mountEl, opts) {
    if (!mountEl) { return noopHandle(); }
    var ownerDoc = mountEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!ownerDoc) { return noopHandle(); }

    opts = opts || {};
    var canvas = ownerDoc.createElement('canvas');

    // Mirror the existing classroom-board canvas WIDTH so the overlay
    // spans the full board horizontally. For HEIGHT, prefer the level's
    // own natural dims (mapHeight * chipSize + margin) so the overlay
    // sits as a compact strip near the top of the board instead of
    // stretching to the full 220 px board height. The empty space below
    // the overlay stays interactive for the avatar scene underneath.
    var boardCanvas = findBoardCanvas(mountEl);
    var cssW, cssH;
    if (boardCanvas) {
      cssW = boardCanvas.clientWidth  || parseInt(boardCanvas.style.width,  10) || boardCanvas.width  || DEFAULT_OVERLAY_W;
    } else {
      cssW = (typeof opts.width  === 'number' && opts.width  > 0) ? opts.width  : (mountEl.clientWidth  || DEFAULT_OVERLAY_W);
    }
    // V7.1 sizing rev (2026-05-25): cssH from level.map dims if known.
    // The TOP_MARGIN gives the y=0 Text actors room so their boxes (which
    // center vertically on py=0) don't clip above the canvas top.
    var TOP_MARGIN = 10;
    var levelChip   = (opts.level && opts.level.map && opts.level.map.chipSize) || DEFAULT_CHIP_SIZE;
    var levelHeight = (opts.level && opts.level.map && opts.level.map.height)   || 0;
    if (levelHeight > 0) {
      cssH = levelHeight * levelChip + TOP_MARGIN;
    } else if (typeof opts.height === 'number' && opts.height > 0) {
      cssH = opts.height;
    } else {
      cssH = DEFAULT_OVERLAY_H + TOP_MARGIN;
    }
    // Shift the entire scene down by TOP_MARGIN so chip-y coords paint
    // inside the canvas (y=0 Text actors get their top half back).
    var contentYOffset = TOP_MARGIN;

    var st = canvas.style;
    st.position = 'absolute'; st.left = '0'; st.top = '0';
    st.width  = cssW + 'px';  st.height = cssH + 'px';
    st.pointerEvents = 'none'; st.display = 'block';
    canvas.width  = Math.max(1, Math.floor(cssW));
    canvas.height = Math.max(1, Math.floor(cssH));

    mountEl.appendChild(canvas);

    var handle = {
      _canvas:         canvas,
      _mountEl:        mountEl,
      _levelDef:       (opts.level && typeof opts.level === 'object') ? opts.level : null,
      _tooltip:        null,
      ctx:             (typeof canvas.getContext === 'function') ? canvas.getContext('2d') : null,
      cssW:            cssW,
      cssH:            cssH,
      chipSize:        (opts.level && opts.level.map && opts.level.map.chipSize) || DEFAULT_CHIP_SIZE,
      contentYOffset:  contentYOffset,
      currentUsername: opts.currentUsername || null,
      boardHandle:     opts.boardHandle    || null,
      destroyed:       false
    };

    handle.updateState = function (activityState) {
      if (handle.destroyed || !handle.ctx) { return; }
      if (!handle._levelDef && activityState && activityState.level) {
        handle._levelDef = activityState.level;
        var map = activityState.level.map;
        if (map && typeof map.chipSize === 'number' && map.chipSize > 0) {
          handle.chipSize = map.chipSize;
        }
      }
      renderScene(handle, activityState);
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
      handle._canvas  = null;
      handle._mountEl = null;
      handle.ctx      = null;
    };

    return handle;
  }

  function noopHandle() {
    return {
      destroy:     function () {},
      updateState: function () {},
      showOutcome: function () {}
    };
  }

  var ActivityLevel = { mount: mount };
  if (typeof window !== 'undefined') { window.ActivityLevel = ActivityLevel; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = ActivityLevel; }
})();
