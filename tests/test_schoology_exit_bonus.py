"""Extra credit survives the offline Schoology fixture and sync planning paths."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from build_schoology_fixture import build_fixture
from schoology_components import component_grades_from_class_doc
from schoology_sync_lib import assignment_points, compute_sync_actions


def test_extra_credit_preserved_by_both_schoology_fixture_formats():
    doc = {'students': [{'studentId': 'fixture', 'lessons': [{
        'lessonKey': '1.1', 'unit': 1, 'worksheetKey': '1',
        'lessonGrade': 105, 'lessonGradeNoQuiz': 105, 'Cws': 100,
    }]}]}
    lesson = build_fixture(doc)
    component = component_grades_from_class_doc(doc)
    assert lesson == {'fixture/1.1': 105}
    assert component == {'fixture/FA:1.1': 105}
    assert assignment_points('followalong') == 100
    for targets in [lesson, component]:
        assert compute_sync_actions(targets, targets)['push'] == []
        assert compute_sync_actions(targets, {})['push']
