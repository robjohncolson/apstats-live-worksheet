/**
 * activity-colorbox.js
 *
 * Live Classroom V5 -- Unit B colorbox-hue renderer.
 *
 * Public API (attached to window.ActivityColorbox):
 *
 *   var handle = ActivityColorbox.mount(mountEl, opts);
 *   handle.updateState(activityState);   // redraw zones from state
 *   handle.showOutcome('success' | 'timeout' | 'cancel');
 *   handle.destroy();                    // remove canvas, drop refs
 *
 * The renderer is plain 2D canvas -- no libraries -- so it works in
 * jsdom tests with a recording context stub as well as in the real
 * Desk page.
 *
 * Layout: a horizontal strip overlay (canvas_width x 40 px) that the
 * Desk mounts directly above the classroom-board canvas.  The strip
 * paints four colored quadrant zones (Red / Yellow / Green / Blue),
 * a tally count + match indicator per zone, and a faint progress bar
 * along the top driven by holdMs / holdTargetMs.
 *
 * State shape (per LIVE_CLASSROOM_V5_BUILD.md C2 serializeForBoard):
 *   {
 *     assignments:  { username: zoneId },        // 0..3
 *     currentZone:  { username: zoneId | -1 },
 *     tally:        [int, int, int, int],
 *     holdMs:       int,
 *     holdTargetMs: 5000,
 *     zones:        [ { id, label }, ... ]
 *   }
 *
 * ASCII-only.  LF line endings.
 */

(function () {
  'use strict';

  // Palette -- one fill per zone (Red / Yellow / Green / Blue).
  var ZONE_FILLS = ['#ff5555', '#ddcc44', '#55cc55', '#5577cc'];
  var ZONE_LABELS_DEFAULT = ['Red', 'Yellow', 'Green', 'Blue'];
  var ZONE_FILL_ALPHA = 0.45;

  var BG_COLOR       = '#1f1f24';   // narrow strip backdrop behind zones
  var DIVIDER_COLOR  = 'rgba(0, 0, 0, 0.4)';
  var TEXT_COLOR     = '#f4f4f4';
  var LABEL_FONT     = 'bold 12px monospace';
  var TALLY_FONT     = 'bold 11px monospace';
  var MARK_FONT      = 'bold 11px monospace';
  var OUTCOME_FONT   = 'bold 20px sans-serif';
  var PROGRESS_BG    = 'rgba(255, 255, 255, 0.15)';
  var PROGRESS_FILL  = 'rgba(255, 255, 255, 0.75)';

  // Outcome overlays
  var SUCCESS_OVERLAY = 'rgba(40, 200, 90, 0.4)';
  var TIMEOUT_OVERLAY = 'rgba(230, 140, 40, 0.4)';
  var CANCEL_OVERLAY  = 'rgba(120, 120, 120, 0.45)';
  var SUCCESS_TEXT    = '#0a3d18';
  var TIMEOUT_TEXT    = '#3a1f00';
  var CANCEL_TEXT     = '#1a1a1a';

  // Match-indicator marks
  var MARK_OK   = 'OK';
  var MARK_BAD  = 'X';
  var MARK_OK_COLOR  = '#0a3d18';
  var MARK_BAD_COLOR = '#a00000';

  var CSS_HEIGHT       = 40;
  var DEFAULT_CSS_W    = 320;
  var PROGRESS_H       = 3;        // px tall at very top of strip
  var TALLY_BASELINE_Y = 12;       // tally number baseline (just under progress bar)
  var MARK_BASELINE_Y  = 12;       // OK/X mark baseline (alongside tally)
  var LABEL_BASELINE_Y = 30;       // big zone label baseline (lower half)

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
   * Compute geometry for the four zones inside a strip of width cssW.
   * Returns the per-zone x-extent + the strip floor.
   */
  function computeGeometry(cssW, cssH) {
    var zoneW = cssW / 4;
    return {
      cssW:   cssW,
      cssH:   cssH,
      zoneW:  zoneW,
      zones:  [
        { x: 0,            w: zoneW },
        { x: zoneW,        w: zoneW },
        { x: zoneW * 2,    w: zoneW },
        { x: zoneW * 3,    w: zoneW }
      ]
    };
  }

  /**
   * Normalise the inbound state into the shape the renderer expects.
   */
  function normalizeState(state) {
    var s = state || {};
    var assignments = s.assignments || {};
    var currentZone = s.currentZone || {};
    var tally       = (s.tally && s.tally.length === 4) ? s.tally : [0, 0, 0, 0];
    var holdMs      = (typeof s.holdMs       === 'number') ? s.holdMs       : 0;
    var holdTgt     = (typeof s.holdTargetMs === 'number') ? s.holdTargetMs : 5000;
    var zones       = (s.zones && s.zones.length === 4) ? s.zones : null;
    var labels      = ZONE_LABELS_DEFAULT.slice();
    if (zones) {
      for (var i = 0; i < 4; i++) {
        if (zones[i] && typeof zones[i].label === 'string') {
          labels[i] = zones[i].label;
        }
      }
    }
    return {
      assignments:  assignments,
      currentZone:  currentZone,
      tally:        tally,
      holdMs:       holdMs,
      holdTargetMs: holdTgt > 0 ? holdTgt : 5000,
      labels:       labels
    };
  }

  /**
   * Compute the expected tally [int, int, int, int] from assignments.
   * expected[i] = count of students whose assigned zone === i.
   */
  function computeExpected(assignments) {
    var counts = [0, 0, 0, 0];
    if (!assignments) { return counts; }
    var keys = Object.keys(assignments);
    for (var k = 0; k < keys.length; k++) {
      var z = assignments[keys[k]];
      if (z === 0 || z === 1 || z === 2 || z === 3) {
        counts[z]++;
      }
    }
    return counts;
  }

  /**
   * Paint the strip background (covers all zones with the dark backdrop
   * before the translucent colour rectangles go on top).
   */
  function drawBackground(ctx, geom) {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, geom.cssW, geom.cssH);
  }

  /**
   * Paint the four colored zone rectangles with the configured alpha.
   * Each rectangle is exactly cssW/4 wide and the full strip height.
   */
  function drawZones(ctx, geom) {
    var prevAlpha = (typeof ctx.globalAlpha === 'number') ? ctx.globalAlpha : 1;
    ctx.globalAlpha = ZONE_FILL_ALPHA;
    for (var i = 0; i < 4; i++) {
      ctx.fillStyle = ZONE_FILLS[i];
      var z = geom.zones[i];
      ctx.fillRect(z.x, 0, z.w, geom.cssH);
    }
    ctx.globalAlpha = prevAlpha;

    // Thin dividers between zones for readability.
    ctx.strokeStyle = DIVIDER_COLOR;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    for (var d = 1; d < 4; d++) {
      var dx = geom.zones[d].x;
      ctx.moveTo(dx, 0);
      ctx.lineTo(dx, geom.cssH);
    }
    ctx.stroke();
  }

  /**
   * Paint the centered zone label inside each rectangle.
   */
  function drawLabels(ctx, geom, labels) {
    ctx.fillStyle    = TEXT_COLOR;
    ctx.font         = LABEL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    for (var i = 0; i < 4; i++) {
      var z = geom.zones[i];
      var cx = z.x + z.w / 2;
      ctx.fillText(String(labels[i]), cx, LABEL_BASELINE_Y);
    }
    ctx.textAlign = 'left';
  }

  /**
   * Paint the per-zone tally count (small number in the upper-left of each
   * zone) plus the OK/X match indicator next to it.
   */
  function drawTalliesAndMarks(ctx, geom, tally, expected) {
    ctx.textBaseline = 'alphabetic';
    for (var i = 0; i < 4; i++) {
      var z      = geom.zones[i];
      var count  = (typeof tally[i] === 'number') ? tally[i] : 0;
      var exp    = expected[i];
      var match  = (count === exp);
      var mark   = match ? MARK_OK : MARK_BAD;
      var color  = match ? MARK_OK_COLOR : MARK_BAD_COLOR;
      var padX   = 4;

      // Tally count, left-aligned just inside the zone.
      ctx.fillStyle = TEXT_COLOR;
      ctx.font      = TALLY_FONT;
      ctx.textAlign = 'left';
      ctx.fillText(String(count), z.x + padX, TALLY_BASELINE_Y);

      // Match indicator, right-aligned inside the same zone.
      ctx.fillStyle = color;
      ctx.font      = MARK_FONT;
      ctx.textAlign = 'right';
      ctx.fillText(mark, z.x + z.w - padX, MARK_BASELINE_Y);
    }
    ctx.textAlign = 'left';
  }

  /**
   * Paint the faint progress bar across the very top of the strip.
   * Width = (holdMs / holdTargetMs) * cssW, clamped to [0, cssW].
   */
  function drawProgress(ctx, geom, holdMs, holdTargetMs) {
    var ratio = (holdTargetMs > 0) ? (holdMs / holdTargetMs) : 0;
    if (ratio < 0) { ratio = 0; }
    if (ratio > 1) { ratio = 1; }
    var fillW = ratio * geom.cssW;

    ctx.fillStyle = PROGRESS_BG;
    ctx.fillRect(0, 0, geom.cssW, PROGRESS_H);

    if (fillW > 0) {
      ctx.fillStyle = PROGRESS_FILL;
      ctx.fillRect(0, 0, fillW, PROGRESS_H);
    }
  }

  /**
   * Full redraw given a normalized activity state.
   */
  function renderState(handle, state) {
    var ctx  = handle.ctx;
    var geom = computeGeometry(handle.cssW, handle.cssH);
    var norm = normalizeState(state);
    var exp  = computeExpected(norm.assignments);

    drawBackground(ctx, geom);
    drawZones(ctx, geom);
    drawProgress(ctx, geom, norm.holdMs, norm.holdTargetMs);
    drawTalliesAndMarks(ctx, geom, norm.tally, exp);
    drawLabels(ctx, geom, norm.labels);
  }

  /**
   * Draw an outcome overlay on top of the existing strip.
   */
  function renderOutcome(handle, outcome) {
    var ctx  = handle.ctx;
    var cssW = handle.cssW;
    var cssH = handle.cssH;

    var fill, text, textColor;
    if (outcome === 'success') {
      fill = SUCCESS_OVERLAY;
      text = 'SORTED!';
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
    var cssW   = mountEl.clientWidth || (opts && opts.width) || DEFAULT_CSS_W;
    var cssH   = CSS_HEIGHT;
    var dpr    = resolveDpr();

    canvas.style.width   = cssW + 'px';
    canvas.style.height  = cssH + 'px';
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
      _canvas:   canvas,
      _mountEl:  mountEl,
      ctx:       ctx,
      cssW:      cssW,
      cssH:      cssH,
      destroyed: false
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
      drawBackground(ctx, geom);
      drawZones(ctx, geom);
    }

    return handle;
  }

  var ActivityColorbox = {
    mount: mount
  };

  if (typeof window !== 'undefined') {
    window.ActivityColorbox = ActivityColorbox;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActivityColorbox;
  }
})();
