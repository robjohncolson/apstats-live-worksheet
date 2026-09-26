// lib/class-snapshot.js — "Where you stand": the class's current quarter grades drawn as the
// graph the class has learned so far (dot plot / stem-and-leaf / box plot), with one highlighted
// value for "you". Shared by the Desk (My Ledger) and the teacher workspace (smartboard).
// Spec: CLASS_SNAPSHOT_SPEC.md. Pure helpers + one canvas renderer; no network, no DOM lookups.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ClassSnapshot = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function clean(values) {
    return (Array.isArray(values) ? values : [])
      .filter(function (v) { return v !== null && v !== undefined && v !== ''; })
      .map(Number).filter(function (v) { return Number.isFinite(v); })
      .sort(function (a, b) { return a - b; });
  }
  function medianOf(sorted) {
    var n = sorted.length;
    if (!n) return null;
    var mid = Math.floor(n / 2);
    return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Five-number summary the AP/TI-84 way: Q1 and Q3 are the medians of the lower and upper
  // halves, and when n is odd the overall median belongs to neither half.
  function fiveNumber(values) {
    var s = clean(values);
    var n = s.length;
    if (!n) return null;
    var mid = Math.floor(n / 2);
    var lower = s.slice(0, mid);
    var upper = s.slice(n % 2 ? mid + 1 : mid);
    return {
      min: s[0],
      q1: n === 1 ? s[0] : medianOf(lower),
      median: medianOf(s),
      q3: n === 1 ? s[0] : medianOf(upper),
      max: s[n - 1],
    };
  }
  function fences(fn) {
    if (!fn) return null;
    var iqr = fn.q3 - fn.q1;
    return { iqr: iqr, low: fn.q1 - 1.5 * iqr, high: fn.q3 + 1.5 * iqr };
  }
  function outliers(values, fn) {
    var f = fences(fn || fiveNumber(values));
    if (!f) return [];
    return clean(values).filter(function (v) { return v < f.low || v > f.high; });
  }
  // Integer bins for the dot plot; values above 100 (bonus) share the 100 bin.
  function bins(values) {
    var out = {};
    clean(values).forEach(function (v) {
      var k = Math.min(100, Math.round(v));
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  }
  // Histogram bins of width 10, left-closed ([0,10), [10,20), ... [90,100]); 100 and bonus join the top bin.
  function histBins(values) {
    var counts = [];
    for (var i = 0; i < 10; i++) counts.push({ lo: i * 10, hi: i === 9 ? 100 : i * 10 + 10, count: 0 });
    clean(values).forEach(function (v) { counts[Math.min(9, Math.max(0, Math.floor(Math.round(v) / 10)))].count++; });
    return counts;
  }
  // Stems by tens (100 → stem 10, leaf 0); every stem in the range appears, even when empty.
  function stems(values) {
    var s = clean(values).map(function (v) { return Math.round(v); });
    if (!s.length) return [];
    var lo = Math.floor(s[0] / 10), hi = Math.floor(s[s.length - 1] / 10);
    var rows = [];
    for (var st = lo; st <= hi; st++) {
      rows.push({ stem: st, leaves: s.filter(function (v) { return Math.floor(v / 10) === st; }).map(function (v) { return v % 10; }) });
    }
    return rows;
  }
  // The one-word shape the course uses: compare mean and median (2 points of slack).
  function shape(values) {
    var s = clean(values);
    if (s.length < 3) return 'too few values to describe';
    var mean = s.reduce(function (a, b) { return a + b; }, 0) / s.length;
    var med = medianOf(s);
    if (mean < med - 2) return 'skewed left';
    if (mean > med + 2) return 'skewed right';
    return 'roughly symmetric';
  }

  // Which graphs the section has learned: dot plot + stemplot with 1.5, box plot with 1.8
  // (each lesson's class date for that period must be on or before today). Default = the
  // most advanced one unlocked; before 1.5 the dot plot is shown alone.
  function mode(lessons, period, todayIso) {
    var taught = {};
    (Array.isArray(lessons) ? lessons : []).forEach(function (L) {
      var d = L && L.due && period ? L.due[period] : null;
      if (L && L.lessonKey && d && todayIso && d <= todayIso) taught[L.lessonKey] = true;
    });
    var available = ['dot'];
    if (taught['1.5']) { available.push('stem'); available.push('hist'); }
    if (taught['1.8']) available.push('box');
    // Default = the newest CED idea: box plot once 1.8 is taught, else the stemplot (1.5), else dots.
    var def = taught['1.8'] ? 'box' : taught['1.5'] ? 'stem' : 'dot';
    return { available: available, default: def, tabs: available.length > 1 };
  }

  var LABEL = { dot: 'Dot plot', stem: 'Stem-and-leaf', hist: 'Histogram', box: 'Box plot' };
  // Canvas height each small-plot mode needs (the row sizes its canvas from this).
  var MINI_HEIGHT = { box: 26, dot: 44, hist: 60, stem: 0 };   // stem: computed from the stems
  function fmt(v) { return v == null ? '—' : String(Math.round(v * 10) / 10); }

  // One line in AP vocabulary, then the action.
  function caption(opts) {
    var values = clean(opts.values), fn = fiveNumber(values), you = opts.own;
    var lines = [];
    if (!values.length) return 'Not enough classmates yet for a class picture.';
    if (opts.mode === 'box' && fn) {
      var f = fences(fn);
      lines.push('Five-number summary ' + [fn.min, fn.q1, fn.median, fn.q3, fn.max].map(fmt).join(' · ') + ' (IQR ' + fmt(f.iqr) + ').');
      if (typeof you === 'number') {
        var where = you < fn.q1 ? 'below Q1' : you > fn.q3 ? 'above Q3' : 'inside the box';
        var out = (you < f.low || you > f.high) ? ' — an outlier by the 1.5×IQR rule (lesson 1.7)' : '';
        lines.push('You: ' + fmt(you) + ' — ' + where + out + '.');
      }
    } else {
      lines.push('Shape: ' + shape(values) + '. Median ' + fmt(fn.median) + '.');
      if (typeof you === 'number') lines.push('You: ' + fmt(you) + '.');
    }
    lines.push(opts.hasGap ? 'The list below is the gap.' : 'Every score here can still move.');
    return lines.join(' ');
  }

  // ── Canvas renderer (System 7: 1px black, Geneva) ──────────────────────────────
  function draw(canvas, opts) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var values = clean(opts.values);
    var W = canvas.width, H = canvas.height;
    var own = typeof opts.own === 'number' ? opts.own : null;
    var RED = '#cc0000', INK = '#000000';
    ctx.clearRect(0, 0, W, H);
    ctx.font = '9px Geneva, Arial, sans-serif';
    ctx.textBaseline = 'alphabetic';
    if (!values.length) {
      ctx.fillStyle = '#666666'; ctx.textAlign = 'center';
      ctx.fillText('Not enough classmates yet', W / 2, H / 2);
      return;
    }
    var m = opts.mode || 'dot';
    if (m === 'stem') return drawStems(ctx, values, own, W, H, RED, INK);
    var left = 12, right = W - 12, axisY = H - 16;
    var x = function (v) { return left + (Math.max(0, Math.min(100, v)) / 100) * (right - left); };
    drawAxis(ctx, x, axisY, INK);
    if (m === 'box') return drawBox(ctx, values, own, x, axisY, RED, INK);
    if (m === 'hist') return drawHist(ctx, values, own, x, axisY, H, RED, INK);
    return drawDots(ctx, values, own, x, axisY, H, RED, INK);
  }
  function drawAxis(ctx, x, axisY, INK) {
    ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x(0), axisY + 0.5); ctx.lineTo(x(100), axisY + 0.5); ctx.stroke();
    ctx.textAlign = 'center';
    for (var t = 0; t <= 100; t += 10) {
      ctx.beginPath(); ctx.moveTo(x(t) + 0.5, axisY); ctx.lineTo(x(t) + 0.5, axisY + 3); ctx.stroke();
      if (t % 20 === 0) ctx.fillText(String(t), x(t), axisY + 12);
    }
  }
  function dot(ctx, cx, cy, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
  }
  // The viewer's own score is always one of the marks: when it is not in the pool (a teacher,
  // whose scores are not in the class data) it is added so the red mark still appears.
  function withOwn(values, own) {
    if (own == null) return values;
    var o = Math.round(own);
    if (values.some(function (v) { return Math.round(v) === o; })) return values;
    return values.concat([o]).sort(function (a, b) { return a - b; });
  }

  // ── Tentative zeros (TENTATIVE_ZEROS_SPEC.md) ─────────────────────────────────
  // A pending assignment shows "Monday's picture if nothing changes": everyone taught but
  // without a score yet is a yellow tentative 0. Red stays "you".
  var TENTATIVE_FILL = '#f5d76e', TENTATIVE_INK = '#8a6d00';
  function tentativeCount(n) {
    var c = Math.round(Number(n));
    return c > 0 ? c : 0;
  }
  // The display distribution D = [0 × tentativeZeros] ++ values, sorted. Every statistic reads D.
  function displayValues(values, tentativeZeros) {
    var zeros = [];
    for (var i = 0; i < tentativeCount(tentativeZeros); i++) zeros.push(0);
    return clean(zeros.concat(values));
  }
  // One mark per person: { v, kind: 'real' | 'tent', you }. Exactly one mark is "you" when
  // `own` is set: a tentative 0 when the viewer's own 0 is tentative, else a matching real
  // value, else an added mark (the withOwn rule). Never a yellow AND a red for one person.
  var KIND_RANK = { real: 0, tent: 1 };
  function byMark(a, b) { return (a.v - b.v) || (KIND_RANK[a.kind] - KIND_RANK[b.kind]); }
  function markList(values, own, tent) {
    var count = tent ? tentativeCount(tent.count) : 0;
    var marks = clean(values).map(function (v) { return { v: v, kind: 'real', you: false }; });
    for (var i = 0; i < count; i++) marks.push({ v: 0, kind: 'tent', you: false });
    marks.sort(byMark);
    if (own == null) return marks;
    var o = Math.round(own);
    var pick = -1;
    if (tent && tent.ownTentative && o === 0 && count > 0) {
      marks.forEach(function (m, idx) { if (m.kind === 'tent') pick = idx; });
    } else {
      for (var j = 0; j < marks.length && pick < 0; j++) {
        if (marks[j].kind === 'real' && Math.round(marks[j].v) === o) pick = j;
      }
    }
    if (pick >= 0) { marks[pick].you = true; return marks; }
    marks.push({ v: o, kind: 'real', you: true });
    return marks.sort(byMark);
  }
  function markFill(m, RED) { return m.you ? RED : m.kind === 'tent' ? TENTATIVE_FILL : '#ffffff'; }
  function markStroke(m, RED, INK) { return m.you ? RED : m.kind === 'tent' ? TENTATIVE_INK : INK; }

  function drawDots(ctx, values, own, x, axisY, H, RED, INK, tent) {
    var marks = markList(values, own, tent);
    values = marks.map(function (m) { return m.v; });
    // Bin width grows (1 → 2 → 5) until the tallest stack fits above the axis.
    var r = 3.5, rowH = 2 * r + 1, maxRows = Math.max(1, Math.floor((axisY - 14) / rowH));
    var widths = [1, 2, 5, 10], bw = 1, counts;
    for (var i = 0; i < widths.length; i++) {
      bw = widths[i]; counts = {};
      values.forEach(function (v) { var k = Math.min(100, Math.floor(Math.round(v) / bw) * bw); counts[k] = (counts[k] || 0) + 1; });
      var tallest = Math.max.apply(null, Object.keys(counts).map(function (k) { return counts[k]; }));
      if (tallest <= maxRows) break;
    }
    // Identical values (e.g. a pile of zeros) cannot be spread by wider bins: shrink the dots and
    // tighten the pitch so the whole stack fits between the axis and the top of the canvas.
    var bottom = axisY - 4;
    if (tallest > maxRows) {
      rowH = (bottom - 2) / Math.max(1, tallest - 1 + 0.5);
      r = Math.max(1.5, Math.min(3.5, (rowH - 1) / 2));
    }
    var placed = {};
    marks.forEach(function (m) {
      var k = Math.min(100, Math.floor(Math.round(m.v) / bw) * bw);
      var row = placed[k] = (placed[k] || 0) + 1;
      var cx = x(k + bw / 2 > 100 ? 100 : k + (bw - 1) / 2), cy = bottom - (row - 1) * rowH;
      dot(ctx, cx, cy, r, markFill(m, RED), markStroke(m, RED, INK));
      if (m.you) { ctx.fillStyle = RED; ctx.textAlign = 'center'; ctx.fillText('you', cx, Math.max(9, cy - r - 3)); }
    });
    if (bw > 1) { ctx.fillStyle = '#666666'; ctx.textAlign = 'right'; ctx.fillText('each dot = one student · bins of ' + bw, x(100), 9); }
  }
  function drawHist(ctx, values, own, x, axisY, H, RED, INK, tent) {
    var tentN = tent ? tentativeCount(tent.count) : 0;
    var bins = histBins(displayValues(values, tentN)), top = Math.max.apply(null, bins.map(function (b) { return b.count; })) || 1;
    var usable = axisY - 12;
    var ownBin = own == null ? -1 : Math.min(9, Math.max(0, Math.floor(Math.round(own) / 10)));
    var ownTentative = Boolean(tent && tent.ownTentative) && own != null && Math.round(own) === 0 && tentN > 0;
    bins.forEach(function (b, i) {
      if (!b.count) return;
      var x0 = x(b.lo) + 1, x1 = x(b.hi) - 1, h = Math.max(2, Math.round((b.count / top) * usable));
      // Bin 0 is split: real values at the bottom, tentative zeros stacked on top (yellow).
      var tentH = i === 0 && tentN ? Math.min(h, Math.max(2, Math.round((tentN / b.count) * h))) : 0;
      var realH = h - tentH;
      if (realH > 0) {
        ctx.fillStyle = i === ownBin && !ownTentative ? '#f3c2c2' : '#ffffff'; ctx.fillRect(x0, axisY - realH, x1 - x0, realH);
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, axisY - realH + 0.5, x1 - x0, realH);
      }
      // The viewer's own tentative 0 is their one-person share at the top, in red (never yellow too).
      var youH = tentH > 0 && ownTentative ? Math.min(tentH, Math.max(2, Math.round(tentH / tentN))) : 0;
      var yellowH = tentH - youH;
      if (yellowH > 0) {
        ctx.fillStyle = TENTATIVE_FILL; ctx.fillRect(x0, axisY - realH - yellowH, x1 - x0, yellowH);
        ctx.strokeStyle = TENTATIVE_INK; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, axisY - realH - yellowH + 0.5, x1 - x0, yellowH);
      }
      if (youH > 0) {
        ctx.fillStyle = RED; ctx.fillRect(x0, axisY - h, x1 - x0, youH);
        ctx.strokeStyle = RED; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, axisY - h + 0.5, x1 - x0, youH);
      }
      ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.fillText(String(b.count), (x0 + x1) / 2, axisY - h - 2);
    });
    if (own != null) { dot(ctx, x(own), axisY - 4, 3.5, RED, RED); ctx.fillStyle = RED; ctx.textAlign = 'center'; ctx.fillText('you', x(own), Math.max(9, axisY - 12)); }
    ctx.fillStyle = '#666666'; ctx.textAlign = 'right'; ctx.fillText('bins of 10 \u00b7 100 joins the top bin', x(100), 9);
  }
  // Stem-and-leaf leaf order for equal values: real → tentative → the red "you" leaf.
  function byLeaf(a, b) {
    return (Math.round(a.v) - Math.round(b.v)) || ((a.you ? 2 : KIND_RANK[a.kind]) - (b.you ? 2 : KIND_RANK[b.kind]));
  }
  function drawStems(ctx, values, own, W, H, RED, INK, tent) {
    var marks = markList(values, own, tent).sort(byLeaf);
    var rows = stems(marks.map(function (m) { return m.v; }));
    var lineH = Math.min(13, Math.max(9, Math.floor((H - 16) / Math.max(rows.length, 1))));
    ctx.font = Math.min(11, lineH - 1) + 'px Geneva, Arial, sans-serif';
    var stemX = 30, barX = 36, leafX = 44, y = lineH;
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(barX + 0.5, 2); ctx.lineTo(barX + 0.5, rows.length * lineH + 2); ctx.stroke();
    rows.forEach(function (rw) {
      ctx.fillStyle = INK; ctx.textAlign = 'right'; ctx.fillText(String(rw.stem), stemX, y);
      ctx.textAlign = 'left';
      var cx = leafX;
      marks.forEach(function (m) {
        var v = Math.round(m.v);
        if (Math.floor(v / 10) !== rw.stem) return;
        ctx.fillStyle = m.you ? RED : m.kind === 'tent' ? TENTATIVE_INK : INK;
        ctx.fillText(String(v % 10), cx, y);
        cx += ctx.measureText(String(v % 10) + ' ').width;
      });
      y += lineH;
    });
    var hasTent = tent && tentativeCount(tent.count) > 0;
    ctx.fillStyle = '#666666'; ctx.textAlign = 'left';
    ctx.fillText('key: 9 | 7 = 97' + (own != null ? ' · red leaf = you' : '') + (hasTent ? ' · yellow = tentative 0' : ''), leafX, H - 4);
  }
  function drawBox(ctx, values, own, x, axisY, RED, INK) {
    var fn = fiveNumber(values), f = fences(fn);
    var inside = values.filter(function (v) { return v >= f.low && v <= f.high; });
    var wLo = inside.length ? inside[0] : fn.min, wHi = inside.length ? inside[inside.length - 1] : fn.max;
    var cy = axisY - 30, half = 12;
    ctx.strokeStyle = INK; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 1;
    // whiskers
    ctx.beginPath(); ctx.moveTo(x(wLo), cy + 0.5); ctx.lineTo(x(fn.q1), cy + 0.5); ctx.moveTo(x(fn.q3), cy + 0.5); ctx.lineTo(x(wHi), cy + 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x(wLo) + 0.5, cy - 6); ctx.lineTo(x(wLo) + 0.5, cy + 6); ctx.moveTo(x(wHi) + 0.5, cy - 6); ctx.lineTo(x(wHi) + 0.5, cy + 6); ctx.stroke();
    // box + median
    var bx = x(fn.q1), bw = Math.max(2, x(fn.q3) - x(fn.q1));
    ctx.fillRect(bx, cy - half, bw, 2 * half); ctx.strokeRect(bx + 0.5, cy - half + 0.5, bw, 2 * half);
    ctx.beginPath(); ctx.moveTo(x(fn.median) + 0.5, cy - half); ctx.lineTo(x(fn.median) + 0.5, cy + half); ctx.stroke();
    // outliers
    values.forEach(function (v) { if (v < f.low || v > f.high) dot(ctx, x(v), cy, 3, '#ffffff', INK); });
    // you
    if (own != null) {
      dot(ctx, x(own), cy, 3.5, RED, RED);
      ctx.fillStyle = RED; ctx.textAlign = 'center'; ctx.fillText('you', x(own), cy - half - 4);
    }
    ctx.fillStyle = '#666666'; ctx.textAlign = 'left';
    ctx.fillText('Q1 ' + fmt(fn.q1) + ' · median ' + fmt(fn.median) + ' · Q3 ' + fmt(fn.q3), x(0), 9);
  }

  // ── Phase 2: one assignment = one small box plot + one line ──────────────────
  // Caption for a single assignment. `own` is this student's score (0 or null = missing).
  // `a.tentativeZeros` (optional) joins the statistics as zeros (the display distribution D).
  // opts.tentativeLabel: e.g. 'real after Sun 9/27'; opts.ownTentative: the viewer's 0 is tentative.
  function zerosPhrase(zeros, tentative, label) {
    var real = zeros + (zeros === 1 ? ' zero' : ' zeros');
    if (!tentative) return real;
    return real + ' + ' + tentative + ' tentative' + (label ? ' (' + label + ')' : '');
  }
  function assignmentCaption(a, own, opts) {
    opts = opts || {};
    var real = clean(a && a.values);
    var tentative = tentativeCount(a && a.tentativeZeros);
    var values = displayValues(real, tentative), fn = fiveNumber(values);
    if (!values.length || (tentative && values.length < 5)) return 'Not enough classmates yet.';
    var f = fences(fn);
    var zeros = typeof a.zeros === 'number' ? a.zeros : real.filter(function (v) { return v === 0; }).length;
    var parts = ['Median ' + fmt(fn.median) + ' \u00b7 IQR ' + fmt(f.iqr) + ' \u00b7 ' + zerosPhrase(zeros, tentative, opts.tentativeLabel) + '.'];
    if (f.iqr === 0) parts.push('More than half the class has the same score, so every other score counts as an outlier.');
    if (own !== undefined) {
      var you = own == null || opts.ownTentative ? 0 : own;
      var where = you < fn.q1 ? 'below Q1' : you > fn.q3 ? 'above Q3' : 'inside the box';
      var out = (you < f.low || you > f.high) ? ' \u2014 an outlier by the 1.5\u00d7IQR rule' : '';
      if (you === 0 && fn.q1 === 0) {
        // At least a quarter of the class is at 0, so Q1 is 0: the box swallows the zeros.
        where = 'inside the box only because at least a quarter of the class is also at 0, so Q1 itself is 0'; out = '';
      }
      parts.push('You: ' + fmt(you) + (opts.ownTentative ? ' (tentative)' : '') + ' \u2014 ' + where + out + '.');
    }
    return parts.join(' ');
  }
  // Dot plot canvas: ~8px per dot in the tallest stack of identical scores (floor 44, cap 120);
  // drawDots squeezes whatever still does not fit.
  function dotHeight(values) {
    var counts = bins(values), tallest = 0;
    Object.keys(counts).forEach(function (k) { if (counts[k] > tallest) tallest = counts[k]; });
    return Math.max(MINI_HEIGHT.dot, Math.min(120, tallest * 8 + 26));
  }
  // Height a small plot needs for a mode (stem-and-leaf grows with the number of stems).
  function miniHeight(mode, values, own, tentativeZeros) {
    if (mode === 'stem') return Math.max(26, stems(withOwn(displayValues(values, tentativeZeros), own)).length * 11 + 14);
    if (mode === 'dot') return dotHeight(withOwn(displayValues(values, tentativeZeros), own));
    return MINI_HEIGHT[mode] || MINI_HEIGHT.box;
  }
  // A compact per-assignment plot in the chosen form: box (default), dot, hist, or stem.
  function drawMini(canvas, opts) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var real = clean(opts.values), W = canvas.width, H = canvas.height;
    var tent = { count: tentativeCount(opts.tentativeZeros), ownTentative: Boolean(opts.ownTentative) };
    var values = displayValues(real, tent.count);   // D: statistics include tentative zeros
    ctx.clearRect(0, 0, W, H);
    ctx.font = '9px Geneva, Arial, sans-serif'; ctx.textBaseline = 'alphabetic';
    if (values.length < 5) { ctx.fillStyle = '#666666'; ctx.fillText('n < 5', 4, H / 2 + 3); return; }
    var mode = opts.mode || 'box';
    var ownV = typeof opts.own === 'number' ? opts.own : null;
    if (mode === 'stem') return drawStems(ctx, real, ownV, W, H, '#cc0000', '#000', tent);
    if (mode === 'dot' || mode === 'hist') {
      var left = 6, right = W - 6, axisY = H - 12;
      var xs = function (v) { return left + (Math.max(0, Math.min(100, v)) / 100) * (right - left); };
      ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(xs(0), axisY + 0.5); ctx.lineTo(xs(100), axisY + 0.5); ctx.stroke();
      ctx.fillStyle = '#666'; ctx.textAlign = 'center';
      [0, 50, 100].forEach(function (t) { ctx.beginPath(); ctx.moveTo(xs(t) + 0.5, axisY); ctx.lineTo(xs(t) + 0.5, axisY + 3); ctx.stroke(); ctx.fillText(String(t), xs(t), axisY + 11); });
      if (mode === 'hist') return drawHist(ctx, real, ownV, xs, axisY, H, '#cc0000', '#000', tent);
      return drawDots(ctx, real, ownV, xs, axisY, H, '#cc0000', '#000', tent);
    }
    return drawMiniBox(ctx, values, real, ownV, tent, W, H);
  }
  // The mini box plot, computed on D. Outlier dots at 0: white/black for real zeros, a yellow
  // dot 6px below the centre line for tentative zeros (both show when mixed).
  function drawMiniBox(ctx, values, real, own, tent, W, H) {
    var fn = fiveNumber(values), f = fences(fn);
    var left = 6, right = W - 6, cy = H / 2, half = Math.max(5, Math.floor(H / 2) - 4);
    var x = function (v) { return left + (Math.max(0, Math.min(100, v)) / 100) * (right - left); };
    var inside = values.filter(function (v) { return v >= f.low && v <= f.high; });
    var wLo = inside.length ? inside[0] : fn.min, wHi = inside.length ? inside[inside.length - 1] : fn.max;
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x(wLo), cy + 0.5); ctx.lineTo(x(fn.q1), cy + 0.5); ctx.moveTo(x(fn.q3), cy + 0.5); ctx.lineTo(x(wHi), cy + 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x(wLo) + 0.5, cy - 4); ctx.lineTo(x(wLo) + 0.5, cy + 4); ctx.moveTo(x(wHi) + 0.5, cy - 4); ctx.lineTo(x(wHi) + 0.5, cy + 4); ctx.stroke();
    var bx = x(fn.q1), bw = Math.max(2, x(fn.q3) - x(fn.q1));
    ctx.fillRect(bx, cy - half, bw, 2 * half); ctx.strokeRect(bx + 0.5, cy - half + 0.5, bw, 2 * half);
    ctx.beginPath(); ctx.moveTo(x(fn.median) + 0.5, cy - half); ctx.lineTo(x(fn.median) + 0.5, cy + half); ctx.stroke();
    var isOut = function (v) { return v < f.low || v > f.high; };
    real.forEach(function (v) { if (isOut(v)) dot(ctx, x(v), cy, 2.5, '#fff', '#000'); });
    // The viewer's own tentative 0 is the red dot, so a lone tentative 0 gets no yellow twin.
    var otherTent = tent.count - (tent.ownTentative && own === 0 && tent.count > 0 ? 1 : 0);
    if (otherTent > 0 && isOut(0)) dot(ctx, x(0), cy + 6, 2.5, TENTATIVE_FILL, TENTATIVE_INK);
    if (own != null) dot(ctx, x(own), cy, 3.5, '#cc0000', '#cc0000');
    // faint 0 / 50 / 100 ticks so rows line up visually
    ctx.strokeStyle = '#bbb';
    [0, 50, 100].forEach(function (t) { ctx.beginPath(); ctx.moveTo(x(t) + 0.5, H - 3); ctx.lineTo(x(t) + 0.5, H); ctx.stroke(); });
  }

  return {
    fiveNumber: fiveNumber, fences: fences, outliers: outliers, bins: bins, stems: stems,
    shape: shape, mode: mode, caption: caption, draw: draw, LABEL: LABEL,
    assignmentCaption: assignmentCaption, drawMini: drawMini, miniHeight: miniHeight, histBins: histBins,
    TENTATIVE_FILL: TENTATIVE_FILL, TENTATIVE_INK: TENTATIVE_INK,
    quartileMethod: 'median of each half; the overall median is excluded when n is odd (TI-84)',
  };
});
