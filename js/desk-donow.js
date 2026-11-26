// ═══ Do Now card (DN3a) + calendar completion coloring (DN3b) ═══
// Server-mediated via roster-server /donow (D7): the Desk renders + polls only,
// NEVER touches Supabase. Self-contained; never throws/blocks the Desk.
var _donowData = null; // latest /donow payload (DN3b cell coloring reads this)
// The calendar's current next-up lesson topic (calNextUpTopic, LOCAL done
// signal) — set by rCal, read by renderDoNow so the Do Now message always
// agrees with the greyed calendar (never points at a locally-done lesson).
var _calNextUp = null;

// DN3b — does a /donow lesson string L cover the Desk cell topic T?
// Exact, or first dash-segment (combined U4/U5 worksheets: cell "4.1" ↔
// manifest "4.1-2"); "1.1" must NOT match "1.10".
function donowLessonCovers(L, T) {
  if (!L || !T) return false;
  return L === T || L.split('-')[0] === T || L.indexOf(T + '-') === 0;
}

// DN3b — roll a cell topic up to one of "", "partial", "done"
// (worst-wins across all matching /donow lessons; "" = none/no-data → grey).
function donowCellState(topic) {
  if (topic === 'B-Work' || topic === 'B-Break' || topic === 'E-Break') return '';
  var members=typeof groupTopics==='function'?groupTopics(topic):[topic];
  if(members.length>1){
    var states=members.map(donowCellState);
    if(states.every(function(state){return state==='done';}))return 'done';
    return states.some(Boolean)?'partial':'';
  }
  if (!_donowData || !Array.isArray(_donowData.lessons)) return '';
  var seen = false, anyPartial = false, anyDone = false, anyNotDone = false;
  for (var i = 0; i < _donowData.lessons.length; i++) {
    var L = _donowData.lessons[i];
    if (!donowLessonCovers(L.lesson, topic)) continue;
    seen = true;
    var s = L.lessonState;
    if (s === 'partial') anyPartial = true;
    else if (s === 'done') anyDone = true;
    else anyNotDone = true; // 'none' or unknown — NOT started
  }
  if (!seen) return '';                          // no /donow lesson covers this cell
  if (anyPartial) return 'partial';
  if (anyDone && anyNotDone) return 'partial';   // combined: some done, some not → in progress
  if (anyDone) return 'done';                    // every matching lesson done
  return '';                                     // all 'none'/unknown → grey (not started)
}

// DN3b — apply the 4-state overlay onto already-rendered cells. Pure class
// toggles (no rCal rebuild → no flicker / scroll loss on poll/visibility).
function paintDonowCells() {
  try {
    var today = +tdy();
    var cells = document.querySelectorAll('#cg .dc[data-topic]');
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      c.classList.remove('dc-partial', 'dc-done', 'dc-ahead');
      var st = donowCellState(c.dataset.topic);
      if (st === 'partial') c.classList.add('dc-partial');
      else if (st === 'done') {
        var dts = Number(c.dataset.dts);
        c.classList.add((dts && dts > today) ? 'dc-ahead' : 'dc-done');
      }
      // a11y: mirror the SERVER done/ahead state into the aria-label too, so a
      // screen reader hears "completed" even when the done-state comes only from
      // the /donow feed (not the local marks rCal already suffixed). Idempotent:
      // skip if rCal already suffixed it (next-up cells are never done).
      var _al = c.getAttribute('aria-label');
      if (_al && _al.indexOf('(completed') < 0 && _al.indexOf('(next up)') < 0) {
        if (c.classList.contains('dc-ahead')) c.setAttribute('aria-label', _al + ' (completed, ahead of schedule)');
        else if (c.classList.contains('dc-done')) c.setAttribute('aria-label', _al + ' (completed)');
      }
      // CALENDAR_FOCUS -- .cal-current (the synthwave next-up) is owned by rCal
      // now, driven by LOCAL completion. paintDonowCells no longer touches it:
      // the /donow nextTask lagged a student's Done click and pinned the
      // highlight to the just-completed lesson.
    }
  } catch (_) { /* coloring must never break the Desk */ }
}

// CALENDAR_FOCUS — the chronological lesson-topic list for the ACTIVE period
// (cP), the sequence calNextUpTopic walks to pick the synthwave next-up cell.
// Shared by rCal and paintLocalDoneCells so both agree on which cell is next-up.
// Never throws (returns [] on any error).
function _orderedPeriodTopics() {
  try {
    return S.map(function (e) { return cP === 'B' ? e[3] : e[4]; })
            .filter(function (x) { return x && typeof x === 'object' && x.t; })
            .map(function (x) { return x.t; });
  } catch (_) { return []; }
}

// Predecessor within the SUMMER self-pacer. Summer cells carry INDIVIDUAL topics
// (1.1..1.10, in due order) while the live period-E pacing is COMBINED ("1.2+1.3"),
// so a summer topic is NOT found in _orderedPeriodTopics — it resolves here, from
// the summer schedule's own order. Returns the prior topic, or null (first lesson /
// unknown / no schedule). Fails OPEN (null). rCal/paintLocalDoneCells dispatch to
// this for summer cells (wk._summer / dataset.summer) and to _prevTopicInSequence
// for fall cells, so each surface gates at its own topic granularity.
function _prevSummerTopic(topic) {
  try {
    if (!topic) return null;
    var sch = window._summerSchedule;
    var lessons = (sch && Array.isArray(sch.lessons)) ? sch.lessons : [];
    var seq = lessons.map(function (L) { return L && L.topic; }).filter(Boolean);
    var idx = seq.indexOf(topic);
    return idx > 0 ? seq[idx - 1] : null;
  } catch (_) { return null; }
}

// Summer self-pacer topics in DUE order (array order IS due order — same assumption
// _prevSummerTopic + _summerWeeks make). INDIVIDUAL topics ("1.1".."1.10") so they
// match a summer cell's inf.t, unlike the COMBINED fall topics ("1.2+1.3"). Lets the
// next-up highlight land on the next SUMMER lesson during summer. [] when not loaded.
function _orderedSummerTopics() {
  try {
    var sch = window._summerSchedule;
    var lessons = (sch && Array.isArray(sch.lessons)) ? sch.lessons : [];
    return lessons.map(function (L) { return L && L.topic; })
                  .filter(function (x) { return typeof x === 'string' && x; });
  } catch (_) { return []; }
}

// The lesson that must be complete before `topic` opens: the immediately-prior
// topic in the period's ordered sequence (deduped), NOT the previous calendar
// cell. This makes the gate window-independent AND cross-portion — a topic that
// appears in both the summer and fall blocks shares one predecessor, so finishing
// it anywhere unlocks the next everywhere (completion is topic-keyed). null = the
// first lesson in the sequence (always open). Fails OPEN (null) on any error.
function _prevTopicInSequence(topic) {
  try {
    if (!topic) return null;
    var ordered = (typeof _orderedPeriodTopics === 'function') ? _orderedPeriodTopics() : [];
    var seq = [], last = null;
    for (var i = 0; i < ordered.length; i++) {
      var t = ordered[i];
      if (!t || !/^\d+\.\d+/.test(t)) continue;
      if (t !== last) { seq.push(t); last = t; }   // collapse a multi-day lesson's repeats
    }
    var idx = seq.indexOf(topic);
    return idx > 0 ? seq[idx - 1] : null;
  } catch (_) { return null; }
}

// CROSS-DEVICE grey-out repaint (2026-06-03). rCal applies the local-done
// greyscale + the synthwave next-up cell from localLessonState, but it runs at
// page load BEFORE the async /grade cache (_gradeLessonsCache) warms — and
// localLessonState now also derives "done" from those SYNCED scores
// (_isLessonComplete). So after grades land we must repaint, or a lesson
// finished on another device never greys here.
//
// GREYING + next-up: a flicker-free class toggle over the already-rendered
// cells (like paintDonowCells) — NO rCal rebuild, so no flicker / scroll-loss on
// poll/visibility.
//
// MISSING_WORK_VISIBILITY D3b — red corner mark on calendar cells whose lesson
// is already a 0 (no worksheet work, zero date passed). Runs after every rCal
// rebuild (from paintDonowCells) and on every grade refresh (from
// paintLocalDoneCells). Only paints classes/titles — never touches lock state,
// so it can't re-enter the rCal <-> paintLocalDoneCells rebuild loop.
function _paintZeroCells() {
  try {
    var zeroTopics = {};
    _zeroCurrentWarnings().filter(function (w) { return w.past; }).forEach(function (w) {
      zeroTopics[w.lessonKey] = true;
    });
    var zeroTitle = ' — missing work (already a 0)';
    var cells = document.querySelectorAll('#cg .dc[data-topic]');
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      c.classList.remove('dc-zero');
      var oldMark = c.querySelector('.dc-zero-mark');
      if (oldMark) oldMark.remove();
      if (c.title.endsWith(zeroTitle)) {
        c.title = c.title.slice(0, -zeroTitle.length);
        if (!c.title) c.removeAttribute('title');
      }
      var topic = c.dataset.topic || '';
      if (!topic.split('+').some(function (key) { return zeroTopics[key]; })) continue;
      c.classList.add('dc-zero');
      var mark = document.createElement('span');
      mark.className = 'dc-zero-mark';
      mark.setAttribute('aria-hidden', 'true');
      c.appendChild(mark);
      c.title += zeroTitle;
    }
  } catch (_) { /* repaint must never break the Desk */ }
}

function paintLocalDoneCells() {
  try {
    _paintZeroCells();
    var marks = (typeof getStudentMarks === 'function') ? getStudentMarks() : {};
    // Mirror rCal: a TEACHER viewing as themselves gets NO progress overlay (their marks
    // are browsing noise). Preview-as-student + real students keep it.
    var suppressProgress = (typeof _deskIsTeacher === 'function') && _deskIsTeacher();
    var nextUp = (typeof calNextUpTopic === 'function')
      ? calNextUpTopic(_orderedPeriodTopics(), marks) : null;
    // Mirror rCal's summer guard: only prefer the summer track WHILE summer is active.
    // _orderedSummerTopics() has no date check + _summerSchedule is never cleared, so an
    // unguarded summerNextUp would be non-null year-round and clobber the fall next-up
    // off-season. DOM truth: a rendered summer cell (set by rCal) == summer is active.
    var _summerActive = !!document.querySelector('#cg .dc[data-summer="1"]');
    var summerNextUp = (_summerActive && typeof calNextUpTopic === 'function')
      ? calNextUpTopic(_orderedSummerTopics(), marks) : null;
    _calNextUp = summerNextUp || nextUp; // summer next-up wins while summer is active (matches rCal)
    var cells = document.querySelectorAll('#cg .dc[data-topic]');
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var topic = c.dataset.topic;
      // Greying + next-up — the flicker-free common path.
      c.classList.remove('dc-localdone', 'dc-localpartial', 'cal-current');
      if (topic) {
        var st = localLessonState(topic, marks);
        if (suppressProgress && st === 'partial') st = '';   // teacher: drop browsing "partial", keep real "done"
        if (st) c.classList.add(st === 'done' ? 'dc-localdone' : 'dc-localpartial');
        if (topic === nextUp) c.classList.add('cal-current');
        else if (c.dataset.summer === '1' && summerNextUp && topic === summerNextUp) c.classList.add('cal-current');
      }
    }
  } catch (_) { /* repaint must never break the Desk */ }
}

// DN3c / D1 — soft speed-bump. Opening a lesson that ISN'T your Do Now while
// you have earlier unfinished work shows a gentle, non-blocking nudge. Units
// stay open (never a hard gate); shown at most once per session.
var _bumpAcked = false;

function closeDoNowBump() {
  var ov = document.getElementById('donow-bump-overlay');
  if (ov) ov.style.display = 'none';
}

function maybeBumpThenOpen(inf, ds) {
  function open() { try { showResourcePanel(inf, ds); } catch (_) {} }
  try {
    var topic = inf && inf.t;
    var gap = _donowData && _donowData.earlierGapFlag === true;
    var nt = _donowData && _donowData.nextTask;
    // BUG B fix: the server's earlierGapFlag is computed at page load and can lag
    // the student's LOCAL completion. If the Do-Now lesson is already marked done
    // locally (the greyed calendar cell), the gap is stale -- don't nag. Keeps the
    // speed-bump consistent with the cell greying (both now read local marks).
    if (gap && nt && nt.lesson) {
      try {
        if (localLessonState(nt.lesson, getStudentMarks()) === 'done') gap = false;
      } catch (_) {}
    }
    var isDoNow = nt && topic && (typeof groupTopics==='function'?groupTopics(inf):[topic]).some(function(member){return donowLessonCovers(nt.lesson,member);});
    var ov = document.getElementById('donow-bump-overlay');

    if (!gap || _bumpAcked || isDoNow || !ov) { open(); return; }

    var contBtn = document.getElementById('donow-bump-continue');
    var gotoBtn = document.getElementById('donow-bump-goto');
    if (contBtn) contBtn.onclick = function () {
      _bumpAcked = true;            // gentle: don't nag again this session
      closeDoNowBump();
      open();
    };
    if (gotoBtn) gotoBtn.onclick = function () {
      _bumpAcked = true;            // seen + acted on → don't re-nag this session (D1)
      closeDoNowBump();
      var card = document.getElementById('donow-card');
      if (card) {
        try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { card.scrollIntoView(); }
        card.classList.add('donow-flash');
        setTimeout(function () { card.classList.remove('donow-flash'); }, 1600);
      }
    };
    ov.style.display = 'block';
  } catch (_) {
    open(); // the speed-bump must never block opening a lesson
  }
}

// Quarter-band labels — mirror roster-server's PHASE3_CONFIG.quarters and
// start-here.html's QUARTER_BAND_LABEL so the Do Now strip stays consistent
// with the full breakdown render.
// SY2627 (2026-09-03): quarters are DATE windows (the real LEHS marking
// periods). Old units are taught in CED order and straddle quarters, so a
// unit list would be false — label each quarter by its dates instead.
const QUARTER_BAND_LABEL = {
  Q1: 'Sep 2 – Nov 6',
  Q2: 'Nov 9 – Jan 22',
  Q3: 'Jan 25 – Apr 14',
  Q4: 'Apr 15 – Jun 17',
};

// Quarter calendar windows -- mirror roster-server's grade-config.js
// PHASE3_CONFIG.quarters start/end dates. F2 made the GRADE math
// date-driven; this lets the calendar's quarter divider snap to the
// same real dates instead of unit boundaries. Months are 1-indexed
// here (Sep = 9), matching the ISO dates in grade-config.js. Re-edit
// both files together once per school year.
// close / finalUntil (QUARTER_LINE_BY_DUE_DATE_SPEC §3, teacher 2026-11-07): Quarter 1's
// 0s stay fixable until it closes; then it reads "final" until finalUntil. Display only; the
// calendar reads them here, every grade surface from /grade config.quarters. Pinned equal
// to grade-config.js by tests/desk-quarter-line.test.js.
const QUARTER_WINDOWS = [   // SY2627 real LEHS marking periods (2026-09-03)
  { q: 1, start: [2026, 9, 2],   end: [2026, 11, 6], close: [2026, 11, 10], finalUntil: [2026, 11, 19] },
  { q: 2, start: [2026, 11, 9],  end: [2027, 1, 22]  },
  { q: 3, start: [2027, 1, 25],  end: [2027, 4, 14]  },
  { q: 4, start: [2027, 4, 15],  end: [2027, 6, 17]  },
];

// Which quarter (1-4) a calendar Date falls in; 0 if outside every
// window. The date-driven counterpart of grade-config.js quarterOfDate.
function quarterOfDate(dt) {
  const key = dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
  for (const w of QUARTER_WINDOWS) {
    const lo = w.start[0] * 10000 + w.start[1] * 100 + w.start[2];
    const hi = w.end[0] * 10000 + w.end[1] * 100 + w.end[2];
    if (key >= lo && key <= hi) return w.q;
  }
  return 0;
}

// ── QUARTER LINE (QUARTER_LINE_BY_DUE_DATE_SPEC.md, teacher 2026-11-07) ─────────────────────
// A lesson counts in the quarter its 0 date lands in (/grade lessons[].quarter[period]); a
// lesson taught in the quarter before also carries liftQuarter[period]: finishing it can still
// raise that quarter, never lower it. Quarter 1 ended Fri Nov 6, its 0s stay fixable until it
// closes Tue Nov 10 (moved from Thu 11/12, teacher 2026-11-08), then it reads "final" through Nov 19. The close dates come from the last
// /grade (config.quarters). An older cached payload has none: every surface then keeps its
// single-quarter view. Every date test goes through _zeroTodayIso() (tdy), so tests pin it.
var _gradeConfigCache = null;   // latest /grade config { quarters, ... }; null before a load
// Review D8 (2026-11-08): { Q1: true } for each quarter the latest /grade reports closed
// (quarters[Q].closed: its first-close snapshot exists). Set together with _gradeConfigCache, so
// every surface reads the same moment: a closed quarter is "final" at once, whatever the clock says.
var _gradeClosedCache = null;

// { Q1: true } for each quarter of a /grade quarters{} that carries a close snapshot; {} otherwise.
function _gradeClosedQuarters(quarters) {
  var out = {};
  if (!quarters || typeof quarters !== 'object') return out;
  Object.keys(quarters).forEach(function (q) {
    if (quarters[q] && quarters[q].closed) out[q] = true;
  });
  return out;
}

// /grade config.quarters ({ Q1: { start, end, close?, finalUntil? }, ... }), or null. A quarter
// /grade reports closed comes back with closed: true on a copy of its entry (D8), which
// DeskMissingWork reads as final; the cached config itself is never changed.
function _deskGradeQuarters() {
  var config = (typeof _gradeConfigCache !== 'undefined') ? _gradeConfigCache : null;
  var quarters = config && config.quarters;
  if (!quarters || typeof quarters !== 'object') return null;
  var closed = (typeof _gradeClosedCache !== 'undefined') ? _gradeClosedCache : null;
  if (!closed || !Object.keys(closed).length) return quarters;
  var out = {};
  Object.keys(quarters).forEach(function (q) {
    out[q] = closed[q] ? Object.assign({}, quarters[q], { closed: true }) : quarters[q];
  });
  return out;
}

// { current, closing, final } while a quarter is closing or final; null otherwise (no window,
// no close dates, or the missing-work module failed to load) so callers keep today's logic.
function _deskQuarterPhase() {
  if (typeof DeskMissingWork === 'undefined' || typeof DeskMissingWork.quarterPhase !== 'function') return null;
  var quarters = _deskGradeQuarters();
  if (!quarters) return null;
  var phase = DeskMissingWork.quarterPhase(quarters, _zeroTodayIso());
  return (phase.closing || phase.final) ? phase : null;
}

// The config entry of a quarter ({ start, end, close?, finalUntil? }), or {}.
function _quarterConfig(q) {
  var quarters = _deskGradeQuarters();
  return (quarters && quarters[q]) || {};
}

// 'Quarter 1' for 'Q1' (headings never say "Q1": Q1 / Q3 are quartiles on the same screens).
function _quarterName(q) {
  return 'Quarter ' + String(q || '').replace(/^Q/, '');
}

// 'Tue Nov 10' for an ISO date; '' when missing.
function _quarterDayText(iso) {
  if (!iso) return '';
  var d = new Date(iso + 'T00:00:00');
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return DAYS[d.getDay()] + ' ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
}

// The heading over a quarter's rows (My Ledger, My Grade): 'Quarter 1 (closes Tue Nov 10)' for
// the closing quarter, 'Quarter 2 (0 dates after Fri Nov 6)' for a quarter after another one.
// "0 dates", never "due": on the Desk "due" means the class day.
function _quarterHeadingText(q, phase) {
  var cfg = _quarterConfig(q);
  if (phase && phase.closing === q && cfg.close) return _quarterName(q) + ' (closes ' + _quarterDayText(cfg.close) + ')';
  var prev = _quarterConfig('Q' + (Number(String(q).slice(1)) - 1));
  if (prev.end) return _quarterName(q) + ' (0 dates after ' + _quarterDayText(prev.end) + ')';
  if (cfg.end) return _quarterName(q) + ' (ends ' + _quarterDayText(cfg.end) + ')';
  return _quarterName(q);
}

// How My Ledger and My Grade group the missing-work rows, or null for one plain list (an older
// /grade without quarter fields, or every row in one quarter while none is closing). Rows are
// listed once, under the quarter they count in; both windows read this one object.
//   quarterOf(row) -> 'Q2' | null    heading(q) -> text    lift(row) -> '' | the lift note
//   quarters -> the quarters present, in calendar order    sig -> rebuild key for the cards
function _zeroQuarterView(rows) {
  if (typeof DeskMissingWork === 'undefined' || typeof DeskMissingWork.lessonQuarters !== 'function') return null;
  var lessons = (typeof _gradeLessonsCache !== 'undefined') ? _gradeLessonsCache : null;
  var period = (typeof cP === 'string') ? cP : null;
  var tags = DeskMissingWork.lessonQuarters(lessons, period);
  var list = Array.isArray(rows) ? rows : [];
  var seen = {};
  for (var i = 0; i < list.length; i++) {
    var tag = list[i] ? tags[list[i].lessonKey] : null;
    if (!tag) return null;
    seen[tag.quarter] = true;
  }
  var phase = _deskQuarterPhase();
  var present = Object.keys(seen).sort();
  if (!(phase && phase.closing) && present.length < 2) return null;
  var close = (phase && phase.closing) ? _quarterConfig(phase.closing).close : null;
  var liftText = close
    ? 'finishing it by ' + _quarterDayText(close).split(' ')[0] + ' can also raise ' + _quarterName(phase.closing) + ' (never lower)'
    : '';
  var tagOf = function (row) { return (row && tags[row.lessonKey]) || null; };
  return {
    phase: phase,
    quarters: present,
    quarterOf: function (row) { var t = tagOf(row); return t ? t.quarter : null; },
    heading: function (q) { return _quarterHeadingText(q, phase); },
    lift: function (row) { var t = tagOf(row); return (liftText && t && t.lift === phase.closing) ? liftText : ''; },
    sig: (phase ? (phase.closing || '-') + '/' + (phase.final || '-') : 'none') + ':'
      + list.map(function (row) { var t = tagOf(row); return t.quarter + (t.lift ? '<' + t.lift : ''); }).join(','),
  };
}

// The rows that count in quarter q: the balance card's number, colour and drop sentence speak
// for the quarter shown, never another quarter's 0s. Rows of an older /grade all stay.
function _zeroRowsInQuarter(rows, q) {
  if (!q || !Array.isArray(rows)) return rows;
  if (typeof DeskMissingWork === 'undefined' || typeof DeskMissingWork.lessonQuarters !== 'function') return rows;
  var lessons = (typeof _gradeLessonsCache !== 'undefined') ? _gradeLessonsCache : null;
  var tags = DeskMissingWork.lessonQuarters(lessons, (typeof cP === 'string') ? cP : null);
  for (var i = 0; i < rows.length; i++) if (!rows[i] || !tags[rows[i].lessonKey]) return rows;
  return rows.filter(function (row) { return tags[row.lessonKey].quarter === q; });
}

// Cache of the lessons[] array from the last /grade fetch.
// Used by openDayGrade to look up per-lesson data without a second fetch.
var _gradeLessonsCache = null;
var _gradeQuartersCache = null; // latest /grade quarters{} — read by the "Why so low?" coach
var _gradeGradebookCache = null; // latest /grade gradebook{} — read by My Ledger's "Score breakdown"
var _gradeUnitsCache = null; // latest /grade units{} — a PC on file (units[U<n>].pcRawPct), EFFORT_VISIBILITY_SPEC §3

// PROGRESS_RESET_FIX_SPEC D1 — tri-state /grade load state. 'unknown' before
// the first load ever runs; 'loading' while a fetch is in flight;
// 'available' only on a live res.ok+json.ok payload; 'unavailable' on ANY
// failure (auth/server/network — see renderDoNowGrades's classifier). Read
// by rProg (D5 honest-unknown) and _renderGradeStatus (D2 banner).
var _gradeLoadState = 'unknown';
const EXPIRED_SIGNIN_NOTICE = 'Your sign-in expired \u2014 sign in again. Your work on this device is saved and will sync.';
var _expiredSignInShown = false;    // One modal per page; dismissing never removes local evidence.
var _gradeLoadError = null;          // null | { kind: 'auth'|'server'|'network', status: number|null }
var _gradeRetryCount = 0;            // capped auto-retry counter (D2, <=3 per page load)
var _gradeRetryTimer = null;         // single-flight guard so concurrent calls don't stack retries
var _gradeLastRenderedState = 'unknown'; // D7: detects an unavailable->available transition

// Incident review follow-up (2026-07-21, findings B1/B2/LANE-C) — an in-place
// identity switch (sign-in as a different student without an intervening Sign
// Out / reload) must never let the PREVIOUS student's in-memory /grade state
// bleed into the new student's gating, greying, or Do Now paint:
//   - _gradeLessonsCache / _gradeGradebookCache / _gradeQuartersCache are
//     module-globals keyed by nothing but "the last successful fetch" — they
//     survive an in-place switch untouched, so _serverEvidencePresent() and
//     My Ledger's score breakdown would read the OLD student's data for the new one.
//   - _gradeRetryTimer closes over the OLD student's (baseUrl, token); if it
//     fires after the switch, renderDoNowGrades would persist/latch the OLD
//     student's grades under the NEW student's identity-scoped keys (both
//     _gradeCacheKey and _serverCompleteKey resolve the studentId live).
// Every sign-in tail calls this BEFORE its renderDoNow() so a stale retry is
// cancelled and the caches start cold for the new identity — a failed load
// then correctly renders D5's honest-unknown state instead of painting stale
// data. signOutStudent() already reloads the page (a stronger reset), so it
// does not need this call.
function _resetGradeStateForIdentitySwitch() {
  if (typeof renderDoNowGrades === 'function') renderDoNowGrades._request = null;
  if (typeof _phase2RefreshOnline === 'function') _phase2RefreshOnline._request = null;
  if (window.StudentWalletPrint) window.StudentWalletPrint.clear();
  try {
    if (_gradeRetryTimer) { clearTimeout(_gradeRetryTimer); _gradeRetryTimer = null; }
    _gradeRetryCount = 0;
    _gradeLessonsCache = null;
    _gradeGradebookCache = null;
    _gradeQuartersCache = null;
    _gradeUnitsCache = null;
    _gradeClosedCache = null;   // D8: a close snapshot is per student
    if (typeof _officialGradeCache !== 'undefined') _officialGradeCache = null;
    if (typeof _officialGradeByQuarter !== 'undefined') _officialGradeByQuarter = {};
    _gradeLoadState = 'unknown';
    _gradeLoadError = null;
    _gradeLastRenderedState = 'unknown';
  } catch (_) { /* best-effort */ }
}

window._summerSchedule = window._summerSchedule || null;
function _walletLoadSummerSchedule() {
  try {
    if (window._summerSchedule || !window.fetch) return;
    fetch('data/summer-schedule.json')
      .then(function (res) { return res && res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && Array.isArray(data.lessons)) {
          window._summerSchedule = data;
          if (typeof updateWalletReadinessIcon === 'function') updateWalletReadinessIcon();
          // The first rCal may have run before this fetch resolved — repaint so
          // the summer weeks weave into the grid now that the schedule is in hand.
          if (typeof rCal === 'function') { try { rCal(); } catch (_) {} }
          // After summer cells exist, re-run Do Now so the summer-guard in
          // renderDoNow can override CED-ordered /donow nextTask (e.g. 3.1 → 1.10).
          if (typeof renderDoNow === 'function') { try { renderDoNow(); } catch (_) {} }
          // Also refresh the readiness-COLORED surfaces (Do Now card + an open
          // wallet) so they switch from the fall fallback to SUMMER mode once the
          // schedule lands. Without this a slow/failed-then-retried load leaves My
          // Ledger showing fall 'eligible' (yellow) while the dashboard pacing —
          // which loaded the schedule fine — shows summer (green). That was the
          // Desk↔dashboard color discrepancy.
          if (typeof _paintDoNowReadiness === 'function') { try { _paintDoNowReadiness(); } catch (_) {} }
          try {
            var _wov = document.getElementById('app-wallet-overlay');
            if (_wov && _wov.style.display !== 'none' && typeof renderWallet === 'function') renderWallet();
          } catch (_) {}
        }
      })
      .catch(function () {});
  } catch (_) {}
}
try {
  document.addEventListener('DOMContentLoaded', _walletLoadSummerSchedule);
} catch (_) {}

// Render the compact Q1-Q4 grade outlook strip inside the Do Now card.
// Fire-and-forget; never throws. Hides the strip on any failure.
// Phase 6: also caches lessons[] for the per-day click-through modal.
// Paint the Do Now card with the SAME readiness color the My Ledger uses
// (red = behind … green = caught up, cyan = catching up — a combo of how long
// since the last session and how much work is done vs deadlines), and make the
// whole card a one-tap entry into My Ledger (its chips were removed). Idempotent.
// A click inside the Do Now card opens My Ledger UNLESS it landed on a genuinely
// interactive child (a real link / button / grade pill). The card itself is
// role="button", so closest() would match the CARD too — exclude it, or every
// click bails here and the card leads nowhere (the regression the s124 structural
// test missed because it never simulated a click).
function _donowOpensLedger(target, card) {
  if (!target || typeof target.closest !== 'function') return true;
  // The grade coach (button, facts, chat) lives in #donow-helper: reading or asking must not
  // yank the student into My Ledger (teacher 2026-09-26).
  var helper = target.closest('#donow-helper');
  if (helper && helper !== card) return false;
  var hit = target.closest('a,button,[role="button"],input,select');
  return !hit || hit === card;
}

function _paintDoNowReadiness() {
  try {
    var card = document.getElementById('donow-card');
    if (!card) return;
    if (!card._ledgerWired) {
      card._ledgerWired = true;
      card.style.cursor = 'pointer';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.title = 'Open My Ledger — your grade, pacing, and recorded work';
      card.addEventListener('click', function (e) {
        if (!_donowOpensLedger(e.target, card)) return;   // skip real interactive children
        if (typeof openWallet === 'function') openWallet();
      });
      card.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === card) {
          e.preventDefault();
          if (typeof openWallet === 'function') openWallet();
        }
      });
    }
    var rd = (typeof _walletDisplayReadiness === 'function') ? _walletDisplayReadiness() : null;
    if (rd && rd.state !== 'nodue' && typeof rd.hue === 'number') {
      card.style.background = 'hsl(' + rd.hue + ',60%,92%)';
      card.style.borderColor = 'hsl(' + rd.hue + ',65%,45%)';
      if (typeof _donowApplyZeroState === 'function') _donowApplyZeroState();   // an incoming 0 outranks the readiness hue
    } else {
      // No active readiness (signed out / nothing due) → let the state class show.
      card.style.background = '';
      card.style.borderColor = '';
    }
  } catch (_) {}
}

// OFFLINE_MODE_SPEC §4.B — write-through cache of the /grade payload so the Desk
// still shows progress (Do Now grade pills, calendar greying, My Gradebook) when
// offline. Keyed by the signed-in studentId; NEVER used in view-as (live-only
// there). Restore kicks in ONLY when the fetch is unreachable, never on an HTTP error.
function _gradeCacheKey() {
  try {
    if (typeof window !== 'undefined' && window.__VIEW_AS_STUDENT_ID__) return null;
    // Desk view-as (2026-06-25): live-only. Without this guard the cache key falls
    // back to the TEACHER's studentId, so a slow/offline /teacher/student/:id/grade
    // fetch would restore the TEACHER's cached grades while the banner says the
    // student — and the write-through would pollute the teacher's cache with the
    // student's data. Returning null = no write-through, no restore: grade numbers
    // stay blank ("—") until the impersonated student's LIVE data loads.
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return null;
    var sid = (window.rosterClient && typeof rosterClient.studentId === 'function') ? rosterClient.studentId() : null;
    return sid ? ('apstats_grade_cache_v1:' + sid) : null;
  } catch (_) { return null; }
}
// PROGRESS_RESET_FIX_SPEC D2 — envelope v2 carries the backend origin so a
// cache written against a DIFFERENT roster-server (e.g. a dev/staging URL,
// or a future backend migration) is never trusted as evidence for the
// current one. Key is unchanged (still identity-scoped + view-as-null).
function _persistGradeCache(data) {
  try {
    var k = _gradeCacheKey();
    if (k) localStorage.setItem(k, JSON.stringify({
      v: 2, origin: (window.ROSTER_SERVICE_URL || ''), savedAt: new Date().toISOString(), data: data
    }));
  } catch (_) { /* best-effort */ }
}
function _loadGradeCache() {
  try {
    var k = _gradeCacheKey();
    if (!k) return null;
    var o = JSON.parse(localStorage.getItem(k) || 'null');
    if (!o) return null;
    if (o.v === 2) {
      // Origin mismatch → reject as evidence, but never delete (Invariant 7):
      // a later success against the RIGHT origin will overwrite it naturally.
      if (o.origin !== (window.ROSTER_SERVICE_URL || '')) return null;
      return o.data || null;
    }
    // Legacy bare payload (no envelope version) — grandfathered once; the
    // next live success rewrites it as v2.
    return o.data || null;
  } catch (_) { return null; }
}

// PROGRESS_RESET_FIX_SPEC D3 — the durable server-completion latch. Written
// ONLY from a live successful /grade (never from a restored/derived
// payload), it survives a cold _gradeLessonsCache on this device so
// ledger-qualified completion (Cws>=60 with no worksheet DESK_DONE row —
// the normal pattern) is never mistaken for "no work done". Mirrors
// _gradeCacheKey's view-as/signed-out guards exactly, with its own prefix.
function _serverCompleteKey() {
  try {
    if (typeof window !== 'undefined' && window.__VIEW_AS_STUDENT_ID__) return null;
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return null;
    var sid = (window.rosterClient && typeof rosterClient.studentId === 'function') ? rosterClient.studentId() : null;
    return sid ? ('apstats_server_complete_v1:' + sid) : null;
  } catch (_) { return null; }
}
function _persistServerComplete(obj) {
  try { var k = _serverCompleteKey(); if (k) localStorage.setItem(k, JSON.stringify(obj)); } catch (_) { /* best-effort */ }
}
// Monotonic: only ever ADDS a true flag, never clears one. Called only from
// renderDoNowGrades's live-success branch. Never throws.
function _latchServerComplete(lessons) {
  try {
    var k = _serverCompleteKey();
    if (!k || !Array.isArray(lessons)) return;
    var origin = window.ROSTER_SERVICE_URL || '';
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { stored = null; }
    var obj = (stored && stored.v === 1 && stored.origin === origin)
      ? stored
      : { v: 1, origin: origin, updatedAt: null, topics: {} }; // fresh start on version/origin mismatch
    if (!obj.topics || typeof obj.topics !== 'object') obj.topics = {};
    var wsGate = (typeof DESK_WORKSHEET_DONE_THRESHOLD === 'number') ? DESK_WORKSHEET_DONE_THRESHOLD : 60;
    for (var i = 0; i < lessons.length; i++) {
      var L = lessons[i];
      if (!L || !L.lessonKey) continue;
      var t = obj.topics[L.lessonKey] || {};
      if (typeof L.Cws === 'number' && L.Cws >= wsGate) t.ws = true;
      if (typeof L.blooket === 'number' && L.blooket >= 80) t.bl = true;
      obj.topics[L.lessonKey] = t;
    }
    obj.updatedAt = new Date().toISOString();
    _persistServerComplete(obj);
  } catch (_) { /* fail-safe: a latch write never blocks the render */ }
}
// { ws:bool, bl:bool } — false/false on no key / no stored obj / wrong
// version / wrong origin (fail CLOSED as evidence — never invents credit,
// and never deletes the stored blob on a mismatch).
function _serverCompleteFor(topic) {
  try {
    var k = _serverCompleteKey();
    if (!k || !topic) return { ws: false, bl: false };
    var o = JSON.parse(localStorage.getItem(k) || 'null');
    if (!o || o.v !== 1 || o.origin !== (window.ROSTER_SERVICE_URL || '')) return { ws: false, bl: false };
    var t = (o.topics && o.topics[topic]) || {};
    return { ws: !!t.ws, bl: !!t.bl };
  } catch (_) { return { ws: false, bl: false }; }
}
// True once the server has affirmatively spoken THIS device: either the
// in-memory /grade cache is warm this load, or the durable latch has at
// least one topic for the current student. Drives D4's fail-open gate.
function _serverEvidencePresent() {
  try {
    if (Array.isArray(_gradeLessonsCache)) return true;
    var k = _serverCompleteKey();
    if (!k) return false;
    var o = JSON.parse(localStorage.getItem(k) || 'null');
    if (!o || o.v !== 1 || o.origin !== (window.ROSTER_SERVICE_URL || '')) return false;
    return !!(o.topics && Object.keys(o.topics).length > 0);
  } catch (_) { return false; }
}
