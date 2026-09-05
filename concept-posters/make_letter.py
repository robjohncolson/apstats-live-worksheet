"""Center one poster on true Letter paper with a quarter-inch safe area."""
import argparse
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--pdftocairo', default='pdftocairo')
args = parser.parse_args()
temporary = args.output.with_suffix('.safe-area.tmp.pdf')

try:
    subprocess.run([
        args.pdftocairo, '-pdf', '-paperw', '576', '-paperh', '756',
        str(args.source), str(temporary),
    ], check=True)
    subprocess.run([
        args.pdftocairo, '-pdf', '-paper', 'letter', '-noshrink',
        str(temporary), str(args.output),
    ], check=True)
finally:
    temporary.unlink(missing_ok=True)
