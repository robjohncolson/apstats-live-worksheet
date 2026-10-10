// lib/effort-facts.js — two facts about a student's effort that the grade number hides
// (EFFORT_VISIBILITY_SPEC.md §1):
//   1. a Progress Check score on file that does not count yet, and the 40% strategy it allows;
//   2. lessons done AHEAD of the calendar (they count in the Desk grade; Schoology catches up
//      when each lesson's column opens).
// Shared by the Desk (My Ledger balance card + grade coach) and scripts/weekly-slips.mjs.
// Pure helpers; no network, no DOM. ES5 inside the wrapper (it runs in old browsers).
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.EffortFacts = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var GRADE_FLOOR = 40;
  var AHEAD_LIST_MAX = 8;

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function oneDecimal(v) { return Math.round(v * 10) / 10; }
  // Display rule for a track: whole number, except a value under the 40 gate that would round up to
  // 40 shows one decimal (39.96 → "39.9"), so a sentence never reads "40% … under 40%".
  function trackText(v, gate) {
    var g = typeof gate === 'number' ? gate : 40;
    if (v < g && Math.round(v) >= g) return String(Math.floor(v * 10) / 10);
    return String(Math.round(v));
  }
  function isIso(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

  // "Tue 10/13" for an ISO date (the Desk's _zeroDayText shape). UTC so the weekday never
  // shifts with the viewer's time zone.
  function dayText(iso) {
    if (!isIso(iso)) return null;
    var d = new Date(iso + 'T00:00:00Z');
    return DAYS[d.getUTCDay()] + ' ' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
  }

  // The quarter whose PC band applies: the key the caller names; else the earliest quarter
  // with lessons due (the slips' fallback); else the earliest quarter.
  function quarterOf(quarters, quarterKey) {
    if (!quarters || typeof quarters !== 'object') return null;
    if (quarterKey && quarters[quarterKey]) return quarters[quarterKey];
    var keys = Object.keys(quarters).filter(function (k) { return /^Q[0-9]+$/.test(k); })
      .sort(function (a, b) { return Number(a.slice(1)) - Number(b.slice(1)); });
    for (var i = 0; i < keys.length; i++) {
      var q = quarters[keys[i]];
      if (q && q.lessonsDue > 0) return q;
    }
    return keys.length ? quarters[keys[0]] : null;
  }

  // PC Day 2 for a unit and period, from data/lesson-schedule.json's progressChecks
  // (keyed "1" or "U1"). A PC counts FROM that date (the engine's isDateDue is <=).
  function pcDay2(schedule, unit, period) {
    var pcs = schedule && schedule.progressChecks;
    if (!pcs || !period) return null;
    var entry = pcs[String(unit)] || pcs['U' + unit];
    var day2 = entry && entry.adminDay2 ? entry.adminDay2[period] : null;
    return isIso(day2) ? day2 : null;
  }

  function unitNumber(key) {
    var m = /^U?(\d+)$/i.exec(String(key));
    return m ? Number(m[1]) : null;
  }

  // Every unit with a PC score on file in the current quarter's PC band, lowest unit first.
  // Returns null when none; else the first unit's fields plus the whole list under `all`.
  function pcOnFile(units, quarters, period, schedule, todayIso, quarterKey) {
    if (!units || typeof units !== 'object') return null;
    var q = quarterOf(quarters, quarterKey);
    var band = q && Array.isArray(q.pcUnits) ? q.pcUnits.map(Number) : null;
    var nums = [];
    Object.keys(units).forEach(function (key) {
      var n = unitNumber(key);
      var u = units[key];
      if (n == null || !u || !isNum(u.pcRawPct)) return;
      if (band && band.indexOf(n) === -1) return;
      if (nums.indexOf(n) === -1) nums.push(n);
    });
    if (!nums.length) return null;
    nums.sort(function (a, b) { return a - b; });
    var all = nums.map(function (n) {
      var u = units['U' + n] || units[String(n)] || units['u' + n];
      var countsFrom = pcDay2(schedule, n, period);
      return {
        unit: n,
        pct: oneDecimal(u.pcRawPct),
        counting: Boolean(countsFrom && isIso(todayIso) && countsFrom <= todayIso),
        countsFrom: countsFrom,
        day: dayText(countsFrom),
      };
    });
    var first = all[0];
    return { unit: first.unit, pct: first.pct, counting: first.counting, countsFrom: first.countsFrom, day: first.day, all: all };
  }

  // "Progress Check so far: 67% (paper) — counts from Tue 10/13."
  function pcLine(pc) {
    if (!pc || !isNum(pc.pct)) return '';
    var head = 'Progress Check so far: ' + Math.round(pc.pct) + '% (paper)';
    if (pc.counting) return head + ' — counting in your grade now.';
    if (pc.day) return head + ' — counts from ' + pc.day + '.';
    return head + '.';
  }

  // The PC TRACK the strategy is about — never one unit's score. Counting: the engine's quarter
  // pcAvg. Not counting yet: the mean of every unit on file in the band, flagged as a projection.
  // null when there is no track value to reason about.
  function pcTrack(pc, pcAvg) {
    if (!pc) return null;
    if (pc.counting) return isNum(pcAvg) ? { pct: pcAvg, projected: false } : null;
    var list = Array.isArray(pc.all) && pc.all.length ? pc.all : [pc];
    var sum = 0, n = 0;
    list.forEach(function (u) { if (u && isNum(u.pct)) { sum += u.pct; n++; } });
    return n ? { pct: sum / n, projected: true } : null;
  }

  // The 40% strategy, goal first (EFFORT_VISIBILITY_V2_SPEC §1). '' when the PC track is below
  // the floor (nothing to commend). workAvg must be UNROUNDED: the gate test uses the raw value;
  // rounding happens only in the words. pcAvg: the quarter's engine pcAvg (used once the PC counts).
  // The cr coach's STRATEGY NOTE builds the same sentence (railway-server/server.js).
  function strategyLine(pc, workAvg, gradeFloor, pcAvg) {
    var floor = isNum(gradeFloor) ? gradeFloor : GRADE_FLOOR;
    var track = pcTrack(pc, pcAvg);
    if (!track || track.pct < floor) return '';
    var pcShown = Math.round(track.pct);
    var haveWork = isNum(workAvg);

    // Work already the higher track (either mode).
    if (haveWork && workAvg >= track.pct) {
      return 'Your Work track (' + Math.round(workAvg) + '%) is the higher one right now, so your grade follows it; '
        + 'your Progress Check (' + pcShown + '%) is the safety net — the grade is whichever is higher once both are at least ' + floor + '%.';
    }

    // Work below the floor (or not started): the goal, then the points it takes.
    if (!haveWork || workAvg < floor) {
      var goal = (track.projected ? 'To finish the quarter with your ' : 'To keep your ') + pcShown + '%, your Work average has to reach ' + floor + '%';
      if (haveWork) {
        var need = Math.ceil(floor - workAvg);
        // floor, not round: "you are at 39%, so ... 1 point" never reads "at 40%".
        goal += ' — you are at ' + trackText(workAvg, floor) + '%, so bring it up by at least ' + need + ' point' + (need === 1 ? '' : 's');
      }
      return goal + '. Once both tracks are at least ' + floor + '%, your grade is the higher one, and yours would be the Progress Check.';
    }

    // Work past the floor, PC the higher track.
    var keep = ' Keep Work at ' + floor + '% or better and it stays that way.';
    if (track.projected) {
      var when = pc.day ? ' (' + pc.day + ')' : '';
      return 'Your Work average is already past ' + floor + '%, so once your Progress Check counts' + when
        + ' your grade becomes the higher of the two — right now that would be your ' + pcShown + '%.' + keep;
    }
    return 'Your grade is the higher of your two tracks: Progress Check ' + pcShown + '%, Work ' + Math.round(workAvg) + '% → ' + pcShown + '%.' + keep;
  }

  function scoreOf(v) { return isNum(v) ? oneDecimal(v) : null; }

  // Lessons with any score whose class date is still in the FUTURE for this period.
  function aheadLessons(lessons, period, todayIso) {
    if (!Array.isArray(lessons) || !period || !isIso(todayIso)) return [];
    var out = [];
    lessons.forEach(function (l, index) {
      if (!l || !l.lessonKey) return;
      var due = l.due && isIso(l.due[period]) ? l.due[period] : null;
      if (!due || due <= todayIso) return;
      var worksheet = scoreOf(l.lessonGradeNoQuiz != null ? l.lessonGradeNoQuiz : l.Cws);
      var quiz = scoreOf(l.Q);
      var blooket = scoreOf(l.blooket);
      if (worksheet == null && quiz == null && blooket == null) return;
      out.push({ lessonKey: String(l.lessonKey), due: due, day: dayText(due), worksheet: worksheet, quiz: quiz, blooket: blooket, _i: index });
    });
    out.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : a._i - b._i; });
    return out.map(function (row) { delete row._i; return row; });
  }

  // 'Ahead of the calendar: 3 lessons already done (1.6, 1.7, 1.8). They already count in your
  // Desk grade; Schoology catches up when each lesson's column opens.'
  // labelOf (optional) turns a lesson key into the number the student sees (the CED 2026 topic,
  // e.g. '3.1' → '1.10'); two days of one folded topic are named once.
  // total (optional): the full count when `ahead` was already cut short (the coach sends ≤ 8).
  function aheadLine(ahead, labelOf, total) {
    if (!Array.isArray(ahead) || !ahead.length) return '';
    var n = Math.max(ahead.length, isNum(total) ? Math.floor(total) : 0);
    var listed = ahead.slice(0, AHEAD_LIST_MAX);
    var names = [];
    listed.forEach(function (a) {
      var name = String(a.lessonKey);
      if (typeof labelOf === 'function') {
        try { name = String(labelOf(a.lessonKey) || a.lessonKey); } catch (_) { name = String(a.lessonKey); }
      }
      if (names.indexOf(name) === -1) names.push(name);
    });
    var keys = names.join(', ');
    if (n > listed.length) keys += ' and ' + (n - listed.length) + ' more';
    if (n === 1) {
      return 'Ahead of the calendar: 1 lesson already done (' + keys + '). It already counts in your Desk grade; Schoology catches up when its column opens.';
    }
    return 'Ahead of the calendar: ' + n + ' lessons already done (' + keys + "). They already count in your Desk grade; Schoology catches up when each lesson's column opens.";
  }

  // Ahead-work projection (AHEAD_WORK_PROJECTION_SPEC.md, display-only).
  // gbq = one quarter of the server gradebook: { aheadCells, schoologyProjectedTotal, schoologyTotal }.
  // Returns null when nothing is ahead or the payload predates the projection fields.
  function aheadProjection(gbq) {
    if (!gbq || !isNum(gbq.aheadCells) || gbq.aheadCells <= 0) return null;
    if (!isNum(gbq.schoologyProjectedTotal)) return null;
    return {
      projected: oneDecimal(gbq.schoologyProjectedTotal),
      today: isNum(gbq.schoologyTotal) ? oneDecimal(gbq.schoologyTotal) : null,
      aheadCells: gbq.aheadCells,
    };
  }

  // ' Once they come due Schoology will read about 85% (today 83.7%).' — appended to the ahead line.
  // lessonCount 1 → 'Once it comes due'. '' when there is no projection.
  function aheadProjectionSentence(gbq, lessonCount) {
    var p = aheadProjection(gbq);
    if (!p) return '';
    var lead = lessonCount === 1 ? 'Once it comes due' : 'Once they come due';
    var today = p.today != null ? ' (today ' + p.today + '%)' : '';
    return ' ' + lead + ' Schoology will read about ' + p.projected + '%' + today + '.';
  }

  // "How your grade is counted" (teacher 2026-09-27): the Desk balance card and the slip footer.
  // Work weights 50/35/15 mirror roster-server V3_WORK_WEIGHTS; posters are bonus, like the DOK
  // sheets (POSTER_BONUS_SPEC.md, 2026-10-09).
  // The 40% line is the official-grade rule (tools/schoology_official.py: work + bonus >= 40 lets PC count).
  var COUNTING_NOTE = 'Work is worksheets 50%, quizzes 35%, Blookets 15%; once Work (with bonus) is at least 40%, a higher Progress Check score replaces it, and a low one never lowers you. '
    + 'The Desk counts work you did ahead of the calendar now; Schoology counts it when its column opens. '
    + 'Bonus sheets (DOK sheets and unit posters) are banked and added at the end of the quarter to whichever track helps you more — they can only raise your grade.';

  return {
    pcOnFile: pcOnFile, pcLine: pcLine, pcTrack: pcTrack, strategyLine: strategyLine,
    aheadLessons: aheadLessons, aheadLine: aheadLine, trackText: trackText, dayText: dayText,
    aheadProjection: aheadProjection, aheadProjectionSentence: aheadProjectionSentence,
    GRADE_FLOOR: GRADE_FLOOR, COUNTING_NOTE: COUNTING_NOTE,
  };
});
