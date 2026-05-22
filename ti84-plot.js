/**
 * ti84-plot.js
 *
 * TI-84-style data plots for the Live Classroom poll cockpit.
 * Plain browser script -- no import/export.  Attaches window.Ti84Plot.
 *
 * Adapted from ti84-trainer-v2/native/screen-renderer.js for the
 * calculator framing + pixel-font aesthetic -- the trainer file is NOT
 * modified.
 *
 * Public API
 * ----------
 *   Ti84Plot.drawBarChart(ctx, { labels, counts, title? })
 *   Ti84Plot.drawDotplot(ctx, { values, labels?, title? })
 *
 * Both functions:
 *   - Accept a CanvasRenderingContext2D as first argument.
 *   - Are pure and data-driven: no hardcoded mock data, no DOM reads.
 *   - Return silently on empty or degenerate data (no throws).
 *   - Render a TI-84 LCD frame (green background, black axes).
 *
 * ASCII-clean.  LF line endings.
 */

(function () {
  'use strict';

  // ── TI-84 LCD palette + metrics (mirrors screen-renderer.js) ─────────
  var BG_COLOR   = '#C6D8A0';
  var FG_COLOR   = '#000000';
  var FONT       = '11px monospace';
  var FONT_SMALL = '9px monospace';

  // Graph area inside the LCD frame
  var FRAME_PAD  = 4;   // outer LCD border
  var AXIS_L     = 28;  // left margin for Y labels / Y axis
  var AXIS_B     = 22;  // bottom margin for X labels / X axis
  var TITLE_H    = 16;  // row height for the title bar

  // ── internal helpers ──────────────────────────────────────────────────

  /**
   * Clear the canvas with the LCD background and draw a thin border to
   * simulate the TI-84 screen bezel.
   */
  function drawFrame(ctx, w, h) {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = FG_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(FRAME_PAD, FRAME_PAD, w - FRAME_PAD * 2, h - FRAME_PAD * 2);
  }

  /**
   * Draw an optional title bar at the top (inverted, like the TI-84
   * menu header).
   * Returns the Y offset where the plot area begins.
   */
  function drawTitle(ctx, w, title) {
    if (!title) { return FRAME_PAD + 2; }
    var y = FRAME_PAD + 1;
    ctx.fillStyle = FG_COLOR;
    ctx.fillRect(FRAME_PAD, y, w - FRAME_PAD * 2, TITLE_H);
    ctx.fillStyle = BG_COLOR;
    ctx.font = FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, y + TITLE_H / 2);
    ctx.textAlign = 'left';
    return y + TITLE_H + 2;
  }

  /**
   * Draw the L-shaped axis (Y axis + X axis baseline).
   * plotX, plotY: top-left corner of the usable plot rectangle.
   * plotW, plotH: dimensions of the usable plot rectangle.
   */
  function drawAxes(ctx, plotX, plotY, plotW, plotH) {
    ctx.strokeStyle = FG_COLOR;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    // Y axis
    ctx.moveTo(plotX, plotY);
    ctx.lineTo(plotX, plotY + plotH);
    // X axis
    ctx.lineTo(plotX + plotW, plotY + plotH);
    ctx.stroke();
  }

  /**
   * Clamp a string to at most maxChars characters, appending '.' if
   * truncated, so labels never overflow the LCD width.
   */
  function clamp(str, maxChars) {
    str = String(str);
    if (str.length <= maxChars) { return str; }
    return str.slice(0, maxChars - 1) + '.';
  }

  // ── drawBarChart ──────────────────────────────────────────────────────

  /**
   * Render a TI-84-style bar chart for poll results.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} opts
   *   @param {string[]}  opts.labels  - one label per bar
   *   @param {number[]}  opts.counts  - one count per bar (same length as labels)
   *   @param {string}   [opts.title]  - optional title shown in the header bar
   */
  function drawBarChart(ctx, opts) {
    if (!ctx || !opts) { return; }

    var labels = Array.isArray(opts.labels) ? opts.labels : [];
    var counts = Array.isArray(opts.counts) ? opts.counts : [];
    var title  = opts.title || '';

    // Require at least one bar
    var n = Math.min(labels.length, counts.length);
    if (n === 0) {
      // Draw an empty frame and return -- no throw
      var cw = ctx.canvas ? ctx.canvas.width  : 200;
      var ch = ctx.canvas ? ctx.canvas.height : 150;
      drawFrame(ctx, cw, ch);
      drawTitle(ctx, cw, title);
      return;
    }

    var W = ctx.canvas ? ctx.canvas.width  : 200;
    var H = ctx.canvas ? ctx.canvas.height : 150;

    drawFrame(ctx, W, H);
    var topY = drawTitle(ctx, W, title);

    // Plot rectangle
    var plotX = FRAME_PAD + AXIS_L;
    var plotY = topY;
    var plotW = W - FRAME_PAD - AXIS_L - FRAME_PAD;
    var plotH = H - topY - AXIS_B - FRAME_PAD;

    if (plotW <= 0 || plotH <= 0) { return; }

    drawAxes(ctx, plotX, plotY, plotW, plotH);

    // Scale bars to maxCount; treat 0-max as degenerate (all bars same height = 0)
    var maxCount = 0;
    for (var i = 0; i < n; i++) {
      var v = Number(counts[i]);
      if (isFinite(v) && v > maxCount) { maxCount = v; }
    }

    var barSlot  = plotW / n;
    var barW     = Math.max(1, Math.floor(barSlot * 0.6));
    var baseY    = plotY + plotH;

    ctx.font          = FONT_SMALL;
    ctx.textBaseline  = 'alphabetic';

    for (var j = 0; j < n; j++) {
      var count  = Number(counts[j]);
      if (!isFinite(count) || count < 0) { count = 0; }

      var slotCX = plotX + j * barSlot + barSlot / 2;
      var barH   = maxCount > 0 ? Math.round((count / maxCount) * plotH) : 0;
      var barX   = Math.round(slotCX - barW / 2);
      var barTop = baseY - barH;

      // Draw filled bar
      ctx.fillStyle = FG_COLOR;
      if (barH > 0) {
        ctx.fillRect(barX, barTop, barW, barH);
      }

      // Count above bar
      var countStr = String(Math.round(count));
      ctx.textAlign = 'center';
      var countY = barTop - 2;
      if (countY < plotY + 8) { countY = plotY + 8; }
      ctx.fillStyle = FG_COLOR;
      ctx.fillText(countStr, slotCX, countY);

      // Label below axis
      var labelStr = clamp(labels[j], Math.max(1, Math.floor(barSlot / 7)));
      ctx.textAlign = 'center';
      ctx.fillText(labelStr, slotCX, baseY + 12);
    }

    ctx.textAlign = 'left';
  }

  // ── drawDotplot ───────────────────────────────────────────────────────

  /**
   * Render a TI-84-style dotplot (one dot stacked per value).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} opts
   *   @param {number[]}  opts.values  - raw data values (one dot per entry)
   *   @param {string[]} [opts.labels] - axis labels (optional; defaults to unique sorted values)
   *   @param {string}   [opts.title]  - optional title shown in the header bar
   */
  function drawDotplot(ctx, opts) {
    if (!ctx || !opts) { return; }

    var values = Array.isArray(opts.values) ? opts.values : [];
    var title  = opts.title || '';

    var W = ctx.canvas ? ctx.canvas.width  : 200;
    var H = ctx.canvas ? ctx.canvas.height : 150;

    drawFrame(ctx, W, H);
    var topY = drawTitle(ctx, W, title);

    // Return silently on empty data -- no throw
    if (values.length === 0) { return; }

    // Collect unique sorted categories
    var seen   = {};
    var unique = [];
    for (var i = 0; i < values.length; i++) {
      var key = String(values[i]);
      if (!seen[key]) {
        seen[key] = true;
        unique.push(values[i]);
      }
    }
    unique.sort(function (a, b) { return a - b; });

    // Build category labels: prefer opts.labels (indexed by unique position),
    // fall back to string representations of the unique values.
    var axisLabels = Array.isArray(opts.labels) && opts.labels.length === unique.length
      ? opts.labels
      : unique.map(String);

    // Count occurrences per unique value
    var countMap = {};
    for (var j = 0; j < values.length; j++) {
      var k = String(values[j]);
      countMap[k] = (countMap[k] || 0) + 1;
    }

    var maxStack = 0;
    for (var m = 0; m < unique.length; m++) {
      var c = countMap[String(unique[m])] || 0;
      if (c > maxStack) { maxStack = c; }
    }

    // Plot rectangle
    var plotX = FRAME_PAD + AXIS_L;
    var plotY = topY;
    var plotW = W - FRAME_PAD - AXIS_L - FRAME_PAD;
    var plotH = H - topY - AXIS_B - FRAME_PAD;

    if (plotW <= 0 || plotH <= 0) { return; }

    drawAxes(ctx, plotX, plotY, plotW, plotH);

    var n       = unique.length;
    var slot    = plotW / n;
    var dotR    = Math.max(2, Math.min(6, Math.floor(slot / 4)));
    var baseY   = plotY + plotH;
    var stepH   = maxStack > 0 ? Math.min(dotR * 2 + 1, Math.floor(plotH / maxStack)) : dotR * 2 + 1;

    ctx.font         = FONT_SMALL;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'center';

    for (var p = 0; p < n; p++) {
      var cx     = plotX + p * slot + slot / 2;
      var count  = countMap[String(unique[p])] || 0;

      // Stack dots from the axis upward
      for (var d = 0; d < count; d++) {
        var dotCY = baseY - dotR - d * stepH - 1;
        if (dotCY - dotR < plotY) { break; } // clip at top
        ctx.fillStyle = FG_COLOR;
        ctx.beginPath();
        ctx.arc(cx, dotCY, dotR, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Axis label
      var labelStr = clamp(axisLabels[p], Math.max(1, Math.floor(slot / 7)));
      ctx.fillStyle = FG_COLOR;
      ctx.fillText(labelStr, cx, baseY + 12);
    }

    ctx.textAlign = 'left';
  }

  // ── attach to window ──────────────────────────────────────────────────

  var Ti84Plot = {
    drawBarChart: drawBarChart,
    drawDotplot:  drawDotplot
  };

  if (typeof window !== 'undefined') {
    window.Ti84Plot = Ti84Plot;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Ti84Plot;
  }
})();
