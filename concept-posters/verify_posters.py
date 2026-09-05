"""Check the rendered poster set and its declared formula coverage against the spec.

Formula-ID declarations support traceability; they do not replace mathematical
and visual review of the typeset content. See RENDER_LOG.md for that review.
"""
from collections import defaultdict
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent
spec = (root.parent / 'CONCEPT_POSTERS_SPEC.md').read_text(encoding='utf-8')
matrix = spec.split('## 6. Coverage matrix', 1)[1].split('## 7.', 1)[0]
expected = {}
for formula_id, posters in re.findall(r'`([a-z0-9-]+)`(?: ★)? \| (P\d\d(?:, P\d\d)*)', matrix):
    expected[formula_id] = posters.split(', ')
assert len(expected) == 81, f'Expected 81 formula IDs, got {len(expected)}'

sources = sorted(root.glob('p[0-9][0-9]-*.tex'))
poster_ids = [p.name[:3].upper() for p in sources]
assert poster_ids == [f'P{i:02}' for i in range(1, 16)], poster_ids
actual = defaultdict(list)
colors = ['UnitGreen'] * 3 + ['UnitBlue'] * 5 + ['UnitOrange'] * 4 + ['UnitPurple'] + ['UnitRed'] * 2
summary = []
for source, poster_id, color in zip(sources, poster_ids, colors):
    text = source.read_text(encoding='utf-8')
    declarations = re.findall(r'^% Formula IDs:\s*(.*)$', text, re.MULTILINE)
    assert declarations, f'{poster_id}: missing Formula IDs declaration'
    ids = [item.strip() for item in ','.join(declarations).split(',')]
    ids = [item for item in ids if item and not item.startswith('none')]
    assert len(ids) == len(set(ids)), f'{poster_id}: repeated ID declaration'
    for formula_id in ids:
        actual[formula_id].append(poster_id)
    assert f'\\colorlet{{PosterAccent}}{{{color}}}' in text, f'{poster_id}: accent color'
    assert '\\WorksheetTag{' in text, f'{poster_id}: missing worksheet tag'
    for zone in ['A', 'B', 'C', 'D']:
        assert f'ZONE {zone}' in text, f'{poster_id}: missing zone {zone}'
    if poster_id in ['P03', 'P06', 'P12', 'P15']:
        assert '\\BeyondBox{' in text, f'{poster_id}: missing gold corner'
    if poster_id in ['P09', 'P10']:
        assert '\\InferenceSubstripes' in text, f'{poster_id}: missing inference stripes'

    log = root / 'rendered' / f'{source.stem}.log'
    assert log.exists(), f'{poster_id}: missing build log; run make -B ENGINE=xelatex'
    bad_lines = [line for line in log.read_text(encoding='utf-8', errors='replace').splitlines()
                 if re.search(r'Overfull|Missing character|^!', line, re.IGNORECASE)]
    assert not bad_lines, f'{poster_id}: {bad_lines}'
    for suffix, dimensions in [('.pdf', (1584, 2016)), ('-letter.pdf', (612, 792))]:
        pdf = root / 'rendered' / f'{source.stem}{suffix}'
        info = subprocess.check_output(['pdfinfo', str(pdf)], text=True)
        pages = int(re.search(r'Pages:\s+(\d+)', info).group(1))
        size = tuple(map(float, re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', info).groups()))
        assert pages == 1 and size == dimensions, (pdf.name, pages, size)
        bbox = subprocess.check_output(['pdftotext', '-bbox', str(pdf), '-'])
        words = [node for node in ET.fromstring(bbox).iter() if node.tag.endswith('}word')]
        assert words, f'{pdf.name}: no extractable text'
        margin = 17.5 if suffix == '-letter.pdf' else 0
        for word in words:
            x0, y0, x1, y1 = (float(word.attrib[k]) for k in ['xMin', 'yMin', 'xMax', 'yMax'])
            assert x0 >= margin and y0 >= margin and x1 <= size[0] - margin and y1 <= size[1] - margin, (pdf.name, word.text, word.attrib)
    assert (root / 'rendered' / f'{source.stem}.png').exists(), f'{poster_id}: missing PNG'
    summary.append({'poster': poster_id, 'formula_ids': ids, 'poster_pages': 1, 'letter_pages': 1,
                    'sizes_and_text_bounds': 'PASS', 'log': 'PASS'})

assert dict(actual) == expected, {'missing_or_wrong': {key: (posters, actual.get(key))
    for key, posters in expected.items() if actual.get(key) != posters},
    'unexpected': sorted(set(actual) - set(expected))}
for suffix, dimensions in [('.pdf', (1584, 2016)), ('-letter.pdf', (612, 792))]:
    pdf = root / 'rendered' / f'apstats-concept-poster-mockups{suffix}'
    info = subprocess.check_output(['pdfinfo', str(pdf)], text=True)
    assert int(re.search(r'Pages:\s+(\d+)', info).group(1)) == 15, pdf.name
    size = tuple(map(float, re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', info).groups()))
    assert size == dimensions, (pdf.name, size)
    text_pages = subprocess.check_output(['pdftotext', str(pdf), '-']).decode('utf-8').split('\f')
    for poster_id, page in zip(poster_ids, text_pages):
        assert re.search(rf'\b{poster_id}\b', page), (pdf.name, poster_id)
    assert len([page for page in text_pages if page.strip()]) == 15, pdf.name

(root / 'qa-summary.json').write_text(json.dumps({'formula_ids': 81, 'placements': sum(map(len, expected.values())),
    'combined_pages_each': 15, 'posters': summary}, indent=2) + '\n', encoding='utf-8')
print('PASS: 15 posters; 81 formula IDs / 83 prescribed placements; 30 one-page PDFs; both ordered 15-page collections; no overflow or missing glyphs.')
