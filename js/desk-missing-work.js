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

    function pastDueWork(lessons, period, todayIso, warningDays) {
        try {
            if (!Array.isArray(lessons) || !period || !todayIso) return [];
            var today = new Date(todayIso + 'T00:00:00');
            var out = [];
            for (var i = 0; i < lessons.length; i++) {
                var L = lessons[i];
                if (!L || !L.lessonKey || !L.zeroDate || !L.due) continue;
                var zd = L.zeroDate[period];
                var dd = L.due[period];
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
            return out;
        } catch (_) { return []; }
    }

    return { zeroWarnings: zeroWarnings, pastDueWork: pastDueWork };
})();
