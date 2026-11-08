// Pure missing-work selectors used by the Desk. No DOM, storage, network or clock.
// Callers supply the /grade lessons, period, ISO date and warning window.
// Keep the legacy date arithmetic, ordering and distinct row shapes unchanged;
// tests/desk-missing-work-parity.test.js pins the pre-extraction outputs.
var DeskMissingWork = (function () {
    function zeroWarnings(lessons, period, todayIso, warningDays) {
        try {
            if (!Array.isArray(lessons) || !period || !todayIso) return [];
            var today = new Date(todayIso + 'T00:00:00');
            var out = [];
            for (var i = 0; i < lessons.length; i++) {
                var L = lessons[i];
                if (!L || !L.lessonKey || !L.zeroDate) continue;
                var zd = L.zeroDate[period];
                if (!zd) continue;
                var days = Math.round((new Date(zd + 'T00:00:00') - today) / 86400000);
                if (days > warningDays) continue;
                var hasWork = L.lessonGradeNoQuiz != null || L.Cws != null;
                if (!hasWork) out.push({ lessonKey: L.lessonKey, kind: 'worksheet', zeroDate: zd, daysLeft: days, past: days < 0 });
                // 2026-09-26 (teacher): the quiz track zeroes on the same date in the Desk grade, and the
                // card must list EVERYTHING that is dragging the number down. A lesson has a quiz when
                // the engine reports quizTotal > 0; Q == null means it was never taken.
                if ((L.quizTotal || 0) > 0 && L.Q == null) out.push({ lessonKey: L.lessonKey, kind: 'quiz', zeroDate: zd, daysLeft: days, past: days < 0 });
                // 2026-09-26 review: bonus decks (blooketBonus) never zero in the grade, so they are never missing.
                if (L.hasBlooket && !L.blooketBonus && L.blooket == null) out.push({ lessonKey: L.lessonKey, kind: 'blooket', zeroDate: zd, daysLeft: days, past: days < 0 });
            }
            var KIND_ORDER = { worksheet: 0, quiz: 1, blooket: 2 };
            out.sort(function (a, b) {
                if (a.zeroDate !== b.zeroDate) return a.zeroDate < b.zeroDate ? -1 : 1;
                return (KIND_ORDER[a.kind] || 0) - (KIND_ORDER[b.kind] || 0);
            });
            return out;
        } catch (_) { return []; }
    }

    // QUARTER_ZERO_FREEZE_SPEC.md (teacher 2026-11-06): a lesson whose zero date fell
    // after its quarter's last day never becomes a 0, so /grade sends zeroDate null and
    // neverZero true for that period. zeroWarnings skips it (no zero date). Past its due
    // date it is still late work: pastDueWork lists it with the same three missing
    // rules, as rows with late: true and zeroDate: null.
    function isNeverZero(L, period) {
        return !!(L.neverZero && L.neverZero[period] === true);
    }

    function lateRows(L, dueDate) {
        var row = function (kind) {
            return { lessonKey: L.lessonKey, kind: kind, dueDate: dueDate, zeroDate: null, unit: L.unit, worksheetKey: L.worksheetKey, late: true };
        };
        var rows = [];
        var hasWork = L.lessonGradeNoQuiz != null || L.Cws != null;
        if (!hasWork) rows.push(row('worksheet'));
        if ((L.quizTotal || 0) > 0 && L.Q == null) rows.push(row('quiz'));
        if (L.hasBlooket && !L.blooketBonus && L.blooket == null) rows.push(row('blooket'));
        return rows;
    }

    function pastDueWork(lessons, period, todayIso, warningDays) {
        try {
            if (!Array.isArray(lessons) || !period || !todayIso) return [];
            var today = new Date(todayIso + 'T00:00:00');
            var out = [];
            var late = [];
            for (var i = 0; i < lessons.length; i++) {
                var L = lessons[i];
                if (!L || !L.lessonKey || !L.zeroDate || !L.due) continue;
                var zd = L.zeroDate[period];
                var dd = L.due[period];
                if (isNeverZero(L, period)) {
                    if (dd && dd < todayIso) late = late.concat(lateRows(L, dd));
                    continue;
                }
                if (!zd || !dd) continue;
                if (!(dd < todayIso)) continue;
                var days = Math.round((new Date(zd + 'T00:00:00') - today) / 86400000);
                if (days <= warningDays) continue;   // _zeroWarnings owns it
                var hasWork = L.lessonGradeNoQuiz != null || L.Cws != null;
                if (!hasWork) out.push({ lessonKey: L.lessonKey, kind: 'worksheet', dueDate: dd, zeroDate: zd, unit: L.unit, worksheetKey: L.worksheetKey });
                if ((L.quizTotal || 0) > 0 && L.Q == null) out.push({ lessonKey: L.lessonKey, kind: 'quiz', dueDate: dd, zeroDate: zd, unit: L.unit, worksheetKey: L.worksheetKey });
                if (L.hasBlooket && !L.blooketBonus && L.blooket == null) out.push({ lessonKey: L.lessonKey, kind: 'blooket', dueDate: dd, zeroDate: zd, unit: L.unit, worksheetKey: L.worksheetKey });
            }
            var KIND_ORDER = { worksheet: 0, quiz: 1, blooket: 2 };
            out.sort(function (a, b) {
                if (a.zeroDate !== b.zeroDate) return a.zeroDate < b.zeroDate ? -1 : 1;
                return (KIND_ORDER[a.kind] || 0) - (KIND_ORDER[b.kind] || 0);
            });
            // Late rows have no zero date: they follow the dated rows, oldest due date first.
            late.sort(function (a, b) {
                if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
                return (KIND_ORDER[a.kind] || 0) - (KIND_ORDER[b.kind] || 0);
            });
            return out.concat(late);
        } catch (_) { return []; }
    }

    // ── Quarter line (QUARTER_LINE_BY_DUE_DATE_SPEC.md, teacher 2026-11-07) ─────────────────
    // A lesson counts in the quarter its 0 date lands in. /grade sends lessons[].quarter[period]
    // (where the lesson can be a 0) and liftQuarter[period] (the earlier quarter it was taught
    // in, where finishing it can only help). `quarters` is /grade config.quarters: { Q1: { start,
    // end, close?, finalUntil?, closed? }, ... }, ISO dates. A quarter with a close date stays
    // fixable from the day after it ends through its close, then reads "final" through finalUntil.
    // closed: true (the Desk adds it when /grade reports quarters[Q].closed, the first-close
    // snapshot) makes an ended quarter final at once, whatever the clock says (review D8,
    // 2026-11-08: the snapshot is first-close-wins, so nothing after it can change the final).
    // Nothing above changes: zeroWarnings / pastDueWork keep their pinned row shapes.

    // 'Q1'..'Q4' in calendar order.
    function quarterKeys(quarters) {
        if (!quarters || typeof quarters !== 'object') return [];
        return Object.keys(quarters).filter(function (k) { return /^Q[1-9]$/.test(k); }).sort();
    }

    // Is quarter q closed on todayIso? Yes once its close date has passed, or (D8) once /grade
    // reports its close (closed: true) after the quarter ended. A quarter still running is never
    // closed, even if a snapshot exists.
    function isClosed(q, todayIso) {
        if (!q || !todayIso) return false;
        if (q.close && q.close < todayIso) return true;
        return q.closed === true && Boolean(q.end) && q.end < todayIso;
    }

    // Where a day sits: { current, closing, final } (quarter keys or null).
    //   current: the quarter whose pill leads (on the gap days right after a quarter ends,
    //            the next quarter); closing: past its end, not yet closed; final: closed,
    //            still shown as final. Without close dates (an older /grade) only `current`
    //            can be set, and only on a school day.
    function quarterPhase(quarters, todayIso) {
        var out = { current: null, closing: null, final: null };
        if (!todayIso) return out;
        var keys = quarterKeys(quarters);
        for (var i = 0; i < keys.length; i++) {
            var q = quarters[keys[i]] || {};
            if (q.start && q.end && q.start <= todayIso && todayIso <= q.end) out.current = keys[i];
            if (!q.end || !q.close || !(q.end < todayIso)) continue;
            var closed = isClosed(q, todayIso);
            if (!closed && todayIso <= q.close) out.closing = keys[i];
            if (closed && q.finalUntil && todayIso <= q.finalUntil) out.final = keys[i];
        }
        var ended = out.closing || out.final;
        if (!out.current && ended) out.current = keys[keys.indexOf(ended) + 1] || null;
        return out;
    }

    // { Q1: true } for every closed quarter (isClosed): its 0s are final.
    function closedQuarters(quarters, todayIso) {
        var closed = {};
        var keys = quarterKeys(quarters);
        for (var i = 0; i < keys.length; i++) {
            if (isClosed(quarters[keys[i]], todayIso)) closed[keys[i]] = true;
        }
        return closed;
    }

    // { lessonKey: { quarter, lift } } for the lessons that carry a quarter for this period.
    // lift = the earlier quarter finishing the lesson can still raise, or null.
    function lessonQuarters(lessons, period) {
        var out = {};
        if (!Array.isArray(lessons) || !period) return out;
        for (var i = 0; i < lessons.length; i++) {
            var L = lessons[i];
            var quarter = L && L.lessonKey && L.quarter ? L.quarter[period] : null;
            if (!quarter) continue;
            var lift = L.liftQuarter ? (L.liftQuarter[period] || null) : null;
            out[L.lessonKey] = { quarter: quarter, lift: lift };
        }
        return out;
    }

    // The one choke point after a close: rows whose lesson counts in a closed quarter drop out
    // (that quarter's 0s are final; nothing may call them fixable). Every other row stays, in
    // order. Before any close, and for an older /grade (no quarter fields), rows pass unchanged.
    function openQuarterRows(rows, lessons, period, todayIso, quarters) {
        if (!Array.isArray(rows)) return [];
        var closed = closedQuarters(quarters, todayIso);
        if (!Object.keys(closed).length) return rows;
        var tags = lessonQuarters(lessons, period);
        return rows.filter(function (row) {
            var tag = row ? tags[row.lessonKey] : null;
            return !(tag && closed[tag.quarter]);
        });
    }

    // The closed quarter an assignment counts in for this period, or null. A worksheet or deck
    // is shared by every lesson of its worksheet group, so it is final only when every lesson of
    // the group counts in a closed quarter (B's 2.3 worksheet: Day 1 in Q1, Day 2 in Q2).
    function closedQuarterOf(lessons, lessonKey, period, todayIso, quarters, track) {
        var closed = closedQuarters(quarters, todayIso);
        var tags = lessonQuarters(lessons, period);
        var own = tags[lessonKey];
        if (!own || !closed[own.quarter]) return null;
        if (track === 'quiz' || !Array.isArray(lessons)) return own.quarter;
        var L = null;
        for (var i = 0; i < lessons.length; i++) if (lessons[i] && lessons[i].lessonKey === lessonKey) L = lessons[i];
        if (!L || L.worksheetKey == null) return own.quarter;   // no worksheet group: just this lesson
        for (var j = 0; j < lessons.length; j++) {
            var M = lessons[j];
            if (!M || M.unit !== L.unit || M.worksheetKey !== L.worksheetKey) continue;
            var tag = tags[M.lessonKey];
            if (tag && !closed[tag.quarter]) return null;
        }
        return own.quarter;
    }

    return {
        zeroWarnings: zeroWarnings, pastDueWork: pastDueWork,
        quarterPhase: quarterPhase, lessonQuarters: lessonQuarters,
        openQuarterRows: openQuarterRows, closedQuarterOf: closedQuarterOf,
    };
})();
