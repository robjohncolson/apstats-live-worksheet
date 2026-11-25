// ── CLASS SNAPSHOT — "Where you stand" (CLASS_SNAPSHOT_SPEC.md, teacher 2026-09-26) ──
// Every signed-in student sees the class's current quarter grades drawn as the graph the class
// has learned so far (dot plot / stem-and-leaf / box plot), with their own value in red. Data =
// GET /class/snapshot (anonymous, rounded values only). The renderer lives in lib/class-snapshot.js
// (shared with the teacher workspace). Never throws; renders nothing when the lib or data is absent.
var SNAPSHOT_TTL_MS = 5 * 60 * 1000;
var _snapState = { section: null, data: null, fetchedAt: 0, inflight: null, mode: null, error: null };

function _snapSection() {
    try { var who = window.rosterClient && window.rosterClient.current && window.rosterClient.current(); return (who && who.section) || null; } catch (_) { return null; }
}
function _snapCurrentQuarterKey() {
    try {
        var n = (typeof quarterOfDate === 'function') ? quarterOfDate((typeof tdy === 'function') ? tdy() : new Date()) : 0;
        return n ? 'Q' + n : 'Q1';
    } catch (_) { return 'Q1'; }
}
function _snapOwnGrade() {
    try {
        var q = (typeof _gradeQuartersCache !== 'undefined') ? _gradeQuartersCache : null;
        var cur = q && q[_snapCurrentQuarterKey()];
        return cur && typeof cur.quarterGrade === 'number' ? cur.quarterGrade : null;
    } catch (_) { return null; }
}
function _snapModes() {
    var lessons = (typeof _gradeLessonsCache !== 'undefined') ? _gradeLessonsCache : null;
    var period = (typeof cP === 'string') ? cP : null;
    return ClassSnapshot.mode(lessons, period, _zeroTodayIso());
}
function _snapFetch() {
    var section = _snapSection();
    if (!section) return Promise.resolve(null);
    if (_snapState.data && _snapState.section === section && (Date.now() - _snapState.fetchedAt) < SNAPSHOT_TTL_MS) return Promise.resolve(_snapState.data);
    if (_snapState.inflight) return _snapState.inflight;
    var cfg = (typeof _reviewCfg === 'function') ? _reviewCfg() : { token: null, base: null };
    if (!cfg.token || !cfg.base) return Promise.resolve(null);
    _snapState.inflight = fetch(cfg.base + '/class/snapshot?section=' + encodeURIComponent(section), { headers: { Authorization: 'Bearer ' + cfg.token } })
        .then(function (res) { return res.status === 200 ? res.json() : null; })
        .then(function (data) {
            if (data && data.ok) { _snapState.data = data; _snapState.section = section; _snapState.fetchedAt = Date.now(); _snapState.error = null; }
            else _snapState.error = 'unavailable';
            return _snapState.data;
        })
        .catch(function () { _snapState.error = 'unavailable'; return _snapState.data; })
        .finally(function () { _snapState.inflight = null; });
    return _snapState.inflight;
}
// Build (or refresh) the card and keep it at the very top of the ledger.
function _walletPrependSnapshot(host) {
    try {
        if (!host || typeof ClassSnapshot === 'undefined') return;
        if (typeof _deskIsTeacher === 'function' && _deskIsTeacher()) return;   // the teacher has the workspace view
        if (!_snapSection()) return;
        var card = host.querySelector('.wallet-snapshot-card');
        if (!card) {
            card = document.createElement('div');
            card.className = 'wallet-snapshot-card';
            var h = document.createElement('h4'); h.className = 'snap-title'; card.appendChild(h);
            var tabs = document.createElement('div'); tabs.className = 'snap-tabs'; card.appendChild(tabs);
            var canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 120; canvas.setAttribute('role', 'img'); card.appendChild(canvas);
            var cap = document.createElement('div'); cap.className = 'snap-caption geneva'; cap.setAttribute('role', 'status'); card.appendChild(cap);
            var note = document.createElement('div'); note.className = 'snap-note geneva'; card.appendChild(note);
        }
        if (host.firstChild !== card) host.insertBefore(card, host.firstChild);
        _snapPaint(card);
        _snapFetch().then(function () { if (card.isConnected) _snapPaint(card); });
    } catch (_) {}
}
function _snapPaint(card) {
    try {
        var data = _snapState.data;
        var section = _snapSection();
        var modes = _snapModes();
        if (!_snapState.mode || modes.available.indexOf(_snapState.mode) < 0) _snapState.mode = modes.default;
        var title = card.querySelector('.snap-title');
        title.textContent = 'Where you stand — ' + String(section || '').replace('Period', 'Period ') + (data && data.n ? ', ' + data.n + ' students' : '');
        var tabs = card.querySelector('.snap-tabs');
        tabs.textContent = '';
        tabs.hidden = !modes.tabs;
        modes.available.forEach(function (m) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 's7btn'; b.style.cssText = 'font-size:10px;padding:1px 6px';
            b.textContent = ClassSnapshot.LABEL[m]; b.setAttribute('aria-pressed', String(m === _snapState.mode));
            b.onclick = function () { _snapState.mode = m; _snapPaint(card); };
            tabs.appendChild(b);
        });
        var own = _snapOwnGrade();
        var values = data ? data.values : [];
        var canvas = card.querySelector('canvas');
        ClassSnapshot.draw(canvas, { values: values, own: own, mode: _snapState.mode });
        var hasGap = (typeof _zeroCurrentWarnings === 'function') && _zeroCurrentWarnings().length > 0;
        var cap = card.querySelector('.snap-caption');
        cap.textContent = data ? ClassSnapshot.caption({ values: values, own: own, mode: _snapState.mode, hasGap: hasGap })
            : (_snapState.error ? 'Class picture unavailable right now.' : 'Loading the class picture…');
        canvas.setAttribute('aria-label', cap.textContent);
        var note = card.querySelector('.snap-note');
        note.textContent = data && data.n ? 'One mark per classmate, no names. Red = you. Grades count only work due so far.' : '';
    } catch (_) {}
}

// ── Class Snapshot APP WINDOW (desktop icon) ──────────────────────────────────
// Students: the same card as My Ledger (own value in red). Teacher: one card per section with
// every mode available and a "place a student" picker (names come from /class/grades, which the
// teacher's own session already authorizes; the student endpoint never carries names).
var _snapApp = { mode: null, sections: {}, roster: null, pick: {}, request: 0, view: 'class', assign: {}, focusKey: null, amode: null, aidx: {}, aall: false };

function openSnapshot() {
    try { if (typeof bumpUsage === 'function') bumpUsage('snapshot'); } catch (_) {}
    try { if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('wildEep', 0.5); } catch (_) {}
    var overlay = document.getElementById('app-snapshot-overlay');
    if (!overlay) return;
    var win = overlay.querySelector('.app-window');
    if (win) { win.style.left = '50%'; win.style.top = '50%'; win.style.transform = 'translate(-50%, -50%)'; win.classList.remove('maximized'); }
    if (typeof _appTopZ !== 'undefined') overlay.style.zIndex = ++_appTopZ;
    overlay.style.display = 'block';
    _renderSnapshotApp();
}

function _snapTeacherFetch(path) {
    var cfg = (typeof _reviewCfg === 'function') ? _reviewCfg() : { token: null, base: null };
    if (!cfg.token || !cfg.base) return Promise.resolve(null);
    return fetch(cfg.base + path, { headers: { Authorization: 'Bearer ' + cfg.token } })
        .then(function (res) { return res.status === 200 ? res.json() : null; })
        .catch(function () { return null; });
}

function _renderSnapshotApp() {
    var host = document.getElementById('snapshot-content');
    if (!host) return;
    host.textContent = '';
    if (typeof ClassSnapshot === 'undefined') { host.textContent = 'The class picture is not available in this build.'; return; }
    var teacher = (typeof _deskIsTeacher === 'function') && _deskIsTeacher();
    if (!teacher && !_snapSection()) { host.textContent = 'Sign in to see where you stand in your class.'; return; }
    if (!teacher) { _renderSnapshotStudent(host); return; }
    // Phase 2: "Class" (the quarter picture) vs "Assignments" (one small box plot per due item).
    var views = document.createElement('div'); views.className = 'snap-tabs snap-views';
    if (_snapApp.view !== 'class' && _snapApp.view !== 'assignments') _snapApp.view = 'class';
    [['class', 'Class'], ['assignments', 'Assignments']].forEach(function (v) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 's7btn'; b.style.cssText = 'font-size:10px;padding:1px 8px';
        b.textContent = v[1]; b.setAttribute('aria-pressed', String(_snapApp.view === v[0]));
        b.onclick = function () { _snapApp.view = v[0]; _renderSnapshotApp(); };
        views.appendChild(b);
    });
    host.appendChild(views);
    if (_snapApp.view === 'assignments') { _renderAssignmentsView(host, teacher); return; }
    var intro2 = document.createElement('p'); intro2.className = 'snap-intro';
    intro2.textContent = 'Each section’s current quarter grades, one mark per student, no names. Pick a student to place their dot (only you see this).';
    host.appendChild(intro2);
    ['PeriodB', 'PeriodE'].forEach(function (section) { host.appendChild(_snapTeacherSectionCard(section)); });
    if (!_snapApp.roster) {
        _snapTeacherFetch('/class/grades').then(function (data) {
            if (!data || !Array.isArray(data.students)) return;
            _snapApp.roster = data.students;
            if (document.getElementById('app-snapshot-overlay').style.display !== 'none') _renderSnapshotApp();
        });
    }
}

// Student tabs (LEDGER_CALM_SPEC §3.1): "My work" (default) = the assignments as plain data —
// score list, advice, no plots or statistics; "Graphs" = the quarter picture above the
// assignments in graph mode. Nothing is deleted; the graphs are one tab away.
function _renderSnapshotStudent(host) {
    if (_snapApp.view !== 'work' && _snapApp.view !== 'graphs') _snapApp.view = 'work';
    var views = document.createElement('div'); views.className = 'snap-tabs snap-views';
    [['work', 'My work'], ['graphs', 'Graphs']].forEach(function (v) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 's7btn'; b.style.cssText = 'font-size:10px;padding:1px 8px';
        b.textContent = v[1]; b.setAttribute('aria-pressed', String(_snapApp.view === v[0]));
        b.onclick = function () { _snapApp.view = v[0]; _renderSnapshotApp(); };
        views.appendChild(b);
    });
    host.appendChild(views);
    if (_snapApp.view === 'work') { _renderAssignmentsView(host, false); return; }
    // The ledger's old "Where you stand" card (the painter prepends it), the intro above it,
    // the tabs above both; then the assignments with their plots.
    _walletPrependSnapshot(host);
    var intro = document.createElement('p'); intro.className = 'snap-intro';
    intro.textContent = 'Your class’s current grades, drawn as the graph we have learned so far. One mark per classmate, no names. Red = you.';
    host.insertBefore(intro, host.firstChild);
    host.insertBefore(views, host.firstChild);
    _renderAssignmentsView(host, false);
}

function _snapTeacherSectionCard(section) {
    var card = document.createElement('div'); card.className = 'wallet-snapshot-card'; card.dataset.section = section;
    var h = document.createElement('h4'); h.textContent = section.replace('Period', 'Period '); card.appendChild(h);
    var tabs = document.createElement('div'); tabs.className = 'snap-tabs'; card.appendChild(tabs);
    var pick = document.createElement('div'); pick.className = 'snap-pick';
    var label = document.createElement('label'); label.textContent = 'Place a student:'; pick.appendChild(label);
    var select = document.createElement('select'); select.setAttribute('aria-label', 'Place a student on the ' + section + ' plot');
    var none = document.createElement('option'); none.value = ''; none.textContent = '(no dot)'; select.appendChild(none);
    pick.appendChild(select); card.appendChild(pick);
    var canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 150; canvas.setAttribute('role', 'img'); card.appendChild(canvas);
    var cap = document.createElement('div'); cap.className = 'snap-caption geneva'; cap.setAttribute('role', 'status'); cap.textContent = 'Loading…'; card.appendChild(cap);
    var paint = function () {
        var data = _snapApp.sections[section];
        var modes = ['dot', 'stem', 'hist', 'box'];
        if (!_snapApp.mode) _snapApp.mode = _snapModes().default;
        tabs.textContent = '';
        modes.forEach(function (m) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 's7btn'; b.style.cssText = 'font-size:10px;padding:1px 6px';
            b.textContent = ClassSnapshot.LABEL[m]; b.setAttribute('aria-pressed', String(m === _snapApp.mode));
            b.onclick = function () { _snapApp.mode = m; _renderSnapshotApp(); };
            tabs.appendChild(b);
        });
        // picker: students of this section with a current quarter grade
        var quarter = data && data.quarter;
        var picked = _snapApp.pick[section] || '';
        Array.from(select.querySelectorAll('option:not([value=""])')).forEach(function (o) { o.remove(); });
        (_snapApp.roster || []).filter(function (st) { return st.section === section && st.role !== 'teacher'; })
            .sort(function (a, b) { return String(a.realName || a.username).localeCompare(String(b.realName || b.username)); })
            .forEach(function (st) {
                var g = st.quarters && quarter && st.quarters[quarter] ? st.quarters[quarter].quarterGrade : null;
                if (typeof g !== 'number') return;
                var o = document.createElement('option'); o.value = st.username; o.textContent = (st.realName || st.username);
                o.dataset.grade = String(g); select.appendChild(o);
            });
        select.value = picked;
        var chosen = select.selectedOptions && select.selectedOptions[0];
        var own = chosen && chosen.dataset.grade ? Number(chosen.dataset.grade) : null;
        if (!data) { cap.textContent = 'Class picture unavailable.'; return; }
        ClassSnapshot.draw(canvas, { values: data.values, own: own, mode: _snapApp.mode });
        var text = ClassSnapshot.caption({ values: data.values, own: own, mode: _snapApp.mode, hasGap: false }).replace(' Every score here can still move.', '');
        if (own != null && chosen) text = text.replace('You: ', chosen.textContent + ': ');
        cap.textContent = data.n + ' students — ' + text;
        canvas.setAttribute('aria-label', cap.textContent);
    };
    select.onchange = function () { _snapApp.pick[section] = select.value; paint(); };
    if (_snapApp.sections[section]) paint();
    else {
        _snapTeacherFetch('/class/snapshot?section=' + encodeURIComponent(section)).then(function (data) {
            if (data && data.ok) _snapApp.sections[section] = data;
            paint();
        });
    }
    return card;
}

// ── Class Snapshot Phase 2: one box plot per due assignment; a zero shows the whole data set ──

// This student's own score on one assignment (null = missing), from the cached /grade lessons.
function _snapOwnAssignmentScore(a, lessons) {
    var L = (lessons || []).find(function (l) { return l && l.lessonKey === a.lessonKey; });
    if (!L) return null;
    var v = a.track === 'worksheet' ? (L.lessonGradeNoQuiz != null ? L.lessonGradeNoQuiz : L.Cws)
        : a.track === 'quiz' ? L.Q : L.blooket;
    return typeof v === 'number' ? v : null;
}
function _snapFetchAssignments(section, teacher) {
    var cached = _snapApp.assign[section];
    if (cached && (Date.now() - cached.at) < SNAPSHOT_TTL_MS) return Promise.resolve(cached.data);
    var cfg = (typeof _reviewCfg === 'function') ? _reviewCfg() : { token: null, base: null };
    if (!cfg.token || !cfg.base) return Promise.resolve(null);
    return fetch(cfg.base + '/class/snapshot?section=' + encodeURIComponent(section) + '&by=assignment', { headers: { Authorization: 'Bearer ' + cfg.token } })
        .then(function (res) { return res.status === 200 ? res.json() : null; })
        .then(function (data) { if (data && data.ok) _snapApp.assign[section] = { at: Date.now(), data: data }; return data && data.ok ? data : null; })
        .catch(function () { return null; });
}
function _snapZeroDateText(a) {
    try {
        var today = _zeroTodayIso();
        var d = new Date(a.zeroDate + 'T00:00:00');
        var when = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + (d.getMonth() + 1) + '/' + d.getDate();
        return a.zeroDate < today ? 'counted since ' + when : 'counts from ' + when;
    } catch (_) { return ''; }
}
// QUARTER_ZERO_FREEZE_SPEC: is this assignment never a 0 for the viewer's section (its quarter
// closed before the zero date there)? The pooled item says so (neverZero[section]), and so does
// the viewer's own /grade lesson (neverZero[period]).
function _snapNeverZeroFor(a, viewerSection, lessons) {
    if (!a || !viewerSection) return false;
    if (a.neverZero && a.neverZero[viewerSection]) return true;
    var period = String(viewerSection).slice(-1);
    var L = (lessons || []).find(function (l) { return l && l.lessonKey === a.lessonKey; });
    return Boolean(L && L.neverZero && L.neverZero[period] === true);
}
// QUARTER_LINE_BY_DUE_DATE_SPEC §3.11: the closed quarter this assignment counts in for the
// viewer's section ('Q1'), or null. After a close nothing in that quarter can change any more.
function _snapClosedQuarterFor(a, viewerSection, lessons) {
    if (!a || !viewerSection) return null;
    if (typeof DeskMissingWork === 'undefined' || typeof DeskMissingWork.closedQuarterOf !== 'function') return null;
    var quarters = (typeof _deskGradeQuarters === 'function') ? _deskGradeQuarters() : null;
    if (!quarters) return null;
    var period = String(viewerSection).slice(-1);
    return DeskMissingWork.closedQuarterOf(lessons, a.lessonKey, period, _zeroTodayIso(), quarters, a.track);
}
// What to do about this assignment, in one or two sentences, plus an optional action.
// label: undefined = the viewer's own score; a name = a picked student; null = nobody placed.
// neverZero: late for this student, never a 0 (_snapNeverZeroFor).
// finalQuarter: the closed quarter it counts in ('Q1', _snapClosedQuarterFor): no "Do this next".
function _snapAdvice(a, own, label, neverZero, finalQuarter) {
    var values = Array.isArray(a.values) ? a.values : [];
    var fn = ClassSnapshot.fiveNumber(values);
    var n = values.length, zeros = typeof a.zeros === 'number' ? a.zeros : values.filter(function (v) { return v === 0; }).length;
    if (label === null) {
        if (!zeros) return { text: 'Nobody is at 0 here. Pick a student on the Class tab to place their dot.' };
        return { text: zeros + ' of ' + n + ' count as a 0 here. Pick a student on the Class tab to place their dot.' };
    }
    var who = label ? label + ' has' : 'You have';
    var track = a.track === 'quiz' ? 'quiz' : a.track === 'blooket' ? 'flashcards' : 'worksheet';
    var action = a.track === 'quiz' ? 'Take the quiz' : a.track === 'blooket' ? 'Run the flashcards' : 'Open the worksheet';
    if (finalQuarter) {
        var final = 'Quarter ' + String(finalQuarter).replace(/^Q/, '') + ' final';
        if (own == null || own === 0) return { text: final + ' — ' + (label ? label + '’s' : 'this') + ' 0 no longer changes.' };
        return { text: who + ' ' + own + ' here. ' + final + ' — it no longer changes.' };
    }
    if (neverZero && own == null) {
        if (label) return { text: label + ' has nothing here yet \u2014 it is late, never a 0. Finishing it still counts.' };
        return { text: 'Late \u2014 this one is never a 0 for you. Finishing it still counts.', action: action, kind: a.track };
    }
    if (a.pending && own == null) {
        var when = _snapZeroDateText(a).replace('counts from ', '');
        if (label) return { text: label + ' has nothing here yet \u2014 it becomes a 0 after ' + when + '.' };
        return { text: 'Do this next. It becomes a 0 after ' + when + ' \u2014 turn in anything before then and there is no 0 at all.', action: action, kind: a.track };
    }
    if (own == null || own === 0) {
        if (label) return { text: label + ' has a 0 here \u2014 the ' + track + ' was never turned in. Any score replaces it.' };
        return { text: 'Do this next. Right now this counts as a 0, the biggest thing pulling your grade down. Any score replaces the 0.', action: action, kind: a.track };
    }
    if (!n || fn.q1 == null) return { text: who + ' ' + own + ' here.' };
    if (own < fn.q1) {
        var how = a.track === 'quiz' ? 'Retake the quiz for a better score.'
            : a.track === 'blooket' ? 'Play the deck again \u2014 your best score is the one that counts.'
            : 'Revise the worksheet \u2014 Check keeps your latest answer and AI grading only raises.';
        return { text: who + ' ' + own + ', below Q1 \u2014 three quarters of the class scored higher. ' + how, action: label ? null : action, kind: a.track };
    }
    if (own > fn.q3) return { text: who + ' ' + own + ', above Q3. Nothing to do here.' };
    return { text: who + ' ' + own + ', inside the box \u2014 with the middle half of the class. Nothing to fix here.' };
}
// Which assignment deserves the screen (rows are ordered oldest first):
//   1. the viewer's 0 that has been counting longest;
//   2. else the viewer's score furthest below the class median among those below Q1;
//   3. else a late assignment with nothing turned in (never a 0, nevers[i], but still to do);
//   4. else nothing needs fixing: the newest assignment, flagged `clear`.
// Nobody placed (label null): the most overdue assignment.
// finals[i] (QUARTER_LINE_BY_DUE_DATE_SPEC §3.11): it counts in a closed quarter, so it is never
// the thing to fix next.
function _snapFocus(rows, owns, label, nevers, finals) {
    if (label === null) return { index: 0, clear: false };
    var late = function (i) { return owns[i] == null && Boolean(nevers && nevers[i]); };
    var closed = function (i) { return Boolean(finals && finals[i]); };
    var best = -1, bestDate = null;
    rows.forEach(function (a, i) {
        var own = owns[i];
        if (own != null && own !== 0) return;
        if (late(i)) return;   // not a 0
        if (closed(i)) return;   // a final 0: nothing to fix
        if (bestDate == null || a.zeroDate < bestDate) { best = i; bestDate = a.zeroDate; }
    });
    if (best >= 0) return { index: best, clear: false };
    var worst = -1, gap = 0;
    rows.forEach(function (a, i) {
        if (owns[i] == null) return;
        if (closed(i)) return;
        var fn = ClassSnapshot.fiveNumber(a.values || []);
        if (fn.q1 == null || owns[i] >= fn.q1) return;
        var g = fn.median - owns[i];
        if (g > gap) { gap = g; worst = i; }
    });
    if (worst >= 0) return { index: worst, clear: false };
    for (var i = 0; i < rows.length; i++) if (late(i) && !closed(i)) return { index: i, clear: false };
    return { index: rows.length - 1, clear: true };
}
// Whole days from today to an ISO date (negative = past), on the Desk's clock.
function _snapDaysUntil(iso) {
    try { return Math.round((new Date(iso + 'T00:00:00') - new Date(_zeroTodayIso() + 'T00:00:00')) / 86400000); }
    catch (_) { return Infinity; }
}
// The section whose Class-tab pick should be placed on the pooled picture (first with a pick).
function _snapPickedSection() {
    var keys = Object.keys(_snapApp.pick || {});
    for (var i = 0; i < keys.length; i++) if (_snapApp.pick[keys[i]]) return keys[i];
    return null;
}
function _snapOpenWork(kind, lessonKey, btn) {
    if (kind === 'quiz') return _zeroOpenQuiz(lessonKey);
    if (kind === 'blooket') return _zeroOpenFlashcards(btn, lessonKey);
    return _zeroOpenLesson(lessonKey);
}
// Tentative zeros (TENTATIVE_ZEROS_SPEC.md §3): classmates taught a lesson but not yet past its
// zero date, with nothing turned in, show as yellow 0s — Monday's picture if nothing changes.
// "Mon 9/28" for an ISO date.
function _snapDayText(iso) {
    return _snapZeroDateText({ zeroDate: iso }).replace(/^(counts from|counted since) /, '');
}
// Is the viewer's own section still before its zero date here? Then their missing work is a
// tentative 0. A mixed item whose own section is already counting → false (their 0 is real).
function _snapOwnSectionNotCounting(a, viewerSection) {
    var zd = a.zeroDates && viewerSection ? a.zeroDates[viewerSection] : null;
    if (zd) return _snapDaysUntil(zd) >= 0;
    return Boolean(a.pending);
}
// When the tentative zeros become real. Pending item: its soonest zero date. Mixed item: the
// viewer's own section date if still ahead, else the soonest date still ahead.
function _snapTentativeDay(a, viewerSection) {
    if (a.pending) return _snapZeroDateText(a).replace('counts from ', '');
    var zds = a.zeroDates || {};
    var mine = viewerSection ? zds[viewerSection] : null;
    if (mine && _snapDaysUntil(mine) >= 0) return _snapDayText(mine);
    var ahead = Object.keys(zds).map(function (k) { return zds[k]; })
        .filter(function (d) { return d && _snapDaysUntil(d) >= 0; }).sort();
    return ahead.length ? _snapDayText(ahead[0]) : _snapDayText(a.zeroDate);
}
// The legend under a row with tentative zeros: small colour swatches, not emoji.
function _snapTentativeLegend(day) {
    var legend = document.createElement('div'); legend.className = 'snap-legend geneva';
    var parts = [
        ['snap-swatch snap-swatch-real', 'black = 0 already counting'],
        ['snap-swatch snap-swatch-tentative', 'yellow = tentative 0 (real after ' + day + ')'],
        ['snap-swatch snap-swatch-you', 'red = you'],
    ];
    parts.forEach(function (p, i) {
        if (i) legend.appendChild(document.createTextNode(' · '));
        var sw = document.createElement('span'); sw.className = p[0]; sw.setAttribute('aria-hidden', 'true');
        legend.appendChild(sw);
        legend.appendChild(document.createTextNode(' ' + p[1]));
    });
    return legend;
}
// One row: title, mini plot, caption, advice, and the full sorted data set (open when the viewer's
// own score is a 0 or missing; a tap opens it for any row). Never a name.
// viewerSection (optional): 'PeriodB' / 'PeriodE' — decides whether a missing score is a tentative 0.
// The graph half of a row: mini plot, caption (the summary statistics) and the tentative legend.
function _snapAssignmentPlot(row, a, ownForPlot, label, amode, tentative, ownTentative, tentDay) {
    var canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = ClassSnapshot.miniHeight(amode, a.values, ownForPlot, tentative); canvas.setAttribute('role', 'img');
    row.appendChild(canvas);
    ClassSnapshot.drawMini(canvas, { values: a.values, own: ownForPlot, mode: amode, tentativeZeros: tentative, ownTentative: ownTentative });
    var cap = document.createElement('div'); cap.className = 'snap-caption geneva';
    var text = ClassSnapshot.assignmentCaption(a, label === null || ownForPlot == null ? undefined : ownForPlot, {
        tentativeLabel: tentative ? 'real after ' + tentDay : undefined,
        ownTentative: ownTentative,
    });
    if (label) text = text.replace('You: ', label + ': ');
    cap.textContent = text; canvas.setAttribute('aria-label', a.title + '. ' + text);
    row.appendChild(cap);
    if (tentative) row.appendChild(_snapTentativeLegend(tentDay));
}
// opts.dataOnly (student "My work" tab): no plot, caption or legend; the score list is always open.
// opts.neverZero: late for this student, never a 0 (_snapNeverZeroFor): their missing work is no 0 here.
// opts.finalQuarter: it counts in a closed quarter ('Q1', _snapClosedQuarterFor): 'Quarter 1 final'.
function _snapAssignmentRow(a, own, label, viewerSection, opts) {
    var dataOnly = Boolean(opts && opts.dataOnly);
    var neverZero = Boolean(opts && opts.neverZero) && label !== null;
    var finalQuarter = (opts && opts.finalQuarter && label !== null) ? opts.finalQuarter : null;
    var row = document.createElement('div'); row.className = 'snap-arow'; row.dataset.key = a.key;
    var head = document.createElement('div'); head.className = 'snap-arow-head';
    var t = document.createElement('span'); t.className = 'snap-arow-title'; t.textContent = a.title; head.appendChild(t);
    var w = document.createElement('span'); w.className = 'snap-arow-when';
    w.textContent = neverZero ? 'late \u00b7 never a 0 for ' + (label || 'you') : _snapZeroDateText(a);
    head.appendChild(w);
    row.appendChild(head);
    var amode = _snapApp.amode || 'box';
    // The viewer's (or picked student's) score for the plot: missing work counts as 0; nobody placed = null.
    var ownForPlot = label === null ? null : (own == null ? (neverZero ? null : 0) : own);
    var tentative = Number(a.tentativeZeros) || 0;
    // Nothing turned in and the viewer's section is not yet past its zero date: a tentative 0.
    var ownTentative = own == null && label !== null && !neverZero && _snapOwnSectionNotCounting(a, viewerSection);
    var tentDay = tentative ? _snapTentativeDay(a, viewerSection) : '';
    if (!dataOnly) _snapAssignmentPlot(row, a, ownForPlot, label, amode, tentative, ownTentative, tentDay);
    var advice = _snapAdvice(a, own, label, neverZero, finalQuarter);
    var adv = document.createElement('div'); adv.className = 'snap-advice geneva' + (advice.action ? ' snap-advice-act' : '');
    var advText = document.createElement('span'); advText.textContent = advice.text; adv.appendChild(advText);
    if (advice.action) {
        var go = document.createElement('button'); go.type = 'button'; go.className = 's7btn snap-advice-btn'; go.style.cssText = 'font-size:10px;padding:1px 6px;margin-left:8px';
        go.textContent = advice.action;
        go.onclick = function () { _snapOpenWork(advice.kind, a.lessonKey, go); };
        adv.appendChild(go);
    }
    row.appendChild(adv);
    // A final 0 (§3.11) is not "a 0 to replace": its list stays closed and says nothing about replacing.
    var isZero = label !== null && !finalQuarter && (own === 0 || (own == null && !neverZero));
    var built = _snapScoreList(a, ownForPlot, label, { tentative: tentative, ownTentative: ownTentative, tentDay: tentDay, isZero: isZero, sections: opts && opts.sections });
    var list = built.list, showList = built.shown;
    list.hidden = !isZero && !dataOnly;
    row.appendChild(list);
    if (showList && !isZero && !dataOnly) {
        var tog = document.createElement('button'); tog.type = 'button'; tog.className = 's7btn snap-alist-toggle'; tog.style.cssText = 'font-size:10px;padding:1px 6px';
        tog.textContent = 'show all scores';
        tog.onclick = function () { list.hidden = !list.hidden; tog.textContent = list.hidden ? 'show all scores' : 'hide scores'; };
        row.appendChild(tog);
    }
    return row;
}
// The anonymous score list for one assignment: tentative zeros (yellow) first, then every real
// score, with the viewer's own score red (in place, or inserted when it is not in the pool).
// Used by the Snapshot app rows and by the ledger's Missing-work rows.
// o.sections: the pooled payload's `sections` — the lead/foot/key name the periods
// (EFFORT_VISIBILITY_V2_SPEC §2); none → the "classmates" words.
function _snapScoreList(a, ownForPlot, label, o) {
    o = o || {};
    var tentative = Number(o.tentative) || 0, ownTentative = Boolean(o.ownTentative), tentDay = o.tentDay || '', isZero = Boolean(o.isZero);
    var words = (typeof ClassSnapshot !== 'undefined' && ClassSnapshot.scoreListWords)
        ? ClassSnapshot.scoreListWords(o.sections)
        : { from: '', who: 'classmates', one: 'one classmate' };   // lib failed to load: the v1 words
    var values = Array.isArray(a.values) ? a.values : [];
    var list = document.createElement('div'); list.className = 'snap-alist geneva';
    // D = the tentative zeros, then the real values (TENTATIVE_ZEROS_SPEC §2.1).
    var total = values.length + tentative;
    var showList = values.length > 0 || total >= 5;
    if (showList) {
        var lead = document.createElement('div'); lead.className = 'snap-alist-lead';
        // "students’ scores", not "scores": these are peers' records (teacher 2026-09-27).
        lead.textContent = (total === 1 ? '1 student’s score' : total + ' students’ scores') + words.from + ' for ' + a.title + (tentative ? ' (' + tentative + ' tentative)' : '') + ':';
        list.appendChild(lead);
        var seq = document.createElement('div'); seq.className = 'snap-alist-seq';
        // The viewer's own score is marked red in the list. When it is not in the pool (the
        // teacher, whose scores are not class data) it is inserted in order, never borrowed
        // from a classmate's identical score.
        var ownV = ownForPlot == null ? null : Math.round(ownForPlot);
        var marked = false, inserted = false;
        var chip = function (v, mine, added) {
            var sp = document.createElement('span'); sp.textContent = String(v);
            if (mine) { sp.className = 'snap-alist-you' + (added ? ' snap-alist-added' : ''); sp.title = label ? label : 'you'; }
            return sp;
        };
        // Tentative zeros lead the list. When the viewer's own 0 is tentative, one of them is the
        // red "you" chip (red wins: it is not also tentative-styled), never an extra chip.
        var ownIsTentativeChip = ownTentative && tentative > 0;
        for (var ti = 0; ti < tentative; ti++) {
            if (ownIsTentativeChip && ti === tentative - 1) { seq.appendChild(chip(0, true, false)); continue; }
            var tsp = chip(0, false, false); tsp.className = 'snap-alist-tentative'; seq.appendChild(tsp);
        }
        if (ownIsTentativeChip) ownV = null;
        var inPool = ownV != null && values.some(function (v) { return v === ownV; });
        values.forEach(function (v) {
            if (ownV != null && !inPool && !inserted && v > ownV) { seq.appendChild(chip(ownV, true, true)); inserted = true; }
            var mine = inPool && !marked && v === ownV;
            if (mine) marked = true;
            seq.appendChild(chip(v, mine, false));
        });
        if (ownV != null && !inPool && !inserted) seq.appendChild(chip(ownV, true, true));
        list.appendChild(seq);
        var have = values.filter(function (v) { return v > 0; }).length;
        var foot = document.createElement('div'); foot.className = 'snap-alist-foot';
        var tentText = tentative ? ' ' + tentative + ' haven\'t yet — a tentative 0 until ' + tentDay + '.' : '';
        foot.textContent = have + ' of ' + total + ' ' + words.who + ' have a score here.' + tentText + (isZero ? ' Every 0 on this list can still be replaced.' : '');
        list.appendChild(foot);
        list.appendChild(_snapListKey(tentative > 0, label, words.one));
    }
    return { list: list, shown: showList };
}
// The colour key under a score list: red = you (or the placed student), yellow = a 0 not counting
// yet, everything else = one student's score. one: who that is ("one student in Period B or E").
function _snapListKey(hasTentative, label, one) {
    var key = document.createElement('div'); key.className = 'snap-alist-key geneva';
    var parts = [['snap-key-you', label ? label : 'you']];
    if (hasTentative) parts.push(['snap-key-tent', 'a 0 that is not counting yet']);
    parts.push(['', 'every other number is ' + (one || 'one classmate')]);
    parts.forEach(function (p, i) {
        if (i) key.appendChild(document.createTextNode(' \u00b7 '));
        var sw = document.createElement('span'); sw.className = 'snap-key-swatch ' + p[0]; sw.textContent = p[0] ? '0' : '97'; key.appendChild(sw);
        key.appendChild(document.createTextNode(' = ' + p[1]));
    });
    return key;
}
function _renderAssignmentsView(host, teacher) {
    // Student "My work" tab: data only — no plots, captions, form bar or legend (LEDGER_CALM_SPEC §3.1).
    var dataOnly = !teacher && _snapApp.view === 'work';
    var intro = document.createElement('p'); intro.className = 'snap-intro';
    intro.textContent = teacher
        ? 'One assignment at a time, both periods pooled: what is counting, then what becomes a 0 soon. Red = you (or the student picked on the Class tab). Every score list is anonymous.'
        : dataOnly
        ? 'One assignment at a time: what counts as a 0 now, then what becomes a 0 soon. Red = you. Yellow = a 0 that is not counting yet. No names, just the numbers.'
        : 'One assignment at a time, both periods pooled: what is counting, then what becomes a 0 soon. Red = you. Where you have a 0, everyone’s scores are shown — no names, just the numbers.';
    host.appendChild(intro);
    var modes = teacher ? { available: ['dot', 'stem', 'hist', 'box'], default: 'box', tabs: true } : _snapModes();
    if (!_snapApp.amode || modes.available.indexOf(_snapApp.amode) < 0) _snapApp.amode = modes.default;
    if (modes.tabs && !dataOnly) {
        var bar = document.createElement('div'); bar.className = 'snap-tabs snap-amodes';
        modes.available.forEach(function (m) {
            var b = document.createElement('button'); b.type = 'button'; b.className = 's7btn'; b.style.cssText = 'font-size:10px;padding:1px 6px';
            b.textContent = ClassSnapshot.LABEL[m]; b.setAttribute('aria-pressed', String(m === _snapApp.amode));
            b.onclick = function () { _snapApp.amode = m; _renderSnapshotApp(); };
            bar.appendChild(b);
        });
        host.appendChild(bar);
    }
    // Both periods pooled into one picture (server `section=all`): more data points, one card.
    var section = 'all';
    [section].forEach(function (section) {
        var card = document.createElement('div'); card.className = 'wallet-snapshot-card'; card.dataset.section = section;
        var body = document.createElement('div'); body.className = 'snap-arows'; body.textContent = 'Loading…'; card.appendChild(body);
        host.appendChild(card);
        _snapFetchAssignments(section, teacher).then(function (data) {
            if (!card.isConnected) return;
            body.textContent = '';
            if (!data || !Array.isArray(data.assignments)) { body.textContent = 'Assignment picture unavailable right now.'; return; }
            var ownCache = (typeof _gradeLessonsCache !== 'undefined') ? _gradeLessonsCache : null;
            var pickSection = teacher ? _snapPickedSection() : null;
            // Everything counting somewhere, plus what becomes a 0 soon for the viewer's OWN
            // section — the same window the Missing-work card uses (ZERO_WARN_DAYS), so the two
            // lists agree. A lesson the other period has had but this one has not is not "soon".
            // The viewer's section is the Desk's period (cP), exactly as the Missing-work card
            // reads it — a teacher has no roster section, and a student's cP is their section.
            var viewerSection = pickSection || ((typeof cP === 'string' && /^[A-Z]$/.test(cP)) ? 'Period' + cP : _snapSection());
            var rows = data.assignments.filter(function (a) {
                if (!a.pending) return true;
                if (!a.zeroDates || !viewerSection) return true;
                var zd = a.zeroDates[viewerSection];
                if (zd === undefined && !(viewerSection in a.zeroDates) && !(data.sections || []).some(function (s) { return s === viewerSection; })) zd = a.zeroDate;   // unknown section: soonest date
                return Boolean(zd) && _snapDaysUntil(zd) <= ZERO_WARN_DAYS;
            }).sort(function (x, y) { return x.zeroDate === y.zeroDate ? 0 : (x.zeroDate < y.zeroDate ? -1 : 1); });
            if (!rows.length) { body.textContent = 'Nothing is counting yet.'; return; }
            var pickedName = pickSection ? _snapTeacherPickedName(pickSection) : undefined;
            // Teacher with a pick (either period): that student. Otherwise the viewer's own scores.
            var lessons = pickedName ? _snapTeacherPickedLessons(pickSection) : ownCache;
            var label = pickedName || undefined;
            var owns = rows.map(function (a) { return lessons ? _snapOwnAssignmentScore(a, lessons) : null; });
            // Late for this student (their quarter closed before the zero date): never a 0 here.
            var nevers = rows.map(function (a) { return _snapNeverZeroFor(a, viewerSection, lessons); });
            // QUARTER_LINE_BY_DUE_DATE_SPEC §3.11: counts in a closed quarter ('Quarter 1 final').
            var finals = rows.map(function (a) { return (typeof _snapClosedQuarterFor === 'function') ? _snapClosedQuarterFor(a, viewerSection, lessons) : null; });
            if (_snapApp.aall) {
                rows.forEach(function (a, i) { body.appendChild(_snapAssignmentRow(a, owns[i], label, viewerSection, { dataOnly: dataOnly, sections: data.sections, neverZero: nevers[i], finalQuarter: finals[i] })); });
                var all = document.createElement('button'); all.type = 'button'; all.className = 's7btn snap-pager-all'; all.style.cssText = 'font-size:10px;padding:1px 6px;margin-top:6px';
                all.textContent = 'Focus on one';
                all.onclick = function () { _snapApp.aall = false; _renderSnapshotApp(); };
                body.appendChild(all);
                return;
            }
            var idx = _snapApp.aidx[section];
            if (_snapApp.focusKey) {
                var fk = rows.findIndex(function (a) { return a.key === _snapApp.focusKey; });
                if (fk >= 0) idx = fk;
            }
            var focus = _snapFocus(rows, owns, label, nevers, finals);
            if (typeof idx !== 'number' || idx < 0 || idx >= rows.length) idx = focus.index;
            _snapApp.aidx[section] = idx;
            if (focus.clear) {
                // Nothing to fix anywhere: say so once, above the pager, so a "Nothing to fix here"
                // row never reads as if it were chosen because something is wrong with it.
                var clear = document.createElement('div'); clear.className = 'snap-clear geneva';
                // §3.11: final 0s are still 0s; say they are final instead of "no 0s".
                var finalZeros = finals.some(function (f, i) { return f && (owns[i] == null || owns[i] === 0); });
                clear.textContent = finalZeros
                    ? (label ? label + ' has' : 'You have') + ' nothing left to fix: every 0 here counts in a closed quarter and is final. Showing the newest; use Prev to look back.'
                    : (label ? label + ' has' : 'You have') + ' no 0s, nothing missing, and nothing below Q1 on any of the ' + rows.length + ' assignments so far. Showing the newest; use Prev to look back.';
                body.appendChild(clear);
            }
            var pager = document.createElement('div'); pager.className = 'snap-pager';
            var prev = document.createElement('button'); prev.type = 'button'; prev.className = 's7btn'; prev.style.cssText = 'font-size:10px;padding:1px 6px';
            prev.textContent = '\u2039 Prev'; prev.disabled = idx === 0;
            prev.onclick = function () { _snapApp.aidx[section] = idx - 1; _renderSnapshotApp(); };
            var pos = document.createElement('span'); pos.className = 'snap-pager-pos'; pos.textContent = (idx + 1) + ' of ' + rows.length;
            var next = document.createElement('button'); next.type = 'button'; next.className = 's7btn'; next.style.cssText = 'font-size:10px;padding:1px 6px';
            next.textContent = 'Next \u203a'; next.disabled = idx === rows.length - 1;
            next.onclick = function () { _snapApp.aidx[section] = idx + 1; _renderSnapshotApp(); };
            var showAll = document.createElement('button'); showAll.type = 'button'; showAll.className = 's7btn snap-pager-all'; showAll.style.cssText = 'font-size:10px;padding:1px 6px;margin-left:auto';
            showAll.textContent = 'Show all ' + rows.length;
            showAll.onclick = function () { _snapApp.aall = true; _renderSnapshotApp(); };
            pager.appendChild(prev); pager.appendChild(pos); pager.appendChild(next); pager.appendChild(showAll);
            body.appendChild(pager);
            var focused = _snapAssignmentRow(rows[idx], owns[idx], label, viewerSection, { dataOnly: dataOnly, sections: data.sections, neverZero: nevers[idx], finalQuarter: finals[idx] });
            if (_snapApp.focusKey === rows[idx].key) focused.classList.add('snap-arow-focus');
            body.appendChild(focused);
            _snapApp.focusKey = null;
        });
    });
}
function _snapTeacherPickedName(section) {
    var u = _snapApp.pick[section]; if (!u || !_snapApp.roster) return null;
    var st = _snapApp.roster.find(function (r) { return r.username === u; });
    return st ? (st.realName || st.username) : null;
}
function _snapTeacherPickedLessons(section) {
    var u = _snapApp.pick[section]; if (!u || !_snapApp.roster) return null;
    var st = _snapApp.roster.find(function (r) { return r.username === u; });
    return st ? st.lessons : null;
}
// Missing-work rows → the same assignment's row in the app (the per-row "class" link).
// A student lands on "My work"; the teacher on Assignments.
function _snapOpenAssignment(lessonKey, kind) {
    try {
        var track = kind === 'blooket' ? 'blooket' : kind === 'quiz' ? 'quiz' : 'worksheet';
        var teacher = (typeof _deskIsTeacher === 'function') && _deskIsTeacher();
        _snapApp.focusKey = lessonKey + ':' + track;
        _snapApp.view = teacher ? 'assignments' : 'work';
        if (typeof openSnapshot === 'function') openSnapshot();
    } catch (_) {}
}
