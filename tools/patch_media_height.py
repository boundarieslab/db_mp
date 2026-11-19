"""Record window: a picture narrower than the window's 2:1 band fills the width,
and the band grows taller for it, pushing the rest of the record down.

Applies to the before/after pair and to the photos (the band follows the photo
shown). Wider pictures keep the band's normal height. The band never grows past
1.6 times its width.

Anchored patch: each anchor must occur exactly once.
Usage: python3 tools/patch_media_height.py index.html
"""
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()


def sub(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        sys.exit(f'anchor found {n} times, expected {count}: {old[:70]!r}')
    src = src.replace(old, new)


sub(""".sb-media .slideshow-slide{pointer-events:none}
""", """.sb-media .slideshow-slide{pointer-events:none}
@media (prefers-reduced-motion: no-preference){.sb-media{transition:height .2s cubic-bezier(.4,0,.2,1)}}
""")

# The band's height follows the picture: full width, never shorter than usual.
sub("""    function updateSlideshow() {""", """    const mediaSize = {};
    function fitMedia(el, w, h) {
        if (!el || !w || !h || !el.clientWidth) return;
        if (!el.dataset.base) el.dataset.base = el.clientHeight;
        const W = el.clientWidth, base = +el.dataset.base;
        el.style.height = Math.round(Math.min(W * 1.6, Math.max(base, W * h / w))) + 'px';
    }
    // Photos: the band takes the shape of the one shown.
    function fitPhoto() {
        const el = document.querySelector('#sb-dynamic-content .sb-media'), u = currentImages[currentSlideIndex];
        if (!el || !u || !el.querySelector('.slideshow-slide')) return;
        const k = safeUrl(u), known = mediaSize[k];
        if (known) return fitMedia(el, known[0], known[1]);
        const im = new Image();
        im.onload = () => { mediaSize[k] = [im.naturalWidth, im.naturalHeight];
            if (currentImages[currentSlideIndex] === u && el.isConnected) fitMedia(el, im.naturalWidth, im.naturalHeight); };
        im.src = k;
    }
    function updateSlideshow() {""")

sub("""        if (c) c.textContent = `${currentSlideIndex + 1} / ${currentImages.length}`;
    }""", """        if (c) c.textContent = `${currentSlideIndex + 1} / ${currentImages.length}`;
        fitPhoto();
    }""")

# The pair: the band takes the photos' shape, then the frame fills it.
sub("""        const size = () => {
            if (!im.naturalWidth || !box.clientWidth) return;
            const k = Math.min(box.clientWidth / im.naturalWidth, box.clientHeight / im.naturalHeight);""",
    """        const size = () => {
            if (!im.naturalWidth || !box.clientWidth) return;
            fitMedia(box.closest('.sb-media'), im.naturalWidth, im.naturalHeight);
            const k = Math.min(box.clientWidth / im.naturalWidth, box.clientHeight / im.naturalHeight);""")

sub("""        if (ba && tn) wirePair(ba, () => viewer.open([{ pair: tn, credit: tnCreditHtml(tn) }], 0));""",
    """        if (ba && tn) wirePair(ba, () => viewer.open([{ pair: tn, credit: tnCreditHtml(tn) }], 0));
        if (mediaMode === 'photo') fitPhoto();""")

open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
