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

  // ── drawHistogram ─────────────────────────────────────────────────────

  /**
   * Render a TI-84-style histogram. Bars are flush (no gaps) to distinguish
   * from a bar chart. Bin edges are labelled along the x-axis.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} opts
   *   @param {number[]}              opts.values  - raw data values
   *   @param {number|number[]} [opts.bins]        - bin count (int) OR explicit edges (array of length >= 2). Defaults to ceil(sqrt(n)).
   *   @param {string}          [opts.title]       - optional title
   */
  function drawHistogram(ctx, opts) {
    if (!ctx || !opts) { return; }

    var values = Array.isArray(opts.values) ? opts.values.filter(function (v) {
      return typeof v === 'number' && isFinite(v);
    }) : [];
    var title = opts.title || '';

    var W = ctx.canvas ? ctx.canvas.width  : 200;
    var H = ctx.canvas ? ctx.canvas.height : 150;

    drawFrame(ctx, W, H);
    var topY = drawTitle(ctx, W, title);

    if (values.length === 0) { return; }

    // Compute bin edges.
    var edges;
    if (Array.isArray(opts.bins) && opts.bins.length >= 2) {
      edges = opts.bins.slice().sort(function (a, b) { return a - b; });
    } else {
      var binCount;
      if (typeof opts.bins === 'number' && opts.bins >= 1 && isFinite(opts.bins)) {
        binCount = Math.floor(opts.bins);
      } else {
        binCount = Math.max(1, Math.ceil(Math.sqrt(values.length)));
      }
      var min = values[0], max = values[0];
      for (var vi = 1; vi < values.length; vi++) {
        if (values[vi] < min) { min = values[vi]; }
        if (values[vi] > max) { max = values[vi]; }
      }
      if (min === max) {
        // Degenerate range: a single bin spanning [min - 0.5, max + 0.5].
        edges = [min - 0.5, max + 0.5];
      } else {
        edges = [];
        var step = (max - min) / binCount;
        for (var ei = 0; ei <= binCount; ei++) {
          edges.push(min + ei * step);
        }
      }
    }

    var nBins = edges.length - 1;
    if (nBins < 1) { return; }

    // Bin the values. A value falls in bin i if edges[i] <= v < edges[i+1],
    // except the last bin which is inclusive on the right too.
    var counts = new Array(nBins);
    for (var ci = 0; ci < nBins; ci++) { counts[ci] = 0; }
    for (var vj = 0; vj < values.length; vj++) {
      var v = values[vj];
      if (v < edges[0] || v > edges[nBins]) { continue; }
      var bi = nBins - 1;
      for (var bj = 0; bj < nBins - 1; bj++) {
        if (v < edges[bj + 1]) { bi = bj; break; }
      }
      counts[bi]++;
    }

    var maxCount = 0;
    for (var mi = 0; mi < nBins; mi++) {
      if (counts[mi] > maxCount) { maxCount = counts[mi]; }
    }

    var plotX = FRAME_PAD + AXIS_L;
    var plotY = topY;
    var plotW = W - FRAME_PAD - AXIS_L - FRAME_PAD;
    var plotH = H - topY - AXIS_B - FRAME_PAD;
    if (plotW <= 0 || plotH <= 0) { return; }

    drawAxes(ctx, plotX, plotY, plotW, plotH);

    var baseY  = plotY + plotH;
    var binSlot = plotW / nBins;

    ctx.font         = FONT_SMALL;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'center';

    for (var bk = 0; bk < nBins; bk++) {
      var barH = maxCount > 0 ? Math.round((counts[bk] / maxCount) * plotH) : 0;
      var barX = Math.round(plotX + bk * binSlot);
      var barW = Math.max(1, Math.round(binSlot)); // flush bars
      var barTop = baseY - barH;
      ctx.fillStyle   = FG_COLOR;
      ctx.strokeStyle = FG_COLOR;
      if (barH > 0) {
        ctx.fillRect(barX, barTop, barW, barH);
        // Outline so adjacent bars visually separate on the LCD.
        ctx.strokeRect(barX, barTop, barW, barH);
      }
    }

    // X-axis labels: show edges where they fit. Label every Nth edge so
    // labels don't overlap on dense bin layouts.
    var maxLabels = Math.max(2, Math.floor(plotW / 28));
    var labelStep = Math.max(1, Math.ceil(edges.length / maxLabels));
    for (var le = 0; le < edges.length; le += labelStep) {
      var ex = plotX + (le / nBins) * plotW;
      var es = (Math.abs(edges[le]) >= 100 || Math.abs(edges[le] - Math.round(edges[le])) < 1e-9)
        ? String(Math.round(edges[le]))
        : edges[le].toFixed(1);
      ctx.fillStyle = FG_COLOR;
      ctx.fillText(es, ex, baseY + 12);
    }

    ctx.textAlign = 'left';
  }

  // ── drawBoxplot ───────────────────────────────────────────────────────

  /**
   * Render a TI-84-style boxplot (or stacked parallel boxplots).
   *
   * Single dataset:
   *   Ti84Plot.drawBoxplot(ctx, { five: {min, q1, median, q3, max}, title? })
   *
   * Parallel boxplots:
   *   Ti84Plot.drawBoxplot(ctx, {
   *     datasets: [{ label, five }, { label, five }, ...],
   *     title?
   *   })
   *
   * Multiple boxplots share one x-axis (a common scale across all five-num
   * summaries), stacked top-to-bottom -- the AP-Stats parallel layout.
   */
  function drawBoxplot(ctx, opts) {
    if (!ctx || !opts) { return; }

    var title = opts.title || '';
    var W = ctx.canvas ? ctx.canvas.width  : 200;
    var H = ctx.canvas ? ctx.canvas.height : 150;

    drawFrame(ctx, W, H);
    var topY = drawTitle(ctx, W, title);

    // Normalize the input to an array of { label, five }.
    var datasets;
    if (Array.isArray(opts.datasets) && opts.datasets.length > 0) {
      datasets = opts.datasets;
    } else if (opts.five && typeof opts.five === 'object') {
      datasets = [{ label: opts.label || '', five: opts.five }];
    } else {
      return;
    }

    // Validate every dataset has a usable five-num and find the overall
    // [min, max] for the shared axis.
    var allMin = Infinity, allMax = -Infinity;
    var valid = [];
    for (var di = 0; di < datasets.length; di++) {
      var d = datasets[di];
      var f = d && d.five;
      if (!f) { continue; }
      var fmin = Number(f.min), fq1 = Number(f.q1), fmed = Number(f.median);
      var fq3  = Number(f.q3),  fmax = Number(f.max);
      if (!isFinite(fmin) || !isFinite(fq1) || !isFinite(fmed) || !isFinite(fq3) || !isFinite(fmax)) {
        continue;
      }
      valid.push({ label: d.label || '', f: { min: fmin, q1: fq1, median: fmed, q3: fq3, max: fmax } });
      if (fmin < allMin) { allMin = fmin; }
      if (fmax > allMax) { allMax = fmax; }
    }
    if (valid.length === 0) { return; }
    if (allMin === allMax) {
      // Degenerate -- spread the axis so the box is visible.
      allMin -= 0.5;
      allMax += 0.5;
    }

    var plotX = FRAME_PAD + AXIS_L;
    var plotY = topY;
    var plotW = W - FRAME_PAD - AXIS_L - FRAME_PAD;
    var plotH = H - topY - AXIS_B - FRAME_PAD;
    if (plotW <= 0 || plotH <= 0) { return; }

    drawAxes(ctx, plotX, plotY, plotW, plotH);

    function xPos(v) {
      return plotX + ((v - allMin) / (allMax - allMin)) * plotW;
    }

    // Stack the boxes vertically -- one row per dataset, with margin.
    var rowH      = plotH / valid.length;
    var boxH      = Math.max(6, Math.floor(rowH * 0.55));
    ctx.font         = FONT_SMALL;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'left';
    ctx.strokeStyle  = FG_COLOR;
    ctx.fillStyle    = FG_COLOR;
    ctx.lineWidth    = 1;

    for (var ri = 0; ri < valid.length; ri++) {
      var row = valid[ri];
      var f   = row.f;
      var cy  = plotY + ri * rowH + rowH / 2;
      var top = cy - boxH / 2;
      var bot = cy + boxH / 2;

      var xMin = xPos(f.min);
      var xQ1  = xPos(f.q1);
      var xMed = xPos(f.median);
      var xQ3  = xPos(f.q3);
      var xMax = xPos(f.max);

      // Left whisker: vertical tick at min + horizontal line to Q1.
      ctx.beginPath();
      ctx.moveTo(xMin, top + boxH * 0.2);
      ctx.lineTo(xMin, bot - boxH * 0.2);
      ctx.moveTo(xMin, cy);
      ctx.lineTo(xQ1,  cy);
      ctx.stroke();

      // Box: Q1 -> Q3 outline.
      ctx.strokeRect(xQ1, top, Math.max(1, xQ3 - xQ1), boxH);

      // Median line inside the box.
      ctx.beginPath();
      ctx.moveTo(xMed, top);
      ctx.lineTo(xMed, bot);
      ctx.stroke();

      // Right whisker: horizontal Q3 -> max + vertical tick at max.
      ctx.beginPath();
      ctx.moveTo(xQ3, cy);
      ctx.lineTo(xMax, cy);
      ctx.moveTo(xMax, top + boxH * 0.2);
      ctx.lineTo(xMax, bot - boxH * 0.2);
      ctx.stroke();

      // Row label (if any) on the left margin.
      if (row.label) {
        ctx.textAlign = 'right';
        ctx.fillText(clamp(row.label, 4), plotX - 2, cy + 3);
        ctx.textAlign = 'left';
      }
    }

    // X-axis: a few tick labels along the shared scale.
    var ticks = 5;
    ctx.textAlign = 'center';
    for (var ti = 0; ti <= ticks; ti++) {
      var tv = allMin + (ti / ticks) * (allMax - allMin);
      var tx = xPos(tv);
      var ts = (Math.abs(tv) >= 100 || Math.abs(tv - Math.round(tv)) < 1e-9)
        ? String(Math.round(tv))
        : tv.toFixed(1);
      ctx.fillText(ts, tx, plotY + plotH + 12);
    }

    ctx.textAlign = 'left';
  }

  // ── drawNormalCurve ───────────────────────────────────────────────────

  /**
   * Render a TI-84-style normal density curve with an optional shaded
   * region (the bread-and-butter visual for confidence intervals and
   * significance tests).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} opts
   *   @param {number} [opts.mean]      - default 0
   *   @param {number} [opts.sd]        - default 1 (must be > 0)
   *   @param {number} [opts.shadeLow]  - left edge of shaded region (defaults to -Infinity)
   *   @param {number} [opts.shadeHigh] - right edge of shaded region (defaults to +Infinity)
   *   @param {number} [opts.xMin]      - plot domain start (default mean - 4*sd)
   *   @param {number} [opts.xMax]      - plot domain end   (default mean + 4*sd)
   *   @param {string} [opts.title]
   *
   * Pass only shadeLow for a right-tail shade (>= shadeLow).
   * Pass only shadeHigh for a left-tail shade (<= shadeHigh).
   * Pass both for a between-shade.
   */
  function drawNormalCurve(ctx, opts) {
    if (!ctx) { return; }
    opts = opts || {};
    var mean = typeof opts.mean === 'number' && isFinite(opts.mean) ? opts.mean : 0;
    var sd   = typeof opts.sd   === 'number' && isFinite(opts.sd)   ? opts.sd   : 1;
    if (sd <= 0) { return; }

    var xMin = typeof opts.xMin === 'number' && isFinite(opts.xMin) ? opts.xMin : mean - 4 * sd;
    var xMax = typeof opts.xMax === 'number' && isFinite(opts.xMax) ? opts.xMax : mean + 4 * sd;
    if (xMax <= xMin) { return; }

    var shadeLow  = typeof opts.shadeLow  === 'number' && isFinite(opts.shadeLow)  ? opts.shadeLow  : -Infinity;
    var shadeHigh = typeof opts.shadeHigh === 'number' && isFinite(opts.shadeHigh) ? opts.shadeHigh : +Infinity;
    var hasShade = (shadeLow > -Infinity || shadeHigh < +Infinity) && shadeLow < shadeHigh;

    var title = opts.title || '';
    var W = ctx.canvas ? ctx.canvas.width  : 200;
    var H = ctx.canvas ? ctx.canvas.height : 150;

    drawFrame(ctx, W, H);
    var topY = drawTitle(ctx, W, title);

    var plotX = FRAME_PAD + AXIS_L;
    var plotY = topY;
    var plotW = W - FRAME_PAD - AXIS_L - FRAME_PAD;
    var plotH = H - topY - AXIS_B - FRAME_PAD;
    if (plotW <= 0 || plotH <= 0) { return; }

    drawAxes(ctx, plotX, plotY, plotW, plotH);

    var baseY = plotY + plotH;
    var peak  = 1 / (sd * Math.sqrt(2 * Math.PI));

    function pdf(x) {
      var z = (x - mean) / sd;
      return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
    }
    function xToCanvas(x) {
      return plotX + ((x - xMin) / (xMax - xMin)) * plotW;
    }
    function pdfToCanvas(p) {
      // peak corresponds to the top of the plot (with a small headroom).
      var headroom = 0.92;
      return baseY - (p / peak) * plotH * headroom;
    }

    var samples = Math.max(16, Math.min(400, Math.floor(plotW)));

    // Shaded region: fill from x-axis up to the curve between [shadeLow, shadeHigh].
    if (hasShade) {
      var fillLow  = Math.max(shadeLow,  xMin);
      var fillHigh = Math.min(shadeHigh, xMax);
      if (fillHigh > fillLow) {
        ctx.fillStyle = FG_COLOR;
        ctx.beginPath();
        var fillStart = xToCanvas(fillLow);
        ctx.moveTo(fillStart, baseY);
        var fillSamples = Math.max(8, Math.floor(samples * (fillHigh - fillLow) / (xMax - xMin)));
        for (var fi = 0; fi <= fillSamples; fi++) {
          var fx = fillLow + (fi / fillSamples) * (fillHigh - fillLow);
          ctx.lineTo(xToCanvas(fx), pdfToCanvas(pdf(fx)));
        }
        ctx.lineTo(xToCanvas(fillHigh), baseY);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Curve outline -- stroked over any shaded fill.
    ctx.strokeStyle = FG_COLOR;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    for (var si = 0; si <= samples; si++) {
      var x = xMin + (si / samples) * (xMax - xMin);
      var cx = xToCanvas(x);
      var cy = pdfToCanvas(pdf(x));
      if (si === 0) { ctx.moveTo(cx, cy); }
      else          { ctx.lineTo(cx, cy); }
    }
    ctx.stroke();

    // X-axis labels at +/-3 sd marks (anchored to the mean).
    ctx.font         = FONT_SMALL;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'center';
    var marks = [-3, -2, -1, 0, 1, 2, 3];
    for (var mk = 0; mk < marks.length; mk++) {
      var mv = mean + marks[mk] * sd;
      if (mv < xMin || mv > xMax) { continue; }
      var ms = (Math.abs(mv) >= 100 || Math.abs(mv - Math.round(mv)) < 1e-9)
        ? String(Math.round(mv))
        : mv.toFixed(1);
      ctx.fillStyle = FG_COLOR;
      ctx.fillText(ms, xToCanvas(mv), baseY + 12);
    }

    ctx.textAlign = 'left';
  }

  // ── attach to window ──────────────────────────────────────────────────

  var Ti84Plot = {
    drawBarChart:    drawBarChart,
    drawDotplot:     drawDotplot,
    drawHistogram:   drawHistogram,
    drawBoxplot:     drawBoxplot,
    drawNormalCurve: drawNormalCurve
  };

  if (typeof window !== 'undefined') {
    window.Ti84Plot = Ti84Plot;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Ti84Plot;
  }
})();
