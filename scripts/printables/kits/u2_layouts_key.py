"""Build the Unit 2 poster layouts ANSWER KEY from the student sheet.

Reads  u2_poster/poster_layouts.html  (never modified) and the answers in
u2_layouts_key.json (next to this script), and writes the key HTML.

Usage:
    python scripts/printables/kits/u2_layouts_key.py [--out PATH] [--student PATH]

Defaults: --out = u2_poster/poster_layouts_key.html, --student = u2_poster/poster_layouts.html
(both found from this script's location, not the current directory).

Answers are keyed poster -> zone -> blanks / choices. A zone is one
`<div class="zone ...">` box. Its id is the checklist number (for example "✓3");
boxes with no ✓ use their extra css class ("title", "claim", "verdict").
Anything before the first box is the "outside" bucket. If a zone's number of
blanks or choices on the sheet differs from the JSON, the script stops and names
the poster, zone and counts. A missing zone or bucket in the JSON means "none".
An empty-string answer leaves that blank empty in the key.
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
JSON_PATH = HERE / 'u2_layouts_key.json'

KEY_CSS = '''  .k { color: #c62828; font-family: 'Comic Sans MS', 'Segoe UI', sans-serif; font-weight: 700; font-size: 0.95em; border-bottom: 1.5px solid #333; padding: 0 0.15em; line-height: 1.2; }
  td .k { border-bottom: none; padding: 0; }
  .zone p, .zone li { line-height: 1.3; }
  .pick { color: #c62828; font-weight: 700; border: 2px solid #c62828; border-radius: 999px; padding: 0 0.3em; white-space: nowrap; }
  .keytag { color: #c62828; }
  td.circ .k { border: 2px solid #c62828; border-radius: 999px; padding: 0 0.3em; }
</style>'''

LEAD = ('<p class="lead"><b>Answer key.</b> Red handwriting = a correct answer; a red circle = the right choice. '
        'Sentences in red are model answers: accept any wording that says the same thing.</p>')

ZONE_OPEN = re.compile(r'<div class="(zone[^"]*)">')
CHECK_LABEL = re.compile(r'<span class="ck">(✓\d+)</span>')
CHOICE = re.compile(r'\(([^()<>]*? / [^()<>]*?)\)')
BLANK = re.compile(r'<span class="bw?"></span>')


def k(v):
    return f'<span class="k">{v}</span>'


def one(s, a, b):
    assert s.count(a) == 1, (s.count(a), a[:80])
    return s.replace(a, b)


# ---------------- per-poster table / svg edits ----------------
def p1(s):
    pcts = ['24.7%', '25.7%', '22.4%', '16.9%', '27.9%', '23.6%']
    it = iter(pcts)
    s = re.sub(r'</td><td></td></tr>', lambda m: '</td><td>' + k(next(it)) + '</td></tr>', s)
    # Segmented bars, top to bottom Famous / Happy / Healthy / Rich
    data = [(44, [5.6, 53.9, 15.7, 24.7]), (88, [3.0, 62.4, 8.9, 25.7]), (132, [3.1, 63.3, 11.2, 22.4]),
            (176, [5.2, 55.8, 22.1, 16.9]), (220, [0.0, 72.1, 0.0, 27.9])]
    cols = ['#f9a825', '#90caf9', '#a5d6a7', '#ef9a9a']
    rects = ''
    for x, ps in data:
        y = 8.0
        for p, c in zip(ps, cols):
            h = 122 * p / 100
            if h > 0:
                rects += f'<rect x="{x}" y="{y:.1f}" width="30" height="{h:.1f}" fill="{c}" stroke="#333" stroke-width="0.5"/>'
            y += h
        rects += f'<text x="{x + 15}" y="{130 - 122 * ps[3] / 200:.1f}" font-size="9" text-anchor="middle" fill="#111">{ps[3]}</text>'
    s = one(s, '</g>\n        <g font-size="10" fill="#111" text-anchor="middle">\n          <text x="59" y="144">Fly</text>',
            '</g>\n        ' + rects + '\n        <g font-size="10" fill="#111" text-anchor="middle">\n          <text x="59" y="144">Fly</text>')
    for y, c in zip((26, 44, 62, 80), cols):
        s = one(s, f'<rect x="272" y="{y}" width="11" height="11" fill="none"', f'<rect x="272" y="{y}" width="11" height="11" fill="{c}"')
    return s


COUNTS = [('Fly', [5, 48, 14, 22, 89]), ('Freeze', [3, 63, 9, 26, 101]), ('Invis.', [3, 62, 11, 22, 98]),
          ('Strength', [4, 43, 17, 13, 77]), ('Telep.', [0, 49, 0, 19, 68]), ('Total', [15, 265, 51, 102, 433])]


def p2_rows(shade):
    out = ''
    for name, vals in COUNTS:
        out += f'<tr><td class="l">{name}</td>'
        for c, v in enumerate(vals):
            cls = []
            if shade == 'col' and c == 0 and name != 'Total':
                cls.append('shade')
            if shade == 'row' and name == 'Fly' and c < 4:
                cls.append('shade')
            if name == 'Fly' and c == 0:
                cls.append('circ')
            ca = f' class="{" ".join(cls)}"' if cls else ''
            out += f'<td{ca}>{k(v)}</td>'
        out += '</tr>'
    return out


def p2(s):
    blank = ''.join(f'<tr><td class="l">{n}</td>' + '<td></td>' * 5 + '</tr>' for n, _ in COUNTS)
    assert s.count(blank) == 2
    s = s.replace(blank, p2_rows('col'), 1)
    s = s.replace(blank, p2_rows('row'), 1)
    return s


def p3(s):
    s = one(s, '<tr><td class="l">Sport</td><td></td><td></td><td></td></tr>',
            f'<tr><td class="l">Sport</td><td>{k(30)}</td><td>{k(30)}</td><td>{k(60)}</td></tr>')
    s = one(s, '<tr><td class="l">No sport</td><td></td><td></td><td></td></tr>',
            f'<tr><td class="l">No sport</td><td>{k(20)}</td><td>{k(20)}</td><td>{k(40)}</td></tr>')
    s = one(s, '<tr><td class="l">Total</td><td></td><td></td><td>100</td></tr></table>',
            f'<tr><td class="l">Total</td><td>{k(50)}</td><td>{k(50)}</td><td>100</td></tr></table>'
            '<p class="say">One of many: any table where both = P(sport)·P(instrument)·100 works.</p>')
    return s


def p4(s):
    return one(s, '<text x="92" y="98">____</text><text x="147" y="98">____</text><text x="203" y="98">____</text><text x="262" y="146">____</text>',
               '<g fill="#c62828" font-weight="bold"><text x="92" y="98">448</text><text x="147" y="98">245</text>'
               '<text x="203" y="98">442</text><text x="262" y="146">1,365</text></g>')


def p5(s):
    s = one(s, '<tr><td class="l">x (net $)</td><td></td><td></td><td></td></tr>',
            f'<tr><td class="l">x (net $)</td><td>{k("+8")}</td><td>{k("+1")}</td><td>{k("−2")}</td></tr>')
    s = one(s, '<tr><td class="l">P(x)</td><td></td><td></td><td></td></tr>',
            f'<tr><td class="l">P(x)</td><td>{k("1/6")}</td><td>{k("1/6")}</td><td>{k("4/6")}</td></tr>')
    s = one(s, '<tr><td class="l">6</td><td></td><td></td></tr>',
            f'<tr><td class="l">6</td><td>{k("8/6 ≈ 1.33")}</td><td>{k("(47/6)²·1/6 ≈ 10.23")}</td></tr>')
    s = one(s, '<tr><td class="l">1</td><td></td><td></td></tr>',
            f'<tr><td class="l">1</td><td>{k("1/6 ≈ 0.17")}</td><td>{k("(5/6)²·1/6 ≈ 0.12")}</td></tr>')
    s = one(s, '<tr><td class="l">2 to 5</td><td></td><td></td></tr>',
            f'<tr><td class="l">2 to 5</td><td>{k("−8/6 ≈ −1.33")}</td><td>{k("(13/6)²·4/6 ≈ 3.13")}</td></tr>')
    s = one(s, '<td>μ<sub>X</sub> =</td><td>sum =</td>', f'<td>μ<sub>X</sub> = {k("1/6")}</td><td>sum = {k("13.47")}</td>')
    s = one(s, 'our average of 20 = ____</text>', 'our average of 20 = <tspan fill="#c62828" font-weight="bold">varies</tspan></text>')
    s = one(s, '<tspan dy="-2"> = ____</tspan>', '<tspan dy="-2"> = </tspan><tspan fill="#c62828" font-weight="bold">0.17</tspan>')
    return s


def p6(s):
    return one(s, '</table></div>',
               '</table><p class="say">' + k('Answers vary: most longest runs are 3 to 5; about 3 of 25 trials reach 6 or more.') + '</p></div>')


EDITS = {1: p1, 2: p2, 3: p3, 4: p4, 5: p5, 6: p6}


# ---------------- zones ----------------
def zone_label(opening_class, text, ordinal):
    """Sturdiest id first: the checklist number, then the extra css class, then the ordinal."""
    check = CHECK_LABEL.search(text.split('</h3>', 1)[0])
    if check:
        return check.group(1)
    extra = [c for c in opening_class.split() if c not in ('zone', 'wide')]
    if extra:
        return '-'.join(extra)
    return f'zone#{ordinal}'


def split_zones(body):
    """Return [('outside', text), (label, text), ...]; the pieces join back into body."""
    opens = list(ZONE_OPEN.finditer(body))
    if not opens:
        return [('outside', body)]
    pieces = [('outside', body[:opens[0].start()])]
    ends = [m.start() for m in opens[1:]] + [len(body)]
    for ordinal, (m, end) in enumerate(zip(opens, ends), 1):
        text = body[m.start():end]
        pieces.append((zone_label(m.group(1), text, ordinal), text))
    return pieces


def check_count(poster, label, what, found, wanted):
    if found == wanted:
        return
    where = 'outside any zone' if label == 'outside' else f'zone {label}'
    sys.exit(f'Poster {poster} {where}: sheet has {found} {what}, key has {wanted}')


def fill_piece(poster, label, text, answers):
    wanted_blanks = answers.get('blanks', [])
    wanted_picks = answers.get('choices', [])

    found = CHOICE.findall(text)
    check_count(poster, label, 'choices', len(found), len(wanted_picks))
    picks = iter(zip(found, wanted_picks))

    def pick(m):
        offered, want = next(picks)
        assert want in [o.strip() for o in offered.split('/')], (poster, label, offered, want)
        return f'<span class="pick">{want}</span>'

    text = CHOICE.sub(pick, text)

    check_count(poster, label, 'blanks', len(BLANK.findall(text)), len(wanted_blanks))
    fills = iter(wanted_blanks)

    def fill(m):
        answer = next(fills)
        if answer == '':
            return ''
        return k(answer)

    return BLANK.sub(fill, text)


def build_poster(poster, section, answers):
    s = re.sub(r'<h1>(Poster \d layout: .*?)</h1>', r'<h1>\1 <span class="keytag">· ANSWER KEY</span></h1>', section, count=1)
    s = re.sub(r'<p class="lead">.*?</p>', LEAD, s, count=1, flags=re.S)
    body, foot = s.split('<div class="foot">', 1)
    body = EDITS[poster](body)

    pieces = split_zones(body)
    labels = [label for label, _ in pieces]
    assert len(labels) == len(set(labels)), (poster, labels)

    zone_answers = answers.get('zones', {})
    known = set(labels)
    for label in zone_answers:
        if label not in known:
            sys.exit(f'Poster {poster}: key has zone {label} but the sheet has only {labels[1:]}')

    filled = []
    for label, text in pieces:
        piece_answers = answers.get('outside', {}) if label == 'outside' else zone_answers.get(label, {})
        filled.append(fill_piece(poster, label, text, piece_answers))
    return ''.join(filled) + '<div class="foot">' + foot


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--out', default=str(REPO / 'u2_poster' / 'poster_layouts_key.html'))
    parser.add_argument('--student', default=str(REPO / 'u2_poster' / 'poster_layouts.html'))
    args = parser.parse_args()

    src = Path(args.student).read_text(encoding='utf-8')
    key = json.loads(JSON_PATH.read_text(encoding='utf-8'))

    head = src.split('<body>', 1)[0]
    sections = re.findall(r'<section class="sheet">.*?</section>', src, re.S)
    assert len(sections) == 6, len(sections)

    head = head.replace('</style>', KEY_CSS, 1)
    head = head.replace('<title>Unit 2 Poster Layouts</title>', '<title>Poster Layouts Key</title>')

    out = [build_poster(n, section, key[str(n)]) for n, section in enumerate(sections, 1)]

    html = head + '<body>\n\n' + '\n\n'.join(out) + '\n\n</body>\n</html>\n'
    with open(args.out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('ok', args.out)


if __name__ == '__main__':
    main()
