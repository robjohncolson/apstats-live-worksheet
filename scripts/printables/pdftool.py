"""Small pymupdf helper for the print-set build. JSON on stdout, nonzero exit on error.

Usage (run with PYTHONIOENCODING=utf-8):
  python pdftool.py info <pdf>
  python pdftool.py text <pdf>
  python pdftool.py strip-links <pdf>
  python pdftool.py pack <spec.json>
  python pdftool.py png <pdf> <dir>
"""
import json
import os
import sys
import tempfile
from pathlib import Path

import pymupdf

PNG_DPI = 90


def first_line(page):
    for line in page.get_text().splitlines():
        if line.strip():
            return line.strip()
    return ""


def cmd_info(pdf):
    with pymupdf.open(pdf) as doc:
        return {
            "pages": len(doc),
            "links": sum(len(page.get_links()) for page in doc),
            "firstLines": [first_line(page) for page in doc],
        }


def cmd_text(pdf):
    with pymupdf.open(pdf) as doc:
        return {"pages": [page.get_text() for page in doc]}


def cmd_strip_links(pdf):
    doc = pymupdf.open(pdf)
    for page in doc:
        for link in page.get_links():
            page.delete_link(link)
    remaining = sum(len(page.get_links()) for page in doc)

    handle, temp_path = tempfile.mkstemp(suffix=".pdf", dir=os.path.dirname(os.path.abspath(pdf)))
    os.close(handle)
    doc.save(temp_path, garbage=4, deflate=True)
    doc.close()
    os.replace(temp_path, pdf)
    return {"links": remaining}


def cmd_pack(spec_path):
    spec = json.loads(Path(spec_path).read_text(encoding="utf-8"))
    out = pymupdf.open()
    for part in spec["parts"]:
        with pymupdf.open(part["pdf"]) as source:
            for page_number in part["pages"]:
                out.insert_pdf(source, from_page=page_number - 1, to_page=page_number - 1)
    out.save(spec["out"], garbage=4, deflate=True)
    pages = len(out)
    out.close()
    return {"pages": pages}


def cmd_png(pdf, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    stem = Path(pdf).stem
    files = []
    with pymupdf.open(pdf) as doc:
        for number, page in enumerate(doc, start=1):
            path = os.path.join(out_dir, f"{stem}-p{number}.png")
            page.get_pixmap(dpi=PNG_DPI).save(path)
            files.append(path)
    return {"files": files}


def run(argv):
    if len(argv) < 3:
        raise SystemExit(__doc__)
    command, args = argv[1], argv[2:]
    if command == "info":
        return cmd_info(args[0])
    if command == "text":
        return cmd_text(args[0])
    if command == "strip-links":
        return cmd_strip_links(args[0])
    if command == "pack":
        return cmd_pack(args[0])
    if command == "png" and len(args) == 2:
        return cmd_png(args[0], args[1])
    raise SystemExit(f"pdftool: unknown command or wrong arguments: {' '.join(argv[1:])}\n{__doc__}")


if __name__ == "__main__":
    try:
        result = run(sys.argv)
    except SystemExit:
        raise
    except Exception as error:
        print(f"pdftool error: {error}", file=sys.stderr)
        sys.exit(1)
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
