var _myGradebookQuarter = null;
// The gradebook the modal is CURRENTLY showing. For a student it's their own
// (= _gradeGradebookCache); for the teacher Class Gradebook it's the picked
// student's. Decoupled from _gradeGradebookCache so the teacher view never
// clobbers the Do Now cache (which gates the student's own grade chip).
var _activeGradebook = null;
var _myGradebookKeyHandler = null;

function _myGradebookCatOrder() {
    // Local (not a top-level const) so the render never depends on top-level eval
    // order — keeps it self-contained + testable.
    // Posters is a Work category again (POSTER_WORK_TRACK_SPEC.md); a stray legacy
    // category still renders, appended after these.
    return ['Lesson', 'Quizzes', 'Posters', 'Blooket', 'Progress Check'];
}

function _attachMyGradebookKeyHandler() {
    _detachMyGradebookKeyHandler();
    _myGradebookKeyHandler = function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'Escape') { e.preventDefault(); closeMyGradebook(); }
    };
    document.addEventListener('keydown', _myGradebookKeyHandler);
}
function _detachMyGradebookKeyHandler() {
    if (_myGradebookKeyHandler) {
        document.removeEventListener('keydown', _myGradebookKeyHandler);
        _myGradebookKeyHandler = null;
    }
}

function closeMyGradebook() {
    _detachMyGradebookKeyHandler();
    var ov = document.getElementById('my-gradebook-overlay');
    if (ov) ov.style.display = 'none';
}

// Pick the quarter to show first: current quarter if it has data, else the first
// quarter with data, else Q1. Shared by the student + teacher gradebook views.
function _firstGradebookQuarter(gb) {
    var qs = (gb && gb.quarters) || {};
    function _hasData(qk) {
        var q = qs[qk];
        return !!(q && Array.isArray(q.columns) && q.columns.length);
    }
    var curN = null;
    try { if (typeof quarterOfDate === 'function') curN = quarterOfDate(new Date()); } catch (_) {}
    var cur = curN ? ('Q' + curN) : null;
    if (!cur || !_hasData(cur)) cur = ['Q1', 'Q2', 'Q3', 'Q4'].filter(_hasData)[0] || 'Q1';
    return cur;
}

function openMyGradebook() {
    var ov = document.getElementById('my-gradebook-overlay');
    if (!ov) return;
    // Student's own view — hide the teacher student-picker, reset the title.
    var sr = document.getElementById('my-gradebook-student-row'); if (sr) sr.style.display = 'none';
    var title = document.getElementById('my-gradebook-title'); if (title) title.textContent = 'My Gradebook';
    _activeGradebook = _gradeGradebookCache;
    renderMyGradebook(_firstGradebookQuarter(_activeGradebook));
    ov.style.display = 'block';
    _attachMyGradebookKeyHandler();
    try { if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('click', 0.3); } catch (_) {}
}

// ── Teacher: Class Gradebook ──────────────────────────────────────────────────
// Reuses the My Gradebook modal: pick a section (only shown when >1 exists) + a
// student → render that student's gradebook (the EXACT view the student sees).
// Data = /class/grades (teacher-gated; the teacher's own session token authorizes
// it). Fetches ALL sections so the section picker can enumerate them; today
// (everyone in PeriodX) that's one section and the picker stays hidden.
var _classGradebookAll = [];        // every student across all sections
var _classGradebookStudents = [];   // the currently-shown (section-filtered) subset

async function openClassGradebook() {
    var ov = document.getElementById('my-gradebook-overlay');
    if (!ov) return;
    if (!window.rosterClient || typeof window.rosterClient.token !== 'function') return;
    var token = window.rosterClient.token();
    var base = window.ROSTER_SERVICE_URL;
    if (!token || !base) return;
    var who = (window.rosterClient.current && window.rosterClient.current()) || {};

    var title = document.getElementById('my-gradebook-title'); if (title) title.textContent = 'Class Gradebook';
    var body = document.getElementById('my-gradebook-body');
    if (body) { while (body.firstChild) body.removeChild(body.firstChild); var ld = document.createElement('div'); ld.textContent = 'Loading class…'; ld.style.cssText = 'color:#888;padding:6px 0'; body.appendChild(ld); }
    ov.style.display = 'block';
    _attachMyGradebookKeyHandler();

    var students = [];
    var loadFailed = false;
    try {
        var res = await fetch(base + '/class/grades', { headers: { Authorization: 'Bearer ' + token } });
        var data = await res.json();
        if (data && data.ok && Array.isArray(data.students)) students = data.students;
        else loadFailed = true; // ok:false / 401 / malformed payload
    } catch (_) { loadFailed = true; }
    _classGradebookAll = students;

    if (!students.length) {
        var secRow0 = document.getElementById('my-gradebook-section-row'); if (secRow0) secRow0.style.display = 'none';
        var stuRow0 = document.getElementById('my-gradebook-student-row'); if (stuRow0) stuRow0.style.display = 'none';
        if (body) {
            while (body.firstChild) body.removeChild(body.firstChild);
            var em = document.createElement('div');
            em.textContent = loadFailed
                ? 'Could not load the class — sign in as a teacher again, or check your connection.'
                : 'No students found for this class yet.';
            em.style.cssText = 'color:#888;font-style:italic;padding:6px 0';
            body.appendChild(em);
        }
        return;
    }

    // Distinct sections → a section picker, shown only when more than one exists.
    var sections = [];
    students.forEach(function (s) { var sec = s.section || ''; if (sec && sections.indexOf(sec) === -1) sections.push(sec); });
    sections.sort();
    var secRow = document.getElementById('my-gradebook-section-row');
    var secSel = document.getElementById('my-gradebook-section');
    if (secSel) {
        while (secSel.firstChild) secSel.removeChild(secSel.firstChild);
        var allOpt = document.createElement('option'); allOpt.value = '__all__'; allOpt.textContent = 'All sections'; secSel.appendChild(allOpt);
        sections.forEach(function (sec) { var o = document.createElement('option'); o.value = sec; o.textContent = sec; secSel.appendChild(o); });
        secSel.value = (who.section && sections.indexOf(who.section) !== -1) ? who.section : '__all__';
        secSel.onchange = function () { _renderClassSectionStudents(secSel.value); };
    }
    if (secRow) secRow.style.display = (sections.length > 1) ? 'block' : 'none';

    _renderClassSectionStudents(secSel ? secSel.value : '__all__');
    try { if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('click', 0.3); } catch (_) {}
}

// Populate the student picker for the chosen section ('__all__' = every section),
// sorted by real name, and render the first student. Never throws.
function _renderClassSectionStudents(sectionFilter) {
    var all = _classGradebookAll || [];
    var filtered = (sectionFilter && sectionFilter !== '__all__')
        ? all.filter(function (s) { return (s.section || '') === sectionFilter; })
        : all.slice();
    filtered.sort(function (a, b) { return String((a && a.realName) || '').localeCompare(String((b && b.realName) || '')); });
    _classGradebookStudents = filtered;

    var row = document.getElementById('my-gradebook-student-row');
    var sel = document.getElementById('my-gradebook-student');
    if (sel) {
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        filtered.forEach(function (s, i) {
            var o = document.createElement('option');
            o.value = String(i);
            o.textContent = (s.realName || s.username || 'Student');
            sel.appendChild(o);
        });
        sel.onchange = function () { _selectClassStudent(Number(sel.value) || 0); };
    }
    if (row) row.style.display = filtered.length ? 'block' : 'none';

    if (filtered.length) {
        _selectClassStudent(0);
    } else {
        var body = document.getElementById('my-gradebook-body');
        if (body) { while (body.firstChild) body.removeChild(body.firstChild); var em = document.createElement('div'); em.textContent = 'No students in this section.'; em.style.cssText = 'color:#888;font-style:italic;padding:6px 0'; body.appendChild(em); }
    }
}

// Render the picked student's gradebook into the shared modal. Sets the cache the
// renderer reads (benign: a teacher account has no own-gradebook to preserve; the
// next Do Now refresh re-populates it).
function _selectClassStudent(idx) {
    var s = _classGradebookStudents[idx];
    if (!s) return;
    // Show this student WITHOUT clobbering the Do Now cache (_gradeGradebookCache).
    _activeGradebook = s.gradebook || null;
    var title = document.getElementById('my-gradebook-title');
    if (title) title.textContent = (s.realName || s.username || 'Student') + ' — Gradebook';
    renderMyGradebook(_firstGradebookQuarter(_activeGradebook));
}

// ── My Gradebook: date-gating + threshold-coloring helpers ────────────────────

// { lessonKey: Date } from the calendar schedule for the CURRENT period (cP).
// A combined cell ("1.2+1.3") maps each sub-key to that date. Returns {} when the
// schedule globals aren't available (renderMyGradebook then shows ALL columns —
// a safe degrade for isolated test sandboxes). Never throws.
function _lessonDateMap() {
    var map = {};
    try {
        if (typeof S === 'undefined' || !Array.isArray(S)) return map;
        var colIdx = (typeof cP === 'string' && cP === 'B') ? 3 : 4;
        for (var i = 0; i < S.length; i++) {
            var e = S[i];
            if (!e) continue;
            var inf = e[colIdx];
            if (!inf || typeof inf !== 'object' || !inf.t) continue;  // OFF/NC/EX/PO/R tokens
            var dt = new Date(e[0], e[1], e[2]);
            var parts = typeof groupTopics==='function'&&inf.group ? groupTopics(inf) : String(inf.t).split('+');
            for (var p = 0; p < parts.length; p++) {
                var key = parts[p].trim();
                if (key && !map[key]) map[key] = dt;
            }
        }
    } catch (_) {}
    return map;
}

// The date a gradebook column is "due" by. Lesson columns: the latest date among
// their topicKeys. PC/Poster (unit-level, empty topicKeys): the unit's EARLIEST
// lesson date (the unit is "underway" once it starts). null when unknown.
function _colScheduledDate(col, dateMap) {
    if (col.topicKeys && col.topicKeys.length) {
        var latest = null;
        for (var i = 0; i < col.topicKeys.length; i++) {
            var d = dateMap[col.topicKeys[i]];
            if (d && (!latest || d > latest)) latest = d;
        }
        return latest;
    }
    var earliest = null;
    for (var key in dateMap) {
        if (parseInt(key, 10) === col.unit) {
            var dk = dateMap[key];
            if (dk && (!earliest || dk < earliest)) earliest = dk;
        }
    }
    return earliest;
}

// Threshold band for a 0-100 score, tied to the grade rules (40% floor, 70% cap).
// Returns { fg, bg } or null for not-a-number.
function _gradeBand(v) {
    if (typeof v !== 'number' || isNaN(v)) return null;
    if (v >= 90) return { fg: '#0a6b2e', bg: '#d4efdd' };  // deep green
    if (v >= 70) return { fg: '#25663F', bg: '#e6f6ec' };  // green — clears the 70% cap
    if (v >= 40) return { fg: '#9a6a00', bg: '#fbeecb' };  // amber — above floor, below cap
    return { fg: '#B03A2E', bg: '#fbe2de' };               // red — below the 40% floor
}

// "Jun 4" style short date, reusing the Desk's MN month names when present.
function _gbDateStr(d) {
    try { if (typeof MN !== 'undefined' && Array.isArray(MN) && MN[d.getMonth()]) return MN[d.getMonth()] + ' ' + d.getDate(); } catch (_) {}
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return m[d.getMonth()] + ' ' + d.getDate();
}

function renderMyGradebook(qk, bodyEl, tabsEl) {
    _myGradebookQuarter = qk;
    // bodyEl/tabsEl default to the modal's elements; My Ledger passes its OWN
    // containers so the same breakdown renders inline inside the wallet.
    var body = bodyEl || document.getElementById('my-gradebook-body');
    var tabs = tabsEl || document.getElementById('my-gradebook-qtabs');
    if (!body || !tabs) return;

    // Quarter tabs.
    tabs.innerHTML = '';
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(function (k) {
        var b = document.createElement('button');
        b.className = 's7btn';
        b.style.cssText = 'font-size:9px;padding:1px 6px' + (k === qk ? ';font-weight:bold;background:#cde' : '');
        b.textContent = k;
        b.onclick = function () { renderMyGradebook(k, body, tabs); };
        tabs.appendChild(b);
    });

    while (body.firstChild) body.removeChild(body.firstChild);

    function _n(x) { return (typeof x === 'number') ? (Math.round(x * 10) / 10).toFixed(1) : '—'; }

    var gb = _activeGradebook;
    var gq = gb && gb.quarters && gb.quarters[qk];
    var weights = (gb && gb.weights) || {};
    if (!gq || !Array.isArray(gq.columns) || !gq.columns.length) {
        var empty = document.createElement('div');
        empty.textContent = 'No gradebook for ' + qk + ' yet — it fills in as you do the work.';
        empty.style.cssText = 'color:#888;font-style:italic;padding:6px 0';
        body.appendChild(empty);
        return;
    }

    var cells = gq.cells || {};
    var ca = gq.categoryAverages || {};

    // ── Date-gate: show a column if it's been STARTED, or its calendar date has
    // arrived (due up to today). Future, not-yet-started work stays hidden. Falls
    // back to showing everything when the schedule isn't available. ──
    var dateMap = _lessonDateMap();
    var hasSchedule = false; for (var _dk in dateMap) { hasSchedule = true; break; }
    var today = (typeof tdy === 'function') ? tdy() : new Date();
    function _visible(col) {
        if (cells[col.key] != null) return true;                 // started → always show
        // Prefer the SERVER-stamped `due` flag (the identical signal the teacher
        // dashboard gates on, computed from lesson-schedule.json) so the student
        // self-view, the in-Desk Class Gradebook, and teacher-dashboard.html never
        // disagree on what's "due". Fall back to the Desk's own calendar only when
        // the server didn't stamp it (older server / no schedule) — a safe degrade.
        if (col.due !== undefined) return col.due !== false;
        if (!hasSchedule) return true;                           // no schedule → show all (safe)
        var d = _colScheduledDate(col, dateMap);
        return d != null && d <= today;                          // due by today (client fallback)
    }
    var visibleCols = gq.columns.filter(_visible);
    var oweCount = visibleCols.filter(function (c) { return cells[c.key] == null; }).length;
    // Schoology colour key (EFFORT_VISIBILITY_V2_SPEC §4): a scored cell whose column is DUE is
    // in Schoology now (blue-grey); a scored cell not yet due is recorded ahead (green). Only
    // when the server stamps `due` on the columns — an older cache shows no colours and no key.
    var colourKey = gq.columns.some(function (c) { return c.due !== undefined; });

    // ── As-of caption (makes the date-scoping obvious — nothing "disappeared") ──
    var cap = document.createElement('div');
    cap.style.cssText = 'font-size:10px;color:#666;margin-bottom:6px';
    cap.textContent = hasSchedule
        ? (qk + ' — showing everything due through ' + _gbDateStr(today) + ', plus anything already started.')
        : (qk + ' — full gradebook.');
    body.appendChild(cap);

    // ── "What you owe" badge: due, but not done yet ──
    if (oweCount > 0) {
        var owe = document.createElement('div');
        owe.style.cssText = 'font-size:10px;font-weight:bold;color:#9a6a00;background:#fbeecb;border:1px solid #e3cf8f;border-radius:3px;padding:3px 7px;margin-bottom:8px';
        owe.textContent = '⚠ ' + oweCount + (oweCount === 1 ? ' thing is' : ' things are') + ' due, not done yet';
        body.appendChild(owe);
    }

    // ── Totals: live v3 grade + Schoology report-card estimate + the why ──
    var rc = gq.reconciliation || {};
    var totals = document.createElement('div');
    totals.style.cssText = 'border:1px solid var(--black);background:#fafafa;padding:6px 8px;margin-bottom:8px';
    var line1 = document.createElement('div');
    line1.style.cssText = 'margin-bottom:2px';
    // Labels match the colour key under the grid (EFFORT_VISIBILITY_V2_SPEC §4): "Desk" and "Schoology now".
    var yourLbl = document.createElement('span'); yourLbl.textContent = 'Desk: '; yourLbl.style.fontWeight = 'bold';
    var yourVal = document.createElement('span'); yourVal.textContent = _n(gq.v3Total);
    var ytBand = _gradeBand(gq.v3Total);
    yourVal.style.cssText = 'font-weight:bold;font-size:14px;' + (ytBand ? 'color:' + ytBand.fg : '');
    line1.appendChild(yourLbl); line1.appendChild(yourVal);
    var sch = document.createElement('span');
    var scBand = _gradeBand(gq.schoologyTotal);
    sch.style.cssText = 'margin-left:10px;font-weight:bold;color:' + (scBand ? scBand.fg : '#555');
    sch.textContent = 'Schoology now: ' + _n(gq.schoologyTotal);
    line1.appendChild(sch);
    if (rc.delta != null && Math.abs(rc.delta) >= 0.1) {
        var d = document.createElement('span');
        d.style.cssText = 'margin-left:8px;font-size:10px;color:' + (rc.delta > 0 ? '#25663F' : '#B03A2E');
        d.textContent = '(Δ ' + (rc.delta > 0 ? '+' : '') + (Math.round(rc.delta * 10) / 10).toFixed(1) + ')';
        line1.appendChild(d);
    }
    totals.appendChild(line1);
    if (rc.reason) {
        var why = document.createElement('div');
        why.style.cssText = 'font-size:10px;color:#555;margin-top:3px;line-height:1.4';
        why.textContent = rc.reason;
        totals.appendChild(why);
    }
    body.appendChild(totals);

    // ── Visible component cells grouped by Schoology category ──
    var byCat = {};
    visibleCols.forEach(function (c) { (byCat[c.category] || (byCat[c.category] = [])).push(c); });
    // Ordered categories first, then any leftover category so the breakdown always
    // reconciles (no category silently dropped).
    var order = _myGradebookCatOrder().slice();
    Object.keys(byCat).forEach(function (cat) { if (order.indexOf(cat) === -1) order.push(cat); });

    order.forEach(function (cat) {
        var cols = byCat[cat];
        if (!cols || !cols.length) return;          // hide a category with nothing to show
        var sec = document.createElement('div');
        sec.style.cssText = 'margin-bottom:8px';
        var head = document.createElement('div');
        head.style.cssText = 'font-family:Chicago,monospace;font-size:11px;font-weight:bold;border-bottom:1px solid #ccc;margin-bottom:3px;display:flex;justify-content:space-between;align-items:baseline';
        var hl = document.createElement('span');
        hl.textContent = cat + (weights[cat] != null ? ' (' + weights[cat] + '%)' : '');
        // Flag a category below the 40% floor (the line that caps the grade).
        if (typeof ca[cat] === 'number' && ca[cat] < 40) {
            var flag = document.createElement('span');
            flag.style.cssText = 'color:var(--bad);font-size:9px;font-weight:bold;margin-left:6px';
            flag.textContent = '⚠ below the 40% floor';
            hl.appendChild(flag);
        }
        var hr = document.createElement('span');
        var caBand = _gradeBand(ca[cat]);
        hr.style.color = (caBand ? caBand.fg : '#999');
        hr.textContent = (ca[cat] != null ? 'avg ' + _n(ca[cat]) : '—');
        head.appendChild(hl); head.appendChild(hr);
        sec.appendChild(head);

        cols.forEach(function (c) {
            var v = cells[c.key];
            var band = _gradeBand(v);
            var row = document.createElement('div');
            row.style.cssText = 'position:relative;display:flex;justify-content:space-between;align-items:center;padding:2px 5px;margin:1px 0;border-radius:2px;overflow:hidden;'
                + (band ? 'background:#fff;' : 'background:#fdf6e3;');   // amber tint = due, not done
            var keyed = colourKey && band;
            if (keyed) {
                // The tint replaces the score micro-bar, so blue-grey vs green is never
                // confused with a green score band.
                var ahead = c.due === false;
                row.className = ahead ? 'mgb-cell-ahead' : 'mgb-cell-schoology';
                row.style.background = ahead ? '#eaf6ea' : '#e6eef7';
                row.style.border = '1px solid ' + (ahead ? '#2a8a2a' : '#2B5C8A');
                row.title = ahead
                    ? 'Recorded ahead — counts on the Desk, not in Schoology yet'
                    : 'In Schoology; this is in your Schoology grade';
            }
            // Progress micro-bar: a band-colored fill sized to the score, behind the text.
            if (band && !keyed) {
                var bar = document.createElement('div');
                bar.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:' + Math.max(0, Math.min(100, v)) + '%;background:' + band.bg + ';pointer-events:none';
                row.appendChild(bar);
            }
            var nm = document.createElement('span');
            nm.style.cssText = 'position:relative;z-index:1';
            nm.textContent = Array.isArray(c.topicKeys) && c.topicKeys.length
                ? c.topicKeys.map(function (key) { return cedLabel(key).text; }).join(' / ')
                : cedDisplayText(c.title);
            var vv = document.createElement('span');
            if (band) {
                vv.style.cssText = 'position:relative;z-index:1;font-variant-numeric:tabular-nums;font-weight:bold;color:' + band.fg;
                vv.textContent = _n(v);
            } else {
                vv.style.cssText = 'position:relative;z-index:1;font-size:10px;font-style:italic;color:#9a6a00';
                vv.textContent = 'not done yet';
            }
            row.appendChild(nm); row.appendChild(vv);
            sec.appendChild(row);
        });
        body.appendChild(sec);
    });

    var projectedTotal = (gq.aheadCells > 0 && typeof gq.schoologyProjectedTotal === 'number') ? gq.schoologyProjectedTotal : null;
    if (colourKey) body.appendChild(_myGradebookColourKey(gq.schoologyTotal, gq.v3Total, projectedTotal));
}

// The key under the My Gradebook grid (EFFORT_VISIBILITY_V2_SPEC §4): what the two colours mean
// and the two totals they add up to — Schoology now and the Desk quarter grade.
function _myGradebookColourKey(schoologyNow, desk, projected) {
    function pct(x) { return (typeof x === 'number') ? ' ' + Math.round(x) + '%' : ' —'; }
    function swatch(bg, border) {
        var s = document.createElement('span');
        s.setAttribute('aria-hidden', 'true');
        s.style.cssText = 'display:inline-block;width:9px;height:9px;margin-right:4px;vertical-align:-1px;background:' + bg + ';border:1px solid ' + border;
        return s;
    }
    var key = document.createElement('div');
    key.className = 'mgb-key';
    key.style.cssText = 'font-size:10px;color:#333;line-height:1.45;border-top:1px solid #ccc;padding-top:5px;margin-top:4px';
    var now = document.createElement('div');
    now.className = 'mgb-key-schoology';
    now.appendChild(swatch('#e6eef7', '#2B5C8A'));
    now.appendChild(document.createTextNode('In Schoology now — these average to the number you see there:' + pct(schoologyNow) + '.'));
    var ahead = document.createElement('div');
    ahead.className = 'mgb-key-ahead';
    ahead.appendChild(swatch('#eaf6ea', '#2a8a2a'));
    // AHEAD_WORK_PROJECTION_SPEC: projected = what Schoology reads once the ahead cells come due
    // (null when nothing is ahead or the payload predates the field).
    var projectedText = (typeof projected === 'number')
        ? ' → Schoology will read about ' + (Math.round(projected * 10) / 10) + '% once these come due.'
        : '';
    ahead.appendChild(document.createTextNode('Recorded ahead of the calendar — counted on the Desk, reaches Schoology when the class gets there. Desk quarter grade:' + pct(desk) + '.' + projectedText));
    key.appendChild(now);
    key.appendChild(ahead);
    return key;
}
