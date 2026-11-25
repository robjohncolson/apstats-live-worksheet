// ── ANDROID Phase 2 — on-device ledger merge (ANDROID_PHASE2_LEDGER_MERGE_SPEC) ──
// OFFLINE, instead of restoring the unverified last-/grade blob, re-derive the
// grade from the student's OWN local signed ledger rows using the shared engine
// (window.GradeEngine, byte-identical to the server). Inputs (redacted key +
// schedule + config + counts) come from GET /grade/offline-inputs, cached on each
// online visit. NEVER runs in view-as (the cache keys return null there, like the
// grade cache) and never overrides a successful online /grade — additive only.
function _phase2InputsKey() {
  try {
    if (typeof window !== 'undefined' && window.__VIEW_AS_STUDENT_ID__) return null;
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return null;
    var sid = (window.rosterClient && typeof rosterClient.studentId === 'function') ? rosterClient.studentId() : null;
    return sid ? ('apstats_grade_inputs_v1:' + sid) : null;
  } catch (_) { return null; }
}
function _phase2PersistInputs(inputs) {
  try { var k = _phase2InputsKey(); if (k && inputs) localStorage.setItem(k, JSON.stringify({ ts: Date.now(), inputs: inputs })); } catch (_) {}
}
function _phase2LoadInputs() {
  try { var k = _phase2InputsKey(); if (!k) return null; var o = JSON.parse(localStorage.getItem(k) || 'null'); return (o && o.inputs) || null; } catch (_) { return null; }
}
// Fire-and-forget on an online visit: refresh the offline-inputs cache + pull the
// student's signed ledger into the local replica. Both degrade silently offline.
var _phase2BaseUrl = null;             // last roster base seen (for the wallet refresh)
function _phase2RefreshOnline(baseUrl, token) {
  try {
    var key = _phase2InputsKey();
    if (key == null) return; // view-as / signed-out → skip
    var roster = window.rosterClient;
    var sessionToken = roster && typeof roster.token === 'function' ? roster.token() : token;
    if (sessionToken !== token) return;
    var request = {};
    _phase2RefreshOnline._request = request;
    function requestIsCurrent() {
      var currentRoster = window.rosterClient;
      var currentToken = currentRoster && typeof currentRoster.token === 'function' ? currentRoster.token() : token;
      return _phase2RefreshOnline._request === request
        && _phase2InputsKey() === key && currentToken === sessionToken;
    }
    _phase2BaseUrl = baseUrl || _phase2BaseUrl;
    if (typeof fetch === 'function') {
      fetch(baseUrl + '/grade/offline-inputs?token=' + encodeURIComponent(token))
        .then(function (r) { return requestIsCurrent() && r && r.ok ? r.json() : null; })
        .then(function (j) { if (requestIsCurrent() && j && j.ok) _phase2PersistInputs(j); })
        .catch(function () {});
    }
    _phase2RegisterIssuer(baseUrl);
    if (window.LedgerStore && typeof LedgerStore.pull === 'function') {
      LedgerStore.pull(window.rosterClient, { serverUrl: baseUrl })
        .then(function () { if (requestIsCurrent()) _phase2RefreshVerifySummary(); })
        .catch(function () {});
    }
  } catch (_) {}
}

// Trust the roster server's Ed25519 issuer key for client-side receipt verification.
// Fetched once from /receipts/issuer and added to ReceiptVerify's registry (idempotent)
// — covers the case where the roster issuer isn't one of the hardcoded public keys.
var _phase2IssuerRegistered = false;
function _phase2RegisterIssuer(baseUrl) {
  try {
    if (_phase2IssuerRegistered || !baseUrl) return;
    if (!window.ReceiptVerify || !Array.isArray(ReceiptVerify.ISSUERS) || typeof fetch !== 'function') return;
    fetch(baseUrl + '/receipts/issuer')
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.enabled) return;
        // Issuer-key history (Phase 4 §2): register the WHOLE trust set so receipts
        // signed by a retired/rotated key still verify. Falls back to the single
        // current pubkey for an older server.
        var keys = (j.pubkeys && j.pubkeys.length) ? j.pubkeys : (j.pubkey ? [j.pubkey] : []);
        keys.forEach(function (pk) {
          if (!pk) return;
          var have = ReceiptVerify.ISSUERS.some(function (i) { return i.pubkey === pk; });
          if (!have) ReceiptVerify.ISSUERS.push({ name: 'Roster', pubkey: pk, kind: 'roster' });
        });
        if (keys.length) _phase2IssuerRegistered = true;
      })
      .catch(function () {});
  } catch (_) {}
}

// Verify every locally-stored signed row once and cache the counts; _walletPaint
// reads the cache synchronously to render the 🔐 chip. Students only, not view-as.
var _phase2VerifySummary = null;
function _phase2RefreshVerifySummary(onDone) {
  try {
    if (_phase2InputsKey() == null) return; // view-as / signed-out → no verification
    if (!window.LedgerStore || typeof LedgerStore.verifyAll !== 'function') return;
    LedgerStore.verifyAll().then(function (r) {
      if (r) _phase2VerifySummary = { verified: r.verified, unverified: r.unverified, tampered: r.tampered, total: r.total, available: r.available };
      if (typeof onDone === 'function') { try { onDone(); } catch (_) {} }
    }).catch(function () {});
  } catch (_) {}
}

// Unsynced offline submissions (OfflineQueue) → ledger-row shape, so just-finished
// offline work counts in the re-derivation before it syncs.
function _phase2QueueRows() {
  try {
    if (!window.OfflineQueue || typeof OfflineQueue.all !== 'function') return Promise.resolve([]);
    return OfflineQueue.all().then(function (recs) {
      return (recs || []).map(function (q) {
        return {
          item_id: q.itemId, source: q.source, response: q.response,
          score: (q.score == null ? null : q.score), attempt: (q.attempt == null ? 1 : q.attempt),
          recorded_at: (typeof q.ts === 'number') ? new Date(q.ts).toISOString() : undefined,
        };
      }).filter(function (r) { return typeof r.item_id === 'string' && r.item_id; });
    }).catch(function () { return []; });
  } catch (_) { return Promise.resolve([]); }
}
// Re-derive the /grade-shaped payload from local rows. Returns null if the engine,
// the cached inputs, or any rows are missing (caller then falls back to the cache).
function _phase2ReDeriveGrade() {
  try {
    if (_phase2InputsKey() == null) return Promise.resolve(null); // view-as / signed-out
    if (!window.GradeEngine || typeof GradeEngine.computeGrade !== 'function') return Promise.resolve(null);
    var inputs = _phase2LoadInputs();
    if (!inputs || !inputs.redactedKey || !inputs.config) return Promise.resolve(null);
    var storeRows = (window.LedgerStore && typeof LedgerStore.all === 'function') ? LedgerStore.all() : Promise.resolve([]);
    return Promise.all([storeRows, _phase2QueueRows()]).then(function (parts) {
      var rows = (window.LedgerStore && typeof LedgerStore.mergeAll === 'function')
        ? LedgerStore.mergeAll(parts[0] || [], parts[1] || [])
        : (parts[0] || []).concat(parts[1] || []);
      if (!rows.length) return null;
      var opts = {
        lessonSchedule: inputs.schedule || null,
        // SY2627: PC/Poster dates keyed by NEW unit (server parity for the PC
        // track). Older cached inputs lack it → null → legacy old-unit proxy.
        eventSchedule: inputs.eventSchedule || null,
        section: inputs.section || null,
        worksheetBlankCounts: inputs.worksheetBlankCounts || null,
        // M2a presence/required: ship both so offline Due denom matches server
        // (core 67) while hasBlooket stays on all presence topics. Legacy
        // blooketLessons alone = presence; required falls to engine module default.
        blooketLessons: inputs.blooketLessons || inputs.blooketPresence || null,
        blooketPresence: inputs.blooketPresence || inputs.blooketLessons || null,
        blooketRequired: inputs.blooketRequired || null,
        // M2d: enrichment ids so offline lessons[].blooketBonus + gradebook
        // "(bonus)" titles match the server (My Gradebook / My Ledger).
        blooketBonusTopics: inputs.blooketBonusTopics || null,
        // TI-84 trainer map: keeps the offline-derived trainer surface
        // (lessons[].trainer, trainerDue/Done/Todo) identical to the server's.
        // Older cached inputs lack it → null → the strand is simply absent
        // (grade numbers unaffected at weight 0).
        trainerMap: inputs.trainerMap || null,
        // Per-day flashcard deck groups (FLASHCARD_DECK_SLICES_SPEC.md D3): the
        // server ships the computed list in /grade/offline-inputs so the offline
        // Blooket track slots match the server's. Older cached inputs lack it ->
        // null -> one score per worksheet group, the rule before per-day decks.
        perDayGroups: inputs.perDayGroups || null,
      };
      var g = GradeEngine.computeGrade(rows, inputs.redactedKey, inputs.config, opts);
      if (!g) return null;
      var gradebook = null;
      try {
        if (typeof GradeEngine.buildGradebook === 'function') {
          var todayStr = (GradeEngine.todayInTz)
            ? GradeEngine.todayInTz((inputs.config && inputs.config.schoolTz) || 'America/New_York')
            : undefined;
          gradebook = GradeEngine.buildGradebook(g, { lessonSchedule: opts.lessonSchedule, eventSchedule: opts.eventSchedule, section: opts.section, todayStr: todayStr });
          // Same CED titles as the server's /grade (roster-server/ced-titles.js).
          if (gradebook && typeof retitleGradebook === 'function') {
            retitleGradebook(gradebook, { schoologyTitlesCed: DESK_SCHOOLOGY_TITLES_CED });
          }
        }
      } catch (_) {}
      return {
        ok: true, asOf: new Date().toISOString(), config: inputs.config,
        units: g.units, quarters: g.quarters, completion: g.completion, lessons: g.lessons,
        gradebook: gradebook, _reDerived: true,
      };
    }).catch(function () { return null; });
  } catch (_) { return Promise.resolve(null); }
}

// PROGRESS_RESET_FIX_SPEC D2 — status banner for #donow-grade-status. Hidden
// on 'available'/'unknown' (and always in view-as, mirroring _gradeCacheKey).
// XSS-safe: built with createElement + textContent, never innerHTML of
// server-derived text.
function _renderGradeStatus() {
  try {
    var host = document.getElementById('donow-grade-status');
    if (!host) return;
    host.innerHTML = '';
    if (typeof _viewAsContext === 'function' && _viewAsContext()) { host.style.display = 'none'; return; }
    if (_gradeLoadState !== 'unavailable' || !_gradeLoadError) { host.style.display = 'none'; return; }
    var msg = document.createElement('span');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 's7btn';
    if (_gradeLoadError.kind === 'auth') {
      msg.textContent = 'Your sign-in needs a refresh — please sign in again. Your work is saved.';
      btn.textContent = 'Sign in';
      btn.onclick = function () {
        if (typeof openSignInModal === 'function') openSignInModal();
        else if (typeof openNameFinder === 'function') openNameFinder();
      };
    } else {
      msg.textContent = 'Grades are temporarily unavailable — your work is saved.';
      btn.textContent = 'Retry';
      btn.onclick = function () {
        // Incident review (LANE D) — D2 specifies Retry "re-calls
        // renderDoNowGrades" directly. Wiring this to renderDoNow() instead
        // left Retry unable to refresh grades on a split-brain outage
        // (/grade down, /donow healthy but never re-run): renderDoNow only
        // reaches renderDoNowGrades AFTER a successful /donow fetch.
        var _rtBase = window.ROSTER_SERVICE_URL || null;
        var _rtTok = null;
        try {
          if (window.rosterClient && typeof window.rosterClient.token === 'function') {
            _rtTok = window.rosterClient.token();
          }
        } catch (_) { _rtTok = null; }
        if (_rtBase && _rtTok && typeof renderDoNowGrades === 'function') {
          renderDoNowGrades(_rtBase, _rtTok).catch(function () { /* never throws */ });
        } else if (typeof renderDoNow === 'function') {
          renderDoNow(); // fallback: token/baseUrl unresolved — renderDoNow calls renderDoNowGrades itself
        }
      };
    }
    host.appendChild(msg);
    host.appendChild(btn);
    host.style.display = 'flex';
  } catch (_) { /* status banner is best-effort */ }
}

// PROGRESS_RESET_FIX_SPEC D2 — capped auto-retry (15s/30s/60s, <=3 per page
// load) on a server/network failure. Single-flighted via _gradeRetryTimer so
// concurrent renderDoNowGrades calls (boot + visibilitychange + the 60s
// repaint interval) never stack retries.
var GRADE_RETRY_BACKOFF_MS = [15000, 30000, 60000];
function _scheduleGradeRetry(baseUrl, token) {
  try {
    if (_gradeRetryTimer) return;                    // already pending — don't stack
    if (_gradeRetryCount >= GRADE_RETRY_BACKOFF_MS.length) return; // cap reached
    var delay = GRADE_RETRY_BACKOFF_MS[_gradeRetryCount];
    _gradeRetryCount++;
    _gradeRetryTimer = setTimeout(function () {
      _gradeRetryTimer = null;
      var currentToken = window.rosterClient && typeof window.rosterClient.token === 'function'
        ? window.rosterClient.token() : token;
      if (currentToken && typeof renderDoNowGrades === 'function') renderDoNowGrades(baseUrl, currentToken);
    }, delay);
  } catch (_) { /* retry scheduling is best-effort */ }
}

// The Do Now grade pill's rule, after "Q1 86" (EFFORT_VISIBILITY_V2_SPEC §3): which track the
// grade is and why. Returns pieces [{ track: bool, text }]; track pieces render as .qtrack spans.
// pcAvg null = the PC is not counting yet; pcDay = "Tue 10/13" when a PC is on file for later.
// Numbers whole; the 40% tests use the unrounded averages.
function _gradePillRule(pcAvg, workAvg, pcDay, pcOnFile) {
  var floor = 40;
  var hasPc = typeof pcAvg === 'number', hasWork = typeof workAvg === 'number';
  // Same display rule as the strategy sentence (EffortFacts.trackText): whole numbers, except a
  // value just under the gate that would round to 40 shows "39.9" — never "40 is under 40%".
  var whole = function (v) {
    if (typeof EffortFacts !== 'undefined' && EffortFacts && typeof EffortFacts.trackText === 'function') return EffortFacts.trackText(v, floor);
    return (v < floor && Math.round(v) >= floor) ? String(Math.floor(v * 10) / 10) : String(Math.round(v));
  };
  var pc = hasPc ? 'PC ' + whole(pcAvg) : '', work = hasWork ? 'Work ' + whole(workAvg) : '';
  var t = function (text) { return { track: false, text: text }; };
  var k = function (text) { return { track: true, text: text }; };
  if (!hasPc && !hasWork) return [];
  if (!hasPc) {
    // The PC track is always named (teacher 2026-09-27: "where's the PC track? should show —").
    if (pcDay) return [t('= '), k(work), t(' · '), k('PC \u2014'), t(' (counts from ' + pcDay + ')')];
    if (pcOnFile) return [t('= '), k(work), t(' · '), k('PC \u2014'), t(' (not counting yet)')];
    return [t('= '), k(work), t(' · '), k('PC \u2014'), t(' (none yet)')];
  }
  if (!hasWork) return [t('= '), k(pc)];
  var pcLow = pcAvg < floor, workLow = workAvg < floor;
  if (!pcLow && !workLow) return [t('= higher of '), k(work), t(' · '), k(pc)];
  if (pcLow && workLow) return [t('· '), k(work), t(' and '), k(pc), t(' are under ' + floor + '% → penalized until both reach ' + floor)];
  var low = workLow ? work : pc, other = workLow ? pc : work;
  return [t('· '), k(low), t(' is under ' + floor + '% → penalized until it reaches ' + floor + ' ('), k(other), t(')')];
}

// Mirrors of the server's weights (roster-server/lesson-grade.js V3_WORK_WEIGHTS and
// roster-server/gradebook-grid.js SCHOOLOGY_CATEGORY_WEIGHTS) — pinned equal by a test.
// The unit poster is a Work track again (POSTER_WORK_TRACK_SPEC.md, teacher 2026-10-20): scored
// 90-115, so the posters track may read above 100; Work is clamped at 100 after the blend.
var DESK_V3_WORK_WEIGHTS = { lessons: 0.30, quizzes: 0.30, posters: 0.30, blooket: 0.10 };
var DESK_SCHOOLOGY_WEIGHTS = { Lesson: 15, Quizzes: 15, Posters: 15, Blooket: 5, 'Progress Check': 50 };
// The grade, shown as the system it is (teacher 2026-09-27: "explain using a system of
// inequalities … and why Schoology is different from either Work or PC"). Pure: returns lines.
//   ctx: { grade, pcAvg, workAvg, pcDay, pcOnFile, workTracks, schoologyTotal, categoryAverages }
function _gradeMathLines(ctx) {
  var lines = [];
  var n = function (v) { return (typeof v === 'number') ? String(Math.round(v * 10) / 10) : '\u2014'; };
  var hasPc = typeof ctx.pcAvg === 'number', hasWork = typeof ctx.workAvg === 'number';
  lines.push('Work = ' + n(ctx.workAvg) + '   PC = ' + n(ctx.pcAvg) + (hasPc ? '' : ctx.pcDay ? '  (counts from ' + ctx.pcDay + ')' : ctx.pcOnFile ? '  (not counting yet)' : '  (none yet)'));
  // How the Work track is built.
  var wt = ctx.workTracks || null;
  if (wt && hasWork) {
    var parts = [], num = 0, den = 0;
    [['lessons', 'worksheets'], ['quizzes', 'quizzes'], ['posters', 'poster'], ['blooket', 'flashcards']].forEach(function (p) {
      var v = wt[p[0]];
      if (typeof v !== 'number') return;
      var w = DESK_V3_WORK_WEIGHTS[p[0]];
      parts.push(Math.round(w * 100) + '\u00b7' + n(v) + ' (' + p[1] + ')');
      num += w * v; den += w;
    });
    // A 115 poster can push the blend past 100; Work is clamped at 100, like the server.
    if (den > 0) lines.push('Work = [' + parts.join(' + ') + '] / ' + Math.round(den * 100) + ' = ' + n(Math.min(100, num / den)));
  }
  // The rule.
  lines.push('If Work \u2265 40 and PC \u2265 40:  Grade = max(Work, PC)');
  lines.push('Otherwise:  Grade = max(0.7\u00b7Work, 0.7\u00b7PC, (Work + PC) / 2)');
  // This student, plugged in.
  if (hasPc && hasWork) {
    var w = ctx.workAvg, p = ctx.pcAvg;
    if (w >= 40 && p >= 40) lines.push('Here: ' + n(w) + ' \u2265 40 and ' + n(p) + ' \u2265 40  \u2192  Grade = max(' + n(w) + ', ' + n(p) + ') = ' + n(Math.max(w, p)));
    else lines.push('Here: ' + (w < 40 ? 'Work ' + n(w) + ' < 40' : 'PC ' + n(p) + ' < 40') + '  \u2192  Grade = max(' + n(0.7 * w) + ', ' + n(0.7 * p) + ', ' + n((w + p) / 2) + ') = ' + n(Math.max(0.7 * w, 0.7 * p, (w + p) / 2)));
  } else if (hasWork) {
    lines.push('Here: PC is not counting yet, so Grade = Work = ' + n(ctx.workAvg));
  } else if (hasPc) {
    lines.push('Here: no Work yet, so Grade = PC = ' + n(ctx.pcAvg));
  }
  // Why Schoology differs.
  if (typeof ctx.schoologyTotal === 'number') {
    var ca = ctx.categoryAverages || {}, terms = [], den2 = 0;
    Object.keys(DESK_SCHOOLOGY_WEIGHTS).forEach(function (cat) {
      if (typeof ca[cat] !== 'number') return;
      terms.push(n(ca[cat]) + '\u00d7' + DESK_SCHOOLOGY_WEIGHTS[cat] + ' (' + cat + ')');
      den2 += DESK_SCHOOLOGY_WEIGHTS[cat];
    });
    var missing = Object.keys(DESK_SCHOOLOGY_WEIGHTS).filter(function (cat) { return typeof ca[cat] !== 'number'; });
    lines.push('Schoology today = ' + n(ctx.schoologyTotal) + (terms.length ? ' = [' + terms.join(' + ') + '] / ' + den2 : ''));
    // AHEAD_WORK_PROJECTION_SPEC: what Schoology will read once the ahead cells come due.
    if (ctx.aheadCells > 0 && typeof ctx.schoologyProjectedTotal === 'number') {
      var aheadN = ctx.aheadLessons > 0 ? ctx.aheadLessons : 0;
      var aheadWhat = aheadN === 1 ? 'your 1 ahead lesson comes' : aheadN > 1 ? 'your ' + aheadN + ' ahead lessons come' : 'your ahead work comes';
      lines.push('Once ' + aheadWhat + ' due: Schoology ≈ ' + n(ctx.schoologyProjectedTotal) + ' (the ahead cells join their categories).');
    }
    lines.push('Schoology is different because it averages only the columns already in Schoology, by category weight'
      + (missing.length ? ' (' + missing.join(', ') + (missing.length === 1 ? ' joins when its columns open' : ' join when their columns open') + ')' : '')
      + '; it leaves out work done ahead of the calendar and uses different weights from the Desk\u2019s Work track. The Desk number is the one that follows the rule above.');
  }
  return lines;
}
function _gradeMathToggle(host, ctx) {
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 's7btn qmath-toggle';
  btn.style.cssText = 'font-size:10px;padding:1px 6px;margin-left:8px;align-self:center';
  btn.textContent = 'show the math'; btn.setAttribute('aria-expanded', 'false');
  var panel = document.createElement('pre');
  panel.className = 'qmath geneva'; panel.hidden = true;
  panel.textContent = _gradeMathLines(ctx).join('\n');
  btn.onclick = function (event) {
    event.stopPropagation();
    panel.hidden = !panel.hidden;
    btn.textContent = panel.hidden ? 'show the math' : 'hide the math';
    btn.setAttribute('aria-expanded', String(!panel.hidden));
  };
  host.appendChild(btn); host.appendChild(panel);
}

// Last official grade fetched by the Do Now (My Ledger's balance card reads it too).
var _officialGradeCache = null;
// QUARTER_LINE_BY_DUE_DATE_SPEC §3.1: one official grade PER QUARTER, filled by the Do Now for
// every pill it shows (the closing / final quarter's pill has its own). A single slot would let
// the Quarter 1 fetch overwrite the Quarter 2 headline. _officialGradeCache stays the current
// pill's entry, the same object, for its older readers.
var _officialGradeByQuarter = {};

// The official grade published for quarter q, or null. Finding R6b (Codex re-review, finding 6):
// null for a quarter that has not started, even if one is cached (no grade before its start date).
function _officialGradeFor(q) {
  if (typeof _quarterStartsText === 'function' && _quarterStartsText(q)) return null;
  var current = (typeof _officialGradeCache !== 'undefined') ? _officialGradeCache : null;
  if (current && current.quarter === q) return current;
  var byQuarter = (typeof _officialGradeByQuarter !== 'undefined') ? _officialGradeByQuarter : null;
  return (byQuarter && byQuarter[q]) || null;
}

// A closed quarter's final grade: /grade quarters[q].closed.grade (the frozen grade, with the
// applied banked bonus when there is one), never below the official grade (the final written to
// Schoology is never lower). null when neither is known.
function _quarterFinalGrade(q, data, official) {
  var closed = data && data.closed;
  var frozen = (closed && typeof closed.grade === 'number') ? closed.grade : null;
  var sent = (official && typeof official.grade === 'number') ? official.grade : null;
  if (frozen == null) return sent;
  if (sent == null) return frozen;
  return Math.max(frozen, sent);
}

// The pill of the quarter that just ended, shown BEFORE the current quarter's pill (§3.1):
//   closing (its 0s fixable until the close): 'Quarter 1 · 92 · closes Tue Nov 10' (official when published)
//   final (a week after the close):          'Quarter 1 final · 92'
// data-quarter / data-role let Pico and the missing pill find each pill by role, not by position.
function _doNowSidePill(q, data, official, phase) {
  var cfg = _quarterConfig(q);
  var role = (phase && phase.closing === q) ? 'closing' : 'final';
  var pill = document.createElement('span');
  pill.className = 'qpill qpill-side';
  pill.dataset.quarter = q;
  pill.dataset.role = role;
  var keySpan = document.createElement('span');
  keySpan.className = 'qkey';
  var gradeSpan = document.createElement('span');
  gradeSpan.className = 'qgrade';
  pill.appendChild(keySpan);
  pill.appendChild(gradeSpan);
  if (role === 'final') {
    var finalGrade = _quarterFinalGrade(q, data, official);
    keySpan.textContent = _quarterName(q) + ' final';
    gradeSpan.textContent = finalGrade == null ? '—' : String(Math.round(finalGrade * 10) / 10);
    pill.title = _quarterName(q) + ' closed ' + _quarterDayText(cfg.close) + '. This is its final grade; it no longer changes.';
  } else {
    var engine = (data && typeof data.quarterGrade === 'number') ? data.quarterGrade : null;
    keySpan.textContent = _quarterName(q);
    if (official) gradeSpan.textContent = String(Math.round(official.grade * 10) / 10);
    else gradeSpan.textContent = engine == null ? '—' : String(Math.round(engine));
    var rule = document.createElement('span');
    rule.className = 'qrule';
    rule.textContent = (official ? 'official · ' : '') + 'closes ' + _quarterDayText(cfg.close);
    pill.appendChild(rule);
    pill.title = _quarterName(q) + ' ended ' + _quarterDayText(cfg.end) + '. Its 0s are fixable until '
      + _quarterDayText(cfg.close) + ', then this grade is final.'
      + (official && typeof _officialGradeTitle === 'function' ? ' ' + _officialGradeTitle(official) : '');
  }
  if (gradeSpan.textContent === '—') pill.classList.add('empty');
  pill.style.cursor = 'pointer';
  pill.setAttribute('role', 'button'); pill.tabIndex = 0;
  pill.onclick = function () { if (typeof openWallet === 'function') openWallet(); };
  pill.onkeydown = function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (typeof openWallet === 'function') openWallet(); } };
  return pill;
}

// The current pill's words while its quarter has no grade yet and has not started:
// 'starts Mon Nov 9' (teacher 2026-11-07: two pills from Sunday). '' otherwise.
function _quarterStartsText(q) {
  var start = _quarterConfig(q).start;
  var today = _zeroTodayIso();
  if (!start || !today || today >= start) return '';
  return 'starts ' + _quarterDayText(start);
}
// OFFICIAL_GRADE_SYNC_SPEC §4.4: the official quarter grade -- the number written into
// Schoology each night (teacher 2026-10-02: the Desk and Schoology must agree). Returns
// { quarter, grade, asOf, parts } or null (not published yet, offline, or server too old).
async function _fetchOfficialGrade(baseUrl, token, quarter) {
  try {
    var ctx = (typeof _viewAsContext === 'function') ? _viewAsContext() : null;
    var path = '/official-grade?quarter=' + encodeURIComponent(quarter);
    var headers = {};
    if (ctx) {
      // Teacher view-as: the teacher's token in the header, the student named in the query.
      path += '&studentId=' + encodeURIComponent(ctx.studentId);
      var teacherToken = (window.rosterClient && typeof window.rosterClient.token === 'function') ? window.rosterClient.token() : null;
      if (teacherToken) headers['Authorization'] = 'Bearer ' + teacherToken;
    } else if (token) {
      // The student's own token rides in the header, never the URL.
      headers['Authorization'] = 'Bearer ' + token;
    } else {
      return null;
    }
    var res = (typeof _roadmapFetch === 'function')
      ? await _roadmapFetch(baseUrl + path, { headers: headers }, ROADMAP_FETCH_TIMEOUT_MS)
      : await fetch(baseUrl + path, { headers: headers });
    if (!res || !res.ok) return null;
    var json = await res.json();
    if (!json || !json.ok || !json.official || typeof json.official.grade !== 'number') return null;
    return json.official;
  } catch (_) {
    return null;
  }
}

// Review D3 (2026-11-08): the ended quarter's official grade only changes nightly, so the Do Now
// asks for it once per school day and every later render reuses it (the current quarter's is still
// asked for on every render). Keyed by who asks (the token, or the student a teacher views as), the
// quarter and the day. A request in flight is shared; a missing official (not published yet, or a
// failed request) is dropped from the cache, so the next render asks again.
var _sideOfficialByDay = {};
function _fetchSideOfficialGrade(baseUrl, token, quarter) {
  var ctx = (typeof _viewAsContext === 'function') ? _viewAsContext() : null;
  var who = ctx ? 'as:' + ctx.studentId : 'me:' + token;
  var key = who + '|' + quarter + '|' + _zeroTodayIso();
  if (_sideOfficialByDay[key]) return _sideOfficialByDay[key];
  _sideOfficialByDay[key] = _fetchOfficialGrade(baseUrl, token, quarter).then(function (official) {
    if (!official) delete _sideOfficialByDay[key];
    return official;
  });
  return _sideOfficialByDay[key];
}

// One line explaining where the official number comes from (pill tooltip).
function _officialGradeTitle(official) {
  var p = official.parts || {};
  var n = function (v) { return (typeof v === 'number') ? String(Math.round(v * 10) / 10) : '—'; };
  var day = '';
  try { day = new Date(official.asOf).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' }); } catch (_) { day = ''; }
  // Review D4 (2026-11-08): 'Official Quarter 1 grade', never "Q1" (Q1 / Q3 are quartiles elsewhere).
  var quarterWords = (typeof _quarterName === 'function') ? _quarterName(official.quarter) : official.quarter;
  var text = 'Official ' + quarterWords + ' grade' + (day ? ' as of ' + day : '') + ' — the same number Schoology shows. '
    + 'Work ' + n(p.work) + ' (from Schoology)';
  if (typeof p.pc === 'number') {
    text += (p.rule === 'PC')
      ? '; your Progress Check ' + n(p.pc) + ' is higher, and it counts because Work + bonuses reached 40'
      : (p.rule === 'work (under 40)' ? '; your Progress Check ' + n(p.pc) + ' counts once Work + bonuses reach 40' : '; Progress Check ' + n(p.pc));
  }
  if (p.earlyBonus) text += '; + ' + n(p.earlyBonus) + ' early-finish bonus';
  return text + '. Updated every night after the Schoology sync.';
}

async function renderDoNowGrades(baseUrl, token) {
  // Each render owns its continuation. A newer render, sign-in or view-as change
  // must not let an older response write into the current student's caches.
  function requestOwner() {
    var roster = window.rosterClient;
    var viewed = (typeof _viewAsContext === 'function') ? _viewAsContext() : null;
    return JSON.stringify([
      roster && typeof roster.studentId === 'function' ? roster.studentId() : null,
      roster && typeof roster.token === 'function' ? roster.token() : null,
      viewed ? viewed.studentId : null,
      window.__VIEW_AS_STUDENT_ID__ || null,
      window.ROSTER_SERVICE_URL || null
    ]);
  }
  var owner = requestOwner();
  var roster = window.rosterClient;
  if (roster && typeof roster.token === 'function' && token !== roster.token()
      && !(typeof _viewAsContext === 'function' && _viewAsContext())) return;
  var request = {};
  renderDoNowGrades._request = request;
  function requestIsCurrent() {
    return renderDoNowGrades._request === request && requestOwner() === owner;
  }
  var host = document.getElementById('donow-grades');
  if (!host) return;
  host.style.display = 'none';
  host.innerHTML = '';
  // The "Why so low?" coach lives in its own host; clear it on every entry so a
  // stale breakdown never lingers when signed-out / offline — UNLESS a coach
  // conversation is currently open, in which case we preserve it across the
  // /grade refresh (the instant facts are deterministic; don't wipe a chat in
  // progress). renderWhySoLow below likewise bails when a panel is open.
  var _wslHost = document.getElementById('donow-helper');
  if (_wslHost && !_coachPanelOpen()) _wslHost.innerHTML = '';
  if (typeof _clearDoNowBonus === 'function') _clearDoNowBonus();
  // QUARTER_LINE_BY_DUE_DATE_SPEC §3.9: the quarter notice is re-decided on every render.
  var _qNotice = document.getElementById('donow-notice');
  if (_qNotice) { _qNotice.style.display = 'none'; _qNotice.textContent = ''; }
  _gradeQuartersCache = null;
  _gradeUnitsCache = null;
  if (typeof updateWalletReadinessIcon === 'function') updateWalletReadinessIcon();
  // PROGRESS_RESET_FIX_SPEC D1 — tri-state entry. _priorState feeds D7's
  // unavailable->available reconcile check below.
  var _priorState = _gradeLastRenderedState;
  _gradeLoadState = 'loading';
  _gradeLoadError = null;
  if (typeof _renderGradeStatus === 'function') _renderGradeStatus();
  try {
    // P2 view-as rewrite: in view-as mode, swap to /teacher/student/:id/grade
    // with the teacher's token in the Authorization header. _maybeViewAsFetch
    // is identity-transform when view-as is inactive (student token in URL).
    // typeof-guarded so the existing vm-based tests don't need to inject the
    // helper to keep passing (s111 carry-forward: cross-sprint calls guarded).
    var __va = (typeof _maybeViewAsFetch === 'function')
      ? _maybeViewAsFetch('/grade?token=' + encodeURIComponent(token), {})
      : { endpoint: '/grade?token=' + encodeURIComponent(token), headers: {} };
    // PROGRESS_RESET_FIX_SPEC D1/D2 — classify EVERY failure kind (not just a
    // thrown/unreachable fetch): 401/403 -> auth; other non-ok / {ok:false} /
    // malformed JSON -> server; throw/timeout/null-res -> network. 'available'
    // ONLY on a live res.ok && json.ok payload.
    var data = null;
    try {
      var res = (typeof _roadmapFetch === 'function')
        ? await _roadmapFetch(baseUrl + __va.endpoint, { headers: __va.headers }, ROADMAP_FETCH_TIMEOUT_MS)
        : await fetch(baseUrl + __va.endpoint, { headers: __va.headers });
      if (!requestIsCurrent()) return;
      if (!res) {
        _gradeLoadState = 'unavailable'; _gradeLoadError = { kind: 'network', status: null };
      } else if (res.ok) {
        var _j = null;
        try { _j = await res.json(); } catch (_) { _j = null; } // malformed JSON -> server, not network
        if (!requestIsCurrent()) return;
        if (_j && _j.ok) { data = _j; _gradeLoadState = 'available'; }
        else { _gradeLoadState = 'unavailable'; _gradeLoadError = { kind: 'server', status: res.status }; }
      } else if (res.status === 401 || res.status === 403) {
        _gradeLoadState = 'unavailable'; _gradeLoadError = { kind: 'auth', status: res.status };
      } else {
        _gradeLoadState = 'unavailable'; _gradeLoadError = { kind: 'server', status: res.status };
      }
    } catch (_) {
      if (!requestIsCurrent()) return;
      _gradeLoadState = 'unavailable'; _gradeLoadError = { kind: 'network', status: null };
    }
    // Only a live rejection of the still-current token warrants asking for sign-in.
    // Unknown/offline state and teacher view-as must never become a sign-out.
    if (_gradeLoadError && _gradeLoadError.kind === 'auth' && !_expiredSignInShown
        && !window.__VIEW_AS_STUDENT_ID__
        && !(typeof _viewAsContext === 'function' && _viewAsContext())
        && window.rosterClient && typeof window.rosterClient.token === 'function'
        && token && window.rosterClient.token() === token) {
      _expiredSignInShown = true;
      var signinOverlay = document.getElementById('signin-overlay');
      if (!signinOverlay || signinOverlay.style.display !== 'block') openSignInModal();
      var signinNotice = document.getElementById('signin-error');
      if (signinNotice) signinNotice.textContent = EXPIRED_SIGNIN_NOTICE;
    }
    if (data) {
      _persistGradeCache(data);                 // write-through (skipped in view-as, now v2-enveloped)
      _phase2RefreshOnline(baseUrl, token);     // ANDROID Phase 2: refresh local signed-ledger replica + offline-inputs (fire-and-forget)
      // D3: live-success-only durable latch — never latched from restored/derived data.
      if (typeof _latchServerComplete === 'function') _latchServerComplete(data.lessons);
      _gradeLoadError = null;
      _gradeRetryCount = 0;
      if (_gradeRetryTimer) { clearTimeout(_gradeRetryTimer); _gradeRetryTimer = null; }
    } else if (_gradeLoadState === 'unavailable') {
      // D2: ALL failure kinds now run the evidence-restore branch (previously
      // only a thrown/unreachable fetch did). ANDROID Phase 2: re-derive from
      // the local signed ledger (verified, fresh, includes just-finished
      // offline work); fall back to the last cached /grade blob otherwise.
      // The restored payload warms the cache + paints, but load state STAYS
      // 'unavailable' — it is not a live confirmation.
      data = await _phase2ReDeriveGrade();
      if (!requestIsCurrent()) return;
      data = data || _loadGradeCache();
      if (typeof _scheduleGradeRetry === 'function') _scheduleGradeRetry(baseUrl, token);
    }
    if (typeof _renderGradeStatus === 'function') _renderGradeStatus();
    if (!data) {
      // D5: paint the honest-unknown label instead of leaving "0 of N" stale.
      if (typeof rProg === 'function') rProg();
      _gradeLastRenderedState = _gradeLoadState;
      return;
    }
    // Cache lessons[] for the per-day click-through (Phase 6).
    // Capture the cold→warm transition BEFORE reassigning: the FIRST successful warm
    // must force a calendar window re-size (see the rCal escalation below).
    var _gradeCacheWasCold = (_gradeLessonsCache === null);
    // QUARTER_LINE_BY_DUE_DATE_SPEC §3: the quarter dates (close / finalUntil included) travel
    // with the lessons, so every repaint below already sees the same quarter line.
    if (typeof _gradeConfigCache !== 'undefined') _gradeConfigCache = (data.config && typeof data.config === 'object') ? data.config : null;
    // D8: the close snapshots travel with the dates (one moment for every surface).
    if (typeof _gradeClosedCache !== 'undefined' && typeof _gradeClosedQuarters === 'function') _gradeClosedCache = _gradeClosedQuarters(data.quarters);
    _gradeLessonsCache = Array.isArray(data.lessons) ? data.lessons : null;
    // Auto-refresh an open resource panel so the quiz Done gate (which reads
    // _quizPerfFor → this cache) reflects a freshly-recorded quiz score without
    // a manual reopen. Guarded + fire-and-forget; showResourcePanel never
    // re-enters this fetch, so there's no loop.
    // BUG FIX (2026-06-03): only refresh a panel that is CURRENTLY OPEN. This
    // fetch runs on every visibilitychange (renderDoNow); without the visibility
    // guard it RESURRECTED a closed panel, so a modal popped open for the last
    // lesson every time the student alt-tabbed back to the Desk.
    try {
      var _rov = document.getElementById('resource-overlay');
      var _panelOpen = _rov && _rov.style && _rov.style.display !== 'none' && _rov.style.display !== '';
      if (_panelOpen && _lastResourcePanel && typeof showResourcePanel === 'function') {
        showResourcePanel(_lastResourcePanel.inf, _lastResourcePanel.dateStr);
      }
    } catch (_) { /* panel refresh is best-effort */ }
    // CROSS-DEVICE grey-out (2026-06-03): the calendar's local-done greyscale +
    // next-up cell now derive "done" from these freshly-loaded synced scores
    // (_isLessonComplete → _getCwsForTopic / _blooketScoreFor). Repaint so a
    // lesson finished on another device greys + unlocks here once its /grade
    // lands — flicker-free greying, escalating to a single rCal only when a
    // lesson's lock state actually flips (never on a plain poll). typeof-guarded
    // so the existing vm-test of renderDoNowGrades doesn't need the painter.
    // FIRST WARM (2026-06-17 fix): the initial rCal sized the calendar window from a
    // COLD /grade cache, so next-up resolved to an early / already-done lesson and the
    // dynamic window anchored + sized there — cropping the TRUE next lesson out of view
    // (it only self-corrected after the user paged the calendar, which re-ran rCal with
    // warm marks). Force ONE full rCal on the cold→warm transition so the window re-sizes
    // to REACH the real next-up. paintLocalDoneCells's lock-flip rCal escalation CANNOT
    // cover this: it scans only RENDERED cells, and the corrected next-up cell is exactly
    // the one cropped out of the DOM. Subsequent polls keep the flicker-free painter path
    // (fires once per cold→warm transition; a single extra rCal is indistinguishable from
    // the 60s-interval rCal, so a rare lessons-less /grade re-arm is harmless).
    // D7 (PROGRESS_RESET_FIX_SPEC): a late success FOLLOWING a prior failure
    // must reconcile locks + greying in one pass even when the cache was
    // already warm from an earlier evidence-restore (so _gradeCacheWasCold
    // alone would miss it). Gated on the actual unavailable->available
    // transition so a steady 'available' poll never thrashes rCal.
    var _lateRecovery = (_priorState === 'unavailable' && _gradeLoadState === 'available');
    if ((_gradeCacheWasCold || _lateRecovery) && _gradeLessonsCache && typeof rCal === 'function') {
      try { rCal(); } catch (_) {}
    } else if (typeof paintLocalDoneCells === 'function') {
      paintLocalDoneCells();
    }
    // An open ledger must also follow ordinary grade refreshes.
    try { if (typeof _walletRefreshZeroCard === 'function') _walletRefreshZeroCard(); } catch (_) {}
    // #13: the Unit-Progress done-fill + pace label read the same synced scores —
    // recompute now that the /grade cache is warm (first rCal ran before this).
    if (typeof rProg === 'function') rProg();
    _gradeLastRenderedState = _gradeLoadState;
    var quarters = data.quarters || {};
    _gradeQuartersCache = quarters; // cache for the "Why so low?" coach
    _gradeGradebookCache = data.gradebook || null; // cache for My Ledger's "Score breakdown"
    _gradeUnitsCache = (data.units && typeof data.units === 'object') ? data.units : null; // a PC on file (EFFORT_VISIBILITY_SPEC §3)
    var order = ['Q1', 'Q2', 'Q3', 'Q4'];
    // Show the current quarter (the relevant one). Current = the quarter
    // containing today (quarterOfDate); if today is outside all bands (e.g. summer
    // / before the year starts), fall back to the first quarter that has a grade,
    // else Q1.
    var curN = (typeof quarterOfDate === 'function') ? quarterOfDate((typeof tdy === 'function') ? tdy() : new Date()) : null;
    var curQ = curN ? ('Q' + curN) : null;
    // QUARTER_LINE_BY_DUE_DATE_SPEC §3.1: while a quarter is closing or final, the next quarter is
    // the current one, gap days included, and the ended quarter gets its own pill FIRST (sideQ).
    // No close dates in this payload (an older cache): phase is null and this is today's one pill.
    var phase = (typeof _deskQuarterPhase === 'function') ? _deskQuarterPhase() : null;
    if (phase && phase.current && quarters[phase.current]) curQ = phase.current;
    if (!curQ || !quarters[curQ]) {
      curQ = order.filter(function (k) {
        return quarters[k] && typeof quarters[k].quarterGrade === 'number';
      })[0] || 'Q1';
    }
    var sideQ = phase ? (phase.closing || phase.final) : null;
    if (sideQ === curQ || !quarters[sideQ]) sideQ = null;
    var q = quarters[curQ] || null;
    var gradeRaw = q && typeof q.quarterGrade === 'number' ? q.quarterGrade : null;
    var pcAvg    = q && typeof q.pcAvg === 'number' ? q.pcAvg : null;
    var workAvg  = q && typeof q.workAvg === 'number' ? q.workAvg : null;
    var lDue     = q && typeof q.lessonsDue === 'number' ? q.lessonsDue : null;
    var lGraded  = q && typeof q.lessonsGraded === 'number' ? q.lessonsGraded : null;
    var lTotal   = q && typeof q.lessonsTotal === 'number' ? q.lessonsTotal : null;

    // Current-quarter grade pill: "Q1 94 = higher of Work 61 · PC 94" — the grade, the two
    // tracks and the 40% rule in one line (EFFORT_VISIBILITY_V2_SPEC §3; the ↑ceiling is gone,
    // the coach still has it). Shown to whoever is signed in (a student, or the student a teacher
    // is viewing as); a teacher's own /grade has no graded quarter, so it stays "Q1 —".
    // The official grade (OFFICIAL_GRADE_SYNC_SPEC §4.4), when one has been published, is the
    // headline number; the engine's live grade becomes "Today's estimate" beside it.
    // D3: both quarters at once; the ended quarter's official comes from its per-day cache.
    var officials = await Promise.all([
      (typeof _fetchOfficialGrade === 'function') ? _fetchOfficialGrade(baseUrl, token, curQ) : null,
      (sideQ && typeof _fetchSideOfficialGrade === 'function') ? _fetchSideOfficialGrade(baseUrl, token, sideQ) : null,
    ]);
    if (!requestIsCurrent()) return;
    var official = officials[0];
    // Finding R6b (Codex re-review, finding 6): a quarter that has not started has no grade yet (the
    // engine reports none before its start date), so its pill reads "starts Mon Nov 9" with no number,
    // even when an official grade for it was published (a nightly pass can run on the Sunday before
    // the quarter starts). It is not cached either, so the balance card, My Ledger and Pico never
    // show it. Once the quarter has started, the official grade leads exactly as before.
    var startsText = (sideQ && typeof _quarterStartsText === 'function') ? _quarterStartsText(curQ) : '';
    if (startsText) official = null;
    if (typeof _officialGradeCache !== 'undefined') _officialGradeCache = official;
    // §3.1: the ended quarter's official grade has its own slot (a per-quarter cache).
    var sideOfficial = officials[1];
    if (typeof _officialGradeByQuarter !== 'undefined') {
      _officialGradeByQuarter = {};
      _officialGradeByQuarter[curQ] = official;
      if (sideQ) _officialGradeByQuarter[sideQ] = sideOfficial;
    }
    var pill = document.createElement('span');
    pill.className = 'qpill' + (gradeRaw == null && !official ? ' empty' : '');
    pill.dataset.quarter = curQ;
    pill.dataset.role = 'current';
    var keySpan = document.createElement('span');
    keySpan.className = 'qkey';
    // Two pills say "Quarter 1" / "Quarter 2" (Q1 / Q3 are quartiles elsewhere); one pill keeps "Q1".
    keySpan.textContent = sideQ ? 'Quarter ' + curQ.slice(1) : curQ;
    pill.appendChild(keySpan);
    var gradeSpan = document.createElement('span');
    gradeSpan.className = 'qgrade';
    if (official) gradeSpan.textContent = String(Math.round(official.grade * 10) / 10);
    else gradeSpan.textContent = gradeRaw == null ? '—' : String(Math.round(gradeRaw));
    pill.appendChild(gradeSpan);
    if (official) {
      var officialRule = document.createElement('span');
      officialRule.className = 'qrule';
      officialRule.textContent = 'official (same as Schoology)';
      pill.appendChild(officialRule);
    } else if (gradeRaw != null) {
      var pcOnFile = null;
      try { pcOnFile = (typeof _effortFacts === 'function') ? _effortFacts(curQ).pc : null; } catch (_) { pcOnFile = null; }
      var pcDay = (pcOnFile && !pcOnFile.counting && pcOnFile.day) ? pcOnFile.day : null;
      var pieces = _gradePillRule(pcAvg, workAvg, pcDay, Boolean(pcOnFile));
      if (pieces.length) {
        // One inline span, so the pill's flex gap never splits "(PC 94)".
        var rule = document.createElement('span');
        rule.className = 'qrule';
        pieces.forEach(function (piece) {
          if (!piece.track) { rule.appendChild(document.createTextNode(piece.text)); return; }
          var trackSpan = document.createElement('span');
          trackSpan.className = 'qtrack';
          trackSpan.textContent = piece.text;
          rule.appendChild(trackSpan);
        });
        pill.appendChild(rule);
      }
    } else if (startsText) {
      // §3.1 (teacher 2026-11-07): from Sunday the new quarter's pill reads "starts Mon Nov 9"
      // until it has a grade (Finding R6b: an official grade published early never replaces it).
      var startsRule = document.createElement('span');
      startsRule.className = 'qrule';
      startsRule.textContent = startsText;
      pill.appendChild(startsRule);
    }
    // Review D4: tooltips say "Quarter 2"; only the single pill's own label stays "Q2" (j1 pins it).
    var curQWords = (typeof _quarterName === 'function') ? _quarterName(curQ) : curQ;
    var tip = curQWords + ' covers ' + (QUARTER_BAND_LABEL[curQ] || '');
    if (lGraded != null && lTotal != null) {
      tip += ' — ' + lGraded + ' of ' + lTotal + ' lesson' + (lTotal === 1 ? '' : 's') + ' graded';
      if (lDue != null) tip += ' (' + lDue + ' due so far)';
    }
    pill.title = official
      ? _officialGradeTitle(official) + ' Tap to see where you stand in the class.'
      : tip + '. Once both tracks are at least 40%, your grade is the higher one. Tap to see where you stand in the class.';
    // Finding R6b: the pill of a quarter that has not started shows no number; its tooltip names the start.
    if (startsText && gradeRaw == null) pill.title = curQWords + ' ' + startsText + '. It has no grade until then. ' + pill.title;
    pill.style.cursor = 'pointer';
    pill.setAttribute('role', 'button'); pill.tabIndex = 0;
    pill.onclick = function () { if (typeof openWallet === 'function') openWallet(); };
    pill.onkeydown = function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (typeof openWallet === 'function') openWallet(); } };
    // §3.1: the ended quarter's pill (closing / final) comes first, then the current one.
    if (sideQ && typeof _doNowSidePill === 'function') host.appendChild(_doNowSidePill(sideQ, quarters[sideQ], sideOfficial, phase));
    host.appendChild(pill);
    if (typeof _updateDoNowMissingPill === 'function') _updateDoNowMissingPill();
    // §3.9: the one-time notice for work that just became Quarter 2 work with a 0 date now.
    if (typeof _renderQuarterNotice === 'function') _renderQuarterNotice();
    // BONUS_DONOW_SPEC: the banked-bonus sentence under the pill (fire-and-forget; own fetch).
    if (typeof renderDoNowBonus === 'function') renderDoNowBonus();

    // A small labelled chip beside the pill. The two v3 tracks (PC, Work) now live INSIDE the
    // pill with the 40% rule (EFFORT_VISIBILITY_V2_SPEC §3), so only "Schoology today" uses it.
    function _trackChip(label, val, title) {
      var chip = document.createElement('span');
      chip.className = 'qtrack';
      chip.style.cssText = 'font-size:10px;margin-left:8px;align-self:center';
      var pct = (typeof val === 'number') ? (Math.round(val * 10) / 10).toFixed(1) + '%' : '—';
      var k = document.createElement('span'); k.style.color = '#888'; k.textContent = label + ' ';
      var v = document.createElement('span'); v.style.cssText = 'color:#333;font-weight:bold'; v.textContent = pct;
      chip.appendChild(k); chip.appendChild(v);
      chip.title = title;
      return chip;
    }
    // SY2627 (teacher 2026-09-03): "Schoology today" — the category-weighted
    // total over columns that are DUE and COMPLETED (blanks ignored, ahead work
    // not counted): exactly what the Schoology gradebook shows once the sync ran.
    var _gbq = data.gradebook && data.gradebook.quarters && data.gradebook.quarters[curQ];
    var schToday = _gbq && typeof _gbq.schoologyTotal === 'number' ? _gbq.schoologyTotal : null;
    var _chipFacts = null;
    try { _chipFacts = (typeof _effortFacts === 'function') ? _effortFacts(curQ) : null; } catch (_) { _chipFacts = null; }
    var _aheadCount = (_chipFacts && _chipFacts.ahead) ? _chipFacts.ahead.length : 0;
    // With an official grade published, the chip is the live estimate (teacher 2026-10-02: "a
    // today's estimate that moves as students work"); the Schoology number is the pill itself.
    if (official) host.appendChild(_trackChip("Today's estimate", gradeRaw,
      'Moves as you work today. Tonight, after the Schoology sync, your official grade is recalculated from Schoology.'));
    // AHEAD_WORK_PROJECTION_SPEC: the chip text stays "Schoology today"; the title adds the projection.
    else host.appendChild(_trackChip('Schoology today', schToday,
      'What the Schoology gradebook shows for ' + curQWords + ' as of today: only work that is due AND completed. ' +
      'Blanks are not zeros and work done ahead of schedule is not counted until it comes due.' +
      ((typeof _effortAheadProjectionSentence === 'function') ? _effortAheadProjectionSentence(curQ, _aheadCount) : '')));
    if (gradeRaw != null) {
      var _mathPc = _chipFacts ? _chipFacts.pc : null;
      _gradeMathToggle(host, {
        grade: gradeRaw, pcAvg: pcAvg, workAvg: workAvg,
        pcDay: (_mathPc && !_mathPc.counting && _mathPc.day) ? _mathPc.day : null, pcOnFile: Boolean(_mathPc),
        workTracks: (q && q.workTracks) || null,
        schoologyTotal: schToday, categoryAverages: (_gbq && _gbq.categoryAverages) || null,
        schoologyProjectedTotal: (_gbq && typeof _gbq.schoologyProjectedTotal === 'number') ? _gbq.schoologyProjectedTotal : null,
        aheadCells: (_gbq && typeof _gbq.aheadCells === 'number') ? _gbq.aheadCells : 0,
        aheadLessons: _aheadCount,
      });
    }

    // Early-completion bonus: +1 point per lesson finished by 11:59 PM on its due
    // day (capped per quarter). Ahead-of-schedule lessons earn theirs once due.
    var earlyN = q && typeof q.earlyLessons === 'number' ? q.earlyLessons : 0;
    var aheadN = q && typeof q.aheadLessons === 'number' ? q.aheadLessons : 0;
    var earlyPts = q && typeof q.earlyBonus === 'number' ? q.earlyBonus : 0;
    if (earlyN > 0 || aheadN > 0) {
      var eChip = document.createElement('span');
      eChip.className = 'qtrack qearly';
      eChip.style.cssText = 'font-size:10px;margin-left:8px;align-self:center;color:#1a7f37;font-weight:bold';
      eChip.textContent = '⚡ +' + earlyPts + ' early' + (aheadN > 0 ? ' · ' + aheadN + ' ahead' : '');
      eChip.title = 'Early bonus: a point on the quarter grade for each worksheet finished (at least 80% of its blanks) by 11:59 PM on its due day (' +
        earlyN + ' so far, +' + earlyPts + '). ' + (aheadN > 0 ? aheadN + ' lesson' + (aheadN === 1 ? '' : 's') + ' done ahead of schedule will earn theirs when they come due.' : '');
      host.appendChild(eChip);
    }

    if (typeof _fcFlag === 'function' && _fcFlag('dueTodayDeck')) {
      var _dueTodaySummary = (typeof _srsDueSnapshot === 'function')
        ? _srsDueSnapshot()
        : { due: 0 };
      if (typeof _srsRenderDueChip === 'function') {
        _srsRenderDueChip(host, _dueTodaySummary);
      }
    }

    // "how grades work" moved to the Help menu (top bar) — declutter the Do Now.

    // "My Gradebook" (the score-by-score breakdown · vs Schoology) folded into the
    // My Ledger window's collapsible "Score breakdown" section — reachable by
    // tapping the Do Now card. No chip here.

    // The "My Ledger" chip is gone — the whole Do Now card is now clickable and
    // opens My Ledger (_paintDoNowReadiness wires it), the reliable path on every
    // device (the desktop 👛 icon hides on ≤700px screens). The "Class Gradebook"
    // chip is gone too (the teacher's class grid is the Dashboard).

    host.style.display = 'flex';

    // "Why so low?" grade coach — render alongside the strip (q is in scope).
    // typeof-guarded so the existing renderDoNowGrades tests don't need it.
    // §3.7: while the new quarter has no grade yet, the coach explains the closing quarter.
    if (typeof renderWhySoLow === 'function') {
      if (gradeRaw == null && sideQ && phase && phase.closing === sideQ) renderWhySoLow(sideQ, quarters[sideQ]);
      else renderWhySoLow(curQ, q);
    }
    if (typeof updateWalletReadinessIcon === 'function') updateWalletReadinessIcon();
    if (typeof _paintDoNowReadiness === 'function') _paintDoNowReadiness();
  } catch (_) {
    if (!requestIsCurrent()) return;
    host.style.display = 'none';
    var _wh = document.getElementById('donow-helper');
    if (_wh && !_coachPanelOpen()) _wh.innerHTML = '';
  }
}

// True when the coach panel is currently expanded — used to preserve an open
// conversation (transcript + in-flight request) across a renderDoNowGrades
// re-render (Done click / tab refocus), instead of wiping it.
function _coachPanelOpen() {
  var host = document.getElementById('donow-helper');
  if (!host) return false;
  var p = host.querySelector('.wsl-panel');
  return !!(p && p.style.display !== 'none');
}

// ═══ "Why so low?" grade coach (2026-06-01) ═══════════════════════════════
// Hybrid: an INSTANT deterministic breakdown (computed from the cached /grade +
// /donow data — accurate, free, works even if the AI is down) PLUS an OPTIONAL
// grounded AI follow-up mini-chat. The v3 engine is deterministic, so the facts
// are knowable client-side with no hallucination risk; the AI only phrases +
// prioritizes the handed facts. Called at the end of renderDoNowGrades, where
// the current-quarter object is in scope. Never throws.
function renderWhySoLow(curQ, q) {
  var host = document.getElementById('donow-helper');
  if (!host) return;
  // Preserve an open conversation across re-renders — don't wipe a chat in
  // progress (instant facts are deterministic and need no mid-chat refresh).
  if (_coachPanelOpen()) return;
  host.innerHTML = '';
  try {
    var grade = (q && typeof q.quarterGrade === 'number') ? q.quarterGrade : null;
    if (grade == null) return; // nothing to explain yet
    var ctx = _buildCoachContext(curQ, q);

    // Adaptive label: "Why so low?" only when the grade actually is low; a
    // healthy grade gets a neutral "Grade breakdown" so it never reads as a put-down.
    var low = grade < 80;
    var btn = document.createElement('button');
    btn.className = 'wsl-btn';
    btn.type = 'button';
    btn.textContent = low ? '🤔 Why so low? · what to do' : '📊 Grade breakdown · what to do';
    btn.title = 'See exactly what is affecting your grade and what to do next.';
    host.appendChild(btn);

    var panel = document.createElement('div');
    panel.className = 'wsl-panel';
    panel.style.display = 'none';
    host.appendChild(panel);

    var built = false;
    btn.onclick = function () {
      var openNow = panel.style.display !== 'none';
      if (openNow) { panel.style.display = 'none'; return; }
      if (!built) { _renderCoachPanel(panel, ctx); built = true; }
      panel.style.display = 'block';
    };
  } catch (_) { /* coach is best-effort */ }
}

// Assemble the deterministic breakdown the coach is grounded in. Reads the
// cached current-quarter object + the lessons cache + the latest /donow task.
function _buildCoachContext(curQ, q) {
  var ctx = {
    quarter: curQ || null,
    grade: (q && typeof q.quarterGrade === 'number') ? q.quarterGrade : null,
    ceiling: (q && typeof q.ceiling === 'number') ? q.ceiling : null,
    pcAvg: (q && typeof q.pcAvg === 'number') ? q.pcAvg : null,
    // pcDue=false => Progress Checks aren't open yet (~fall): a null pcAvg is NOT a
    // deficit, so the coach must not tell the student to "do PCs". Defaults false so a
    // missing field never invents PC work.
    pcDue: !!(q && q.pcDue === true),
    workAvg: (q && typeof q.workAvg === 'number') ? q.workAvg : null,
    // Work sub-track breakdown {lessons,quizzes,blooket} so the coach can
    // explain what's INSIDE the Work track (esp. Blooket, otherwise invisible).
    workTracks: (q && q.workTracks && typeof q.workTracks === 'object') ? q.workTracks : null,
    lessonsGraded: (q && typeof q.lessonsGraded === 'number') ? q.lessonsGraded : null,
    lessonsDue: (q && typeof q.lessonsDue === 'number') ? q.lessonsDue : null,
    lessonsTotal: (q && typeof q.lessonsTotal === 'number') ? q.lessonsTotal : null,
    nextTask: null,
    // Blooket make-up summary {track,due,done,todo[]} — set below when any Blooket
    // is due. todo = Blooket-bearing due lessons with no score (flashcard make-ups).
    blooket: null,
    // Lessons that are worksheet-done but NOT complete because their flashcards
    // (Blooket) are still < 80 — the real completion/unlock gate. Populated below from
    // the same per-lesson scores the calendar/Done button use.
    flashcardGate: [],
    weakLessons: []
  };
  try {
    if (q && typeof q.blooketDue === 'number' && q.blooketDue > 0) {
      ctx.blooket = {
        track: (q.workTracks && typeof q.workTracks.blooket === 'number') ? q.workTracks.blooket : null,
        due: q.blooketDue,
        done: (typeof q.blooketDone === 'number') ? q.blooketDone : 0,
        todo: Array.isArray(q.blooketTodo) ? q.blooketTodo.slice(0, 6) : []
      };
    }
  } catch (_) { /* blooket summary optional */ }
  try {
    // Flashcard completion gate: lessons whose worksheet is done (Cws >= 60) but whose
    // flashcards (Blooket) are still < 80 — exactly what _isLessonComplete requires to
    // mark a lesson done + unlock the next. This is the gate the teacher cares about and
    // is otherwise invisible to the coach. (Doing the flashcards completes/unlocks the
    // lesson; it does NOT change the grade — Blooket isn't a grade component yet.)
    if (Array.isArray(_gradeLessonsCache)) {
      // Review D2 (2026-11-08): only the lessons of the quarter being explained (_coachLessonFilter).
      var _fgIn = (typeof _coachLessonFilter === 'function') ? _coachLessonFilter(curQ) : null;
      var _fg = [];
      for (var _fi = 0; _fi < _gradeLessonsCache.length; _fi++) {
        var _fl = _gradeLessonsCache[_fi];
        if (!_fl || !_fl.hasBlooket) continue;
        if (_fgIn && !_fgIn(_fl.lessonKey)) continue;
        var _fcws = (typeof _fl.Cws === 'number') ? _fl.Cws : null;
        var _fbl = (typeof _fl.blooket === 'number') ? _fl.blooket : null;
        if (_fcws != null && _fcws >= 60 && (_fbl == null || _fbl < 80)) {
          _fg.push({ lesson: _fl.lessonKey, worksheet: _fcws, blooket: _fbl, threshold: 80 });
        }
      }
      ctx.flashcardGate = _fg.slice(0, 3);
    }
  } catch (_) { /* flashcardGate is optional */ }
  try {
    if (_donowData && _donowData.nextTask && _donowData.nextTask.unit) {
      var n = _donowData.nextTask;
      // unit arrives as "U1"; strip the leading U so renders read "Unit 1", not "Unit U1".
      ctx.nextTask = { unit: String(n.unit).replace(/^[Uu]/, ''), lesson: n.lesson || null, activity: n.activity || null };
    }
  } catch (_) { /* nextTask is optional */ }
  // The Missing-work list exactly as My Ledger shows it: each item with its ZERO DATE and whether
  // it is counting yet (red) or still tentative (yellow). The coach must never call a yellow
  // item a 0 (teacher 2026-09-26: the coach was behind the zero-date rule).
  try {
    ctx.missing = _coachMissingList(curQ);
  } catch (_) { ctx.missing = []; }
  // QUARTER_LINE_BY_DUE_DATE_SPEC §3.7: one quarter at a time; a closing quarter gets its own line.
  try { if (typeof _coachQuarterLine === 'function') _coachQuarterLine(ctx, curQ); } catch (_) {}
  // EFFORT_VISIBILITY_SPEC §3: a PC on file (it may not count yet) and the lessons done ahead of
  // the calendar, so the coach credits the effort before anything else.
  try {
    var _ef = _effortFacts(curQ);
    ctx.pcOnFile = _ef.pc;
    ctx.ahead = _ef.ahead.slice(0, 8);
    ctx.aheadCount = _ef.ahead.length;
    // AHEAD_WORK_PROJECTION_SPEC: { projected, today, aheadCells } or null.
    ctx.aheadProjection = _ef.projection || null;
  } catch (_) { ctx.pcOnFile = null; ctx.ahead = []; ctx.aheadCount = 0; ctx.aheadProjection = null; }
  try {
    if (Array.isArray(_gradeLessonsCache)) {
      // Review D2: a closed or other quarter's lesson is never the "biggest win" here.
      var _weakIn = (typeof _coachLessonFilter === 'function') ? _coachLessonFilter(curQ) : null;
      var weak = _gradeLessonsCache.filter(function (l) {
        if (_weakIn && l && !_weakIn(l.lessonKey)) return false;
        return l && typeof l.lessonGrade === 'number' && l.lessonGrade < 75;
      }).sort(function (a, b) { return a.lessonGrade - b.lessonGrade; }).slice(0, 6);
      ctx.weakLessons = weak.map(function (l) {
        var w = {
          lesson: l.lessonKey,
          // quizTotal distinguishes "no quiz exists" (0 — e.g. X.1 openers) from
          // "quiz exists but not attempted" (>0, Q null). Without it the coach
          // wrongly says "quiz not done" for a topic that has no quiz.
          quizTotal: (typeof l.quizTotal === 'number') ? l.quizTotal : 0,
          quiz: (typeof l.Q === 'number') ? l.Q : null,
          worksheet: (typeof l.Cws === 'number') ? l.Cws : null,
          work: (typeof l.W === 'number') ? l.W : null,
          // Per-lesson Blooket: hasBlooket distinguishes "Blooket not done" from
          // "no Blooket exists" (so the coach never invents a missing Blooket).
          blooket: (typeof l.blooket === 'number') ? l.blooket : null,
          hasBlooket: !!l.hasBlooket,
          grade: l.lessonGrade
        };
        // The lesson's LOWEST graded component = its biggest fixable deficit.
        // (Count a quiz only when one exists.) Used to rank by IMPACT, so the
        // coach points at the worst component (e.g. a 1% worksheet) rather than
        // the earliest-incomplete lesson or the overall lesson grade.
        var comps = [];
        if (w.quizTotal > 0 && w.quiz != null) comps.push({ label: 'quiz', score: w.quiz });
        if (w.worksheet != null) comps.push({ label: 'worksheet', score: w.worksheet });
        if (w.work != null) comps.push({ label: 'FRQ', score: w.work });
        w.low = comps.length ? comps.reduce(function (a, b) { return b.score < a.score ? b : a; }) : null;
        return w;
      });
      // Rank worst-component-first (biggest grade opportunity), not by overall
      // grade — that's what the student should fix FIRST.
      ctx.weakLessons.sort(function (a, b) {
        var as = a.low ? a.low.score : a.grade;
        var bs = b.low ? b.low.score : b.grade;
        return as - bs;
      });
      var _bw = ctx.weakLessons.filter(function (w) { return w.low; })[0];
      if (_bw) ctx.biggestWin = { lesson: _bw.lesson, label: _bw.low.label, score: _bw.low.score };
    }
  } catch (_) { /* weakLessons is optional */ }
  return ctx;
}

// Missing work for the coach: [{ lesson, kind, zeroDate, day, past, quarter? }], oldest first, at
// most 12. QUARTER_LINE_BY_DUE_DATE_SPEC §3.7: the coach explains ONE quarter, so with `quarter`
// only that quarter's items are kept (another quarter's 0s never count toward it; untagged items
// of an older /grade stay). Review D2 (2026-11-08): the quarter filter runs BEFORE the 12-item
// cut, or twelve older Quarter 1 items would push every Quarter 2 item off the list.
function _coachMissingList(quarter) {
    var warns = (typeof _zeroCurrentWarnings === 'function') ? _zeroCurrentWarnings() : [];
    if (!Array.isArray(warns)) return [];
    // Each item also names the quarter it counts in, when /grade says.
    var tags = (typeof DeskMissingWork !== 'undefined' && typeof DeskMissingWork.lessonQuarters === 'function')
        ? DeskMissingWork.lessonQuarters((typeof _gradeLessonsCache !== 'undefined') ? _gradeLessonsCache : null, (typeof cP === 'string') ? cP : null)
        : {};
    var items = warns.map(function (w) {
        var item = {
            lesson: w.lessonKey,
            kind: w.kind,
            zeroDate: w.zeroDate,
            day: (typeof _zeroDayText === 'function') ? _zeroDayText(w.zeroDate) : w.zeroDate,
            past: Boolean(w.past),
        };
        if (tags[w.lessonKey]) item.quarter = tags[w.lessonKey].quarter;
        return item;
    });
    if (quarter) items = items.filter(function (m) { return !m.quarter || m.quarter === quarter; });
    return items.slice(0, 12);
}
// QUARTER_LINE_BY_DUE_DATE_SPEC §3.7: while another quarter is closing, ctx.quarterLine names its
// fixable 0s, counted from the FULL warning list (never the coach's cut list):
// 'Quarter 1 closes Tue Nov 10: 2 zeros still fixable.'
function _coachQuarterLine(ctx, quarter) {
    if (!quarter) return;
    var phase = (typeof _deskQuarterPhase === 'function') ? _deskQuarterPhase() : null;
    if (!phase || !phase.closing || phase.closing === quarter) return;
    if (typeof DeskMissingWork === 'undefined' || typeof DeskMissingWork.lessonQuarters !== 'function') return;
    var tags = DeskMissingWork.lessonQuarters(_gradeLessonsCache, cP);
    var fixable = _zeroCurrentWarnings().filter(function (w) {
        return w.past && tags[w.lessonKey] && tags[w.lessonKey].quarter === phase.closing;
    }).length;
    if (!fixable) return;
    ctx.quarterLine = _quarterName(phase.closing) + ' closes ' + _quarterDayText(_quarterConfig(phase.closing).close) + ': '
        + fixable + (fixable === 1 ? ' zero' : ' zeros') + ' still fixable.';
}
// Review D2 (2026-11-08): which lessons the coach may name while it explains quarter q, as a
// predicate (lessonKey -> true / false), or null when nothing filters (no quarter, the missing-work
// module failed to load, or an older /grade without quarter fields). A lesson stays when it counts
// in q, or when it is lift-only into a quarter that is still closing (finishing it can still raise
// that quarter). A lesson of another quarter goes, and so does every lesson whose quarter has closed
// (the §3.3 choke point: its 0s are final). A lesson without a quarter tag always stays.
function _coachLessonFilter(q) {
    if (!q || typeof DeskMissingWork === 'undefined' || typeof DeskMissingWork.lessonQuarters !== 'function') return null;
    var lessons = (typeof _gradeLessonsCache !== 'undefined') ? _gradeLessonsCache : null;
    var period = (typeof cP === 'string') ? cP : null;
    var tags = DeskMissingWork.lessonQuarters(lessons, period);
    if (!Object.keys(tags).length) return null;
    var phase = (typeof _deskQuarterPhase === 'function') ? _deskQuarterPhase() : null;
    var closing = phase ? phase.closing : null;
    var today = _zeroTodayIso();
    var quarters = (typeof _deskGradeQuarters === 'function') ? _deskGradeQuarters() : null;
    return function (lessonKey) {
        var tag = tags[lessonKey];
        if (!tag) return true;
        var open = DeskMissingWork.openQuarterRows([{ lessonKey: lessonKey }], lessons, period, today, quarters);
        if (!open.length) return false;
        if (tag.quarter === q) return true;
        return Boolean(closing && tag.lift === closing);
    };
}
// "First:" — the missing work that matters most: everything counting as 0 now, else the group
// that becomes a 0 soonest. Empty string when nothing is missing.
function _coachFirstText(missing) {
    if (!Array.isArray(missing) || !missing.length) return '';
    var name = function (m) {
        var kind = m.kind === 'blooket' ? 'flashcards' : m.kind === 'quiz' ? 'quiz' : 'worksheet';
        return ((typeof cedLabel === 'function') ? cedLabel(m.lesson).text : m.lesson) + ' ' + kind;
    };
    var now = missing.filter(function (m) { return m.past; });
    if (now.length) {
        return '\u26A0 First: ' + now.slice(0, 3).map(name).join('; ') + (now.length > 3 ? ' and ' + (now.length - 3) + ' more' : '')
            + (now.length === 1 ? ' counts' : ' count') + ' as 0 right now — any score replaces a 0.';
    }
    var soonestDate = missing.map(function (m) { return m.zeroDate; }).sort()[0];
    var soon = missing.filter(function (m) { return m.zeroDate === soonestDate; });
    var day = soon[0].day || soonestDate;
    return '\u26A0 First: ' + soon.slice(0, 3).map(name).join('; ') + (soon.length > 3 ? ' and ' + (soon.length - 3) + ' more' : '')
        + (soon.length === 1 ? ' becomes' : ' become') + ' a 0 after ' + day + ' — turn in anything before then and there is no 0.';
}
// One-line diagnosis of the bottleneck from the two-track / 40%-gate model.
function _coachBottleneckText(ctx) {
  var pc = ctx.pcAvg, wk = ctx.workAvg;
  var pcNum = (typeof pc === 'number'), wkNum = (typeof wk === 'number');
  var pcLow = (pcNum && pc < 40);
  var wkLow = (wkNum && wk < 40);
  if (pcLow && wkLow) return 'Both tracks are below the 40% gate — that is capping your grade. Getting either one past 40% is your biggest win.';
  if (pcLow) return 'Your PC track is below the 40% gate, which is capping your grade. Lifting it past 40% is your biggest single win.';
  if (wkLow) return 'Your Work track is below the 40% gate, which is capping your grade. Lifting it past 40% is your biggest single win.';
  // Single-track cases (the other not yet attempted) — common early in a quarter.
  if (wkNum && !pcNum) return 'Your PC track has not started yet — your grade is set by your Work track alone, so finishing your due work is what lifts it.';
  if (pcNum && !wkNum) return 'Your Work track has not started yet — your grade is set by your PC (Progress-Check) track alone, so doing well on Progress Checks is what lifts it.';
  if (pcNum && wkNum) {
    var higher = pc >= wk ? 'PC mastery' : 'Work';
    return 'Your grade follows your stronger track (' + higher + '). Finishing your due work is what lifts it toward the ceiling.';
  }
  return 'Finishing your due work is what lifts your grade toward the ceiling.';
}

// Build the expanded panel: instant deterministic facts + the AI mini-chat.
// XSS-safe — createElement + textContent only (no innerHTML with data).
function _renderCoachPanel(panel, ctx) {
  panel.innerHTML = '';

  // ----- instant facts (deterministic, no AI call) -----
  var facts = document.createElement('div');
  facts.className = 'wsl-facts';

  var head = document.createElement('div');
  head.className = 'wsl-head';
  var gradeTxt = (ctx.grade != null) ? (Math.round(ctx.grade * 10) / 10) + '%' : '—';
  var quarterWords = !ctx.quarter ? 'current' : ((typeof _quarterName === 'function') ? _quarterName(ctx.quarter) : ctx.quarter);
  head.textContent = 'Your ' + quarterWords + ' grade is ' + gradeTxt +
    (ctx.ceiling != null ? ' (the most it could still reach this quarter: ' + (Math.round(ctx.ceiling * 10) / 10) + '%).' : '.');
  facts.appendChild(head);

  var tracks = document.createElement('div');
  var pcTxt = (ctx.pcAvg != null) ? (Math.round(ctx.pcAvg * 10) / 10) + '%' : 'not started';
  var wkTxt = (ctx.workAvg != null) ? (Math.round(ctx.workAvg * 10) / 10) + '%' : 'not started';
  tracks.textContent = 'PC mastery: ' + pcTxt + ' · Work: ' + wkTxt + '.';
  facts.appendChild(tracks);

  // EFFORT_VISIBILITY_SPEC §3: the PC on file (+ the 40% strategy) and the work done ahead, right
  // under the tracks and before the bottleneck sentence.
  try {
    if (typeof EffortFacts !== 'undefined' && EffortFacts) {
      if (ctx.pcOnFile) {
        var strat = EffortFacts.strategyLine(ctx.pcOnFile, ctx.workAvg, EffortFacts.GRADE_FLOOR, ctx.pcAvg);
        var pcEl = document.createElement('div');
        pcEl.className = 'wsl-effort-pc';
        pcEl.style.cssText = 'margin-top:3px;border-left:3px solid #888888;padding-left:6px';
        pcEl.textContent = EffortFacts.pcLine(ctx.pcOnFile) + (strat ? ' ' + strat : '');
        facts.appendChild(pcEl);
      }
      if (Array.isArray(ctx.ahead) && ctx.ahead.length) {
        var aheadEl = document.createElement('div');
        aheadEl.className = 'wsl-effort-ahead';
        aheadEl.style.cssText = 'margin-top:3px;border-left:3px solid #2a8a2a;padding-left:6px';
        aheadEl.textContent = EffortFacts.aheadLine(ctx.ahead, (typeof _effortTopicNumber === 'function') ? _effortTopicNumber : null, ctx.aheadCount);
        facts.appendChild(aheadEl);
      }
    }
  } catch (_) { /* effort lines are best-effort */ }

  var diag = document.createElement('div');
  diag.textContent = _coachBottleneckText(ctx);
  facts.appendChild(diag);

  // Missing work outranks a low recorded score: a 0 costs far more than 30 points on a 70.
  var firstLine = _coachFirstText(ctx.missing);
  if (firstLine) {
    var first = document.createElement('div');
    first.style.cssText = 'font-weight:bold;margin-top:3px';
    first.textContent = firstLine;
    facts.appendChild(first);
  }
  // QUARTER_LINE_BY_DUE_DATE_SPEC §3.7: the closing quarter's fixable 0s, apart from this quarter's.
  if (ctx.quarterLine) {
    var qLine = document.createElement('div');
    qLine.className = 'wsl-quarter-line';
    qLine.style.cssText = 'font-weight:bold;margin-top:3px';
    qLine.textContent = '⚠ ' + ctx.quarterLine;
    facts.appendChild(qLine);
  }
  // The lowest-scoring RECORDED component — the biggest win once nothing is missing.
  if (ctx.biggestWin) {
    var bw = document.createElement('div');
    bw.style.cssText = (firstLine ? '' : 'font-weight:bold;') + 'margin-top:3px';
    bw.textContent = (firstLine ? 'Then: your ' : '🎯 Biggest win: your ') + cedLabel(ctx.biggestWin.lesson).text + ' ' + ctx.biggestWin.label +
      ' is at ' + Math.round(ctx.biggestWin.score) + '% — ' + (firstLine ? 'fixing that is the next lift.' : 'fixing that lifts your grade the most.');
    facts.appendChild(bw);
  }

  if (typeof ctx.lessonsGraded === 'number' && typeof ctx.lessonsTotal === 'number') {
    var prog = document.createElement('div');
    var dueTxt = (typeof ctx.lessonsDue === 'number') ? ctx.lessonsDue : ctx.lessonsTotal;
    prog.textContent = ctx.lessonsGraded + ' of ' + dueTxt + ' due lessons graded. Work counts as 0 only once its zero date passes — the red items in My Ledger are counting now, the yellow ones are not yet.';
    facts.appendChild(prog);
  }

  // Blooket make-up — a real Work-track component (10%) the student can't see
  // anywhere else. Show the standing; when any are undone, point at the flashcard
  // deck (its best score is the grade, point for point), often the fastest Work-track lift.
  if (ctx.blooket && ctx.blooket.due > 0) {
    var blk = document.createElement('div');
    var bTrk = (ctx.blooket.track != null) ? (Math.round(ctx.blooket.track) + '%') : '—';
    var bMsg = 'Blooket: ' + bTrk + ' (' + ctx.blooket.done + ' of ' + ctx.blooket.due + ' done).';
    if (ctx.blooket.todo && ctx.blooket.todo.length) {
      bMsg += ' A deck not played by its zero date counts as 0. Play it from the Desk flashcards (your best score counts) — e.g. ' + ctx.blooket.todo.slice(0, 3).map(function (key) { return cedLabel(key).text; }).join('; ') + '.';
    }
    blk.textContent = bMsg;
    facts.appendChild(blk);
  }

  // Flashcard completion gate — lessons whose worksheet is done but flashcards
  // (Blooket >=80) are still owed, which is what keeps the lesson from showing complete.
  // Nothing is locked (the lesson gate went on 2026-09-10). The deck score is also the
  // Blooket slice of the Work track, and a deck missing on its zero date is a 0.
  if (Array.isArray(ctx.flashcardGate) && ctx.flashcardGate.length) {
    var fg = document.createElement('div');
    var fgTopics = ctx.flashcardGate.slice(0, 3).map(function (g) { return cedLabel(g.lesson).text; }).join('; ');
    fg.textContent = 'Flashcards to finish: ' + fgTopics + ' — play each lesson’s timed deck on the Desk; your best score is that lesson’s Blooket grade. Nothing is locked; every lesson stays open.';
    facts.appendChild(fg);
  }

  // Only show the earliest-incomplete "start here" when there's no low-scoring
  // component to fix first (otherwise it competes with the biggest win above).
  if (!ctx.biggestWin && ctx.nextTask && ctx.nextTask.unit) {
    var nt = document.createElement('div');
    nt.textContent = 'Start here: ' + (ctx.nextTask.lesson ? cedLabel(ctx.nextTask.lesson).text : ctx.nextTask.unit) +
      (ctx.nextTask.activity ? ' — ' + ctx.nextTask.activity : '') + '.';
    facts.appendChild(nt);
  }

  if (Array.isArray(ctx.weakLessons) && ctx.weakLessons.length) {
    var wlHead = document.createElement('div');
    wlHead.textContent = 'Lowest lessons to fix:';
    facts.appendChild(wlHead);
    var ul = document.createElement('ul');
    ctx.weakLessons.slice(0, 4).forEach(function (w) {
      var li = document.createElement('li');
      var bits = [];
      // Only mention the quiz when one actually exists (quizTotal > 0).
      if (w.quizTotal > 0) bits.push((w.quiz != null) ? 'quiz ' + Math.round(w.quiz) + '%' : 'quiz not done');
      if (w.worksheet != null) bits.push('worksheet ' + Math.round(w.worksheet) + '%');
      // Mention Blooket only when the lesson actually HAS one (never invent it).
      if (w.hasBlooket) bits.push((w.blooket != null) ? 'Blooket ' + Math.round(w.blooket) + '%' : 'Blooket not done');
      if (!bits.length && typeof w.grade === 'number') bits.push('grade ' + Math.round(w.grade) + '%');
      li.textContent = cedLabel(w.lesson).text + (bits.length ? ' (' + bits.join(', ') + ')' : '');
      ul.appendChild(li);
    });
    facts.appendChild(ul);
  }
  panel.appendChild(facts);

  // ----- AI mini-chat (optional, grounded follow-ups) -----
  var sep = document.createElement('div'); sep.className = 'wsl-sep'; panel.appendChild(sep);

  var label = document.createElement('div');
  label.textContent = 'Ask the AI coach:';
  label.style.cssText = 'font-size:11px;margin-bottom:3px';
  panel.appendChild(label);

  var transcript = document.createElement('div');
  // role=log + aria-live=polite so a screen reader announces each appended turn
  // and the "thinking…" → answer swap (matches the nudge-toast pattern elsewhere).
  transcript.setAttribute('role', 'log');
  transcript.setAttribute('aria-live', 'polite');
  panel.appendChild(transcript);

  var row = document.createElement('div');
  row.className = 'wsl-chat-q';
  var input = document.createElement('input');
  input.type = 'text';
  input.value = (typeof ctx.grade === 'number' && ctx.grade < 80) ? 'Why so low?' : 'What should I focus on?';
  input.setAttribute('aria-label', 'Ask the grade coach');
  var ask = document.createElement('button');
  ask.className = 'wsl-ask';
  ask.type = 'button';
  ask.textContent = 'Ask';
  row.appendChild(input);
  row.appendChild(ask);
  panel.appendChild(row);

  var note = document.createElement('div');
  note.className = 'wsl-note';
  note.textContent = 'The coach only sees your grade summary — never your name.';
  panel.appendChild(note);

  var history = [];
  function send() {
    if (ask.disabled) return; // in-flight guard — gate the Enter path like the button
    var msg = (input.value || '').trim();
    if (!msg) return;
    input.value = '';
    _coachAsk(ctx, msg, transcript, history, ask);
  }
  ask.onclick = send;
  input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } };
}

// POST a coach turn to the cr AI server (/api/ai/coach). Grounded by the handed
// context; soft-fails to the still-visible instant facts (mirrors the
// tutor-prompt soft-fail contract). The endpoint is CORS-open + unauthenticated
// like the other /api/ai/* routes, so no token is needed.
// The reply lands as textContent, so markdown would show as literal asterisks. Strip the
// emphasis and heading marks a model may still emit despite the plain-text rule.
function _coachPlainText(text) {
    return String(text || '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^#{1,6}\s+/gm, '');
}
// cedReferenceText expands every "Topic 1.3" into the lesson's full title. Models repeat the
// "Topic" form on every line, so the full title showed four times. Keep the FIRST mention of
// each topic (it gets expanded) and shorten later ones to the bare number.
function _coachOnceTopics(text) {
    var seen = {};
    return String(text || '').replace(/\b(?:Topic|Lesson)\s+([1-9]\.\d+(?:[\u2013-](?:\d+\.)?\d+)?)\b/gi, function (m, key) {
        if (seen[key]) return key;
        seen[key] = true;
        return m;
    });
}
async function _coachAsk(ctx, message, transcriptEl, history, askBtn) {
  var sEl = document.createElement('div');
  sEl.className = 'wsl-msg student';
  sEl.textContent = 'You: ' + message;
  transcriptEl.appendChild(sEl);

  var cEl = document.createElement('div');
  cEl.className = 'wsl-msg coach';
  cEl.textContent = 'Coach is thinking…';
  transcriptEl.appendChild(cEl);
  // A concurrent re-render could detach cEl before the AI lands; only write if
  // it's still in the DOM, so a stale reply silently no-ops instead of
  // mutating an orphaned node.
  function setCoach(t) { if (cEl.isConnected) cEl.textContent = t; }
  var unavailable = 'AI coach is unavailable right now — the breakdown above still shows what to do.';

  if (askBtn) askBtn.disabled = true;
  try {
    var base = (typeof window !== 'undefined' && window.RAILWAY_SERVER_URL)
      ? window.RAILWAY_SERVER_URL
      : 'https://curriculumrender-production.up.railway.app';
    var resp = await fetch(base + '/api/ai/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: ctx, message: message, history: history })
    });
    if (!resp || !resp.ok) {
      setCoach((resp && resp.status === 503)
        ? 'AI coach is not set up right now — the breakdown above still shows what to do.'
        : unavailable);
      return;
    }
    var data = await resp.json();
    var answer = (data && data.response) ? String(data.response) : '';
    if (!answer) { setCoach(unavailable); return; }
    setCoach(cedReferenceText(_coachOnceTopics(_coachPlainText(answer))));
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: answer });
    if (history.length > 12) history.splice(0, history.length - 12);
  } catch (_) {
    setCoach(unavailable);
  } finally {
    if (askBtn && askBtn.isConnected) askBtn.disabled = false;
  }
}

