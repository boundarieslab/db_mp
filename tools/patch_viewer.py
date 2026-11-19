"""Record window: photos open full-page to zoom into, and a before/after slider.

- A click on the record's photo opens it over the whole page: wheel or pinch
  to zoom, drag to move, double-click to zoom in or back out, arrows for the
  next photo, Escape to close. The credit line goes with it.
- A site listed in data/thennow.json gets a third picture mode in the record
  window: two aerial photos of the same frame, years apart, with a handle that
  wipes one over the other. A click opens the pair full-page, where the handle
  still works and both photos zoom together.

Anchored patch: each anchor must occur exactly once in the file it edits.
Usage: python3 tools/patch_viewer.py index.html
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


# ── CSS ────────────────────────────────────────────────────────────────────
sub(""".media-toggle:hover{background:var(--sel)}
""", """.media-toggle:hover{background:var(--sel)}
.media-modes{position:absolute;right:4px;top:4px;display:flex;gap:3px;z-index:3}
.media-modes .media-toggle{position:static}
.sb-media .slideshow-slide{pointer-events:none}
.sb-media .slideshow-slide.active{pointer-events:auto;cursor:zoom-in}
/* Before and after: two pictures of one frame; the handle wipes the later over the earlier. */
.ba{position:absolute;inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center;touch-action:pan-y;user-select:none;-webkit-user-select:none;cursor:zoom-in}
.ba-fr{position:relative;width:100%;height:100%;flex:none}
.ba-fr img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;-webkit-user-drag:none}
.ba-after{clip-path:inset(0 0 0 var(--x,50%))}
.ba-line{position:absolute;top:0;bottom:0;left:var(--x,50%);width:0;border-left:1px solid #fff;
  box-shadow:0 0 0 .5px rgba(0,0,0,.4);cursor:ew-resize;z-index:2}
.ba-knob{position:absolute;top:50%;left:0;transform:translate(-50%,-50%);width:22px;height:22px;padding:0;
  background:#fff;border:.5px solid var(--frame);font-size:9px;line-height:1;cursor:ew-resize;color:var(--frame)}
.ba-knob:focus-visible{outline:1px solid var(--frame);outline-offset:1px}
.ba-yr{position:absolute;bottom:4px;background:rgba(255,255,255,.92);font-size:9px;padding:0 3px;
  font-family:PlexMono,monospace;border:.5px solid var(--rule);z-index:2;pointer-events:none}
.ba-yr.l{left:4px}.ba-yr.r{right:4px}
/* The viewer: one picture, or one pair, over the whole page. */
#viewer{position:fixed;inset:0;z-index:4000;background:#fff;display:none;flex-direction:column}
#viewer.on{display:flex}
.v-stage{position:relative;flex:1 1 auto;overflow:hidden;touch-action:none;cursor:grab;background:#f3f3f3}
.v-stage.drag{cursor:grabbing}
.v-layer{position:absolute;inset:0}
.v-layer img{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;user-select:none;-webkit-user-drag:none;pointer-events:none}
.v-stage .ba-line{left:0;transform:translateX(var(--px,0))}
.v-bar{display:flex;align-items:center;gap:4px;padding:4px 8px;border-top:.5px solid var(--frame);font-size:9px;color:#6e6e6e;min-height:30px}
.v-cap{flex:1 1 auto;line-height:1.35;padding-right:6px}
.v-cap a{color:inherit;text-decoration:none;border-bottom:.5px solid #bbb}
.v-count{font-family:PlexMono,monospace;padding:0 4px}
.v-btn{background:#fff;border:.5px solid var(--frame);font-size:10px;min-width:22px;height:22px;padding:0 5px;cursor:pointer;color:var(--frame);font-family:inherit}
.v-btn:hover{background:var(--sel)}
.v-btn[hidden]{display:none}
""")

# ── words ──────────────────────────────────────────────────────────────────
sub("""        aerialbtn: { en: "AERIAL", no: "FLYFOTO" },
""", """        aerialbtn: { en: "AERIAL", no: "FLYFOTO" },
        aerialcr: { en: "Aerial", no: "Flyfoto" },
        v_close: { en: "Close", no: "Lukk" },
        v_in: { en: "Zoom in", no: "Zoom inn" },
        v_out: { en: "Zoom out", no: "Zoom ut" },
        v_split: { en: "Move the line between the two years", no: "Flytt linjen mellom de to årene" },
""")

# ── the viewer and the before/after pair ──────────────────────────────────
sub("""    let mediaMode = 'photo';
    window.openSidebar = function(site, keepMedia) {""", r"""    // ─────────────────────────────────────────────────────────────────────
    // BEFORE / AFTER, and the viewer
    // ─────────────────────────────────────────────────────────────────────
    // data/thennow.json: { UID: { before: {src, year, credit, href}, after: {…} } },
    // two aerial photos cut to the same frame, so they line up pixel for pixel.
    let THENNOW = {};
    fetch('data/thennow.json').then(r => r.ok ? r.json() : {}).then(j => {
        THENNOW = j || {};
        if (currentSite && THENNOW[uidOf(currentSite)] && $('sidebar').classList.contains('active')) openSidebar(currentSite, true);
    }).catch(() => {});
    const thenNowOf = site => (site && THENNOW[uidOf(site)]) || null;
    const tnCreditHtml = p => {
        const one = e => esc(e.year) + ' ' + (e.href ? `<a href="${esc(safeUrl(e.href))}" target="_blank" rel="noopener noreferrer">${esc(e.credit)}</a>` : esc(e.credit));
        return `${t('aerialcr')}: ${one(p.before)} · ${one(p.after)}`;
    };
    // The record shows 1200 px copies; the viewer asks the same source for more.
    const hiRes = u => String(u)
        .replace(/(ems\.dimu\.org\/image\/[^?]+\?dimension=)1200x1200/, '$12400x2400')
        .replace(/(Special:FilePath\/[^?]+\?width=)1200/, '$12400');
    // The frame takes the photos' own shape, so the line runs over the
    // picture and not over the grey round it.
    const pairHtml = p => `<div class="ba"><div class="ba-fr" style="--x:50%">
            <img src="${esc(p.before.src)}" alt="${esc(p.before.year)}" draggable="false">
            <img class="ba-after" src="${esc(p.after.src)}" alt="${esc(p.after.year)}" draggable="false">
            <div class="ba-line"><button type="button" class="ba-knob" aria-label="${esc(t('v_split'))}">↔</button></div>
            <span class="ba-yr l">${esc(p.before.year)}</span><span class="ba-yr r">${esc(p.after.year)}</span>
        </div></div>`;
    // The wipe in the record window: drag anywhere on it to move the line; a
    // click that does not move opens the pair over the whole page.
    function wirePair(box, onTap) {
        const el = box.querySelector('.ba-fr'), im = el.querySelector('img');
        const size = () => {
            if (!im.naturalWidth || !box.clientWidth) return;
            const k = Math.min(box.clientWidth / im.naturalWidth, box.clientHeight / im.naturalHeight);
            el.style.width = Math.round(im.naturalWidth * k) + 'px'; el.style.height = Math.round(im.naturalHeight * k) + 'px';
        };
        if (im.complete) size(); im.addEventListener('load', size);
        if (window.ResizeObserver) new ResizeObserver(size).observe(box);
        const set = f => el.style.setProperty('--x', (Math.max(0, Math.min(1, f)) * 100).toFixed(2) + '%');
        let down = null;
        box.addEventListener('pointerdown', e => {
            if (e.button) return;
            down = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
        });
        box.addEventListener('pointermove', e => {
            if (!down || e.pointerId !== down.id) return;
            if (!down.moved && Math.abs(e.clientX - down.x) < 4) return;
            if (!down.moved) { if (Math.abs(e.clientY - down.y) > Math.abs(e.clientX - down.x)) { down = null; return; } down.moved = true; box.setPointerCapture(e.pointerId); }
            const r = el.getBoundingClientRect();
            set((e.clientX - r.left) / r.width);
        });
        const up = e => {
            if (!down || e.pointerId !== down.id) return;
            const tap = !down.moved; down = null;
            if (tap && !e.target.closest('.ba-knob')) onTap();
        };
        box.addEventListener('pointerup', up);
        box.addEventListener('pointercancel', () => { down = null; });
        const knob = el.querySelector('.ba-knob');
        knob.addEventListener('keydown', e => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault(); e.stopPropagation();
            const cur = parseFloat(el.style.getPropertyValue('--x')) / 100 || .5;
            set(cur + (e.key === 'ArrowLeft' ? -.05 : .05));
        });
    }

    // The viewer: wheel or pinch to zoom at the pointer, drag to move,
    // double-click to zoom in or back to the whole picture.
    const viewer = (() => {
        const el = document.createElement('div');
        el.id = 'viewer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
        el.innerHTML = `<div class="v-stage"></div><div class="v-bar"><span class="v-cap"></span>
            <span class="v-count"></span><button type="button" class="v-btn v-prev" aria-label="Previous">←</button><button type="button" class="v-btn v-next" aria-label="Next">→</button>
            <button type="button" class="v-btn v-out">−</button><button type="button" class="v-btn v-in">+</button>
            <button type="button" class="v-btn v-x">×</button></div>`;
        document.body.appendChild(el);
        const stage = el.querySelector('.v-stage'), q = s => el.querySelector(s);
        let items = [], idx = 0, imgs = [], nat = null, fit = 1, s = 1, tx = 0, ty = 0, split = .5, line = null, back = null;
        const W = () => stage.clientWidth, H = () => stage.clientHeight;
        const maxS = () => Math.max(fit * 2, 3);
        function clampPan() {
            const w = nat.w * s, h = nat.h * s;
            tx = w <= W() ? (W() - w) / 2 : Math.min(0, Math.max(W() - w, tx));
            ty = h <= H() ? (H() - h) / 2 : Math.min(0, Math.max(H() - h, ty));
        }
        function apply() {
            if (!nat) return;
            clampPan();
            imgs.forEach(im => { im.style.width = nat.w + 'px'; im.style.height = nat.h + 'px';
                im.style.transform = `translate(${tx}px,${ty}px) scale(${s})`; });
            if (line) {
                // The line holds its place on the ground: a fraction of the photo, not of the window.
                const x = Math.round(Math.max(0, Math.min(W(), tx + split * nat.w * s)));
                stage.querySelector('.v-after').style.clipPath = `inset(0 0 0 ${x}px)`;
                line.style.setProperty('--px', x + 'px');
            }
        }
        function zoomAt(cx, cy, ns) {
            ns = Math.max(fit, Math.min(maxS(), ns));
            tx = cx - (cx - tx) * ns / s; ty = cy - (cy - ty) * ns / s; s = ns; apply();
        }
        function refit() { if (!nat) return; fit = Math.min(W() / nat.w, H() / nat.h); s = fit; apply(); }
        function show(i) {
            idx = (i + items.length) % items.length;
            const it = items[idx];
            nat = null; line = null;
            stage.innerHTML = it.pair
                ? `<div class="v-layer"><img src="${esc(it.pair.before.src)}" alt="${esc(it.pair.before.year)}" draggable="false"></div>
                   <div class="v-layer v-after"><img src="${esc(it.pair.after.src)}" alt="${esc(it.pair.after.year)}" draggable="false"></div>
                   <div class="ba-line"><button type="button" class="ba-knob" aria-label="${esc(t('v_split'))}">↔</button></div>
                   <span class="ba-yr l">${esc(it.pair.before.year)}</span><span class="ba-yr r">${esc(it.pair.after.year)}</span>`
                : `<div class="v-layer"><img src="${esc(hiRes(it.src))}" alt="" draggable="false"></div>`;
            imgs = [...stage.querySelectorAll('img')];
            line = stage.querySelector('.ba-line');
            const first = imgs[0];
            const go = () => { nat = { w: first.naturalWidth, h: first.naturalHeight }; refit(); };
            if (first.complete && first.naturalWidth) go(); else first.onload = go;
            // A larger copy that fails to load falls back to the one the record showed.
            if (!it.pair) first.onerror = () => { if (first.src !== it.src) first.src = it.src; };
            q('.v-cap').innerHTML = it.credit || '';
            q('.v-count').textContent = items.length > 1 ? (idx + 1) + ' / ' + items.length : '';
            q('.v-prev').hidden = q('.v-next').hidden = items.length < 2;
        }
        function open(list, i) {
            items = list; split = .5; back = document.activeElement;
            q('.v-x').setAttribute('aria-label', t('v_close'));
            q('.v-in').setAttribute('aria-label', t('v_in')); q('.v-out').setAttribute('aria-label', t('v_out'));
            el.classList.add('on'); show(i || 0); q('.v-x').focus();
        }
        function close() {
            el.classList.remove('on'); stage.innerHTML = ''; imgs = []; nat = null;
            if (back && back.focus) back.focus();
        }
        q('.v-x').onclick = close;
        q('.v-prev').onclick = () => show(idx - 1);
        q('.v-next').onclick = () => show(idx + 1);
        q('.v-in').onclick = () => zoomAt(W() / 2, H() / 2, s * 1.6);
        q('.v-out').onclick = () => zoomAt(W() / 2, H() / 2, s / 1.6);
        stage.addEventListener('wheel', e => {
            e.preventDefault();
            const r = stage.getBoundingClientRect();
            zoomAt(e.clientX - r.left, e.clientY - r.top, s * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)));
        }, { passive: false });
        stage.addEventListener('dblclick', e => {
            const r = stage.getBoundingClientRect();
            if (s > fit * 1.05) { s = fit; apply(); } else zoomAt(e.clientX - r.left, e.clientY - r.top, fit * 3);
        });
        // Pointers: one moves the picture, or the line when it starts on it; two pinch.
        const pts = new Map(); let mode = null, last = null, pinch = null;
        stage.addEventListener('pointerdown', e => {
            if (e.button) return;
            stage.setPointerCapture(e.pointerId);
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const r = stage.getBoundingClientRect();
            if (pts.size === 1) {
                mode = line && nat && Math.abs(e.clientX - r.left - (tx + split * nat.w * s)) < 16 ? 'split' : 'pan';
                last = { x: e.clientX, y: e.clientY };
                stage.classList.toggle('drag', mode === 'pan');
            } else if (pts.size === 2) {
                const [a, b] = [...pts.values()];
                pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s }; mode = 'pinch';
            }
        });
        stage.addEventListener('pointermove', e => {
            if (!pts.has(e.pointerId) || !nat) return;
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const r = stage.getBoundingClientRect();
            if (mode === 'pinch' && pts.size === 2) {
                const [a, b] = [...pts.values()];
                zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
            } else if (mode === 'split') {
                split = Math.max(0, Math.min(1, (e.clientX - r.left - tx) / (nat.w * s))); apply();
            } else if (mode === 'pan') {
                tx += e.clientX - last.x; ty += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; apply();
            }
        });
        const lift = e => {
            pts.delete(e.pointerId);
            if (pts.size === 1) { const [p] = [...pts.values()]; last = { x: p.x, y: p.y }; mode = 'pan'; }
            if (!pts.size) { mode = null; stage.classList.remove('drag'); }
        };
        stage.addEventListener('pointerup', lift);
        stage.addEventListener('pointercancel', lift);
        // Escape and the arrows belong to the viewer while it is open, before
        // any other key handler on the page sees them.
        window.addEventListener('keydown', e => {
            if (!el.classList.contains('on')) return;
            const k = e.key;
            if (k === 'Escape') close();
            else if (k === 'ArrowLeft' && line && document.activeElement && document.activeElement.classList.contains('ba-knob')) { split = Math.max(0, split - .05); apply(); }
            else if (k === 'ArrowRight' && line && document.activeElement && document.activeElement.classList.contains('ba-knob')) { split = Math.min(1, split + .05); apply(); }
            else if (k === 'ArrowLeft' && items.length > 1) show(idx - 1);
            else if (k === 'ArrowRight' && items.length > 1) show(idx + 1);
            else if (k === '+' || k === '=') zoomAt(W() / 2, H() / 2, s * 1.6);
            else if (k === '-') zoomAt(W() / 2, H() / 2, s / 1.6);
            else if (k === 'Tab') return;
            else return;
            e.preventDefault(); e.stopImmediatePropagation();
        }, true);
        window.addEventListener('resize', () => { if (el.classList.contains('on')) refit(); });
        return { open, close };
    })();

    let mediaMode = 'photo';
    window.openSidebar = function(site, keepMedia) {""")

# ── which picture the record window starts on ─────────────────────────────
sub("""        if (!keepMedia) mediaMode = currentImages.length ? 'photo' : 'aerial';""",
    """        const tn = thenNowOf(site);
        if (!keepMedia) mediaMode = currentImages.length ? 'photo' : tn ? 'thennow' : 'aerial';
        if (mediaMode === 'thennow' && !tn) mediaMode = currentImages.length ? 'photo' : 'aerial';""")

# ── the picture band: photos, before/after, aerial ────────────────────────
OLD_MEDIA = src[src.index("        let media = '';\n        if (mediaMode === 'photo' && currentImages.length) {"):]
OLD_MEDIA = OLD_MEDIA[:OLD_MEDIA.index("            media = `<div class=\"no-images\">${t('noimg')}</div>`;\n        }\n") + len("            media = `<div class=\"no-images\">${t('noimg')}</div>`;\n        }\n")]
sub(OLD_MEDIA, """        let media = '';
        // One button for every other kind of picture the site has.
        const modeBtn = (m, label) => `<button type="button" class="media-toggle" data-media="${m}">${label}</button>`;
        const modes = () => '<div class="media-modes">' +
            (currentImages.length && mediaMode !== 'photo' ? modeBtn('photo', `${t('photos')} ${currentImages.length}`) : '') +
            (tn && mediaMode !== 'thennow' ? modeBtn('thennow', `${esc(tn.before.year)} / ${esc(tn.after.year)}`) : '') +
            (canAerial && mediaMode !== 'aerial' ? modeBtn('aerial', t('aerialbtn')) : '') + '</div>';
        if (mediaMode === 'photo' && currentImages.length) {
            const slides = currentImages.map((u, i) => `<div class="slideshow-slide ${i===0?'active':''}" style="background-image:url('${esc(safeUrl(u))}')"></div>`).join('');
            media = slides + (currentImages.length > 1 ? `
                <button type="button" class="slideshow-nav slideshow-prev" onclick="slideshowPrev()" aria-label="Previous">←</button>
                <button type="button" class="slideshow-nav slideshow-next" onclick="slideshowNext()" aria-label="Next">→</button>
                <div class="slideshow-counter">1 / ${currentImages.length}</div>` : '') + modes();
        } else if (mediaMode === 'thennow' && tn) {
            media = pairHtml(tn) + modes();
        } else if (canAerial) {
            mediaMode = 'aerial';
            media = `<div id="sb-minimap" style="position:absolute;inset:0"></div>` +
                `<div class="media-note">${t('aerial')}${fpRings[uidOf(site)] ? ' · ' + t('fpnote') : ''}</div>` + modes();
        } else {
            media = `<div class="no-images">${t('noimg')}</div>`;
        }
""")

sub("""<div class="sb-credit" id="sb-credit">${mediaMode === 'photo' ? creditHtml(currentSlideIndex) : ''}</div>""",
    """<div class="sb-credit" id="sb-credit">${mediaMode === 'photo' ? creditHtml(currentSlideIndex) : mediaMode === 'thennow' && tn ? tnCreditHtml(tn) : ''}</div>""")

sub("""        container.querySelectorAll('.media-toggle').forEach(b => b.onclick = () => {
            mediaMode = b.dataset.media; openSidebar(site, true);
        });""", """        container.querySelectorAll('.media-toggle').forEach(b => b.onclick = () => {
            mediaMode = b.dataset.media; openSidebar(site, true);
        });
        // A click on the photo, or on the pair, opens it over the whole page.
        container.querySelectorAll('.slideshow-slide').forEach(sl => sl.onclick = () =>
            viewer.open(currentImages.map((u, i) => ({ src: safeUrl(u), credit: creditHtml(i) })), currentSlideIndex));
        const ba = container.querySelector('.ba');
        if (ba && tn) wirePair(ba, () => viewer.open([{ pair: tn, credit: tnCreditHtml(tn) }], 0));""")

open(path, 'w', encoding='utf-8').write(src)
print('patched', path)
