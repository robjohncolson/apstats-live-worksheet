"""Remove generated poster files without relying on a platform-specific shell."""
from pathlib import Path

root = Path(__file__).resolve().parent
rendered = (root / 'rendered').resolve()
if rendered.parent != root:
    raise SystemExit('The rendered directory must stay inside concept-posters.')

generated_suffixes = {'.aux', '.log', '.out', '.xdv', '.pdf', '.png'}
if rendered.exists():
    for path in rendered.iterdir():
        if path.is_file() and path.suffix in generated_suffixes:
            path.unlink()
