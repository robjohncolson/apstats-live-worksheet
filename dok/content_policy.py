"""Authoring guard and legacy schema names for self-contained DOK sheets."""
import re

LEGACY_EXPLORE_KEY = "video_worksheet"
FORBIDDEN = re.compile("video", re.IGNORECASE)
WORKSHEET_FILENAME = re.compile(r"[\w.-]+_live\.html", re.IGNORECASE)


def validate_field_values(value, path="", worksheet=False):
    """Check every nested value; only actual worksheet filenames are exempt."""
    if isinstance(value, dict):
        errors = []
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else str(key)
            errors.extend(validate_field_values(child, child_path, key in ("worksheet", "worksheets")))
        return errors
    if isinstance(value, list):
        return [error for i, child in enumerate(value)
                for error in validate_field_values(child, f"{path}[{i}]", worksheet)]
    if not isinstance(value, str):
        return []
    if worksheet and WORKSHEET_FILENAME.fullmatch(value):
        return []
    if FORBIDDEN.search(value):
        return [f"{path}: forbidden video reference; use the printed rules, stem, or visual"]
    return []


def validate_printed_text(text):
    """Links may contain legacy filenames; surrounding prose must stand alone."""
    prose = WORKSHEET_FILENAME.sub("", text)
    if FORBIDDEN.search(prose):
        return ["emitted TeX: forbidden video reference outside a worksheet filename"]
    return []
