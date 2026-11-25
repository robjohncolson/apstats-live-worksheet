// ── No-guest-mode sign-in wall (2026-05-20, SIGNIN_WALL_BUILD.md) ────────────
// Access to the Desk requires a signed-in student OR a teacher. Fails OPEN:
// if the check throws, grant access — a bug must never hard-lock the Desk.
function _deskAccessGranted() {
  // Gate on the LIVE roster session, not the legacy apstats_desk_student_email key:
  // that key can outlive the roster session (e.g. a sign-out in the sibling
  // curriculum_render app, which shares apstats_roster.v1), leaving a Desk that
  // looks signed-in but has no token — every server call then silently no-ops
  // (Done clicks that never persist). Matches the worksheet wall (rosterClient.current()).
  try {
    var live = !!(window.rosterClient && window.rosterClient.current && window.rosterClient.current());
    var teacher = (typeof _deskIsTeacher === 'function') ? _deskIsTeacher() : false;
    // Guests are retired (2026-06-25): the wall admits ONLY a live roster session or
    // a verified teacher. A stale / cross-app apstats_guest_active flag can no longer
    // satisfy the wall — off-roster students self-sign-up (real name) instead.
    return live || teacher;
  }
  catch (_) { return true; }
}
// True once a student has chosen to work as a guest (gated behind the name
// finder's dial — see _nfGuestSignIn). Lets the stable Guest_ identity past the
// sign-in wall; the student can sign in to their real account anytime from the
// menu, which clears this flag.
function _deskGuestOk() {
  try { return localStorage.getItem('apstats_guest_active') === '1'; }
  catch (_) { return false; }
}
// Stable, shared guest alias. Same localStorage key as the quiz's
// lib/guest-identity.js — same web origin, so a guest is the SAME Guest_ identity
// across the Desk and the quiz. Work saved under it (quiz/worksheet answers) is
// recovered into a roster student via the Guest Pass QR (?claimGuest=) + the
// teacher's /api/guest/reconcile. Idempotent: mints once, then stable forever.
function getGuestIdentity() {
  var KEY = 'apstats_guest_identity';
  try {
    var v = localStorage.getItem(KEY);
    if (v && /^Guest_/i.test(v)) return v;
    var F = ['Apple','Banana','Cherry','Mango','Kiwi','Lemon','Lime','Melon','Peach','Pear','Plum','Berry','Fig','Guava','Papaya','Orange','Apricot','Coconut','Pomelo','Olive','Grape','Lychee','Quince','Date'];
    var A = ['Koala','Panda','Tiger','Otter','Seal','Fox','Wolf','Bear','Eagle','Hawk','Owl','Swan','Deer','Llama','Sloth','Gecko','Turtle','Frog','Rabbit','Badger','Beaver','Heron','Lynx','Moth'];
    var g = 'Guest_' + F[Math.floor(Math.random() * F.length)] + '_' + A[Math.floor(Math.random() * A.length)];
    try { localStorage.setItem(KEY, g); } catch (_) {}
    return g;
  } catch (_) { return 'Guest_Anon'; }
}
window.getGuestIdentity = getGuestIdentity;
// Guests are retired (2026-06-25): presence (the 🐶 "Online Now" feed + Live
// Classroom avatars) admits ONLY a signed-in roster identity. Call this after a
// real sign-in to (re)join presence under that identity; it resets the cached name
// so DogePresence.getUsername() re-reads the new roster session. Sign-OUT reloads
// the page (dropping the socket), so no explicit leave is needed here.
function _deskPresenceResync() {
  try {
    if (typeof DogePresence === 'undefined') return;
    DogePresence.username = null;
    if (DogePresence.getUsername()) {
      DogePresence._autoPresence = true;
      DogePresence.connect();
    }
  } catch (_) {}
}
window._deskPresenceResync = _deskPresenceResync;
// True while the sign-in modal is up as a mandatory wall (not signed in).
// closeSignInModal() refuses to dismiss the modal while this holds.
var _signinWallActive = false;
// "Complete" = worksheet Done AND Blooket Done, counting only the artifacts
// the lesson actually has (a missing artifact is vacuously satisfied).
//
// CROSS-DEVICE (2026-06-03): an artifact is "done" when the LOCAL Done-click
// mark exists (.ts in apstats_desk_marks_<email>) OR its SYNCED score clears the
// same bar the Done button uses. The local marks don't sync across devices, but
// the /grade scores follow the LOGIN, not the browser — so a lesson finished on
// the home computer now greys + unlocks on the work computer too, without an
// explicit Done-click there. We do NOT add the quiz to the gate, so the
// "quiz-alone completes a lesson" bug killed in 0dea2ae stays fixed.
//   worksheet: recorded correctness Cws >= DESK_WORKSHEET_DONE_THRESHOLD (60)
//   blooket:   recorded Blooket score >= 80 (the same gate the score chip uses)
// The synced helpers/threshold are typeof-guarded: when absent (the isolated vm
// tests load _isLessonComplete alone) only the local .ts mark counts, preserving
// the strict behavior A8c pins. Reuses the EXACT signals _doneBtn's eligibility
// check already uses (_getCwsForTopic / _blooketScoreFor), so greying agrees with
// the Done button.
function _isLessonComplete(topic, marks) {
  if (topic === 'B-Work' || topic === 'B-Break' || topic === 'E-Break') return true;
  try {
    if (!topic) return true;
    var members = typeof groupTopics==='function' ? groupTopics(topic) : [topic];
    if(members.length>1)return members.every(function(member){return _isLessonComplete(member,marks);});
    // Granularity bridge (cross-portion): a combined "A+B" lesson — the fall
    // period-E pacing (e.g. "1.2+1.3") — counts as complete when its OWN combined
    // artifacts are done OR every individual part is. So a summer student's
    // individual marks (1.2, 1.3) satisfy the fall "1.2+1.3" cell. Parts are always
    // individual, so this recurses exactly one level.
    if (String(topic).indexOf('+') >= 0) {
      var _parts = String(topic).split('+').filter(function (p) { return /^\d+\.\d+/.test(p); });
      if (_parts.length > 1 && _parts.every(function (p) { return _isLessonComplete(p, marks); })) return true;
      // else fall through to the combined-key check below (a fall student's own mark)
    }
    var reg = (typeof getRegistryEntry === 'function') ? getRegistryEntry(topic) : null;
    var urls = (reg && reg.urls) || {};
    var m = marks || {};
    var cws = (typeof _getCwsForTopic === 'function') ? _getCwsForTopic(topic) : null;
    var blScore = (typeof _blooketScoreFor === 'function') ? _blooketScoreFor(topic) : null;
    var wsGate = (typeof DESK_WORKSHEET_DONE_THRESHOLD === 'number') ? DESK_WORKSHEET_DONE_THRESHOLD : 60;
    // PROGRESS_RESET_FIX_SPEC D3 -- third disjunct: a durable per-student latch
    // written only on a live /grade success (see _latchServerComplete). Makes
    // ledger-qualified completion survive a cold _gradeLessonsCache (the root
    // cause of the 2026-07-20 incident). typeof-guarded so isolated vm tests
    // that load this function alone (no _serverCompleteFor injected) keep the
    // strict local+synced-only behavior.
    var _sc = (typeof _serverCompleteFor === 'function') ? _serverCompleteFor(topic) : null;
    var wsDone = !!(m[topic + '|worksheet'] && m[topic + '|worksheet'].ts)
      || (typeof cws === 'number' && cws >= wsGate)
      || !!(_sc && _sc.ws);
    var blDone = !!(m[topic + '|blooket'] && m[topic + '|blooket'].ts)
      || (typeof blScore === 'number' && blScore >= 80)
      || !!(_sc && _sc.bl);
    var wsOk = !urls.worksheet || wsDone;
    var blOk = !urls.blooket   || blDone;
    return wsOk && blOk;
  } catch (_) { return true; }
}
// How long the student has to spend on a resource before the Done button
// becomes clickable. Default 5 min (Robert Colson 2026-05-19 — "the done
// button cannot be pressed until ~5 or more minutes have passed since the
// corresponding link has been clicked"). Override for testing via
//   localStorage.setItem('apstats_desk_done_gate_ms', '0')
// 2026-05-20: AP Classroom is locked to students until the school year
// actually starts. Mirror the server's gradingWindowStart so the Desk
// hides AP Classroom video links before the cutover and falls back to
// the Drive alt copies. Bump this once per year at cohort cutover.
const SCHOOL_YEAR_START = '2026-09-01';
function _isApClassroomAvailable() {
  try {
    // Compare YYYY-MM-DD lexicographically; uses local time on the
    // student's device. Override via localStorage for testing /
    // teacher preview.
    var override = null;
    try { override = localStorage.getItem('apstats_desk_today_override'); } catch (_) {}
    var d = override ? new Date(override) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var today = y + '-' + m + '-' + day;
    return today >= SCHOOL_YEAR_START;
  } catch (_) {
    // On any error, default to "available" — fail-open so a bug in the
    // date logic never strands students who legitimately have AP access.
    return true;
  }
}

const DESK_DONE_GATE_MS_DEFAULT = 5 * 60 * 1000;
// Visit timer for the video / quiz Done buttons. Worksheets use the
// completion gate and Blooket uses the flashcard quiz — neither uses this.
function deskDoneGateMs() {
  return _deskDoneGateMsDefault();
}
function _deskDoneGateMsDefault() {
  try {
    const v = localStorage.getItem('apstats_desk_done_gate_ms');
    if (v != null && !isNaN(Number(v))) return Math.max(0, Number(v));
  } catch (_) {}
  return DESK_DONE_GATE_MS_DEFAULT;
}

// 2026-05-20: worksheet Done is gated on real completion, not a timer.
// Each worksheet writes apstats_ws_completion[<studentKey>][<filename>] =
// { pct, eligible, ... } (WORKSHEET_COMPLETION_GATE_BUILD.md §3). The store
// is student-scoped (same getStudentEmail() identity as the Desk marks) so a
// shared browser never leaks completion between students. Resolve the entry
// for a given worksheet URL by its filename basename. Returns null if absent.
function _wsCompletionFor(worksheetUrl) {
  try {
    if (!worksheetUrl) return null;
    const file = String(worksheetUrl).split('?')[0].split('#')[0].split('/').pop();
    if (!file) return null;
    const studentKey = getStudentEmail();
    if (!studentKey) return null;
    const store = JSON.parse(localStorage.getItem('apstats_ws_completion') || '{}');
    const perStudent = store && store[studentKey];
    const entry = perStudent && perStudent[file];
    return (entry && typeof entry === 'object') ? entry : null;
  } catch (_) { return null; }
}

// Official worksheet CORRECTNESS (Cws, 0-100) for a topic, read from the /grade
// lessons cache — the same ledger-backed number the day modal + coach show.
// Distinct from _wsCompletionFor (LOCAL completion %, which drives the Done
// gate). Returns the number, or null when there's no recorded score yet.
function _getCwsForTopic(topicId) {
  try {
    if (!topicId || !Array.isArray(_gradeLessonsCache)) return null;
    for (var i = 0; i < _gradeLessonsCache.length; i++) {
      if (_gradeLessonsCache[i] && _gradeLessonsCache[i].lessonKey === topicId) {
        var c = _gradeLessonsCache[i].Cws;
        return (typeof c === 'number') ? c : null;
      }
    }
    return null;
  } catch (_) { return null; }
}
// Follow-Along grade for the resource-panel chip: the SAME number the in-app
// gradebook and the Schoology "Follow-Along" column show (lessonGradeNoQuiz =
// worksheet blanks + AI-graded reflections, weighted 1:2, + exit-ticket bonus).
// Cws alone is the completion floor, NOT the grade — showing Cws as "Grade" is
// what made students see 100% on the Desk and 81% in Schoology (2026-09-11).
function _getFollowAlongForTopic(topicId) {
  try {
    if (!topicId || !Array.isArray(_gradeLessonsCache)) return null;
    for (var i = 0; i < _gradeLessonsCache.length; i++) {
      var L = _gradeLessonsCache[i];
      if (!L || L.lessonKey !== topicId) continue;
      var fa = (typeof L.lessonGradeNoQuiz === 'number') ? L.lessonGradeNoQuiz
             : (typeof L.Cws === 'number') ? L.Cws : null;
      return {
        grade: fa,
        cws: (typeof L.Cws === 'number') ? L.Cws : null,
        w: (typeof L.W === 'number') ? L.W : null,
        exitBonus: (typeof L.exitBonus === 'number') ? L.exitBonus : 0,
        // Server flag: blanks recorded, reflections not graded yet — the
        // reflection feeder is counted at the minimum band, so the grade can
        // only go UP once the reflections are graded (FRQ_PROVISIONAL_FLOOR).
        provisional: L.frqProvisional === true
      };
    }
  } catch (_) {}
  return null;
}


// Blooket score for a topic, read from the /grade lessons[] cache. Returns the
// resolved Blooket grade (the real game score, else the 80% flashcard make-up)
// on 0..100, or null when the topic has no recorded Blooket / the cache is cold.
// Same source + shape as _getCwsForTopic so the Desk Done button can show a real
// score (like the worksheet/quiz) instead of a bare "Completed".
function _blooketScoreFor(topicId) {
  try {
    if (!topicId || !Array.isArray(_gradeLessonsCache)) return null;
    for (var i = 0; i < _gradeLessonsCache.length; i++) {
      if (_gradeLessonsCache[i] && _gradeLessonsCache[i].lessonKey === topicId) {
        var b = _gradeLessonsCache[i].blooket;
        return (typeof b === 'number') ? b : null;
      }
    }
    return null;
  } catch (_) { return null; }
}

// TI-84 trainer pct for a topic from the /grade lessons[] cache (mean over the
// lesson's mapped calculator procedures, missing=0), or null when untouched or
// the cache is cold. Ledger-authoritative — NEVER derived from the trainer's
// localStorage, so it is honest cross-device (TI84_GRADE_INTEGRATION_SPEC.md
// §B). DISPLAY ONLY: _isLessonComplete must not read this — trainer work never
// gates lesson advancement/greying in this phase.
function _trainerScoreFor(topicId) {
  try {
    if (!topicId || !Array.isArray(_gradeLessonsCache)) return null;
    for (var i = 0; i < _gradeLessonsCache.length; i++) {
      if (_gradeLessonsCache[i] && _gradeLessonsCache[i].lessonKey === topicId) {
        var t = _gradeLessonsCache[i].trainer;
        return (typeof t === 'number') ? t : null;
      }
    }
    return null;
  } catch (_) { return null; }
}

// Does this lesson have mapped TI-84 skills at all? Prefers the static lesson
// map (loads signed-out; the same curated file the trainer itself resolves);
// falls back to the /grade hasTrainer flag when the map fetch failed but a
// grade cache exists.
function _lessonHasTrainer(topicId) {
  try {
    if (!topicId) return false;
    if (_ti84LessonMap) return !!_ti84LessonMap[topicId];
    if (Array.isArray(_gradeLessonsCache)) {
      for (var i = 0; i < _gradeLessonsCache.length; i++) {
        if (_gradeLessonsCache[i] && _gradeLessonsCache[i].lessonKey === topicId) {
          return !!_gradeLessonsCache[i].hasTrainer;
        }
      }
    }
    return false;
  } catch (_) { return false; }
}

// Shared red/yellow/green color for a score vs its asset gate (the teacher's
// ask): 🔴 red below the gate, 🟡 amber at/above the gate but < 100, 🟢 green at
// 100. Returns the hex, or null when there's no numeric score. Single source of
// truth for both chip renderers (_scoreChip string + _mkGradeChip DOM node).
function _scoreColor(score, gate) {
  if (typeof score !== 'number' || !isFinite(score)) return null;
  var n = Math.round(score);
  return n >= 100 ? '#25663F' : (n >= gate ? '#b8860b' : '#B03A2E');
}

// Colored, always-on score chip (HTML string) — used for the Blooket row (the
// persistent _mkGradeChip block excludes Blooket) and the TI-84 skill row. '' when no score.
// The gate only picks the tint. The tooltip never names a pass mark or a gate: the deck's
// best score IS the Blooket grade, point for point (CLAUDE.md "Blooket credit").
function _scoreChip(score, gate) {
  var color = _scoreColor(score, gate);
  if (color == null) return '';
  var n = Math.round(score);
  var state = n >= 100 ? 'perfected' : 'your best so far — redo to raise it';
  return ' <span class="s7chip geneva" style="font-size:9px;font-weight:bold;color:' + color +
         ';margin-left:6px" title="Score ' + n + '% — ' + state + '">' + n + '%</span>';
}

// Quiz-Done gate threshold (percent): a quiz can be marked Done only once the
// student has answered >=40% of its questions AND scored >=40% correct. 40
// mirrors the v3 grading "floor" used elsewhere in the grade model.
var DESK_QUIZ_DONE_THRESHOLD = 40;

// Worksheet-Done gate threshold (percent filled). A follow-along worksheet can
// be marked Done once >= this fraction of its blanks+reflections are filled (or
// every reflection is AI-rated E). Lives on the Desk (not the worksheet's own
// 80% `eligible` flag) so it's tunable in one place + matches the quiz pattern.
var DESK_WORKSHEET_DONE_THRESHOLD = 60;

// Quiz performance for a topic, read from the /grade lessons[] cache
// (_gradeLessonsCache, populated by renderDoNowGrades). The recorded quiz
// score flows automatically from the curriculum_render quiz (no self-report).
// Returns { correct, total, scorePct, eligible } or null when the topic has no
// known quiz / the cache is cold.
//   scorePct = credit sum / total  (out of the WHOLE quiz — unanswered counts as
//   wrong, so it's a real quiz score: 1 right of 3 = 33%, 2 of 3 = 66%, not
//   "100% of what you answered"). eligible = scorePct >= the threshold.
// q.credit is set server-side: 1 for a correct first answer, 0.5 for a correct
// retry (QUIZ_RETRY_HALF_CREDIT_SPEC.md), or an AI-review credit; q.correct =
// full credit only.
function _quizPerfFor(topicId) {
  try {
    if (!topicId || !Array.isArray(_gradeLessonsCache)) return null;
    var lesson = null;
    for (var i = 0; i < _gradeLessonsCache.length; i++) {
      if (_gradeLessonsCache[i] && _gradeLessonsCache[i].lessonKey === topicId) {
        lesson = _gradeLessonsCache[i];
        break;
      }
    }
    if (!lesson) return null;
    var quiz = (lesson.items && Array.isArray(lesson.items.quiz)) ? lesson.items.quiz : [];
    var total = typeof lesson.quizTotal === 'number' ? lesson.quizTotal : 0;
    if (total <= 0) return null;  // no known quiz for this topic
    // Partial credit: sum each item's credit (E=1, P=2/3, I=1/3 from an AI
    // review). Fall back to the binary correct flag for older /grade payloads
    // that predate the credit field.
    var creditSum = quiz.reduce(function (s, q) {
      if (!q) return s;
      return s + (typeof q.credit === 'number' ? q.credit : (q.correct ? 1 : 0));
    }, 0);
    var correct = quiz.filter(function (q) { return q && q.correct; }).length;
    var scorePct = (creditSum / total) * 100;
    return {
      correct: correct,
      total: total,
      scorePct: scorePct,
      eligible: scorePct >= DESK_QUIZ_DONE_THRESHOLD,
    };
  } catch (_) { return null; }
}

// A quiz credit sum as text: whole numbers plain, a half as "½" (a correct
// retry earns half credit), anything else (AI-review thirds) to one decimal.
function _quizCreditText(n) {
  // Snap to sixths first so float drift (0.5 + 2/3 + 1/3) still reads as a half.
  var r = Math.round(n * 6) / 6;
  var whole = Math.floor(r);
  if (r === whole) return String(r);
  if (r - whole === 0.5) return (whole > 0 ? String(whole) : '') + '½';
  return String(Math.round(r * 10) / 10);
}

// Latch the first visit to a (topic, artifact) resource. Called from the
// link onclick BEFORE the new tab opens. Persists to the same _marks
// store as Done clicks (same localStorage key), so visit + done state
// share one round trip. Idempotent — first visit wins.
function recordLinkVisit(topicId, artifact) {
  // View-as: short-circuit so the teacher's localStorage never inherits
  // student-attributed visit timestamps (P2 of TEACHER_STUDENT_CONSOLE_SPEC.md).
  // typeof-guarded so the existing vm-based tests don't need to inject the
  // helper (s111 carry-forward: cross-sprint calls guarded).
  if (typeof _viewAsContext === 'function' && _viewAsContext()) return;
  try {
    const email = getStudentEmail();
    if (!email) return;
    const marks = getStudentMarks();
    const key = topicId + '|' + artifact;
    const entry = marks[key] || {};
    if (!entry.visitedAt) {
      entry.visitedAt = new Date().toISOString();
      marks[key] = entry;
      localStorage.setItem('apstats_desk_marks_' + email, JSON.stringify(marks));
    }
  } catch (_) {}
  // After the new tab opens, re-render the panel so the Done button picks
  // up the visit timestamp + countdown. Tiny delay so we don't fight the
  // browser's link-navigation.
  setTimeout(function () {
    if (_lastResourcePanel) showResourcePanel(_lastResourcePanel.inf, _lastResourcePanel.dateStr);
  }, 120);
}

async function recordProgress(topicId, artifact, score) {
  // View-as: short-circuit completely (P2 of TEACHER_STUDENT_CONSOLE_SPEC.md).
  // The teacher must NEVER record progress on the student's behalf.
  // typeof-guarded so the existing vm-based tests don't need to inject the
  // helper (s111 carry-forward: cross-sprint calls guarded).
  if (typeof _viewAsContext === 'function' && _viewAsContext()) {
    if (typeof _showViewAsToast === 'function') {
      _showViewAsToast('Read-only view: cannot record progress for this student.');
    }
    return false;
  }
  const email = getStudentEmail();
  if (!email) { showDialog('\u{1F464}','Please sign in first (Student menu).','OK'); return false; }
  // 2026-05-19 refactor: write localStorage FIRST as the source of truth so
  // the Done button latches "✓ Saved" regardless of network state. The
  // legacy student_progress Supabase POST is now best-effort cross-device
  // sync — failures (legacy project unreachable, anon-key RLS shift, etc.)
  // no longer eat the local persistence. The new gradebook ledger write
  // already happens in studentMark() via gradebookClient.record.
  try {
    const marks = getStudentMarks();
    const key = topicId + '|' + artifact;
    const prev = marks[key] || {};
    marks[key] = {
      visitedAt: prev.visitedAt || new Date().toISOString(),
      ts:        new Date().toISOString(),
      score:     score
    };
    localStorage.setItem('apstats_desk_marks_' + email, JSON.stringify(marks));
  } catch (e) {
    showDialog('⚠️','Could not save locally: ' + e.message + '. Try again.','OK');
    return false;
  }
  // Best-effort cloud sync. Don't await; don't block the UI on failure.
  (async function () {
    try {
      const body = { student_email: email, topic_id: topicId, artifact: artifact, score: (score==null?null:Number(score)) };
      const res = await fetch(SUPABASE_URL + '/rest/v1/student_progress', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        console.warn('[desk] student_progress cloud sync failed: HTTP ' + res.status + ' (local save unaffected)');
      }
    } catch (e) {
      console.warn('[desk] student_progress cloud sync error: ' + (e && e.message) + ' (local save unaffected)');
    }
  })();
  return true;
}

async function registerStudent(email) {
  try {
    await fetch(SUPABASE_URL + '/rest/v1/students', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates' },
      body: JSON.stringify({ email: email })
    });
  } catch(e) { /* non-fatal */ }
}

function updateStudentMenu() {
  // Populates BOTH the User-menu status line (#menu-student-status) and the
  // always-visible top-bar identity chip (#menu-identity). Handles signed-in
  // roster students, teachers, GUESTS (the stable Guest_ alias), and signed-out.
  var statusEl = document.getElementById('menu-student-status');
  var chipEl = document.getElementById('menu-identity');
  var role = null;
  try { role = localStorage.getItem('apstats_user_role'); } catch (_) {}
  var who = (window.rosterClient && window.rosterClient.current && window.rosterClient.current()) || null;

  var statusText, chipText, chipTitle;
  if (who) {
    var name = who.realName ? (who.realName + ' (' + who.username + ')') : who.username;
    statusText = (role === 'teacher' ? 'Teacher: ' : 'Signed in as: ') + name;
    chipText = '\u{1F464} ' + (who.realName || who.username);
    chipTitle = 'Signed in as ' + name + ' — click to sign in again or switch account';
    if (who.expired) {
      chipText = '\u26A0 Sign-in expired';
      chipTitle = 'Your sign-in expired — click to sign in again';
      statusText = 'Sign-in expired: ' + name;
    }
  } else if (typeof _deskGuestOk === 'function' && _deskGuestOk()) {
    var guest = (typeof getGuestIdentity === 'function') ? getGuestIdentity() : 'Guest';
    statusText = 'Guest: ' + guest + ' — click to sign in & save your work';
    chipText = '\u{1F9D1} ' + guest;
    chipTitle = statusText;
  } else {
    var email = getStudentEmail();
    if (email) {
      statusText = (role === 'teacher' ? 'Teacher: ' : 'Signed in as: ') + email;
      chipText = '\u{1F464} ' + email;
      chipTitle = statusText;
    } else {
      statusText = 'Not signed in';
      chipText = 'Sign in';
      chipTitle = 'Click to sign in';
    }
  }
  if (statusEl) statusEl.textContent = statusText;
  if (chipEl) { chipEl.textContent = chipText; chipEl.title = chipTitle; }
}

// 2026-05-20: per-device username history → datalist autocomplete.
// Successful sign-ins push the username onto the list (deduped, capped
// at 20, most-recent first). Pure client-side; no server endpoint
// needed; doesn't leak the global roster.
const KNOWN_USERS_KEY = 'apstats_desk_known_users';
const KNOWN_USERS_CAP = 20;
function _loadKnownUsers() {
  try {
    var raw = localStorage.getItem(KNOWN_USERS_KEY);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(function (u) { return typeof u === 'string' && u.length > 0; }) : [];
  } catch (_) { return []; }
}
function _addKnownUser(username) {
  if (!username || typeof username !== 'string') return;
  var clean = username.trim();
  if (!clean) return;
  try {
    var arr = _loadKnownUsers();
    // De-dupe case-insensitively, preserve original casing of the new entry.
    arr = arr.filter(function (u) { return u.toLowerCase() !== clean.toLowerCase(); });
    arr.unshift(clean);
    if (arr.length > KNOWN_USERS_CAP) arr = arr.slice(0, KNOWN_USERS_CAP);
    localStorage.setItem(KNOWN_USERS_KEY, JSON.stringify(arr));
  } catch (_) {}
}
function _populateUsernameDatalist() {
  var dl = document.getElementById('signin-username-list');
  if (!dl) return;
  while (dl.firstChild) dl.removeChild(dl.firstChild);
  var users = _loadKnownUsers();
  users.forEach(function (u) {
    var opt = document.createElement('option');
    opt.value = u;
    dl.appendChild(opt);
  });
}

// 2026-05-20 v7: server-backed roster picker — fetches the current
// period's classmate list from /roster/section/:section so students
// who remember their real name (but not their generated username) can
// find themselves. Cached in localStorage with 1h TTL; refreshed in
// the background after every successful signin.
const ROSTER_CACHE_TTL_MS = 60 * 60 * 1000;
function _periodToSection(period) {
  // Never return a falsy section (that would yield an empty roster
  // picker). An already-namespaced section passes through; a bare
  // period letter maps to Period<LETTER> (future-proof for when real
  // periods are assigned); anything missing or unrecognized resolves
  // to PeriodX, the single current section.
  if (typeof period !== 'string' || !period) return 'PeriodX';
  if (/^Period/.test(period)) return period;
  if (/^[A-Za-z]$/.test(period)) return 'Period' + period.toUpperCase();
  return 'PeriodX';
}

// Map the fresh roster session to the Desk calendar's real period. Unknown,
// teacher, parked, and signed-out sessions return null so callers can apply
// their own query/default fallback without ever throwing.
function _currentRosterPeriod() {
  try {
    var who = (window.rosterClient && typeof window.rosterClient.current === 'function')
      ? window.rosterClient.current() : null;
    if (who && who.section === 'PeriodB') return 'B';
    if (who && who.section === 'PeriodE') return 'E';
  } catch (_) {}
  return null;
}
// Fetch one specific section's roster (cached). Returns [] on miss/error.
// Extracted from _fetchPeriodRoster so the period -> section call can fall
// back to the universal "PeriodX" section.
async function _fetchSectionRoster(section, opts) {
  if (!section) return [];
  // The sign-in name finder passes {fresh:true} so a JUST-enrolled student can
  // find their name immediately — the 1-hour localStorage cache + the server's
  // 5-min Cache-Control would otherwise hide them. Other callers keep the cache.
  var fresh = !!(opts && opts.fresh);
  var cacheKey = 'apstats_desk_roster_cache_' + section;
  // Try cache first (skipped when fresh).
  if (!fresh) try {
    var raw = localStorage.getItem(cacheKey);
    if (raw) {
      var cached = JSON.parse(raw);
      if (cached && cached.ts && (Date.now() - cached.ts < ROSTER_CACHE_TTL_MS)) {
        return cached.roster || [];
      }
    }
  } catch (_) {}
  // Cache miss / stale → fetch.
  var baseUrl = (typeof window !== 'undefined' && window.ROSTER_SERVICE_URL) || null;
  if (!baseUrl) return [];
  try {
    var res = await fetch(baseUrl + '/roster/section/' + encodeURIComponent(section), fresh ? { cache: 'no-store' } : undefined);
    if (!res.ok) return [];
    var data = await res.json();
    var students = (data && data.ok && Array.isArray(data.students)) ? data.students : [];
    // Sort by realName for stable display.
    students.sort(function (a, b) {
      return (a.realName || '').localeCompare(b.realName || '');
    });
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), roster: students }));
    } catch (_) {}
    return students;
  } catch (_) {
    return [];
  }
}

async function _fetchPeriodRoster(period, opts) {
  var primarySection = _periodToSection(period);
  var primary = await _fetchSectionRoster(primarySection, opts);
  if (primary.length > 0) return primary;
  // Fallback: PeriodX is the universal section while real periods aren't
  // yet assigned. Without this fallback the sign-in dropdown is empty
  // whenever cP defaults to "B" (yielding section "PeriodB" which has
  // no students), even though every student is registered in PeriodX.
  if (primarySection !== 'PeriodX') {
    return _fetchSectionRoster('PeriodX', opts);
  }
  return [];
}

var _rosterDropdownData = [];  // last-fetched roster for the open modal

function _renderRosterDropdown(filterText) {
  var list = document.getElementById('signin-roster-list');
  if (!list) return;
  while (list.firstChild) list.removeChild(list.firstChild);
  var ft = (filterText || '').toLowerCase();
  var matches = _rosterDropdownData.filter(function (r) {
    if (!ft) return true;
    var name = (r.realName || '').toLowerCase();
    var uname = (r.username || '').toLowerCase();
    return name.indexOf(ft) >= 0 || uname.indexOf(ft) >= 0;
  });
  if (matches.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'sr-empty';
    empty.textContent = _rosterDropdownData.length === 0
      ? 'No class list loaded (offline?). Type your username manually.'
      : 'No matches.';
    list.appendChild(empty);
    return;
  }
  // Cap to 50 rows so a huge roster doesn't blow up the modal.
  var capped = matches.slice(0, 50);
  capped.forEach(function (r) {
    var row = document.createElement('div');
    row.className = 'sr-row';
    var name = document.createElement('span');
    name.className = 'sr-name';
    name.textContent = r.realName || '(unnamed)';
    var uname = document.createElement('span');
    uname.className = 'sr-uname';
    uname.textContent = r.username;
    row.appendChild(name);
    row.appendChild(uname);
    row.onclick = function () {
      var uInp = document.getElementById('signin-username');
      if (uInp) {
        uInp.value = r.username;
        uInp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      _closeRosterDropdown();
      var pInp = document.getElementById('signin-password');
      if (pInp) pInp.focus();
    };
    list.appendChild(row);
  });
  if (matches.length > 50) {
    var more = document.createElement('div');
    more.className = 'sr-empty';
    more.textContent = '... ' + (matches.length - 50) + ' more (refine search)';
    list.appendChild(more);
  }
}

async function _openRosterDropdown() {
  var dd = document.getElementById('signin-roster-dropdown');
  if (!dd) return;
  // Before sign-in there is no trustworthy current period. Load every live
  // roster section, then merge by case-insensitive username.
  var rosters = await Promise.all(['PeriodB', 'PeriodE', 'PeriodX'].map(function (section) {
    return _fetchSectionRoster(section);
  }));
  var seen = Object.create(null);
  _rosterDropdownData = [];
  rosters.forEach(function (roster) {
    (roster || []).forEach(function (student) {
      var username = String((student && student.username) || '').toLowerCase();
      if (seen[username]) return;
      seen[username] = true;
      _rosterDropdownData.push(student);
    });
  });
  _rosterDropdownData.sort(function (a, b) {
    return (a.realName || '').localeCompare(b.realName || '');
  });
  // Empty roster -> bail out and leave the dropdown closed. The previous
  // behaviour was to open it and show a "No class list loaded" hint that
  // visually overlaid the password field beneath. The student can still
  // type their username manually -- nothing in the field is blocked.
  if (_rosterDropdownData.length === 0) {
    _closeRosterDropdown();
    return;
  }
  var uInp = document.getElementById('signin-username');
  _renderRosterDropdown(uInp ? uInp.value : '');
  dd.style.display = 'block';
}

function _closeRosterDropdown() {
  var dd = document.getElementById('signin-roster-dropdown');
  if (dd) dd.style.display = 'none';
}

// Reflect the server-verified teacher role into the title bar (show or
// hide the Teacher menu) and keep the apstats_user_role cache in sync
// with the roster session. Called on page load + after sign-in/out, so
// a stale or hand-set cache value is corrected on every call.
function updateUserRoleUI() {
  var teacherMenu = document.getElementById('menu-item-teacher');
  var who = (window.rosterClient && window.rosterClient.current
             && window.rosterClient.current()) || null;
  var isTeacher = !!(who && who.role === 'teacher');
  try {
    if (isTeacher) localStorage.setItem('apstats_user_role', 'teacher');
    else localStorage.removeItem('apstats_user_role');
  } catch (_) {}
  // Sound level default by role (students quiet, teachers normal; persisted once signed in).
  try { _sfxApplyRoleDefault(who, isTeacher); } catch (_) {}
  // Period switch + any other .teacher-only chrome: follows _deskIsTeacher(), which is false in
  // Preview-as-student and view-as even for a signed-in teacher (teacher 2026-10-06).
  try { document.documentElement.classList.toggle('desk-teacher', (typeof _deskIsTeacher === 'function') && _deskIsTeacher()); } catch (_) {}
  if (!teacherMenu) return;
  teacherMenu.style.display = isTeacher ? '' : 'none';
  // Render (teacher) or clear (student/view-as/preview) the Grade Check-in reminder.
  // Self-gated on _deskIsTeacher(), so calling it unconditionally is safe.
  try { if (typeof _renderGradeCheckinUI === 'function') _renderGradeCheckinUI(); } catch (_) {}
  // Staff bulletin items appear/disappear with the role (sign-out, view-as, preview).
  try { if (typeof _renderBulletin === 'function') _renderBulletin(); } catch (_) {}
  // Teacher Inbox desktop icon follows the role too (self-gated on _deskIsTeacher()).
  try { if (typeof _teacherInboxRefreshVisibility === 'function') _teacherInboxRefreshVisibility(); } catch (_) {}
  try { if (typeof _teacherInboxTick === 'function') _teacherInboxTick(); } catch (_) {}
}

function openSignInModal() {
  var ov = document.getElementById('signin-overlay');
  if (!ov) return;
  var uInp = document.getElementById('signin-username');
  var pInp = document.getElementById('signin-password');
  var err = document.getElementById('signin-error');
  if (err) err.textContent = '';
  var who = (window.rosterClient && window.rosterClient.current && window.rosterClient.current()) || null;
  if (uInp) { uInp.value = (who && who.username) || getStudentEmail() || ''; }
  if (pInp) { pInp.value = ''; }
  // Keep account controls next to the credentials; names are untrusted text.
  if (typeof document.createElement === 'function') {
    var strip = document.getElementById('signin-current-strip');
    var usernameRow = document.getElementById('signin-username-row') || uInp;
    if (!strip && usernameRow && usernameRow.parentNode) {
      strip = document.createElement('div');
      strip.id = 'signin-current-strip';
      strip.style.cssText = 'font-size:12px;margin-bottom:12px;';
      usernameRow.parentNode.insertBefore(strip, usernameRow);
    }
    if (strip) {
      strip.textContent = '';
      strip.style.display = who ? 'block' : 'none';
      if (who) {
        strip.textContent = who.expired
          ? 'Your sign-in expired — sign in again to keep saving your work. '
          : 'Signed in as ' + (who.realName || who.username) + '. Signing in again refreshes your session. ';
        var signoutLink = document.createElement('a');
        signoutLink.href = '#';
        signoutLink.id = 'signin-signout-link';
        signoutLink.textContent = 'Sign out';
        signoutLink.onclick = function (event) {
          event.preventDefault();
          if (typeof signOutStudent === 'function') signOutStudent();
        };
        strip.appendChild(signoutLink);
      }
    }
  }
  // 2026-05-20: refresh the username dropdown suggestions every open
  // so newly-remembered users show up immediately. Typeof-guarded for
  // DN2c's vm-test which doesn't load this helper into its sandbox.
  if (typeof _populateUsernameDatalist === 'function') _populateUsernameDatalist();
  // 2026-05-20 v7: wire the server-backed roster dropdown. Focus opens
  // it; typing filters; Escape or outside-click closes it. Typeof-
  // guarded so DN2c's vm-test sandbox keeps passing.
  if (uInp && typeof _openRosterDropdown === 'function') {
    uInp.onfocus = function () { _openRosterDropdown(); };
    uInp.onclick = function () { _openRosterDropdown(); };
    uInp.oninput = function () {
      if (typeof _renderRosterDropdown === 'function') _renderRosterDropdown(uInp.value);
    };
  }
  // Escape closes only the roster dropdown; the sign-in modal stays open.
  if (typeof _closeRosterDropdown === 'function') {
    ov.onkeydown = function (e) {
      var dd = document.getElementById('signin-roster-dropdown');
      if (!e || e.key !== 'Escape' || !dd || dd.style.display === 'none') return;
      e.preventDefault();
      e.stopPropagation();
      _closeRosterDropdown();
    };
  }
  // Outside click closes the dropdown — but only when the click is
  // outside the username row container. Registered ONCE for the page (the
  // modal can be reopened many times; stacking a listener per open would
  // leak). The row is re-resolved per event so the guard has no stale ref.
  if (!openSignInModal._outsideCloser && typeof _closeRosterDropdown === 'function') {
    openSignInModal._outsideCloser = true;
    document.addEventListener('pointerdown', function (e) {
      var row = document.getElementById('signin-username-row');
      if (row && !row.contains(e.target)) _closeRosterDropdown();
    });
  }
  // No-guest-mode wall: when the visitor is not yet signed in the modal is
  // mandatory — hide Cancel; closeSignInModal() then refuses to dismiss it.
  // typeof-guarded so the desk-roster-signin vm-test (which loads only a
  // subset of helpers into its sandbox) keeps passing.
  _signinWallActive = (typeof _deskAccessGranted === 'function')
    ? !_deskAccessGranted() : false;
  var cancelBtn = document.getElementById('signin-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = _signinWallActive ? 'none' : '';
  ov.style.display = 'block';
  // (no beep — a modal opening is not an alert; 2026-08-19)
  setTimeout(function(){ if (uInp) uInp.focus(); }, 50);
}

function closeSignInModal() {
  // No-guest-mode wall: refuse to dismiss while the wall is up and the
  // visitor still is not signed in (blocks outside-click + a stray Cancel).
  // The successful-sign-in path reaches here with access already granted
  // (submitSignIn sets the roster session / teacher role first), so it closes.
  // typeof-guarded for the desk-roster-signin vm-test sandbox.
  if (_signinWallActive && typeof _deskAccessGranted === 'function'
      && !_deskAccessGranted()) return;
  var ov = document.getElementById('signin-overlay');
  if (!ov) return;
  _signinWallActive = false;
  MacSFX.play('click', 0.3);
  ov.style.display = 'none';
  if (typeof _closeRosterDropdown === 'function') _closeRosterDropdown();
}

async function submitSignIn() {
  if (submitSignIn._pending) return;            // in-flight guard (OK click + Enter)
  var uInp = document.getElementById('signin-username');
  var pInp = document.getElementById('signin-password');
  var err = document.getElementById('signin-error');
  if (err) err.textContent = '';

  if (!window.rosterClient || !window.rosterClient.signIn) {
    if (err) err.textContent = 'Sign-in unavailable (offline). Try again on the school network.';
    return;
  }

  // NOTE: username is trimmed; password is intentionally NOT trimmed —
  // leading/trailing characters can be valid in a password (security-correct).
  var username = (uInp && uInp.value || '').trim();
  var password = (pInp && pInp.value || '');
  if (!username || !password) {
    if (err) err.textContent = 'Enter both your username and password.';
    return;
  }

  submitSignIn._pending = true;
  var okBtn = document.getElementById('signin-ok');
  if (okBtn) okBtn.disabled = true;
  if (err) err.textContent = 'Signing in…';
  try {
    var result;
    var prevId = typeof window.rosterClient.studentId === 'function'
      ? window.rosterClient.studentId() : null;
    try {
      result = await window.rosterClient.signIn(username, password);
    } catch (e) {
      result = { ok: false, error: (e && e.message) || 'Network error' };
    }
    if (!result || !result.ok) {
      if (err) err.textContent = (result && result.error) || 'Sign-in failed.';
      return;
    }

    // Mirror the roster identity into the legacy key so every existing
    // getStudentEmail()-keyed Desk feature keeps working unchanged (DN3 retires
    // the legacy student_progress path; clean-start cohort, non-email is harmless).
    var who = (window.rosterClient.current && window.rosterClient.current()) || {};
    var legacyKey = who.username || username;
    // Same-tab sign-in emits no storage event. Replay only after the owner session is stored.
    try {
      if (!window.__VIEW_AS_STUDENT_ID__ && !(typeof _viewAsContext === 'function' && _viewAsContext())
          && window.gradebookClient && typeof window.gradebookClient.syncOfflineQueue === 'function') {
        Promise.resolve(window.gradebookClient.syncOfflineQueue()).catch(function () {});
      }
    } catch (_) { /* Replay is best-effort and must not turn a valid sign-in into an error. */ }
    // Incident review H1 — capture the PRIOR legacy value before it's
    // overwritten below, so a genuine pre-roster free-text-email marks
    // bucket for THIS transition can still be unioned in by D6's migration.
    var _priorLegacyEmail = null;
    try { _priorLegacyEmail = localStorage.getItem('apstats_desk_student_email'); } catch (_) {}
    localStorage.setItem('apstats_desk_student_email', legacyKey);
    try { localStorage.removeItem('apstats_guest_active'); } catch (_) {}   // real sign-in supersedes guest
    try { if (typeof _srsSyncPull === 'function') _srsSyncPull({ force: true }); } catch (_) {}
    registerStudent(legacyKey);
    // 2026-05-20: remember this username for the sign-in dropdown.
    if (typeof _addKnownUser === 'function') _addKnownUser(legacyKey);
    // Teacher-ness comes from the server-verified roster role. updateUserRoleUI()
    // below re-derives it from rosterClient.current().role and syncs the
    // apstats_user_role cache -- there is no access code anymore.
    updateStudentMenu();
    if (typeof updateUserRoleUI === 'function') updateUserRoleUI();
    // Incident review B1/B2 — an in-place identity switch (sign-in as a
    // different student, no reload) must not let the previous student's
    // in-memory /grade caches or a pending stale-token retry paint under
    // this new identity's keys.
    if (typeof _resetGradeStateForIdentitySwitch === 'function') _resetGradeStateForIdentitySwitch();
    // PROGRESS_RESET_FIX_SPEC D6 — union any bare-username/legacy-email marks
    // bucket into this freshly-resolved identity before the Do Now refresh.
    try { if (typeof _migrateMarksAliases === 'function') _migrateMarksAliases(_priorLegacyEmail, prevId); } catch (_) {}
    try {
      var signedInPeriod = (typeof _currentRosterPeriod === 'function') ? _currentRosterPeriod() : null;
      if (signedInPeriod && typeof setP === 'function'
          && (typeof cP !== 'string' || signedInPeriod !== cP)) setP(signedInPeriod);
    } catch (_) {}
    closeSignInModal();
    // TR2: a teacher-issued default password must be changed before continuing.
    // The welcome + Do Now refresh happen AFTER the new password is set.
    if (result.mustChangePassword) {
      openPwChangeModal();
    } else {
      if (typeof renderDoNow === 'function') renderDoNow(); // DN3a refresh — guarded so DN2c stays decoupled
      if (typeof _mountClassroomBoard === 'function') _mountClassroomBoard(); // Live Classroom v1a
      if (typeof _deskPresenceResync === 'function') _deskPresenceResync(); // guests retired: join presence as the real identity
      if (typeof _fetchPollArchive === 'function') _fetchPollArchive(); // v2.1 U4: poll archive (guarded, like its neighbors)
      if (prevId && prevId === who.studentId) {
        if (typeof _showViewAsToast === 'function') _showViewAsToast('Session refreshed — your saved work will sync now.');
        return;
      }
      var roleLabel = '';
      try { if (localStorage.getItem('apstats_user_role') === 'teacher') roleLabel = ' (teacher mode)'; } catch (_) {}
      showDialog('\u{1F464}','Signed in as ' + (who.realName || legacyKey) + roleLabel + '.','OK');
    }
  } finally {
    submitSignIn._pending = false;
    if (okBtn) okBtn.disabled = false;
  }
}

/* ═══ Quaternary Combo-Lock Name Finder (picker-first sign-in) ═════════════
   The PRIMARY way a student signs in. Three states render into #nf-content:
     dial     — a diamond of name-range buckets (↑ top / ← left / → right /
                ↓ bottom), alphabetical so left<right reads naturally. ~2–3
                presses for ~27 students (unit-tested: every name, ≤3 presses).
     password — greet by realName, ask ONLY for the password (no username field
                to type). Reuses rosterClient.signIn — the password is the gate.
   Resolves to login_username but DISPLAYS realName, so a student still finds
   themselves after a username reroll. Roster from the cached _fetchPeriodRoster();
   an empty/offline roster falls back to the manual sign-in modal (#signin-overlay).
   Students who'd rather TYPE their username (teachers, returning students) reach
   that modal with the Escape key — the dial no longer shows an "I know my
   username" link. The password-success block mirrors submitSignIn() and is kept
   in sync with it by hand. */
var _nfRoster = [];        // [{username, realName}] sorted by realName
var _nfStack = [];         // window history for back-out: [{lo,hi}]
var _nfLo = 0, _nfHi = -1;
var _nfState = 'dial';     // 'dial' | 'password'
var _nfPicked = null;      // the {username, realName} chosen on the dial

function _nfEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function _nfFriendly(r) {
  var nm = (r && r.realName || '').trim();
  if (!nm) return (r && r.username) || '(unnamed)';
  var parts = nm.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.';
}
// Short alpha key for range labels, e.g. "Ana B." -> "An".
function _nfRangeKey(r) {
  var nm = ((r && (r.realName || r.username)) || '').trim();
  if (!nm) return '?';
  return nm.charAt(0).toUpperCase() + (nm.charAt(1) || '').toLowerCase();
}
// Split [lo,hi] into up to 4 contiguous buckets. <=4 names -> one leaf per name
// (the final press picks a real person). >4 -> 4 ranges, last absorbs remainder.
function _nfBuckets(lo, hi) {
  var n = hi - lo + 1, out = [];
  if (n <= 0) return out;
  if (n <= 4) {
    for (var i = lo; i <= hi; i++) out.push({ lo: i, hi: i, leaf: true });
    return out;
  }
  var bs = Math.ceil(n / 4), start = lo;
  for (var b = 0; b < 4 && start <= hi; b++) {
    var end = (b === 3) ? hi : Math.min(start + bs - 1, hi);
    out.push({ lo: start, hi: end, leaf: false });
    start = end + 1;
  }
  return out;
}

async function openNameFinder() {
  // {fresh:true}: bypass the 1-hour roster cache so a newly-enrolled classmate
  // shows up in the dial immediately (this was hiding recent sign-ups).
  var rosters = (typeof _fetchSectionRoster === 'function')
    ? await Promise.all(['PeriodB', 'PeriodE', 'PeriodX'].map(function (section) {
        return _fetchSectionRoster(section, { fresh: true });
      })) : [];
  var seen = Object.create(null);
  _nfRoster = [];
  rosters.forEach(function (roster) {
    (roster || []).forEach(function (student) {
      var username = String((student && student.username) || '').toLowerCase();
      if (seen[username]) return;
      seen[username] = true;
      _nfRoster.push(student);
    });
  });
  if (!_nfRoster || _nfRoster.length === 0) {
    if (typeof openSignInModal === 'function') openSignInModal();   // offline / no roster
    return;
  }
  _nfRoster = _nfRoster.slice().sort(function (a, b) {
    return (a.realName || a.username || '').localeCompare(b.realName || b.username || '');
  });
  _nfLo = 0; _nfHi = _nfRoster.length - 1; _nfStack = []; _nfPicked = null;
  _nfEnsureOverlay();
  document.getElementById('namefinder-overlay').style.display = 'flex';
  // (no beep — routine modal open; 2026-08-19)
  _nfRenderDial();
}
window.openNameFinder = openNameFinder;

function _nfEnsureOverlay() {
  if (document.getElementById('namefinder-overlay')) return;
  var ov = document.createElement('div');
  ov.id = 'namefinder-overlay';
  ov.className = 'dialog-overlay';
  ov.style.cssText = 'display:none;align-items:center;justify-content:center;z-index:100001';
  ov.innerHTML =
    '<style>'
    + '#namefinder-overlay .nf-diamond{display:flex;flex-direction:column;align-items:center;gap:6px;margin:4px 0}'
    + '#namefinder-overlay .nf-row{display:flex;gap:6px;justify-content:center;width:100%}'
    + '#namefinder-overlay .nf-tile{flex:1;min-width:120px;max-width:200px;min-height:56px;border:2px solid var(--black);background:var(--white);cursor:pointer;padding:6px 8px;font-family:Geneva,sans-serif;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}'
    + '#namefinder-overlay .nf-tile:hover{background:#eef}#namefinder-overlay .nf-tile:active{background:#dde}'
    + '#namefinder-overlay .nf-arrow{font-size:18px;line-height:1}'
    + '#namefinder-overlay .nf-label{font-size:13px;font-weight:bold;margin-top:2px}'
    + '#namefinder-overlay .nf-sub{font-size:9px;color:#666;margin-top:2px}'
    + '#namefinder-overlay .nf-foot{font-size:10px;color:#555;margin-top:8px}'
    + '#namefinder-overlay .nf-foot a{color:#555}'
    + '</style>'
    + '<div class="dialog-box chicago" style="max-width:460px;width:94%;text-align:center" onclick="event.stopPropagation()">'
    + '<div class="dialog-body"><div id="nf-content"></div></div></div>';
  document.body.appendChild(ov);
  document.addEventListener('keydown', _nfKeydown);
}

function _nfRenderDial() {
  _nfState = 'dial';
  var host = document.getElementById('nf-content');
  if (!host) return;
  var n = _nfHi - _nfLo + 1;
  if (n <= 1) { _nfSelectName(_nfRoster[_nfLo]); return; }   // singleton: auto-pick, no wasted press
  var buckets = _nfBuckets(_nfLo, _nfHi);
  var arrows = ['↑', '←', '→', '↓'];     // top, left, right, bottom
  var arrowName = ['up', 'left', 'right', 'down'];
  function tile(b, i) {
    if (!b) return '<div class="nf-tile" style="visibility:hidden"></div>';
    var label, sub, aria;
    if (b.leaf) {
      var r = _nfRoster[b.lo];
      label = _nfEsc(_nfFriendly(r)); sub = '';
      aria = 'Press ' + arrowName[i] + ': select ' + _nfFriendly(r);
    } else {
      var first = _nfRoster[b.lo], last = _nfRoster[b.hi], c = b.hi - b.lo + 1;
      label = _nfEsc(_nfRangeKey(first)) + '–' + _nfEsc(_nfRangeKey(last));
      sub = _nfEsc(_nfFriendly(first)) + ' … ' + _nfEsc(_nfFriendly(last)) + ' (' + c + ')';
      aria = 'Press ' + arrowName[i] + ': ' + _nfFriendly(first) + ' to ' + _nfFriendly(last) + ', ' + c + ' names';
    }
    return '<button class="nf-tile" aria-label="' + _nfEsc(aria) + '" onclick="_nfPick(' + i + ')">'
      + '<div class="nf-arrow">' + arrows[i] + '</div>'
      + '<div class="nf-label">' + label + '</div>'
      + (sub ? '<div class="nf-sub">' + sub + '</div>' : '')
      + '</button>';
  }
  host.innerHTML =
    '<div class="chicago" style="font-size:13px;margin-bottom:2px">&#128274; Find your name</div>'
    + '<div class="geneva" aria-live="polite" style="font-size:10px;color:#555;margin-bottom:8px">' + n + ' classmates left · turn the dial to you</div>'
    + '<div class="nf-diamond">'
    + '<div class="nf-row">' + tile(buckets[0], 0) + '</div>'
    + '<div class="nf-row">' + tile(buckets[1], 1) + tile(buckets[2], 2) + '</div>'
    + '<div class="nf-row">' + tile(buckets[3], 3) + '</div>'
    + '</div>'
    + '<div class="nf-foot geneva">press &#8593; &#8592; &#8594; &#8595;'
    + (_nfStack.length ? ' &nbsp;&middot;&nbsp; <a href="#" onclick="_nfBack();return false;">&#9003; back</a>' : '')
    + '</div>'
    // The "not on the list" escape hatch shows on EVERY dial screen (incl. the
    // first) so a student who truly isn't on the roster is never stuck spinning.
    // Guests are retired (2026-06-25): this opens self-signup (which requires a real
    // name) so an off-roster student gets a real, teacher-visible account — never an
    // anonymous guest.
    + '<div class="nf-foot geneva" style="color:#888"><a href="#" onclick="_nfCreate();return false;">I\'m not on the list &#8594;</a></div>';
}

function _nfPick(i) {
  if (_nfState !== 'dial') return;
  var buckets = _nfBuckets(_nfLo, _nfHi);
  var b = buckets[i];
  if (!b) return;
  if (typeof MacSFX !== 'undefined' && MacSFX.play) MacSFX.play('click', 0.3);
  if (b.leaf) { _nfSelectName(_nfRoster[b.lo]); return; }
  _nfStack.push({ lo: _nfLo, hi: _nfHi });
  _nfLo = b.lo; _nfHi = b.hi;
  _nfRenderDial();
}
window._nfPick = _nfPick;

function _nfBack() {
  if (!_nfStack.length) return;
  var w = _nfStack.pop();
  _nfLo = w.lo; _nfHi = w.hi;
  _nfRenderDial();
}
window._nfBack = _nfBack;

// Picked a person -> ask ONLY for their password (no username field to type).
function _nfSelectName(r) { _nfPicked = r || null; _nfRenderPassword(); }

function _nfRenderPassword() {
  _nfState = 'password';
  var host = document.getElementById('nf-content');
  if (!host) return;
  var r = _nfPicked || {};
  host.innerHTML =
    '<div class="chicago" style="font-size:13px;margin-bottom:6px">&#128075; Hi, ' + _nfEsc(_nfFriendly(r)) + '!</div>'
    + '<div class="geneva" style="font-size:11px;margin-bottom:6px">Enter your password to sign in.</div>'
    + '<input type="password" id="nf-pw" class="geneva" autocomplete="current-password" style="width:100%;max-width:240px;font-size:14px;padding:6px;border:1px solid var(--black);box-sizing:border-box" placeholder="password">'
    + '<div id="nf-pw-error" class="geneva" style="color:#cc0000;font-size:10px;margin-top:4px;min-height:12px"></div>'
    + '<div style="margin-top:8px"><button class="s7btn s7btn-default" id="nf-pw-ok" style="min-width:140px" onclick="_nfSubmitPassword()">Sign in</button></div>'
    + '<div class="nf-foot geneva" style="color:#888;text-align:center"><a href="#" onclick="_nfBackToDial();return false;">&#8592; that’s not me</a></div>';
  var pw = document.getElementById('nf-pw');
  if (pw) { pw.onkeydown = function (e) { if (e.key === 'Enter') _nfSubmitPassword(); }; setTimeout(function () { pw.focus(); }, 60); }
}

async function _nfSubmitPassword() {
  if (_nfSubmitPassword._pending) return;
  var r = _nfPicked || {};
  var pw = document.getElementById('nf-pw');
  var err = document.getElementById('nf-pw-error');
  var okBtn = document.getElementById('nf-pw-ok');
  var password = (pw && pw.value) || '';     // NOT trimmed — edge whitespace can be valid
  if (err) err.textContent = '';
  if (!r.username) { _nfBackToDial(); return; }
  if (!password) { if (err) err.textContent = 'Enter your password.'; return; }
  if (!window.rosterClient || !window.rosterClient.signIn) {
    if (err) err.textContent = 'Sign-in unavailable (offline). Try again on the school network.';
    return;
  }
  _nfSubmitPassword._pending = true;
  if (okBtn) okBtn.disabled = true;
  if (err) err.textContent = 'Signing in…';
  try {
    var result;
    var prevId = typeof window.rosterClient.studentId === 'function'
      ? window.rosterClient.studentId() : null;
    try { result = await window.rosterClient.signIn(r.username, password); }
    catch (e) { result = { ok: false, error: (e && e.message) || 'Network error' }; }
    if (!result || !result.ok) {
      if (err) err.textContent = (result && result.error) || 'Sign-in failed. Check your password.';
      return;
    }
    // SUCCESS — mirror submitSignIn()'s post-success block (kept in sync by hand).
    var who = (window.rosterClient.current && window.rosterClient.current()) || {};
    var legacyKey = who.username || r.username;
    // Same-tab sign-in emits no storage event. Replay only after the owner session is stored.
    try {
      if (!window.__VIEW_AS_STUDENT_ID__ && !(typeof _viewAsContext === 'function' && _viewAsContext())
          && window.gradebookClient && typeof window.gradebookClient.syncOfflineQueue === 'function') {
        Promise.resolve(window.gradebookClient.syncOfflineQueue()).catch(function () {});
      }
    } catch (_) { /* Replay is best-effort and must not turn a valid sign-in into an error. */ }
    // Incident review H1 — capture the PRIOR legacy value before it's
    // overwritten below, so a genuine pre-roster free-text-email marks
    // bucket for THIS transition can still be unioned in by D6's migration.
    var _priorLegacyEmail = null;
    try { _priorLegacyEmail = localStorage.getItem('apstats_desk_student_email'); } catch (_) {}
    try { localStorage.setItem('apstats_desk_student_email', legacyKey); } catch (_) {}
    try { localStorage.removeItem('apstats_guest_active'); } catch (_) {}   // a real sign-in supersedes guest
    try { if (typeof _srsSyncPull === 'function') _srsSyncPull({ force: true }); } catch (_) {}
    if (typeof registerStudent === 'function') registerStudent(legacyKey);
    if (typeof _addKnownUser === 'function') _addKnownUser(legacyKey);
    if (typeof updateStudentMenu === 'function') updateStudentMenu();
    if (typeof updateUserRoleUI === 'function') updateUserRoleUI();
    // Incident review B1/B2 — an in-place identity switch (sign-in as a
    // different student, no reload) must not let the previous student's
    // in-memory /grade caches or a pending stale-token retry paint under
    // this new identity's keys.
    if (typeof _resetGradeStateForIdentitySwitch === 'function') _resetGradeStateForIdentitySwitch();
    // PROGRESS_RESET_FIX_SPEC D6 — union any bare-username/legacy-email marks
    // bucket into this freshly-resolved identity before the Do Now refresh.
    try { if (typeof _migrateMarksAliases === 'function') _migrateMarksAliases(_priorLegacyEmail, prevId); } catch (_) {}
    try {
      var signedInPeriod = (typeof _currentRosterPeriod === 'function') ? _currentRosterPeriod() : null;
      if (signedInPeriod && typeof setP === 'function'
          && (typeof cP !== 'string' || signedInPeriod !== cP)) setP(signedInPeriod);
    } catch (_) {}
    closeNameFinder();
    if (result.mustChangePassword) {
      if (typeof openPwChangeModal === 'function') openPwChangeModal();
    } else {
      if (typeof renderDoNow === 'function') renderDoNow();
      if (typeof _mountClassroomBoard === 'function') _mountClassroomBoard();
      if (typeof _deskPresenceResync === 'function') _deskPresenceResync(); // guests retired: join presence as the real identity
      if (typeof _fetchPollArchive === 'function') _fetchPollArchive();
      var roleLabel = '';
      try { if (localStorage.getItem('apstats_user_role') === 'teacher') roleLabel = ' (teacher mode)'; } catch (_) {}
      if (typeof showDialog === 'function') showDialog('\u{1F464}', 'Signed in as ' + (who.realName || legacyKey) + roleLabel + '.', 'OK');
    }
  } finally {
    _nfSubmitPassword._pending = false;
    if (okBtn) okBtn.disabled = false;
  }
}
window._nfSubmitPassword = _nfSubmitPassword;

function _nfBackToDial() { _nfRenderDial(); }
window._nfBackToDial = _nfBackToDial;

// Guests are retired (2026-06-25): the "I'm not on the list" path no longer mints an
// anonymous Guest_ identity. It routes to self-signup (which captures a real name)
// instead. Kept as a thin redirect so any lingering caller can't re-enable guest mode.
function _nfGuestSignIn() {
  if (typeof _nfCreate === 'function') { _nfCreate(); return; }
  closeNameFinder();
  if (typeof openSignupModal === 'function') openSignupModal();
}
window._nfGuestSignIn = _nfGuestSignIn;

function _nfCreate() {
  closeNameFinder();
  if (typeof openSignupModal === 'function') openSignupModal();
  else if (typeof openSignInModal === 'function') openSignInModal();
}
window._nfCreate = _nfCreate;

function _nfGotoSignin() { closeNameFinder(); if (typeof openSignInModal === 'function') openSignInModal(); }
window._nfGotoSignin = _nfGotoSignin;

function _nfKeydown(e) {
  var ov = document.getElementById('namefinder-overlay');
  if (!ov || ov.style.display === 'none') return;
  if (_nfState !== 'dial') {
    return;   // the password screen has its own controls (links/buttons); don't
              // hijack typing/Backspace, and don't discard a typed password on Escape
  }
  var map = { ArrowUp: 0, ArrowLeft: 1, ArrowRight: 2, ArrowDown: 3 };
  if (e.key in map) { e.preventDefault(); _nfPick(map[e.key]); }
  else if (e.key === 'Backspace') { e.preventDefault(); _nfBack(); }
  else if (e.key === 'Escape') { e.preventDefault(); _nfGotoSignin(); }
}

function closeNameFinder() {
  var ov = document.getElementById('namefinder-overlay');
  if (ov) ov.style.display = 'none';
}
window.closeNameFinder = closeNameFinder;

// ═══ Student Self-Signup (open signup + 🎲 re-roll + 4-digit PIN) ═══
// Candidates spin CLIENT-SIDE for instant re-roll; the server's POST /roster/claim
// is the authoritative first-come-first-serve check (DB UNIQUE on login_username).
// Word lists mirror roster-server/username.js (single source there; copied here so
// re-roll needs no round-trip + works if the server is slow). The claim endpoint
// validates charset only, so these need not byte-match the server lists.
var _SIGNUP_FRUITS = ['apple','banana','cherry','grape','kiwi','lemon','lime','mango','melon','peach','pear','plum','berry','fig','date','guava','lychee','papaya','orange','apricot','coconut','pineapple','pomelo','quince','raisin','olive','tomato','avocado','pumpkin','cranberry'];
var _SIGNUP_ANIMALS = ['koala','panda','tiger','lion','bear','wolf','fox','otter','seal','whale','shark','eagle','hawk','owl','duck','swan','deer','moose','zebra','horse','llama','sloth','gecko','turtle','frog','toad','rabbit','hamster','badger','beaver'];
var _signupCandidate = '';
// Fallback section if the server's /roster/open-sections is unreachable. PeriodX
// remains the parked/teacher section and maps to the default Period E calendar.
var _signupSections = [{ value: 'PeriodX', label: 'Period X' }];
var _signupSectionValue = 'PeriodX';

function _signupPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Spin a new fruit_animal candidate and show it on the card.
function _spinUsername() {
  _signupCandidate = _signupPick(_SIGNUP_FRUITS) + '_' + _signupPick(_SIGNUP_ANIMALS);
  var el = document.getElementById('signup-username-card');
  if (el) el.textContent = _signupCandidate;
  return _signupCandidate;
}

// Render the period field. One option → a read-only label ("Period X"); many →
// a real <select>. The student only ever sees labels; section values stay hidden.
function _renderSignupSections(sections) {
  var row = document.getElementById('signup-period-row');
  if (!row) return;
  while (row.firstChild) row.removeChild(row.firstChild);
  if (!sections || !sections.length) sections = [{ value: 'PeriodX', label: 'Period X' }];
  _signupSections = sections;
  _signupSectionValue = sections[0].value;

  if (sections.length === 1) {
    var d = document.createElement('div');
    d.style.cssText = 'font-size:11px';
    d.appendChild(document.createTextNode('Class period: '));
    var b = document.createElement('b');
    b.textContent = sections[0].label;
    d.appendChild(b);
    row.appendChild(d);
    return;
  }

  var lab = document.createElement('div');
  lab.style.cssText = 'font-size:10px;margin-bottom:2px';
  lab.textContent = 'Class period';
  row.appendChild(lab);
  var sel = document.createElement('select');
  sel.id = 'signup-period';
  sel.className = 'geneva';
  sel.style.cssText = 'width:100%;font-size:11px;padding:3px;border:1px solid var(--black);box-sizing:border-box';
  sections.forEach(function (s) {
    var o = document.createElement('option');
    o.value = s.value;
    o.textContent = s.label;
    sel.appendChild(o);
  });
  sel.onchange = function () { _signupSectionValue = sel.value; };
  row.appendChild(sel);
}

async function openSignupModal() {
  var ov = document.getElementById('signup-overlay');
  if (!ov) return;
  var rn = document.getElementById('signup-realname'); if (rn) rn.value = '';
  var p1 = document.getElementById('signup-pin'); if (p1) p1.value = '';
  var p2 = document.getElementById('signup-pin2'); if (p2) p2.value = '';
  var err = document.getElementById('signup-error'); if (err) err.textContent = '';
  // Reset the teacher-key affordance each open.
  var tcb = document.getElementById('signup-is-teacher'); if (tcb) tcb.checked = false;
  var tk = document.getElementById('signup-teacher-key'); if (tk) tk.value = '';
  var tkr = document.getElementById('signup-teacher-key-row'); if (tkr) tkr.style.display = 'none';
  _spinUsername();
  // Render the fallback period field + SHOW the modal instantly — never gate the
  // display on a network fetch (a hanging /open-sections must not hide the modal,
  // especially since this auto-pops on a first-time device). Refine the period
  // list from the server afterwards, in the background.
  _renderSignupSections(_signupSections);
  ov.style.display = 'block';
  // (no beep — routine modal open; 2026-08-19)
  setTimeout(function () { var n = document.getElementById('signup-realname'); if (n) n.focus(); }, 50);
  try {
    if (window.rosterClient && typeof window.rosterClient.openSections === 'function') {
      var sections = await window.rosterClient.openSections();
      if (sections && sections.length) {
        // Preserve an in-progress choice if the student already picked a period
        // during the (network-bound) refine and it's still offered.
        var prev = _signupSectionValue;
        _renderSignupSections(sections);
        if (prev && sections.some(function (s) { return s.value === prev; })) {
          _signupSectionValue = prev;
          var selEl = document.getElementById('signup-period');
          if (selEl) selEl.value = prev;
        }
      }
    }
  } catch (_) {}
}

// Show/hide the teacher-key field when "I'm a teacher" is toggled.
function _toggleTeacherKey() {
  var cb = document.getElementById('signup-is-teacher');
  var row = document.getElementById('signup-teacher-key-row');
  if (!row) return;
  var on = !!(cb && cb.checked);
  row.style.display = on ? 'block' : 'none';
  if (on) { var k = document.getElementById('signup-teacher-key'); if (k) k.focus(); }
}

// Switch between the two modals. Each directly hides the other overlay — moving
// BETWEEN the two mandatory modals never lands on the bare Desk, so it is safe to
// bypass the sign-in wall's dismiss guard here.
function _switchToSignUp() {
  var so = document.getElementById('signin-overlay'); if (so) so.style.display = 'none';
  openSignupModal();
}
function _switchToSignIn() {
  var su = document.getElementById('signup-overlay'); if (su) su.style.display = 'none';
  openSignInModal();
}

async function submitSignUp() {
  if (submitSignUp._pending) return;
  var err = document.getElementById('signup-error');
  if (err) err.textContent = '';

  if (!window.rosterClient || !window.rosterClient.claim) {
    if (err) err.textContent = 'Signup unavailable (offline). Try again on the school network.';
    return;
  }

  var realName = (document.getElementById('signup-realname') || {}).value || '';
  realName = realName.trim();
  // PINs are intentionally NOT trimmed.
  var pin = (document.getElementById('signup-pin') || {}).value || '';
  var pin2 = (document.getElementById('signup-pin2') || {}).value || '';
  if (!_signupCandidate) _spinUsername();
  var username = _signupCandidate;
  var section = _signupSectionValue;
  // Optional teacher elevation (key sent only when the box is checked).
  var isTeacher = !!((document.getElementById('signup-is-teacher') || {}).checked);
  var teacherKey = isTeacher ? ((document.getElementById('signup-teacher-key') || {}).value || '') : '';

  if (!realName) { if (err) err.textContent = 'Enter your real name.'; return; }
  if (!/^\d{4}$/.test(pin)) { if (err) err.textContent = 'Your PIN must be exactly 4 digits.'; return; }
  if (pin !== pin2) { if (err) err.textContent = 'The two PINs do not match.'; return; }
  if (isTeacher && !teacherKey) { if (err) err.textContent = 'Enter the teacher key (or uncheck "I’m a teacher").'; return; }

  submitSignUp._pending = true;
  var okBtn = document.getElementById('signup-ok');
  if (okBtn) okBtn.disabled = true;
  if (err) err.textContent = 'Creating your account…';
  try {
    var result;
    var prevId = typeof window.rosterClient.studentId === 'function'
      ? window.rosterClient.studentId() : null;
    try {
      result = await window.rosterClient.claim({ realName: realName, section: section, username: username, pin: pin, teacherKey: teacherKey || undefined });
    } catch (e) {
      result = { ok: false, error: (e && e.message) || 'Network error' };
    }
    if (!result || !result.ok) {
      if (result && (result.code === 'username-taken' || result.error === 'username-taken')) {
        var taken = username;
        _spinUsername();
        if (err) err.textContent = '“' + taken + '” was just taken. Here’s a new one: “' + _signupCandidate + '”. Tap Create account.';
      } else if (result && (result.code === 'invalid-teacher-key' || result.error === 'invalid-teacher-key')) {
        if (err) err.textContent = 'That teacher key isn’t right. Check it, or uncheck "I’m a teacher" to sign up as a student.';
      } else {
        if (err) err.textContent = (result && result.error) || 'Signup failed.';
      }
      return;
    }
    _applySignedUpSession(result, prevId);
  } finally {
    submitSignUp._pending = false;
    if (okBtn) okBtn.disabled = false;
  }
}

// Post-claim: claim already persisted the session (claim == sign-in). Mirror the
// identity into the legacy key + refresh the Desk, like submitSignIn's tail, but
// must_change_password is always false for self-signup (the student set their PIN).
function _applySignedUpSession(result, previousStudentId) {
  var who = (window.rosterClient.current && window.rosterClient.current()) || null;
  // Fail-closed: claim() succeeded on the SERVER, but if writeSession could not
  // persist locally (localStorage blocked/full — private mode, quota) the session
  // isn't really here. Do NOT drop the wall onto a bare Desk; show an error and
  // keep the signup modal up (mirrors submitSignIn's fail-closed behavior).
  if (!who || !who.studentId) {
    var serr = document.getElementById('signup-error');
    if (serr) serr.textContent = 'Could not save your account on this device. Allow cookies / site data for this site, then try again.';
    return;
  }
  var legacyKey = who.username || (result && result.username);
  // Incident review H1 — capture the PRIOR legacy value before it's
  // overwritten below, so a genuine pre-roster free-text-email marks bucket
  // for THIS transition can still be unioned in by D6's migration.
  var _priorLegacyEmail = null;
  try { _priorLegacyEmail = localStorage.getItem('apstats_desk_student_email'); } catch (_) {}
  try { localStorage.setItem('apstats_desk_student_email', legacyKey); } catch (_) {}
  try { localStorage.removeItem('apstats_guest_active'); } catch (_) {}   // real account supersedes guest
  try { if (typeof _srsSyncPull === 'function') _srsSyncPull({ force: true }); } catch (_) {}
  try { registerStudent(legacyKey); } catch (_) {}
  if (typeof _addKnownUser === 'function') _addKnownUser(legacyKey);
  try { updateStudentMenu(); } catch (_) {}
  if (typeof updateUserRoleUI === 'function') updateUserRoleUI();
  // Incident review B1/B2 — an in-place identity switch (sign-up as a new
  // student, no reload) must not let a previously signed-in student's
  // in-memory /grade caches or a pending stale-token retry paint under this
  // new identity's keys.
  if (typeof _resetGradeStateForIdentitySwitch === 'function') _resetGradeStateForIdentitySwitch();
  // PROGRESS_RESET_FIX_SPEC D6 — union any bare-username/legacy-email marks
  // bucket into this freshly-resolved identity before the Do Now refresh.
  try { if (typeof _migrateMarksAliases === 'function') _migrateMarksAliases(_priorLegacyEmail, previousStudentId); } catch (_) {}
  try {
    var signedInPeriod = (typeof _currentRosterPeriod === 'function') ? _currentRosterPeriod() : null;
    if (signedInPeriod && typeof setP === 'function'
        && (typeof cP !== 'string' || signedInPeriod !== cP)) setP(signedInPeriod);
  } catch (_) {}
  // Access is granted now — drop the wall and close both modals.
  _signinWallActive = false;
  var su = document.getElementById('signup-overlay'); if (su) su.style.display = 'none';
  var so = document.getElementById('signin-overlay'); if (so) so.style.display = 'none';
  if (typeof renderDoNow === 'function') renderDoNow();
  if (typeof _mountClassroomBoard === 'function') _mountClassroomBoard();
  if (typeof _deskPresenceResync === 'function') _deskPresenceResync(); // guests retired: join presence as the real identity
  if (typeof _fetchPollArchive === 'function') _fetchPollArchive();
  var uname = who.username || (result && result.username) || legacyKey;
  if (typeof showDialog === 'function') {
    showDialog('\u{1F389}', 'Welcome, ' + (who.realName || (result && result.realName) || legacyKey) + '! Your username is ' + uname + '. Remember your 4-digit PIN — you’ll sign in with your username + PIN next time.', 'OK');
  }
}

function signOutStudent() {
  if (window.rosterClient && window.rosterClient.signOut) window.rosterClient.signOut();
  localStorage.removeItem('apstats_desk_student_email');
  // Drop guest access on sign-out too — otherwise one earlier guest tap leaves
  // the sign-in wall down for the next person on a shared machine.
  try { localStorage.removeItem('apstats_guest_active'); } catch (_) {}
  // 2026-05-20: also clear the teacher role on sign-out so the next
  // student who signs in on the same machine doesn't inherit teacher
  // privileges from the previous session.
  try { localStorage.removeItem('apstats_user_role'); } catch (_) {}
  updateStudentMenu();
  if (typeof updateUserRoleUI === 'function') updateUserRoleUI();
  location.reload();
}

// ═══ Forced change-password (TR2) ═══
// Shown after sign-in (or on a returning session) when the roster account still
// carries a teacher-issued default password. No dismiss path except Sign Out.
// voluntary=true → opened from the User menu (Cancel-able, generic copy).
// voluntary falsy → the forced first-login flow (Sign-Out is the only exit).
function openPwChangeModal(voluntary) {
  var ov = document.getElementById('pwchange-overlay');
  if (!ov) return;
  var n = document.getElementById('pwchange-new');
  var c = document.getElementById('pwchange-confirm');
  var err = document.getElementById('pwchange-error');
  var title = document.getElementById('pwchange-title');
  var copy = document.getElementById('pwchange-copy');
  var leftBtn = document.getElementById('pwchange-leftbtn');
  if (n) n.value = '';
  if (c) c.value = '';
  if (err) err.textContent = '';
  if (title) title.textContent = voluntary ? 'Change Your Password' : 'Set Your Password';
  if (copy) copy.textContent = voluntary
    ? 'Choose a new password (at least 6 characters).'
    : 'Your teacher gave you a temporary password. Choose a new one to continue (at least 6 characters).';
  // typeof-guarded so the function never throws when loaded in a partial sandbox.
  if (leftBtn) {
    leftBtn.textContent = voluntary ? 'Cancel' : 'Sign Out';
    leftBtn.onclick = voluntary
      ? function () { if (typeof closePwChangeModal === 'function') closePwChangeModal(); }
      : function () { if (typeof signOutStudent === 'function') signOutStudent(); };
  }
  ov.style.display = 'flex';
  if (n) n.focus();
}

// Voluntary password change from the User menu (distinct from the forced modal).
function changeMyPassword() {
  var who = (window.rosterClient && rosterClient.current && rosterClient.current()) || null;
  if (!who || !who.username) {
    if (typeof showDialog === 'function') showDialog('\u{1F511}', 'Sign in first, then you can change your password.', 'OK');
    return;
  }
  openPwChangeModal(true);
}
window.changeMyPassword = changeMyPassword;

function closePwChangeModal() {
  var ov = document.getElementById('pwchange-overlay');
  if (ov) ov.style.display = 'none';
}

// If signed in with a default password still pending, force the modal.
// Guarded + never throws so it is safe to call from init.
function maybeForcePasswordChange() {
  try {
    var who = (window.rosterClient && window.rosterClient.current && window.rosterClient.current()) || null;
    if (who && who.mustChangePassword) {
      openPwChangeModal();
      return true;
    }
  } catch (e) { /* never block the Desk */ }
  return false;
}

async function submitPwChange() {
  if (submitPwChange._pending) return;          // in-flight guard (button + Enter)
  var n = document.getElementById('pwchange-new');
  var c = document.getElementById('pwchange-confirm');
  var err = document.getElementById('pwchange-error');
  if (err) err.textContent = '';

  if (!window.rosterClient || !window.rosterClient.changePassword) {
    if (err) err.textContent = 'Unavailable (offline). Try again on the school network.';
    return;
  }

  // Passwords are intentionally NOT trimmed (leading/trailing chars are valid).
  var pw = (n && n.value) || '';
  var confirmPw = (c && c.value) || '';
  if (pw.length < 6) {
    if (err) err.textContent = 'Use at least 6 characters.';
    return;
  }
  if (pw !== confirmPw) {
    if (err) err.textContent = 'The two passwords do not match.';
    return;
  }

  submitPwChange._pending = true;
  var okBtn = document.getElementById('pwchange-ok');
  if (okBtn) okBtn.disabled = true;
  if (err) err.textContent = 'Saving…';
  try {
    var result;
    try {
      result = await window.rosterClient.changePassword(pw);
    } catch (e) {
      result = { ok: false, error: (e && e.message) || 'Network error' };
    }
    if (!result || !result.ok) {
      if (err) err.textContent = (result && result.error) || 'Could not change password.';
      return;
    }
    closePwChangeModal();
    var who = (window.rosterClient.current && window.rosterClient.current()) || {};
    if (typeof renderDoNow === 'function') renderDoNow(); // DN3a refresh — guarded
    showDialog('\u{1F511}','Password set. You are signed in as ' + (who.realName || who.username || 'student') + '.','OK');
  } finally {
    submitPwChange._pending = false;
    if (okBtn) okBtn.disabled = false;
  }
}
