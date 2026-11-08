"""Unit tests for schoology_ops create/delete logic.

Fake cdp only -- no browser, no live Schoology. Pins the two fixes from the
2026-05-30 live smoke: the create fast-path URL filter, and delete verification
against gradebook truth instead of the false-negative confirm-form check.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import types
import unittest


TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(REPO_ROOT, "tools"))
sys.path.insert(0, os.path.join(REPO_ROOT, "tools", "cdp"))

# edge.py imports websocket-client at module load; stub it so importing
# schoology_ops succeeds without the real package (matches test_cdp_edge_network).
sys.modules.setdefault(
    "websocket",
    types.SimpleNamespace(WebSocketTimeoutException=TimeoutError, create_connection=None),
)

import re
import schoology_ops as ops  # noqa: E402
from unittest import mock  # noqa: E402


class FakeCDP:
    """Stand-in for EdgeCDP that scripts eval_js + wait_for_response."""

    def __init__(self, *, wfr_result=None, body_text="",
                 delete_form_present=False, title_lookup=None,
                 select_ready=True, reject_fields=(), materials=None, stubborn=()):
        self.wfr_result = wfr_result
        self.wfr_calls = []
        self.body_text = body_text
        self.delete_form_present = delete_form_present
        self.title_lookup = title_lookup     # what find_assignment_id_by_title sees
        self.select_ready = select_ready     # do the <select>s carry the wanted options?
        self.reject_fields = set(reject_fields)   # field names whose set value is silently dropped
        self.form_values = {}                # name -> value the form actually holds
        # materials: {folder_id_or_None: [rows]} served to list_materials by the page URL.
        self.materials = materials if materials is not None else {None: []}
        self.stubborn = set(stubborn)        # nids whose Move submit never takes
        self.current_url = None
        self.clicks = []
        self.urls = []
        self.evals = []

    def attach_url(self, url, wait_ms=0):
        self.urls.append(url)
        self.current_url = url

    def click(self, x, y):
        self.clicks.append((x, y))

    def wait_for_response(self, url_substring, timeout=15.0):
        self.wfr_calls.append(url_substring)
        return self.wfr_result

    def eval_js(self, expr):
        self.evals.append(expr)
        if "s-grade-item-add-form" in expr:
            return True
        # list_materials: rows for the folder named in the current page URL.
        if "a.move-material" in expr and "var out = [], seen = {}" in expr:
            m = re.search(r"[?&]f=([^&]+)", self.current_url or "")
            return list(self.materials.get(m.group(1) if m else None, []))
        # Move / delete form submits mutate the scripted materials.
        if "move-item-form" in expr and "click()" in expr:
            m = re.search(r"materials/move/([^/?]+)", self.current_url or "")
            nid = m.group(1) if m else None
            dest = self.form_values.get("destination_folder")
            if nid and nid not in self.stubborn:
                row = next((r for r in self.materials.get(None, []) if r["nid"] == nid), None)
                if row:
                    self.materials[None].remove(row)
                    self.materials.setdefault(dest, []).append(row)
            return None
        if "folder-action-form" in expr and "click()" in expr:
            m = re.search(r"materials/folder/([^/]+)/delete", self.current_url or "")
            if m:
                self.materials[None] = [r for r in self.materials.get(None, []) if r["nid"] != m.group(1)]
            return True
        # add_assignment readiness poll: every wanted <option> present?
        if "el.options" in expr:
            return self.select_ready
        # add_assignment form fill: remember what the form now holds (unless rejected).
        m = re.search(r'\[name="([^"]+)"\]', expr)
        if m and re.search(r'el\.value\s*=\s*"', expr):
            v = re.search(r'el\.value\s*=\s*(".*?");', expr)
            if m.group(1) not in self.reject_fields and v:
                self.form_values[m.group(1)] = json.loads(v.group(1))
            return None
        # add_assignment read-back before submit.
        if "String(el.value)" in expr:
            sel = re.search(r'querySelector\((".*?")\)', expr)
            name = re.search(r'\[name="([^"]+)"\]', json.loads(sel.group(1))) if sel else None
            return self.form_values.get(name.group(1)) if name else None
        if "s-grade-item-delete-form" in expr:
            return self.delete_form_present
        if "getBoundingClientRect" in expr:   # submit rect (delete coordinate click)
            return {"x": 10, "y": 10}
        if "edit-submit" in expr:             # JS submit click (add) / scrollIntoView
            return True
        if "document.body" in expr and "textContent" in expr:
            return self.body_text
        if "gridcell" in expr:                # find_assignment_id_by_title scan
            return self.title_lookup
        return None


class TestAddAssignmentFilter(unittest.TestCase):
    def test_fastpath_uses_corrected_filter(self):
        fake = FakeCDP(wfr_result={"body": json.dumps({"assignment_nid": "999"})})
        res = ops.add_assignment(fake, "123", title="T",
                                 category_id="c", grading_period_id="g")
        self.assertEqual(res, {"ok": True, "assignment_id": "999", "error": None})
        self.assertEqual(fake.wfr_calls, ["materials/assignments/add"])
        self.assertNotIn("assignment-creation-complete", fake.wfr_calls)

    def test_falls_back_to_dom_poll_when_capture_misses(self):
        body = json.dumps({"assignment_nid": "777", "path": "assignment-creation-complete"})
        fake = FakeCDP(wfr_result=None, body_text=body)
        res = ops.add_assignment(fake, "123", title="T",
                                 category_id="c", grading_period_id="g")
        self.assertTrue(res["ok"])
        self.assertEqual(res["assignment_id"], "777")
        self.assertEqual(fake.wfr_calls, ["materials/assignments/add"])

    def test_submit_uses_js_click_not_coordinate(self):
        # Live smoke showed the coordinate-click missed; the submit is now a JS
        # click on input#edit-submit (no cdp.click(x,y)).
        fake = FakeCDP(wfr_result={"body": json.dumps({"assignment_nid": "1"})})
        ops.add_assignment(fake, "123", title="T", category_id="c", grading_period_id="g")
        self.assertEqual(fake.clicks, [])
        self.assertTrue(any("edit-submit" in e and "click()" in e for e in fake.evals))

    def test_waits_for_select_options_and_never_submits_a_half_rendered_form(self):
        # 2026-09-15: the first create after a cold form load failed twice because the
        # category <select> had no options yet; the value went blank and the submit hung.
        fake = FakeCDP(wfr_result={"body": json.dumps({"assignment_nid": "1"})}, select_ready=False)
        with mock.patch.object(ops.time, "sleep"), mock.patch.object(ops.time, "time",
                                                                     side_effect=[0, 0, 5, 11, 12, 13]):
            res = ops.add_assignment(fake, "123", title="T", category_id="c", grading_period_id="g")
        self.assertFalse(res["ok"])
        self.assertIn("category/period options", res["error"])
        self.assertFalse(any("edit-submit" in e and "click()" in e for e in fake.evals))
        self.assertEqual(fake.wfr_calls, [])

    def test_reads_the_form_back_and_refuses_a_rejected_select_value(self):
        fake = FakeCDP(wfr_result={"body": json.dumps({"assignment_nid": "1"})},
                       reject_fields=("grading_category_id",))
        res = ops.add_assignment(fake, "123", title="T", category_id="c", grading_period_id="g")
        self.assertFalse(res["ok"])
        self.assertIn("rejected", res["error"])
        self.assertIn("grading_category_id", res["error"])
        self.assertFalse(any("edit-submit" in e and "click()" in e for e in fake.evals))

    def test_corrected_filter_matches_real_post_url(self):
        # Documents the root cause: the filter must match the POST URL, not the
        # JSON body token that lives only inside the response.
        url = "/course/123/materials/assignments/add?is_popup=1"
        self.assertIn("materials/assignments/add", url)
        self.assertNotIn("assignment-creation-complete", url)


class TestAssignmentsFolder(unittest.TestCase):
    """Materials-folder ops (2026-09-16): moves are verified against the root and retried."""

    def _root(self):
        return {None: [
            {"nid": "F1", "kind": "folder", "title": "Assignments"},
            {"nid": "A1", "kind": "assignment", "title": "1.1 Follow-Along"},
            {"nid": "A2", "kind": "assignment", "title": "1.1 Blooket"},
            {"nid": "D1", "kind": "other", "title": ""},
        ]}

    def test_moves_every_top_level_assignment_and_leaves_other_materials(self):
        fake = FakeCDP(materials=self._root())
        with mock.patch.object(ops.time, "sleep"):
            res = ops.move_assignments_into_folder(fake, "123")
        self.assertTrue(res["ok"])
        self.assertEqual(res["folder_id"], "F1")
        self.assertEqual(sorted(m["nid"] for m in res["moved"]), ["A1", "A2"])
        self.assertEqual([r["nid"] for r in fake.materials[None]], ["F1", "D1"])
        self.assertEqual(sorted(r["nid"] for r in fake.materials["F1"]), ["A1", "A2"])

    def test_only_nids_limits_the_move(self):
        fake = FakeCDP(materials=self._root())
        with mock.patch.object(ops.time, "sleep"):
            res = ops.move_assignments_into_folder(fake, "123", only_nids={"A2"})
        self.assertEqual([m["nid"] for m in res["moved"]], ["A2"])
        self.assertIn("A1", [r["nid"] for r in fake.materials[None]])

    def test_a_move_that_never_takes_is_retried_then_reported(self):
        fake = FakeCDP(materials=self._root(), stubborn={"A1"})
        with mock.patch.object(ops.time, "sleep"):
            res = ops.move_assignments_into_folder(fake, "123")
        self.assertFalse(res["ok"])
        self.assertEqual([m["nid"] for m in res["moved"]], ["A2"])
        self.assertEqual(len(res["errors"]), 1)
        self.assertIn("A1", res["errors"][0])
        self.assertEqual(sum(1 for u in fake.urls if u.endswith("/materials/move/A1")), 2)

    def test_delete_refuses_a_non_empty_folder(self):
        fake = FakeCDP(materials={None: [{"nid": "F1", "kind": "folder", "title": "Assignments"}],
                                  "F1": [{"nid": "A1", "kind": "assignment", "title": "x"}]})
        with mock.patch.object(ops.time, "sleep"):
            res = ops.delete_empty_folder(fake, "123", "F1")
        self.assertFalse(res["ok"])
        self.assertIn("not empty", res["error"])
        self.assertFalse(any(u.endswith("/delete") for u in fake.urls))

    def test_delete_removes_an_empty_folder(self):
        fake = FakeCDP(materials={None: [{"nid": "F1", "kind": "folder", "title": "Assignments"}], "F1": []})
        with mock.patch.object(ops.time, "sleep"):
            res = ops.delete_empty_folder(fake, "123", "F1")
        self.assertTrue(res["ok"])
        self.assertEqual(fake.materials[None], [])


class TestDeleteVerify(unittest.TestCase):
    def test_uses_gradebook_truth_over_lying_confirm_form(self):
        # Confirm form ALWAYS renders (the false-negative), but the gradebook
        # shows the column gone -> delete should report ok=True.
        fake = FakeCDP(delete_form_present=True, title_lookup=None)
        res = ops.delete_assignment(fake, "555", course_id="123", title="T")
        self.assertEqual(res, {"ok": True, "error": None})

    def test_reports_present_when_gradebook_still_shows_column(self):
        fake = FakeCDP(delete_form_present=True, title_lookup="col-7")
        res = ops.delete_assignment(fake, "555", course_id="123", title="T")
        self.assertFalse(res["ok"])
        self.assertIn("gradebook", res["error"])

    def test_without_course_title_falls_back_to_form_check(self):
        fake = FakeCDP(delete_form_present=True)
        res = ops.delete_assignment(fake, "555")
        self.assertFalse(res["ok"])
        self.assertIn("after delete retries", res["error"])

    def test_early_success_when_confirm_form_absent(self):
        fake = FakeCDP(delete_form_present=False)
        res = ops.delete_assignment(fake, "555")
        self.assertTrue(res["ok"])


class TestWriteOverride(unittest.TestCase):
    def _capture(self):
        calls = []
        orig = ops.write_grade_to_cell
        ops.write_grade_to_cell = lambda cdp, col, row, val: (
            calls.append((col, row, val)), {"ok": True})[1]
        self.addCleanup(lambda: setattr(ops, "write_grade_to_cell", orig))
        return calls

    def test_gp_override_by_default(self):
        calls = self._capture()
        res = ops.write_override(None, 2, 95)
        self.assertEqual(calls, [("gp_override", 2, 95)])
        self.assertTrue(res["ok"])

    def test_overall_override_when_gp_false(self):
        calls = self._capture()
        ops.write_override(None, 4, 88, gp=False)
        self.assertEqual(calls, [("overall_override", 4, 88)])


class TestCommentDrafts(unittest.TestCase):
    def test_unreadable_grade_stops_before_clicking_or_typing(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={"ok": True}), \
                mock.patch.object(ops, "read_grade_from_cell", return_value=None), \
                mock.patch.object(fake, "eval_js", return_value=None):
            result = ops.write_cell_comment(fake, "col1", 2, "x")
        self.assertFalse(result["verified"])
        self.assertIn("unreadable", result["reason"])
        self.assertEqual(fake.clicks, [])
        fake.send.assert_not_called()

    def test_close_reopen_verification_and_real_keys_without_enter(self):
        for reopened_text, verified in (("x", True), ("old", False)):
            fake = FakeCDP()
            fake.send = mock.Mock()
            editor = {"text": "old", "focused": True, "editable": True,
                      "field": {"x": 20, "y": 20}, "close": {"x": 30, "y": 30},
                      "checked": True}
            reads = [None, editor, editor, editor, editor, {**editor, "text": "x"},
                     None, None, {**editor, "text": reopened_text}, None]
            # A mismatch returns before the final closed-editor read.
            if not verified:
                reads.pop()
            with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
                "ok": True, "cell": {"rect": None}, "icons": [{"rect": {"x": 10, "y": 10}}]
            }), mock.patch.object(ops, "read_grade_from_cell", return_value=0), \
                    mock.patch.object(fake, "eval_js", side_effect=reads), mock.patch.object(ops.time, "sleep"):
                result = ops.write_cell_comment(fake, "col1", 2, "x")
            self.assertEqual(result["verified"], verified, result)
            keys = [c.args[1] for c in fake.send.call_args_list if c.args[0] == "Input.dispatchKeyEvent"]
            self.assertEqual([k["key"] for k in keys if k["type"] == "keyDown"], ["a", "Backspace", "x"])
            self.assertFalse(any(k.get("key") == "Enter" or k.get("windowsVirtualKeyCode") == 13 for k in keys))
            self.assertEqual(fake.clicks.count((10, 10)), 2)

    def test_icon_failure_falls_back_to_context_without_typing(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
            "ok": True, "cell": {"rect": {"x": 5, "y": 5}},
            "icons": [{"rect": {"x": 10, "y": 10}}], "menuItems": []
        }), mock.patch.object(ops, "read_grade_from_cell", return_value=0), \
                mock.patch.object(fake, "eval_js", return_value=None), mock.patch.object(ops.time, "sleep"):
            result = ops.write_cell_comment(fake, "col1", 2, "x")
        self.assertFalse(result["verified"])
        self.assertIn((10, 10), fake.clicks)
        self.assertTrue(any(c.args[0] == "Input.dispatchMouseEvent" for c in fake.send.call_args_list))
        self.assertFalse(any(c.args[0] == "Input.dispatchKeyEvent" for c in fake.send.call_args_list))

    def test_lost_textarea_focus_never_types_into_grade(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        editor = {"text": "", "focused": False, "editable": True, "checked": True,
                  "field": {"x": 20, "y": 20}, "close": {"x": 30, "y": 30}}
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
            "ok": True, "cell": {"rect": None}, "icons": [{"rect": {"x": 10, "y": 10}}]
        }), mock.patch.object(ops, "read_grade_from_cell", return_value=0), \
                mock.patch.object(fake, "eval_js", side_effect=[None, editor, editor]), \
                mock.patch.object(ops.time, "sleep"):
            result = ops.write_cell_comment(fake, "col1", 2, "x")
        self.assertFalse(result["verified"])
        self.assertIn("lost focus", result["reason"])
        self.assertFalse(any(c.args[0] == "Input.dispatchKeyEvent" for c in fake.send.call_args_list))

    def test_clear_leaves_a_teacher_written_comment_alone(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        editor = {"text": "Great improvement this week!", "focused": True, "editable": True, "checked": True,
                  "field": {"x": 20, "y": 20}, "close": {"x": 30, "y": 30}}
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
            "ok": True, "cell": {"rect": None}, "icons": [{"rect": {"x": 10, "y": 10}}]
        }), mock.patch.object(ops, "read_grade_from_cell", return_value=95), \
                mock.patch.object(fake, "eval_js", side_effect=[None, editor]), \
                mock.patch.object(ops.time, "sleep"):
            result = ops.clear_cell_comment(fake, "col1", 2)
        self.assertFalse(result["ok"])
        self.assertIn("not the sync's", result["reason"])
        self.assertFalse(any(c.args[0] == "Input.dispatchKeyEvent" for c in fake.send.call_args_list))
        self.assertEqual(fake.clicks[-1], (30, 30))   # closed without typing

    def test_clear_with_expect_current_leaves_an_edited_sync_note_alone(self):
        # A comment that starts with the sync prefix but is NOT the exact note the sync wrote
        # (a teacher appended to it, or typed the phrase themselves) is never erased.
        fake = FakeCDP()
        fake.send = mock.Mock()
        edited = ops.SYNC_COMMENT_PREFIX + " Missing: 1.2 quiz. See me Friday."
        editor = {"text": edited, "focused": True, "editable": True, "checked": True,
                  "field": {"x": 20, "y": 20}, "close": {"x": 30, "y": 30}}
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
            "ok": True, "cell": {"rect": None}, "icons": [{"rect": {"x": 10, "y": 10}}]
        }), mock.patch.object(ops, "read_grade_from_cell", return_value=0), \
                mock.patch.object(fake, "eval_js", side_effect=[None, editor]), \
                mock.patch.object(ops.time, "sleep"):
            result = ops.clear_cell_comment(fake, "col1", 2,
                                            expect_current=ops.SYNC_COMMENT_PREFIX + " Missing: 1.2 quiz.")
        self.assertFalse(result["ok"])
        self.assertIn("differs from the sync's last note", result["reason"])
        self.assertFalse(any(c.args[0] == "Input.dispatchKeyEvent" for c in fake.send.call_args_list))
        self.assertEqual(fake.clicks[-1], (30, 30))   # closed without typing

    def test_clear_with_nothing_there_is_a_verified_no_op(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        editor = {"text": "", "focused": True, "editable": True, "checked": False,
                  "field": {"x": 20, "y": 20}, "close": {"x": 30, "y": 30}}
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
            "ok": True, "cell": {"rect": None}, "icons": [{"rect": {"x": 10, "y": 10}}]
        }), mock.patch.object(ops, "read_grade_from_cell", return_value=95), \
                mock.patch.object(fake, "eval_js", side_effect=[None, editor]), \
                mock.patch.object(ops.time, "sleep"):
            result = ops.clear_cell_comment(fake, "col1", 2)
        self.assertTrue(result["ok"] and result["verified"])
        self.assertEqual(result.get("skipped"), "nothing to clear")
        self.assertFalse(any(c.args[0] == "Input.dispatchKeyEvent" for c in fake.send.call_args_list))

    def test_probe_only_reads_dom(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        ops.inspect_cell_comment_ui(fake, "col1", 2)
        self.assertEqual(fake.clicks, [])
        fake.send.assert_not_called()
        source = " ".join(fake.evals)
        for forbidden in (".click(", ".focus(", "dispatchEvent", "scrollIntoView", ".value ="):
            self.assertNotIn(forbidden, source)
        self.assertIn("grader-grid-cell-col1-2", source)

    def test_missing_affordance_never_types(self):
        for clear in (False, True):
            fake = FakeCDP()
            fake.send = mock.Mock()
            with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
                "ok": True, "cell": {"rect": None}, "icons": [], "menuItems": []
            }), mock.patch.object(ops, "read_grade_from_cell", return_value=0), \
                    mock.patch.object(fake, "eval_js", return_value=None):
                result = ops.clear_cell_comment(fake, "col1", 2) if clear else ops.write_cell_comment(fake, "col1", 2, "hello")
            self.assertFalse(result["ok"])
            self.assertFalse(result["verified"])
            self.assertIn("affordance", result["reason"])
            self.assertEqual(fake.clicks, [])
            self.assertFalse(any(call.args[0] == "Input.dispatchKeyEvent" for call in fake.send.call_args_list))

    def test_missing_context_item_never_types(self):
        fake = FakeCDP()
        fake.send = mock.Mock()
        with mock.patch.object(ops, "inspect_cell_comment_ui", return_value={
            "ok": True, "cell": {"rect": {"x": 10, "y": 20}}, "icons": [], "menuItems": []
        }), mock.patch.object(ops, "read_grade_from_cell", return_value=0), \
                mock.patch.object(fake, "eval_js", return_value=None), mock.patch.object(ops.time, "sleep"):
            result = ops.write_cell_comment(fake, "col1", 2, "hello")
        self.assertFalse(result["verified"])
        self.assertTrue(any(call.args[0] == "Input.dispatchMouseEvent" for call in fake.send.call_args_list))
        self.assertFalse(any(call.args[0] == "Input.dispatchKeyEvent" for call in fake.send.call_args_list))

    def test_rejects_newline_without_any_browser_actions(self):
        fake = FakeCDP()
        self.assertFalse(ops.write_cell_comment(fake, "col1", 2, "bad\ntext")["verified"])
        self.assertEqual(fake.evals, [])
        self.assertEqual(fake.clicks, [])

    def test_discovery_cli_resolves_component_and_is_read_only(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("schoology_comment_cli", os.path.join(REPO_ROOT, "tools", "schoology-sync.py"))
        cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
        fake = FakeCDP()
        fake.launch = mock.Mock()
        fake.ws = None
        with mock.patch.object(cli, "EdgeCDP", return_value=fake), \
                mock.patch.object(cli, "assert_authenticated"), \
                mock.patch.object(ops, "inject_helpers"), \
                mock.patch.object(ops, "list_students", return_value=[{"studentId": "u1", "rowIndex": 2}]), \
                mock.patch.object(ops, "list_assignments", return_value=[{"columnKey": "c1"}]), \
                mock.patch.object(ops, "find_assignment_id_by_title", return_value="c1") as lookup, \
                mock.patch.object(ops, "inspect_cell_comment_ui", return_value={"ok": True}) as probe, \
                mock.patch.object(ops, "write_grade_to_cell") as write, \
                mock.patch.object(sys, "argv", ["schoology-sync.py", "--inspect-comment-ui", "--section", "PeriodB", "--student", "u1", "--column", "FA:1.2"]):
            self.assertEqual(cli.main(), 0)
        lookup.assert_called_once_with(fake, "1.2 Follow-Along")
        probe.assert_called_once_with(fake, "c1", 2)
        write.assert_not_called()
        self.assertEqual(fake.clicks, [])


class GridLoadFake:
    """Gradebook whose columns load in batches when the grid is scrolled."""

    def __init__(self, loaded, total, per_scroll, title_after_load=None):
        self.loaded, self.total, self.per_scroll = loaded, total, per_scroll
        self.title_after_load = title_after_load
        self.scrolls = 0

    def eval_js(self, expr):
        if "col_header_num_loaded" in expr:
            return {"loaded": self.loaded, "total": self.total}
        if "s-js-grid-scrolling-body" in expr:
            self.scrolls += 1
            self.loaded = min(self.total, self.loaded + self.per_scroll)
            return True
        if "gridcell" in expr:   # the title scan
            return self.title_after_load if self.loaded >= self.total else None
        return None


class TestLoadAllColumns(unittest.TestCase):
    """2026-10-02: Schoology loads 30 columns at a time; the rest need a scroll."""

    def setUp(self):
        self.sleep = mock.patch.object(ops.time, "sleep", lambda s: None)
        self.sleep.start()

    def tearDown(self):
        self.sleep.stop()

    def test_scrolls_until_every_column_is_loaded(self):
        fake = GridLoadFake(loaded=30, total=34, per_scroll=4)
        self.assertTrue(ops.load_all_columns(fake))
        self.assertEqual((fake.loaded, fake.scrolls), (34, 1))

    def test_no_scroll_when_already_loaded(self):
        fake = GridLoadFake(loaded=34, total=34, per_scroll=4)
        self.assertTrue(ops.load_all_columns(fake))
        self.assertEqual(fake.scrolls, 0)

    def test_not_a_gradebook_page_is_a_quiet_no(self):
        fake = FakeCDP(title_lookup="c1")
        self.assertFalse(ops.load_all_columns(fake))

    def test_stalled_loading_gives_up(self):
        fake = GridLoadFake(loaded=30, total=34, per_scroll=0)
        self.assertFalse(ops.load_all_columns(fake, timeout_s=0))

    def test_title_lookup_finds_a_column_past_the_first_batch(self):
        fake = GridLoadFake(loaded=30, total=34, per_scroll=4, title_after_load="33")
        self.assertEqual(ops.find_assignment_id_by_title(fake, "3.3 Blooket"), "33")


# ---------------------------------------------------------------------------
# Findings A3 (verifier) + R4a/R4d (Codex re-review): a switched filter + header over the
# OLD period's grid, a changed score on that old grid, an already-shown grid not rendered
# ---------------------------------------------------------------------------

MP1, MP2 = "1173888", "1173889"
_LABELS = {MP1: "Marking Period 1: 9/02/26 - 11/06/26", MP2: "Marking Period 2: 11/07/26 - 1/22/27"}
_RANGES = {MP1: {"start": "2026-09-02", "end": "2026-11-06"}, MP2: {"start": "2026-11-07", "end": "2027-01-22"}}

# Row 0 of a gradebook grid as Schoology renders it: (data-x, aria-label) per cell. The five
# summary cells sit in every marking period (no aria-label); an assignment cell is keyed by
# its column INDEX and its label carries the score.
_SUMMARY_CELLS = [("overall_override", None), ("overall", None), ("total_points_awarded", None),
                  ("gp_override", None), ("gp", None)]


def _row(*cells):
    return _SUMMARY_CELLS + list(cells)


_GRIDS = {MP1: _row(("0", "S, 2.1 Day 1 Quiz, 90 out of 100 points")),
          MP2: _row(("0", "S, 2.4 Quiz, 80 out of 100 points"))}


def _signature_of(cells):
    """What _ASSIGNMENT_SIGNATURE_JS returns for these row-0 cells: the count of all cells,
    then the sorted 'data-x|title' pairs of the titled assignment cells. The oracle is
    checked against the real JS on the captured gradebook (TestGridJsOnTheCapturedGradebook)."""
    summary = {"overall", "overall_override", "total_points_awarded", "gp", "gp_override"}
    pairs = []
    for x, label in cells:
        if x in summary:
            continue
        parts = (label or "").split(", ")
        title = parts[1] if len(parts) > 1 else ""
        if title:
            pairs.append(x + "|" + title)
    return "%d:%s" % (len(cells), chr(10).join(sorted(pairs)))


def _score_signature_of(cells):
    """The signature before finding R4a: every cell's full label, score included."""
    return "%d:%s" % (len(cells), chr(10).join("%s|%s" % (x, label or "") for x, label in cells))


class PeriodPage:
    """A gradebook whose filter and header switch at once; its grid follows `lag` grid reads
    later (lag=None: never, the verifier's stale-grid page). The click opener is absent, so
    select_grading_period falls back to the select2 API.

    grids: {mp: row-0 cells}. rows=False: no student row has rendered. rescore: labels
    that change on the grid still shown once the filter switched ({data-x: new label}):
    the old period's grid re-rendering a changed score (finding R4a).
    """

    def __init__(self, shown=MP2, lag=0, rows=True, grids=None, rescore=None):
        self.gp = shown          # the filter and the header
        self.grid_gp = shown     # the period whose cells the grid shows
        self.lag = lag
        self.rows = rows
        self.grids = {gp: list(cells) for gp, cells in (grids or _GRIDS).items()}
        self.rescore = dict(rescore or {})
        self.reads_since_switch = 0

    def send(self, method, params=None):
        pass

    def click(self, x, y):
        pass

    def cells(self):
        return self.grids[self.grid_gp]

    def _switch(self, gp):
        self.gp = gp
        self.reads_since_switch = 0
        if not self.rescore:
            return
        self.grids[self.grid_gp] = [(x, self.rescore.get(x, label)) for x, label in self.cells()]

    def eval_js(self, expr):
        if expr == ops._GRADING_PERIOD_VIEW_JS:
            return json.dumps({"gp": self.gp, "header": _LABELS[self.gp], "chosen": _LABELS[self.gp],
                               "available": [MP1, MP2, "all", "final", "none"]})
        if "select2('val'" in expr:
            self._switch(json.loads(re.search(r'[(]("[0-9]+")[)]', expr).group(1)))
            return "ok"
        if expr == ops._ASSIGNMENT_SIGNATURE_JS:
            if self.grid_gp != self.gp and self.lag is not None:
                self.reads_since_switch += 1
                if self.reads_since_switch > self.lag:
                    self.grid_gp = self.gp
            if not self.rows:
                return "0:"
            return _signature_of(self.cells())
        return None


class TestStaleGridAfterTheSwitch(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(ops.time, "sleep", lambda s: None)
        patcher.start()
        self.addCleanup(patcher.stop)

    def select(self, page, gp):
        return ops.select_grading_period(page, gp, _RANGES[gp], timeout_s=0.05)

    def test_filter_and_header_switched_but_the_grid_stayed_is_not_ok(self):
        page = PeriodPage(shown=MP2, lag=None)
        result = self.select(page, MP1)
        self.assertFalse(result["ok"])
        self.assertIn("still shows the previous marking period", result["error"])
        self.assertEqual(page.gp, MP1)          # the filter did switch; the grid did not

    def test_a_changed_score_on_the_old_grid_is_not_a_new_grid(self):
        # Finding R4a: the same titles, but the first row's score goes 70 -> 80 after the
        # filter and the header switched. The old score-text signature saw a "new" grid.
        grids = {MP2: _row(("0", "S, 2.4 Quiz, 70 out of 100 points"), ("1", "S, 2.5 Quiz")),
                 MP1: _row(("0", "S, 2.1 Day 1 Quiz, 90 out of 100 points"))}
        page = PeriodPage(shown=MP2, lag=None, grids=grids, rescore={"0": "S, 2.4 Quiz, 80 out of 100 points"})
        before = list(page.cells())
        result = self.select(page, MP1)
        self.assertFalse(result["ok"])
        self.assertIn("still shows the previous marking period", result["error"])
        self.assertEqual(page.cells()[5], ("0", "S, 2.4 Quiz, 80 out of 100 points"))   # it did change
        self.assertNotEqual(_score_signature_of(before), _score_signature_of(page.cells()))
        self.assertEqual(_signature_of(before), _signature_of(page.cells()))

    def test_different_titles_after_the_switch_are_ok(self):
        grids = {MP2: _row(("0", "S, 2.4 Quiz, 70 out of 100 points")),
                 MP1: _row(("0", "S, 2.1 Day 1 Quiz, 70 out of 100 points"))}
        page = PeriodPage(shown=MP2, lag=2, grids=grids)
        result = self.select(page, MP1)
        self.assertEqual((result["ok"], result["method"]), (True, "select2"))
        self.assertEqual(page.grid_gp, MP1)

    def test_columns_turning_into_an_empty_grid_is_a_real_change(self):
        # MP2 has no column before the move: Schoology renders empty placeholder cells.
        grids = {MP1: _row(("0", "S, 2.1 Day 1 Quiz, 90 out of 100 points")),
                 MP2: _row(("0", ""), ("1", ""))}
        result = self.select(PeriodPage(shown=MP1, lag=1, grids=grids), MP2)
        self.assertEqual((result["ok"], result["method"]), (True, "select2"))

    def test_a_grid_that_catches_up_is_ok(self):
        page = PeriodPage(shown=MP2, lag=3)
        result = self.select(page, MP1)
        self.assertEqual((result["ok"], result["method"]), (True, "select2"))
        self.assertEqual(page.grid_gp, MP1)

    def test_already_shown_needs_no_change(self):
        result = self.select(PeriodPage(shown=MP1, lag=None), MP1)
        self.assertEqual((result["ok"], result["method"]), (True, "already shown"))

    def test_already_shown_but_no_row_rendered_is_not_ok(self):
        # Finding R4d: two reads of an unrendered page used to count as a settled grid.
        page = PeriodPage(shown=MP1, rows=False)
        result = self.select(page, MP1)
        self.assertFalse(result["ok"])
        self.assertEqual(result["method"], "already shown")
        self.assertIn("did not show a settled student row", result["error"])

    def test_already_shown_but_never_settling_is_not_ok(self):
        class Flicker(PeriodPage):
            def eval_js(self, expr):
                if expr == ops._ASSIGNMENT_SIGNATURE_JS:
                    self.reads_since_switch += 1
                    return "6:0|2.%d Quiz" % self.reads_since_switch      # a new title every read
                return super().eval_js(expr)

        result = self.select(Flicker(shown=MP1), MP1)
        self.assertFalse(result["ok"])
        self.assertIn("did not show a settled student row", result["error"])

    def test_already_shown_and_rendered_but_empty_is_ok_here(self):
        # An empty marking period (MP2 before the move) is a rendered grid: ok here; whether
        # its columns are right is the callers' evidence check (finding R4b).
        page = PeriodPage(shown=MP2, grids={MP2: _row(("0", ""), ("1", ""))})
        self.assertTrue(self.select(page, MP2)["ok"])

    def test_no_settled_row_before_the_switch_is_not_ok(self):
        page = PeriodPage(shown=MP2, rows=False)
        result = self.select(page, MP1)
        self.assertFalse(result["ok"])
        self.assertIn("before the switch", result["error"])
        self.assertEqual(page.gp, MP2)          # nothing was switched

    def test_two_periods_without_columns_cannot_be_told_apart(self):
        page = PeriodPage(shown=MP2, lag=0, grids={MP1: _row(), MP2: _row()})
        self.assertFalse(self.select(page, MP1)["ok"])
        page = PeriodPage(shown=MP2, lag=0, grids={MP1: _row(("0", "")), MP2: _row(("0", ""), ("1", ""))})
        self.assertFalse(self.select(page, MP1)["ok"])     # placeholder cells carry no identity


class TestGridIdentity(unittest.TestCase):
    def test_identity_is_the_set_of_index_title_pairs(self):
        self.assertEqual(ops._grid_identity("7:0|2.4 Quiz" + chr(10) + "1|2.5 Quiz"),
                         frozenset({"0|2.4 Quiz", "1|2.5 Quiz"}))
        self.assertEqual(ops._grid_identity("5:"), frozenset())       # rendered, no column
        self.assertIsNone(ops._grid_identity("0:"))                    # no student row yet
        self.assertIsNone(ops._grid_identity(None))


class TitlesPage:
    def __init__(self, titles):
        self.titles = titles
        self.evals = 0

    def eval_js(self, expr):
        self.evals += 1
        if expr == ops._VISIBLE_TITLES_JS and self.titles is not None:
            return json.dumps(self.titles)
        return None


class TestViewContentMatches(unittest.TestCase):
    view = {"quarter": "Q1", "grading_period_id": MP1}

    def test_a_title_filed_elsewhere_on_the_grid_fails(self):
        page = TitlesPage(["2.1 Day 1 Quiz", "2.4 Quiz"])
        self.assertFalse(ops.view_content_matches(page, self.view, {"2.1 Day 1 Quiz"}, {"2.4 Quiz"}))
        self.assertIn("filed in another marking period (2.4 Quiz)",
                      ops.view_content_problem(page, self.view, {"2.1 Day 1 Quiz"}, {"2.4 Quiz"}))

    def test_none_of_the_titles_filed_here_fails(self):
        page = TitlesPage(["9.9 Quiz"])
        self.assertFalse(ops.view_content_matches(page, self.view, {"2.1 Day 1 Quiz", "1.1 Quiz"}, set()))

    def test_a_title_filed_here_and_none_elsewhere_passes(self):
        page = TitlesPage(["2.1 Day 1 Quiz", "3.1 Quiz"])
        self.assertTrue(ops.view_content_matches(page, self.view, {"2.1 Day 1 Quiz"}, {"2.4 Quiz"}))
        self.assertTrue(ops.view_content_matches(page, self.view, set(), {"2.4 Quiz"}))

    def test_nothing_registered_reads_nothing(self):
        page = TitlesPage(None)
        self.assertTrue(ops.view_content_matches(page, self.view, set(), set()))
        self.assertEqual(page.evals, 0)

    def test_unreadable_titles_fail(self):
        self.assertFalse(ops.view_content_matches(TitlesPage(None), self.view, {"1.1 Quiz"}, set()))


# Runs each step on ONE parse of the capture: set the given aria-labels, then evaluate the
# expressions. Only our expressions run (no page scripts).
_GRID_JS_NODE = r"""
const fs = require('fs');
const {JSDOM} = require('jsdom');
const steps = JSON.parse(fs.readFileSync(0, 'utf8'));
const dom = new JSDOM(fs.readFileSync('tests/fixtures/schoology-gradebook-apstats-sec1.html', 'utf8'),
                      {runScripts: 'outside-only'});
const doc = dom.window.document;
const out = [];
for (const step of steps) {
  for (const [selector, label] of Object.entries(step.labels)) doc.querySelector(selector).setAttribute('aria-label', label);
  const result = {};
  for (const [name, expr] of Object.entries(step.exprs)) result[name] = dom.window.eval(expr);
  out.push(result);
}
process.stdout.write(JSON.stringify(out));
dom.window.close();
"""

# Row 0's raw cells, to check the _signature_of oracle against the real JS.
_ROW0_CELLS_JS = r"""(function(){
  var cells = document.querySelectorAll('[role="gridcell"][data-y="0"]');
  var out = [];
  for (var i = 0; i < cells.length; i++) out.push([cells[i].getAttribute('data-x') || '', cells[i].getAttribute('aria-label')]);
  return JSON.stringify(out);
})()"""


@unittest.skipIf(shutil.which("node") is None, "node is not installed")
class TestGridJsOnTheCapturedGradebook(unittest.TestCase):
    """The grid JS runs on the real capture (a syntax error would only show live)."""

    def _run(self, steps):
        result = subprocess.run(["node", "-e", _GRID_JS_NODE], input=json.dumps(steps), text=True,
                                encoding="utf-8", capture_output=True, check=True, cwd=REPO_ROOT, timeout=180)
        return json.loads(result.stdout)

    def test_signature_is_index_and_title_only(self):
        sig, titles, cells = ops._ASSIGNMENT_SIGNATURE_JS, ops._VISIBLE_TITLES_JS, _ROW0_CELLS_JS
        out = self._run([
            {"labels": {"#grader-grid-cell-0-0": "Student, 2.4 Quiz, 90 out of 100 points",
                        "#grader-grid-cell-1-0": "Student, 2.5 Quiz"},
             "exprs": {"signature": sig, "titles": titles, "cells": cells}},
            # Finding R4a: the score changes, the identity does not.
            {"labels": {"#grader-grid-cell-0-0": "Student, 2.4 Quiz, 80 out of 100 points"},
             "exprs": {"signature": sig}},
            # A marking period without columns: only Schoology's empty placeholder cells.
            {"labels": {"#grader-grid-cell-0-0": "", "#grader-grid-cell-1-0": ""},
             "exprs": {"signature": sig}},
        ])
        first, rescored, empty = out
        self.assertEqual(json.loads(first["titles"]), ["2.4 Quiz", "2.5 Quiz"])
        # 5 summary cells + 10 assignment cells in row 0; the summary and untitled cells
        # carry no identity, and no score reaches the signature.
        self.assertEqual(first["signature"], "15:0|2.4 Quiz" + chr(10) + "1|2.5 Quiz")
        self.assertNotIn("out of", first["signature"])
        self.assertEqual(first["signature"], _signature_of([tuple(c) for c in json.loads(first["cells"])]))
        self.assertEqual(rescored["signature"], first["signature"])
        self.assertEqual(empty["signature"], "15:")
        self.assertTrue(ops._grid_has_rows(first["signature"]))
        self.assertEqual(ops._grid_identity(empty["signature"]), frozenset())
        self.assertNotEqual(ops._grid_identity(first["signature"]), ops._grid_identity(empty["signature"]))
        self.assertFalse(ops._grid_has_rows("0:"))


if __name__ == "__main__":
    unittest.main()
