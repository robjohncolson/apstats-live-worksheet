/* ═══ CALENDAR APP ═══ */
let cP="B";
function setP(p){
    MacSFX.play('click', 0.3);
    cP=p;
    const a=document.getElementById("btn-b"),b=document.getElementById("btn-e");
    if(a){
        a.classList.toggle("s7btn-inv",p==="B");
        a.classList.toggle("s7btn-default",p==="B");
    }
    if(b){
        b.classList.toggle("s7btn-inv",p==="E");
        b.classList.toggle("s7btn-default",p==="E");
    }
    updateViewMenu();
    rCal();rProg();
    var pu=new URL(window.location);pu.searchParams.set('period',p);history.replaceState(null,'',pu);
    loadSupabaseOverlay(p).then(function(){rCal();rProg();});
}
function tdy(){
    // "Today" as a local-midnight Date for the SCHOOL timezone (America/New_York),
    // matching the server's todayInTz so the student-visible due-set agrees with the
    // server's. For an Eastern user this equals plain local midnight (a no-op); it
    // only differs for a student in another timezone near midnight. Falls back to
    // local time if Intl is unavailable.
    var n=new Date();
    try{
        var p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(n);
        var y=+(p.find(function(x){return x.type==='year';})||{}).value;
        var m=+(p.find(function(x){return x.type==='month';})||{}).value;
        var d=+(p.find(function(x){return x.type==='day';})||{}).value;
        if(y&&m&&d)return new Date(y,m-1,d);
    }catch(_){}
    return new Date(n.getFullYear(),n.getMonth(),n.getDate());
}
function eq(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
// cls() / htm() map a day's schedule entry `i` to its CSS class + inner HTML.
// `i` is either a string SENTINEL — OFF (no school), EX (AP exam), PO (post-exam),
// NC / falsy (no class that weekday) — or a lesson object from d(): { t, n, u, due, as, db }
// where i.kind ∈ {pc, poster, orientation, baseline} selects a special tile and
// i.t===R marks a Review day. Anything else is a normal unit lesson (cell-u{u}).
function cls(i){
    if(i===OFF)return"cell-off";
    if(i===EX)return"cell-exam";
    if(i===PO)return"cell-post";
    if(i===NC||!i)return"cell-noclass";
    if(i.kind==='pc')return"cell-pc";
    if(i.kind==='work')return"cell-work";
    if(i.kind==='break')return"cell-break";
    if(i.kind==='poster')return"cell-poster";
    if(i.kind==='orientation')return"cell-orient";
    if(i.kind==='baseline')return"cell-baseline";
    if(i.t===R)return"cell-rev";
    if(typeof cYear==='undefined'||cYear==='SY26-27'){
        i.ced=i.group?groupLabel(i):cedLabel(i.t);
        return"cell-"+cedUnitClass(i.group?groupTopics(i)[0]:i.t);
    }
    return"cell-u"+i.u;
}
function htm(i,ds){
    if(i&&i.kind==='work')return `<div class="dn">${ds}</div><div class="tl">Work Day</div>`;
    if(i&&i.kind==='break')return `<div class="dn">${ds}</div><div class="tl">Break Day</div>`;
    if(i===OFF)return`<div class="dn">${ds}</div><div class="tl"></div>`;
    if(i===EX)return`<div class="dn">${ds}</div><div class="tl">AP EXAM</div>`;
    if(i===PO)return`<div class="dn">${ds}</div><div class="tl">Done!</div>`;
    if(i===NC||!i)return`<div class="dn" style="opacity:.4">${ds}</div>`;
    if(i.kind==='pc'&&i.part==='A')return`<div class="dn">${ds}</div><div class="tl">U${i.u} MCQ A</div><div class="tt">Progress Check · Part A</div>`;
    if(i.kind==='pc')return`<div class="dn">${ds}</div><div class="tl">U${i.u} PC ${i.admin||1}/2</div><div class="tt">Progress Check</div>`;
    if(i.kind==='poster')return`<div class="dn">${ds}</div><div class="tl">U${i.u} Poster${i.admin?' '+i.admin+'/2':''}</div><div class="tt">${i.admin===2?'Finish + gallery walk':'Gallery walk'}</div>`;
    if(i.kind==='orientation')return`<div class="dn">${ds}</div><div class="tl">Start Here</div><div class="tt">How grades &amp; makeups work</div>`;
    if(i.kind==='baseline')return`<div class="dn">${ds}</div><div class="tl">U${i.u} Baseline</div><div class="tt">No stakes — best score kept</div>`;
    if(i.t===R)return`<div class="dn">${ds}</div><div class="tl">Review</div><div class="tt">${i.n}</div>`;
    const doubleBadge=i.db?'<span class="dbl">2x</span>':'';
    if(typeof cYear==='undefined'||cYear==='SY26-27'){
        i.ced=i.group?groupLabel(i):cedLabel(i.t);
        return`<div class="dn">${ds}</div><div class="tl">${_resourcePanelEsc(i.ced.text)}</div>`+doubleBadge;
    }
    return`<div class="dn">${ds}</div><div class="tl">${i.t}</div><div class="tt">${i.n}</div>`+doubleBadge;
}
// cellAria(i, ds) — flat, emoji-free aria-label text for a calendar cell, built
// from the SAME fields the hover tooltip (sTip) shows, so a screen-reader student
// gets the date / topic / due-date / status that sighted users get on hover.
// rCal appends state suffixes (next up / completed / locked) where it knows them.
function cellAria(i, ds){
    if(i&&i.kind==='work')return ds + ', Work Day — catch up on follow-alongs, flashcards, quiz retakes, and exit tickets (bonus)';
    if(i&&i.kind==='break')return ds + ', Break Day — nothing due, no new topic';
    if(i===OFF) return ds + ', no school';
    if(i===EX) return ds + ', AP Statistics Exam';
    if(i===PO) return ds + ', post-exam';
    if(i===NC || !i) return ds;
    if(i.kind==='pc'&&i.part==='A') return ds + ', Unit ' + i.u + ' MCQ Part A';
    if(i.kind==='pc') return ds + ', Unit ' + i.u + ' Progress Check ' + (i.admin||1) + ' of 2';
    if(i.kind==='poster') return ds + ', Unit ' + i.u + ' Poster' + (i.admin ? ' day ' + i.admin + ' of 2' : '') + ' gallery walk';
    if(i.kind==='orientation') return ds + ', Start Here — how grades and makeups work';
    if(i.kind==='baseline') return ds + ', Unit ' + i.u + ' Baseline — no stakes, best score kept';
    const newLabels = typeof cYear==='undefined'||cYear==='SY26-27';
    let label = (i.t===R) ? ('Review: ' + (i.n||'')) : (i.t + ' ' + (i.n||''));
    if(newLabels&&i.t!==R){i.ced=i.group?groupLabel(i):cedLabel(i.t);label=i.ced.text;}
    let parts = [ds, label.trim()];
    if(i.due) parts.push('due ' + (newLabels ? cedDisplayText(i.due) : i.due));
    if(i.db) parts.push('double topic day');
    // Resource readiness — mirror sTip's status line when the registry has the topic.
    try {
        if(typeof getRegistryEntry==='function' && i.t){
            const keys=i.group?groupTopics(i):[i.t];
            for(const key of keys){const re=getRegistryEntry(key);if(re&&re.status)parts.push('status '+re.status);}
        }
    } catch(_) {}
    return parts.join('. ');
}
// Calendar page navigation -- the prev/next arrows above the calendar grid
// bump _calPageOffset by CAL_FOCUS_WEEKS weeks (2). rCal() applies the
// offset on top of today's anchor and clamps absolutely, so calStep() can
// never scroll past either edge of the school year. Reloads reset to 0.
let _calPageOffset = 0;
let _calStepWeeks = 2;   // last rendered window size; rCal publishes it so paging steps by the visible width
// Set by the Today button. A student who is behind normally opens on the overdue next-up
// week; once they press Today, the window anchors on the current week instead (teacher
// 2026-10-02: "Today should always just go to the current date"). Reloads reset it.
let _calOnToday = false;
function calStep(dir) {
  _calPageOffset += dir * _calStepWeeks;
  rCal();
}
// "Today" button: jump the view to the week holding today's date.
function calToday() {
  _calPageOffset = 0;
  _calOnToday = true;
  rCal();
}
// ── ☀️ Summer-prep weeks (woven into the calendar grid) ─────────────────────
// During summer prep (today < firstDayOfSchool) the calendar shows the summer
// schedule (data/summer-schedule.json: Unit 1, weekly due dates → Sept 1) as
// real Mon–Fri week rows AHEAD of the school-year weeks, amber-shaded. rCal
// prepends these to its week list, so the focus window, nav arrows, today
// highlight, and completion overlays all work on them natively — no separate
// agenda. Returns [] once school starts or the schedule isn't loaded.
function _ymdISO(dt) {
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
function _parseISODate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  var p = iso.split('-');
  if (p.length !== 3) return null;
  var y = +p[0], m = +p[1], dd = +p[2];
  if (!y || !m || !dd) return null;
  return new Date(y, m - 1, dd);
}
function _mondayOf(dt) {
  var x = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  var dw = x.getDay();                          // 0=Sun … 6=Sat
  x.setDate(x.getDate() + (dw === 0 ? -6 : 1 - dw));   // back up to Monday
  return x;
}
function _summerWeeks() {
  var sch = window._summerSchedule;
  if (!sch || !Array.isArray(sch.lessons) || !sch.firstDayOfSchool) return [];
  var t = tdy();
  var schoolStart = _parseISODate(sch.firstDayOfSchool);
  if (!schoolStart || t >= schoolStart) return [];          // summer's over → grid is school-year only
  // Reuse the school-year lesson NAMES (the same Unit-1 topics appear in the
  // fall S), so summer cells show real titles + tooltips for free.
  var nameByTopic = {};
  for (var si = 0; si < S.length; si++) {
    var row = S[si] || [];
    [row[3], row[4]].flatMap(function(inf){return inf&&inf.group?inf.group:[inf];}).forEach(function (inf) {
      // Summer Foundations view: strip the school-year "→ new topic" CED arrow so
      // summer cells read plainly (e.g. "1.10 · The Normal Distribution"), since the
      // summer packet is foundations, not a CED unit. School-year tiles keep the tag.
      if (inf && typeof inf === 'object' && inf.t && inf.n && !(inf.t in nameByTopic)) nameByTopic[inf.t] = String(inf.n).replace(/^(\d+\.\d+) → \d+\.\d+ · /, '$1 · ');
    });
  }
  var byDate = {};
  for (var li = 0; li < sch.lessons.length; li++) {
    var L = sch.lessons[li] || {};
    if (!L.due) continue;
    byDate[L.due] = d(L.topic, nameByTopic[L.topic] || ('Unit ' + (sch.unit || 1) + ' lesson'), sch.unit || 1, L.due, '', false);
  }
  var startD = _parseISODate(sch.startDate) || t;
  var anchor = (t < startD) ? t : startD;                   // include today even if before the official start
  var cutoffMon = _mondayOf(schoolStart);                   // first school-year week's Monday — stop before it
  var weeks = [];
  for (var mon = _mondayOf(anchor); mon < cutoffMon; mon.setDate(mon.getDate() + 7)) {
    var weekMon = new Date(mon);
    var days = [];
    for (var dw = 0; dw < 5; dw++) {                         // Mon..Fri
      var day = new Date(weekMon); day.setDate(weekMon.getDate() + dw);
      var inf = byDate[_ymdISO(day)] || NC;
      days.push([day.getFullYear(), day.getMonth(), day.getDate(), inf, inf]);
    }
    weeks.push({ m: weekMon, d: days, _summer: true });
  }
  return weeks;
}

// Day-2 "Baseline Check" framing dialog. PCs are taken in AP Classroom (not
// launched from the Desk), so this tile explains the no-stakes baseline rather
// than opening a resource panel: take it early, only the best score is kept,
// retake until the quarter closes — it can only ever raise the grade.
function _openBaselineInfo() {
  if (typeof showDialog !== 'function') return;
  showDialog('📊',
    '<b>Unit 1 Baseline Check — your starting line.</b><br><br>'
    + 'Take the Unit 1 Progress Check now, before we’ve even covered the unit. '
    + 'It does <b>not</b> count against you: only your <b>best</b> Progress-Check '
    + 'score is ever kept, and you can retake it anytime until the quarter closes. '
    + 'Bomb it or ace it — either way it just shows us where to begin.',
    'Got it');
}

function rCal(){
    const t=tdy(),g=document.getElementById("cg");if(!g)return;
    const _frag=document.createDocumentFragment();
    // ── 1. Build Mon-anchored week rows from the flat schedule S ──
    // S is chronological day entries [year, month, day, infB, infE]. Group them
    // into weeks; `weekMonday` is the row's "Week of" label. The first week may
    // not start on a Monday, so back-compute its Monday from the first weekday.
    let W = [], currentWeek = [], weekMonday = null;
    for (const e of S) {
        const dt = new Date(e[0], e[1], e[2]);
        const dow = dt.getDay();                          // 0=Sun … 6=Sat
        if (dow === 1 && currentWeek.length) {            // a new Monday closes the prior week
            W.push({ m: weekMonday, d: currentWeek });
            currentWeek = [];
        }
        if (dow === 1) weekMonday = dt;
        if (!weekMonday) {                                // first entry isn't a Monday → derive it
            const _daysSinceMonday = (dow + 6) % 7;       // Mon→0, Tue→1 … Sun→6
            const md = new Date(dt);
            md.setDate(dt.getDate() - _daysSinceMonday);
            weekMonday = md;
        }
        currentWeek.push(e);
    }
    if (currentWeek.length) W.push({ m: weekMonday, d: currentWeek });
    // Today's lesson must survive paging away from today's week.
    _todayLessonInf=null;_todayLessonDS='';
    for(const row of S){
      if(!eq(new Date(row[0],row[1],row[2]),t))continue;
      const todayCell=cP==='B'?row[3]:row[4];
      if(todayCell&&typeof todayCell==='object'){
        _todayLessonInf=todayCell;_todayLessonDS=MN[row[1]]+' '+row[2];
      }
    }
    if(typeof _renderTodayTopics==='function')_renderTodayTopics();
    // ── 2. Weave the summer-prep weeks in FRONT of the school-year weeks ──
    // ☀️ Weave the summer-prep weeks in FRONT of the school-year weeks during
    // summer (today < firstDayOfSchool). They're real week rows, so the focus
    // window, nav arrows, today highlight, and completion overlays below all
    // operate on them; the amber .wk-summer shading keeps the two tracks distinct.
    var _sumW = (typeof _summerWeeks === 'function') ? _summerWeeks() : [];
    if (_sumW.length) W = _sumW.concat(W);
    // NB: Unit-1 topics now appear TWICE in W (summer rows + fall rows). All
    // overlays (cal-current, dc-localdone, status dot, the gate) are topic-keyed,
    // so the two cells mirror each other; the 2-week focus window never co-shows
    // a summer cell and its fall twin, so the duplication is cosmetic + consistent.
    // CALENDAR_COMPACT -- always show a focus window (this week + the next)
    // instead of every week of the school year. Without this the calendar
    // spills past every panel below it and buries the Live Classroom board.
    // Clamped at edges: pre-school -> first weeks; post-school -> last weeks.
    // The nav arrows above the calendar bump _calPageOffset (in weeks);
    // _displayStart is then today's anchor + that offset, clamped absolutely,
    // so the arrows cannot run past either end of the school year.
    // ── 3. Resolve next-up (fall + summer) BEFORE sizing — the window is sized to REACH it ──
    const _gateMarks = getStudentMarks();
    const _nextUpTopic = calNextUpTopic(_orderedPeriodTopics(), _gateMarks);                          // FALL (combined topics)
    const _summerNextUp = _sumW.length ? calNextUpTopic(_orderedSummerTopics(), _gateMarks) : null;   // SUMMER (individual)
    // The highlighted cell + the Do Now message track the SUMMER next-up during summer (a
    // fall combined topic like "1.2+1.3" never matches a summer cell), else the fall next-up.
    _calNextUp = (_sumW.length && _summerNextUp) ? _summerNextUp : _nextUpTopic;
    // WINDOW sizing uses the summer track during summer ONLY — a fall next-up must never
    // yank the summer view forward to September (e.g. after a full summer head-start).
    const _winNextUp = _sumW.length ? _summerNextUp : _nextUpTopic;
    function _wkIdxForTopic(topic, wantSummer) {
        if (!topic) return -1;
        for (var wi = 0; wi < W.length; wi++) {
            var _wkr = W[wi];
            if (!!_wkr._summer !== !!wantSummer) continue;     // only scan the right track
            for (var di = 0; di < _wkr.d.length; di++) {
                var inf2 = (cP === 'B') ? _wkr.d[di][3] : _wkr.d[di][4];
                if (inf2 && typeof inf2 === 'object' && (inf2.t === topic || (inf2.group&&groupTopics(inf2).includes(topic)))) return wi;
            }
        }
        return -1;
    }
    const _nextUpWk = _winNextUp ? _wkIdxForTopic(_winNextUp, !!_sumW.length) : -1;
    // ── 3b. Compact to a DYNAMIC focus window: today's week THROUGH the next-up week,
    //        clamped [CAL_MIN_WEEKS, CAL_MAX_WEEKS]. Weekly summer cadence → ~1-3 weeks,
    //        no empty trailing weeks; a next-up beyond the cap stays reachable by the arrows.
    let CAL_FOCUS_WEEKS = 2;
    // 2026-08-19 (screen-size aware): on short viewports (Chromebook at 125%
    // zoom ≈ 525 CSS px tall) a 4-week window pushes the next-up row below the
    // fold — cap at 2 weeks there; the arrows still reach everything. Re-rendered
    // on resize (debounced) below.
    const _calShort = (typeof window !== 'undefined' && window.innerHeight && window.innerHeight < 600);
    const CAL_MIN_WEEKS = 1, CAL_MAX_WEEKS = _calShort ? 2 : 4;
    const _origLen = W.length;
    let _displayStart = 0;
    let _calShowsToday = true;   // false while the window is anchored on an overdue next-up week
    if (_origLen > CAL_FOCUS_WEEKS) {
        // Find the week containing today. -1 = today is on a non-school day
        // (weekend / holiday) or outside the school year entirely; both are
        // handled by the date-based fallback below.
        let _todayWk = -1;
        for (let i = 0; i < _origLen; i++) {
            if (W[i].d.some(function (en) {
                return eq(new Date(en[0], en[1], en[2]), t);
            })) { _todayWk = i; break; }
        }
        // Weekend / holiday: the day-cell scan above only matches Mon-Fri, so a
        // Sat/Sun (or an off day) is never found and _todayWk stays -1. Bracket
        // today by each week's Mon..Mon+6 span so the CURRENT week still anchors
        // the window — otherwise a summer (or school-year) weekend would fall to
        // the end-clamp and jump the calendar months ahead. W's weeks are
        // contiguous, non-overlapping, and Monday-aligned (summer + school-year),
        // so the bracket test is unambiguous.
        if (_todayWk < 0) {
            for (let i = 0; i < _origLen; i++) {
                const _wm = W[i].m;
                const _we = new Date(_wm.getFullYear(), _wm.getMonth(), _wm.getDate() + 6);
                if (t >= _wm && t <= _we) { _todayWk = i; break; }
            }
        }
        // DYNAMIC SIZE (req 3): grow the window to SPAN today's week through the
        // next-up week (so the next lesson is always visible), clamped [MIN, MAX].
        // AHEAD: anchor stays today, size reaches forward (no far re-anchor → paging
        // never dead-ends; a next-up past MAX is reachable by the arrows). BEHIND
        // (overdue): anchor on the next-up week and span forward to today.
        var _anchorWk = (_todayWk >= 0) ? _todayWk : ((t < W[0].m) ? 0 : _origLen - CAL_FOCUS_WEEKS);
        var _winAnchor = -1;
        if (_nextUpWk >= 0) {
            if (_nextUpWk >= _anchorWk) {
                CAL_FOCUS_WEEKS = Math.min(CAL_MAX_WEEKS, Math.max(CAL_MIN_WEEKS, _nextUpWk - _anchorWk + 1));
            } else if (!_calOnToday) {
                _winAnchor = _nextUpWk;
                CAL_FOCUS_WEEKS = Math.min(CAL_MAX_WEEKS, Math.max(CAL_MIN_WEEKS, _anchorWk - _nextUpWk + 1));
            }
        }
        _calShowsToday = _winAnchor < 0;
        CAL_FOCUS_WEEKS = Math.min(CAL_FOCUS_WEEKS, _origLen);   // never exceed the array
        // In-school: anchor at today's week (or, when behind, the overdue next-up week).
        // Pre/post: clamp to either end. _calPageOffset (the nav arrows) shifts the window;
        // the Math.max/Math.min guard snaps the start so it always has CAL_FOCUS_WEEKS rows.
        const _todayAnchor = (_winAnchor >= 0) ? _winAnchor : (_todayWk >= 0) ? _todayWk : ((t < W[0].m) ? 0 : _origLen - CAL_FOCUS_WEEKS);
        _displayStart = _todayAnchor + _calPageOffset;
        _displayStart = Math.max(0, Math.min(_displayStart, _origLen - CAL_FOCUS_WEEKS));
        W = W.slice(_displayStart, _displayStart + CAL_FOCUS_WEEKS);
    }
    _calStepWeeks = CAL_FOCUS_WEEKS;   // page by the visible width (Part G), published every render
    // Sequential lesson gate state (LESSON_GATE_BUILD.md §4 + §8): each lesson gates on
    // its canonical topic-predecessor (_prevTopicInSequence), window-independent +
    // cross-portion. (_gateMarks + _nextUpTopic + _summerNextUp + _calNextUp are computed
    // in section 3 above, before sizing, so the window can be sized to reach the next-up.)
    const _gateSignedIn = !!getStudentEmail();
    // Suppress the STUDENT progress overlay (greying + ◐/✓ glyph) for a TEACHER viewing as
    // themselves — their marks come from browsing the lessons, so "in progress" was noise.
    // Preview-as-student (where _deskIsTeacher() returns false) + real students keep it.
    const _suppressProgress = (typeof _deskIsTeacher === 'function') && _deskIsTeacher();
    let _lastQ = 0; // Thread 2 -- the quarter band already emitted
    // ── 5. Render the week rows + day cells ──
    for(const wk of W){
        const r=document.createElement("div");r.className="wk-row"+(wk._summer?" wk-summer":"");
        const l=document.createElement("div");l.className="wk-lbl";
        l.textContent=MN[wk.m.getMonth()]+" "+wk.m.getDate();r.appendChild(l);
        const dm={};for(const e of wk.d){const dt=new Date(e[0],e[1],e[2]);dm[dt.getDay()]=e;}
        // Thread 2 + F2 -- emit a quarter-band divider when the quarter
        // changes. F2: the quarter is date-driven (the week's Monday vs
        // grade-config's windows), matching the date-driven grade math --
        // no longer the week's unit band. Label keeps the unit list.
        const _wkQ=quarterOfDate(wk.m);
        if(_wkQ&&_wkQ!==_lastQ&&!wk._summer){const _qb=document.createElement("div");_qb.className="cal-qband";_qb.textContent="Quarter "+_wkQ+"  ("+QUARTER_BAND_LABEL["Q"+_wkQ]+")";_frag.appendChild(_qb);_lastQ=_wkQ;}
        for(let dw=1;dw<=5;dw++){
            const c=document.createElement("div");c.className="dc";
            const en=dm[dw];if(!en){c.classList.add("cell-noclass");r.appendChild(c);continue;}
            const dt=new Date(en[0],en[1],en[2]),ds=MN[dt.getMonth()]+" "+dt.getDate();
            const inf=cP==="B"?en[3]:en[4];
            c.classList.add(cls(inf));c.innerHTML=htm(inf,ds);
            if(eq(dt,t)){
              c.classList.add("cell-today");
              // v1c: stash today's lesson so _focusTodayLessonVideo opens its
              // resource panel directly (no synthetic cell click -- that would
              // re-enter the lock-dialog / Do-Now-bump guards).
              if(typeof inf==='object'&&inf.t){_todayLessonInf=inf;_todayLessonDS=ds;}
            }
            if(dt<t&&!eq(dt,t))c.classList.add("cell-past");
            if (typeof inf === 'object' && inf.t) {
              c.dataset.topic = inf.t; c.dataset.dts = +dt; // DN3b — completion overlay hooks
              if (wk._summer) c.dataset.summer = '1';        // gate dispatch: summer cells use the individual summer sequence
              // (Removed s14: the registry "readiness" status-dot was teacher-facing
              // material-tracking — it marked most lessons "partial" and now contradicts
              // the student-facing done / in-progress glyphs. The student progress signal
              // below (localLessonState) is the single source of truth on a cell.)
              // CALENDAR_FOCUS -- recede colour from the STUDENT's own completion
              // marks (apstats_desk_marks_, read once into _gateMarks), NOT the
              // REGISTRY readiness above. This reflects the signed-in student --
              // or, in Preview-as-student, the teacher -- so a done lesson greys.
              // For a TEACHER viewing as themselves, drop only the 'partial' (browsing-visit
              // noise the teacher flagged) — but KEEP 'done': a teacher's REAL completions
              // should still grey + show ✓ (they finished it). Students keep both.
              let _localState = localLessonState(inf.t, _gateMarks);
              if (_suppressProgress && _localState === 'partial') _localState = '';
              if (_localState) {
                c.classList.add(_localState === 'done' ? 'dc-localdone' : 'dc-localpartial');
              }
              // CALENDAR_FOCUS -- the synthwave next-up cell, computed once above
              // via calNextUpTopic (first not-locally-done real lesson; review /
              // off / exam cells excluded). rCal owns .cal-current; paintDonowCells
              // no longer touches it.
              if (inf.t === _nextUpTopic) {
                c.classList.add('cal-current');
              } else if (wk._summer && _summerNextUp && inf.t === _summerNextUp) {
                // SUMMER twin: the next individual summer lesson (the fall _nextUpTopic
                // is a combined topic that can never === a summer cell's inf.t).
                c.classList.add('cal-current');
              }
            }
            c.onmouseenter=(ev)=>sTip(ev,dt,inf,ds);c.onmouseleave=hTip;c.onmousemove=mTip;
            // v2.1 U4 -- poll archive indicator: a small purple dot on days
            // that have archived polls. Click opens the result screen on the
            // classroom board. stopPropagation() prevents opening the resource panel.
            (function(cellDt, cellC) {
              // YYYY-MM-DD key for the _pollArchive lookup (same shape as _ymdISO).
              var _y = cellDt.getFullYear();
              var _m = String(cellDt.getMonth() + 1).padStart(2, '0');
              var _d = String(cellDt.getDate()).padStart(2, '0');
              var _dateKey = _y + '-' + _m + '-' + _d;
              var _dayPolls = _pollArchive[_dateKey];
              if (_dayPolls && _dayPolls.length) {
                cellC.style.position = 'relative';
                var _dot = document.createElement('span');
                _dot.className = 'poll-dot';
                _dot.title = _dayPolls.length + ' poll' + (_dayPolls.length > 1 ? 's' : '');
                _dot.addEventListener('click', function(ev) {
                  ev.stopPropagation();
                  try {
                    if (_classroomBoardHandle &&
                        typeof _classroomBoardHandle.showResultScreen === 'function') {
                      _classroomBoardHandle.showResultScreen(_dayPolls);
                    }
                  } catch (_) {}
                  try {
                    var _mount = document.getElementById('classroom-board-mount');
                    if (_mount) _mount.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  } catch (_) {}
                });
                cellC.appendChild(_dot);
              }
            }(dt, c));
            if(inf&&inf!==OFF&&inf!==NC&&inf!==EX&&inf!==PO&&inf.t){
                c.style.cursor='pointer';
                // Sequential lesson gate: only real lesson cells (dot-form
                // topic) are gated; Review / other cells stay click-through.
                const _isLessonCell = (typeof inf === 'object' && /^\d+\.\d+/.test(inf.t));
                // Gate on the canonical topic-predecessor (window-independent +
                // cross-portion), NOT the previous calendar cell — see §8. Summer
                // cells carry individual topics, fall cells combined ("1.2+1.3"),
                // so each dispatches to its own ordered sequence.
                const _prevTopic = !_isLessonCell ? null
                  : (wk._summer ? _prevSummerTopic(inf.t) : _prevTopicInSequence(inf.t));
                if (_isLessonCell && !_isLessonUnlocked(inf.t, dt, _prevTopic, t, _gateMarks, _gateSignedIn)) {
                    const _lockTopic = inf.t, _lockPrev = _prevTopic, _lockDs = ds;
                    c.classList.add('cell-locked');
                    c.insertAdjacentHTML('beforeend', '<span class="cell-lock">🔒</span>');
                    c.onclick=()=>{hTip();_showLessonLockedDialog(_lockTopic,_lockPrev,_lockDs);};
                } else if (inf.kind === 'orientation') {
                    // Day-1 welcome → the "how grades & makeups work" explainer.
                    c.onclick=()=>{hTip();if(typeof openGradeHelp==='function')openGradeHelp();};
                } else if (inf.kind === 'baseline') {
                    // Day-2 baseline → a no-stakes framing dialog. (PCs are taken in
                    // AP Classroom, not launched from the Desk — so this explains the
                    // baseline rather than opening an empty resource panel.)
                    c.onclick=()=>{hTip();if(typeof _openBaselineInfo==='function')_openBaselineInfo();};
                } else {
                    c.onclick=()=>{hTip();maybeBumpThenOpen(inf,ds);};
                }
                c.ondblclick=(ev)=>{ev.preventDefault();ev.stopPropagation();hTip();if(typeof openDayGrade==='function')openDayGrade(ds);};
                c.oncontextmenu=(ev)=>{ev.preventDefault();ev.stopPropagation();hTip();if(typeof openDayGrade==='function')openDayGrade(ds);};
            }
            // a11y: a flat aria-label (from the same fields the tooltip shows) plus a
            // state suffix; every interactive cell becomes a keyboard-focusable
            // role=button that reuses the onclick rCal already assigned (so the lock
            // and Do-Now guards are honored). Non-interactive cells stay inert.
            let _aria = cellAria(inf, ds);
            if (c.classList.contains('cal-current')) { _aria += ' (next up)'; c.setAttribute('aria-current', 'step'); }
            else if (c.classList.contains('dc-localdone') || c.classList.contains('dc-done')) { _aria += ' (completed)'; }
            if (c.classList.contains('cell-locked')) { _aria += ' (locked — finish the previous lesson first)'; }
            c.setAttribute('aria-label', _aria);
            if (c.onclick) {
                c.setAttribute('role', 'button');
                c.tabIndex = 0;
                c.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') { ev.preventDefault(); c.click(); }
                });
            }
            r.appendChild(c);
        }_frag.appendChild(r);
    }
    g.replaceChildren(_frag);
    window.DeskState = Object.assign(window.DeskState || {}, { nextUpTopic: _nextUpTopic, todayLessonInf: _todayLessonInf, gateMarks: _gateMarks }); // read by pico-home.js (PICO_DESK_SPEC Phase 1)
    // CALENDAR_NAV -- show/hide the prev/next arrow buttons above the grid.
    // _displayStart is the absolute clamped start of the displayed window
    // (set in the compaction block above), so the edges read directly from
    // it. visibility:hidden via .cal-nav-hidden preserves the corner slot so
    // the other arrow stays in place at an edge page.
    // ── 6. Toggle the prev/next nav arrows at the window edges ──
    const _np = document.getElementById('cal-prev');
    const _nn = document.getElementById('cal-next');
    if (_np) _np.classList.toggle('cal-nav-hidden', _displayStart <= 0);
    if (_nn) _nn.classList.toggle('cal-nav-hidden', _displayStart + CAL_FOCUS_WEEKS >= _origLen);
    // Today button: dim + disable only when the window really starts on today's week.
    const _nt = document.getElementById('cal-today');
    if (_nt) _nt.classList.toggle('cal-today-off', _calPageOffset === 0 && _calShowsToday);
    // a11y: announce the visible window to screen readers (also fires on calStep paging).
    const _sr = document.getElementById('cal-sr');
    if (_sr && W.length) {
        const _wf = W[0].m, _wl = W[W.length - 1].m;
        _sr.textContent = 'Calendar showing ' + MN[_wf.getMonth()] + ' ' + _wf.getDate()
            + ' to ' + MN[_wl.getMonth()] + ' ' + _wl.getDate();
    }
    paintDonowCells(); // DN3b — overlay completion state onto the fresh grid
    if (typeof _paintZeroCells === 'function') _paintZeroCells(); // missing-work corner marks survive the rebuild
}
function rCD(){
    const t=tdy(),ms=864e5,dte=Math.max(0,Math.ceil((EX_DT-t)/ms));
    let sd=0;for(const e of S){const dt=new Date(e[0],e[1],e[2]);if(dt>t&&dt<=EX_DT&&e[3]!==OFF&&e[3]!==PO)sd++;}
    document.querySelector("#cd-today .num").textContent=MN[t.getMonth()]+" "+t.getDate();
    document.querySelector("#cd-days .num").textContent=dte;
    document.querySelector("#cd-school .num").textContent=sd;
    document.getElementById("ft").textContent=sd+" School Days Remaining";
    // DN3c / D5: one school-year calendar — always the exam countdown
    // (no summer "School Starts" special-casing).
    const exN=document.querySelector("#cd-exam .num"); if(exN) exN.textContent=MN[EX_DT.getMonth()]+" "+EX_DT.getDate();
    const exL=document.querySelector("#cd-exam .lbl"); if(exL) exL.textContent='Exam Day';
    const dL=document.querySelector("#cd-days .lbl"); if(dL) dL.textContent='Days to Exam';
}
// Pure pace math (#13) — count DONE vs EXPECTED-by-today over the deduped DOT-LESSON
// universe ONLY. `topics` (from _orderedPeriodTopics) also carries PC/poster/Welcome/
// baseline specials, which would inflate the denominator — so dot-filter + dedup both
// the done set AND the expected set, keeping done/total/expected over one apples-to-apples
// universe (the real lessons the calendar greys). Pure + side-effect-free → unit-testable.
function _computePace(topics, marks, sCells, todayTs, period){
    const isLesson = function(t){ return typeof t === 'string' && /^\d+\.\d+/.test(t); };
    const seen = {}, lessons = [];
    for(const day of (topics||[])){
      for(const tp of (typeof groupTopics==='function'?groupTopics(day):[day])){
        if(isLesson(tp)&&!seen[tp]){seen[tp]=1;lessons.push(tp);}
      }
    }
    let done = 0;
    for(const tp of lessons){ if(localLessonState(tp, marks)==='done') done++; }
    const seenE = {}; let expected = 0;
    for(const e of (sCells||[])){ const inf = period==='B' ? e[3] : e[4];
        if(!inf||typeof inf!=='object')continue;
        for(const tp of (inf.group?groupTopics(inf):[inf.t])){
          if(isLesson(tp)&&!seenE[tp]){seenE[tp]=1;if(+new Date(e[0],e[1],e[2])<=todayTs)expected++;}
        }
    }
    return { done: done, total: lessons.length, expected: expected };
}
function rProg(){
    const t=tdy(),tk=document.getElementById("pb"),lb=document.getElementById("pl");
    const newLabels=typeof cYear==='undefined'||cYear==='SY26-27';
    const ut={},ud={};let tt=0,ds=0;
    for(const e of S){const inf=cP==="B"?e[3]:e[4];
        if(!inf||inf===OFF||inf===EX||inf===PO||inf===NC)continue;
        let u=inf.t===R?"Rev":"U"+inf.u;
        if(newLabels&&inf.t!==R&&!inf.kind){
            inf.ced=inf.group?groupLabel(inf):cedLabel(inf.t);
            u=inf.ced.bonus?'★':(inf.ced.unit?'U'+inf.ced.unit:null);
        }
        if((inf.t===R&&inf.u===0)||inf.u||(newLabels&&inf.ced&&inf.ced.bonus)){
            const count=inf.group?groupTopics(inf).length:1;
            if(u)ut[u]=(ut[u]||0)+count;
            tt+=count;
            const dt=new Date(e[0],e[1],e[2]);
            if(dt<=t){if(u)ud[u]=(ud[u]||0)+count;ds+=count;}
        }
    }
    const def=SCHEDULE_DEFS[cYear];
    const uo=def.units.map(u=>"U"+u.id).concat(newLabels?["★","Rev"]:["Rev"]);
    const uc={};const utc={};for(const u of uo){const token=u==="Rev"?"rev":u==="★"?"bonus":u.toLowerCase();uc[u]="var(--"+token+")";utc[u]="var(--"+token+"-t)";}
    let h="";for(const u of uo){const c=ut[u]||0;if(!c)continue;
        h+=`<div class="prog-seg" style="width:${(c/tt*100).toFixed(1)}%;background:${uc[u]};color:${utc[u]}">${u}</div>`;}
    h+=`<div class="prog-mark" style="left:${tt?(ds/tt*100):0}%"></div>`;
    tk.innerHTML=h;
    // HONEST progress (#13): the prog-mark still shows the PACE line (date-elapsed), but the
    // label + a done-fill now report ACTUAL completion from the SAME oracle the calendar greys
    // cells with (localLessonState over the period's lesson topics). Fails OPEN to the old
    // date-elapsed label when not signed in / not computable, and only says "to catch up" past
    // a 2-lesson gap so a cold /grade cache (warmed later by renderDoNowGrades) never flashes "behind".
    let _pace=null;
    try{
        if(typeof getStudentEmail==='function'&&getStudentEmail()
           &&typeof _orderedPeriodTopics==='function'&&typeof localLessonState==='function'){
            const _marks=(typeof getStudentMarks==='function')?getStudentMarks():{};
            const _p=_computePace(_orderedPeriodTopics(),_marks,S,+t,cP);
            if(_p.total)_pace=_p;
        }
    }catch(_){_pace=null;}
    // PROGRESS_RESET_FIX_SPEC D5 \u2014 honest-unknown: signed in, zero done lessons,
    // AND no completion evidence anywhere (no warm /grade cache this load, no
    // durable server-completion latch) must never render as "0 of N lessons
    // done" \u2014 that IS the incident symptom. Say so plainly instead. typeof-
    // guarded so signed-out/legacy vm callers (which don't inject
    // _serverEvidencePresent / _gradeLoadState) keep the existing pace label.
    if(_pace){
        var _noEvidence=_pace.done===0
            &&(typeof _serverEvidencePresent!=='function'||!_serverEvidencePresent())
            &&!Array.isArray(_gradeLessonsCache);
        var _loadState=(typeof _gradeLoadState==='string')?_gradeLoadState:'unknown';
        if(_noEvidence&&_loadState!=='available'){
            lb.textContent=(_loadState==='unavailable')
                ?'Progress temporarily unavailable \u2014 your work is saved.'
                :'Progress loading\u2026';
            return;
        }
    }
    if(_pace){
        const _f=document.createElement('div');_f.className='prog-fill';
        _f.style.width=Math.round(_pace.done/_pace.total*100)+'%';tk.appendChild(_f);
        const _d=_pace.done-_pace.expected;
        const _word=_d>=2?(_d+' ahead'):_d<=-2?(Math.abs(_d)+' to catch up'):'On pace';
        lb.textContent=_word+' \u2014 '+_pace.done+' of '+_pace.total+' lessons done';
    }else{
        lb.textContent=Math.round(ds/tt*100)+"% Complete \u2014 "+ds+" of "+tt+" sessions";
    }
}
function uClock(){const n=new Date();let h=n.getHours(),m=n.getMinutes(),a=h>=12?"PM":"AM";h=h%12||12;document.getElementById("mclock").textContent=h+":"+(m<10?"0":"")+m+" "+a;}
