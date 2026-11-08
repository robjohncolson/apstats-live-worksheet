"""schoology_move_columns.py -- ONE-TIME move of the after-the-line Schoology columns from
Marking Period 1 to Marking Period 2 (QUARTER_LINE_BY_DUE_DATE_SPEC.md section 4.3).

Why: the sync picks a column's marking period once, when it creates the column, and every
column created before 2026-11-08 was filed by its class day, so all of them sit in MP1. Under
the teacher's rule of 2026-11-07 a lesson counts in the quarter its ZERO date falls in, so B
4.2 onward and E 2.3 onward are Quarter 2 lessons: their 26 existing columns (B 12, E 14)
move to MP2 with their grades, titles and due dates. B's '2.3 Follow-Along' / '2.3 Blooket'
(decided by 4.1, a Quarter 1 lesson) stay in MP1 (decision 2). The plan is the sync's own
filing rule (schoology_components.component_columns filing_date), so after the move every
existing column sits where the daily quarter passes look for it.

    python tools/schoology_move_columns.py                                      # dry run, both sections
    python tools/schoology_move_columns.py --section PeriodB                     # dry run, one section
    python tools/schoology_move_columns.py --section PeriodB --inspect "2.4 Quiz"
    python tools/schoology_move_columns.py --section PeriodB --apply --one "2.4 Quiz"
    python tools/schoology_move_columns.py --section PeriodB --apply             # the rest
    python tools/schoology_move_columns.py --section PeriodB --stamp             # record only, moves nothing

MARKING-PERIOD EVIDENCE (finding R4c, Codex re-review 2026-11-08). The daily sync checks every
gradebook view against the grading_period_id each column's row carries in
tools/.schoology-sync-state.json, and once ANY column of a section carries one it aborts a pass
(exit 3) while a registered due column carries none. On 2026-11-08 none of the 226 rows does.
This tool records them:
  - --apply, at the end of a successful run (and at a clean 16:00 stop), stamps EVERY
    registered column of the section with the marking period the verified views show it in:
    the moved ones MP2, the rest MP1 (MP2 when that view shows them). A column in neither
    view stays unstamped and is named ([WARN]); the sync then aborts until it is resolved.
  - --stamp moves nothing and submits no form (read-only on Schoology): it reads both verified
    views and stamps every registered column by where it is visible. It refuses (exit 1,
    nothing stamped) when a title shows in both views or in neither.
  Each stamp also records the column title the view shows (17 rows per section still carry
  their pre-rename title). Stamps are saved through the same re-read-first path as the moves.
  Run --stamp (or the move) for BOTH sections before Monday 11/09 16:30: the first column the
  sync creates in MP2 is evidence, and from then on an unstamped section aborts every pass.

THE RIG IS SHARED. The LIVE tasks ApStatsSchoologySync-B (16:30) and -E (16:45) drive the
same Edge window (daily_schoology_sync.ps1). So:
  - The tool holds the rig lock (tools/.schoology-sync-logs/rig.lock, schoology_sync_lib
    acquire_rig_lock) from before it connects to Edge until it exits. A daily job that
    starts meanwhile waits for it; the tool refuses to start while another run holds it.
  - It refuses to START from 16:00 to 17:05, in every mode (each one drives Edge), and an
    --apply run checks the clock again before EACH move: once it is 16:00 it stops before
    the next move (exit 3); the moves already made stay made and recorded. Re-run after 17:05.
  - --apply first copies tools/.schoology-sync-state.json to
    tools/.schoology-sync-logs/state-before-move-<stamp>.json (gitignored: the file holds
    student ids and last-synced grades, and this repo publishes to GH Pages). Restore from
    that copy only if a move went wrong.

RUN ORDER on the rig (the orchestrator; Sunday after the deploy; before 16:00 or after 17:05):
  1. dry run: READ-ONLY. Switches the gradebook view to MP1, then MP2 (a filter, not a write),
     reads titles + filled cells, looks up node ids in Materials. Prints every planned move:
     section, title, state key, node id, current MP -> target MP, filled cells in MP1.
     Expect B 12 and E 14 moves; B's 2.3 Follow-Along / 2.3 Blooket EXCLUDED.
  2. --inspect "<title>": opens that assignment's edit form (/assignment/edit/{course}/{nid}/basic,
     the rename tool's verified URL) and prints the form's field names and the Grading Period
     options. NOTHING is submitted. Confirms the period field (default grading_period_id;
     --period-field NAME if the form names it differently; --edit-url TEMPLATE if the period
     is on another edit page, e.g. "{base}/assignment/edit/{course}/{nid}").
  3. --apply --one "<title>": moves exactly that column. The edit form must show the title and
     both due-date fields (else it refuses: run --inspect); after the submit the tool reopens
     the form and the title and due date must read exactly as before. Then it reads the
     gradebook back: the column must be in the MP2 view with the same title and the same
     filled-cell count it had in MP1, and gone from the MP1 view.
  4. --apply: the rest, one at a time, each read back in MP2; the first mismatch stops the run.
     (Refused until a --one move of that section has succeeded.) Then every registered column
     of the section is stamped (MARKING-PERIOD EVIDENCE above).
  5. CMD 5 readback (titles + filled cells per MP).
  If the move cannot run before Monday 16:30: --stamp both sections instead (any time outside
  16:00-17:05); the move later re-stamps what it moves.
Each verified move records the new MP id in tools/.schoology-sync-state.json
(grading_period_id, moved_from, moved_at), re-reading the file just before the write so a
copy loaded at the start never overwrites a newer save. Never changes a title or a due date
(decision 4). Never deletes or re-creates a column (that would empty the cells and wipe hand
entries).

Exit codes: 0 done (or dry run), 1 a move stopped or --stamp refused (see the [STOP] line),
2 refused at start (flags, 16:00-17:05, rig busy, no state file), 3 stopped between moves at
16:00.

ASCII only. LF line endings.
"""
from __future__ import annotations

import sys
try:
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

import argparse
import json
import os
import shutil
import time
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import schoology_sync_lib as lib  # noqa: E402

SECTIONS = {
    "PeriodB": "8537033028",
    "PeriodE": "8537033042",
}

FROM_QUARTER = "Q1"
TO_QUARTER = "Q2"

# Decision 2 (teacher 2026-11-07): B's straddling 4.1-2 worksheet + deck stay in MP1. The
# filing rule already keeps them there (4.1 decides the group); this list makes it explicit.
EXCLUDED = {
    "PeriodB": {
        "FA:4.1-2": "decision 2: B's 2.3 Follow-Along stays in Marking Period 1 (4.1 decides it)",
        "BL:4.1-2": "decision 2: B's 2.3 Blooket stays in Marking Period 1 (4.1 decides it)",
    },
}

# The LIVE sync tasks drive the same Edge window. Finding B1 (2026-11-08): a long --apply
# started at 16:20 was still moving at 16:30, so nothing starts or continues from 16:00.
SYNC_WINDOW = ("16:00", "17:05")
LIVE_TASKS = lib.RIG_LIVE_TASKS
# The shared rig lock (schoology_sync_lib), held for the whole run.
RIG_LOCK_PATH = lib.RIG_LOCK_PATH
RIG_LOCK_OWNER = "move-columns"
# Where --apply backs up the sync's state file (gitignored: it holds student ids).
BACKUP_DIR = os.path.join(SCRIPT_DIR, ".schoology-sync-logs")
# Exit code when the 16:00 line stops an --apply run between two moves.
SYNC_WINDOW_EXIT = 3

# Printed when a move was submitted but not proven: its state row keeps the marking period it
# had, which may now be wrong, and the sync's evidence check refuses a view that disagrees.
UNKNOWN_AFTER_SUBMIT = ("Its state row still records the marking period it had: check the column "
                        "by hand in Schoology, then re-run --stamp before the next sync.")

DEFAULT_PERIOD_FIELD = "grading_period_id"
# The rename tool's live-verified edit form (2026-10-13; only its title field was checked).
# --edit-url overrides it if --inspect shows the Grading Period on another edit page.
DEFAULT_EDIT_URL = "{base}/assignment/edit/{course}/{nid}/basic"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _hhmm_now() -> str:
    """The rig's local clock, 'HH:MM' (the LIVE tasks run on the same clock)."""
    return datetime.now().strftime("%H:%M")


def in_sync_window(hhmm: str) -> bool:
    """True from 16:00 to 17:05 (local, the rig's clock): no move starts or continues."""
    return SYNC_WINDOW[0] <= hhmm < SYNC_WINDOW[1]


def sync_window_message(hhmm: str) -> str:
    return (f"it is {hhmm}: from {SYNC_WINDOW[0]} to {SYNC_WINDOW[1]} the rig belongs to the LIVE "
            f"sync tasks ({LIVE_TASKS})")


# ---------------------------------------------------------------------------
# Pure planning (unit-tested)
# ---------------------------------------------------------------------------

def filled_counts(gradebook: dict) -> dict:
    """{column title: filled cells} from schoology_official.read_gradebook's rows.

    A title in the result is a column in that view; 0 = present but empty.
    """
    counts: dict = {}
    for row in (gradebook or {}).values():
        for title, value in ((row or {}).get("cells") or {}).items():
            counts.setdefault(title, 0)
            if value is not None:
                counts[title] += 1
    return counts


def plan_moves(section: str, items: list[dict], registered: dict, mps: dict,
               mp1_counts: dict, mp2_counts: dict) -> dict:
    """Decide what moves, from the sync's filing rule, its state and the two gradebook views.

    items:       the section's component scope (each with key, title, filing_date)
    registered:  {key: state row} for the columns the sync created
    mps:         the course's marking periods
    mp1_counts / mp2_counts: {title: filled cells} read in the verified MP1 / MP2 views
    Returns {'moves', 'done', 'excluded', 'missing', 'conflicts', 'source_mp', 'target_mp'}.
    A column moves only when the rule files it in MP2, the sync registered it, and the MP1
    view (not the MP2 view) shows it.
    """
    source_mp = lib.marking_period_for_quarter(FROM_QUARTER, mps)
    target_mp = lib.marking_period_for_quarter(TO_QUARTER, mps)
    plan = {"moves": [], "done": [], "excluded": [], "missing": [], "conflicts": [],
            "source_mp": source_mp, "target_mp": target_mp}
    excluded = EXCLUDED.get(section, {})
    for item in sorted(items, key=lambda i: (i.get("due_date") or "", i["key"])):
        key, title = item["key"], item["title"]
        if key not in registered:
            continue  # never created: the sync files it in the right MP when it is due
        entry = {"section": section, "key": key, "title": title,
                 "filing_date": item.get("filing_date"), "due_date": item.get("due_date"),
                 "from_mp": source_mp, "to_mp": target_mp,
                 "filled": mp1_counts.get(title)}
        if key in excluded:
            plan["excluded"].append(dict(entry, reason=excluded[key]))
            continue
        filed = lib.marking_period_for_date(item.get("filing_date") or item.get("due_date"), mps)
        if str(filed) != str(target_mp):
            continue  # filed in MP1 (or later than MP2): not part of this move
        in_mp1, in_mp2 = title in mp1_counts, title in mp2_counts
        if in_mp1 and in_mp2:
            plan["conflicts"].append(dict(entry, reason="both marking periods show this title"))
        elif in_mp1:
            plan["moves"].append(entry)
        elif in_mp2:
            plan["done"].append(dict(entry, filled=mp2_counts.get(title)))
        else:
            plan["missing"].append(entry)
    return plan


def check_readback(title: str, filled_before: int, mp2_counts: dict) -> str | None:
    """None when the moved column is in the MP2 view with the same filled cells, else why not."""
    if title not in mp2_counts:
        return f"{title!r} is not in the Marking Period 2 view after the move"
    if mp2_counts[title] != filled_before:
        return (f"{title!r} shows {mp2_counts[title]} filled cells in Marking Period 2; it had "
                f"{filled_before} in Marking Period 1 before the move")
    return None


def leftovers_in_mp1(moved_titles: list[str], mp1_counts: dict) -> list[str]:
    """Moved titles the MP1 view still shows (a move that did not take)."""
    return [t for t in moved_titles if t in mp1_counts]


def stamp_plan(items: list[dict], registered: dict, mp1_counts: dict, mp2_counts: dict,
               source_mp: str, target_mp: str) -> dict:
    """Where every registered column of the section sits, from the two verified views.

    Finding R4c (Codex re-review): the sync checks every view against these stamps.
    Returns {'stamps': {key: mp id}, 'titles': {key: title}, 'both': [titles], 'neither': [titles]}.
    A title in one view is stamped with that view's marking period; a title in both or in
    neither is not stamped (where the column is would be a guess).
    """
    plan = {"stamps": {}, "titles": {}, "both": [], "neither": []}
    for item in items:
        key, title = item["key"], item["title"]
        if key not in registered:
            continue   # never created: the sync stamps it when it creates it
        in_mp1, in_mp2 = title in mp1_counts, title in mp2_counts
        if in_mp1 and in_mp2:
            plan["both"].append(title)
            continue
        if not in_mp1 and not in_mp2:
            plan["neither"].append(title)
            continue
        plan["stamps"][key] = str(source_mp) if in_mp1 else str(target_mp)
        plan["titles"][key] = title
    return plan


def save_stamps(state, section: str, plan: dict) -> int:
    """Write a stamp_plan's stamps into the sync's state rows. Returns how many.

    Re-reads the state file first (the record_move path, finding B1): another run's save
    since this one loaded the file survives. Each row keeps its other fields (assignment
    id, moved_from, ...); the title is the one the view shows (a row can still carry its
    pre-rename title, which schoology_official reads).
    """
    state.reload()
    for key, period in plan["stamps"].items():
        state.upsert_assignment(section, key, {"grading_period_id": period, "title": plan["titles"][key]})
    return len(plan["stamps"])


def format_plan(plan: dict, node_ids: dict | None = None) -> list[str]:
    """Human-readable plan lines (ASCII)."""
    node_ids = node_ids or {}
    lines = []
    head = (f"{len(plan['moves'])} to move (MP {plan['source_mp']} -> MP {plan['target_mp']}), "
            f"{len(plan['done'])} already in MP2, {len(plan['excluded'])} excluded, "
            f"{len(plan['missing'])} not found, {len(plan['conflicts'])} conflicts")
    lines.append(head)
    for m in plan["moves"]:
        lines.append(f"  MOVE      {m['section']} {m['title']!r} key={m['key']} "
                     f"nid={node_ids.get(m['title'], '?')} MP {m['from_mp']} -> MP {m['to_mp']} "
                     f"filled={m['filled']} (0 lands {m['filing_date']}, due {m['due_date']})")
    for m in plan["done"]:
        lines.append(f"  DONE      {m['section']} {m['title']!r} key={m['key']} already in MP {m['to_mp']} "
                     f"filled={m['filled']}")
    for m in plan["excluded"]:
        lines.append(f"  EXCLUDED  {m['section']} {m['title']!r} key={m['key']}: {m['reason']}")
    for m in plan["missing"]:
        lines.append(f"  MISSING   {m['section']} {m['title']!r} key={m['key']}: in neither view")
    for m in plan["conflicts"]:
        lines.append(f"  CONFLICT  {m['section']} {m['title']!r} key={m['key']}: {m['reason']}")
    return lines


# ---------------------------------------------------------------------------
# Live CDP
# ---------------------------------------------------------------------------

# Every named field of the assignment edit form. Hidden values (form tokens) are never read
# out; long text is cut. Read-only.
_READ_FORM_JS = r"""(function(){
  var title = document.querySelector('form input[name="title"]');
  var form = title ? title.form : null;
  if (!form) return null;
  var out = [];
  [].forEach.call(form.elements, function (el) {
    if (!el.name) return;
    var item = {name: el.name, tag: el.tagName.toLowerCase(), type: el.type || null};
    if (el.tagName === 'SELECT') {
      item.value = el.value;
      item.options = [].map.call(el.options, function (o) {
        return {value: o.value, text: (o.textContent || '').trim(), selected: !!o.selected};
      });
    } else if (el.type === 'hidden') {
      item.value = '(hidden)';
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      item.value = el.value;
      item.checked = !!el.checked;
    } else {
      item.value = String(el.value || '').slice(0, 80);
    }
    out.push(item);
  });
  return JSON.stringify(out);
})()"""

_FORM_VALUES_JS = r"""(function(names){
  var out = {};
  names.forEach(function (name) {
    var el = document.querySelector('form [name="' + name + '"]');
    out[name] = el ? String(el.value) : null;
  });
  return JSON.stringify(out);
})(%s)"""

_SET_SELECT_JS = r"""(function(name, value){
  var el = document.querySelector('form select[name="' + name + '"]');
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(new Event('change', {bubbles: true}));
  return true;
})(%s, %s)"""

_SUBMIT_JS = ("(function(){var el=document.querySelector('input#edit-submit');"
              "if(!el)return false;el.click();return true;})()")

_ERROR_TEXT_JS = ("(function(){var el=document.querySelector('.messages.error, .error-messages, "
                  ".form-item--error-message');return el ? el.textContent.trim() : null;})()")

# The fields a period change must never touch (decision 4: the class day stays the due date).
KEPT_FIELDS = ("title", "due_date[date]", "due_date[time]")


_TITLE_VALUE_JS = ("(function(){var el=document.querySelector('form input[name=\"title\"]');"
                   "return el ? String(el.value) : null;})()")


def open_edit_form(ops, cdp, course_id: str, nid: str, title: str,
                   template: str = DEFAULT_EDIT_URL) -> str | None:
    """Open the assignment's edit form; the URL when its title field holds this title, else None."""
    url = template.format(base=ops.SCHOOLOGY_BASE, course=course_id, nid=nid)
    cdp.attach_url(url, wait_ms=3000)
    if cdp.eval_js(_TITLE_VALUE_JS) != title:
        return None
    return url


def read_form(cdp) -> list | None:
    raw = cdp.eval_js(_READ_FORM_JS)
    try:
        fields = json.loads(raw) if isinstance(raw, str) else None
    except ValueError:
        return None
    return fields if isinstance(fields, list) else None


def form_values(cdp, names) -> dict:
    raw = cdp.eval_js(_FORM_VALUES_JS % json.dumps(list(names)))
    try:
        values = json.loads(raw) if isinstance(raw, str) else {}
    except ValueError:
        values = {}
    return values if isinstance(values, dict) else {}


def missing_kept_fields(before: dict) -> list:
    """The KEPT_FIELDS the edit form does not have (form_values reads a missing one as None)."""
    return [name for name in KEPT_FIELDS if before.get(name) is None]


def missing_fields_error(cdp, missing: list) -> str:
    """Finding B5: without these fields the never-change check would compare None with None
    after the change and pass without checking anything. Name the form's fields instead."""
    names = [f.get("name") for f in (read_form(cdp) or [])]
    return (f"the edit form has no {missing} field(s), so the tool cannot prove the title and due "
            f"date stay unchanged; the form's fields are {names}. Run --inspect, then pass "
            "--period-field / --edit-url if the Grading Period sits on another form. "
            "Nothing was submitted.")


def check_saved_form(ops, cdp, course_id: str, nid: str, title: str, before: dict,
                     target_mp: str, period_field: str, edit_url: str) -> dict:
    """Reopen the edit form after the submit and prove what was saved. Returns {'ok', 'error'}.

    Finding B5: nothing read the due date back, so a save that clamped the class-day due
    date into Marking Period 2 would still have reported OK. The title and both due-date
    fields must read exactly as before the change, and the period must be the target.
    """
    if open_edit_form(ops, cdp, course_id, nid, title, edit_url) is None:
        return {"ok": False, "error": f"after the submit the edit form of nid {nid} no longer shows "
                                      f"the title {title!r}; check this column by hand"}
    saved = form_values(cdp, KEPT_FIELDS + (period_field,))
    for name in KEPT_FIELDS:
        if saved.get(name) != before.get(name):
            return {"ok": False, "error": f"after the submit {name!r} reads {saved.get(name)!r}; it was "
                                          f"{before.get(name)!r}. Check this column by hand"}
    if saved.get(period_field) != str(target_mp):
        return {"ok": False, "error": f"after the submit {period_field!r} reads "
                                      f"{saved.get(period_field)!r}, not {str(target_mp)!r}"}
    return {"ok": True, "error": None}


def move_column(ops, cdp, course_id: str, nid: str, title: str, target_mp: str,
                period_field: str = DEFAULT_PERIOD_FIELD, edit_url: str = DEFAULT_EDIT_URL) -> dict:
    """Change ONE assignment's grading period through its edit form. Returns {'ok', 'error'}.

    Edits only a form whose title field holds this title (the rename tool's fail-closed
    check). Refuses when the period field, a title / due-date field or the target option is
    missing, and when setting the period changed the title or the due date. Submits once
    (JS click, like the rename), then reopens the form and checks what was saved.
    """
    url = open_edit_form(ops, cdp, course_id, nid, title, edit_url)
    if url is None:
        return {"ok": False, "error": f"edit form not found for {title!r} (nid {nid})"}
    names = KEPT_FIELDS + (period_field,)
    before = form_values(cdp, names)
    if before.get(period_field) is None:
        return {"ok": False, "error": f"the edit form has no {period_field!r} field (run --inspect)"}
    missing = missing_kept_fields(before)
    if missing:
        return {"ok": False, "error": missing_fields_error(cdp, missing)}
    fields = {f["name"]: f for f in (read_form(cdp) or [])}
    options = [o.get("value") for o in (fields.get(period_field) or {}).get("options") or []]
    if str(target_mp) not in options:
        return {"ok": False, "error": f"{period_field!r} has no option {target_mp!r} (options {options})"}
    if before.get(period_field) == str(target_mp):
        return {"ok": False, "error": f"{title!r} is already in marking period {target_mp} in its form"}
    if not cdp.eval_js(_SET_SELECT_JS % (json.dumps(period_field), json.dumps(str(target_mp)))):
        return {"ok": False, "error": f"could not set {period_field!r}"}
    time.sleep(0.5)
    after = form_values(cdp, names)
    if after.get(period_field) != str(target_mp):
        return {"ok": False, "error": f"{period_field!r} rejected {target_mp!r} (reads {after.get(period_field)!r})"}
    for name in KEPT_FIELDS:
        if after.get(name) != before.get(name):
            return {"ok": False, "error": f"setting the period changed {name!r} "
                                          f"({before.get(name)!r} -> {after.get(name)!r}); not submitted"}
    if not cdp.eval_js(_SUBMIT_JS):
        return {"ok": False, "error": "submit button input#edit-submit not found"}
    time.sleep(3.0)
    error_text = cdp.eval_js(_ERROR_TEXT_JS)
    if error_text:
        return {"ok": False, "error": f"Schoology rejected the edit: {error_text}"}
    return check_saved_form(ops, cdp, course_id, nid, title, before, target_mp, period_field, edit_url)


def read_counts(ops, cdp, course_id: str, view: dict) -> dict:
    """{title: filled cells} in one VERIFIED marking-period view (raises lib.ViewNotVerified)."""
    import schoology_official as official
    return filled_counts(official.read_gradebook(ops, cdp, course_id, view))


def node_ids_for(ops, cdp, course_id: str, titles) -> tuple[dict, dict]:
    """({title: nid}, {title: reason}) from Materials (root + Assignments folder), exact titles."""
    import schoology_rename_columns as rename
    assignments = rename.list_course_assignments(ops, cdp, course_id)
    found, problems = {}, {}
    for title in titles:
        nid, reason = rename.node_id_for_title(assignments, title)
        if nid is None:
            problems[title] = reason
        else:
            found[title] = nid
    return found, problems


def inspect_column(ops, cdp, course_id: str, title: str, period_field: str = DEFAULT_PERIOD_FIELD,
                   edit_url: str = DEFAULT_EDIT_URL) -> int:
    """Open one assignment's edit form and print its fields. NOTHING is submitted."""
    found, problems = node_ids_for(ops, cdp, course_id, [title])
    if title not in found:
        print(f"[STOP] {problems.get(title)}")
        return 1
    nid = found[title]
    url = open_edit_form(ops, cdp, course_id, nid, title, edit_url)
    if url is None:
        print(f"[STOP] no edit form with the title {title!r} at "
              f"{edit_url.format(base=ops.SCHOOLOGY_BASE, course=course_id, nid=nid)}")
        return 1
    fields = read_form(cdp) or []
    print(f"[inspect] {title!r} nid={nid} form={url}")
    print(json.dumps(fields, indent=1))
    period = next((f for f in fields if f.get("name") == period_field), None)
    if period is None:
        print(f"[inspect] the form has NO {period_field!r} field; pass --period-field <name> to the move")
    else:
        print(f"[inspect] {period_field} = {period.get('value')!r}; options:")
        for o in period.get("options") or []:
            print(f"    {o.get('value')!r}: {o.get('text')!r}{'  (selected)' if o.get('selected') else ''}")
    print("[inspect] NOTHING was submitted.")
    return 0


def section_items(section: str, ced: bool) -> list[dict]:
    """The section's component columns, exactly as the daily sync builds them."""
    import schoology_sync_section as sync
    return sync.build_component_scope(sync.load_schedule(), section, ced=ced)


def backup_state_file(state_path: str, backup_dir: str, stamp: str) -> str | None:
    """Copy the sync's state file to <backup_dir>/state-before-move-<stamp>.json.

    Finding B6: --apply rewrites state rows, so a copy is taken before the first move. It
    goes to tools/.schoology-sync-logs/ (gitignored), never next to the state file: the file
    holds student ids and last-synced grades, and this repo publishes to GH Pages.
    Returns the copy's path, or None when there is no state file.
    """
    if not os.path.exists(state_path):
        return None
    os.makedirs(backup_dir, exist_ok=True)
    target = os.path.join(backup_dir, f"state-before-move-{stamp}.json")
    shutil.copy2(state_path, target)
    return target


def record_move(state, section: str, key: str, target_id: str, source_id: str) -> None:
    """Write one verified move into the sync's state row.

    Finding B1: re-read the state file first. Every save writes the whole in-memory copy,
    and another run may have saved the file since this one loaded it; writing the copy
    from the start would drop its new assignment ids, last_synced values and comment notes.
    """
    state.reload()
    state.upsert_assignment(section, key, {"grading_period_id": target_id,
                                           "moved_from": source_id,
                                           "moved_at": _now()})


def read_views(ops, cdp, section: str, course_id: str, *, items: list[dict], state) -> dict:
    """The section's two VERIFIED gradebook views, read-only.

    Returns {'failed', 'mps', 'source', 'target', 'registered', 'mp1', 'mp2'}: failed is
    None, or 'auth' / 'marking-periods' / 'view-not-verified' (the [STOP] line printed).
    registered: {key: state row} for the scope columns the sync created.
    """
    ops.navigate(cdp, ops.gradebook_url(course_id))
    ops.inject_helpers(cdp)
    if ops.detect_login_state(cdp) != "authenticated":
        print("[AUTH] Not signed into Schoology in the Edge window -- sign in, then re-run.")
        return {"failed": "auth"}

    mps = ops.list_marking_periods(cdp, course_id)
    source = lib.pass_view(FROM_QUARTER, mps)
    target = lib.pass_view(TO_QUARTER, mps)
    if source is None or target is None:
        print(f"[STOP] {section}: the course has no MP1/MP2 ({len(mps or {})} marking periods read)")
        return {"failed": "marking-periods"}

    registered = {}
    for item in items:
        row = state.get_assignment(section, item["key"])
        if row and row.get("schoology_assignment_id"):
            registered[item["key"]] = row
    try:
        mp1 = read_counts(ops, cdp, course_id, source)
        mp2 = read_counts(ops, cdp, course_id, target)
    except lib.ViewNotVerified as exc:
        print(f"[STOP] {section}: {exc}; nothing changed")
        return {"failed": "view-not-verified"}
    return {"failed": None, "mps": mps, "source": source, "target": target,
            "registered": registered, "mp1": mp1, "mp2": mp2}


def stamp_after_moves(state, section: str, items: list[dict], registered: dict, mp1_counts: dict,
                      mp2_counts: dict, source: dict, target: dict) -> int:
    """Finding R4c: once the moves are verified, stamp EVERY registered column where the
    views show it (the moved ones are in MP2). A column in both views or in neither is
    named and left unstamped: the sync then refuses its section until it is resolved and
    --stamp records it. Returns how many were stamped."""
    plan = stamp_plan(items, registered, mp1_counts, mp2_counts,
                      source["grading_period_id"], target["grading_period_id"])
    count = save_stamps(state, section, plan)
    print(f"  [STAMP]  {section}: recorded the marking period of {count} column(s)")
    if plan["both"]:
        print(f"  [WARN]   not stamped, in BOTH views: {plan['both']}")
    if plan["neither"]:
        print(f"  [WARN]   not stamped, in NEITHER view: {plan['neither']} -- the sync aborts "
              f"{section}'s passes until they are found; then run --stamp")
    return count


def stamp_section(ops, cdp, section: str, course_id: str, *, items: list[dict], state) -> dict:
    """--stamp: read both verified views and stamp every registered column where it is
    visible. Moves nothing and submits no form. Returns {'stamped', 'failed'}.

    Refuses (failed 'ambiguous', nothing stamped) when a title shows in both views or in
    neither: a guessed stamp would make the sync's evidence check lie (finding R4c).
    """
    views = read_views(ops, cdp, section, course_id, items=items, state=state)
    if views["failed"]:
        return {"stamped": 0, "failed": views["failed"]}
    plan = stamp_plan(items, views["registered"], views["mp1"], views["mp2"],
                      views["source"]["grading_period_id"], views["target"]["grading_period_id"])
    in_mp1 = sum(1 for period in plan["stamps"].values() if period == views["source"]["grading_period_id"])
    print(f"== {section}")
    print(f"  {len(views['registered'])} registered columns: {in_mp1} in MP "
          f"{views['source']['grading_period_id']}, {len(plan['stamps']) - in_mp1} in MP "
          f"{views['target']['grading_period_id']}, {len(plan['both'])} in both views, "
          f"{len(plan['neither'])} in neither")
    for title in plan["both"]:
        print(f"  BOTH      {section} {title!r}: shown in both marking periods")
    for title in plan["neither"]:
        print(f"  NEITHER   {section} {title!r}: shown in neither marking period")
    if plan["both"] or plan["neither"]:
        print(f"  [STOP] {section}: where a column sits would be a guess; NOTHING was stamped. "
              "Resolve it by hand in Schoology, then re-run --stamp.")
        return {"stamped": 0, "failed": "ambiguous"}
    count = save_stamps(state, section, plan)
    print(f"  [DONE] {section}: recorded the marking period of {count} column(s); nothing moved, "
          "no form submitted")
    return {"stamped": count, "failed": None}


def run_section(ops, cdp, section: str, course_id: str, *, items: list[dict], state,
                apply: bool, one: str | None, period_field: str = DEFAULT_PERIOD_FIELD,
                edit_url: str = DEFAULT_EDIT_URL, clock=None) -> dict:
    """Plan (and with apply, perform) one section's move. Returns {'plan', 'moved', 'failed'}.

    failed 'sync-window': it turned 16:00 before the next move (finding B1); the moves
    already made are recorded and the rest wait for a run after 17:05.
    A successful --apply run (and a clean 16:00 stop) ends by stamping every registered
    column of the section (stamp_after_moves, finding R4c).
    """
    clock = clock or _hhmm_now
    views = read_views(ops, cdp, section, course_id, items=items, state=state)
    if views["failed"]:
        return {"plan": None, "moved": 0, "failed": views["failed"]}
    source, target, registered = views["source"], views["target"], views["registered"]
    mp1, mp2 = views["mp1"], views["mp2"]

    plan = plan_moves(section, items, registered, views["mps"], mp1, mp2)
    node_ids, problems = node_ids_for(ops, cdp, course_id, [m["title"] for m in plan["moves"]])
    print(f"== {section}")
    for line in format_plan(plan, node_ids):
        print(line)
    for title, reason in problems.items():
        print(f"  NODE ID   {title!r}: {reason}")

    if plan["conflicts"]:
        print("  [STOP] a title shows in both marking periods; nothing changed.")
        return {"plan": plan, "moved": 0, "failed": "conflict"}
    if not apply:
        return {"plan": plan, "moved": 0, "failed": None}

    todo = plan["moves"]
    if one is not None:
        todo = [m for m in todo if m["title"] == one]
        if not todo:
            print(f"  [STOP] {one!r} is not a planned move for {section}; nothing changed.")
            return {"plan": plan, "moved": 0, "failed": "not-planned"}
    elif todo and not any((row or {}).get("moved_from") for row in registered.values()):
        print(f"  [STOP] move ONE column of {section} first (--apply --one \"<title>\") and check it; "
              "nothing changed.")
        return {"plan": plan, "moved": 0, "failed": "one-first"}

    moved_titles = []
    mp2_now = mp2   # the MP2 view as of the last verified readback
    for m in todo:
        hhmm = clock()
        if in_sync_window(hhmm):
            print(f"  [STOP] {sync_window_message(hhmm)}. Moved {len(moved_titles)} column(s) in this "
                  f"run; the rest wait. Re-run after {SYNC_WINDOW[1]}.")
            # A clean stop: every column is where a verified read saw it (the moved ones in
            # MP2's readback, the rest untouched since the MP1 read), so the evidence stays
            # complete for the LIVE runs (local file writes only, no Edge).
            mp1_now = {t: c for t, c in mp1.items() if t not in moved_titles}
            stamp_after_moves(state, section, items, registered, mp1_now, mp2_now, source, target)
            return {"plan": plan, "moved": len(moved_titles), "failed": "sync-window"}
        nid = node_ids.get(m["title"])
        if nid is None:
            print(f"  [STOP] {m['title']!r}: {problems.get(m['title'])}")
            return {"plan": plan, "moved": len(moved_titles), "failed": m["title"]}
        print(f"  [APPLY] {m['title']!r} (nid {nid}) MP {source['grading_period_id']} -> "
              f"MP {target['grading_period_id']} ...")
        result = move_column(ops, cdp, course_id, nid, m["title"], target["grading_period_id"],
                             period_field, edit_url)
        if not result["ok"]:
            print(f"  [STOP] {m['title']!r}: {result['error']}")
            return {"plan": plan, "moved": len(moved_titles), "failed": m["title"]}
        try:
            mp2_after = read_counts(ops, cdp, course_id, target)
        except lib.ViewNotVerified as exc:
            print(f"  [STOP] readback of {m['title']!r}: {exc}")
            print(f"         {UNKNOWN_AFTER_SUBMIT}")
            return {"plan": plan, "moved": len(moved_titles), "failed": m["title"]}
        problem = check_readback(m["title"], m["filled"], mp2_after)
        if problem:
            print(f"  [STOP] readback: {problem}")
            print(f"         {UNKNOWN_AFTER_SUBMIT}")
            return {"plan": plan, "moved": len(moved_titles), "failed": m["title"]}
        record_move(state, section, m["key"], target["grading_period_id"], source["grading_period_id"])
        moved_titles.append(m["title"])
        mp2_now = mp2_after
        print(f"  [OK]    {m['title']!r} is in MP {target['grading_period_id']} with {m['filled']} filled cells")

    mp1_now = mp1
    if moved_titles:
        try:
            mp1_now = read_counts(ops, cdp, course_id, source)
        except lib.ViewNotVerified as exc:
            print(f"  [WARN] could not re-read Marking Period 1 to confirm: {exc}")
            return {"plan": plan, "moved": len(moved_titles), "failed": "mp1-readback"}
        left = leftovers_in_mp1(moved_titles, mp1_now)
        if left:
            print(f"  [STOP] still in the Marking Period 1 view after the move: {left}")
            return {"plan": plan, "moved": len(moved_titles), "failed": "mp1-leftover"}
    print(f"  [DONE] {section}: moved {len(moved_titles)} column(s)")
    stamp_after_moves(state, section, items, registered, mp1_now, mp2_now, source, target)
    return {"plan": plan, "moved": len(moved_titles), "failed": None}


def _parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="One-time move of the after-the-line columns MP1 -> MP2 (dry run by default)."
    )
    p.add_argument("--section", choices=["PeriodB", "PeriodE", "all"], default="all")
    p.add_argument("--apply", action="store_true", help="Move for real (default: print the plan only).")
    p.add_argument("--one", default=None, metavar="TITLE",
                   help='With --apply: move just this column, e.g. --one "2.4 Quiz" (do this first).')
    p.add_argument("--inspect", default=None, metavar="TITLE",
                   help="Open this column's edit form and print its fields; submits NOTHING.")
    p.add_argument("--stamp", action="store_true",
                   help="Move nothing: record in the sync state the marking period every registered "
                        "column shows in (read-only on Schoology).")
    p.add_argument("--period-field", default=DEFAULT_PERIOD_FIELD,
                   help="The edit form's grading period <select> name (see --inspect).")
    p.add_argument("--edit-url", default=DEFAULT_EDIT_URL,
                   help="Edit form URL template with {base}, {course}, {nid} (default: the rename "
                        "tool's verified /assignment/edit/{course}/{nid}/basic).")
    return p.parse_args(argv)


def main(argv=None, *, clock=None) -> int:
    args = _parse_args(argv)
    clock = clock or _hhmm_now
    if args.one and not args.apply:
        print("[STOP] --one needs --apply (the dry run already lists every move).")
        return 2
    if args.stamp and (args.apply or args.inspect):
        print("[STOP] --stamp moves nothing: use it without --apply / --one / --inspect.")
        return 2
    if (args.apply or args.inspect or args.stamp) and args.section == "all":
        print("[STOP] --apply / --inspect / --stamp need one --section (PeriodB or PeriodE).")
        return 2
    # Every mode drives Edge (the dry run reads both gradebook views).
    hhmm = clock()
    if in_sync_window(hhmm):
        print(f"[STOP] {sync_window_message(hhmm)}. Run before {SYNC_WINDOW[0]} or after "
              f"{SYNC_WINDOW[1]}.")
        return 2
    # Finding B1: HOLD the rig lock (not just look at it) from before the CDP connect to the
    # end, so a daily job that starts meanwhile waits instead of sharing the Edge tab.
    token = lib.acquire_rig_lock(RIG_LOCK_OWNER, path=RIG_LOCK_PATH)
    if token is None:
        holder = lib.rig_lock_holder(RIG_LOCK_PATH) or {}
        print(f"[STOP] the Schoology rig is busy: {RIG_LOCK_PATH} is held by "
              f"{holder.get('owner') or '?'} (pid {holder.get('pid')}); wait for it to finish.")
        return 2
    try:
        return _run(args, clock)
    finally:
        lib.release_rig_lock(token)


def _run(args, clock) -> int:
    """Everything after the start guards; runs inside the rig lock."""
    import schoology_sync_section as sync
    sections = list(SECTIONS) if args.section == "all" else [args.section]
    if args.apply or args.stamp:
        when = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = backup_state_file(sync.STATE_PATH, BACKUP_DIR, when)
        if backup is None:
            print(f"[STOP] {sync.STATE_PATH} not found: the sync registered no column, so there is "
                  "nothing to move or stamp. Nothing changed.")
            return 2
        print(f"[backup] {sync.STATE_PATH} copied to {backup}")

    import schoology_ops as ops  # live CDP; imported here so the planner tests need no browser
    cdp = ops.connect(reuse=True)
    if args.inspect:
        return inspect_column(ops, cdp, SECTIONS[args.section], args.inspect, args.period_field,
                              args.edit_url)

    state = sync.LocalJsonStateStore(sync.STATE_PATH)   # the same file the backup copied
    ced = lib.schoology_titles_ced()
    if args.stamp:
        print(f"[move] mode=STAMP section={args.section} titles={'CED-2026' if ced else 'old'} "
              "(read-only on Schoology)")
        outcome = stamp_section(ops, cdp, args.section, SECTIONS[args.section],
                                items=section_items(args.section, ced), state=state)
        return 1 if outcome["failed"] else 0
    print(f"[move] mode={'APPLY' if args.apply else 'DRY-RUN'} sections={','.join(sections)}"
          + (f" one={args.one!r}" if args.one else "") + f" titles={'CED-2026' if ced else 'old'}")
    for section in sections:
        outcome = run_section(ops, cdp, section, SECTIONS[section], items=section_items(section, ced),
                              state=state, apply=args.apply, one=args.one, period_field=args.period_field,
                              edit_url=args.edit_url, clock=clock)
        if outcome["failed"] == "sync-window":
            return SYNC_WINDOW_EXIT
        if outcome["failed"]:
            return 1
    if not args.apply:
        print("\nDry run: nothing was changed. Next: --inspect \"<title>\", then --apply --one \"<title>\".")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
