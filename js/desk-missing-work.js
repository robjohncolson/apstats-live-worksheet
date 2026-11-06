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

    return { zeroWarnings: zeroWarnings, pastDueWork: pastDueWork };
})();
