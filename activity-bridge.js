/**
 * activity-bridge.js
 *
 * Live Classroom V4 -- Unit D bridge renderer.
 *
 * Public API (attached to window.ActivityBridge):
 *
 *   var handle = ActivityBridge.mount(mountEl, opts);
 *   handle.updateState(activityState);   // redraw scene from state
 *   handle.showOutcome('success' | 'timeout' | 'cancel');
 *   handle.destroy();                    // remove canvas, drop refs
 *
 * The renderer is plain 2D canvas -- no libraries -- so it works in
 * jsdom tests with a recording context stub as well as in the real
 * Desk page.
 *
 * Scene layout:
 *   - Dark gray background
 *   - Left stone platform (~25% of width) with one labeled avatar dot
 *     per student in state.values
 *   - Middle gap (~50% of width) with a rising bridge fragment whose
 *     height is proportional to (currentMean - 1) / 9
 *   - Right stone platform (~25% of width) with a small door icon on top
 *   - Green target band overlay in the gap at the target +/- tolerance
 *     height range
 *   - HUD text at the top: "mean: X.X | target: X.X +/- 0.3 | hold: X.Xs / 3.0s"
 *
 * State shape (per LIVE_CLASSROOM_V4_BUILD.md C2 serializeForBoard):
 *   {
 *     values:       { username: int 1..10 },
 *     target:       int 3..8,
 *     tolerance:    0.3,
 *     currentMean:  float,
 *     holdMs:       int,
 *     holdTargetMs: 3000
 *   }
 *
 * ASCII-only.  LF line endings.
 */

(function () {
  'use strict';

  // Palette
  var BG_COLOR         = '#2b2f36';   // dark gray scene
  var PLATFORM_COLOR   = '#9aa0a6';   // light gray stones
  var BRIDGE_COLOR     = '#b58c5a';   // wooden bridge fragment
  var BAND_COLOR       = 'rgba(70, 200, 110, 0.35)';  // green target band
  var BAND_EDGE_COLOR  = 'rgba(70, 200, 110, 0.9)';
  var DOOR_COLOR       = '#3a2616';
  var AVATAR_COLOR     = '#f0c674';
  var AVATAR_EDGE      = '#1a1a1a';
  var TEXT_COLOR       = '#f4f4f4';
  var HUD_FONT         = '12px sans-serif';
  var LABEL_FONT       = '10px sans-serif';
  var BUBBLE_FONT      = '11px sans-serif';
  var OUTCOME_FONT     = 'bold 28px sans-serif';

  // Outcome overlays
  var SUCCESS_OVERLAY  = 'rgba(40, 200, 90, 0.4)';
  var TIMEOUT_OVERLAY  = 'rgba(230, 140, 40, 0.4)';
  var CANCEL_OVERLAY   = 'rgba(120, 120, 120, 0.45)';
  var SUCCESS_TEXT     = '#0a3d18';
  var TIMEOUT_TEXT     = '#3a1f00';
  var CANCEL_TEXT      = '#1a1a1a';

  var CSS_HEIGHT = 180;

  /**
   * Resolve the device pixel ratio.  In jsdom there is no devicePixelRatio,
   * so we fall back to 1.
   */
  function resolveDpr() {
    if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number') {
      var dpr = window.devicePixelRatio;
      if (isFinite(dpr) && dpr > 0) { return dpr; }
    }
    return 1;
  }

  /**
   * Compute scene geometry from the canvas CSS dimensions.  Returns
   * the rectangles for the three regions (left platform, gap, right
   * platform) plus the band of the gap interior that the bridge and
   * target band live in.
   */
  function computeGeometry(cssW, cssH) {
    var platformW = Math.floor(cssW * 0.25);
    var gapW      = cssW - platformW * 2;
    var hudH      = 22;  // top margin reserved for HUD text
    var floorY    = cssH - 18;
    var ceilingY  = hudH + 4;
    var platformH = floorY - ceilingY;
    var gapBottom = floorY;
    var gapTop    = ceilingY;

    return {
      hudH:        hudH,
      leftX:       0,
      leftW:       platformW,
      rightX:      cssW - platformW,
      rightW:      platformW,
      gapX:        platformW,
      gapW:        gapW,
      ceilingY:    ceilingY,
      floorY:      floorY,
      platformH:   platformH,
      gapTop:      gapTop,
      gapBottom:   gapBottom,
      gapHeight:   gapBottom - gapTop
    };
  }

  /**
   * Convert a value v in [1, 10] to a y-coordinate in the gap.  v=1 maps
   * to gap bottom (no bridge), v=10 maps to gap top (full bridge).
   */
  function valueToY(v, geom) {
    var clamped = Math.max(1, Math.min(10, v));
    var fraction = (clamped - 1) / 9;
    return geom.gapBottom - fraction * geom.gapHeight;
  }

  /**
   * Draw the static scene (background, platforms, door, HUD frame).
   */
  function drawScene(ctx, cssW, cssH, geom) {
    // Background fill
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, cssW, cssH);

    // Left platform
    ctx.fillStyle = PLATFORM_COLOR;
    ctx.fillRect(geom.leftX, geom.ceilingY, geom.leftW, geom.platformH);

    // Right platform
    ctx.fillStyle = PLATFORM_COLOR;
    ctx.fillRect(geom.rightX, geom.ceilingY, geom.rightW, geom.platformH);

    // Door on the right platform (centered, sitting on top of platform)
    var doorW = Math.max(12, Math.floor(geom.rightW * 0.4));
    var doorH = Math.max(20, Math.floor(geom.platformH * 0.35));
    var doorX = geom.rightX + Math.floor((geom.rightW - doorW) / 2);
    var doorY = geom.ceilingY;
    ctx.fillStyle = DOOR_COLOR;
    ctx.fillRect(doorX, doorY, doorW, doorH);
    // Three vertical lines on door (the "|||" detail)
    ctx.strokeStyle = '#5c3f24';
    ctx.lineWidth = 1;
    ctx.beginPath();
    var stripeStep = Math.max(2, Math.floor(doorW / 4));
    for (var s = 1; s < 4; s++) {
      var sx = doorX + s * stripeStep;
      ctx.moveTo(sx, doorY + 2);
      ctx.lineTo(sx, doorY + doorH - 2);
    }
    ctx.stroke();
  }

  /**
   * Draw the target band as a translucent green rectangle in the gap,
   * spanning the y-range corresponding to [target - tolerance, target + tolerance].
   */
  function drawBand(ctx, target, tolerance, geom) {
    var lowV  = target - tolerance;
    var highV = target + tolerance;
    var yHi   = valueToY(highV, geom);   // top edge (higher value -> smaller y)
    var yLo   = valueToY(lowV,  geom);   // bottom edge
    var bandH = Math.max(2, yLo - yHi);
    ctx.fillStyle = BAND_COLOR;
    ctx.fillRect(geom.gapX, yHi, geom.gapW, bandH);
    ctx.strokeStyle = BAND_EDGE_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(geom.gapX, yHi, geom.gapW, bandH);
  }

  /**
   * Draw the bridge fragment.  Rises from the gap floor; height
   * proportional to (currentMean - 1) / 9.
   */
  function drawBridge(ctx, currentMean, geom) {
    var topY = valueToY(currentMean, geom);
    var bridgeH = geom.gapBottom - topY;
    if (bridgeH <= 0) { return; }
    var pad = Math.max(2, Math.floor(geom.gapW * 0.08));
    var bx = geom.gapX + pad;
    var bw = geom.gapW - pad * 2;
    if (bw <= 0) { return; }
    ctx.fillStyle = BRIDGE_COLOR;
    ctx.fillRect(bx, topY, bw, bridgeH);
    // Plank stripes (horizontal lines across the bridge for texture)
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    var plankStep = 6;
    ctx.beginPath();
    for (var py = topY + plankStep; py < geom.gapBottom; py += plankStep) {
      ctx.moveTo(bx, py);
      ctx.lineTo(bx + bw, py);
    }
    ctx.stroke();
  }

  /**
   * Distribute avatars horizontally across the left platform and draw
   * a labeled dot + value bubble for each entry in state.values.
   */
  function drawAvatars(ctx, values, geom) {
    var usernames = Object.keys(values || {});
    if (usernames.length === 0) { return; }
    var avatarY = geom.floorY - 10;
    var bubbleY = avatarY - 18;
    var nameY   = avatarY + 16;
    var slot    = geom.leftW / usernames.length;
    var radius  = Math.max(4, Math.min(8, Math.floor(slot / 4)));

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';

    for (var i = 0; i < usernames.length; i++) {
      var u  = usernames[i];
      var v  = values[u];
      var cx = geom.leftX + slot * i + slot / 2;

      // Avatar dot
      ctx.fillStyle   = AVATAR_COLOR;
      ctx.strokeStyle = AVATAR_EDGE;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(cx, avatarY, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Value bubble (just the number, above the dot)
      ctx.fillStyle = TEXT_COLOR;
      ctx.font      = BUBBLE_FONT;
      ctx.fillText(String(v), cx, bubbleY);

      // Username label below the dot
      ctx.font     = LABEL_FONT;
      var shortName = u.length > 8 ? u.slice(0, 7) + '.' : u;
      ctx.fillText(shortName, cx, nameY);
    }
    ctx.textAlign = 'left';
  }

  /**
   * Draw the HUD text at the top of the canvas:
   *   "mean: X.X | target: X.X +/- 0.3 | hold: X.Xs / 3.0s"
   */
  function drawHud(ctx, state, cssW, geom) {
    var mean   = (typeof state.currentMean === 'number') ? state.currentMean : 0;
    var target = (typeof state.target      === 'number') ? state.target      : 0;
    var tol    = (typeof state.tolerance   === 'number') ? state.tolerance   : 0.3;
    var holdMs = (typeof state.holdMs      === 'number') ? state.holdMs      : 0;
    var holdTgt= (typeof state.holdTargetMs=== 'number') ? state.holdTargetMs: 3000;

    var holdS    = (holdMs   / 1000).toFixed(1);
    var holdTgtS = (holdTgt  / 1000).toFixed(1);

    var hud = 'mean: ' + mean.toFixed(1)
            + ' | target: ' + target.toFixed(1) + ' +/- ' + tol.toFixed(1)
            + ' | hold: ' + holdS + 's / ' + holdTgtS + 's';

    ctx.fillStyle    = TEXT_COLOR;
    ctx.font         = HUD_FONT;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(hud, 6, geom.hudH - 6);
  }

  /**
   * Full redraw given a normalized activity state.
   */
  function renderState(handle, state) {
    var ctx   = handle.ctx;
    var cssW  = handle.cssW;
    var cssH  = handle.cssH;
    var geom  = computeGeometry(cssW, cssH);

    drawScene(ctx, cssW, cssH, geom);

    var values    = (state && state.values)    || {};
    var target    = (state && typeof state.target    === 'number') ? state.target    : 0;
    var tolerance = (state && typeof state.tolerance === 'number') ? state.tolerance : 0.3;
    var mean      = (state && typeof state.currentMean === 'number') ? state.currentMean : 0;

    drawBand(ctx, target, tolerance, geom);
    drawBridge(ctx, mean, geom);
    drawAvatars(ctx, values, geom);
    drawHud(ctx, state || {}, cssW, geom);
  }

  /**
   * Draw an outcome overlay on top of the existing scene.
   */
  function renderOutcome(handle, outcome) {
    var ctx  = handle.ctx;
    var cssW = handle.cssW;
    var cssH = handle.cssH;

    var fill, text, textColor;
    if (outcome === 'success') {
      fill = SUCCESS_OVERLAY;
      text = 'SUCCESS!';
      textColor = SUCCESS_TEXT;
    } else if (outcome === 'timeout') {
      fill = TIMEOUT_OVERLAY;
      text = 'TIME UP';
      textColor = TIMEOUT_TEXT;
    } else {
      fill = CANCEL_OVERLAY;
      text = 'CANCELLED';
      textColor = CANCEL_TEXT;
    }

    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.fillStyle    = textColor;
    ctx.font         = OUTCOME_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cssW / 2, cssH / 2);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Public mount() -- creates a canvas inside mountEl and returns a
   * handle bag of methods.
   */
  function mount(mountEl, opts) {
    if (!mountEl) {
      // Defensive -- caller must provide a real element.
      return {
        destroy:     function () {},
        updateState: function () {},
        showOutcome: function () {}
      };
    }

    var ownerDoc = mountEl.ownerDocument
                || (typeof document !== 'undefined' ? document : null);
    if (!ownerDoc) {
      return {
        destroy:     function () {},
        updateState: function () {},
        showOutcome: function () {}
      };
    }

    var canvas = ownerDoc.createElement('canvas');
    var cssW   = mountEl.clientWidth || (opts && opts.width) || 320;
    var cssH   = CSS_HEIGHT;
    var dpr    = resolveDpr();

    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width  = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    canvas.style.display = 'block';

    mountEl.appendChild(canvas);

    var ctx = (typeof canvas.getContext === 'function') ? canvas.getContext('2d') : null;
    if (ctx && dpr !== 1 && typeof ctx.scale === 'function') {
      // After scaling, all drawing uses CSS pixels.
      ctx.scale(dpr, dpr);
    }

    var handle = {
      _canvas:  canvas,
      _mountEl: mountEl,
      ctx:      ctx,
      cssW:     cssW,
      cssH:     cssH,
      destroyed:false
    };

    handle.updateState = function (state) {
      if (handle.destroyed || !handle.ctx) { return; }
      renderState(handle, state || {});
    };

    handle.showOutcome = function (outcome) {
      if (handle.destroyed || !handle.ctx) { return; }
      renderOutcome(handle, outcome || 'cancel');
    };

    handle.destroy = function () {
      if (handle.destroyed) { return; }
      handle.destroyed = true;
      if (handle._canvas && handle._canvas.parentNode) {
        handle._canvas.parentNode.removeChild(handle._canvas);
      }
      handle._canvas  = null;
      handle._mountEl = null;
      handle.ctx      = null;
    };

    // Initial empty render so the canvas is not blank.
    if (handle.ctx) {
      var geom = computeGeometry(cssW, cssH);
      drawScene(ctx, cssW, cssH, geom);
    }

    return handle;
  }

  var ActivityBridge = {
    mount: mount
  };

  if (typeof window !== 'undefined') {
    window.ActivityBridge = ActivityBridge;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActivityBridge;
  }
})();
