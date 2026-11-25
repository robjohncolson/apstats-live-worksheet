function _walletPrependZeroCard(host) {
    try {
        if (!host) return;
        var old = host.querySelector('.wallet-zero-card');
        var warns = _zeroCurrentWarnings();
        // Past due in Schoology, but the 0 is still far off: quiet grey rows below (PAST_DUE_WORK).
        // Late rows (QUARTER_ZERO_FREEZE_SPEC) are never a 0: grey too, under their own heading.
        var later = (typeof _pastDueCurrentWork === 'function') ? _pastDueCurrentWork() : [];
        var notYet = later.filter(function (w) { return !w.late; });
        var late = later.filter(function (w) { return w.late; });
        // QUARTER_LINE_BY_DUE_DATE_SPEC §3.2: each row listed ONCE, under the quarter it counts in
        // (null = one plain list, today's card).
        var view = (typeof _zeroQuarterView === 'function') ? _zeroQuarterView(warns.concat(later)) : null;
        // Same list as last paint → keep the card (a grade poll must not steal
        // focus from an Open button the student is tabbing through). A row turning late rebuilds it.
        var sig = warns.map(function (w) { return w.lessonKey + ':' + w.kind + ':' + (w.past ? 1 : 0); }).join('|');
        if (later.length) sig += '#later:' + later.map(function (w) { return w.lessonKey + ':' + w.kind + (w.late ? ':late' : ''); }).join('|');
        if (view) sig += '#q:' + view.sig;   // crossing a close (or a regrouping) rebuilds the card
        if (old && old.dataset.sig === sig) {
            // Same rows, but the grade in the status line may have moved: refresh the text only.
            var oldStatus = old.querySelector('.wz-status');
            if (oldStatus) oldStatus.textContent = _zeroCardStatus(warns, later);
            return;
        }
        if (old) old.remove();
        if (!warns.length && !later.length) return;
        var card = document.createElement('div');
        // Red frame once something is a 0; yellow while everything is still only "soon";
        // grey when nothing is close to a 0 (only past-due rows).
        var frame = ' wz-soon';
        if (warns.some(function (w) { return w.past; })) frame = '';
        if (!warns.length) frame = ' wz-calm';
        card.className = 'wallet-zero-card' + frame;
        card.dataset.sig = sig;
        var status = document.createElement('div');
        status.className = 'wz-status geneva';
        status.textContent = _zeroCardStatus(warns, later);
        card.appendChild(status);
        // §3.2: a quarter heading (its own class, never .wz-later-head) before the first row of each
        // quarter. The rows keep today's one order (past, soon, past due, late); the quarters come
        // out contiguous in it because a later quarter's 0 dates all come after an earlier one's.
        var shownQuarter = null;
        var quarterHead = function (w) {
            var q = view ? view.quarterOf(w) : null;
            if (!q || q === shownQuarter) return;
            shownQuarter = q;
            var qHead = document.createElement('div');
            qHead.className = 'wz-quarter-head geneva';
            qHead.textContent = view.heading(q);
            card.appendChild(qHead);
        };
        // §3.2: a row taught in the closing quarter but counting in the next one says it can still help.
        var addRow = function (w, row) {
            var lift = view ? view.lift(w) : '';
            if (lift) {
                var note = document.createElement('span');
                note.className = 'wz-lift';
                note.textContent = lift;
                row.classList.add('wz-has-lift');
                row.appendChild(note);
            }
            card.appendChild(row);
        };
        // Past first, then by date (warns are already date-ordered). Colour carries the meaning.
        var ordered = warns.filter(function (w) { return w.past; }).concat(warns.filter(function (w) { return !w.past; }));
        ordered.forEach(function (w) { quarterHead(w); addRow(w, _zeroCardRow(w)); });
        if (notYet.length) {
            quarterHead(notYet[0]);
            var head = document.createElement('div');
            head.className = 'wz-later-head geneva';
            head.textContent = 'Past due — not counting yet';
            card.appendChild(head);
            notYet.forEach(function (w) { quarterHead(w); addRow(w, _pastDueCardRow(w)); });
        }
        if (late.length) {
            quarterHead(late[0]);
            var lateHead = document.createElement('div');
            lateHead.className = 'wz-later-head wz-late-head geneva';
            lateHead.textContent = 'Late — never a 0';
            card.appendChild(lateHead);
            late.forEach(function (w) { quarterHead(w); addRow(w, _pastDueCardRow(w)); });
        }
        host.insertBefore(card, host.firstChild);
        _zeroCardAttachScores(card, ordered);
    } catch (_) {}
}
// The status line: the zero wording when anything is close to a 0; calm wording
// when the card holds only past-due rows (nothing is becoming a 0 soon). Late rows
// (QUARTER_ZERO_FREEZE_SPEC) never become a 0, so they get their own sentence.
// QUARTER_LINE_BY_DUE_DATE_SPEC §3.2: lead (optional) replaces the current-quarter lead; the
// grouped card passes each quarter's own ('Quarter 2 so far: 85%. ').
function _zeroCardStatus(warns, later, lead) {
    // §3.2: grouped rows get one sentence per quarter, each counting only its own rows.
    if (lead === undefined && typeof _zeroQuarterStatus === 'function') {
        var grouped = _zeroQuarterStatus(warns, later);
        if (grouped) return grouped;
    }
    if (warns.length) return _zeroStatusText(warns, lead);
    if (lead === undefined) {
        var grade = (typeof _walletCurrentGrade === 'function') ? _walletCurrentGrade() : null;
        // Review D4: 'Quarter 2 so far: 85%.', never "Q2" (the same card shows quartiles).
        var quarterWords = (grade && grade.q && typeof _quarterName === 'function') ? _quarterName(grade.q) : (grade && grade.q);
        lead = (grade && grade.pct != null && grade.q) ? quarterWords + ' so far: ' + grade.pct + '%. ' : '';
    }
    var notYet = later.filter(function (w) { return !w.late; }).length;
    var late = later.length - notYet;
    var text = lead;
    if (notYet === 1) text += '1 item below is past due. It is not counting yet — finishing it now keeps it that way.';
    else if (notYet) text += notYet + ' items below are past due. They are not counting yet — finishing them now keeps it that way.';
    if (late) text += (notYet ? ' ' : '') + _zeroLateStatusText(late, notYet > 0);
    return text;
}
// The grouped card's status (§3.2): one sentence per quarter, in calendar order, each led by that
// quarter's own grade and counting only that quarter's rows. '' when the rows are not grouped.
function _zeroQuarterStatus(warns, later) {
    var view = (typeof _zeroQuarterView === 'function') ? _zeroQuarterView(warns.concat(later)) : null;
    if (!view) return '';
    return view.quarters.map(function (q) {
        var mine = function (w) { return view.quarterOf(w) === q; };
        return _zeroCardStatus(warns.filter(mine), later.filter(mine), _quarterStatusLead(q, view.phase));
    }).join(' ');
}
// 'Quarter 2 so far: 85%. ', 'Quarter 1 so far: 92% (closes Tue Nov 10). ', or 'Quarter 2: '
// before the quarter has a grade.
function _quarterStatusLead(q, phase) {
    var grade = (typeof _walletQuarterGrade === 'function') ? _walletQuarterGrade(q) : null;
    var close = (phase && phase.closing === q) ? _quarterConfig(q).close : null;
    var tail = close ? ' (closes ' + _quarterDayText(close) + ')' : '';
    if (grade && grade.pct != null) return _quarterName(q) + ' so far: ' + grade.pct + '%' + tail + '. ';
    return _quarterName(q) + tail + ': ';
}
// "2 items below are late: never a 0, and finishing them still counts." (more: after past-due rows.)
function _zeroLateStatusText(n, more) {
    if (n === 1) return (more ? '1 more is' : '1 item below is') + ' late: never a 0, and finishing it still counts.';
    return (more ? n + ' more are' : n + ' items below are') + ' late: never a 0, and finishing them still counts.';
}
// The "graph" link under a Missing-work row: the class's graphs for THIS assignment only, in the
// forms the class has learned, drawn inline under the score list. Toggles open / closed.
function _zeroCardToggleGraph(list, see, a, tentative, ownTentative, tentDay) {
    var open = list.querySelector('.wz-graph');
    if (open) { open.remove(); see.textContent = 'graph'; see.setAttribute('aria-expanded', 'false'); return; }
    var panel = document.createElement('div'); panel.className = 'wz-graph';
    var teacher = (typeof _deskIsTeacher === 'function') && _deskIsTeacher();
    var modes = teacher ? { available: ['dot', 'stem', 'hist', 'box'], default: 'box' } : _snapModes();
    var mode = (_snapApp && _snapApp.amode && modes.available.indexOf(_snapApp.amode) >= 0) ? _snapApp.amode : modes.default;
    var paint = function () {
        panel.innerHTML = '';
        if (modes.available.length > 1) {
            var bar = document.createElement('div'); bar.className = 'snap-tabs snap-amodes';
            modes.available.forEach(function (m) {
                var b = document.createElement('button'); b.type = 'button'; b.className = 's7btn'; b.style.cssText = 'font-size:10px;padding:1px 6px';
                b.textContent = ClassSnapshot.LABEL[m]; b.setAttribute('aria-pressed', String(m === mode));
                b.onclick = function () { mode = m; if (_snapApp) _snapApp.amode = m; paint(); };
                bar.appendChild(b);
            });
            panel.appendChild(bar);
        }
        _snapAssignmentPlot(panel, a, 0, undefined, mode, tentative, ownTentative, tentDay);
    };
    paint();
    list.appendChild(panel);
    see.textContent = 'hide graph'; see.setAttribute('aria-expanded', 'true');
}
// Under each Missing-work row: everyone's scores for that assignment, right here (no names).
// Yellow = a 0 not counting yet, red = you. Fetched once (cached by the Snapshot app's loader).
function _zeroCardAttachScores(card, warns) {
    if (typeof _snapFetchAssignments !== 'function' || typeof _snapScoreList !== 'function') return;
    var p = _snapFetchAssignments('all', false);
    if (!p || typeof p.then !== 'function') return;
    p.then(function (data) {
        if (!card.isConnected || !data || !Array.isArray(data.assignments)) return;
        warns.forEach(function (w) {
            var key = w.lessonKey + ':' + (w.kind === 'blooket' ? 'blooket' : w.kind === 'quiz' ? 'quiz' : 'worksheet');
            var a = null;
            for (var i = 0; i < data.assignments.length; i++) if (data.assignments[i].key === key) { a = data.assignments[i]; break; }
            if (!a) return;
            var row = card.querySelector('.wz-row[data-key="' + key + '"]');
            if (!row || row.nextSibling && row.nextSibling.className && String(row.nextSibling.className).indexOf('snap-alist') === 0) return;
            var tentative = Number(a.tentativeZeros) || 0;
            var tentDay = _zeroDayText(w.zeroDate);
            var built = _snapScoreList(a, 0, undefined, { tentative: tentative, ownTentative: !w.past, tentDay: tentDay, isZero: true, sections: data.sections });
            if (!built.shown) return;
            built.list.classList.add('wz-scores');
            row.parentNode.insertBefore(built.list, row.nextSibling);
            var see = row.querySelector('.wz-see');
            if (see) {
                see.disabled = false;
                see.onclick = function () { _zeroCardToggleGraph(built.list, see, a, tentative, !w.past, tentDay); };
            }
        });
    }).catch(function () {});
}
// The one-line status at the top of the Missing-work card (LEDGER_CALM_SPEC §2.2). No projected
// "up to X" number: the quarter engine is server-side (spec §6).
// lead (optional, QUARTER_LINE_BY_DUE_DATE_SPEC §3.2): a quarter's own lead from the grouped card.
function _zeroStatusText(warns, lead) {
    if (lead === undefined) {
        var grade = (typeof _walletCurrentGrade === 'function') ? _walletCurrentGrade() : null;
        // Review D4: 'Quarter 2 so far: 85%.', never "Q2" (the same card shows quartiles).
        var quarterWords = (grade && grade.q && typeof _quarterName === 'function') ? _quarterName(grade.q) : (grade && grade.q);
        lead = (grade && grade.pct != null && grade.q) ? quarterWords + ' so far: ' + grade.pct + '%. ' : '';
    }
    var n = warns.length;
    var past = warns.filter(function (w) { return w.past; }).length;
    var soon = n - past;
    if (past && soon) {
        // Mixed: say exactly how many count today and how many are still coming.
        return lead + (past === 1 ? '1 item below is a 0 now' : past + ' items below are 0s now') + ', '
            + soon + ' more ' + (soon === 1 ? 'becomes' : 'become') + ' a 0 by ' + _zeroLatestSoonDay(warns)
            + ' — finishing them is the fastest way up.';
    }
    if (past) {
        if (n === 1) return lead + 'The 1 item below counts as 0 — finishing it is the fastest way up.';
        return lead + 'The ' + n + ' items below count as 0 — finishing them is the fastest way up.';
    }
    var by = _zeroLatestSoonDay(warns);
    if (n === 1) return lead + '1 item below becomes a 0 by ' + by + ' — finish it first.';
    return lead + n + ' items below become a 0 by ' + by + ' — finish them first.';
}
// One Missing-work row: [verb button] [lesson label] ... [date] [class].
function _zeroCardRow(w) {
    var row = document.createElement('div');
    row.className = 'wz-row' + (w.past ? ' wz-past' : '') + (w.kind === 'blooket' ? ' wz-blooket' : '') + (w.kind === 'quiz' ? ' wz-quiz' : '');
    row.dataset.key = w.lessonKey + ':' + (w.kind === 'blooket' ? 'blooket' : w.kind === 'quiz' ? 'quiz' : 'worksheet');
    var label = (typeof cedLabel === 'function') ? cedLabel(w.lessonKey).text : w.lessonKey;
    row.appendChild(_zeroCardActionButton(w, label));
    var name = document.createElement('span');
    name.className = 'wz-label';
    name.textContent = label;
    row.appendChild(name);
    var sgy = (typeof _zeroSchoologyTag === 'function') ? _zeroSchoologyTag(w) : null;
    if (sgy) row.appendChild(sgy);
    var when = document.createElement('span');
    when.className = 'wz-when';
    when.textContent = _zeroWhenText(w);
    row.appendChild(when);
    var see = document.createElement('button');
    see.type = 'button'; see.className = 'wz-see';
    see.textContent = 'graph';
    see.title = 'The graphs of the class on this one (no names)';
    see.disabled = true;   // enabled once the class picture has loaded (_zeroCardAttachScores)
    see.onclick = function () { _snapOpenAssignment(w.lessonKey, w.kind); };
    row.appendChild(see);
    return row;
}
// The verb button of a Missing-work row: Open / Quiz / Flashcards.
function _zeroCardActionButton(w, label) {
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 's7btn';
    if (w.kind === 'blooket') {
        btn.textContent = 'Flashcards';
        btn.onclick = function () { _zeroOpenFlashcards(btn, w.lessonKey); };
    } else if (w.kind === 'quiz') {
        btn.textContent = 'Quiz';
        btn.onclick = function () { _zeroOpenQuiz(w.lessonKey); };
    } else {
        btn.textContent = 'Open';
        btn.onclick = function () { _zeroOpenLesson(w.lessonKey); };
    }
    btn.setAttribute('aria-label', btn.textContent + ' ' + label);
    return btn;
}
// The small muted "Schoology: 3.1 Follow-Along" tag, so the student can match the row
// to the Schoology column (Schoology keeps the old lesson key).
// Returns null when the title is unknown (the caller then adds nothing).
function _zeroSchoologyTag(w) {
    var title = _zeroSchoologyTitle(w);
    if (!title) return null;
    var tag = document.createElement('span');
    tag.className = 'wz-sgy';
    // QUARTER_LINE_BY_DUE_DATE_SPEC §3.5: names the marking period when two share the title.
    tag.textContent = ((typeof _zeroSchoologyLabel === 'function') ? _zeroSchoologyLabel(w) : null) || ('Schoology: ' + title);
    return tag;
}
// "due Fri 9/25 · not a 0 until after Thu 10/8" (a 0 starts the day AFTER zeroDate, like _zeroWhenText).
// A late row (its quarter closed before its zero date, QUARTER_ZERO_FREEZE_SPEC) never becomes a 0.
function _pastDueWhenText(w) {
    if (w.late) return 'late · no 0 · counts when you finish it';
    return 'due ' + _zeroDayText(w.dueDate) + ' · not a 0 until after ' + _zeroDayText(w.zeroDate);
}
// One quiet grey past-due row: [verb button] [lesson label] [Schoology tag] ... [dates].
function _pastDueCardRow(w) {
    var row = document.createElement('div');
    row.className = 'wz-row wz-later';
    row.dataset.key = w.lessonKey + ':' + w.kind + ':later';
    var label = (typeof cedLabel === 'function') ? cedLabel(w.lessonKey).text : w.lessonKey;
    row.appendChild(_zeroCardActionButton(w, label));
    var name = document.createElement('span');
    name.className = 'wz-label';
    name.textContent = label;
    row.appendChild(name);
    var sgy = _zeroSchoologyTag(w);
    if (sgy) row.appendChild(sgy);
    var when = document.createElement('span');
    when.className = 'wz-when';
    when.textContent = _pastDueWhenText(w);
    row.appendChild(when);
    return row;
}

function updateWalletReadinessIcon() {
    try { _updateZeroWarningBadge(); } catch (_) {}
    try { _updateDoNowMissingPill(); } catch (_) {}
    try {
        var icon = document.querySelector('.app-icon[data-app="wallet"]');
        if (!icon) return;
        var img = icon.querySelector('.icon-img');
        if (!img) return;
        var dot = img.querySelector('.wallet-readiness-dot');
        if (!dot) {
            dot = document.createElement('span');
            dot.className = 'wallet-readiness-dot';
            img.appendChild(dot);
        }
        var readiness = _walletDisplayReadiness();
        if (!readiness || readiness.state === 'nodue' || readiness.state === 'notdue' || typeof readiness.hue !== 'number') {
            dot.style.display = 'none';
            dot.style.backgroundColor = '#b8b8b8';
            icon.removeAttribute('data-readiness-state');
            icon.style.removeProperty('--rdy-hue');
            return;
        }
        dot.style.display = 'block';
        dot.style.backgroundColor = 'hsl(' + readiness.hue + ',70%,45%)';
        // ICON_MOTION -- drive the icon's gesture via a state attribute + hue var
        // (CSS owns state->animation). Only rewrite the attribute when the state
        // changes so a plain /grade poll never restarts the animation.
        icon.style.setProperty('--rdy-hue', String(readiness.hue));
        var prevState = icon.getAttribute('data-readiness-state');
        if (readiness.state === 'done' && prevState && prevState !== 'done') {
            // One-shot "settle" celebration on first entering done.
            icon.classList.remove('readiness-justdone');
            void icon.offsetWidth; // force reflow so the animation restarts
            icon.classList.add('readiness-justdone');
            setTimeout(function () { try { icon.classList.remove('readiness-justdone'); } catch (_) {} }, 600);
        }
        if (prevState !== readiness.state) icon.setAttribute('data-readiness-state', readiness.state);
    } catch (_) {}
}

// ICON_MOTION -- paint the desktop "next task" / "caught up" cues. Pure DOM
// class toggles, best-effort, never throws. nextApp = the data-app to breathe
// (the app to open next), or null. caughtUp = no assigned work left, so the
// practice tools (Formula Lab, TI-84) gently invite optional skill work.
function _paintDeskMotionCues(nextApp, caughtUp) {
    try {
        var icons = document.querySelectorAll('.app-icon[data-app]');
        for (var i = 0; i < icons.length; i++) {
            var el = icons[i];
            var app = el.getAttribute('data-app');
            // The "open me next" breathe never lands on icons that own their own
            // motion vocabulary (wallet = readiness, game = presence) so it can
            // never clobber those animations on the same element -- regardless of
            // how appForNextTask evolves. (tool-idle is temporally exclusive with
            // donow-next: caughtUp is true only when there is no next task.)
            el.classList.toggle('donow-next', !!nextApp && app === nextApp && app !== 'wallet' && app !== 'game');
            var isTool = (app === 'formulas');
            el.classList.toggle('tool-idle', !!caughtUp && isTool);
        }
    } catch (_) {}
}

// Merge durable (server) + local receipts, dedup by id (fallback compact), newest first.
async function _walletLoadReceipts() {
    var local = _readDeskReceipts();
    var durable = [];
    try {
        if (window.gradebookClient && typeof gradebookClient.fetchReceipts === 'function') {
            durable = await gradebookClient.fetchReceipts();
        }
    } catch (_) { durable = []; }
    return (window.WalletLogic && WalletLogic.mergeReceipts)
        ? WalletLogic.mergeReceipts(durable, local)
        : local;
}

function _sealedTranscriptNotice(msg) {
    try {
        if (typeof _showTrainerToast === 'function') {
            _showTrainerToast(msg);
            return;
        }
    } catch (_) {}
    try { alert(msg); } catch (_) {}
}

function _sealedTranscriptSignInMessage() {
    _sealedTranscriptNotice("Couldn't reach the server - sign in on the Desk and try again online to get a verifiable sealed transcript.");
}

function _sealedTranscriptFilename(transcript) {
    var safe = function (s) { return String(s || '').replace(/[^A-Za-z0-9_-]/g, '_'); };
    var issued = Date.now();
    try {
        if (transcript && transcript.issuedAt) issued = new Date(transcript.issuedAt).getTime();
    } catch (_) {}
    if (!isFinite(issued)) issued = Date.now();
    return 'transcript_'
        + safe((transcript && transcript.u) || 'student')
        + '_'
        + safe((transcript && transcript.quarter) || 'Q')
        + '_'
        + new Date(issued).toISOString().slice(0, 10)
        + '.json';
}

async function exportSealedTranscript() {
    try {
        var base = (window.ROSTER_SERVICE_URL || (typeof ROSTER_SERVICE_URL !== 'undefined' ? ROSTER_SERVICE_URL : null));
        var token = '';
        try {
            token = (window.rosterClient && typeof rosterClient.token === 'function') ? (rosterClient.token() || '') : '';
        } catch (_) {
            token = '';
        }
        if (!base || !token) {
            _sealedTranscriptSignInMessage();
            return;
        }

        var res = await fetch(base + '/transcript', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res || !res.ok) {
            _sealedTranscriptSignInMessage();
            return;
        }
        var data = await res.json();
        var transcript = data && data.transcript;
        if (!data || data.ok !== true || !transcript) {
            _sealedTranscriptSignInMessage();
            return;
        }

        var blob = new Blob([JSON.stringify(transcript, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        try {
            var a = document.createElement('a');
            a.href = url;
            a.download = _sealedTranscriptFilename(transcript);
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            try { a.remove(); } catch (_) {}
        } finally {
            setTimeout(function () {
                try { URL.revokeObjectURL(url); } catch (_) {}
            }, 0);
        }
        _sealedTranscriptNotice('Sealed transcript exported - ' + transcript.count + ' items. This file contains your grades - only send it to your teacher.');
    } catch (_) {
        _sealedTranscriptSignInMessage();
    }
}

async function printSealedSummary() {
    try {
        var base = (window.ROSTER_SERVICE_URL || (typeof ROSTER_SERVICE_URL !== 'undefined' ? ROSTER_SERVICE_URL : null));
        var token = '';
        try {
            token = (window.rosterClient && typeof rosterClient.token === 'function') ? (rosterClient.token() || '') : '';
        } catch (_) {
            token = '';
        }
        if (!base || !token) {
            _sealedTranscriptSignInMessage();
            return;
        }

        var res = await fetch(base + '/transcript', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res || !res.ok) {
            _sealedTranscriptSignInMessage();
            return;
        }
        var data = await res.json();
        var transcript = data && data.transcript;
        if (!data || data.ok !== true || !transcript) {
            _sealedTranscriptSignInMessage();
            return;
        }

        var verifyUrl = 'https://robjohncolson.github.io/curriculum_render/verify.html#r=' + encodeURIComponent(transcript.manifest || '');
        var qrSrc = '';
        var qrHost = document.createElement('div');
        qrHost.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:400px;height:400px;overflow:hidden';
        document.body.appendChild(qrHost);
        try {
            if (typeof QRCode === 'function') {
                new QRCode(qrHost, { text: verifyUrl, width: 400, height: 400, correctLevel: QRCode.CorrectLevel && QRCode.CorrectLevel.L });
                var qrImg = qrHost.querySelector('img');
                var qrCanvas = qrHost.querySelector('canvas');
                if (qrImg && qrImg.src) qrSrc = qrImg.src;
                else if (qrCanvas && typeof qrCanvas.toDataURL === 'function') qrSrc = qrCanvas.toDataURL('image/png');
            }
        } catch (_) {
            qrSrc = '';
        }
        try { qrHost.remove(); } catch (_) {}

        var issued = '';
        try { issued = transcript.issuedAt ? new Date(transcript.issuedAt).toLocaleString() : ''; } catch (_) { issued = ''; }
        var printWin = window.open('', '_blank');
        if (!printWin || !printWin.document) {
            _sealedTranscriptSignInMessage();
            return;
        }
        var qrHtml = qrSrc
            ? '<img class="qr" src="' + _walletEsc(qrSrc) + '" alt="Verification QR code">'
            : '<div class="qr missing">QR unavailable</div>';
        printWin.document.open();
        printWin.document.write('<!doctype html><html><head><meta charset="utf-8">'
            + '<title>AP Statistics - Progress Summary</title>'
            + '<style>'
            + 'body{font-family:Georgia,"Times New Roman",serif;color:#111;background:#fff;margin:0;padding:36px;text-align:center;}'
            + 'main{max-width:560px;margin:0 auto;}'
            + 'h1{font-size:26px;margin:0 0 24px;}'
            + 'dl{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;margin:0 auto 28px;text-align:left;max-width:420px;}'
            + 'dt{font-weight:bold;}dd{margin:0;}'
            + '.qr{display:block;width:400px;height:400px;margin:0 auto 12px;padding:20px;background:#fff;object-fit:contain;image-rendering:pixelated;}'
            + '.missing{border:1px solid #999;line-height:160px;font-size:13px;color:#555;}'
            + '.caption{font-size:13px;line-height:1.45;margin:0 auto;max-width:420px;}'
            + '@media print{body{padding:24px;}button{display:none;}main{max-width:none;}a{color:#111;text-decoration:none;}}'
            + '</style></head><body><main>'
            + '<h1>AP Statistics &mdash; Progress Summary</h1>'
            + '<dl>'
            + '<dt>Student</dt><dd>' + _walletEsc(transcript.u || 'Student') + '</dd>'
            + '<dt>Quarter</dt><dd>' + _walletEsc(transcript.quarter || '') + '</dd>'
            + '<dt>Grade</dt><dd>' + _walletEsc(String(transcript.grade || '') + '%') + '</dd>'
            + '<dt>Item count</dt><dd>' + _walletEsc(transcript.count == null ? '' : String(transcript.count)) + '</dd>'
            + '<dt>Sealed</dt><dd>' + _walletEsc(issued) + '</dd>'
            + '</dl>'
            + qrHtml
            + '<p class="caption">Scan this QR with any phone to verify — no app or login needed. Full item-by-item transcript: use Export sealed transcript.</p>'
            + '</main><script>setTimeout(function(){try{window.focus();window.print();}catch(e){}},150);<\/script>'
            + '</body></html>');
        printWin.document.close();
    } catch (_) {
        _sealedTranscriptSignInMessage();
    }
}

// The wallet receipt feed is Sessions-only by design — the Lessons/Types/Days
// tab strip was removed to keep the screen clean, so this is now fixed.
var _walletReceiptFeedTab = 'session';
var _walletReceiptExpandedGroups = {};

function _walletReceiptGroupId(dim, key) {
    return String(dim || 'lesson') + ':' + String(key || '');
}

function _walletReceiptSubgroupId(dim, groupKey, subgroupKey) {
    return _walletReceiptGroupId(dim, String(groupKey || '') + '/' + String(subgroupKey || ''));
}

function _walletRenderGroupedReceipts(host, receipts, loading) {
    try {
        if (!window.WalletLogic || typeof WalletLogic.groupReceipts !== 'function') {
            receipts.forEach(function (r) { host.appendChild(_walletReceiptRow(r)); });
            return;
        }

        var groups = WalletLogic.groupReceipts(receipts, _walletReceiptFeedTab);
        groups.forEach(function (group) {
            var groupId = _walletReceiptGroupId(_walletReceiptFeedTab, group.key);
            var open = !!_walletReceiptExpandedGroups[groupId];
            var header = document.createElement('button');
            header.type = 'button';
            header.className = 'geneva';
            header.style.cssText = 'width:100%;display:flex;align-items:center;gap:6px;text-align:left;border:1px solid #777;background:#eee;margin:0 0 4px;padding:5px 6px;box-shadow:1px 1px 0 #bbb;font-size:11px';
            header.innerHTML = '<span style="width:12px">' + (open ? '▾' : '▸') + '</span>'
                + '<span>' + _walletEsc(group.icon || '🧾') + '</span>'
                + '<span style="font-weight:bold;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
                + _walletEsc(group.label || group.key || 'Other') + '</span>'
                + '<span style="margin-left:auto;border:1px solid #777;background:#fff;padding:0 5px;font-size:10px">'
                + Number(group.count || 0) + '</span>';
            header.onclick = function () {
                if (_walletReceiptExpandedGroups[groupId]) delete _walletReceiptExpandedGroups[groupId];
                else _walletReceiptExpandedGroups[groupId] = true;
                _walletPaint(host, receipts, loading);
            };
            host.appendChild(header);

            if (open) {
                if (_walletReceiptFeedTab === 'session') _walletAppendSessionQRRow(host, group);
                if (Array.isArray(group.subgroups) && group.subgroups.length) {
                    group.subgroups.forEach(function (subgroup) {
                        var subgroupId = _walletReceiptSubgroupId(_walletReceiptFeedTab, group.key, subgroup.key);
                        var subgroupOpen = !!_walletReceiptExpandedGroups[subgroupId];
                        var subHeader = document.createElement('button');
                        subHeader.type = 'button';
                        subHeader.className = 'geneva';
                        subHeader.style.cssText = 'width:calc(100% - 14px);display:flex;align-items:center;gap:6px;text-align:left;border:1px solid #999;background:#f7f7f7;margin:0 0 4px 14px;padding:4px 6px;box-shadow:1px 1px 0 #ccc;font-size:10px';
                        subHeader.innerHTML = '<span style="width:12px">' + (subgroupOpen ? '▾' : '▸') + '</span>'
                            + '<span style="font-weight:bold;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
                            + _walletEsc(subgroup.label || subgroup.key || 'Other') + '</span>'
                            + '<span style="margin-left:auto;border:1px solid #777;background:#fff;padding:0 5px;font-size:10px">'
                            + Number(subgroup.count || 0) + '</span>';
                        subHeader.onclick = function () {
                            if (_walletReceiptExpandedGroups[subgroupId]) delete _walletReceiptExpandedGroups[subgroupId];
                            else _walletReceiptExpandedGroups[subgroupId] = true;
                            _walletPaint(host, receipts, loading);
                        };
                        host.appendChild(subHeader);

                        if (subgroupOpen) {
                            (subgroup.receipts || []).forEach(function (r) {
                                host.appendChild(_walletReceiptRow(r));
                            });
                        }
                    });
                } else {
                    (group.receipts || []).forEach(function (r) {
                        host.appendChild(_walletReceiptRow(r));
                    });
                }
            }
        });
    } catch (_) {
        receipts.forEach(function (r) { host.appendChild(_walletReceiptRow(r)); });
    }
}

// ── DOGE Effort Wallet (DOGE_WALLET_SPEC.md) — Phase 1 preview panel ─────────
// Shows the candy value of a student's effort + the live candy→DOGE rate + the
// appreciation projection. PREVIEW-GATED (localStorage 'apstats_doge_wallet_preview'
// === '1'), default OFF, so this unfinished feature doesn't surprise students on
// the live site before the teacher rolls it out. Display-only for now; the real
// buy/on-chain flow is Phase 2-3. Client-side CoinGecko price is fine for display;
// real conversions get the server-stamped price (spec §5).
var _dogePriceUsd = null;
function _fetchDogePrice() {
    try {
        var cached = JSON.parse(localStorage.getItem('apstats_doge_price') || 'null');
        if (cached && cached.usd && cached.ts && (Date.now() - cached.ts) < 600000) {
            _dogePriceUsd = cached.usd;
            return Promise.resolve(cached.usd);
        }
    } catch (_) {}
    return fetch('https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=usd')
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (d) {
            var usd = d && d.dogecoin && d.dogecoin.usd;
            if (typeof usd === 'number' && usd > 0) {
                _dogePriceUsd = usd;
                try { localStorage.setItem('apstats_doge_price', JSON.stringify({ usd: usd, ts: Date.now() })); } catch (_) {}
                return usd;
            }
            return null;
        })
        .catch(function () { return null; });
}
function _dogeWalletPreviewOn() {
    try {
        // Teachers always see it. CANDY_LEDGER_SPEC decision 2: students now see their
        // candy ledger (Earned / in hand / still coming) BY DEFAULT — the ledger is the
        // point. An explicit opt-out ('apstats_doge_wallet_preview' === '0') still hides it.
        if (typeof _deskIsTeacher === 'function' && _deskIsTeacher()) return true;
        return localStorage.getItem('apstats_doge_wallet_preview') !== '0';
    } catch (_) { return false; }
}
// Interactive wallet: fetch the server's GET /wallet (candy to spend, DOGE held)
// and offer eat / buy-DOGE. Falls back to a display-only preview (candy from
// local effort points + live rate) when the backend isn't provisioned (503,
// migration 0019 pending) or the student is offline.
function _walletDogePanel(host, pts) {
    if (!host || !_dogeWalletPreviewOn()) return;
    var box = document.createElement('div');
    box.style.cssText = 'border:1px solid #c9961f;background:#fff8e6;border-radius:3px;padding:8px 10px;margin-top:10px';
    box.innerHTML = '<div class="geneva" style="font-size:11px;color:#8a7330">Loading rewards…</div>';
    host.appendChild(box);
    _dogeWalletFetch().then(function (w) { _dogeWalletRender(box, w, pts); });
}
function _dogeWalletBase() {
    try {
        var token = (window.rosterClient && rosterClient.token) ? rosterClient.token() : null;
        var base = window.ROSTER_SERVICE_URL || null;
        return (token && base) ? { token: token, base: base } : null;
    } catch (_) { return null; }
}
function _dogeWalletFetch() {
    var c = _dogeWalletBase();
    if (!c) return Promise.resolve(null);
    return fetch(c.base + '/wallet', { headers: { 'Authorization': 'Bearer ' + c.token } })
        .then(function (r) { if (r.status === 503) return { _notProvisioned: true }; return r.ok ? r.json() : null; })
        .catch(function () { return null; });
}
function _dogeWalletAction(path, candyOrBody) {
    var c = _dogeWalletBase();
    if (!c) return Promise.resolve({ ok: false, error: 'offline' });
    // Back-compat: a bare number is a candy amount (Buy/Eat); an object is the literal
    // body (Cash-out posts { doge: n }). The server never trusts a client-supplied price.
    var body = (candyOrBody && typeof candyOrBody === 'object') ? candyOrBody : { candy: candyOrBody };
    return fetch(c.base + path, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + c.token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .catch(function () { return { ok: false, error: 'network' }; });
}
// Watch-only on-chain balance (GET /wallet/chain). The REAL coins, once the
// teacher sends them — distinct from the app-tracked "Ɖ held" the kid bought.
function _dogeWalletChainFetch() {
    var c = _dogeWalletBase();
    if (!c) return Promise.resolve(null);
    return fetch(c.base + '/wallet/chain', { headers: { 'Authorization': 'Bearer ' + c.token } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
}
function _dogeWalletChainPaint(lineEl, ch) {
    if (!ch || !ch.ok || ch.address == null) { lineEl.style.display = 'none'; return; }
    lineEl.style.display = '';
    lineEl.textContent = '';
    if (ch.error) { lineEl.style.color = '#a07c1c'; lineEl.textContent = '⛓ on-chain: checking… (explorer busy)'; return; }
    lineEl.style.color = '#5a6b00';
    var conf = ch.confirmedDoge || 0, pend = ch.unconfirmedDoge || 0;
    var net = ch.network === 'test' ? ' (testnet)' : '';
    var txt = '⛓ on-chain: Ɖ ' + conf.toFixed(2) + ' confirmed' + net;
    if (pend > 1e-7) txt += ' · Ɖ ' + pend.toFixed(2) + ' incoming…';
    lineEl.appendChild(document.createTextNode(txt + ' '));
    if (ch.explorerUrl) {
        var a = document.createElement('a');
        a.href = ch.explorerUrl; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'view ↗'; a.style.cssText = 'color:#6b5400;text-decoration:underline';
        lineEl.appendChild(a);
    }
}
// Self-refreshing while the wallet window is open; stops once the line is
// detached (a re-render) or the overlay is hidden (closed).
function _dogeWalletChainArm(lineEl) {
    var ov = document.getElementById('app-wallet-overlay');
    if (!lineEl || !document.contains(lineEl) || !ov || ov.style.display === 'none') return;
    _dogeWalletChainFetch().then(function (ch) {
        if (!document.contains(lineEl)) return;
        _dogeWalletChainPaint(lineEl, ch);
        var ov2 = document.getElementById('app-wallet-overlay');
        if (document.contains(lineEl) && ov2 && ov2.style.display !== 'none') {
            // 5 min: matches the server cache TTL + keeps ~30 open wallets within
            // BlockCypher's free ceiling (set BLOCKCYPHER_TOKEN for more headroom).
            setTimeout(function () { _dogeWalletChainArm(lineEl); }, 300000);
        }
    });
}
// 🎁 Gift candy to a classmate — a free in-app transfer (no on-chain tx, no fee).
// The recipient is picked by their PUBLIC username; the server resolves + guards it.
function _dogeWalletGiftSend(toUsername, candy) {
    var c = _dogeWalletBase();
    if (!c) return Promise.resolve({ ok: false, error: 'offline' });
    return fetch(c.base + '/wallet/gift', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + c.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUsername: toUsername, candy: candy })
    }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .catch(function () { return { ok: false, error: 'network' }; });
}

// ── Candy "poke" (CANDY_POKE_SPEC.md) ───────────────────────────────────────────────
// Tap a peer's avatar in the Live Classroom → send them 1 candy, Facebook-poke style.
// Optimistic: a 3s "Undo" toast, THEN the real POST /wallet/gift commits (so Undo needs
// no server reversal — we just never fire the POST). On success the sender relays a
// COSMETIC candy_gift_received over the board WS so the recipient sees a toast; the real
// balance is always the roster-server's truth. Per-recipient ~10min cooldown + the
// server's 20/day cap guard spam. Fixed at 1 candy (the poke unit); multi-candy gifts
// stay in the My-Ledger form.
var _candyPokeCooldown = {};            // lowercased recipient -> last committed epoch ms
var _candyPokePending  = {};            // lowercased recipient -> { timer } during the 3s undo window
var _candySeenGiftIds  = {};            // dedupe inbound candy_gift_received by giftId
var CANDY_POKE_COOLDOWN_MS = 10 * 60 * 1000;
function _candyPokeMe() {
  try { return (window.rosterClient && rosterClient.current) ? (rosterClient.current() || null) : null; } catch (_) { return null; }
}
function _candyFirstName(u) { return String(u || '').replace(/_/g, ' ').trim() || 'a classmate'; }
function _candyToastHost() {
  var h = document.getElementById('candy-toast-host');
  if (!h) {
    h = document.createElement('div');
    h.id = 'candy-toast-host';
    h.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:100000;display:flex;flex-direction:column;gap:6px;align-items:flex-end;pointer-events:none';
    document.body.appendChild(h);
  }
  return h;
}
function _candyToast(opts) {
  // opts: { text, actionLabel?, onAction?, ttlMs? } -> { dismiss }
  var host = _candyToastHost();
  var el = document.createElement('div');
  el.className = 'geneva';
  el.style.cssText = 'pointer-events:auto;background:#fffdf5;border:2px solid #c9961f;border-radius:8px;box-shadow:2px 2px 0 rgba(0,0,0,.25);padding:8px 10px;font-size:12px;color:#5a4500;max-width:240px;display:flex;align-items:center;gap:8px';
  var span = document.createElement('span'); span.textContent = opts.text; el.appendChild(span);
  var timer = null, done = false;
  function dismiss() { if (done) return; done = true; if (timer) { clearTimeout(timer); } try { host.removeChild(el); } catch (_) {} }
  if (opts.actionLabel) {
    var btn = document.createElement('button');
    btn.className = 's7btn'; btn.textContent = opts.actionLabel;
    btn.style.cssText = 'font-size:10px;padding:2px 8px;cursor:pointer';
    btn.onclick = function () { dismiss(); if (typeof opts.onAction === 'function') opts.onAction(); };
    el.appendChild(btn);
  }
  host.appendChild(el);
  // Bound the stack (anti-flood: many legit pokes at once, or spoofed candy_gift_received spam).
  while (host.children.length > 4) { try { host.removeChild(host.firstChild); } catch (_) { break; } }
  if (opts.ttlMs) timer = setTimeout(dismiss, opts.ttlMs);
  return { dismiss: dismiss };
}
function _candyMiniToast(text) { _candyToast({ text: text, ttlMs: 2200 }); }
// The candy chime (MacSFX.recipes.candyChime) through the shared engine (lib/sfx.js).
function _candyChime() {
  try {
    if (window.sfx) window.sfx.play('mac:candyChime');
  } catch (_) {}
}
function _candyRefreshWalletUI() {
  try {
    var ov = document.getElementById('app-wallet-overlay');
    if (!ov || ov.style.display === 'none' || typeof renderWallet !== 'function') return;
    // Don't yank a half-typed Buy/Cash-out/Gift form out from under the student when an incoming
    // candy_gift_received arrives — skip the repaint while a wallet input/select is focused. The
    // balance is server-truth and re-fetches on the next render anyway, so a skipped refresh is harmless.
    var af = document.activeElement;
    if (af && (af.tagName === 'INPUT' || af.tagName === 'SELECT') && ov.contains(af)) return;
    renderWallet();
  } catch (_) {}
}
function _candyRelay(to) {
  try {
    if (!_classroomBoardHandle || typeof _classroomBoardHandle.sendMessage !== 'function') return;
    var me = _candyPokeMe();   // re-read NOW (not the poke-time capture) so a reroll/sign-out within the 3s window attributes correctly
    if (!me || !me.username) return;
    // Send only the (pseudonymous) username, NOT the real name: this message is broadcast
    // to every connected client, and students see each other only by Fruit_Animal username —
    // real names are teacher-only on the board (the roster cutover keeps them so).
    _classroomBoardHandle.sendMessage({
      type: 'candy_gift_received',
      toUsername: to,
      fromUsername: me.username,
      candy: 1,
      giftId: me.username + '|' + to + '|' + Date.now()
    });
  } catch (_) {}
}
function _candyArmPoke(to, toKey, name) {
  var t = _candyToast({
    text: 'Sent 1 🍬 to ' + name,
    actionLabel: 'Undo',
    onAction: function () {                                  // Undo within 3s → cancel the commit
      var p = _candyPokePending[toKey];
      if (p) { clearTimeout(p.timer); delete _candyPokePending[toKey]; }
    }
  });
  var timer = setTimeout(function () {
    if (!_candyPokePending[toKey]) return;                   // already undone
    delete _candyPokePending[toKey];
    // Arm the cooldown OPTIMISTICALLY, before the POST round-trip — otherwise a rapid second
    // tap in the ~100-500ms gap before `res` resolves would slip a 2nd poke past the
    // per-recipient cooldown. Cleared again below if the send actually failed.
    _candyPokeCooldown[toKey] = Date.now();
    t.dismiss();
    _dogeWalletGiftSend(to, 1).then(function (res) {
      if (res && res.ok) {
        _candyToast({ text: '✓ Sent 1 🍬 to ' + name, ttlMs: 1800 });
        _candyRelay(to);
        _candyRefreshWalletUI();
      } else {
        delete _candyPokeCooldown[toKey];                    // failed send → allow an immediate retry
        _candyToast({ text: 'Couldn’t send to ' + name + ' — ' + ((res && res.error) || 'cap reached?'), ttlMs: 2800 });
      }
    });
  }, 3000);
  _candyPokePending[toKey] = { timer: timer };
}
function _candyPoke(toUsername) {
  if (!toUsername) return;
  var to = String(toUsername), toKey = to.toLowerCase();
  var me = _candyPokeMe();
  if (!me || !me.username) { _candyMiniToast('Sign in to send candy 🍬'); return; }
  if (/^Guest_/i.test(me.username)) { _candyMiniToast('Guests can’t send candy 🍬'); return; }
  if (String(me.username).toLowerCase() === toKey) return;          // never self
  if (/^Guest_/i.test(to)) { _candyMiniToast('That classmate can’t receive candy yet'); return; }
  if (_candyPokePending[toKey]) return;                              // already mid-undo for this person
  if (Date.now() - (_candyPokeCooldown[toKey] || 0) < CANDY_POKE_COOLDOWN_MS) { _candyMiniToast('Already sent ' + _candyFirstName(to) + ' a 🍬 — give it a bit'); return; }
  // Balance gate (lazy) — don't arm a poke we already know will bounce.
  _dogeWalletFetch().then(function (w) {
    if (w && w._notProvisioned) { _candyMiniToast('Candy rewards aren’t turned on yet'); return; }
    var bal = (w && w.ok) ? Math.floor(w.candyBalance || 0) : 0;
    if (!(bal >= 1)) { _candyMiniToast('No candy to send yet — earn some first'); return; }
    if (_candyPokePending[toKey]) return;                            // re-check after the async gap
    if (Date.now() - (_candyPokeCooldown[toKey] || 0) < CANDY_POKE_COOLDOWN_MS) return;
    _candyArmPoke(to, toKey, _candyFirstName(to));
  }).catch(function () { _candyMiniToast('Couldn’t reach your wallet'); });
}
function _onCandyGiftReceived(msg) {
  try {
    if (!msg || msg.type !== 'candy_gift_received') return;
    var me = _candyPokeMe();
    if (!me || !me.username) return;
    if (String(msg.toUsername || '').toLowerCase() !== String(me.username).toLowerCase()) return;  // not for me
    var gid = msg.giftId || (msg.fromUsername + '|' + msg.candy);
    if (_candySeenGiftIds[gid]) return;                              // dedupe (re-broadcast / reconnect)
    _candySeenGiftIds[gid] = 1;
    var _seenIds = Object.keys(_candySeenGiftIds);                   // bound the dedupe set over a long session
    if (_seenIds.length > 300) { delete _candySeenGiftIds[_seenIds[0]]; }
    var from = _candyFirstName(msg.fromUsername);   // username-derived; real names are not broadcast
    var n = (typeof msg.candy === 'number' && msg.candy > 0) ? Math.floor(msg.candy) : 1;
    _candyChime();
    _candyToast({ text: '🍬 ' + from + ' sent you ' + n + ' candy!', ttlMs: 5000 });
    _candyRefreshWalletUI();                                          // their balance just went up
  } catch (_) {}
}

// AVATAR_MENU (AVATAR_MENU_SPEC.md): Live Classroom avatars no longer float their
// names. Click an avatar once → a name chip; click again (or the chip) → a small
// popover with 🍬 Send candy + ⚔️ Start a game. Reuses the proven candy-poke pipeline
// (_candyPoke) and the Tetris challenge (DogePresence.sendChallenge, which auto-opens
// the game on accept). The classroom WS is UN-authenticated, so peer usernames are
// untrusted: names render via textContent and actions are wired with addEventListener
// — no HTML interpolation, so there is no XSS surface (unlike an onclick="" sink).
var _avatarMenu = {
  el: null,               // the floating popover element (appended to <body>) or null
  username: null,         // the avatar the popover currently targets
  stage: null,            // 'name' (chip only) | 'menu' (name + actions)
  _handlingClick: false,  // true during an avatar-hit dispatch → suppresses the outside-close
  _docClick: null,
  _escKey: null,

  // Wired as the board's onAvatarClick. hit = { username, selectMode, clientX, clientY }.
  onAvatarClick: function (hit) {
    if (!hit || !hit.username) return;
    // The board's canvas click handler fires this, then the SAME click keeps
    // bubbling to the document outside-close handler. Flag the dispatch so that
    // handler doesn't close what we just opened; clear it after the dispatch.
    this._handlingClick = true;
    var self = this;
    setTimeout(function () { self._handlingClick = false; }, 0);

    var u = hit.username;
    // Re-clicking the same avatar at the name stage → advance to the menu in place.
    if (this.el && this.username === u && this.stage === 'name') {
      this.stage = 'menu';
      this._render();
      return;
    }
    // New target (or a re-click after the menu was shown) → fresh name chip.
    this.open(u, hit.clientX, hit.clientY);
  },

  open: function (username, clientX, clientY) {
    this.close();                     // tear down any prior popover + its handlers
    this.username = username;
    this.stage = 'name';
    var doc = document;
    var el = doc.createElement('div');
    el.className = 'avatar-pop';
    el.setAttribute('role', 'dialog');
    // Anchor above the tapped head (CSS translate). Store the anchor so
    // _reposition() (run after each render) can nudge a wide / top-of-screen
    // popover fully into the viewport — the box is centered on x and drawn
    // ABOVE y, so a fixed clamp can't account for its rendered size.
    var vw = (window.innerWidth || 320), vh = (window.innerHeight || 480);
    this._ax = Math.max(20, Math.min(vw - 20, (typeof clientX === 'number') ? clientX : vw / 2));
    this._ay = Math.max(20, Math.min(vh - 20, (typeof clientY === 'number') ? clientY : vh / 2));
    el.style.left = this._ax + 'px';
    el.style.top  = this._ay + 'px';
    // A click inside the popover must not bubble to the outside-close handler.
    el.addEventListener('click', function (e) { e.stopPropagation(); });
    this.el = el;
    doc.body.appendChild(el);
    this._render();

    var self = this;
    this._docClick = function (e) {
      if (!self.el) return;
      if (self.el.contains(e.target)) return;   // click landed inside the popover
      if (self._handlingClick) return;          // same click hit an avatar (open/advance)
      self.close();
    };
    this._escKey = function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) self.close();
    };
    doc.addEventListener('click', this._docClick, false);   // bubble phase
    doc.addEventListener('keydown', this._escKey, false);
  },

  _displayName: function (u) {
    // Prefer a known real name (teachers carry the roster map; students normally
    // don't → falls back to the username, which is exactly what we want to reveal).
    var real = null;
    try { if (typeof DeskRoster !== 'undefined' && DeskRoster.realName) real = DeskRoster.realName(u); } catch (_) {}
    return real ? (real + ' · ' + u) : u;
  },

  _render: function () {
    var el = this.el;
    if (!el) return;
    var u = this.username;
    var self = this;
    var doc = document;
    el.setAttribute('data-stage', this.stage);
    el.innerHTML = '';

    // Name chip — the headline + (at the name stage) the tap target that advances.
    var nameBtn = doc.createElement('button');
    nameBtn.type = 'button';
    nameBtn.className = 'avatar-pop-name';
    nameBtn.textContent = this._displayName(u);   // textContent → XSS-safe
    nameBtn.addEventListener('click', function () {
      if (self.stage === 'name') { self.stage = 'menu'; self._render(); }
    });
    el.appendChild(nameBtn);

    if (this.stage === 'name') {
      var hint = doc.createElement('span');
      hint.className = 'avatar-pop-hint';
      hint.textContent = 'tap again for options';
      el.appendChild(hint);
      this._reposition();
      return;
    }

    // stage === 'menu' → the two actions.
    var acts = doc.createElement('div');
    acts.className = 'avatar-pop-acts';

    if (typeof _deskIsTeacher === 'function' && _deskIsTeacher()) {
      var messageBtn = doc.createElement('button');
      messageBtn.type = 'button';
      messageBtn.className = 'doge-sub-act';
      messageBtn.textContent = 'Message';
      messageBtn.addEventListener('click', function () {
        var target = u;
        self.close();
        if (typeof _openTeacherNudgeModal === 'function') {
          try { _openTeacherNudgeModal(target); } catch (_) {}
        }
      });
      acts.appendChild(messageBtn);
    }

    var candyBtn = doc.createElement('button');
    candyBtn.type = 'button';
    candyBtn.className = 'doge-sub-act';
    candyBtn.textContent = '🍬 Send candy';
    candyBtn.addEventListener('click', function () {
      var target = u;
      self.close();
      if (typeof _candyPoke === 'function') { try { _candyPoke(target); } catch (_) {} }
    });
    acts.appendChild(candyBtn);

    var gameBtn = doc.createElement('button');
    gameBtn.type = 'button';
    gameBtn.className = 'doge-sub-act';
    gameBtn.textContent = '⚔️ Start a game';
    // The challenge rides DogePresence's always-on socket and is only deliverable
    // to a classmate on the Desk. An avatar in THIS scene is on the Desk, so enable
    // unless presence positively reports them elsewhere.
    var loc = null;
    try { loc = (typeof DogePresence !== 'undefined' && DogePresence.locations) ? DogePresence.locations[u] : null; } catch (_) {}
    if (!loc || loc.onDesk !== false) {
      gameBtn.addEventListener('click', function () {
        var target = u;
        self.close();
        if (typeof DogePresence !== 'undefined' && DogePresence.sendChallenge) {
          try { DogePresence.sendChallenge(target); } catch (_) {}
        }
      });
    } else {
      gameBtn.disabled = true;
      gameBtn.title = 'They need to be on the Desk to play';
    }
    acts.appendChild(gameBtn);

    el.appendChild(acts);
    this._reposition();
  },

  // AVATAR_MENU finding-fold (s20 review): nudge the popover fully into the
  // viewport. The box is centered on _ax and (by default) drawn ABOVE _ay, so a
  // long name can spill left/right and a top-of-screen avatar can clip the top.
  // Measure the rendered box and shift it in; flip BELOW the head when there's no
  // room above. A no-op in jsdom (getBoundingClientRect returns 0s, no layout),
  // so the controller's unit tests are unaffected.
  _reposition: function () {
    var el = this.el;
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    // Reset to the raw anchor + default (above) so re-renders don't accumulate drift.
    el.style.left = this._ax + 'px';
    el.style.top  = this._ay + 'px';
    el.style.transform = 'translate(-50%, calc(-100% - 10px))';
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;   // unlaid-out (jsdom) → leave the fallback anchor
    var vw = (window.innerWidth || 320), vh = (window.innerHeight || 480), pad = 6;
    if (r.top < pad) {                   // no room above → flip below the head
      el.style.transform = 'translate(-50%, 10px)';
      r = el.getBoundingClientRect();
    }
    var dx = 0, dy = 0;
    if (r.left < pad) dx = pad - r.left;
    else if (r.right > vw - pad) dx = (vw - pad) - r.right;
    if (r.top < pad) dy = pad - r.top;
    else if (r.bottom > vh - pad) dy = (vh - pad) - r.bottom;
    if (dx) el.style.left = (this._ax + dx) + 'px';
    if (dy) el.style.top  = (this._ay + dy) + 'px';
  },

  close: function () {
    if (this.el && this.el.parentNode) { try { this.el.parentNode.removeChild(this.el); } catch (_) {} }
    if (this._docClick) { try { document.removeEventListener('click', this._docClick, false); } catch (_) {} }
    if (this._escKey)   { try { document.removeEventListener('keydown', this._escKey, false); } catch (_) {} }
    this.el = null;
    this.username = null;
    this.stage = null;
    this._docClick = null;
    this._escKey = null;
  }
};
try { window._avatarMenu = _avatarMenu; } catch (_) {}

// AVATAR_SELF_EMOTE (AVATAR_MENU_SPEC.md): clicking your OWN avatar no longer slams
// open My Ledger (too heavy) — it plays a light "happy bounce": the sprite hops +
// wiggles (classroom-board.js, no new art) and a 🍬✨ puff floats up from the tap.
// My Ledger stays one tap away in the Apps menu + the desktop icon. A short cooldown
// keeps rapid clicks from spamming particles.
var _selfEmoteUntil = 0;
function _spawnEmoteParticle(text, x, y, delayMs) {
  var el = document.createElement('div');
  el.className = 'avatar-emote-particle';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  if (delayMs) el.style.animationDelay = delayMs + 'ms';
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1300 + (delayMs || 0));
  return el;
}
function _avatarSelfEmote(hit) {
  if (Date.now() < _selfEmoteUntil) return;          // debounce rapid self-clicks
  _selfEmoteUntil = Date.now() + 600;
  var reduce = false;
  try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) {}
  // Hop + wiggle the canvas sprite (skipped for reduced-motion; the puff still fades in place).
  if (!reduce) { try { if (_classroomBoardHandle && _classroomBoardHandle.selfEmote) _classroomBoardHandle.selfEmote(); } catch (_) {} }
  try { if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('wildEep', 0.4); } catch (_) {}
  // 🍬✨ puff at the tapped avatar (hit carries the click's viewport coords).
  var x = (hit && typeof hit.clientX === 'number') ? hit.clientX : (window.innerWidth  / 2);
  var y = (hit && typeof hit.clientY === 'number') ? hit.clientY : (window.innerHeight / 2);
  var candyEl = _spawnEmoteParticle('🍬', x, y, 0);
  _spawnEmoteParticle('✨', x - 18, y - 4, 80);
  _spawnEmoteParticle('✨', x + 18, y - 2, 170);
  // Best-effort: enrich the candy puff with your live balance (cached fetch, non-blocking).
  try {
    if (typeof _dogeWalletFetch === 'function') {
      _dogeWalletFetch().then(function (w) {
        if (candyEl && candyEl.parentNode && w && w.ok && typeof w.candyBalance === 'number') {
          candyEl.textContent = '🍬 ' + Math.floor(w.candyBalance);
        }
      }).catch(function () {});
    }
  } catch (_) {}
}
try { window._avatarSelfEmote = _avatarSelfEmote; } catch (_) {}

function _dogeWalletGiftForm(wrap, box, w, pts) {
    wrap.innerHTML = '<div class="geneva" style="font-size:10px;color:#8a7330">Loading classmates…</div>';
    var maxCandy = Math.floor(w.candyBalance || 0);
    var period = (typeof cP === 'string') ? cP : 'B';
    var meUser = '';
    try { var cur = (window.rosterClient && rosterClient.current) ? rosterClient.current() : null; meUser = cur ? String(cur.username || '').toLowerCase() : ''; } catch (_) {}
    Promise.resolve((typeof _fetchPeriodRoster === 'function') ? _fetchPeriodRoster(period) : [])
      .then(function (list) {
        wrap.innerHTML = '';
        // Exclude self and the teacher account (role surfaced by /roster/section).
        list = (list || []).filter(function (p) { return p && p.username && String(p.username).toLowerCase() !== meUser && (p.role || 'student') === 'student'; });
        if (!list.length) { wrap.innerHTML = '<div class="geneva" style="font-size:10px;color:#a07c1c">No classmates to gift to yet.</div>'; return; }
        list.sort(function (a, b) { return (a.realName || a.username || '').localeCompare(b.realName || b.username || ''); });
        var lbl = document.createElement('div'); lbl.className = 'geneva'; lbl.style.cssText = 'font-size:10px;color:#5a4500;margin-bottom:3px';
        lbl.textContent = '🎁 Gift candy to a classmate (free, no fee — up to ' + maxCandy + '):';
        var sel = document.createElement('select'); sel.style.cssText = 'font-size:11px;max-width:150px';
        list.forEach(function (p) { var o = document.createElement('option'); o.value = p.username; o.textContent = p.realName || p.username; sel.appendChild(o); });
        var amt = document.createElement('input'); amt.type = 'number'; amt.min = '1'; amt.max = String(maxCandy); amt.step = '1'; amt.placeholder = '#';
        amt.style.cssText = 'width:46px;font-size:11px;padding:2px;border:1px solid #c9961f;margin:0 4px';
        var sendBtn = document.createElement('button'); sendBtn.className = 's7btn'; sendBtn.textContent = 'Send 🍬'; sendBtn.style.cssText = 'font-size:10px;padding:2px 6px';
        var msg = document.createElement('span'); msg.className = 'geneva'; msg.style.cssText = 'font-size:9px;color:#a07c1c;margin-left:4px';
        sendBtn.onclick = function () {
            var n = parseInt(amt.value, 10);
            if (!(n >= 1)) { msg.textContent = 'whole number ≥ 1'; return; }
            if (n > maxCandy) { n = maxCandy; amt.value = String(n); }   // clamp to balance (server also rejects)
            sendBtn.disabled = true; msg.textContent = '…';
            _dogeWalletGiftSend(sel.value, n).then(function (res) {
                if (res && res.ok) { _dogeWalletFetch().then(function (w2) { _dogeWalletRender(box, w2, pts); }); }
                else { sendBtn.disabled = false; msg.textContent = (res && res.error) || 'failed'; }
            });
        };
        var rowg = document.createElement('div'); rowg.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap';
        rowg.appendChild(sel); rowg.appendChild(amt); rowg.appendChild(sendBtn); rowg.appendChild(msg);
        wrap.appendChild(lbl); wrap.appendChild(rowg);
      });
}
// One rounding rule for candy figures on the GLANCE face (hero, asset line, live previews) so the
// SAME value can never render two ways on one line (the old "0.7 here / 1 there" wart). The Details
// ledger below deliberately prints EXACT values instead, so the 10-number identity still sums.
function _candyFmt(n) {
    n = Number(n) || 0;
    if (n <= 0) return '0';
    if (n >= 10) return String(Math.round(n));
    var r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);   // 7 → "7", 0.7 → "0.7" (no stray ".0")
}
function _dogeFmt(n) {
    n = Number(n) || 0;
    if (n > 0 && n < 0.1) return (Math.round(n * 100) / 100).toFixed(2);   // tiny matured amounts keep 2dp (never round to "0.0")
    var r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// "Candy & DOGE" panel (redesign, WALLET_REDESIGN_SPEC.md) — a System-7 sub-panel that replaces the
// old packed block: a title + Details disclosure, ONE candy-to-spend hero, ONE DOGE asset line
// (held · worth · maturity · gain), a row of native .s7btn pills (Buy / Cash out / Gift) that open
// ONE inline form at a time, and the full 10-number ledger tucked behind ▸ Details. Reuses every
// existing helper (_dogeWalletAction, _dogeWalletGiftForm, _dogeWalletChainArm) + the POST endpoints.
function _dogeWalletRender(box, w, pts) {
    if (typeof _clearStudentWalletCeremony === 'function') {
        _clearStudentWalletCeremony();
    }
    box.innerHTML = '';
    if (!w || w._notProvisioned || !w.ok) { _dogeWalletPreviewFallback(box, pts, w && w._notProvisioned); return; }
    var candy = w.candyBalance || 0, doge = w.dogeBalance || 0;
    var earned = w.candyEarned || 0, materialized = w.candyMaterialized || 0;
    var owed = (typeof w.candyOwed === 'number') ? w.candyOwed : candy;   // === candyBalance (spendable)
    var received = w.candyReceived || 0, gifted = w.candyGiftedOut || 0;
    var converted = w.candyConverted || 0, realized = w.candyRealized || 0;
    var rate = w.candyPerDoge || 0;
    var inApp = Math.max(0, doge - (w.dogeSent || 0));    // un-sent coins (the only cashable ones)
    var sellable = w.sellableDoge || 0;                   // matured + un-sent (cashable NOW)
    var nowWorth = inApp * rate;
    var inAppBasis = (doge > 0) ? converted * (inApp / doge) : 0;   // cost basis of the cashable portion

    // ── Header: title + a ▸ Details disclosure (the app's existing collapser idiom) ──
    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap';
    var title = document.createElement('span');
    title.className = 'chicago'; title.style.cssText = 'font-size:11px;color:#5a4500';
    title.textContent = '🍬 Candy & DOGE';
    hdr.appendChild(title);
    // Available even before the student's assigned wallet receives its first deposit.
    if (window.StudentWalletPrint) window.StudentWalletPrint.attach(hdr, w);

    var hasWalletOnboarding = !w.dogeAddress && Boolean(
        w.studentWalletOptInEnabled || w.proposedAddressMasked || w.proposalRejectionReason
    );
    // Nothing-yet (no candy, no DOGE) → one friendly line. Keep Details when
    // wallet onboarding has state; a brand-new student may have no rewards yet.
    if (earned <= 0.0001 && doge <= 0.0001 && owed <= 0.05 && !hasWalletOnboarding) {
        box.appendChild(hdr);
        var first = document.createElement('div');
        first.className = 'geneva'; first.style.cssText = 'font-size:11px;color:#8a7330;margin-top:4px';
        first.textContent = 'Do some work to earn your first candy.';
        box.appendChild(first);
        return;
    }

    var detToggle = document.createElement('span');
    detToggle.className = 'geneva'; detToggle.style.cssText = 'font-size:10px;color:#6b5400;cursor:pointer;user-select:none';
    detToggle.textContent = '▸ Details';
    hdr.appendChild(detToggle);
    box.appendChild(hdr);

    // ── L1 hero: the ONE number the kid acts on ──
    var l1 = document.createElement('div');
    l1.className = 'geneva'; l1.style.cssText = 'font-size:13px;font-weight:bold;color:#5a4500;margin-top:5px';
    l1.textContent = owed > 0.05 ? ('🍬 ' + _candyFmt(owed) + ' candy to spend')
                                 : '🍬 0 — do more work to earn candy';
    box.appendChild(l1);

    // ── L2 asset line: DOGE held · worth · maturity (24h hold, glance-level) · gain/loss ──
    if (inApp > 0.0001 && rate) {
        var l2 = document.createElement('div');
        l2.className = 'geneva'; l2.style.cssText = 'font-size:11px;color:#8a7330;margin-top:3px';
        var bits = ['Ɖ ' + _dogeFmt(inApp) + ' saved', 'worth ' + _candyFmt(nowWorth) + ' 🍬'];
        if (sellable < 0.0001) bits.push('ready in ~a day');               // none matured: cashable later
        else if (sellable < inApp - 0.05) bits.push(_dogeFmt(sellable) + ' Ɖ ready');   // some matured
        l2.textContent = bits.join('  ·  ');
        // gain/loss chip — ALWAYS show DIRECTION when there's a cost basis (the up/down lesson);
        // only the noisy exact "0%" collapses to a neutral "≈ even".
        if (inAppBasis > 0.001) {
            // Direction from the RAW delta (not the rounded %), so a real but sub-1% move still
            // shows ▲/▼ — the "you can lose" lesson must survive on small holdings. "≈ even" only
            // when worth EXACTLY equals cost basis; a true sub-1% move shows "<1%".
            var delta = nowWorth - inAppBasis;
            var pct = Math.abs(Math.round((delta / inAppBasis) * 100));
            var amt = pct >= 1 ? (pct + '%') : '<1%';
            var chip = document.createElement('span');
            chip.style.cssText = 'font-weight:bold;margin-left:6px';
            if (delta > 1e-9) { chip.style.color = '#3a7d00'; chip.textContent = '▲ up ' + amt; }
            else if (delta < -1e-9) { chip.style.color = '#b23a3a'; chip.textContent = '▼ down ' + amt; }
            else { chip.style.color = '#8a7330'; chip.textContent = '≈ even'; }
            l2.appendChild(document.createTextNode('  ·'));
            l2.appendChild(chip);
        }
        box.appendChild(l2);
    }

    // On-chain glance (WALLET_REDESIGN follow-on): the kid's REAL deposited DOGE — a cheap face
    // hint from doge_sent (already in /wallet; NO live poll). The live blockchain confirmation +
    // explorer link stay in ▸ Details (which self-refreshes only while open). Shown even when
    // inApp=0 (all coins already on-chain), so a kid always sees their real coins at a glance.
    if ((w.dogeSent || 0) > 0.0001) {
        var ocl = document.createElement('div');
        ocl.className = 'geneva'; ocl.style.cssText = 'font-size:10px;color:#5a6b00;margin-top:3px';
        ocl.textContent = '⛓ Ɖ ' + _dogeFmt(w.dogeSent) + ' in your wallet (yours to keep)';
        box.appendChild(ocl);
    }

    // ── Pill row: only the VALID actions; tapping opens ONE inline form (mutually exclusive) ──
    var pillRow = document.createElement('div');
    pillRow.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:7px';
    var formSlot = document.createElement('div');
    formSlot.style.cssText = 'margin-top:5px;display:none';
    var PILL = 'font-size:11px;min-width:0;padding:4px 12px';     // min-width:0 so 3 pills fit a 360px phone
    var pills = {};
    var openPill = null;
    function setActive(kind) { Object.keys(pills).forEach(function (k) { pills[k].classList.toggle('s7btn-inv', k === kind); }); }
    function closeForm() { openPill = null; setActive(null); formSlot.style.display = 'none'; formSlot.innerHTML = ''; }
    function openForm(kind, builder) {
        if (openPill === kind) { closeForm(); return; }
        openPill = kind; setActive(kind);
        formSlot.innerHTML = ''; formSlot.style.display = 'block'; builder(formSlot);
    }
    function mkPill(label) { var b = document.createElement('button'); b.className = 's7btn'; b.style.cssText = PILL; b.textContent = label; return b; }
    function formCard() { var f = document.createElement('div'); f.style.cssText = 'border:1px solid #d8b86a;background:#fffdf5;border-radius:3px;padding:7px 8px'; return f; }
    function formLabel(t) { var l = document.createElement('div'); l.className = 'geneva'; l.style.cssText = 'font-size:10px;color:#5a4500;margin-bottom:4px'; l.textContent = t; return l; }
    function smallBtn(label) { var b = document.createElement('button'); b.className = 's7btn'; b.style.cssText = 'font-size:10px;min-width:0;padding:3px 10px'; b.textContent = label; return b; }

    // BUY — candy → DOGE (any amount, no minimum; live "→ ≈ Ɖ" preview as you type)
    if (owed > 0.05 && rate) {
        var buyPill = mkPill('Ɖ Buy'); pills.buy = buyPill;
        buyPill.onclick = function () { openForm('buy', function (slot) {
            var f = formCard(); f.appendChild(formLabel('Turn candy into DOGE'));
            var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
            var amt = document.createElement('input'); amt.type = 'number'; amt.min = '0'; amt.placeholder = 'all';
            amt.style.cssText = 'width:56px;font-size:11px;padding:3px;border:1px solid #c9961f';
            var prev = document.createElement('span'); prev.className = 'geneva'; prev.style.cssText = 'font-size:10px;color:#6b5400';
            var amount = function () { var v = parseFloat(amt.value); return (isFinite(v) && v > 0) ? Math.min(v, owed) : owed; };
            var paint = function () { prev.textContent = '🍬 → ≈ Ɖ ' + (amount() / rate).toFixed(2); };
            amt.oninput = paint; paint();
            var msg = document.createElement('div'); msg.className = 'geneva'; msg.style.cssText = 'font-size:9px;color:#a07c1c;margin-top:3px';
            var cancel = smallBtn('Cancel'); cancel.onclick = closeForm;
            var go = smallBtn('Ɖ Buy');
            go.onclick = function () { go.disabled = true; msg.textContent = '…';
                _dogeWalletAction('/wallet/buy-doge', amount()).then(function (res) {
                    if (res && res.ok) { _dogeWalletFetch().then(function (w2) { _dogeWalletRender(box, w2, pts); }); }
                    else { go.disabled = false; msg.textContent = (res && res.error) || 'failed'; }
                }); };
            row.appendChild(amt); row.appendChild(prev); row.appendChild(cancel); row.appendChild(go);
            f.appendChild(row);
            var hint = document.createElement('div'); hint.className = 'geneva'; hint.style.cssText = 'font-size:9px;color:#a07c1c;margin-top:3px';
            hint.textContent = 'any amount, no minimum — DOGE can go up or down.';
            f.appendChild(hint); f.appendChild(msg); slot.appendChild(f);
        }); };
        pillRow.appendChild(buyPill);
    }
    // CASH OUT — DOGE → candy (matured/un-sent only; the 24h-hold cue lives here when nothing is ready)
    if (inApp > 0.0001) {
        var cashPill = mkPill('🍬 Cash out'); pills.cash = cashPill;
        cashPill.onclick = function () { openForm('cash', function (slot) {
            var f = formCard(); f.appendChild(formLabel('Turn DOGE back into candy'));
            if (sellable > 0.0001 && rate) {
                var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
                var samt = document.createElement('input'); samt.type = 'number'; samt.min = '0'; samt.step = '0.1'; samt.placeholder = _dogeFmt(sellable);
                samt.style.cssText = 'width:56px;font-size:11px;padding:3px;border:1px solid #c9961f';
                var sprev = document.createElement('span'); sprev.className = 'geneva'; sprev.style.cssText = 'font-size:10px;color:#6b5400';
                var samount = function () { var v = parseFloat(samt.value); return (isFinite(v) && v > 0) ? Math.min(v, sellable) : sellable; };
                var spaint = function () { sprev.textContent = 'Ɖ → ≈ ' + _candyFmt(samount() * rate) + ' 🍬'; };
                samt.oninput = spaint; spaint();
                var smsg = document.createElement('div'); smsg.className = 'geneva'; smsg.style.cssText = 'font-size:9px;color:#a07c1c;margin-top:3px';
                var scancel = smallBtn('Cancel'); scancel.onclick = closeForm;
                var sgo = smallBtn('🍬 Cash out');
                sgo.onclick = function () { sgo.disabled = true; smsg.textContent = '…';
                    _dogeWalletAction('/wallet/sell-doge', { doge: samount() }).then(function (res) {
                        if (res && res.ok) { _dogeWalletFetch().then(function (w2) { _dogeWalletRender(box, w2, pts); }); }
                        else { sgo.disabled = false; smsg.textContent = (res && res.error) || 'failed'; }
                    }); };
                row.appendChild(samt); row.appendChild(sprev); row.appendChild(scancel); row.appendChild(sgo);
                f.appendChild(row);
                var srate = document.createElement('div'); srate.className = 'geneva'; srate.style.cssText = 'font-size:9px;color:#a07c1c;margin-top:3px';
                srate.textContent = _dogeFmt(sellable) + ' Ɖ ready · 1 Ɖ = ' + _candyFmt(rate) + ' 🍬 today';
                f.appendChild(srate); f.appendChild(smsg);
            } else {
                var hold = document.createElement('div'); hold.className = 'geneva'; hold.style.cssText = 'font-size:10px;color:#8a7330;line-height:1.4';
                hold.textContent = 'Ready ~a day after you buy — hold it. DOGE can go up or down while you hold.';
                f.appendChild(hold);
                var okWrap = document.createElement('div'); okWrap.style.cssText = 'margin-top:5px';
                var ok = smallBtn('OK'); ok.onclick = closeForm; okWrap.appendChild(ok); f.appendChild(okWrap);
            }
            slot.appendChild(f);
        }); };
        pillRow.appendChild(cashPill);
    }
    // GIFT — candy → classmate (reuses the existing _dogeWalletGiftForm verbatim)
    if (owed >= 1) {
        var giftPill = mkPill('🎁 Gift'); pills.gift = giftPill;
        giftPill.onclick = function () { openForm('gift', function (slot) {
            var f = formCard();
            var top = document.createElement('div'); top.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:3px';
            var gcancel = smallBtn('Cancel'); gcancel.onclick = closeForm; top.appendChild(gcancel); f.appendChild(top);
            var giftWrap = document.createElement('div'); f.appendChild(giftWrap); slot.appendChild(f);
            _dogeWalletGiftForm(giftWrap, box, w, pts);
        }); };
        pillRow.appendChild(giftPill);
    }

    if (pillRow.children.length) {
        box.appendChild(pillRow); box.appendChild(formSlot);
    }
    // No standalone "do more work" footer: when owed<=0.05 the L1 hero already says
    // "0 — do more work"; and when the kid HAS candy but no actions are available right now
    // (a transient DOGE-price outage), the hero stands alone instead of contradicting it.

    // ── Details (collapsed by default — keep the resting state calm): the full 10-number ledger
    // with EXACT values (so the column reconciles), DOGE specifics, and the on-chain watch line. ──
    var detSlot = document.createElement('div');
    detSlot.style.cssText = 'display:none;margin-top:7px;border-top:1px solid #e3d3a0;padding-top:6px';
    box.appendChild(detSlot);
    var detOpen = false, detBuilt = false;
    detToggle.onclick = function () {
        detOpen = !detOpen;
        if (!detOpen && typeof _clearStudentWalletCeremony === 'function') {
            _clearStudentWalletCeremony();
            detSlot.replaceChildren();
            detBuilt = false;
        }
        detToggle.textContent = (detOpen ? '▾' : '▸') + ' Details';
        detSlot.style.display = detOpen ? 'block' : 'none';
        if (detOpen && !detBuilt) { detBuilt = true; _walletLedgerDetail(detSlot, w); }   // chain self-refresh arms only while open
    };
}

// The ▸ Details drawer for the Candy & DOGE panel: the 10-number conservation ledger
// (Earned + Received + Realized + Bonus + Returned
//  = Gifted + Converted + Materialized + Escrowed + Owed) as a labelled
// field list with EXACT values + zero rows omitted, "To spend or gift" bolded so it
// reconciles to the hero, then the DOGE detail + the watch-only on-chain line.
function _walletLedgerDetail(host, w) {
    var earned = w.candyEarned || 0, materialized = w.candyMaterialized || 0;
    var owed = (typeof w.candyOwed === 'number') ? w.candyOwed : (w.candyBalance || 0);
    var received = w.candyReceived || 0, gifted = w.candyGiftedOut || 0;
    var converted = w.candyConverted || 0, realized = w.candyRealized || 0;
    var returned = w.candyReturned || 0, inHand = Math.max(0, materialized - returned);
    var doge = w.dogeBalance || 0, rate = w.candyPerDoge || 0, sent = w.dogeSent || 0;
    var inApp = Math.max(0, doge - sent);
    var cx = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };   // EXACT (2dp) — the column must sum
    function row(into, label, val, bold) {
        var r = document.createElement('div'); r.className = 'geneva';
        r.style.cssText = 'display:flex;justify-content:space-between;gap:10px;font-size:10px;color:#6b5400' + (bold ? ';font-weight:bold;color:#5a4500' : '');
        var a = document.createElement('span'); a.textContent = label;
        var b = document.createElement('span'); b.textContent = val;
        r.appendChild(a); r.appendChild(b); into.appendChild(r);
    }
    function groupHead(into, t) { var h = document.createElement('div'); h.className = 'geneva'; h.style.cssText = 'font-size:9px;color:#a07c1c;letter-spacing:.5px;margin:0 0 2px'; h.textContent = t; into.appendChild(h); }
    var cg = document.createElement('div'); cg.style.cssText = 'margin-bottom:5px';
    groupHead(cg, 'CANDY');
    row(cg, 'Earned all-term', '🍬 ' + cx(earned));
    if (inHand > 0.005) row(cg, 'In hand', '🍬 ' + cx(inHand));
    if (returned > 0.005) row(cg, 'Handed back', '🍬 ' + cx(returned));
    if (received > 0.005) row(cg, 'From friends', '🍬 +' + cx(received));
    // PICO_DESK_SPEC "Candy economy": the server books key purchases inside candyGiftedOut
    // (migration 0039); split them back out so "Gifted away" means gifts only.
    var keySpent = Math.min(gifted, Math.max(0, w.candyKeySpent || 0));
    if (gifted - keySpent > 0.005) row(cg, 'Gifted away', '🍬 −' + cx(gifted - keySpent));
    if (keySpent > 0.005) row(cg, 'Park keys bought', '🍬 −' + cx(keySpent));
    if (converted > 0.005) row(cg, 'Turned into DOGE', '🍬 −' + cx(converted));
    if (Math.abs(realized) > 0.005) row(cg, 'Cashed out (net)', '🍬 ' + (realized >= 0 ? '+' : '−') + cx(Math.abs(realized)));
    row(cg, '▸ To spend or gift', '🍬 ' + cx(owed), true);
    host.appendChild(cg);
    // Pico Park keys bought with candy (PICO_DESK_SPEC "Candy economy", item 10): each purchase in the
    // recent wallet history is listed as "Key (−price)"; a refunded one (the park did not take it) as
    // "Key refunded (+price)". Nothing is drawn when there are none.
    var keyRows = (Array.isArray(w.history) ? w.history : []).filter(function (h) {
        return h && (h.kind === 'key_buy' || h.kind === 'key_refund');
    });
    if (keyRows.length) {
        var kg = document.createElement('div'); kg.style.cssText = 'margin-bottom:5px';
        groupHead(kg, 'PARK KEYS');
        keyRows.forEach(function (h) {
            var amount = Math.abs(Number(h.candy_delta) || 0);
            var when = h.ts ? new Date(h.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
            row(kg, h.kind === 'key_buy' ? 'Key (−' + amount + ')' : 'Key refunded (+' + amount + ')', when);
        });
        host.appendChild(kg);
    }
    if (inApp > 0.0001 || w.dogeAddress) {
        var dg = document.createElement('div');
        groupHead(dg, 'DOGE');
        if (inApp > 0.0001) {   // in-app rows use inApp; when all coins are on-chain (inApp=0) we skip them (no "Ɖ 0")
            var usd = w.dogeUsd ? (inApp * w.dogeUsd) : 0;
            row(dg, 'Held (in app)', 'Ɖ ' + cx(inApp) + (usd ? '  ($' + usd.toFixed(2) + ')' : ''));
            if (rate) row(dg, 'Worth now', '🍬 ' + cx(inApp * rate));
            var basis = (doge > 0) ? converted * (inApp / doge) : 0;
            if (basis > 0.005) row(dg, 'You put in', '🍬 ' + cx(basis));
            if (rate) row(dg, "Today's rate", '1 Ɖ = ' + cx(rate) + ' 🍬');
            var toDep = w.dogeToDeposit || 0, minMat = w.minMaterializeDoge || 5;
            if (toDep > 0.0001 && toDep < minMat - 1e-9) row(dg, 'Deposits on-chain at', 'Ɖ ' + minMat);
        }
        host.appendChild(dg);
        if (w.dogeAddress) {   // the kid's REAL deposited coins — watch-only, self-refreshes while Details is open
            var chainLine = document.createElement('div'); chainLine.className = 'geneva';
            chainLine.style.cssText = 'font-size:10px;color:#5a6b00;margin-top:3px;display:none';
            host.appendChild(chainLine); _dogeWalletChainArm(chainLine);
        }
    }
    if (typeof _studentWalletOnboardingAllowed === 'function' && _studentWalletOnboardingAllowed(w)) {
        _studentWalletOnboarding(host, w);
    }
}

// Advanced, opt-in self-custody ceremony. Secret material lives only in this
// closure and removable DOM nodes. The only request body is { address }.
function _studentWalletOnboardingAllowed(wallet) {
    if (!wallet || wallet.dogeAddress || wallet.studentWalletOnboardingEligible !== true) return false;
    if (typeof _viewAsContext === 'function' && _viewAsContext()) return false;
    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return false;
    try {
        var who = window.rosterClient && typeof window.rosterClient.current === 'function'
            ? window.rosterClient.current() : null;
        if (who && who.role === 'teacher') return false;
    } catch (_) { return false; }
    return true;
}
function _clearStudentWalletCeremony() {
    if (window.StudentWalletPrint) window.StudentWalletPrint.clear();
    var cleanup = window.__studentWalletCeremonyCleanup;
    window.__studentWalletCeremonyCleanup = null;
    if (typeof cleanup === 'function') {
        try { cleanup(); } catch (_) {}
    }
}
function _studentWalletOnboarding(host, wallet) {
    if (!_studentWalletOnboardingAllowed(wallet)) return;
    var panel = document.createElement('div');
    panel.style.cssText = 'border-top:1px solid #e3d3a0;margin-top:7px;padding-top:7px';
    host.appendChild(panel);

    function label(text) {
        var el = document.createElement('div');
        el.className = 'geneva';
        el.style.cssText = 'font-size:10px;color:#6b5400;line-height:1.45';
        el.textContent = text;
        return el;
    }
    function button(text) {
        var el = document.createElement('button');
        el.type = 'button'; el.className = 's7btn';
        el.style.cssText = 'font-size:10px;min-width:0;padding:3px 9px;margin:5px 5px 0 0';
        el.textContent = text;
        return el;
    }
    function pending(masked) {
        panel.replaceChildren();
        var line = label('⏳ Address awaiting teacher approval: ' + masked);
        line.style.fontWeight = 'bold'; line.style.color = '#7a6200';
        panel.appendChild(line);
        panel.appendChild(label('Read the last 4 characters aloud from this screen before your teacher approves it.'));
    }

    if (wallet.proposedAddressMasked) {
        pending(wallet.proposedAddressMasked);
        return;
    }

    if (wallet.proposalRejectionReason) {
        var rejected = label('Your teacher did not approve the proposed address: ' + wallet.proposalRejectionReason);
        rejected.style.cssText += ';color:#9b2e2e;font-weight:bold;margin-bottom:4px';
        panel.appendChild(rejected);
    }
    if (!wallet.studentWalletOptInEnabled) return;

    var start = button('🔐 Create my own wallet (advanced)');
    panel.appendChild(start);
    var paper = label('The safe default is still a paper wallet from your teacher, with a sealed backup.');
    paper.style.marginTop = '4px'; panel.appendChild(paper);
    start.onclick = function () {
        if (_studentWalletOnboardingAllowed(wallet)) _studentWalletCeremony(panel, wallet);
    };
}

function _studentWalletCeremony(host, wallet) {
    if (!_studentWalletOnboardingAllowed(wallet)) return;
    _clearStudentWalletCeremony();
    var onboardingHost = host.parentNode;
    var session = null;
    var words = null;
    var active = true;
    var leaveHandler = function () { clearSecrets(); };

    function textLine(text) {
        var el = document.createElement('div'); el.className = 'geneva';
        el.style.cssText = 'font-size:10px;color:#5a4500;line-height:1.45;margin-top:4px';
        el.textContent = text; return el;
    }
    function smallButton(text) {
        var el = document.createElement('button'); el.type = 'button'; el.className = 's7btn';
        el.style.cssText = 'font-size:10px;min-width:0;padding:3px 9px;margin:6px 5px 0 0';
        el.textContent = text; return el;
    }
    function clearSecrets() {
        active = false;
        if (window.__studentWalletCeremonyCleanup === clearSecrets) {
            window.__studentWalletCeremonyCleanup = null;
        }
        if (words) { for (var i = 0; i < words.length; i++) words[i] = ''; }
        words = null;
        if (session && typeof session.destroy === 'function') session.destroy();
        session = null;
        window.removeEventListener('pagehide', leaveHandler);
        Array.prototype.forEach.call(host.querySelectorAll('input'), function (input) { input.value = ''; });
        host.replaceChildren();
    }
    function cancel() {
        clearSecrets();
        if (onboardingHost && onboardingHost.isConnected) {
            host.remove();
            _studentWalletOnboarding(onboardingHost, wallet);
        }
    }
    function showPending(masked) {
        clearSecrets();
        var line = textLine('⏳ Address awaiting teacher approval: ' + masked);
        line.style.fontWeight = 'bold'; host.appendChild(line);
        host.appendChild(textLine('Read the last 4 characters aloud from this screen before your teacher approves it.'));
    }
    function showReveal(note) {
        host.replaceChildren();
        var title = textLine('Write these 12 words on paper, in order. This is the only reveal.');
        title.style.fontWeight = 'bold'; host.appendChild(title);
        if (note) { var retry = textLine(note); retry.style.color = '#9b2e2e'; host.appendChild(retry); }

        var grid = document.createElement('ol');
        grid.setAttribute('aria-label', 'wallet recovery words');
        grid.style.cssText = 'columns:2;margin:7px 0 3px;padding-left:28px;font:12px monospace;user-select:none';
        grid.addEventListener('copy', function (event) { event.preventDefault(); });
        words.forEach(function (word) { var item = document.createElement('li'); item.textContent = word; grid.appendChild(item); });
        host.appendChild(grid);
        host.appendChild(textLine('Copy is disabled. Write the words down carefully. You may print this reveal as your own paper backup.'));
        var printButton = smallButton('Print backup');
        printButton.onclick = function () { window.print(); };
        var checkButton = smallButton('I wrote all 12 words down');
        checkButton.onclick = showCheck;
        var cancelButton = smallButton('Cancel and erase'); cancelButton.onclick = cancel;
        host.appendChild(printButton); host.appendChild(checkButton); host.appendChild(cancelButton);
    }
    function showCheck() {
        var indexes;
        try { indexes = window.StudentWallet.pickWordIndexes(words.length, 3); }
        catch (error) { showReveal('Secure random checking is unavailable. Cancel and ask your teacher for a paper wallet.'); return; }
        host.replaceChildren();
        host.appendChild(textLine('Prove you wrote it down. Enter these 3 words:'));
        var inputs = [];
        indexes.forEach(function (index) {
            var row = document.createElement('label'); row.className = 'geneva';
            row.style.cssText = 'display:block;font-size:10px;color:#5a4500;margin-top:5px';
            row.appendChild(document.createTextNode('Word ' + (index + 1) + ': '));
            var input = document.createElement('input'); input.type = 'text';
            input.autocomplete = 'off'; input.autocapitalize = 'none'; input.spellcheck = false;
            input.style.cssText = 'width:115px;font:11px monospace;border:1px solid #c9961f;padding:2px 4px';
            row.appendChild(input); host.appendChild(row); inputs.push(input);
        });
        var message = textLine(''); host.appendChild(message);
        var seal = smallButton('Verify and seal');
        var back = smallButton('Back to the words'); back.onclick = function () { showReveal(''); };
        var stop = smallButton('Cancel and erase'); stop.onclick = cancel;
        host.appendChild(seal); host.appendChild(back); host.appendChild(stop);
        seal.onclick = function () {
            var correct = indexes.every(function (index, position) {
                return inputs[position].value.trim().toLowerCase() === words[index];
            });
            inputs.forEach(function (input) { input.value = ''; });
            if (!correct) { showReveal('Those words did not match. Check your paper, then try the same wallet again.'); return; }
            seal.disabled = true; back.disabled = true; stop.disabled = true;
            message.textContent = 'Sending the public address only…';
            var address = session.address;
            _dogeWalletAction('/wallet/address/propose', { address: address }).then(function (result) {
                if (result && result.ok && result.proposedAddressMasked) {
                    showPending(result.proposedAddressMasked);
                    return;
                }
                seal.disabled = false; back.disabled = false; stop.disabled = false;
                message.textContent = (result && result.error) || 'Could not reach the teacher queue. Your wallet is still only in this ceremony; try again or cancel.';
            });
        };
    }

    host.replaceChildren();
    var warning = textLine('Your teacher cannot recover this. The school cannot recover this. Nobody can. If you lose the phrase, any DOGE at this address is gone forever. A paper wallet from your teacher is the safe option.');
    warning.style.fontWeight = 'bold'; warning.style.color = '#8f2020'; host.appendChild(warning);
    host.appendChild(textLine('Type I UNDERSTAND exactly to continue.'));
    var gate = document.createElement('input'); gate.type = 'text'; gate.autocomplete = 'off';
    gate.style.cssText = 'width:145px;font:11px monospace;border:1px solid #b23a3a;padding:3px 4px;margin-top:5px';
    host.appendChild(gate);
    var generate = smallButton('Generate 12-word wallet'); generate.disabled = true;
    var cancelButton = smallButton('Use teacher paper wallet'); cancelButton.onclick = cancel;
    host.appendChild(generate); host.appendChild(cancelButton);
    gate.addEventListener('input', function () { generate.disabled = gate.value !== 'I UNDERSTAND'; });
    generate.onclick = function () {
        if (gate.value !== 'I UNDERSTAND') return;
        gate.value = ''; generate.disabled = true; cancelButton.disabled = true;
        host.appendChild(textLine('Generating securely on this device…'));
        if (!window.StudentWallet || typeof window.StudentWallet.createWallet !== 'function') {
            clearSecrets(); host.appendChild(textLine('Wallet generation is unavailable. Ask your teacher for a paper wallet.')); return;
        }
        window.StudentWallet.createWallet().then(function (created) {
            if (!active || !host.isConnected) {
                if (created && typeof created.destroy === 'function') created.destroy();
                return;
            }
            session = created; words = session.words(); showReveal('');
        }).catch(function () {
            if (!active) return;
            clearSecrets(); host.appendChild(textLine('Secure wallet generation failed. Ask your teacher for a paper wallet.'));
        });
    };
    window.__studentWalletCeremonyCleanup = clearSecrets;
    window.addEventListener('pagehide', leaveHandler, { once: true });
}
function _dogeWalletPreviewFallback(box, pts, notProvisioned) {
    if (typeof WalletLogic === 'undefined' || typeof WalletLogic.candyFromPoints !== 'function') return;
    var total = (pts && typeof pts.total === 'number') ? pts.total : 0;
    var candy = WalletLogic.candyFromPoints(total);
    var usd = WalletLogic.usdFromCandy(candy);
    var l1 = document.createElement('div');
    l1.className = 'geneva'; l1.style.cssText = 'font-size:12px;font-weight:bold;color:#5a4500';
    l1.textContent = '🍬 ' + candy.toFixed(0) + ' candy  ·  $' + usd.toFixed(2);
    box.appendChild(l1);
    var l2 = document.createElement('div');
    l2.className = 'geneva'; l2.style.cssText = 'font-size:10px;color:#8a7330;margin-top:2px';
    l2.textContent = notProvisioned ? 'Rewards aren’t turned on yet (preview).' : 'Earn it, gift it to a friend, or bank it as Dogecoin.';
    box.appendChild(l2);
    var rate = document.createElement('div');
    rate.className = 'geneva'; rate.style.cssText = 'font-size:11px;color:#5a4500;margin-top:4px';
    rate.textContent = 'Loading DOGE price…';
    box.appendChild(rate);
    _fetchDogePrice().then(function (price) {
        if (!price) { rate.textContent = '(DOGE price unavailable right now)'; return; }
        rate.innerHTML = '1 DOGE = <b>' + WalletLogic.candyPerDoge(price).toFixed(1) + ' candy</b> today (Ɖ at $' + price.toFixed(4) + ')<br>'
            + 'Bank it all → <b>Ɖ ' + WalletLogic.dogeFromCandy(candy, price).toFixed(1) + '</b> in your DOGE wallet.';
    });
}

function _walletBonusResponse(r) {
    try { return typeof r.response === 'string' ? (JSON.parse(r.response) || {}) : (r.response || {}); }
    catch (_) { return {}; }
}

// Footer of the "Bonus banked" block. Before apply: the higher-track rule.
// After apply: the grade, plus the track it was placed on when the row names one
// (Bonus Bank v2; older applied rows carry no placement).
function _walletBonusFooterText(applied) {
    if (!applied) return 'Added at the end of the quarter to whichever track helps you more.';
    var audit = _walletBonusResponse(applied);
    var grade = audit.adjustedGrade != null ? audit.adjustedGrade : applied.sc;
    if (audit.placement === 'pc') return 'Applied to your Progress Check track — quarter grade ' + grade + '.';
    if (audit.placement === 'work') return 'Applied to your Work track — quarter grade ' + grade + '.';
    return 'Bonus applied — quarter grade ' + grade;
}

// The one grouping of BONUS-* ledger rows for the current quarter (BONUS_DONOW_SPEC §2). Both the
// My Ledger block and the Do Now line render from this, so the two surfaces cannot disagree.
// Returns null when nothing is banked and nothing was applied this quarter.
// Bonus sheets: stored points stay E 5 / P 3 / I 1; shown and counted x1.5 (teacher 2026-10-03,
// retroactive). Mirrors roster-server/grade-config.js BONUS_MULTIPLIER (pinned equal by a test).
var DESK_BONUS_MULTIPLIER = 1.5;
function _bonusSummary(receipts) {
    // QUARTER_LINE_BY_DUE_DATE_SPEC §3.8: the closing quarter while its 0s are still fixable (its
    // banked bonus is added at the close), else the current quarter. Never 'Q0' on a gap day.
    var phase = (typeof _deskQuarterPhase === 'function') ? _deskQuarterPhase() : null;
    var quarter = phase ? (phase.closing || phase.current) : null;
    if (!quarter && typeof quarterOfDate === 'function') {
        var n = quarterOfDate((typeof tdy === 'function') ? tdy() : new Date());
        if (n) quarter = 'Q' + n;
    }
    if (!quarter && typeof _walletCurrentQuarter === 'function') quarter = _walletCurrentQuarter().quarter;
    if (!quarter) quarter = 'Q1';
    // 'Tuesday' (the close day's weekday, from config) while that quarter closes ahead of us: its bonus is added at that close.
    var closeDay = null;
    if (phase && phase.closing === quarter && typeof _quarterConfig === 'function') {
        var close = _quarterConfig(quarter).close;
        if (close) closeDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(close + 'T00:00:00').getDay()];
    }
    var byItem = new Map();
    var applied = null;
    (receipts || []).forEach(function (r) {
        var item = r.i || r.itemId || r.item || '';
        if (r.src === 'bonus_applied' && item === 'BONUS-APPLIED-' + quarter) applied = r;
        if (r.src !== 'bonus') return;
        var data = _walletBonusResponse(r);
        if (data.quarter && data.quarter !== quarter) return;
        byItem.set(item, { row: r, data: data });
    });
    if (!byItem.size && !applied) return null;
    var sheets = [];
    var total = 0;
    byItem.forEach(function (sheet, item) {
        var stored = Number(sheet.row.sc);
        if (!isFinite(stored)) stored = 0;
        var points = stored * (typeof DESK_BONUS_MULTIPLIER === 'number' ? DESK_BONUS_MULTIPLIER : 1);
        total += points;
        sheets.push({
            title: sheet.data.title || item.replace(/^BONUS-/, ''),
            grade: sheet.data.grade || ({ 5: 'E', 3: 'P', 1: 'I' })[stored] || '—',
            points: points
        });
    });
    return { quarter: quarter, sheets: sheets, total: total, applied: applied, closeDay: closeDay };
}
// "Added at Tuesday's close to whichever track helps you more." while the quarter is closing;
// the ledger's usual footer otherwise (QUARTER_LINE_BY_DUE_DATE_SPEC §3.8).
function _bonusPendingText(summary) {
    if (summary && summary.closeDay && !summary.applied) return 'Added at ' + summary.closeDay + '\'s close to whichever track helps you more.';
    return _walletBonusFooterText(summary ? summary.applied : null);
}

function _walletBonusBlock(receipts) {
    var summary = _bonusSummary(receipts);
    if (!summary) return null;
    var applied = summary.applied;
    var block = document.createElement('div');
    block.className = 'wallet-bonus-block geneva';
    block.style.cssText = 'border:1px solid var(--black);background:#fff;'
        + 'box-shadow:inset 1px 1px 0 0 #fff,inset -1px -1px 0 0 #888,2px 2px 0 0 var(--black);'
        + 'border-radius:3px;padding:12px 14px;margin-bottom:12px;font-size:11px';
    var header = document.createElement('div');
    header.className = 'chicago';
    header.textContent = 'Bonus banked';
    block.appendChild(header);
    summary.sheets.forEach(function (sheet) {
        var line = document.createElement('div');
        line.textContent = sheet.title + ' — ' + sheet.grade + ' (+' + sheet.points + ')';
        block.appendChild(line);
    });
    var footer = document.createElement('div');
    footer.style.marginTop = '6px';
    footer.textContent = (typeof _bonusPendingText === 'function') ? _bonusPendingText(summary) : _walletBonusFooterText(applied);
    block.appendChild(footer);
    return block;
}

// One sentence under the Do Now grade pill (BONUS_DONOW_SPEC §1): what is banked this quarter.
// Before apply: "Bonus banked: Screen Time P (+3) · Candle Tests E (+5) = +8 at quarter end".
// After apply: the ledger's applied sentence. Nothing banked → the host stays hidden (no empty strip).
function _doNowBonusText(summary) {
    if (!summary) return '';
    if (summary.applied) return _walletBonusFooterText(summary.applied);
    if (!summary.sheets.length) return '';
    var parts = summary.sheets.map(function (sheet) {
        return sheet.title + ' ' + sheet.grade + ' (+' + sheet.points + ')';
    });
    // §3.8: a closing quarter's bonus is added at its close ("added at Tuesday's close").
    var when = summary.closeDay ? ', added at ' + summary.closeDay + '\'s close' : ' at quarter end';
    return 'Bonus banked: ' + parts.join(' · ') + ' = +' + summary.total + when;
}

function _clearDoNowBonus() {
    var host = document.getElementById('donow-bonus');
    if (!host) return;
    host.style.display = 'none';
    host.textContent = '';
    host.title = '';
}

async function renderDoNowBonus() {
    var host = document.getElementById('donow-bonus');
    if (!host) return;
    var receipts = await _walletFetchBonusReceipts();
    var summary = _bonusSummary(receipts);
    var text = _doNowBonusText(summary);
    if (!text) { _clearDoNowBonus(); return; }
    host.textContent = text;
    if (summary.applied) host.title = '';
    else host.title = (typeof _bonusPendingText === 'function') ? _bonusPendingText(summary) : _walletBonusFooterText(null);
    host.style.display = 'block';
}

// Bonus ledger entries need no signed receipt; fetchReceipts omits unsigned rows.
async function _walletFetchBonusReceipts() {
    try {
        var client = window.rosterClient;
        var base = window.ROSTER_SERVICE_URL;
        if (!client || !base || !client.token() || !client.studentId()) return [];
        // View-as: read the VIEWED student's bank with the teacher's own token (the
        // route allows a verified teacher to read any student). Review finding 2026-09-23.
        var viewAs = (typeof _viewAsContext === 'function') ? _viewAsContext() : null;
        var sid = (viewAs && typeof viewAs.studentId === 'string') ? viewAs.studentId : client.studentId();
        var res = await fetch(base + '/ledger/student/' + encodeURIComponent(sid) + '?prefix=BONUS-', {
            headers: { Authorization: 'Bearer ' + client.token() }
        });
        if (!res.ok) return [];
        var data = await res.json();
        if (!data.ok || !Array.isArray(data.rows)) return [];
        return data.rows.filter(function (r) { return r.source === 'bonus' || r.source === 'bonus_applied'; })
            .map(function (r) { return { src: r.source, i: r.item_id, sc: Number(r.score), response: r.response }; });
    } catch (_) { return []; }
}

// The ONE way from the ledger to the graphs (LEDGER_CALM_SPEC §2.4). Students only: the teacher
// has the desktop icon. Returns null for a teacher.
function _walletSeeClassButton() {
    if (typeof _deskIsTeacher === 'function' && _deskIsTeacher()) return null;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 's7btn wallet-see-class';
    btn.style.cssText = 'font-size:10px;padding:0 6px;margin-left:8px';
    btn.textContent = 'See the class';
    btn.title = 'How your class is doing (no names)';
    btn.onclick = function () { if (typeof openSnapshot === 'function') openSnapshot(); };
    return btn;
}
// ── Effort visibility (EFFORT_VISIBILITY_SPEC.md §3) ──
// PC Day 2 per unit and period, read off the Desk's own calendar (its U<n>-PC2 cells) in the
// data/lesson-schedule.json shape that EffortFacts.pcOnFile reads. Empty before the calendar exists.
function _effortPcSchedule() {
    var out = { progressChecks: {} };
    try {
        var rows = (typeof S !== 'undefined' && Array.isArray(S)) ? S : [];
        var periods = ['B', 'E'];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row || row.length < 5) continue;
            for (var p = 0; p < 2; p++) {
                var cell = row[3 + p];
                var m = (cell && typeof cell === 'object') ? /^U(\d+)-PC2$/.exec(String(cell.t || '')) : null;
                if (!m) continue;
                var mm = row[1] + 1, dd = row[2];
                var iso = row[0] + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
                if (!out.progressChecks[m[1]]) out.progressChecks[m[1]] = { adminDay2: {} };
                out.progressChecks[m[1]].adminDay2[periods[p]] = iso;
            }
        }
    } catch (_) {}
    return out;
}
// The topic number the student sees for a lesson key ('3.1' -> '1.10'); the key when unmapped.
function _effortTopicNumber(key) {
    try {
        var l = (typeof cedLabel === 'function') ? cedLabel(key) : null;
        if (l && l.mapped && l.bonus) return '★ ' + l.label;
        if (l && l.mapped && l.id) return l.id;
    } catch (_) {}
    return String(key);
}
// The two effort facts for a quarter: the PC on file (+ the 40% strategy) and the lessons done
// ahead of the calendar. Never throws; empty when the lib or the /grade caches are missing.
function _effortFacts(curQ) {
    var out = { pc: null, pcText: '', ahead: [], aheadText: '', projection: null };
    try {
        if (typeof EffortFacts === 'undefined' || !EffortFacts) return out;
        var period = (typeof cP === 'string') ? cP : null;
        var today = _zeroTodayIso();
        var quarters = _gradeQuartersCache || null;
        var q = (quarters && curQ) ? quarters[curQ] : null;
        // UNROUNDED averages: the 40% gate test must see the engine's own numbers.
        var workAvg = (q && typeof q.workAvg === 'number') ? q.workAvg : null;
        var pcAvg = (q && typeof q.pcAvg === 'number') ? q.pcAvg : null;
        out.pc = EffortFacts.pcOnFile(_gradeUnitsCache, quarters, period, _effortPcSchedule(), today, curQ);
        if (out.pc) {
            var strategy = EffortFacts.strategyLine(out.pc, workAvg, EffortFacts.GRADE_FLOOR, pcAvg);
            out.pcText = EffortFacts.pcLine(out.pc) + (strategy ? ' ' + strategy : '');
        }
        out.ahead = EffortFacts.aheadLessons(_gradeLessonsCache, period, today);
        out.aheadText = EffortFacts.aheadLine(out.ahead, _effortTopicNumber);
        out.projection = _effortAheadProjection(curQ);
    } catch (_) {}
    return out;
}
// AHEAD_WORK_PROJECTION_SPEC: the server's "what Schoology will read once the ahead cells come
// due" for this quarter, or null (nothing ahead, older payload, or the lib predates the helper).
function _effortGradebookQuarter(curQ) {
    var gb = _gradeGradebookCache;
    return (gb && gb.quarters && curQ && gb.quarters[curQ]) ? gb.quarters[curQ] : null;
}
function _effortAheadProjection(curQ) {
    if (typeof EffortFacts === 'undefined' || !EffortFacts || typeof EffortFacts.aheadProjection !== 'function') return null;
    return EffortFacts.aheadProjection(_effortGradebookQuarter(curQ));
}
function _effortAheadProjectionSentence(curQ, lessonCount) {
    if (typeof EffortFacts === 'undefined' || !EffortFacts || typeof EffortFacts.aheadProjectionSentence !== 'function') return '';
    return EffortFacts.aheadProjectionSentence(_effortGradebookQuarter(curQ), lessonCount);
}
// The balance card's effort lines: the PC on file (grey bar) and the work done ahead (green bar).
// Always in the balance card, never in the Missing-work card, so a student with nothing missing
// still sees the praise.
function _walletEffortBlock(curQ) {
    var facts = _effortFacts(curQ);
    if (!facts.pcText && !facts.aheadText) return null;
    var box = document.createElement('div');
    box.className = 'wallet-effort geneva';
    box.style.cssText = 'font-size:11px;line-height:1.35;margin-top:8px;color:#222';
    function addLine(text, cls, bar) {
        var el = document.createElement('div');
        el.className = cls;
        el.style.cssText = 'border-left:3px solid ' + bar + ';padding:1px 0 1px 6px;margin-top:3px';
        el.textContent = text;
        box.appendChild(el);
    }
    if (facts.pcText) addLine(facts.pcText, 'wallet-effort-pc', '#888888');
    if (facts.aheadText) {
        addLine(facts.aheadText + _effortAheadProjectionSentence(curQ, facts.ahead.length), 'wallet-effort-ahead', '#2a8a2a');
    }
    return box;
}
// "How your grade is counted": three short sentences, small grey text, always on the balance card.
// The words live in lib/effort-facts.js (shared with the slip footer); the copy here is the
// fallback when the lib failed to load.
function _walletCountingNote() {
    var note = document.createElement('div');
    note.className = 'wallet-counting-note geneva';
    note.style.cssText = 'font-size:10px;line-height:1.35;margin-top:6px;color:#666';
    note.textContent = (typeof EffortFacts !== 'undefined' && EffortFacts && EffortFacts.COUNTING_NOTE)
        ? EffortFacts.COUNTING_NOTE
        : 'Work is worksheets 30%, quizzes 30%, the unit poster 30%, Blookets 10%; once Work (with bonus) is at least 40%, a higher Progress Check score replaces it, and a low one never lowers you. '
            + 'The Desk counts work you did ahead of the calendar now; Schoology counts it when its column opens. '
            + 'Your unit poster is scored 90 to 115; DOK bonus sheets are banked and added at the end of the quarter to whichever track helps you more — they can only raise your grade.';
    return note;
}
function _walletPaint(host, receipts, loading) {
    if (!host) return;
    if (typeof _clearStudentWalletCeremony === 'function') _clearStudentWalletCeremony();
    var grade = _walletCurrentGrade();
    var readiness = _walletDisplayReadiness();
    var pts = _walletComputePoints(receipts);
    host.innerHTML = '';
    _walletApplyWindowReadiness(readiness);

    // ── Balance card ──
    var card = document.createElement('div');
    card.style.cssText = 'border:1px solid var(--black);background:#fff;'
        + 'box-shadow:inset 1px 1px 0 0 #fff,inset -1px -1px 0 0 #888,2px 2px 0 0 var(--black);'
        + 'border-radius:3px;padding:12px 14px;margin-bottom:12px';
    if (readiness && readiness.state !== 'nodue' && typeof readiness.hue === 'number') {
        card.style.backgroundColor = 'hsl(' + readiness.hue + ',60%,88%)';
        card.style.borderColor = 'hsl(' + readiness.hue + ',65%,45%)';
    }
    // LEDGER_GRADE_AGREEMENT_SPEC §2: the card carries the same zero state as the Do Now.
    var warns = (typeof _zeroCurrentWarnings === 'function') ? _zeroCurrentWarnings() : [];
    if (!Array.isArray(warns)) warns = [];   // Codex review: a non-array must never paint a false warning
    _walletApplyZeroTint(card, warns);

    var who = document.createElement('div');
    who.className = 'geneva';
    who.style.cssText = 'font-size:10px;color:#555;margin-bottom:6px;display:flex;justify-content:space-between';
    var name = '';
    try { if (window.rosterClient && rosterClient.username) { name = rosterClient.username() || ''; } } catch (_) {}
    // Review D4 (2026-11-08): the card's corner names the quarter in words ('Quarter 2', never "Q2").
    var quarterBadge = !grade.q ? '' : ((typeof _quarterName === 'function') ? _quarterName(grade.q) : grade.q);
    who.innerHTML = '<span>' + (name ? _walletEsc(name) : 'Your ledger') + '</span>'
        + '<span>' + quarterBadge + '</span>';
    var seeClass = _walletSeeClassButton();
    if (seeClass) who.lastChild.appendChild(seeClass);
    card.appendChild(who);

    var gradeRow = document.createElement('div');
    gradeRow.style.cssText = 'display:flex;align-items:baseline;gap:8px';
    var gradeBig = document.createElement('span');
    gradeBig.className = 'chicago';
    gradeBig.style.cssText = 'font-size:34px;line-height:1';
    if (readiness && readiness.state !== 'nodue' && typeof readiness.hue === 'number') {
        gradeBig.style.color = 'hsl(' + readiness.hue + ',70%,35%)';
    }
    gradeBig.textContent = (grade.pct != null) ? (grade.pct + '%') : '—';
    var gradeLbl = document.createElement('span');
    gradeLbl.className = 'geneva';
    gradeLbl.style.cssText = 'font-size:11px;color:#555';
    gradeLbl.textContent = grade.official ? 'Official grade (same as Schoology)' : 'Grade';
    if (grade.official && typeof _officialGradeTitle === 'function') gradeRow.title = _officialGradeTitle(grade.official);
    gradeRow.appendChild(gradeBig);
    gradeRow.appendChild(gradeLbl);
    card.appendChild(gradeRow);
    if (grade.official) {
        var estimate = document.createElement('div');
        estimate.className = 'wallet-grade-estimate geneva';
        estimate.style.cssText = 'font-size:11px;color:#555;margin-top:2px';
        estimate.textContent = "Today's estimate: " + (grade.estimate != null ? grade.estimate + '%' : '—')
            + ' — moves as you work; the official grade updates every night.';
        card.appendChild(estimate);
    }

    // LEDGER_GRADE_AGREEMENT_SPEC §3: while zeros are coming or counting, the number is not settled.
    // QUARTER_LINE_BY_DUE_DATE_SPEC §3.2: the number, its colour and the drop sentence speak only for
    // the quarter shown; the card tint above keeps every open 0 (the Do Now's zero state).
    var shownWarns = (typeof _zeroRowsInQuarter === 'function') ? _zeroRowsInQuarter(warns, grade.q) : warns;
    if (shownWarns.length) {
        var zerosNow = _zeroAnyPast(shownWarns);
        gradeBig.style.color = zerosNow ? '#a30000' : '#7a5c00';
        if (!grade.official) gradeLbl.textContent = 'Grade today';
        var drop = document.createElement('div');
        drop.className = 'wallet-grade-drop geneva';
        drop.style.cssText = 'font-size:11px;line-height:1.35;margin-top:4px;color:#000;font-weight:bold';
        drop.textContent = _walletGradeDropText(shownWarns);
        card.appendChild(drop);
    }
    // §3.2, decision 8.7: the quarter that just ended, read-only ('Quarter 1 final: 92%').
    var otherLine = (typeof _walletOtherQuarterLine === 'function') ? _walletOtherQuarterLine(grade.q) : '';
    if (otherLine) {
        var other = document.createElement('div');
        other.className = 'wallet-grade-other geneva';
        other.textContent = otherLine;
        card.appendChild(other);
    }

    // EFFORT_VISIBILITY_SPEC §3: the PC on file + the work done ahead, under the grade row.
    var effort = _walletEffortBlock(grade.q);
    if (effort) card.appendChild(effort);
    // Teacher 2026-09-27: how the grade is counted, always shown, under the effort block.
    card.appendChild(_walletCountingNote());

    // ANDROID Phase 2: signed-ledger verification chip. The student's recorded work
    // is cryptographically signed; this shows how many local records verify against
    // the issuer key. Cached (computed once per refresh); students only, not view-as.
    try {
      if (_phase2InputsKey() != null && _phase2VerifySummary && _phase2VerifySummary.available && _phase2VerifySummary.total > 0) {
        var vs = _phase2VerifySummary;
        var vchip = document.createElement('div');
        vchip.className = 'geneva';
        vchip.style.cssText = 'font-size:10px;margin-top:6px;color:#2a7a2a';
        var txt = '🔐 ' + vs.verified + ' of ' + vs.total + ' records verified';
        if (vs.tampered > 0) { txt += ' · ⛔ ' + vs.tampered + ' failed'; vchip.style.color = '#a33'; }
        else if (vs.unverified > 0) { txt += ' · ' + vs.unverified + ' unsigned'; }
        vchip.textContent = txt;
        vchip.title = 'Your recorded work is Ed25519-signed by the teacher server. These records are stored on this device and verify against the issuer key — tamper-evident even offline.';
        card.appendChild(vchip);
      }
    } catch (_) {}

    var sep = document.createElement('div');
    sep.style.cssText = 'border-top:1px solid #ccc;margin:8px 0';
    card.appendChild(sep);

    var ptsRow = document.createElement('div');
    ptsRow.className = 'geneva';
    ptsRow.style.cssText = 'font-size:13px;display:flex;align-items:baseline;gap:8px';
    var ptsNum = document.createElement('span');
    ptsNum.style.cssText = 'font-weight:bold';
    ptsNum.textContent = pts.total.toLocaleString();
    var ptsLbl = document.createElement('span');
    ptsLbl.style.cssText = 'color:#555';
    ptsLbl.title = 'Points reward completing work; your Grade reflects correctness.';
    ptsLbl.textContent = 'effort points · work recorded';
    ptsRow.appendChild(ptsNum);
    ptsRow.appendChild(ptsLbl);
    if (pts.today > 0) {
        var todayTag = document.createElement('span');
        todayTag.style.cssText = 'margin-left:auto;color:#0a7d28;font-weight:bold';
        todayTag.textContent = '▲ +' + pts.today + ' today';
        ptsRow.appendChild(todayTag);
    }
    card.appendChild(ptsRow);

    // DOGE wallet preview (gated; Phase 1 — see DOGE_WALLET_SPEC.md).
    if (typeof _walletDogePanel === 'function') { try { _walletDogePanel(card, pts); } catch (_) {} }

    if (readiness && readiness.active && readiness.schedule) {
        var banner = document.createElement('div');
        banner.className = 'geneva';
        banner.style.cssText = 'font-size:11px;line-height:1.35;margin-top:10px;color:#333';
        var status = readiness.state === 'ahead'
            ? 'Ahead!'
            : readiness.state === 'onpace'
                ? 'On pace'
                : readiness.state === 'notdue'
                    ? 'Not started'
                    : (readiness.behind + ' behind');
        var next = null;
        try {
            for (var si = 0; si < readiness.schedule.lessons.length; si++) {
                var lesson = readiness.schedule.lessons[si] || {};
                if (typeof _isLessonComplete !== 'function' || !_isLessonComplete(lesson.topic)) {
                    next = lesson;
                    break;
                }
            }
        } catch (_) {}
        var nextText = next ? (' Next: ' + next.topic + ' due ' + next.due) : ' Summer Foundations complete.';
        banner.textContent = 'Summer Foundations by Sept 1 - '
            + readiness.actual + '/' + readiness.total + ' done · ' + status + '.' + nextText;
        if (readiness.state === 'done') {
            banner.textContent = 'Summer Foundations complete! 🎉';
        } else if (readiness.state === 'behind') {
            banner.textContent = 'Summer Foundations by Sept 1 - '
                + readiness.actual + '/' + readiness.total + ' · ' + readiness.behind + ' behind'
                + (next ? (' · lesson ' + next.topic + ' due ' + next.due) : '');
        } else if (readiness.state === 'catchingup') {
            banner.textContent = 'Catching up - nice! Still ' + readiness.behind
                + ' behind; keep going to get back on track.';
        } else if (readiness.state === 'notdue') {
            banner.textContent = 'Summer Foundations by Sept 1 - starts '
                + (next && next.due ? next.due : '');
        } else if (readiness.state === 'resting') {
            banner.textContent = 'Nice work - ' + readiness.actual + '/' + readiness.total
                + " done. Take a breather; next lesson whenever you're ready.";
        } else if (readiness.state === 'ready') {
            banner.textContent = readiness.actual + '/' + readiness.total
                + ' done - ready for lesson ' + (next && next.topic ? next.topic : '?')
                + '? (due ' + (next && next.due ? next.due : '?') + ')';
        }
        card.appendChild(banner);
    }

    var exportRow = document.createElement('div');
    exportRow.style.cssText = 'margin-top:10px;display:flex;justify-content:flex-start;gap:6px;flex-wrap:wrap';
    var exportBtn = document.createElement('button');
    exportBtn.className = 's7btn';
    exportBtn.type = 'button';
    exportBtn.style.cssText = 'font-size:10px;padding:2px 8px';
    exportBtn.textContent = 'Export sealed transcript';
    exportBtn.onclick = function () {
        try { if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('click', 0.25); } catch (_) {}
        exportSealedTranscript();
    };
    exportRow.appendChild(exportBtn);
    var printBtn = document.createElement('button');
    printBtn.className = 's7btn';
    printBtn.type = 'button';
    printBtn.style.cssText = 'font-size:10px;padding:2px 8px';
    printBtn.textContent = 'Print summary';
    printBtn.onclick = function () {
        try { if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('click', 0.25); } catch (_) {}
        printSealedSummary();
    };
    exportRow.appendChild(printBtn);
    // (The standalone "Sign & QR" button was removed as redundant — each session
    // in the feed below already exposes its signed commit + QR inline via its
    // "Verify / QR this session" row.)
    card.appendChild(exportRow);
    host.appendChild(card);

    var bonus = _walletBonusBlock(receipts);
    if (bonus) host.appendChild(bonus);
    receipts = receipts.filter(function (r) { return r.src !== 'bonus' && r.src !== 'bonus_applied'; });

    var legend = document.createElement('div');
    legend.className = 'geneva';
    legend.style.cssText = 'font-size:9px;color:#555;margin:-6px 2px 12px';
    legend.textContent = 'red = behind · yellow = eligible for best-of · green = all caught up';
    host.appendChild(legend);

    // ── Score breakdown · vs Schoology (folded in from the old My Gradebook) ──
    // Collapsible so the wallet leads with grade + work; expand for the score-by-
    // score component grid + the Schoology-vs-live comparison. Reuses the
    // parameterized renderMyGradebook with the wallet's own containers.
    if (_gradeGradebookCache && _gradeGradebookCache.quarters) {
        var bd = document.createElement('div');
        bd.style.cssText = 'border:1px solid var(--black);background:#fff;border-radius:3px;margin-bottom:12px;'
            + 'box-shadow:inset 1px 1px 0 0 #fff,inset -1px -1px 0 0 #888';
        var bdHdr = document.createElement('button');
        bdHdr.type = 'button';
        bdHdr.className = 'geneva';
        bdHdr.style.cssText = 'width:100%;display:flex;align-items:center;gap:6px;text-align:left;border:0;background:#eee;padding:6px 8px;cursor:pointer;font-size:11px';
        bdHdr.innerHTML = '<span class="bd-caret" style="width:12px">▸</span>'
            + '<span style="font-weight:bold">📊 Score breakdown · vs Schoology</span>';
        var bdBox = document.createElement('div');
        bdBox.style.cssText = 'display:none;padding:8px';
        var bdTabs = document.createElement('div');
        bdTabs.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap';
        var bdBody = document.createElement('div');
        bdBody.className = 'geneva';
        bdBody.style.cssText = 'font-size:11px';
        bdBox.appendChild(bdTabs);
        bdBox.appendChild(bdBody);
        var bdOpen = false;
        bdHdr.onclick = function () {
            bdOpen = !bdOpen;
            bdBox.style.display = bdOpen ? 'block' : 'none';
            var caret = bdHdr.querySelector('.bd-caret'); if (caret) caret.textContent = bdOpen ? '▾' : '▸';
            if (bdOpen && typeof renderMyGradebook === 'function') {
                _activeGradebook = _gradeGradebookCache;
                renderMyGradebook(_firstGradebookQuarter(_activeGradebook), bdBody, bdTabs);
            }
        };
        bd.appendChild(bdHdr);
        bd.appendChild(bdBox);
        host.appendChild(bd);
    }

    // ── Feed header ──
    var head = document.createElement('div');
    head.className = 'chicago';
    head.style.cssText = 'font-size:11px;border-bottom:1px solid var(--black);padding-bottom:4px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center';
    head.innerHTML = '<span>Recorded work</span><span class="geneva" style="font-size:9px;color:#777">'
        + (loading ? 'syncing…' : (receipts.length + ' item' + (receipts.length === 1 ? '' : 's'))) + '</span>';
    host.appendChild(head);

    // ── Feed ──
    if (!receipts.length) {
        var empty = document.createElement('div');
        empty.className = 'geneva';
        empty.style.cssText = 'font-size:11px;color:#555;padding:10px 4px';
        empty.textContent = 'No recorded work yet — items appear here as your work is saved.';
        host.appendChild(empty);
        return;
    }
    _walletRenderGroupedReceipts(host, receipts, loading);
}

function _walletEsc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// Resolve the material a receipt points at (worksheet / quiz / blooket) from its
// item id (e.g. "WS-U4-L3-…", "CR-U4L2-…", "BL-U4-L1-…") via the lesson registry,
// so a student can jump straight to it. Returns a URL, or null (View hidden).
function _receiptViewUrl(r, payload) {
    try {
        var itemId = String((r && r.i) || (payload && payload.i) || '');
        var m = /^(?:WS|CR|BL)-U(\d+)(?:-?L)(\d+(?:-\d+)?)/i.exec(itemId);
        if (!m) return null;
        var unit = m[1], lesson = m[2];                 // lesson "3" or combined "1-2"
        var topicId = unit + '.' + lesson;              // "4.3" / "4.1-2"
        var reg = (typeof getRegistryEntry === 'function') ? getRegistryEntry(topicId) : null;
        var urls = (reg && reg.urls) ? reg.urls : null;
        var src = String((r && r.src) || (payload && payload.src) || '').toLowerCase();
        if (urls) {
            if (/quiz|curriculum/.test(src) && urls.quiz) return urls.quiz;
            if (/blooket/.test(src) && urls.blooket) return urls.blooket;
            if (urls.worksheet) return urls.worksheet;  // default to the worksheet
            if (urls.quiz) return urls.quiz;
            if (urls.blooket) return urls.blooket;
        }
        // Fallback for quiz items with no baked url: the cr quiz by unit/lesson.
        if (/quiz|curriculum/.test(src)) {
            return 'https://robjohncolson.github.io/curriculum_render/?u=' + unit + '&l=' + lesson.split('-')[0];
        }
        return null;
    } catch (_) { return null; }
}

// Verify a receipt TWO ways: (1) Ed25519 signature (genuine + unaltered), and
// (2) a LIVE gradebook check — re-fetch the server's durable receipts and confirm
// THIS one is actually saved there (not just a local optimistic entry). The
// signature proves authenticity; the durable-presence check proves it's recorded.
function _walletVerifyAndCheck(r, statusEl, btn) {
    btn.disabled = true;
    statusEl.style.display = 'block';
    statusEl.textContent = 'checking…';
    Promise.resolve(_walletVerifyReceiptCompact(r.compact)).then(function (sig) {
        var sigOk = !!(sig && sig.ok);
        var sigMsg = sigOk
            ? '✅ Signed by ' + _walletEsc(sig.issuer || 'the class server') + ' — genuine &amp; unaltered.'
            : '❌ Signature NOT verified — altered, or not from the class server.';
        if (!sigOk) { statusEl.innerHTML = sigMsg; btn.disabled = false; return; }
        statusEl.innerHTML = sigMsg + '<br>Checking your gradebook…';
        var fetchP = (window.gradebookClient && typeof gradebookClient.fetchReceipts === 'function')
            ? gradebookClient.fetchReceipts() : Promise.resolve(null);
        Promise.resolve(fetchP).then(function (durable) {
            if (!Array.isArray(durable)) {
                statusEl.innerHTML = sigMsg + '<br>⚠ Couldn’t reach your gradebook to confirm — sign in and try online.';
                return;
            }
            var found = durable.some(function (d) {
                return d && ((r.id && d.id === r.id) || (r.compact && d.compact === r.compact));
            });
            statusEl.innerHTML = sigMsg + '<br>' + (found
                ? '✅ Saved in your gradebook on the server.'
                : '⚠ Not in your live gradebook yet — it may still be syncing. Refresh, or ask your teacher.');
        }, function () {
            statusEl.innerHTML = sigMsg + '<br>⚠ Couldn’t reach your gradebook to confirm.';
        }).finally(function () { btn.disabled = false; });
    }, function () {
        statusEl.textContent = '❌ Signature NOT verified';
        btn.disabled = false;
    });
}

function _walletReceiptRow(r) {
    var payload = (typeof _receiptPayload === 'function' ? _receiptPayload(r) : null) || {};
    var url = (typeof _receiptVerifyUrl === 'function')
        ? _receiptVerifyUrl(r)
        : 'https://robjohncolson.github.io/curriculum_render/verify.html#r=' + encodeURIComponent(r.compact || '');

    var row = document.createElement('div');
    row.className = 'geneva';
    row.style.cssText = 'border:1px solid #999;background:#fff;margin:0 0 6px;padding:6px;box-shadow:1px 1px 0 #bbb;font-size:11px';

    var top = document.createElement('div');
    top.style.cssText = 'display:flex;gap:6px;align-items:flex-start;justify-content:space-between';

    var main = document.createElement('div');
    main.style.cssText = 'min-width:0;line-height:1.35';
    var title = document.createElement('div');
    title.style.cssText = 'font-weight:bold;word-break:break-word';
    var icon = (typeof _receiptSourceIcon === 'function') ? _receiptSourceIcon(r.src || payload.src) : '🧾';
    title.textContent = icon + ' ' + cedDisplayText(r.i || payload.i || 'Recorded work');
    main.appendChild(title);

    var meta = document.createElement('div');
    meta.style.cssText = 'color:#444;word-break:break-word';
    var parts = ['recorded ✓'];
    // The signed score is the one the server KEPT (a lower run of a flashcard deck is floored
    // to that item's best); r.sc is the score this device SENT. Show the kept one.
    var score = (typeof payload.sc === 'number' && isFinite(payload.sc)) ? payload.sc : r.sc;
    if (typeof score === 'number') parts.push('score ' + (score <= 1 ? Math.round(score * 100) + '%' : score));
    var date = (typeof _formatReceiptDate === 'function') ? _formatReceiptDate(r.ts || payload.ts) : '';
    if (date) parts.push(date);
    if (r.id) parts.push(String(r.id).slice(0, 12));
    meta.textContent = parts.join(' • ');
    main.appendChild(meta);

    if (typeof _isProctoredReceipt === 'function' && _isProctoredReceipt(r)) {
        var badge = document.createElement('span');
        badge.style.cssText = 'display:inline-block;margin-top:4px;padding:1px 5px;border:1px solid #000;background:#ddd;font-size:10px';
        badge.textContent = 'proctored';
        main.appendChild(badge);
    }

    var actions = document.createElement('div');
    actions.style.cssText = 'flex-shrink:0;display:flex;flex-direction:column;gap:3px;align-items:flex-end';

    // View — jump straight to the material this item refers to (worksheet/quiz/
    // blooket), when the item id resolves to a lesson; hidden otherwise.
    var viewUrl = _receiptViewUrl(r, payload);
    if (viewUrl) {
        var viewBtn = document.createElement('button');
        viewBtn.className = 's7btn'; viewBtn.type = 'button';
        viewBtn.style.cssText = 'font-size:10px;padding:1px 6px';
        viewBtn.textContent = '📂 View';
        viewBtn.title = 'Open this material';
        viewBtn.onclick = function () { try { window.open(viewUrl, '_blank', 'noopener'); } catch (_) {} };
        actions.appendChild(viewBtn);
    }

    // Verify — signature + live gradebook presence (see _walletVerifyAndCheck).
    var verify = document.createElement('button');
    verify.className = 's7btn'; verify.type = 'button';
    verify.style.cssText = 'font-size:10px;padding:1px 6px';
    verify.textContent = '✓ Verify';
    actions.appendChild(verify);

    top.appendChild(main);
    top.appendChild(actions);
    row.appendChild(top);

    var verifyStatus = document.createElement('div');
    verifyStatus.style.cssText = 'display:none;margin-top:4px;color:#444;font-size:10px;line-height:1.45';
    row.appendChild(verifyStatus);

    // The QR is ALWAYS shown (no toggle) — scan it to verify on a phone.
    var qr = document.createElement('div');
    qr.style.cssText = 'margin-top:6px;display:flex;justify-content:flex-start';
    row.appendChild(qr);
    if (typeof _renderReceiptQr === 'function') _renderReceiptQr(qr, url);

    verify.onclick = function () { _walletVerifyAndCheck(r, verifyStatus, verify); };

    return row;
}

async function renderWallet() {
    var host = document.getElementById('wallet-content');
    if (!host) return;
    // Instant paint from the local cache, then merge durable receipts and repaint.
    _walletPaint(host, _readDeskReceipts(), true);
    _walletPrependZeroCard(host);
    try {
        var loaded = await Promise.all([_walletLoadReceipts(), _walletFetchBonusReceipts()]);
        var merged = loaded[0].concat(loaded[1]);
        var ov = document.getElementById('app-wallet-overlay');
        if (ov && ov.style.display !== 'none') { _walletPaint(host, merged, false); _walletPrependZeroCard(host); }
        // ANDROID Phase 2: compute the signed-ledger verification summary once, then
        // repaint so the 🔐 chip appears (best-effort; no-op in view-as / offline).
        if (typeof _phase2RefreshVerifySummary === 'function') {
            try { if (typeof _phase2RegisterIssuer === 'function') _phase2RegisterIssuer(_phase2BaseUrl); } catch (_) {}
            _phase2RefreshVerifySummary(function () {
                var ov2 = document.getElementById('app-wallet-overlay');
                if (ov2 && ov2.style.display !== 'none') { _walletPaint(host, merged, false); _walletPrependZeroCard(host); }
            });
        }
    } catch (_) {}
}

function openWallet() {
    // Recover a failed/slow initial summer-schedule load so My Ledger shows the
    // correct SUMMER readiness (matching the dashboard pacing) rather than the
    // fall fallback. No-op once loaded (the loader self-guards on _summerSchedule).
    try { if (typeof _walletLoadSummerSchedule === 'function') _walletLoadSummerSchedule(); } catch (_) {}
    try { if (typeof bumpUsage === 'function') bumpUsage('wallet'); } catch (_) {}
    try { if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('wildEep', 0.5); } catch (_) {}
    var overlay = document.getElementById('app-wallet-overlay');
    if (!overlay) return;
    var win = overlay.querySelector('.app-window');
    if (win) {
        win.style.left = '50%'; win.style.top = '50%';
        win.style.transform = 'translate(-50%, -50%)';
        win.classList.remove('maximized');
    }
    overlay.style.display = 'block';
    renderWallet();
}

function destroyWallet() {
    try { if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('click', 0.3); } catch (_) {}
    if (typeof _clearStudentWalletCeremony === 'function') _clearStudentWalletCeremony();
    var overlay = document.getElementById('app-wallet-overlay');
    if (overlay) overlay.style.display = 'none';
}
