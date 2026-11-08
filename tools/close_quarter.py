"""close_quarter.py -- the Quarter 1 close (QUARTER_LINE_BY_DUE_DATE_SPEC.md section 4.5).

Quarter 1 stays fixable through its close date, Tue 2026-11-10 (moved from Thu 11/12 by the
teacher on 2026-11-08): students are told "fix by Tue 11/10", so the whole of Tuesday counts,
including Tuesday evening. Run the close ONCE the next morning: Wed 2026-11-11 (Veterans Day,
no school), so the final is in Schoology before Thursday (and never 16:00-17:05):
  1. POST /class/quarter/close {quarter, section}                 PeriodB, then PeriodE
     freezes each student's Quarter 1 grade (the first close of a student wins)
  2. POST /class/quarter/apply-bonus {quarter, section, dryRun: false}   both sections
     adds the banked bonus (a BONUS-APPLIED-Q1 row); /class/grades closedGrade includes it
  3. schoology_official.py --section <S> --final Q1 --apply        both sections
     MP1 final override = max(closedGrade incl. the bonus, current MP1 override), once
From Wed 11/11 the daily job skips the Quarter 1 pass (the close date has passed).
Every step is safe to re-run: the close keeps the first freeze, the bonus is applied once
per student, and the final records each student it wrote and published
(tools/.schoology-sync-logs/official-final-state.json).

    python tools/close_quarter.py                       # DRY RUN (default): plan + read-only preview
    python tools/close_quarter.py --today 2026-11-11    # the same preview, as of another date
    python tools/close_quarter.py --apply               # the close (Wed 11/11 morning)

--apply is refused (exit 2, nothing changed):
  - while the REAL school date (America/New_York) is on or before the close date. --today
    never moves this: --apply together with --today is refused;
  - from 16:00 to 17:05: the LIVE sync tasks use the rig 16:25-17:05, and a run started
    after 16:00 could still be running then;
  - while another run holds the rig lock (tools/.schoology-sync-logs/rig.lock).
The run holds the rig lock from before its first call until it ends (the final inherits
it), and checks the clock again before each section's step: once 16:00 is reached it
stops cleanly (exit 3) and the command is simply re-run after 17:05.
Exit codes: 0 done; 1 a step failed (re-run); 2 refused; 3 stopped at the LIVE window.

The dry run is READ-ONLY: GET /class/grades per section (what the close would freeze). It
does not touch Schoology. The final's own read-only preview (switches the gradebook view):
    python tools/schoology_official.py --section PeriodB --final Q1
    python tools/schoology_official.py --section PeriodE --final Q1
The secret comes from roster-server/.env or ROSTER_TEACHER_SECRET; it is never printed.

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
from datetime import date
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import schoology_components as components  # noqa: E402
import schoology_sync_lib as lib  # noqa: E402

SECTIONS = ("PeriodB", "PeriodE")
# The LIVE sync tasks (16:30 B, 16:45 E) drive the Schoology rig 16:25-17:05; the final
# writes there too. The clock rule itself is schoology_sync_lib.in_rig_quiet_window.
SYNC_WINDOW = ("16:25", "17:05")


# ---------------------------------------------------------------------------
# Roster (the secret never leaves the request header)
# ---------------------------------------------------------------------------

def roster_request(method: str, path: str, secret: str, body: dict | None = None) -> dict:
    """One roster-server call. Returns the JSON reply, or {'ok': False, 'error': ...}."""
    import schoology_official as official
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"x-teacher-secret": secret}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = Request(official.ROSTER_BASE + path, data=data, method=method, headers=headers)
    try:
        with urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as err:
        return {"ok": False, "error": "HTTP %s" % err.code}
    except (URLError, ValueError) as err:
        return {"ok": False, "error": type(err).__name__}


# ---------------------------------------------------------------------------
# Pure checks (unit-tested)
# ---------------------------------------------------------------------------

def apply_refusal(quarter: str, today: str, hhmm: str, close_date: str | None) -> str | None:
    """Why --apply must not START now (None = go). today / hhmm: the REAL school clock.

    Finding A6: the quarter stays fixable through the whole close date (the student copy
    says "fix by Tue 11/10"), and the first close wins, so the close runs the morning
    AFTER the close date. Finding A5: never from 16:00 to 17:05.
    """
    if not close_date:
        return ("no close date: /class/grades config.quarters.<Q>.close is missing; pass "
                "--close YYYY-MM-DD")
    if today <= close_date:
        return ("%s stays fixable through %s; run the close the next morning, outside %s-%s "
                "(today is %s)" % (lib.quarter_label(quarter), close_date, SYNC_WINDOW[0],
                                   SYNC_WINDOW[1], today))
    if lib.in_rig_quiet_window(hhmm):
        return "it is %s: %s" % (hhmm, lib.RIG_WINDOW_REASON)
    return None


def preview_lines(section: str, quarter: str, doc: dict) -> list[str]:
    """What the close would freeze for one section (read-only summary)."""
    rows = []
    for st in doc.get("students", []) or []:
        if st.get("role") == "teacher" or str(st.get("username", "")).startswith("zz_"):
            continue
        q = (st.get("quarters") or {}).get(quarter) or {}
        rows.append((st.get("realName") or st.get("username") or "?", q.get("quarterGrade"),
                     q.get("closedGrade")))
    graded = [r for r in rows if r[1] is not None]
    closed = [r for r in rows if r[2] is not None]
    lines = ["== %s: %d students, %d with a %s grade (frozen by the close), %d already closed" % (
        section, len(rows), len(graded), quarter, len(closed))]
    for name, live, frozen in rows:
        lines.append("  %-28s live %-6s closed %s" % (str(name)[:28], live, frozen))
    return lines


# ---------------------------------------------------------------------------
# The sequence
# ---------------------------------------------------------------------------

def run_final(section: str, quarter: str, apply: bool, today: str | None) -> int:
    """schoology_official.py --final for one section (in this process, so it inherits this
    run's rig lock through APSTATS_RIG_LOCK_OWNER).

    A bad gradebook read stops schoology_official with SystemExit("..."); it comes back
    here as a failed final (exit 1), so the sequence prints [STOP] instead of dying.
    """
    import schoology_official as official
    argv = ["--section", section, "--final", quarter]
    if today:
        argv += ["--today", today]
    if apply:
        argv.append("--apply")
    try:
        return official.main(argv)
    except SystemExit as exc:
        print("[final] %s stopped: %s" % (section, exc))
        return exc.code if isinstance(exc.code, int) else 1


def close_sequence(quarter: str, sections, secret: str, *, post, final, stop_reason=None) -> int:
    """close every section -> apply the bonus for every section -> the final for every section.

    post(path, body) -> reply dict; final(section) -> exit code. Stops at the first failure
    (every step is re-runnable, so the fix is to re-run the whole command).
    stop_reason() -> str or None is asked before each section's step (finding A5: the LIVE
    window); a reason stops the sequence cleanly with exit 3.
    """
    def stopped() -> bool:
        reason = stop_reason() if stop_reason else None
        if reason:
            print("[STOP] %s. Stopped cleanly before the next step; re-run after 17:05." % reason)
        return bool(reason)

    for section in sections:
        if stopped():
            return 3
        reply = post("/class/quarter/close", {"quarter": quarter, "section": section})
        print("[close] %s %s: %s" % (section, quarter, _summary(reply, ("considered", "gradeable", "frozen"))))
        if not reply.get("ok"):
            print("[STOP] the close failed for %s; nothing after it ran." % section)
            return 1
    for section in sections:
        if stopped():
            return 3
        reply = post("/class/quarter/apply-bonus", {"quarter": quarter, "section": section, "dryRun": False})
        print("[bonus] %s %s: %s skipped=%s" % (section, quarter, _summary(reply, ("applied",)),
                                               len(reply.get("skipped") or [])))
        if not reply.get("ok"):
            print("[STOP] apply-bonus failed for %s; the final was not written." % section)
            return 1
    for section in sections:
        if stopped():
            return 3
        code = final(section)
        print("[final] %s %s: exit %s" % (section, quarter, code))
        if code != 0:
            print("[STOP] the final failed for %s; re-run (written students are never written twice)." % section)
            return code
    print("[done] %s closed for %s." % (quarter, ", ".join(sections)))
    return 0


def _summary(reply: dict, keys) -> str:
    if not reply.get("ok"):
        return "FAILED (%s)" % reply.get("error")
    return " ".join("%s=%s" % (k, reply.get(k)) for k in keys)


def _iso_date(text: str) -> str:
    try:
        return date.fromisoformat(str(text).strip()).isoformat()
    except ValueError:
        raise argparse.ArgumentTypeError("not a YYYY-MM-DD date: %r" % text)


def _parse_args(argv=None):
    p = argparse.ArgumentParser(description="Close a quarter: freeze, apply the bonus, write the MP final (dry run by default).")
    p.add_argument("--quarter", choices=["Q1", "Q2", "Q3", "Q4"], default="Q1")
    p.add_argument("--section", choices=list(SECTIONS) + ["all"], default="all")
    p.add_argument("--apply", action="store_true", help="Run the close (default: dry run).")
    p.add_argument("--today", type=_iso_date, default=None, metavar="YYYY-MM-DD",
                   help="Preview as of this date (dry run only: --apply always uses the real date).")
    p.add_argument("--close", type=_iso_date, default=None, metavar="YYYY-MM-DD",
                   help="The close date when /class/grades config has none.")
    return p.parse_args(argv)


def main(argv=None, *, request=None, final=None, clock=None, rig_lock=None) -> int:
    """clock() -> naive datetime on the school clock (default lib.school_now); rig_lock(owner)
    -> lock token or None (default lib.acquire_rig_lock). Both are injected by the tests."""
    args = _parse_args(argv)
    import schoology_official as official

    clock = clock or lib.school_now
    request = request or roster_request
    sections = list(SECTIONS) if args.section == "all" else [args.section]
    if args.apply and args.today:
        print("[STOP] --today is for the read-only preview; --apply always uses the real school "
              "date. Nothing changed.")
        return 2
    secret = official.roster_secret()
    real_today = clock().date().isoformat()
    today = args.today or real_today

    docs = {}
    for section in sections:
        docs[section] = request("GET", "/class/grades?section=%s" % section, secret)
        if not docs[section].get("ok"):
            print("[STOP] GET /class/grades for %s failed (%s); nothing changed." % (
                section, docs[section].get("error")))
            return 1
    close_date = components.quarter_close_date(docs[sections[0]], args.quarter, args.close)
    print("[close-quarter] %s, close date %s, today %s, mode %s" % (
        args.quarter, close_date, today, "APPLY" if args.apply else "DRY-RUN"))
    for section in sections:
        for line in preview_lines(section, args.quarter, docs[section]):
            print(line)

    if not args.apply:
        print("\nDRY RUN: nothing changed. With --apply, in this order:")
        for section in sections:
            print("  POST /class/quarter/close %s" % json.dumps({"quarter": args.quarter, "section": section}))
        for section in sections:
            print("  POST /class/quarter/apply-bonus %s" % json.dumps(
                {"quarter": args.quarter, "section": section, "dryRun": False}))
        for section in sections:
            print("  python tools/schoology_official.py --section %s --final %s --apply" % (section, args.quarter))
        return 0

    refusal = apply_refusal(args.quarter, real_today, clock().strftime("%H:%M"), close_date)
    if refusal:
        print("[STOP] %s. Nothing changed." % refusal)
        return 2

    # Finding A5: hold the rig lock for the whole run, from before the first call; the
    # final (schoology_official.py, in this process) inherits it.
    take_lock = rig_lock or (lambda owner: lib.acquire_rig_lock(owner, path=lib.RIG_LOCK_PATH))
    token = take_lock("close-quarter")
    if token is None:
        holder = lib.rig_lock_holder(lib.RIG_LOCK_PATH) or {}
        print("[STOP] another run holds the Schoology rig (%s: %s, pid %s); wait for it to finish. "
              "Nothing changed." % (lib.RIG_LOCK_PATH, holder.get("owner"), holder.get("pid")))
        return 2
    try:
        def window_reason():
            hhmm = clock().strftime("%H:%M")
            if lib.in_rig_quiet_window(hhmm):
                return "it is %s: %s" % (hhmm, lib.RIG_WINDOW_REASON)
            return None

        final = final or (lambda section: run_final(section, args.quarter, True, None))
        return close_sequence(args.quarter, sections, secret,
                              post=lambda path, body: request("POST", path, secret, body), final=final,
                              stop_reason=window_reason)
    finally:
        lib.release_rig_lock(token)


if __name__ == "__main__":
    raise SystemExit(main())
