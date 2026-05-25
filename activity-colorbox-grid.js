/**
 * activity-colorbox-grid.js
 *
 * Live Classroom V6 -- Unit B colorbox-grid renderer (2-D contingency
 * table).  Generalizes activity-colorbox.js's 1-D color sort to a 4 x N
 * grid:  row = student's hue quadrant, col = a second categorical axis
 * (either prompt-mode pick or auto-mode random assignment).
 *
 * Public API (attached to window.ActivityColorboxGrid):
 *
 *   var handle = ActivityColorboxGrid.mount(mountEl, opts);
 *   handle.updateState(activityState);   // redraw grid + maybe modal
 *   handle.showOutcome('success' | 'timeout' | 'cancel');
 *   handle.destroy();                    // remove canvas + modal
 *
 * opts shape:
 *   {
 *     width:           number?,        // overrides mountEl.clientWidth
 *     height:          number?,        // overrides default 180
 *     currentUsername: string?,        // this Desk's logged-in user
 *     boardHandle:     object?         // exposes sendActivityValue()
 *   }
 *
 * The renderer is plain 2D canvas + a single <div> modal -- no
 * libraries -- so it works in jsdom tests with a recording context stub
 * as well as in the real Desk page.
 *
 * Layout:
 *   - A full-canvas grid overlay (mountEl.clientWidth x ~180 px) drawn
 *     on its own canvas, absolutely positioned inside mountEl with
 *     pointer-events: none so the underlying classroom-board is still
 *     interactive.
 *   - Four horizontal rows (R / Y / G / B), each tinted at 0.18 alpha.
 *   - N vertical columns (2..4), labels at the top edge.
 *   - Per-cell tally count in the cell center.
 *   - Marginal column totals along the bottom edge.
 *   - Marginal row totals along the right edge.
 *   - Grand total in bottom-right.
 *   - Progress bar across the very top (holdMs / holdTargetMs).
 *
 * State shape (per LIVE_CLASSROOM_V6_BUILD.md C2 serializeForBoard):
 *   {
 *     secondAxis:   { mode, question?, options? | labels? },
 *     colCount:     2..4,
 *     assignments:  { username: { row } },
 *     picks:        { username: int | null },
 *     currentCell:  { username: { row, col } },
 *     tally:        4 x colCount matrix of ints,
 *     holdMs:       int,
 *     holdTargetMs: 5000
 *   }
 *
 * ASCII-only.  LF line endings.
 */

(function () {
  'use strict';

  // Palette -- one tint per row (Red / Yellow / Green / Blue).
  var ROW_FILLS         = ['#ff5555', '#ddcc44', '#55cc55', '#5577cc'];
  var ROW_LABELS        = ['Red', 'Yellow', 'Green', 'Blue'];
  var ROW_FILL_ALPHA    = 0.18;

  var BG_COLOR          = '#1f1f24';   // grid backdrop behind row tints
  var GRID_LINE_COLOR   = 'rgba(0, 0, 0, 0.45)';
  var TEXT_COLOR        = '#f4f4f4';
  var EDGE_LABEL_COLOR  = '#ffffff';
  var MARGINAL_COLOR    = '#f8f8c8';   // soft yellow for marginals + totals

  var COL_LABEL_FONT    = 'bold 11px monospace';
  var ROW_LABEL_FONT    = 'bold 11px monospace';
  var TALLY_FONT        = 'bold 14px monospace';
  var MARGINAL_FONT     = 'bold 11px monospace';
  var GRAND_FONT        = 'bold 12px monospace';
  var BADGE_FONT        = 'bold 10px monospace';
  var OUTCOME_FONT      = 'bold 22px sans-serif';

  var PROGRESS_BG       = 'rgba(255, 255, 255, 0.15)';
  var PROGRESS_FILL     = 'rgba(255, 255, 255, 0.75)';

  var SUCCESS_OVERLAY   = 'rgba(40, 200, 90, 0.45)';
  var TIMEOUT_OVERLAY   = 'rgba(230, 140, 40, 0.45)';
  var CANCEL_OVERLAY    = 'rgba(120, 120, 120, 0.5)';
  var SUCCESS_TEXT      = '#0a3d18';
  var TIMEOUT_TEXT      = '#3a1f00';
  var CANCEL_TEXT       = '#1a1a1a';

  var DEFAULT_CSS_W     = 320;
  var DEFAULT_CSS_H     = 180;
  var PROGRESS_H        = 4;       // px tall at the very top
  var GRID_TOP_PAD      = 18;      // space below progress bar for col labels
  var GRID_BOTTOM_PAD   = 18;      // space at the bottom for marginal col totals
  var GRID_LEFT_PAD     = 36;      // space at the left for row labels
  var GRID_RIGHT_PAD    = 36;      // space at the right for marginal row totals

  /**
   * Resolve the device pixel ratio.  In jsdom there is no
   * devicePixelRatio, so we fall back to 1.
   */
  function resolveDpr() {
    if (typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number') {
      var dpr = window.devicePixelRatio;
      if (isFinite(dpr) && dpr > 0) { return dpr; }
    }
    return 1;
  }

  /**
   * Compute geometry for the 4 x N grid inside a canvas of size
   * (cssW, cssH).  Returns the inner grid origin + cell extents.
   */
  function computeGeometry(cssW, cssH, colCount) {
    var cols = (colCount >= 2 && colCount <= 4) ? colCount : 2;
    var innerX = GRID_LEFT_PAD;
    var innerY = GRID_TOP_PAD;
    var innerW = Math.max(0, cssW - GRID_LEFT_PAD - GRID_RIGHT_PAD);
    var innerH = Math.max(0, cssH - GRID_TOP_PAD - GRID_BOTTOM_PAD);
    var cellW  = (cols > 0) ? (innerW / cols) : innerW;
    var rowH   = innerH / 4;
    return {
      cssW:   cssW,
      cssH:   cssH,
      cols:   cols,
      innerX: innerX,
      innerY: innerY,
      innerW: innerW,
      innerH: innerH,
      cellW:  cellW,
      rowH:   rowH
    };
  }

  /**
   * Normalize the inbound activity state into a shape with safe defaults.
   */
  function normalizeState(state) {
    var s = state || {};
    var second   = s.secondAxis || { mode: 'prompt', question: '', options: ['No', 'Yes'] };
    var colCount = (typeof s.colCount === 'number' && s.colCount >= 2 && s.colCount <= 4)
                   ? s.colCount
                   : ((second.mode === 'auto' && second.labels) ? second.labels.length
                       : (second.options ? second.options.length : 2));
    if (colCount < 2) { colCount = 2; }
    if (colCount > 4) { colCount = 4; }

    var assignments = s.assignments || {};
    var picks       = s.picks       || {};
    var currentCell = s.currentCell || {};
    var tally       = (Array.isArray(s.tally) && s.tally.length === 4) ? s.tally : emptyTally(colCount);
    var holdMs      = (typeof s.holdMs       === 'number') ? s.holdMs       : 0;
    var holdTgt     = (typeof s.holdTargetMs === 'number' && s.holdTargetMs > 0) ? s.holdTargetMs : 5000;

    // Resolve column labels: prompt -> options, auto -> labels.
    var colLabels = [];
    if (second.mode === 'auto' && Array.isArray(second.labels)) {
      colLabels = second.labels.slice(0, colCount);
    } else if (Array.isArray(second.options)) {
      colLabels = second.options.slice(0, colCount);
    }
    while (colLabels.length < colCount) { colLabels.push('?'); }

    return {
      secondAxis:   second,
      colCount:     colCount,
      assignments:  assignments,
      picks:        picks,
      currentCell:  currentCell,
      tally:        tally,
      holdMs:       holdMs,
      holdTargetMs: holdTgt,
      colLabels:    colLabels
    };
  }

  function emptyTally(cols) {
    var out = [];
    for (var r = 0; r < 4; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) { row.push(0); }
      out.push(row);
    }
    return out;
  }

  /**
   * Paint the canvas background (full rect).
   */
  function drawBackground(ctx, geom) {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, geom.cssW, geom.cssH);
  }

  /**
   * Paint per-row translucent tints across the full row width (inside
   * the inner grid area).  One fillRect per row.
   */
  function drawRowTints(ctx, geom) {
    var prevAlpha = (typeof ctx.globalAlpha === 'number') ? ctx.globalAlpha : 1;
    ctx.globalAlpha = ROW_FILL_ALPHA;
    for (var r = 0; r < 4; r++) {
      ctx.fillStyle = ROW_FILLS[r];
      ctx.fillRect(geom.innerX, geom.innerY + r * geom.rowH, geom.innerW, geom.rowH);
    }
    ctx.globalAlpha = prevAlpha;
  }

  /**
   * Paint the 4 x N grid lines + the outer border around each cell.
   * One strokeRect per cell so tests can count grid cells unambiguously.
   */
  function drawGridLines(ctx, geom) {
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth   = 1;
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < geom.cols; c++) {
        var cx = geom.innerX + c * geom.cellW;
        var cy = geom.innerY + r * geom.rowH;
        ctx.strokeRect(cx, cy, geom.cellW, geom.rowH);
      }
    }
  }

  /**
   * Paint per-column labels along the top edge (above the grid).
   */
  function drawColumnLabels(ctx, geom, colLabels) {
    ctx.fillStyle    = EDGE_LABEL_COLOR;
    ctx.font         = COL_LABEL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    var labelY = geom.innerY - 4;
    for (var c = 0; c < geom.cols; c++) {
      var cx    = geom.innerX + c * geom.cellW + geom.cellW / 2;
      var label = (colLabels[c] != null) ? String(colLabels[c]) : '?';
      ctx.fillText(label, cx, labelY);
    }
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Paint per-row labels (R / Y / G / B) along the left edge.
   */
  function drawRowLabels(ctx, geom) {
    ctx.fillStyle    = EDGE_LABEL_COLOR;
    ctx.font         = ROW_LABEL_FONT;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    var labelX = geom.innerX - 6;
    for (var r = 0; r < 4; r++) {
      var cy = geom.innerY + r * geom.rowH + geom.rowH / 2;
      ctx.fillText(ROW_LABELS[r], labelX, cy);
    }
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Paint the per-cell tally count in each cell center.
   */
  function drawCellTallies(ctx, geom, tally) {
    ctx.fillStyle    = TEXT_COLOR;
    ctx.font         = TALLY_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    for (var r = 0; r < 4; r++) {
      var rowArr = (tally && tally[r]) ? tally[r] : [];
      for (var c = 0; c < geom.cols; c++) {
        var count = (typeof rowArr[c] === 'number') ? rowArr[c] : 0;
        var cx    = geom.innerX + c * geom.cellW + geom.cellW / 2;
        var cy    = geom.innerY + r * geom.rowH + geom.rowH / 2;
        ctx.fillText(String(count), cx, cy);
      }
    }
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Paint the marginal totals: column sums along the bottom edge, row
   * sums along the right edge, grand total in the bottom-right corner.
   */
  function drawMarginals(ctx, geom, tally) {
    var colSums = [];
    var rowSums = [];
    var grand   = 0;
    for (var c = 0; c < geom.cols; c++) { colSums.push(0); }
    for (var r = 0; r < 4; r++) {
      var sum = 0;
      var rowArr = (tally && tally[r]) ? tally[r] : [];
      for (var cc = 0; cc < geom.cols; cc++) {
        var v = (typeof rowArr[cc] === 'number') ? rowArr[cc] : 0;
        sum         += v;
        colSums[cc] += v;
        grand       += v;
      }
      rowSums.push(sum);
    }

    // Column sums along the bottom edge.
    ctx.fillStyle    = MARGINAL_COLOR;
    ctx.font         = MARGINAL_FONT;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    var bottomY = geom.innerY + geom.innerH + 2;
    for (var cb = 0; cb < geom.cols; cb++) {
      var cxb = geom.innerX + cb * geom.cellW + geom.cellW / 2;
      ctx.fillText(String(colSums[cb]), cxb, bottomY);
    }

    // Row sums along the right edge.
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    var rightX = geom.innerX + geom.innerW + 4;
    for (var rr = 0; rr < 4; rr++) {
      var cyr = geom.innerY + rr * geom.rowH + geom.rowH / 2;
      ctx.fillText(String(rowSums[rr]), rightX, cyr);
    }

    // Grand total in the bottom-right corner.
    ctx.font         = GRAND_FONT;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N=' + grand, geom.cssW - 2, geom.cssH - 2);

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Paint the faint progress bar across the very top of the canvas.
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
   * Auto-mode badge: above the current user's avatar, display the
   * label of their assigned column.  In jsdom there is no real avatar
   * position, so we just render the badge text near the top-left of the
   * canvas (where the current user typically starts).
   */
  function drawAutoBadge(ctx, geom, norm, currentUsername) {
    if (!currentUsername) { return; }
    if (!norm.secondAxis || norm.secondAxis.mode !== 'auto') { return; }
    var pick = norm.picks[currentUsername];
    if (pick == null) { return; }
    var labels = Array.isArray(norm.secondAxis.labels) ? norm.secondAxis.labels : [];
    if (pick < 0 || pick >= labels.length) { return; }

    var text = String(labels[pick]);
    ctx.fillStyle    = MARGINAL_COLOR;
    ctx.font         = BADGE_FONT;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('You: ' + text, 4, PROGRESS_H + 2);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Full redraw of the canvas given a normalized state.
   */
  function renderState(handle, state) {
    var ctx  = handle.ctx;
    var norm = normalizeState(state);
    var geom = computeGeometry(handle.cssW, handle.cssH, norm.colCount);

    drawBackground(ctx, geom);
    drawRowTints(ctx, geom);
    drawProgress(ctx, geom, norm.holdMs, norm.holdTargetMs);
    drawGridLines(ctx, geom);
    drawColumnLabels(ctx, geom, norm.colLabels);
    drawRowLabels(ctx, geom);
    drawCellTallies(ctx, geom, norm.tally);
    drawMarginals(ctx, geom, norm.tally);
    drawAutoBadge(ctx, geom, norm, handle.currentUsername);
  }

  /**
   * Render an outcome overlay on top of the existing scene.
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

  // ---------------------------------------------------------------------------
  // Prompt modal
  // ---------------------------------------------------------------------------

  /**
   * Build the modal DOM element (button list + question text).  The
   * modal is appended inside mountEl (NOT document.body) so destroy()
   * can clean it up locally and the modal scrolls / stays inside the
   * Desk's LC pane.
   */
  function buildModalElement(ownerDoc, question, options, onPick) {
    var wrap = ownerDoc.createElement('div');
    wrap.className                 = 'activity-colorbox-grid-modal';
    wrap.style.position            = 'absolute';
    wrap.style.left                = '50%';
    wrap.style.top                 = '50%';
    wrap.style.transform           = 'translate(-50%, -50%)';
    wrap.style.minWidth            = '220px';
    wrap.style.maxWidth            = '90%';
    wrap.style.padding             = '14px 16px';
    wrap.style.background          = '#222230';
    wrap.style.color               = '#f4f4f4';
    wrap.style.border              = '2px solid #444466';
    wrap.style.borderRadius        = '6px';
    wrap.style.boxShadow           = '0 4px 16px rgba(0,0,0,0.5)';
    wrap.style.fontFamily          = 'monospace';
    wrap.style.fontSize            = '13px';
    wrap.style.textAlign           = 'center';
    wrap.style.pointerEvents       = 'auto';
    wrap.style.zIndex              = '20';

    var q = ownerDoc.createElement('div');
    q.className          = 'activity-colorbox-grid-modal__question';
    q.style.marginBottom = '10px';
    q.style.fontWeight   = 'bold';
    q.textContent        = String(question || 'Pick one');
    wrap.appendChild(q);

    var btnRow = ownerDoc.createElement('div');
    btnRow.className     = 'activity-colorbox-grid-modal__buttons';
    btnRow.style.display = 'flex';
    btnRow.style.gap     = '6px';
    btnRow.style.flexWrap = 'wrap';
    btnRow.style.justifyContent = 'center';

    var buttons = [];
    for (var i = 0; i < options.length; i++) {
      (function (idx) {
        var btn = ownerDoc.createElement('button');
        btn.type           = 'button';
        btn.className      = 'activity-colorbox-grid-modal__btn';
        btn.dataset.choice = String(idx);
        btn.style.padding  = '6px 12px';
        btn.style.background = '#3a3a55';
        btn.style.color      = '#fff';
        btn.style.border     = '1px solid #555577';
        btn.style.borderRadius = '4px';
        btn.style.cursor       = 'pointer';
        btn.style.font         = 'inherit';
        btn.textContent = (idx + 1) + ': ' + String(options[idx]);
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          onPick(idx);
        });
        btnRow.appendChild(btn);
        buttons.push(btn);
      })(i);
    }
    wrap.appendChild(btnRow);

    return { el: wrap, buttons: buttons };
  }

  /**
   * Decide whether the modal should currently be visible for this Desk.
   */
  function shouldShowModal(norm, currentUsername) {
    if (!currentUsername)                                 { return false; }
    if (!norm.secondAxis || norm.secondAxis.mode !== 'prompt') { return false; }
    if (!Array.isArray(norm.secondAxis.options))          { return false; }
    if (norm.secondAxis.options.length < 2)               { return false; }
    if (!(currentUsername in norm.picks))                 { return false; }
    if (norm.picks[currentUsername] != null)              { return false; }
    return true;
  }

  /**
   * Mount-or-update the prompt modal, given the latest normalized state.
   * Hides + removes the existing modal if it should no longer be shown.
   */
  function syncModal(handle, norm) {
    var shouldShow = shouldShowModal(norm, handle.currentUsername);
    if (!shouldShow) {
      removeModal(handle);
      return;
    }

    // Already mounted and the question hasn't changed?  Leave it alone.
    if (handle._modal && handle._modal.question === norm.secondAxis.question
        && handle._modal.optionCount === norm.secondAxis.options.length) {
      return;
    }

    // Otherwise (first time, or question changed) tear down + rebuild.
    removeModal(handle);

    var ownerDoc = handle._mountEl.ownerDocument
                || (typeof document !== 'undefined' ? document : null);
    if (!ownerDoc) { return; }

    var built = buildModalElement(
      ownerDoc,
      norm.secondAxis.question,
      norm.secondAxis.options,
      function (idx) { sendPick(handle, idx); }
    );

    handle._mountEl.appendChild(built.el);
    handle._modal = {
      el:          built.el,
      buttons:     built.buttons,
      question:    norm.secondAxis.question,
      optionCount: norm.secondAxis.options.length
    };
  }

  function removeModal(handle) {
    if (!handle._modal) { return; }
    if (handle._modal.el && handle._modal.el.parentNode) {
      handle._modal.el.parentNode.removeChild(handle._modal.el);
    }
    handle._modal = null;
  }

  /**
   * Fire `sendActivityValue({choice: idx})` via the supplied
   * boardHandle.  Logs a warning if no boardHandle was injected.
   */
  function sendPick(handle, idx) {
    var bh = handle.boardHandle;
    if (bh && typeof bh.sendActivityValue === 'function') {
      try {
        bh.sendActivityValue({ choice: idx });
      } catch (err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[colorbox-grid] sendActivityValue threw:', err);
        }
      }
      return;
    }
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[colorbox-grid] no boardHandle.sendActivityValue available; choice=' + idx);
    }
  }

  /**
   * Keyboard handler: while the modal is mounted, 1/2/3/4 fire the
   * matching button.  We attach the listener on `ownerDoc` so it works
   * regardless of focus.
   */
  function installKeyHandler(handle) {
    if (handle._keyHandler) { return; }
    var ownerDoc = handle._mountEl && handle._mountEl.ownerDocument;
    if (!ownerDoc) { return; }

    handle._keyHandler = function (e) {
      if (!handle._modal) { return; }
      var key = e.key;
      var idx = -1;
      if (key === '1') { idx = 0; }
      else if (key === '2') { idx = 1; }
      else if (key === '3') { idx = 2; }
      else if (key === '4') { idx = 3; }
      if (idx < 0) { return; }
      if (idx >= handle._modal.buttons.length) { return; }
      e.preventDefault();
      e.stopPropagation();
      sendPick(handle, idx);
    };
    ownerDoc.addEventListener('keydown', handle._keyHandler, true);
  }

  function removeKeyHandler(handle) {
    if (!handle._keyHandler) { return; }
    var ownerDoc = handle._mountEl && handle._mountEl.ownerDocument;
    if (ownerDoc) {
      ownerDoc.removeEventListener('keydown', handle._keyHandler, true);
    }
    handle._keyHandler = null;
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
    var cssW   = (typeof opts.width  === 'number' && opts.width  > 0) ? opts.width
               : (mountEl.clientWidth || DEFAULT_CSS_W);
    var cssH   = (typeof opts.height === 'number' && opts.height > 0) ? opts.height
               : DEFAULT_CSS_H;
    var dpr    = resolveDpr();

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
      _modal:          null,
      _keyHandler:     null,
      ctx:             ctx,
      cssW:            cssW,
      cssH:            cssH,
      currentUsername: opts.currentUsername || null,
      boardHandle:     opts.boardHandle    || null,
      destroyed:       false
    };

    handle.updateState = function (state) {
      if (handle.destroyed || !handle.ctx) { return; }
      var norm = normalizeState(state);
      renderState(handle, state);
      syncModal(handle, norm);
      if (handle._modal) { installKeyHandler(handle); }
      else               { removeKeyHandler(handle); }
    };

    handle.showOutcome = function (outcome) {
      if (handle.destroyed || !handle.ctx) { return; }
      renderOutcome(handle, outcome || 'cancel');
      removeModal(handle);
      removeKeyHandler(handle);
    };

    handle.destroy = function () {
      if (handle.destroyed) { return; }
      handle.destroyed = true;
      removeModal(handle);
      removeKeyHandler(handle);
      if (handle._canvas && handle._canvas.parentNode) {
        handle._canvas.parentNode.removeChild(handle._canvas);
      }
      handle._canvas  = null;
      handle._mountEl = null;
      handle.ctx      = null;
    };

    // Initial empty render so the canvas is not blank before the first
    // activity state arrives.
    if (handle.ctx) {
      var geom = computeGeometry(cssW, cssH, 2);
      drawBackground(ctx, geom);
      drawRowTints(ctx, geom);
    }

    return handle;
  }

  function noopHandle() {
    return {
      destroy:     function () {},
      updateState: function () {},
      showOutcome: function () {}
    };
  }

  var ActivityColorboxGrid = {
    mount: mount
  };

  if (typeof window !== 'undefined') {
    window.ActivityColorboxGrid = ActivityColorboxGrid;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActivityColorboxGrid;
  }
})();
