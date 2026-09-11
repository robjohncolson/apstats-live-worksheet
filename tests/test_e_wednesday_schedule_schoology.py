"""E Wednesday shared dates preserve per-topic Schoology identity, offline only."""
import json
import sys
from pathlib import Path
import pytest
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from schoology_components import component_columns
from schoology_sync_section import build_scope, filter_scope_through
from schoology_sync_lib import plan_assignment_work, compute_sync_actions
from build_schoology_fixture import build_fixture

@pytest.mark.parametrize("period", ["B", "E"])
def test_shared_day_assignments_remain_distinct_and_idempotent(period):
    schedule = json.loads((ROOT / "data/lesson-schedule.json").read_text(encoding="utf-8"))
    scope = build_scope(schedule, "Period" + period)
    keys = [item["key"] for item in scope]
    by_key = {item["key"]: item for item in scope}
    assert len(keys) == len(set(keys))
    for group in schedule["dayGroups"][period]:
        date = schedule["lessons"][group[0]]["periods"][period]
        assert {by_key[t]["due_date"] for t in group} == {date}
        assert keys.index(group[0]) < keys.index(group[1])
        assert set(group) <= {item["key"] for item in filter_scope_through(scope, date)}
        assert "+".join(group) not in by_key
    plan = plan_assignment_work(keys, {})
    existing = {key: {"schoology_assignment_id": "fixture-" + key} for key in plan["create"]}
    assert plan_assignment_work(keys, existing)["create"] == []

@pytest.mark.parametrize("group,date", [(["1.4", "1.5"], "2026-09-16"), (["1.7", "1.8"], "2026-09-23")])
def test_two_follow_alongs_and_fixture_grades_round_trip(group, date):
    schedule = json.loads((ROOT / "data/lesson-schedule.json").read_text(encoding="utf-8"))
    cols = component_columns(schedule["lessons"], "E", quiz_topics=set(), blooket_topics=set(),
                             progress_checks=schedule["progressChecks"], posters=schedule["posters"])
    by_key = {col["key"]: col for col in cols}
    for topic in group:
        assert by_key["FA:" + topic]["due_date"] == date
        assert by_key["FA:" + topic]["topic_keys"] == [topic]
    doc = {"students": [{"studentId": "fixture", "lessons": [
        {"topicKey": topic, "lessonGrade": 80 + i, "dueDate": date} for i, topic in enumerate(group)]}]}
    fixture = build_fixture(json.loads(json.dumps(doc)))
    assert fixture == {"fixture/" + group[0]: 80, "fixture/" + group[1]: 81}
    assert compute_sync_actions(fixture, dict(fixture))["push"] == []
