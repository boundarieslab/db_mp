"""Pictures of the first page of the PDF documents in the index (sites.html).

Reads the Documents tab of db_database, downloads every published permit,
application, inspection report, report and government document whose link is
a PDF, and saves its first page as assets/docs/<DocID>.jpg. The list of
pictures the index uses is data/doc_thumbs.json; this script adds to it and
keeps what is already there.

    pip install pymupdf
    python tools/doc_thumbs.py            # only documents without a picture yet
    python tools/doc_thumbs.py --again    # redo every PDF

Names of private people are blacked out before the page is turned into a
picture, so the picture never holds them. On each first page the script looks
in the address block for a letter sent to a private person: a line that reads
like a person's name, first in its block, followed by a home address. It
blacks out the name and the address wherever they appear on the page.
Officials and company staff, named in their work (under "Saksbehandler", under
a company name, as contact persons), are left as they are. What it blacks out is written to
data/doc_redact.csv, one row per text:

    DocID,Text,Redact,Why
    PA_0003,Ola Nordmann,1,auto
    PA_0003,Storgata 12,1,auto

Set Redact to 0 to leave a text visible (a company it took for a person), or
add a row with Redact 1 for anything else to black out (a name it missed),
then run again with --again. Every occurrence of the text on the page is
covered.

The issuer named in each letterhead (Fylkesmannen i Oslo og Viken,
Direktoratet for mineralforvaltning, a company, a consultant) is written to
data/doc_authors.json; the index shows it under the title when the sheet's
Creator column is empty. A Creator in the sheet always wins.

Then commit assets/docs/, data/doc_thumbs.json, data/doc_redact.csv and
data/doc_authors.json and push.
"""
import re
import csv
import io
import json
import os
import sys
import time
import urllib.request

try:
    import pymupdf as fitz  # PyMuPDF 1.24 and later
except ImportError:
    try:
        import fitz  # older PyMuPDF
    except ImportError:
        fitz = None
if fitz is None:
    sys.exit('PyMuPDF is missing: run  pip install pymupdf  and try again.')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'docs')
LIST = os.path.join(ROOT, 'data', 'doc_thumbs.json')
REDACT = os.path.join(ROOT, 'data', 'doc_redact.csv')
AUTHORS = os.path.join(ROOT, 'data', 'doc_authors.json')
SHEET = ('https://docs.google.com/spreadsheets/d/e/2PACX-1vS1KaVHKy2zLYGg4Urbhm2zjZkmuATNvIqJOxuECuU0wdickEExV-'
         '8G0vL1F7xG1WKn_ADmwwfSARan/pub?gid=187064250&single=true&output=csv')
CLASSES = {'Permit', 'Permit application', 'Mining licence', 'Inspection report', 'Report', 'Government document'}
WIDTH = 480
AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) dirtybusiness.no index'


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent': AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


# A line that reads like a person's name: two to four capitalised words or initials.
NAME = re.compile(r"^(?:[A-ZÆØÅ][a-zæøåäöüé]+|[A-ZÆØÅ]\.)(?:[ -](?:[A-ZÆØÅ][a-zæøåäöüé]+|[A-ZÆØÅ]\.|von|van|de|af)){1,3}$")
# Words that make a line a company, a public body or a heading, not a person.
NOT_A_PERSON = re.compile(
    r"\b(as|asa|ans|da|ks|iks|kf|sa|ba|kommune|fylkeskommune|statsforvalteren|fylkesmannen|direktorat\w*|"
    r"departement\w*|etat\w*|milj\w*|avfall\w*|pukk\w*|grus\w*|masse\w*|deponi\w*|eiendom\w*|holding|gruppen|"
    r"group|norge|norway|bane|vegvesen|nor|consult|multiconsult|cowi|ngi|sweco|ramb\w*|asplan|norconsult|"
    r"entrepren\w*|anlegg|vedlegg|tillatelse|vedtak|s\u00f8knad|h\u00f8ring|oversendelse|avdeling|seksjon|postboks|"
    r"saksbehandler|deres|v\u00e5r|ref|dato|telefon|side|kopi|mottaker\w*|innhold|rapport|notat|sak|"
    r"oslo|viken|akershus|vestfold|telemark|innlandet|buskerud|\u00f8stfold)\b", re.I)
ADDRESS = re.compile(r"\d")


def lines_of(page):
    out = []
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            text = ' '.join(sp['text'] for sp in line['spans']).strip()
            text = re.sub(r'\s+', ' ', text)
            if text:
                out.append((text, fitz.Rect(line['bbox'])))
    return out


def people_on(page):
    """A private person the letter is addressed to: in the address block, a line that reads
    like a name, standing first in its block (no company, office or label just above it)
    and followed by a street or postcode line. Names of officials and of company staff,
    which sit under a label or a company, are left as they are."""
    found, lines = [], lines_of(page)
    top = page.rect.height * 0.45
    for i, (text, box) in enumerate(lines):
        if box.y1 > top or not NAME.match(text) or NOT_A_PERSON.search(text):
            continue
        above = [b2 for t2, b2 in lines[:i] if abs(b2.x0 - box.x0) < 20 and 0 <= box.y0 - b2.y1 < 18]
        if above:  # under a company, an office or a label such as "Saksbehandler:" - a person at work
            continue
        block = []
        last = box
        for t2, b2 in lines[i + 1:i + 4]:  # the address right under the name
            if abs(b2.x0 - box.x0) < 20 and 0 <= b2.y0 - last.y1 < 18 and ADDRESS.search(t2) \
                    and not re.search(r'postboks|pb\.', t2, re.I):
                block.append(t2)
                last = b2
            else:
                break
        if block:  # a name with a home address: a private person
            found += [text] + block
    return found


# A letterhead names who issued the document.
ISSUER = re.compile(r"fylkesmann|statsforvalter|direktorat|kommune|departement|tilsyn|etaten|vegvesen|bane nor|"
                    r"\b(as|asa|iks|kf)\b|consult|cowi|ngi\b|sweco|ramb\u00f8ll|norconsult|asplan|multiconsult", re.I)


def issuer_of(page):
    """Who issued the document, read from the letterhead: the largest text near the top that names a body."""
    best = None
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            text = re.sub(r'\s+', ' ', ' '.join(sp['text'] for sp in line['spans'])).strip()
            size = max((sp['size'] for sp in line['spans']), default=0)
            if not text or line['bbox'][1] > page.rect.height * .2 or len(text) > 70 or not ISSUER.search(text):
                continue
            if re.search(r'postboks|telefon|e-post|www\.|dato|ref', text, re.I):
                continue
            if best is None or size > best[0] + .1:
                best = (size, text)
    return best[1] if best else ''


def read_rules():
    rules = {}
    if os.path.exists(REDACT):
        with open(REDACT, encoding='utf-8', newline='') as f:
            for r in csv.DictReader(f):
                rules.setdefault(r['DocID'].strip(), {})[r['Text'].strip()] = (r.get('Redact', '1').strip() != '0',
                                                                              r.get('Why', '').strip() or 'manual')
    return rules


def write_rules(rules):
    with open(REDACT, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(['DocID', 'Text', 'Redact', 'Why'])
        for did in sorted(rules):
            for text, (on, why) in sorted(rules[did].items()):
                w.writerow([did, text, 1 if on else 0, why])


def first_page(pdf_bytes, did, rules):
    """The first page as a JPEG, with private names blacked out; returns (jpeg, (texts covered, scanned))."""
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    page = doc[0]
    mine = rules.setdefault(did, {})
    for text in people_on(page):
        mine.setdefault(text, (True, 'auto'))
    covered = 0
    for text, (on, _) in mine.items():
        if not on:
            continue
        for r in page.search_for(text):
            page.draw_rect(r + (-1.5, -1, 1.5, 1), color=(0, 0, 0), fill=(0, 0, 0), overlay=True)
            covered += 1
    zoom = WIDTH / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    scanned = not page.get_text().strip()  # a scanned page has no text to find names in
    return pix.tobytes('jpg', jpg_quality=72), (covered, scanned, issuer_of(page))


def main():
    again = '--again' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    thumbs = {}
    if os.path.exists(LIST):
        with open(LIST, encoding='utf-8') as f:
            thumbs = json.load(f)
    rules = read_rules()
    authors = {}
    if os.path.exists(AUTHORS):
        with open(AUTHORS, encoding='utf-8') as f:
            authors = json.load(f)
    rows = list(csv.DictReader(io.StringIO(get(SHEET).decode('utf-8'))))
    todo = [r for r in rows
            if r.get('Class') in CLASSES and str(r.get('Published', '')).strip().upper() == 'TRUE'
            and str(r.get('Link', '')).startswith('http')]
    made = skipped = failed = 0
    scans = []
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
            jpg, (covered, scanned, issuer) = first_page(data, did, rules)
            if issuer:
                authors[did] = issuer
            if scanned:
                scans.append(did)
            with open(path, 'wb') as f:
                f.write(jpg)
            thumbs[did] = 'assets/docs/' + did + '.jpg'
            made += 1
            print(f'[{i}/{len(todo)}] {did}: done' + (f', {covered} text(s) blacked out' if covered else '')
                  + (', SCANNED: look at it yourself' if scanned else ''))
        except Exception as e:  # one broken link should not stop the rest
            failed += 1
            print(f'[{i}/{len(todo)}] {did}: failed ({e})')
        time.sleep(0.5)
    write_rules(rules)
    with open(AUTHORS, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(authors.items())), f, ensure_ascii=False, indent=0)
    with open(LIST, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(thumbs.items())), f, ensure_ascii=False, indent=0)
    print(f'\n{made} new pictures, {skipped} links that are not PDFs, {failed} failed. '
          f'{len(thumbs)} documents now have a picture in data/doc_thumbs.json. '
          f'Check data/doc_redact.csv for what was blacked out.')
    if scans:
        print('Scanned pages, where no name can be found automatically - open these pictures and look:',
              ', '.join(scans))


if __name__ == '__main__':
    main()
