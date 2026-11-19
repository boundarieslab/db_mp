"""Pictures of the first page of the PDF documents in the index (sites.html).

Reads the Documents tab of db_database, downloads every published permit,
application, inspection report, report and government document whose link is
a PDF, and saves its first page as assets/docs/<DocID>.jpg. The list of
pictures the index uses is data/doc_thumbs.json; this script adds to it and
keeps what is already there (the ownership diagrams and zoning plans).

    pip install pymupdf
    python tools/doc_thumbs.py            # only documents without a picture yet
    python tools/doc_thumbs.py --again    # redo every PDF

Then commit assets/docs/ and data/doc_thumbs.json and push.
"""
import csv
import io
import json
import os
import sys
import time
import urllib.request

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit('PyMuPDF is missing: run  pip install pymupdf  and try again.')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'docs')
LIST = os.path.join(ROOT, 'data', 'doc_thumbs.json')
SHEET = ('https://docs.google.com/spreadsheets/d/e/2PACX-1vS1KaVHKy2zLYGg4Urbhm2zjZkmuATNvIqJOxuECuU0wdickEExV-'
         '8G0vL1F7xG1WKn_ADmwwfSARan/pub?gid=187064250&single=true&output=csv')
CLASSES = {'Permit', 'Permit application', 'Inspection report', 'Report', 'Government document'}
WIDTH = 480
AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) dirtybusiness.no index'


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent': AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def first_page(pdf_bytes):
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    page = doc[0]
    zoom = WIDTH / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    return pix.tobytes('jpg', jpg_quality=72)


def main():
    again = '--again' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    thumbs = {}
    if os.path.exists(LIST):
        with open(LIST, encoding='utf-8') as f:
            thumbs = json.load(f)
    rows = list(csv.DictReader(io.StringIO(get(SHEET).decode('utf-8'))))
    todo = [r for r in rows
            if r.get('Class') in CLASSES and str(r.get('Published', '')).strip().upper() == 'TRUE'
            and str(r.get('Link', '')).startswith('http')]
    made = skipped = failed = 0
    for i, r in enumerate(todo, 1):
        did = r['DocID'].strip()
        path = os.path.join(OUT, did + '.jpg')
        if not again and os.path.exists(path):
            thumbs[did] = 'assets/docs/' + did + '.jpg'
            continue
        try:
            data = get(r['Link'].strip())
            if not data.lstrip()[:5].startswith(b'%PDF'):
                skipped += 1
                print(f'[{i}/{len(todo)}] {did}: not a PDF, left without a picture')
                continue
            with open(path, 'wb') as f:
                f.write(first_page(data))
            thumbs[did] = 'assets/docs/' + did + '.jpg'
            made += 1
            print(f'[{i}/{len(todo)}] {did}: done')
        except Exception as e:  # one broken link should not stop the rest
            failed += 1
            print(f'[{i}/{len(todo)}] {did}: failed ({e})')
        time.sleep(0.5)
    with open(LIST, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(thumbs.items())), f, ensure_ascii=False, indent=0)
    print(f'\n{made} new pictures, {skipped} links that are not PDFs, {failed} failed. '
          f'{len(thumbs)} documents now have a picture in data/doc_thumbs.json.')


if __name__ == '__main__':
    main()
