"""apclassroom_pc_reconcile.py -- nightly AP Classroom -> roster Progress Check reconcile.

PC_FOLLOWTHROUGH_SPEC.md section 4. For every ACTIVE registry entry of a section
(data/apclassroom-assignments.json) it reads the AP Classroom tables for the online
parts (MCQ B and C: Results by Student; FRQ: Progress), matches names to roster
usernames, and posts one ledger row per scored part through POST /pc/grade. After
the close date it posts an explicit 0 (with a note) for every part that was never
submitted. Part A is paper and is never touched here.

    python tools/apclassroom_pc_reconcile.py --section PeriodE              # dry run: prints the plan
    python tools/apclassroom_pc_reconcile.py --section PeriodE --apply      # posts rows + snapshot
    python tools/apclassroom_pc_reconcile.py --section PeriodE --fixture tools/fixtures/apclassroom/periodE-u1/
    python tools/apclassroom_pc_reconcile.py --section PeriodE --dump tools/.pc-reconcile-logs/periodE-u1/
    python tools/apclassroom_pc_reconcile.py --section PeriodE --remind     # write reminder drafts now

A fixture or dump directory holds B.txt, C.txt and FRQ.txt (the page innerText).

Rules:
  * Dry run (the default) posts NOTHING, not even the snapshot.
  * A part already stored with the same points/of is skipped.
  * NEVER LOWER: a part already posted is never replaced by a lower AP Classroom
    score (a downward correction is the teacher's call). The student is skipped
    and counted as WOULD LOWER.
  * A deadline 0 is posted only where no row exists; a stored row is never
    replaced by a 0.
  * Reminder drafts (section 4b): the day before a due date (or with --remind) a
    PRIVATE reminders-{section}-U{unit}-{date}.json lands in the log dir, one
    message per matched student with a part not submitted. NOTHING is sent here:
    the teacher approves each message and a Claude session sends it.
  * FRQ scoring is a judgment task done in a Claude session; this script only
    REPORTS submitted-unscored FRQs (needs scoring) and posts the number once AP
    Classroom shows a score.

Privacy: the repo is public. Real names live only in the private roster map
(default %USERPROFILE%/grade-backups/apclassroom/roster-map.json) and in the log
(the log dir is gitignored). stdout shows usernames only unless --names.

Secrets: ROSTER_TEACHER_SECRET from the environment only. Never printed.
Exit codes: 0 ok, 1 an HTTP/post failure or a table that never loaded, 2 SIGN IN NEEDED.

ASCII only. LF line endings.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)  # python -I does not add the script dir

from schoology_sync_section import today_school_date  # noqa: E402

DEFAULT_BASE = "https://roster-production-12c1.up.railway.app"
DEFAULT_REGISTRY = os.path.join(REPO_ROOT, "data", "apclassroom-assignments.json")
DEFAULT_ROSTER_MAP = os.path.join(os.path.expanduser("~"), "grade-backups", "apclassroom", "roster-map.json")
DEFAULT_LOG_DIR = os.path.join(SCRIPT_DIR, ".pc-reconcile-logs")
AP_BASE = "https://apclassroom.collegeboard.org"
GH_REPO = "robjohncolson/apstats-live-worksheet"
SIGN_IN_TITLE = "PC reconcile: sign-in needed"
SIGN_IN_LINE = "SIGN IN NEEDED: open AP Classroom in the Edge rig profile"
SIGN_IN_GRACE_S = 8  # a sign-in page must persist this long before it counts (IdP bounce)

ONLINE_PARTS = ("B", "C", "FRQ")
MCQ_PARTS = ("A", "B", "C")

# Mirror of roster-server/grade-config.js PC_PART_POINTS (the fallback weight of a
# row posted without `of`). Pinned equal by tests/test_apclassroom_pc_reconcile.py.
PC_PART_POINTS = {1: {"A": 18, "B": 14, "C": 12, "FRQ": 16}}


class PageNotReady(Exception):
    """The AP Classroom table rendered its header but never filled in its numbers."""


class SignInNeeded(Exception):
    """AP Classroom is not signed in in the Edge rig profile."""


# --------------------------------------------------------------------------- #
# The blend (mirror of roster-server/scoring.js pcPaperBlend)                  #
# --------------------------------------------------------------------------- #

def _positive_number(value):
    """Number(value) > 0 as in JS: 16, 16.0 and "16" -> 16.0; anything else -> None."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _unit_number(unit):
    """1, "1" and "U1" -> 1 (the JS helper strips a leading U); else None."""
    try:
        return int(str(unit).strip().lstrip("Uu"))
    except ValueError:
        return None


def _part_weight(name: str, part: dict, unit) -> float:
    of = _positive_number(part.get("of"))
    if of is not None:
        return of
    table = PC_PART_POINTS.get(_unit_number(unit)) or {}
    if table.get(name, 0) > 0:
        return float(table[name])
    return 1.0


def paper_blend(parts: dict, unit: int):
    """The unit's paper % (0..100, unrounded) or None. parts: {name: {score, of}}.

    MCQ half = points-weighted mean of the present A, B, C parts; FRQ half = the
    FRQ score; both present -> 50/50, one side present -> that side alone. Legacy:
    with no B, C or FRQ part, the best of A and REST (nothing moves before the
    first reconcile)."""
    parts = parts or {}
    has_per_part = any(parts.get(p) for p in ONLINE_PARTS)
    if not has_per_part:
        legacy = [parts[p]["score"] * 100 for p in ("A", "REST") if parts.get(p)]
        return max(legacy) if legacy else None

    num = 0.0
    den = 0.0
    for name in MCQ_PARTS:
        part = parts.get(name)
        if not part:
            continue
        weight = _part_weight(name, part, unit)
        num += part["score"] * weight
        den += weight
    mcq_half = num / den if den > 0 else None
    frq_half = parts["FRQ"]["score"] if parts.get("FRQ") else None

    if mcq_half is not None and frq_half is not None:
        return 100 * (0.5 * mcq_half + 0.5 * frq_half)
    if mcq_half is not None:
        return 100 * mcq_half
    return 100 * frq_half


def round1(x):
    """Round half up to 0.1, as the JS engine's Math.round(x * 10) / 10."""
    if x is None:
        return None
    return int(x * 10 + 0.5) / 10.0


# --------------------------------------------------------------------------- #
# Page parsers (pure)                                                          #
# --------------------------------------------------------------------------- #

_INT_RE = re.compile(r"^\d+$")
_TIME_RE = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?$")
_DATE_RE = re.compile(r"^\d{1,2}/\d{1,2}( \d{1,2}:\d{2} ?[AP]M)?$")
_DASHES_RE = re.compile(r"^-( -)*$")
_LETTERS_RE = re.compile(r"^(NA|[A-E-](,? [A-E-])*)$")
_NOT_SUBMITTED_RE = re.compile(r"^(?P<name>.*\S)\s+-\s+-$")
_STATUS_RE = re.compile(r"^(?P<name>.+?)\s+(?P<status>Submitted|In progress|Not started|Scored)\b(?P<rest>.*)$")
# A score like "13/16" -- never a date ("10/16 02:24 PM", "10/16/2026").
_SCORE_RE = re.compile(r"(?<![\d/])(\d{1,2}(?:\.\d+)?)\s*/\s*(\d{1,2})(?![\d/])(?!\s*\d{1,2}:\d{2})")


def _tokens(text: str) -> list:
    """innerText -> non-empty trimmed cells (rows may use tabs or newlines)."""
    out = []
    for line in str(text or "").replace("\r", "").split("\n"):
        for cell in line.split("\t"):
            cell = cell.strip()
            if cell:
                out.append(cell)
    return out


def _is_value(tok: str) -> bool:
    return bool(_INT_RE.match(tok) or _TIME_RE.match(tok) or _DATE_RE.match(tok)
                or _DASHES_RE.match(tok) or _LETTERS_RE.match(tok))


def parse_points_of(text: str):
    """The '(of 14)' header -> 14, or None."""
    m = re.search(r"\(of (\d+)\)", str(text or ""))
    return int(m.group(1)) if m else None


def parse_results_students(text: str) -> dict:
    """Results by Student tab -> {name: {points|None, sessions|None, submitted|None}}.

    A student block is: name, points, testing sessions, time spent, submitted date,
    answer letters. A student who never submitted reads 'Name - -' then dashes."""
    tokens = _tokens(text)
    start = 0
    for i, tok in enumerate(tokens):
        if tok.startswith("AVERAGE TIME SPENT"):
            start = i + 1
            break

    students = {}
    i = start
    while i < len(tokens):
        tok = tokens[i]
        if _is_value(tok):
            i += 1
            continue
        m = _NOT_SUBMITTED_RE.match(tok)
        if m:
            students[m.group("name")] = {"points": None, "sessions": None, "submitted": None}
            i += 1
            continue
        nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
        if _DASHES_RE.match(nxt):
            students[tok] = {"points": None, "sessions": None, "submitted": None}
            i += 2
            continue
        if not _INT_RE.match(nxt):
            i += 1  # a header or a question title, not a student
            continue
        entry = {"points": int(nxt), "sessions": None, "submitted": None}
        j = i + 2
        if j < len(tokens) and _INT_RE.match(tokens[j]):
            entry["sessions"] = int(tokens[j])
            j += 1
        if j < len(tokens) and _TIME_RE.match(tokens[j]):
            j += 1
        if j < len(tokens) and _DATE_RE.match(tokens[j]):
            entry["submitted"] = tokens[j]
            j += 1
        students[tok] = entry
        i = j
    return students


def parse_progress(text: str) -> dict:
    """Progress tab -> {name: {status, points|None, of|None, submitted|None}}.

    status is submitted | in_progress | not_submitted | scored. A row with a score
    like 13/16 is 'scored' whatever its status word says."""
    lines = [line.replace("\t", " ").strip() for line in str(text or "").replace("\r", "").split("\n")]
    lines = [line for line in lines if line]
    start = 0
    for i, line in enumerate(lines):
        if line == "Feedback":
            start = i + 1
            break

    rows = {}
    current = None
    for line in lines[start:]:
        m = _STATUS_RE.match(line)
        if m and m.group("name") != "Date":
            current = m.group("name")
            word = m.group("status")
            status = {"Submitted": "submitted", "In progress": "in_progress",
                      "Not started": "not_submitted", "Scored": "scored"}[word]
            date = re.search(r"\d{1,2}/\d{1,2} \d{1,2}:\d{2} ?[AP]M", m.group("rest"))
            rows[current] = {"status": status, "points": None, "of": None,
                             "submitted": date.group(0) if date else None}
            line = m.group("rest")
        if current is None:
            continue
        score = _SCORE_RE.search(line)
        if score and int(score.group(2)) == 0:
            score = None  # '0/0' is AP Classroom's not-yet-loaded placeholder
        if score and rows[current]["points"] is None:
            rows[current]["points"] = float(score.group(1)) if "." in score.group(1) else int(score.group(1))
            rows[current]["of"] = int(score.group(2))
            rows[current]["status"] = "scored"
    for row in rows.values():
        if row["status"] == "scored" and row["points"] is None:
            row["status"] = "submitted"  # 'Scored' without a number: nothing to post yet
    return rows


def page_ready(part: str, text: str, header: str) -> bool:
    """True once the table has its header AND its numbers.

    AP Classroom paints these tables in stages. Results by Student first shows
    '(of )' and a dash per student, then '(of 14)' with no rows at all, then the
    rows. The FRQ progress table first shows every row as 'Scored' with a '0/0'
    score. Reading any of those early paints would look like nobody submitted
    or everybody scored zero (and, after the close date, would zero everyone)."""
    body = str(text or "")
    if header not in body:
        return False
    if part == "FRQ":
        return "0/0" not in body
    if parse_points_of(body) is None:
        return False
    return len(parse_results_students(body)) > 0


def needs_sign_in(url: str, text: str, header: str) -> bool:
    """True when the page is not the signed-in AP Classroom table."""
    if url and "apclassroom.collegeboard.org" not in url:
        return True
    body = str(text or "")
    return "Sign In" in body and header not in body


# --------------------------------------------------------------------------- #
# Name matching (mirror of scripts/import-pc-scores.mjs matchStudent)          #
# --------------------------------------------------------------------------- #

def normalize_name(s: str) -> list:
    decomposed = unicodedata.normalize("NFD", str(s))
    stripped = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z\s]", " ", stripped.lower()).split()


def match_name(name: str, students: list, roster_map: dict):
    """-> ('excluded', None) | ('matched', username) | ('unmatched', None).

    Order: exclude list -> explicit name map -> roster username -> exact
    normalized full name -> last token + first initial (must be unique)."""
    want = normalize_name(name)
    excluded = {" ".join(normalize_name(n)) for n in roster_map.get("exclude", [])}
    if " ".join(want) in excluded:
        return ("excluded", None)

    for map_name, username in (roster_map.get("nameToUsername") or {}).items():
        if normalize_name(map_name) == want:
            return ("matched", username)

    for s in students:
        if s.get("username") == str(name).strip():
            return ("matched", s["username"])

    exact = [s for s in students if normalize_name(s.get("realName", "")) == want]
    if len(exact) == 1:
        return ("matched", exact[0]["username"])

    if not want:
        return ("unmatched", None)
    last = want[-1]
    initial = want[0][0]
    loose = []
    for s in students:
        have = normalize_name(s.get("realName", ""))
        if last in have and have and have[0][0] == initial:
            loose.append(s)
    if len(loose) == 1:
        return ("matched", loose[0]["username"])
    return ("unmatched", None)


# --------------------------------------------------------------------------- #
# The plan (pure)                                                              #
# --------------------------------------------------------------------------- #

def zero_note(due_date: str) -> str:
    return "Not submitted by %s: scored 0. Schedule a retake with Mr. Colson." % due_date


PART_LABELS = {"B": "MCQ Part B", "C": "MCQ Part C", "FRQ": "the FRQ"}


def due_date_text(due_date: str, pages: dict) -> str:
    """'2026-10-23' + the page's 'DUE DATE 10/23 01:15 PM' -> 'Thursday 10/23 at 1:15 PM'.

    The weekday comes from the registry due date; the time from the AP Classroom
    page header when one is there."""
    day = datetime.strptime(due_date, "%Y-%m-%d")
    text = "%s %d/%d" % (day.strftime("%A"), day.month, day.day)
    for page in pages.values():
        m = re.search(r"DUE DATE\s+\d{1,2}/\d{1,2}\s+0?(\d{1,2}:\d{2} ?[AP]M)", str(page or ""))
        if m:
            return text + " at " + m.group(1)
    return text


def draft_reminder(first_name: str, unit: int, due_text: str, missing_parts: list) -> str:
    """The deterministic reminder message (PC_FOLLOWTHROUGH_SPEC.md section 4b)."""
    labels = [PART_LABELS[p] for p in ONLINE_PARTS if p in missing_parts]
    if len(labels) == 1:
        parts_text = labels[0]
    else:
        parts_text = ", ".join(labels[:-1]) + " and " + labels[-1]
    pronoun = "it" if len(labels) == 1 else "them"
    return ("Hi %s, the Unit %d Progress Check closes %s. AP Classroom still shows %s unsubmitted. "
            "Anything not turned in by then is scored 0 and you would need to schedule a retake with me. "
            "You can finish %s from AP Classroom tonight or during class. - Mr. Colson"
            % (first_name, unit, due_text, parts_text, pronoun))


def reminder_targets(by_user: dict, display_names: dict) -> list:
    """Matched students with a part not submitted or in progress (excluded names never get here)."""
    out = []
    for username in sorted(by_user):
        statuses = by_user[username]
        missing = [p for p in ONLINE_PARTS
                   if statuses.get(p, {}).get("status") in ("not_submitted", "in_progress")]
        if missing:
            out.append({"username": username, "displayName": display_names.get(username, username), "missing": missing})
    return out


def should_remind(today: str, due_date: str) -> bool:
    """True on the school day before the due date (calendar day before)."""
    day_before = datetime.strptime(due_date, "%Y-%m-%d").toordinal() - 1
    return datetime.strptime(today, "%Y-%m-%d").toordinal() == day_before


def build_reminder_drafts(entry: dict, pages: dict, targets: list, drafted_at: str) -> dict:
    """The PRIVATE draft file body: one message per target. Sending is a human step."""
    due_text = due_date_text(entry["dueDate"], pages)
    students = []
    for t in targets:
        first = (t["displayName"].split() or [t["username"]])[0]
        students.append(dict(t, message=draft_reminder(first, int(entry["unit"]), due_text, t["missing"])))
    return {"section": entry["section"], "unit": int(entry["unit"]), "dueDate": entry["dueDate"],
            "draftedAt": drafted_at, "students": students}


def _ap_status(part: str, row: dict, of: int) -> dict:
    """One AP Classroom row -> the snapshot status for one part."""
    if part == "FRQ":
        out = {"status": row["status"]}
        if row["status"] == "scored":
            out["points"] = row["points"]
            out["of"] = row["of"] or of
    elif row["points"] is None:
        out = {"status": "not_submitted"}
    else:
        out = {"status": "scored", "points": row["points"], "of": of}
    if row.get("submitted"):
        out["submittedAt"] = row["submitted"]
    return out


def _same(stored: dict, points, of) -> bool:
    if not stored:
        return False
    return stored.get("points") == points and stored.get("of") == of


def build_plan(entry: dict, pages: dict, students: list, stored: dict, roster_map: dict, today: str) -> dict:
    """Everything the run would do for one registry entry, without doing it.

    pages:  {'B': text, 'C': text, 'FRQ': text}
    stored: {username: {'parts': {...}, 'pct': n}} from GET /pc/parts
    """
    unit = int(entry["unit"])
    parts_cfg = entry["parts"]
    closed = today >= entry["closeDate"]
    note = zero_note(entry["dueDate"])

    parsed = {}
    for part in ONLINE_PARTS:
        if part not in pages or not parts_cfg.get(part, {}).get("id"):
            continue
        parsed[part] = parse_progress(pages[part]) if part == "FRQ" else parse_results_students(pages[part])

    excluded_names = set()
    unmatched_names = set()
    by_user = {}        # username -> {part: snapshot status}
    display_names = {}  # username -> the AP Classroom name (private: reminder drafts only)
    for part, rows in parsed.items():
        of = parts_cfg[part]["of"]
        for name, row in rows.items():
            kind, username = match_name(name, students, roster_map)
            if kind == "excluded":
                excluded_names.add(name)
                continue
            if kind == "unmatched":
                unmatched_names.add(name)
                continue
            by_user.setdefault(username, {})[part] = _ap_status(part, row, of)
            display_names.setdefault(username, name)

    plan = {"posts": [], "would_lower": [], "drops": [], "needs_scoring": [],
            "skipped_same": 0, "zeroed": 0,
            "unmatched_names": sorted(unmatched_names), "excluded": len(excluded_names),
            "reminders": reminder_targets(by_user, display_names)}

    for username in sorted(by_user):
        statuses = by_user[username]
        have = (stored.get(username) or {}).get("parts") or {}
        posts = []
        for part in ONLINE_PARTS:
            st = statuses.get(part)
            if not st:
                continue
            of = parts_cfg[part]["of"]
            if st["status"] == "scored":
                if _same(have.get(part), st["points"], st["of"]):
                    plan["skipped_same"] += 1
                    continue
                posts.append({"part": part, "points": st["points"], "of": st["of"]})
                continue
            if part == "FRQ" and st["status"] == "submitted":
                plan["needs_scoring"].append(username)
            if not closed or st["status"] == "submitted":
                continue
            if have.get(part):
                if have[part].get("points") == 0:
                    st["status"] = "zeroed"
                continue  # a stored row is never replaced by a 0
            st["status"] = "zeroed"
            posts.append({"part": part, "points": 0, "of": of, "note": note, "zero": True})

        if not posts:
            continue

        # NEVER LOWER, part by part: if any post would replace a stored part with a
        # lower score, skip the whole student (a raise elsewhere never hides it).
        lowers = [post for post in posts
                  if post["part"] in have and post["points"] / post["of"] < have[post["part"]]["score"] - 1e-9]
        if lowers:
            plan["would_lower"].append(username)
            continue

        for post in posts:
            if post.get("zero"):
                plan["zeroed"] += 1
            plan["posts"].append(dict(post, username=username))

        # Report a PC % that drops (a new weak part, or the old REST row going quiet).
        merged = {p: dict(v) for p, v in ((stored.get(username) or {}).get("parts") or {}).items()}
        for post in posts:
            merged[post["part"]] = {"score": post["points"] / post["of"], "of": post["of"]}
        new_pct = round1(paper_blend(merged, unit))
        old_pct = (stored.get(username) or {}).get("pct")
        if old_pct is not None and new_pct is not None and new_pct < old_pct:
            plan["drops"].append({"username": username, "from": old_pct, "to": new_pct})

    plan["snapshot"] = {
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "assignments": {p: parts_cfg[p]["id"] for p in ONLINE_PARTS if parts_cfg.get(p, {}).get("id")},
        "closeDate": entry["closeDate"],
        "unmatched": len(unmatched_names),
        "excluded": len(excluded_names),
        "students": by_user,
    }
    return plan


# --------------------------------------------------------------------------- #
# I/O: registry, roster map, roster-server, AP Classroom                       #
# --------------------------------------------------------------------------- #

def load_registry(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def active_entries(registry: dict, section: str, unit=None) -> list:
    out = []
    for entry in registry.get("progressChecks", []):
        if entry.get("section") != section or not entry.get("active"):
            continue
        if unit is not None and int(entry["unit"]) != int(unit):
            continue
        out.append(entry)
    return out


def load_roster_map(path: str) -> dict:
    if not path or not os.path.exists(path):
        return {"nameToUsername": {}, "exclude": []}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return {"nameToUsername": data.get("nameToUsername") or {}, "exclude": data.get("exclude") or []}


class RosterApi:
    """GET/POST JSON against roster-server with the teacher secret. 20 s timeout, one retry."""

    def __init__(self, base: str, secret: str):
        self.base = base.rstrip("/")
        self.secret = secret

    def _send(self, method: str, path: str, body=None) -> dict:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Content-Type": "application/json", "x-teacher-secret": self.secret}
        last_error = None
        for _attempt in range(2):
            req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=20) as res:
                    return json.loads(res.read().decode("utf-8") or "{}")
            except urllib.error.HTTPError as err:
                if err.code < 500:
                    raise RuntimeError("%s %s -> HTTP %d" % (method, path.split("?")[0], err.code))
                last_error = "HTTP %d" % err.code
            except (urllib.error.URLError, TimeoutError, OSError) as err:
                last_error = type(err).__name__
            time.sleep(1)
        raise RuntimeError("%s %s failed: %s" % (method, path.split("?")[0], last_error))

    def get(self, path: str) -> dict:
        return self._send("GET", path)

    def post(self, path: str, body: dict) -> dict:
        return self._send("POST", path, body)


def fetch_roster(api, section: str) -> list:
    data = api.get("/roster/list?section=" + urllib.parse.quote(section))
    return [s for s in data.get("students", []) if not s.get("archived")]


def fetch_stored(api, section: str, unit: int) -> dict:
    data = api.get("/pc/parts?section=%s&unit=%d" % (urllib.parse.quote(section), unit))
    if not data.get("ok"):
        # Without the stored rows a deadline 0 could land on a real score: abort the entry.
        raise RuntimeError("GET /pc/parts not ok: %s" % data.get("error", "unknown"))
    return {s["username"]: s for s in data.get("students", []) if s.get("username")}


def read_fixture_pages(fixture_dir: str) -> dict:
    pages = {}
    for part in ONLINE_PARTS:
        path = os.path.join(fixture_dir, part + ".txt")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                pages[part] = f.read()
    for part, text in pages.items():
        header = "Date Submitted" if part == "FRQ" else "Points Earned"
        if needs_sign_in("", text, header):
            raise SignInNeeded()
    return pages


def fetch_live_pages(class_id: str, entry: dict, dump_dir=None) -> dict:
    """Read the three AP Classroom tables through the Edge CDP rig."""
    import schoology_ops as ops  # Edge rig; only needed for a live run

    cdp = ops.connect(reuse=True)
    pages = {}
    for part in ONLINE_PARTS:
        assignment = entry["parts"].get(part, {}).get("id")
        if not assignment:
            continue
        tab = "PROGRESS" if part == "FRQ" else "RESULTS_STUDENTS"
        header = "Date Submitted" if part == "FRQ" else "Points Earned"
        ops.navigate(cdp, "%s/%s/assignments/progress/%s?tab=%s" % (AP_BASE, class_id, assignment, tab), wait_ms=3000)
        url, text, previous, settled = "", "", None, False
        deadline = time.time() + 45
        sign_in_since = None
        while time.time() < deadline:
            page = cdp.eval_js("JSON.stringify({url: location.href, text: document.body ? document.body.innerText : ''})")
            info = json.loads(page or "{}")
            url, text = info.get("url", ""), info.get("text", "")
            if page_ready(part, text, header) and text == previous:
                settled = True  # ready on two polls in a row: the table stopped painting
                break
            if needs_sign_in(url, text, header):
                # A live session bounces through the College Board IdP for a few
                # seconds on its way back; only a sign-in page that STAYS counts.
                sign_in_since = sign_in_since or time.time()
                if time.time() - sign_in_since >= SIGN_IN_GRACE_S:
                    raise SignInNeeded()
            else:
                sign_in_since = None
            previous = text
            time.sleep(1)
        if needs_sign_in(url, text, header) or header not in text:
            raise SignInNeeded()
        if not settled:
            raise PageNotReady("%s table never finished loading its scores" % part)
        pages[part] = text
        if dump_dir:
            os.makedirs(dump_dir, exist_ok=True)
            with open(os.path.join(dump_dir, part + ".txt"), "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
    return pages


def open_sign_in_issue() -> None:
    """Open (or comment on) the GitHub issue, deduped by title. Never fails the run."""
    if not shutil.which("gh"):
        return
    body = SIGN_IN_LINE + "\n\nRun on Athena: tools/daily_pc_reconcile.ps1 after signing in."
    try:
        listing = subprocess.run(
            ["gh", "issue", "list", "-R", GH_REPO, "--state", "open", "--search",
             '"%s" in:title' % SIGN_IN_TITLE, "--json", "number,title"],
            capture_output=True, text=True, timeout=60)
        issues = json.loads(listing.stdout or "[]") if listing.returncode == 0 else []
        existing = [i for i in issues if i.get("title") == SIGN_IN_TITLE]
        if existing:
            cmd = ["gh", "issue", "comment", str(existing[0]["number"]), "-R", GH_REPO, "--body", body]
        else:
            cmd = ["gh", "issue", "create", "-R", GH_REPO, "--title", SIGN_IN_TITLE, "--body", body]
        subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except Exception:
        print("PC reconcile issue alert skipped")


# --------------------------------------------------------------------------- #
# Run                                                                          #
# --------------------------------------------------------------------------- #

class Reporter:
    """stdout + the log file. Private lines (real names) reach stdout only with --names."""

    def __init__(self, log_path=None, names=False):
        self.log_path = log_path
        self.names = names
        if log_path:
            os.makedirs(os.path.dirname(log_path) or ".", exist_ok=True)

    def _log(self, line: str) -> None:
        if not self.log_path:
            return
        with open(self.log_path, "a", encoding="utf-8", newline="\n") as f:
            f.write(line + "\n")

    def out(self, line: str) -> None:
        print(line)
        self._log(line)

    def private(self, line: str) -> None:
        if self.names:
            print(line)
        self._log(line)


def write_reminder_drafts(entry: dict, pages: dict, plan: dict, today: str, drafts_dir: str, rep: Reporter) -> None:
    """Section 4b: write the PRIVATE draft file and add `reminders` to the snapshot.

    Sending is a human step (the teacher approves each message); nothing here sends."""
    drafted_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    drafts = build_reminder_drafts(entry, pages, plan["reminders"], drafted_at)
    os.makedirs(drafts_dir, exist_ok=True)
    path = os.path.join(drafts_dir, "reminders-%s-U%d-%s.json" % (entry["section"], int(entry["unit"]), today))
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(drafts, f, indent=2)
        f.write("\n")
    plan["snapshot"]["reminders"] = {"draftedAt": drafted_at, "count": len(drafts["students"]), "sent": False}
    rep.out("  REMINDER DRAFTS %d written to %s (not sent: the teacher approves each one)" % (len(drafts["students"]), path))


def previous_unsent_reminders(api, section: str, unit: int):
    """The stored snapshot's reminders block when it is still unsent, else None."""
    try:
        data = api.get("/pc/status?section=%s&unit=%d" % (urllib.parse.quote(section), unit))
    except RuntimeError:
        return None
    reminders = ((data or {}).get("status") or {}).get("reminders")
    if isinstance(reminders, dict) and reminders.get("sent") is False:
        return reminders
    return None


def run_entry(entry: dict, pages: dict, api, roster_map: dict, today: str, apply: bool, rep: Reporter,
              remind: bool = False, drafts_dir: str = DEFAULT_LOG_DIR) -> bool:
    """Plan (and with apply, post) one registry entry. Returns False on a post failure."""
    section = entry["section"]
    unit = int(entry["unit"])
    students = fetch_roster(api, section)
    stored = fetch_stored(api, section, unit)
    plan = build_plan(entry, pages, students, stored, roster_map, today)
    if remind or should_remind(today, entry["dueDate"]):
        write_reminder_drafts(entry, pages, plan, today, drafts_dir, rep)

    rep.out("== %s U%d (close %s, today %s) %s ==" % (section, unit, entry["closeDate"], today, "APPLY" if apply else "DRY RUN"))
    for post in plan["posts"]:
        tag = "ZERO" if post.get("zero") else "POST"
        rep.out("  %s %-18s %s %s/%s" % (tag, post["username"], post["part"], post["points"], post["of"]))
    for username in plan["would_lower"]:
        rep.out("  WOULD LOWER %s (AP Classroom score below the posted one: teacher decides)" % username)
    for drop in plan["drops"]:
        rep.out("  PC %% DROPS %-18s %s -> %s" % (drop["username"], drop["from"], drop["to"]))
    for username in plan["needs_scoring"]:
        rep.out("  NEEDS SCORING %s FRQ" % username)
    for name in plan["unmatched_names"]:
        rep.private("  UNMATCHED %s" % name)

    ok = True
    posted = 0
    if apply:
        for post in plan["posts"]:
            body = {"studentUsername": post["username"], "unit": unit, "part": post["part"],
                    "points": post["points"], "of": post["of"], "origin": "apclassroom"}
            if post.get("note"):
                body["note"] = post["note"]
            try:
                api.post("/pc/grade", body)
                posted += 1
            except RuntimeError as err:
                ok = False
                rep.out("  FAILED %s %s: %s" % (post["username"], post["part"], err))
        # Keep unsent reminder drafts visible: a normal run must not wipe them.
        if "reminders" not in plan["snapshot"]:
            previous = previous_unsent_reminders(api, section, unit)
            if previous:
                plan["snapshot"]["reminders"] = previous
        try:
            api.post("/pc/status", {"section": section, "unit": unit, "payload": plan["snapshot"]})
        except RuntimeError as err:
            rep.out("  snapshot not stored: %s" % err)
            if "HTTP 503" not in str(err):
                ok = False  # only the missing table (migration 0043 not run yet) is tolerated

    rep.out("  posted %d / planned %d | skipped-same %d | would-lower %d | zeroed %d | unmatched %d | excluded %d | needs-scoring %d"
            % (posted, len(plan["posts"]), plan["skipped_same"], len(plan["would_lower"]), plan["zeroed"],
               len(plan["unmatched_names"]), plan["excluded"], len(plan["needs_scoring"])))
    return ok


def main(argv=None, api=None) -> int:
    ap = argparse.ArgumentParser(description="AP Classroom -> roster Progress Check reconcile (dry run by default).")
    ap.add_argument("--section", required=True)
    ap.add_argument("--unit", type=int, default=None)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--fixture", default=None, help="dir with B.txt, C.txt, FRQ.txt instead of AP Classroom")
    ap.add_argument("--dump", default=None, help="save the AP Classroom page texts here")
    ap.add_argument("--registry", default=DEFAULT_REGISTRY)
    ap.add_argument("--roster-map", default=DEFAULT_ROSTER_MAP)
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--today", default=None, help="YYYY-MM-DD (default: today, school time)")
    ap.add_argument("--log", default=None)
    ap.add_argument("--names", action="store_true", help="also print unmatched real names to stdout")
    ap.add_argument("--remind", action="store_true", help="write the reminder drafts now (default: the day before the due date)")
    args = ap.parse_args(argv)

    rep = Reporter(args.log, args.names)
    if api is None:
        secret = os.environ.get("ROSTER_TEACHER_SECRET", "")
        if not secret:
            rep.out("ERROR: ROSTER_TEACHER_SECRET is not set in the environment.")
            return 1
        api = RosterApi(args.base, secret)

    registry = load_registry(args.registry)
    entries = active_entries(registry, args.section, args.unit)
    if not entries:
        rep.out("No active Progress Check for %s in the registry." % args.section)
        return 0
    roster_map = load_roster_map(args.roster_map)
    today = args.today or today_school_date()

    # Read and validate EVERY entry's pages before writing anything: a sign-in
    # failure on a later entry must not leave an earlier one half applied.
    pages_by_entry = []
    for entry in entries:
        try:
            if args.fixture:
                pages_by_entry.append(read_fixture_pages(args.fixture))
            else:
                pages_by_entry.append(fetch_live_pages(registry.get("classId", ""), entry, args.dump))
        except SignInNeeded:
            rep.out(SIGN_IN_LINE)
            if args.apply:
                open_sign_in_issue()
            return 2
        except PageNotReady as err:
            rep.out("PAGE NOT READY: %s; nothing posted" % err)
            return 1

    ok = True
    for entry, pages in zip(entries, pages_by_entry):
        try:
            drafts_dir = os.path.dirname(args.log) if args.log else DEFAULT_LOG_DIR
            ok = run_entry(entry, pages, api, roster_map, today, args.apply, rep, args.remind, drafts_dir) and ok
        except RuntimeError as err:
            rep.out("ERROR: %s" % err)
            ok = False
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
