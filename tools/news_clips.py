"""Newspaper clippings for the index (sites.html).

Each article is cut out of its page at the National Library (nb.no) and saved
as assets/docs/<DocID>.jpg. The list of articles is data/news_clips.json: for
each one, the page it is printed on and the rectangles that make up the
article, in the page's own pixels. An article that runs over several columns
is several rectangles; everything on the page outside them (other articles,
adverts) is left white. A whole page (`whole`) can carry a yellow box over the
article's title (`highlight`). Private names and car plates are covered in black
(`redact`). Nothing else inside the article is changed; the Note of each row says
what was done, as the licence of most issues (CC BY-NC-ND 4.0) asks.

    pip install pymupdf
    python tools/news_clips.py            # only clippings without a picture yet
    python tools/news_clips.py --again    # redo every clipping
    python tools/news_clips.py --shrink   # re-save the pictures already made (grey, smaller)

The pictures are made from the library's image server
(www.nb.no/services/image/resolver/<page>/<region>/<size>/0/default.jpg).
Then commit assets/docs/ and data/doc_thumbs.json, and push.
"""
import json
import os
import sys
import time
import urllib.request

try:
    import pymupdf as fitz  # PyMuPDF 1.24 and later
except ImportError:  # older PyMuPDF
    import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIPS = os.path.join(ROOT, 'data', 'news_clips.json')
THUMBS = os.path.join(ROOT, 'data', 'doc_thumbs.json')
OUT = os.path.join(ROOT, 'assets', 'docs')
RESOLVER = 'https://www.nb.no/services/image/resolver/'
MAX_W = 1600      # width of the saved picture, at most
QUALITY = 72      # newspaper print: grey, lower quality is not visible


def fetch(url, tries=4):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'dirtybusiness.no index (LUB)'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # network hiccup or 429: wait and retry
            if k == tries - 1:
                raise
            time.sleep(3 * (k + 1))


def bbox(rects):
    x0 = min(r[0] for r in rects)
    y0 = min(r[1] for r in rects)
    x1 = max(r[0] + r[2] for r in rects)
    y1 = max(r[1] + r[3] for r in rects)
    return x0, y0, x1, y1


def clip(c):
    """One clipping: the bounding box of its rectangles, white outside them."""
    x0, y0, x1, y1 = bbox(c['rects'])
    bw, bh = x1 - x0, y1 - y0
    # The image server answers in power-of-two steps; ask for the step at or
    # above the size we keep, then scale down here.
    step = 1
    while bw / (step * 2) >= MAX_W:
        step *= 2
    outw = max(1, round(bw / step))
    url = f"{RESOLVER}{c['page']}/{x0},{y0},{bw},{bh}/{outw},/0/default.jpg"
    src = fitz.Pixmap(fetch(url))
    # Scale from the size asked for, not the size returned: when a rectangle runs
    # past the page edge the server returns a smaller image at the same scale.
    k = outw / bw
    out = fitz.Pixmap(src.colorspace, fitz.IRect(0, 0, src.width, src.height), False)
    out.set_rect(out.irect, (255,) * out.n)
    for (x, y, w, h) in c['rects']:
        r = fitz.IRect(round((x - x0) * k), round((y - y0) * k), round((x - x0 + w) * k), round((y - y0 + h) * k))
        out.copy(src, r & src.irect)
    out = mark(out, c, x0, y0, k)
    return finish(out, c)


def finish(pix, c):
    """Grey unless the clipping carries a yellow title; at most MAX_W wide."""
    if not c.get('highlight') and pix.n >= 3:
        pix = fitz.Pixmap(fitz.csGRAY, pix)
    if pix.width > MAX_W:
        pix = fitz.Pixmap(pix, MAX_W, round(pix.height * MAX_W / pix.width))
    return pix.tobytes('jpg', jpg_quality=QUALITY)


def shrink(clips):
    """Re-save the pictures already made (grey, QUALITY) without downloading again."""
    before = after = 0
    for c in clips:
        path = os.path.join(OUT, f"{c['DocID']}.jpg")
        if not os.path.exists(path):
            continue
        pix = fitz.Pixmap(path)
        if pix.n == 1:  # already grey: shrunk before, leave it
            continue
        before += os.path.getsize(path)
        data = finish(pix, c)
        with open(path, 'wb') as f:
            f.write(data)
        after += len(data)
    print(f'shrunk {before // 1024} KB -> {after // 1024} KB')


def mark(pix, c, x0, y0, k):
    """Yellow over a title (multiply, so the print stays readable) and black over
    private names and car plates. Boxes are in the page's own pixels."""
    hl, red = c.get('highlight') or [], c.get('redact') or []
    if not hl and not red:
        return pix
    if hl and pix.n < 3:  # a grey scan needs colour channels for yellow
        pix = fitz.Pixmap(fitz.csRGB, pix)
    w, h, n = pix.width, pix.height, pix.n
    buf = bytearray(pix.samples)

    def box(b):
        x, y, bw, bh = b
        return (max(0, round((x - x0) * k)), max(0, round((y - y0) * k)),
                min(w, round((x - x0 + bw) * k)), min(h, round((y - y0 + bh) * k)))

    for b in hl:  # multiply by #FFFF00: red and green stay, blue goes to 0
        a0, b0, a1, b1 = box(b)
        for yy in range(b0, b1):
            row = yy * w * n
            for xx in range(a0, a1):
                buf[row + xx * n + 2] = 0
    for b in red:
        a0, b0, a1, b1 = box(b)
        for yy in range(b0, b1):
            row = yy * w * n
            buf[row + a0 * n: row + a1 * n] = bytes((a1 - a0) * n)
    return fitz.Pixmap(pix.colorspace, w, h, bytes(buf), False)


def main():
    again = '--again' in sys.argv
    clips = json.load(open(CLIPS, encoding='utf-8'))
    if '--shrink' in sys.argv:
        shrink(clips)
        return
    thumbs = json.load(open(THUMBS, encoding='utf-8')) if os.path.exists(THUMBS) else {}
    os.makedirs(OUT, exist_ok=True)
    done = 0
    for c in clips:
        name = f"{c['DocID']}.jpg"
        path = os.path.join(OUT, name)
        if os.path.exists(path) and not again:
            thumbs[c['DocID']] = 'assets/docs/' + name
            continue
        try:
            data = clip(c)
        except Exception as e:
            print(f"{c['DocID']}: failed ({e})")
            continue
        with open(path, 'wb') as f:
            f.write(data)
        thumbs[c['DocID']] = 'assets/docs/' + name
        done += 1
        print(f"{c['DocID']}: {len(data) // 1024} KB")
        time.sleep(0.5)
    with open(THUMBS, 'w', encoding='utf-8') as f:
        json.dump(dict(sorted(thumbs.items())), f, ensure_ascii=False, indent=1)
    print(f'{done} clippings made; {len(clips)} in the list.')


if __name__ == '__main__':
    main()
