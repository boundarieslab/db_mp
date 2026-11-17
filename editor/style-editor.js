/* ==========================================================================
   dirtybusiness.no — the style editor.

   Opens with ?edit in the address (or from the bookmarklet on another page).
   Everything changed here is kept in this browser as a draft and shown at
   once; FILE exports it as one style file, which is what gets saved into the
   site. Nobody else sees anything until that file is in the site.
   ========================================================================== */
(function () {
    'use strict';
    if (window.__dbEditor) return;
    window.__dbEditor = true;
    const ME = document.currentScript && document.currentScript.src;
    const BASE = ME ? ME.replace(/[^\/?#]*(\?.*)?$/, '') : 'editor/';

    function boot() {
        const R = window.__dbStyle;
        if (!R) return;
        if (R.PAGE_MODE && !R.EDIT) {
            try { const d = localStorage.getItem(R.KEY); if (d) R.state = JSON.parse(d); } catch (e) {}
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start(R));
        else start(R);
    }
    if (window.__dbStyle) boot();
    else {
        const s = document.createElement('script');
        s.src = BASE + 'style-runtime.js?v=' + Date.now();
        s.onload = boot;
        document.head.appendChild(s);
    }

    function start(R) {
    // ── small helpers ───────────────────────────────────────────────────
    const S = () => R.state;
    const PAGE = R.PAGE_MODE;
    const $ = (s, r) => (r || document).querySelector(s);
    function h(tag, a, ...kids) {
        const el = document.createElement(tag);
        if (a) Object.keys(a).forEach(k => {
            const v = a[k];
            if (v === undefined || v === null || v === false) return;
            if (k === 'class') el.className = v;
            else if (k === 'style') el.style.cssText = v;
            else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
            else if (k === 'text') el.textContent = v;
            else if (k === 'html') el.innerHTML = v;
            else if (k in el && typeof v !== 'string') el[k] = v;
            else el.setAttribute(k, v === true ? '' : v);
        });
        kids.flat().forEach(c => { if (c === null || c === undefined || c === false) return; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
        return el;
    }
    const px = v => { if (v === '' || v === null || v === undefined) return ''; v = String(v).trim(); return /^-?[\d.]+$/.test(v) ? v + 'px' : v; };
    const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
    const r1 = n => Math.round(n * 10) / 10;
    const isPhone = () => window.innerWidth <= 760;
    const esc = s => (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&');

    // ── history and saving ──────────────────────────────────────────────
    let hist = [JSON.stringify(S())], hi = 0, lastCommit = 0;
    function commit(merge) {
        R.apply();
        R.saveDraft();
        const snap = JSON.stringify(S());
        const now = Date.now();
        if (merge && now - lastCommit < 600 && hi === hist.length - 1 && hi > 0) hist[hi] = snap;
        else { hist = hist.slice(0, hi + 1); hist.push(snap); if (hist.length > 300) hist.shift(); hi = hist.length - 1; }
        lastCommit = now;
        badge();
    }
    function go(d) {
        const n = hi + d;
        if (n < 0 || n >= hist.length) return;
        hi = n;
        R.state = JSON.parse(hist[hi]);
        R.saveDraft();
        render(); badge();
    }

    // ── the window ──────────────────────────────────────────────────────
    const css = `
#dbx{position:fixed;z-index:2147483000;top:48px;right:12px;width:330px;max-height:calc(100vh - 60px);display:flex;flex-direction:column;
  background:#fff;color:#000;border:1px solid #000;font:11px/1.4 Plex,"IBM Plex Sans",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;text-align:left}
#dbx *{box-sizing:border-box;border-radius:0;letter-spacing:normal;text-transform:none}
#dbx button,#dbx input,#dbx select,#dbx textarea{font:inherit;color:#000;margin:0}
#dbx.fold .dbx-tabs,#dbx.fold .dbx-body,#dbx.fold .dbx-foot{display:none}
.dbx-head{height:24px;flex:0 0 24px;display:flex;align-items:center;gap:2px;padding:0 3px 0 8px;border-bottom:1px solid #000;cursor:move;user-select:none;background:#fff}
.dbx-head b{font-weight:500;letter-spacing:.09em;font-size:10px;flex:1}
.dbx-head .st{color:#888;font-size:10px;margin-right:4px}
.dbx-ib{width:20px;height:20px;border:0;background:#fff;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1}
.dbx-ib:hover{background:#eee}.dbx-ib.on{background:#00f;color:#fff}
.dbx-ib:disabled{opacity:.3;cursor:default}
.dbx-tabs{display:flex;flex:0 0 auto;border-bottom:1px solid #000}
.dbx-tab{flex:1 1 0;height:24px;border:0;border-right:1px solid #ddd;background:#f5f5f5;cursor:pointer;font-size:9.5px!important;letter-spacing:.08em!important;font-weight:500!important;padding:0}
.dbx-tab:last-child{border-right:0}
.dbx-tab[aria-selected=true]{background:#fff;box-shadow:inset 0 2px 0 #00f}
.dbx-body{overflow:auto;flex:1 1 auto;padding:6px 10px 12px;min-height:60px}
.dbx-foot{flex:0 0 auto;border-top:1px solid #ddd;padding:4px 10px;color:#888;font-size:10px;display:flex;gap:8px}
.dbx-h{font-size:9.5px;letter-spacing:.09em;font-weight:500;color:#555;margin:12px 0 4px;display:flex;align-items:center;gap:6px}
.dbx-h:first-child{margin-top:4px}
.dbx-h .rt{margin-left:auto}
.dbx-row{display:flex;align-items:center;gap:5px;min-height:24px}
.dbx-row>.lb{flex:0 0 70px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dbx-n{width:50px;height:20px;border:1px solid #aaa;padding:0 4px;background:#fff;font-family:PlexMono,ui-monospace,monospace!important;font-size:10.5px!important}
.dbx-n.set,.dbx-t.set,.dbx-s.set{border-color:#00f;color:#00f!important}
.dbx-n.w4{width:40px}
.dbx-t,.dbx-s{height:20px;border:1px solid #aaa;padding:0 4px;background:#fff;min-width:0;flex:1 1 auto}
.dbx-c{width:22px;height:20px;border:1px solid #aaa;padding:0;background:#fff;flex:0 0 22px;cursor:pointer}
.dbx-r{flex:1 1 auto;min-width:40px;accent-color:#00f}
.dbx-btn{height:20px;border:1px solid #000;background:#fff;padding:0 7px;cursor:pointer;white-space:nowrap}
.dbx-btn:hover{background:#f0f0f0}.dbx-btn.on{background:#00f;color:#fff!important;border-color:#00f}
.dbx-btn.big{height:24px;padding:0 10px}
.dbx-x{border:0;background:none;color:#aaa!important;cursor:pointer;padding:0 3px;font-size:11px;line-height:1}
.dbx-x:hover{color:#000!important}.dbx-x.hid{visibility:hidden}
.dbx-sw{width:16px;height:16px;border:1px solid #999;flex:0 0 16px;background-image:linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%);background-size:6px 6px;background-position:0 0,3px 3px;position:relative}
.dbx-sw i{position:absolute;inset:0}
.dbx-note{color:#666;font-size:10px;line-height:1.45;margin:4px 0}
.dbx-note b{font-weight:500;color:#000}
.dbx-mode{background:#f3f3ff;border:1px solid #ccf;padding:4px 7px;margin:4px 0 6px;font-size:10px}
.dbx-parts{display:flex;flex-wrap:wrap;gap:3px}
.dbx-part{height:20px;border:1px solid #bbb;background:#fff;padding:0 6px;cursor:pointer;font-size:10px!important}
.dbx-part:hover{border-color:#000}.dbx-part.na{color:#aaa!important;border-style:dashed}
.dbx-part.sel{border-color:#00f;color:#00f!important}.dbx-part.ed{font-weight:500!important}
.dbx-mono{font-family:PlexMono,ui-monospace,monospace!important;font-size:10px!important}
.dbx-li{display:flex;align-items:center;gap:5px;min-height:25px;border-bottom:1px solid #eee}
.dbx-li .nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbx-li .nm small{color:#888;font-size:9.5px;margin-left:4px}
.dbx-li .ct{color:#999;font-size:9.5px;white-space:nowrap}
.dbx-li.set .nm{color:#00f}
.dbx-det{border-bottom:1px solid #eee}
.dbx-det>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:5px;min-height:25px}
.dbx-det>summary::-webkit-details-marker{display:none}
.dbx-det>summary .tri{width:0;height:0;border-left:3px solid transparent;border-right:3px solid transparent;border-top:4.5px solid #000;transform:rotate(-90deg);transition:transform .12s}
.dbx-det[open]>summary .tri{transform:none}
.dbx-det>.in{padding:2px 0 8px 12px}
.dbx-grp{font-size:9.5px;letter-spacing:.09em;font-weight:500;color:#555;margin:12px 0 2px;padding-bottom:3px;border-bottom:1px solid #000}
.dbx-seg{display:inline-flex;border:1px solid #aaa}
.dbx-seg button{height:18px;border:0;border-right:1px solid #ddd;background:#fff;cursor:pointer;padding:0 6px;font-size:10px!important}
.dbx-seg button:last-child{border-right:0}.dbx-seg button.on{background:#00f;color:#fff!important}
.dbx-anchor{display:grid;grid-template-columns:repeat(2,13px);gap:2px}
.dbx-anchor button{width:13px;height:13px;border:1px solid #999;background:#fff;padding:0;cursor:pointer}
.dbx-anchor button.on{background:#00f;border-color:#00f}
.dbx-sel{border:1px solid #00f;padding:6px 7px;margin:8px 0 4px}
.dbx-sel .ttl{font-weight:500;color:#00f}
.dbx-ta{width:100%;height:120px;border:1px solid #aaa;padding:4px;font-family:PlexMono,ui-monospace,monospace!important;font-size:10px!important;resize:vertical}
.dbx-sample{font-size:15px;line-height:1.2;flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
#dbx-ov{position:fixed;inset:0;z-index:2147482990;pointer-events:none}
#dbx-ov .hov{position:fixed;outline:1px dashed #00f;pointer-events:none}
#dbx-ov .box{position:fixed;outline:1px solid #00f;pointer-events:none;background:rgba(0,0,255,.04)}
#dbx-ov .hd{position:fixed;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;background:#fff;border:1px solid #00f;pointer-events:auto;box-sizing:border-box}
#dbx-ov .gx{position:fixed;top:0;bottom:0;width:0;border-left:1px solid #f0f;pointer-events:none}
#dbx-ov .gy{position:fixed;left:0;right:0;height:0;border-top:1px solid #f0f;pointer-events:none}
#dbx-ov .nm{position:fixed;background:#00f;color:#fff;font:10px/14px PlexMono,ui-monospace,monospace;padding:0 4px;pointer-events:none;white-space:nowrap}
#dbx-ov .mv{position:fixed;pointer-events:auto;cursor:move}
@media (max-width:760px){#dbx{width:min(330px,calc(100vw - 16px));max-height:56vh}}
#dbx-pill{position:fixed;z-index:2147483000;right:12px;bottom:12px;height:24px;border:1px solid #000;background:#fff;padding:0 10px;cursor:pointer;font:500 10px Plex,Helvetica,Arial,sans-serif;letter-spacing:.09em}
html.dbx-arr, html.dbx-arr *{cursor:default!important}
html.dbx-arr #dbx, html.dbx-arr #dbx *{cursor:auto!important}
`;
    const st = h('style', { id: 'dbx-css' }, css);
    document.head.appendChild(st);

    const win = h('div', { id: 'dbx', role: 'dialog', 'aria-label': 'Style editor' });
    const ov = h('div', { id: 'dbx-ov' });
    document.body.appendChild(ov);
    document.body.appendChild(win);

    const TABS = PAGE ? ['ARRANGE', 'TYPE', 'COLOUR', 'LINES', 'FILE'] : ['ARRANGE', 'TYPE', 'COLOUR', 'LINES', 'MAP', 'FILE'];
    let tab = localStorage.getItem('dbx-tab') || 'ARRANGE';
    if (TABS.indexOf(tab) < 0) tab = 'ARRANGE';

    const bUndo = h('button', { class: 'dbx-ib', title: 'Undo (Ctrl+Z)', onclick: () => go(-1) }, '↶');
    const bRedo = h('button', { class: 'dbx-ib', title: 'Redo (Ctrl+Shift+Z)', onclick: () => go(1) }, '↷');
    const bCmp = h('button', { class: 'dbx-ib', style: 'width:auto;padding:0 5px;font-size:9px;letter-spacing:.08em', title: 'Hold to see the site as it is now, without your changes' }, 'BEFORE');
    const holdOff = on => { R.off = on; bCmp.classList.toggle('on', on); };
    bCmp.addEventListener('pointerdown', e => { e.preventDefault(); holdOff(true); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => bCmp.addEventListener(t, () => { if (R.off) holdOff(false); }));
    const stat = h('span', { class: 'st' });
    const head = h('div', { class: 'dbx-head' }, h('b', null, PAGE ? 'STYLE · THIS PAGE' : 'STYLE'), stat, bUndo, bRedo, bCmp,
        h('button', { class: 'dbx-ib', title: 'Fold', onclick: () => { win.classList.toggle('fold'); } }, '–'),
        h('button', { class: 'dbx-ib', title: 'Close the editor (your changes stay)', onclick: () => closeWin() }, '×'));
    const tabsEl = h('div', { class: 'dbx-tabs', role: 'tablist' });
    const body = h('div', { class: 'dbx-body' });
    const foot = h('div', { class: 'dbx-foot' });
    win.append(head, tabsEl, body, foot);
    TABS.forEach(t => tabsEl.appendChild(h('button', { class: 'dbx-tab', role: 'tab', 'aria-selected': String(t === tab),
        onclick: () => { tab = t; localStorage.setItem('dbx-tab', t); [...tabsEl.children].forEach(b => b.setAttribute('aria-selected', String(b.textContent === t))); render(); } }, t)));

    const pill = h('button', { id: 'dbx-pill', hidden: true, onclick: () => { win.hidden = false; pill.hidden = true; } }, 'STYLE');
    document.body.appendChild(pill);
    function closeWin() { setArrange(false); win.hidden = true; pill.hidden = false; }

    // The window moves by its head and remembers where it was.
    try { const p = JSON.parse(localStorage.getItem('dbx-pos') || 'null'); if (p) { win.style.left = p.l + 'px'; win.style.top = p.t + 'px'; win.style.right = 'auto'; } } catch (e) {}
    head.addEventListener('pointerdown', e => {
        if (e.target.closest('button')) return;
        const r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        head.setPointerCapture(e.pointerId);
        const mv = ev => {
            const l = Math.max(0, Math.min(innerWidth - 60, ev.clientX - dx)), t = Math.max(0, Math.min(innerHeight - 24, ev.clientY - dy));
            win.style.left = l + 'px'; win.style.top = t + 'px'; win.style.right = 'auto';
        };
        const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up);
            const b = win.getBoundingClientRect(); localStorage.setItem('dbx-pos', JSON.stringify({ l: b.left, t: b.top })); };
        head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
    });
    // Keys typed in the editor stay in the editor.
    win.addEventListener('keydown', e => { if (e.target.matches('input,select,textarea')) e.stopPropagation(); });

    function badge() {
        bUndo.disabled = hi <= 0; bRedo.disabled = hi >= hist.length - 1;
        const s = S();
        const n = Object.keys(s.colors).length + Object.keys(s.fonts).length + Object.keys(s.sizes).length + Object.keys(s.weights).length +
                  Object.keys(s.widths).length + Object.keys(s.vars).length + s.rules.length + Object.keys(s.map.layers).length + ((+s.map.lineWidth || 1) !== 1 ? 1 : 0);
        stat.textContent = n ? n + ' change' + (n > 1 ? 's' : '') : 'no changes';
        foot.textContent = '';
        foot.append(h('span', null, isPhone() ? 'Layout: PHONE (window ≤ 760 px)' : 'Layout: DESKTOP (window > 760 px)'),
                    h('span', { style: 'margin-left:auto' }, 'Draft kept in this browser'));
    }

    // ── shared controls ─────────────────────────────────────────────────
    function numIn(val, placeholder, onchange, opts) {
        opts = opts || {};
        const i = h('input', { class: 'dbx-n' + (opts.w4 ? ' w4' : '') + (val !== '' && val !== undefined && val !== null ? ' set' : ''), type: 'text',
            value: val === undefined || val === null ? '' : String(val), placeholder: placeholder === undefined ? '' : String(placeholder), title: opts.title || '' });
        const fire = () => onchange(i.value.trim());
        i.addEventListener('change', fire);
        i.addEventListener('keydown', e => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            const cur = i.value !== '' ? i.value : i.placeholder;
            const m = /^(-?[\d.]+)(.*)$/.exec(cur);
            if (!m) return;
            const step = (opts.step || 1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
            const dec = (String(opts.step || 1).split('.')[1] || '').length;
            i.value = (+(+m[1] + step).toFixed(dec)) + (m[2] || (opts.unit || ''));
            i.classList.add('set');
            onchange(i.value, true);
        });
        return i;
    }
    function colorIn(val, fallback, onchange) {
        const k = R.colorKey(val || fallback || '#000000') || '#000000';
        const c = h('input', { type: 'color', class: 'dbx-c', value: k.slice(0, 7) });
        const t = h('input', { type: 'text', class: 'dbx-t dbx-mono' + (val ? ' set' : ''), value: val || '', placeholder: fallback || '', style: 'flex:0 0 78px' });
        c.addEventListener('input', () => { const a = (R.colorKey(t.value || fallback || '') || '').slice(7); t.value = c.value + a; t.classList.add('set'); onchange(t.value, true); });
        t.addEventListener('change', () => { const v = t.value.trim(); const kk = R.colorKey(v); if (kk) c.value = kk.slice(0, 7); onchange(v); });
        c.addEventListener('change', () => onchange(t.value.trim()));
        return [c, t];
    }
    function swatch(col) { return h('span', { class: 'dbx-sw' }, h('i', { style: 'background:' + col })); }
    const x = (show, fn, title) => h('button', { class: 'dbx-x' + (show ? '' : ' hid'), title: title || 'Back to how it was', onclick: fn }, '✕');

    // ═════════════════════════════════════════════════════════════════════
    // ARRANGE
    // ═════════════════════════════════════════════════════════════════════
    const PARTS = PAGE ? [
        ['iframe', 'Map frame'], ['header', 'Header'], ['nav', 'Navigation'], ['body', 'Page']
    ] : [
        ['#bar', 'Tools and drawer'], ['#bar .toolbar', 'Tool strip'], ['#bar .drawer', 'Drawer'],
        ['#sidebar', 'Site record'], ['#dod-panel', 'Terrain panel'],
        ['#deck', 'Table'], ['#deck .deck-head', 'Table head'], ['#tabstrip', 'Sheet tabs'], ['#deck-chips', 'Colour keys'],
        ['#deck .deck-scroll', 'Sheet'], ['#site-table', 'Table grid'], ['#sheet-key', 'Table note'],
        ['.status-strip', 'Status line'],
        ['#map .maplibregl-ctrl-bottom-left', 'Corner controls'], ['#compass', 'North arrow'],
        ['#map .maplibregl-ctrl-bottom-left .maplibregl-ctrl-group', 'Zoom buttons'], ['.maplibregl-ctrl-scale', 'Scale bar'],
        ['#map .maplibregl-ctrl-bottom-right', 'Credits'],
        ['.tag-txt', 'Cluster label'], ['#hover-card', 'Hover picture'], ['.maplibregl-popup-content', 'Pop-up'],
        ['#share-notification', 'Notice'], ['#map', 'Map']
    ];
    const STATE_CLS = /^(open|on|active|sel|hot|pick|folded|closed|tight|show|cur|drag-handle|half|full|maplibregl-compact-show|dbx-.*)$/;
    const STATEFUL = { deck: ['half', 'full'] };
    function selKind(el) {
        if (!el || el === document.documentElement) return 'html';
        if (el === document.body) return 'body';
        if (el.id) return '#' + esc(el.id) + (STATEFUL[el.id] || []).filter(c => el.classList.contains(c)).map(c => '.' + c).join('');
        const cls = [...el.classList].filter(c => !STATE_CLS.test(c)).map(c => '.' + esc(c)).join('');
        const tag = el.tagName.toLowerCase();
        if (cls) {
            let a = el.parentElement; while (a && !a.id && a !== document.body) a = a.parentElement;
            return (a && a.id ? '#' + esc(a.id) + ' ' : '') + tag + cls;
        }
        return selKind(el.parentElement) + ' > ' + tag;
    }
    function selOne(el) {
        if (!el || el === document.body || el === document.documentElement) return selKind(el);
        if (el.id) return '#' + esc(el.id);
        const p = el.parentElement;
        const i = [...p.children].indexOf(el) + 1;
        const cls = [...el.classList].filter(c => !STATE_CLS.test(c)).map(c => '.' + esc(c)).join('');
        return selOne(p) + ' > ' + el.tagName.toLowerCase() + cls + ':nth-child(' + i + ')';
    }
    const partName = (el, sel) => {
        for (const [s, n] of PARTS) if (s === sel) return n;
        for (const [s, n] of PARTS) { try { if (document.querySelector(s) === el) return n; } catch (e) {} }
        const c = [...el.classList].filter(c => !STATE_CLS.test(c))[0];
        return el.id ? '#' + el.id : el.tagName.toLowerCase() + (c ? '.' + c : '');
    };
    let arrange = false, grid = +(localStorage.getItem('dbx-grid') || 1), snap = localStorage.getItem('dbx-snap') !== '0';
    let both = false;           // write the layout for desktop and phone together
    let selEl = null, selSel = '', scopeOne = false, hovEl = null;
    let guides = [];
    const mediaNow = () => both ? 'all' : (isPhone() ? 'phone' : 'desktop');

    function ruleFor(sel, media, make) {
        const rs = S().rules;
        let r = rs.find(r => r.sel === sel && (r.media || 'all') === media);
        if (!r && make) { r = { sel, media, props: {} }; rs.push(r); }
        return r;
    }
    function prune() { const s = S(); s.rules = s.rules.filter(r => r.props && Object.keys(r.props).length); }
    function setProps(obj, merge) {
        if (!selSel) return;
        const r = ruleFor(selSel, mediaNow(), true);
        Object.keys(obj).forEach(k => { const v = obj[k]; if (v === null || v === undefined || v === '') delete r.props[k]; else r.props[k] = String(v); });
        prune();
        if (selEl && /(left|top|right|bottom)/.test(Object.keys(obj).join(' '))) ['left', 'top', 'right', 'bottom'].forEach(p => selEl.style.removeProperty(p));
        commit(merge);
    }
    const getProp = p => { const r = selSel && ruleFor(selSel, mediaNow(), false); return r && r.props[p] !== undefined ? r.props[p] : ''; };

    function select(el, sel) {
        selEl = el;
        selSel = sel || (el ? (scopeOne ? selOne(el) : selKind(el)) : '');
        if (el) { ['left', 'top', 'right', 'bottom'].forEach(p => { if (el.style[p] && ruleFor(selSel, mediaNow(), false)) el.style.removeProperty(p); }); }
        if (tab === 'ARRANGE') render();
    }
    function setArrange(on) {
        arrange = on;
        document.documentElement.classList.toggle('dbx-arr', on);
        if (!on) { hovEl = null; drawOv(); }
        if (tab === 'ARRANGE') render();
    }

    // Containing block and the distances that place an element.
    const frameTop = () => PAGE ? 0 : (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--frame-top')) || 0);
    function container(el) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') return { l: 0, t: 0, r: innerWidth, b: innerHeight, el: null, fixed: true };
        if (cs.position === 'absolute') {
            const op = el.offsetParent || document.body;
            const b = op.getBoundingClientRect();
            const l = b.left + op.clientLeft, t = b.top + op.clientTop;
            return { l, t, r: l + op.clientWidth, b: t + op.clientHeight, el: op };
        }
        return null;
    }
    const underHeader = c => !PAGE && c && c.el && c.el.id === 'stage';
    function anchorOf(el) {
        const r = selSel && ruleFor(selSel, mediaNow(), false);
        const p = r ? r.props : {};
        let ax = null, ay = null;
        if (p.right && p.right !== 'auto') ax = 'r'; else if (p.left && p.left !== 'auto') ax = 'l';
        if (p.bottom && p.bottom !== 'auto') ay = 'b'; else if (p.top && p.top !== 'auto') ay = 't';
        if (!ax || !ay) {
            const c = container(el), b = el.getBoundingClientRect();
            if (c) {
                if (!ax) ax = (b.left + b.right) / 2 > (c.l + c.r) / 2 ? 'r' : 'l';
                if (!ay) ay = (b.top + b.bottom) / 2 > (c.t + c.b) / 2 && b.height < (c.b - c.t) * 0.6 ? 'b' : 't';
            } else { ax = ax || 'l'; ay = ay || 't'; }
        }
        return ax + ay;
    }
    // Props that put the element's border box at viewport rect b.
    function placeProps(el, b, anchor) {
        const cs = getComputedStyle(el);
        const c = container(el);
        const ml = num(cs.marginLeft), mt = num(cs.marginTop), mr = num(cs.marginRight), mb = num(cs.marginBottom);
        if (!c) {
            // In the flow: a relative nudge from where the flow puts it.
            const cur = el.getBoundingClientRect();
            const rl = cs.position === 'relative' ? num(cs.left) : 0, rt = cs.position === 'relative' ? num(cs.top) : 0;
            return { position: 'relative', left: Math.round(rl + b.left - cur.left) + 'px', top: Math.round(rt + b.top - cur.top) + 'px', right: 'auto', bottom: 'auto' };
        }
        const o = {};
        if (anchor[0] === 'l') { o.left = Math.round(b.left - ml - c.l) + 'px'; o.right = 'auto'; }
        else { o.right = Math.round(c.r - b.right - mr) + 'px'; o.left = 'auto'; }
        if (anchor[1] === 't') {
            const y = Math.round(b.top - mt - c.t);
            o.top = underHeader(c) ? 'calc(var(--frame-top) + ' + Math.round(y - frameTop()) + 'px)' : y + 'px';
            o.bottom = 'auto';
        } else { o.bottom = Math.round(c.b - b.bottom - mb) + 'px'; o.top = 'auto'; }
        return o;
    }
    function sizeProps(el, w, hgt) {
        const o = {};
        const p = el.parentElement, pcs = p ? getComputedStyle(p) : null, cs = getComputedStyle(el);
        if (cs.boxSizing === 'content-box') {
            if (w !== null) w -= num(cs.paddingLeft) + num(cs.paddingRight) + num(cs.borderLeftWidth) + num(cs.borderRightWidth);
            if (hgt !== null) hgt -= num(cs.paddingTop) + num(cs.paddingBottom) + num(cs.borderTopWidth) + num(cs.borderBottomWidth);
        }
        const flex = pcs && /flex/.test(pcs.display);
        const col = flex && /column/.test(pcs.flexDirection);
        if (w !== null) { if (flex && !col && cs.flexBasis !== 'auto') { o['flex-basis'] = Math.round(w) + 'px'; } o.width = Math.round(w) + 'px'; o['max-width'] = 'none'; }
        if (hgt !== null) { if (col && cs.flexBasis !== 'auto') { o['flex-basis'] = Math.round(hgt) + 'px'; } o.height = Math.round(hgt) + 'px'; o['max-height'] = 'none'; }
        return o;
    }
    // What is shown in X / Y: the distance from the anchored side.
    function readXY(el) {
        const c = container(el), b = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (!c) return { x: cs.position === 'relative' ? r1(num(cs.left)) : 0, y: cs.position === 'relative' ? r1(num(cs.top)) : 0, flow: true };
        const a = anchorOf(el);
        const x = a[0] === 'l' ? b.left - num(cs.marginLeft) - c.l : c.r - b.right - num(cs.marginRight);
        let y = a[1] === 't' ? b.top - num(cs.marginTop) - c.t : c.b - b.bottom - num(cs.marginBottom);
        if (a[1] === 't' && underHeader(c)) y -= frameTop();
        return { x: Math.round(x), y: Math.round(y), a, flow: false, under: a[1] === 't' && underHeader(c) };
    }

    // ── the overlay ─────────────────────────────────────────────────────
    const HD = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const CUR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
    function drawOv() {
        ov.textContent = '';
        if (!arrange || win.hidden) return;
        if (hovEl && hovEl !== selEl && hovEl.isConnected) {
            const b = hovEl.getBoundingClientRect();
            ov.appendChild(h('div', { class: 'hov', style: `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px` }));
        }
        if (selEl && selEl.isConnected) {
            const b = selEl.getBoundingClientRect();
            ov.appendChild(h('div', { class: 'box', style: `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px` }));
            ov.appendChild(h('div', { class: 'nm', style: `left:${b.left}px;top:${Math.max(0, b.top - 15)}px` }, partName(selEl, selSel) + '  ' + Math.round(b.width) + ' × ' + Math.round(b.height)));
            const P = { nw: [b.left, b.top], n: [b.left + b.width / 2, b.top], ne: [b.right, b.top], e: [b.right, b.top + b.height / 2],
                        se: [b.right, b.bottom], s: [b.left + b.width / 2, b.bottom], sw: [b.left, b.bottom], w: [b.left, b.top + b.height / 2] };
            if (!fixedEl(selEl)) HD.forEach(k => {
                const d = h('div', { class: 'hd', style: `left:${P[k][0]}px;top:${P[k][1]}px;cursor:${CUR[k]}!important` });
                d.addEventListener('pointerdown', e => startDrag(e, k));
                ov.appendChild(d);
            });
        }
        guides.forEach(g => ov.appendChild(h('div', { class: g.x !== undefined ? 'gx' : 'gy', style: g.x !== undefined ? `left:${g.x}px` : `top:${g.y}px` })));
    }
    (function loop() { if (arrange) drawOv(); requestAnimationFrame(loop); })();

    // ── picking and dragging ────────────────────────────────────────────
    const ours = t => t && t.closest && t.closest('#dbx,#dbx-ov,#dbx-pill');
    function deepest(x, y) {
        const list = document.elementsFromPoint(x, y);
        return list.find(e => !ours(e) && e !== document.documentElement) || null;
    }
    let drag = null;
    // The map and the page's frame are picked for their look, never dragged: a drag there
    // would move the whole map off the screen.
    const FIXED = '#map, #map .maplibregl-canvas-container, #map canvas, #stage, #shell, body, html';
    const fixedEl = el => { try { return el.matches(FIXED); } catch (e) { return false; } };
    function targets(el) {
        const xs = [], ys = [];
        const add = b => { xs.push(b.left, b.right, (b.left + b.right) / 2); ys.push(b.top, b.bottom, (b.top + b.bottom) / 2); };
        add({ left: 0, right: innerWidth, top: 0, bottom: innerHeight });
        const c = container(el);
        if (c) { add({ left: c.l, right: c.r, top: c.t, bottom: c.b }); if (underHeader(c)) ys.push(c.t + frameTop()); }
        const set = new Set();
        PARTS.forEach(([s]) => { try { document.querySelectorAll(s).forEach(e => set.add(e)); } catch (e) {} });
        if (el.parentElement) [...el.parentElement.children].forEach(e => set.add(e));
        set.forEach(e => {
            if (e === el || el.contains(e) || e.contains(el) || ours(e)) return;
            const b = e.getBoundingClientRect();
            if (b.width < 4 || b.height < 4 || getComputedStyle(e).visibility === 'hidden') return;
            add(b);
        });
        return { xs, ys, c };
    }
    function snapTo(v, list, gridOrigin) {
        let best = null;
        if (snap) list.forEach(t => { const d = t - v; if (Math.abs(d) <= 5 && (best === null || Math.abs(d) < Math.abs(best))) best = d; });
        if (best !== null) return { d: best, line: v + best };
        if (grid > 1) { const g = Math.round((v - gridOrigin) / grid) * grid + gridOrigin; return { d: g - v, line: null }; }
        return { d: 0, line: null };
    }
    function startDrag(e, handle) {
        if (!selEl) return;
        e.preventDefault(); e.stopPropagation();
        if (fixedEl(selEl)) return;
        const b = selEl.getBoundingClientRect();
        drag = { handle, sx: e.clientX, sy: e.clientY, b: { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height },
                 t: targets(selEl), anchor: anchorOf(selEl), moved: false };
        document.addEventListener('pointermove', onDrag, true);
        document.addEventListener('pointerup', endDrag, true);
    }
    function onDrag(e) {
        if (!drag) return;
        e.preventDefault(); e.stopPropagation();
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        drag.moved = true;
        const o = drag.b, k = drag.handle, T = drag.t;
        const gx0 = T.c ? T.c.l : 0, gy0 = T.c ? T.c.t + (underHeader(T.c) ? frameTop() : 0) : 0;
        guides = [];
        let nb = { left: o.left, top: o.top, right: o.right, bottom: o.bottom };
        if (k === 'move') {
            nb = { left: o.left + dx, top: o.top + dy, right: o.right + dx, bottom: o.bottom + dy };
            // Snap whichever edge or the centre lies nearest a line.
            const cand = [nb.left, nb.right, (nb.left + nb.right) / 2].map(v => snapTo(v, T.xs, gx0));
            let sx = cand.reduce((a, c) => (c.line !== null && (a === null || Math.abs(c.d) < Math.abs(a.d))) ? c : a, null) || cand[0];
            const cy = [nb.top, nb.bottom, (nb.top + nb.bottom) / 2].map(v => snapTo(v, T.ys, gy0));
            let sy = cy.reduce((a, c) => (c.line !== null && (a === null || Math.abs(c.d) < Math.abs(a.d))) ? c : a, null) || cy[0];
            nb.left += sx.d; nb.right += sx.d; nb.top += sy.d; nb.bottom += sy.d;
            if (sx.line !== null) guides.push({ x: sx.line });
            if (sy.line !== null) guides.push({ y: sy.line });
            setProps(placeProps(selEl, nb, drag.anchor), true);
        } else {
            if (/w/.test(k)) { const s = snapTo(o.left + dx, T.xs, gx0); nb.left = o.left + dx + s.d; if (s.line !== null) guides.push({ x: s.line }); }
            if (/e/.test(k)) { const s = snapTo(o.right + dx, T.xs, gx0); nb.right = o.right + dx + s.d; if (s.line !== null) guides.push({ x: s.line }); }
            if (/n/.test(k)) { const s = snapTo(o.top + dy, T.ys, gy0); nb.top = o.top + dy + s.d; if (s.line !== null) guides.push({ y: s.line }); }
            if (/s/.test(k)) { const s = snapTo(o.bottom + dy, T.ys, gy0); nb.bottom = o.bottom + dy + s.d; if (s.line !== null) guides.push({ y: s.line }); }
            if (nb.right - nb.left < 8) nb.right = nb.left + 8;
            if (nb.bottom - nb.top < 8) nb.bottom = nb.top + 8;
            const w = /[we]/.test(k) ? nb.right - nb.left : null, hh = /[ns]/.test(k) ? nb.bottom - nb.top : null;
            const props = sizeProps(selEl, w, hh);
            // Placed from the side it is held by, so the edges not dragged stay where they are.
            if (container(selEl) || /[wn]/.test(k)) Object.assign(props, placeProps(selEl, nb, drag.anchor));
            setProps(props, true);
        }
        R.applyCss();
    }
    function endDrag(e) {
        document.removeEventListener('pointermove', onDrag, true);
        document.removeEventListener('pointerup', endDrag, true);
        if (drag && drag.moved) { e.preventDefault(); e.stopPropagation(); lastCommit = 0; commit(false); }
        const pick = drag && !drag.moved && drag.pick;
        drag = null; guides = [];
        if (pick) { scopeOne = false; select(pick); return; }
        if (tab === 'ARRANGE') render();
    }
    const BLOCK = ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'pointerup'];
    // A drawn icon is picked as the button or box that holds it.
    const pickable = el => { while (el && el instanceof SVGElement) el = el.parentNode; return el && el.nodeType === 1 ? el : null; };
    BLOCK.forEach(t => document.addEventListener(t, e => {
        if (!arrange || ours(e.target) || drag) return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (t !== 'pointerdown') return;
        let el = pickable(deepest(e.clientX, e.clientY));
        if (!el) return;
        if (e.altKey) { const base = selEl && selEl.contains(el) ? selEl : el; if (base.parentElement && base.parentElement !== document.documentElement) { scopeOne = false; select(base.parentElement); } return; }
        // Inside what is picked: a drag moves it, a click without moving picks the thing under the pointer.
        if (selEl && selEl.contains(el)) {
            if (fixedEl(selEl)) { if (el !== selEl) { scopeOne = false; select(el); } return; }
            startDrag(e, 'move'); if (drag) drag.pick = el === selEl ? null : el; return;
        }
        scopeOne = false; select(el);
        startDrag(e, 'move');
    }, true));
    document.addEventListener('pointermove', e => {
        if (!arrange || drag) return;
        if (ours(e.target)) { hovEl = null; return; }
        hovEl = pickable(deepest(e.clientX, e.clientY));
    }, true);
    document.addEventListener('keydown', e => {
        const typing = e.target && e.target.matches && e.target.matches('input,select,textarea');
        if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); go(e.shiftKey ? 1 : -1); return; }
        if ((e.ctrlKey || e.metaKey) && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); e.stopPropagation(); go(1); return; }
        if (!arrange || typing) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); select(null); return; }
        if (!selEl || !/^Arrow/.test(e.key) || fixedEl(selEl)) return;
        e.preventDefault(); e.stopPropagation();
        const d = e.shiftKey ? 10 : 1;
        const b = selEl.getBoundingClientRect();
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        setProps(placeProps(selEl, { left: b.left + dx, right: b.right + dx, top: b.top + dy, bottom: b.bottom + dy }, anchorOf(selEl)), true);
        R.applyCss();
        setTimeout(() => { if (tab === 'ARRANGE') render(); }, 0);
    }, true);

    // ── ARRANGE tab ─────────────────────────────────────────────────────
    function renderArrange() {
        const top = h('div', { class: 'dbx-row' },
            h('button', { class: 'dbx-btn big' + (arrange ? ' on' : ''), onclick: () => setArrange(!arrange),
                title: 'While on, a click picks a part instead of using the map. Drag to move, drag the squares to resize, arrows to nudge (Shift ×10), Esc to let go.' }, arrange ? 'ARRANGE: ON' : 'ARRANGE: OFF'),
            h('span', { style: 'margin-left:auto;color:#555' }, 'grid'),
            numIn(grid > 1 ? grid : '', '1', v => { grid = Math.max(1, Math.round(num(v) || 1)); localStorage.setItem('dbx-grid', grid); }, { w4: true, title: 'Grid in px. 1 means none.' }),
            h('button', { class: 'dbx-btn' + (snap ? ' on' : ''), title: 'Snap to the edges and centres of the other parts', onclick: () => { snap = !snap; localStorage.setItem('dbx-snap', snap ? '1' : '0'); render(); } }, 'snap'));
        const mode = h('div', { class: 'dbx-mode' },
            h('div', null, 'Layout written for ', h('b', null, both ? 'DESKTOP AND PHONE' : isPhone() ? 'PHONE' : 'DESKTOP'),
                both ? '' : (isPhone() ? ' (this window is 760 px or narrower)' : ' (this window is wider than 760 px)')),
            h('label', { style: 'display:flex;align-items:center;gap:5px;margin-top:3px;cursor:pointer' },
                h('input', { type: 'checkbox', checked: both, onchange: e => { both = e.target.checked; render(); badge(); } }), 'write for both at once'),
            h('div', { class: 'dbx-note', style: 'margin:3px 0 0' }, 'For the phone layout, make the window narrower than 760 px, or use Chrome’s device toolbar (Ctrl+Shift+M).'));
        const parts = h('div', { class: 'dbx-parts' });
        PARTS.forEach(([s, n]) => {
            let el = null; try { el = document.querySelector(s); } catch (e) {}
            const vis = el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
            const edited = S().rules.some(r => r.sel === s || (el && (() => { try { return el.matches(r.sel); } catch (e) { return false; } })()));
            parts.appendChild(h('button', { class: 'dbx-part' + (vis ? '' : ' na') + (selEl && el === selEl ? ' sel' : '') + (edited ? ' ed' : ''),
                title: vis ? s : 'Not on screen now. Open it on the site first (for the site record: click a site).',
                onclick: () => { if (!el) return; if (!arrange) setArrange(true); scopeOne = false; select(el, s); } }, n));
        });
        const out = [top, mode, h('div', { class: 'dbx-h' }, 'PARTS'), parts];
        if (selEl) out.push(renderInspector());
        else out.push(h('div', { class: 'dbx-note', style: 'margin-top:10px' },
            'Turn ', h('b', null, 'ARRANGE'), ' on, then click anything on the page. ', h('b', null, 'Alt'), '-click picks the thing around it.'));
        const hidden = S().rules.filter(r => r.props.display === 'none');
        if (hidden.length) {
            out.push(h('div', { class: 'dbx-h' }, 'HIDDEN'));
            hidden.forEach(r => out.push(h('div', { class: 'dbx-li' }, h('span', { class: 'nm dbx-mono' }, r.sel), h('span', { class: 'ct' }, r.media),
                h('button', { class: 'dbx-btn', onclick: () => { delete r.props.display; prune(); commit(); render(); } }, 'show'))));
        }
        return out;
    }

    function renderInspector() {
        const el = selEl;
        if (!el.isConnected) { selEl = null; return h('div'); }
        const cs = getComputedStyle(el);
        const box = h('div', { class: 'dbx-sel' });
        const selIn = h('input', { class: 'dbx-t dbx-mono', value: selSel, title: 'Which elements this applies to (CSS selector)' });
        selIn.addEventListener('change', () => { selSel = selIn.value.trim(); render(); });
        box.append(
            h('div', { class: 'dbx-row' }, h('span', { class: 'ttl' }, partName(el, selSel)), h('span', { style: 'flex:1' }),
                h('button', { class: 'dbx-btn', title: 'Pick the thing this sits in (Alt-click does the same)', onclick: () => { if (el.parentElement && el.parentElement !== document.documentElement) select(el.parentElement); } }, '↑ outer'),
                h('button', { class: 'dbx-btn', title: 'Put this element back as it was, for this layout', onclick: () => { const r = ruleFor(selSel, mediaNow(), false); if (r) { r.props = {}; prune(); commit(); render(); } } }, 'reset')),
            h('div', { class: 'dbx-row' }, selIn),
            h('div', { class: 'dbx-row' }, h('span', { class: 'lb' }, 'applies to'),
                h('span', { class: 'dbx-seg' },
                    h('button', { class: scopeOne ? '' : 'on', onclick: () => { scopeOne = false; select(el); } }, 'every one like it'),
                    h('button', { class: scopeOne ? 'on' : '', onclick: () => { scopeOne = true; select(el); } }, 'only this one'))));
        const sec = (t, ...rows) => [h('div', { class: 'dbx-h' }, t), ...rows];
        const row = (label, ...c) => h('div', { class: 'dbx-row' }, h('span', { class: 'lb' }, label), ...c);
        const prop = (p, label, opts) => {
            opts = opts || {};
            const cur = getProp(p);
            const shown = opts.read ? opts.read() : cs.getPropertyValue(p);
            return numIn(cur, shown ? r1(num(shown)) : '', (v, live) => { setProps({ [p]: v === '' ? null : (opts.raw ? v : px(v)) }, live); if (!live) render(); }, Object.assign({ unit: opts.raw ? '' : 'px' }, opts));
        };
        // PLACE
        const xy = readXY(el);
        const c = container(el);
        const place = [];
        if (!xy.flow) {
            const a = xy.a;
            const ab = (k, t) => h('button', { class: a === k ? 'on' : '', title: t, onclick: () => {
                const b = el.getBoundingClientRect();
                setProps(placeProps(el, { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, k)); render(); } });
            place.push(row('held from', h('span', { class: 'dbx-anchor' }, ab('lt', 'top left'), ab('rt', 'top right'), ab('lb', 'bottom left'), ab('rb', 'bottom right')),
                h('span', { class: 'dbx-note', style: 'margin:0 0 0 6px' }, (a[0] === 'l' ? 'left' : 'right') + ' / ' + (a[1] === 't' ? (xy.under ? 'top, under the header' : 'top') : 'bottom'))));
        }
        const setXY = (which, v) => {
            if (v === '') return;
            const n = num(v);
            if (xy.flow) { setProps({ position: 'relative', [which === 'x' ? 'left' : 'top']: n + 'px' }); render(); return; }
            const a = anchorOf(el);
            if (which === 'x') setProps(a[0] === 'l' ? { left: n + 'px', right: 'auto' } : { right: n + 'px', left: 'auto' });
            else if (a[1] === 't') setProps({ top: underHeader(c) ? 'calc(var(--frame-top) + ' + n + 'px)' : n + 'px', bottom: 'auto' });
            else setProps({ bottom: n + 'px', top: 'auto' });
            render();
        };
        const bb = el.getBoundingClientRect();
        place.push(row(xy.flow ? 'nudge x / y' : 'x / y',
            numIn('', xy.x, v => setXY('x', v), { title: xy.flow ? 'Moves it from its place in the row' : 'Distance from the held side' }),
            numIn('', xy.y, v => setXY('y', v), { title: xy.under ? 'Distance under the site header' : '' }),
            h('span', { class: 'dbx-note', style: 'margin:0 0 0 4px' }, xy.flow ? 'in the flow' : 'px')));
        place.push(row('width / height',
            numIn(getProp('width') || getProp('flex-basis'), Math.round(bb.width), v => { setProps(v === '' ? { width: null, 'max-width': null } : sizeProps(el, num(v), null)); render(); }),
            numIn(getProp('height'), Math.round(bb.height), v => { setProps(v === '' ? { height: null, 'max-height': null, 'flex-basis': null } : sizeProps(el, null, num(v))); render(); }),
            x(getProp('width') || getProp('height') || getProp('flex-basis'), () => { setProps({ width: null, height: null, 'max-width': null, 'max-height': null, 'flex-basis': null }); render(); })));
        place.push(row('layer', prop('z-index', '', { raw: true, read: () => cs.zIndex === 'auto' ? '' : cs.zIndex }),
            h('span', { class: 'dbx-note', style: 'margin:0 4px' }, 'order'),
            h('button', { class: 'dbx-btn', title: 'Earlier among its neighbours', onclick: () => reorder(-1) }, '▲'),
            h('button', { class: 'dbx-btn', title: 'Later among its neighbours', onclick: () => reorder(1) }, '▼'),
            h('span', { style: 'flex:1' }),
            h('button', { class: 'dbx-btn' + (getProp('display') === 'none' ? ' on' : ''), title: 'Hide it in this layout', onclick: () => { setProps({ display: getProp('display') === 'none' ? null : 'none' }); select(null); } }, 'hide')));
        // SPACE
        const four = (base, label) => row(label, ...['top', 'right', 'bottom', 'left'].map(s => prop(base + '-' + s, '', { w4: true, title: s })),
            x(['top', 'right', 'bottom', 'left'].some(s => getProp(base + '-' + s)), () => { setProps({ [base + '-top']: null, [base + '-right']: null, [base + '-bottom']: null, [base + '-left']: null }); render(); }));
        const space = [four('padding', 'padding'), four('margin', 'margin'),
            row('gap', prop('gap', '', { read: () => cs.rowGap === 'normal' ? '' : cs.rowGap }), x(getProp('gap'), () => { setProps({ gap: null }); render(); }))];
        // TYPE
        const fams = familyOptions();
        const fSel = h('select', { class: 'dbx-s' + (getProp('font-family') ? ' set' : '') }, h('option', { value: '' }, '— ' + firstFamily(cs.fontFamily)),
            fams.map(f => h('option', { value: f, selected: unq(getProp('font-family').split(',')[0] || '') === f }, f)));
        fSel.addEventListener('change', () => { setProps({ 'font-family': fSel.value ? famValue(fSel.value, cs.fontFamily) : null }); render(); });
        const wSel = h('select', { class: 'dbx-s' + (getProp('font-weight') ? ' set' : ''), style: 'flex:0 0 62px' }, h('option', { value: '' }, '— ' + cs.fontWeight),
            ['100', '200', '300', '400', '500', '600', '700', '800', '900'].map(w => h('option', { value: w, selected: getProp('font-weight') === w }, w)));
        wSel.addEventListener('change', () => { setProps({ 'font-weight': wSel.value || null }); render(); });
        const [cc, ct] = colorIn(getProp('color'), R.colorKey(cs.color) || '', (v, live) => { setProps({ color: v || null }, live); if (!live) render(); });
        const align = h('span', { class: 'dbx-seg' }, ['left', 'center', 'right'].map(a => h('button', { class: getProp('text-align') === a ? 'on' : '', onclick: () => { setProps({ 'text-align': getProp('text-align') === a ? null : a }); render(); } }, a[0].toUpperCase())));
        const kase = h('span', { class: 'dbx-seg' }, [['none', 'Aa'], ['uppercase', 'AA'], ['lowercase', 'aa']].map(([v, l]) => h('button', { class: getProp('text-transform') === v ? 'on' : '', onclick: () => { setProps({ 'text-transform': getProp('text-transform') === v ? null : v }); render(); } }, l)));
        const type = [row('typeface', fSel, x(getProp('font-family'), () => { setProps({ 'font-family': null }); render(); })),
            row('size / weight', prop('font-size'), wSel, x(getProp('font-size') || getProp('font-weight'), () => { setProps({ 'font-size': null, 'font-weight': null }); render(); })),
            row('spacing / line', prop('letter-spacing', '', { step: 0.1, read: () => cs.letterSpacing === 'normal' ? '0' : cs.letterSpacing }), prop('line-height', '', { step: 1 }),
                x(getProp('letter-spacing') || getProp('line-height'), () => { setProps({ 'letter-spacing': null, 'line-height': null }); render(); })),
            row('colour', cc, ct, x(getProp('color'), () => { setProps({ color: null }); render(); })),
            row('align / case', align, kase)];
        // BOX
        const [bc, bt] = colorIn(getProp('background-color'), R.colorKey(cs.backgroundColor) || '', (v, live) => { setProps({ 'background-color': v || null }, live); if (!live) render(); });
        let side = boxSide;
        const sideSeg = h('span', { class: 'dbx-seg' }, [['all', 'all'], ['top', 'T'], ['right', 'R'], ['bottom', 'B'], ['left', 'L']].map(([v, l]) => h('button', { class: side === v ? 'on' : '', onclick: () => { boxSide = v; render(); } }, l)));
        const sides = side === 'all' ? ['top', 'right', 'bottom', 'left'] : [side];
        const bw = 'border-' + sides[0] + '-width';
        const setB = (what, v, live) => { const o = {}; sides.forEach(s => { o['border-' + s + '-' + what] = v === '' ? null : v; }); setProps(o, live); };
        const [brc, brt] = colorIn(getProp('border-' + sides[0] + '-color'), R.colorKey(cs.getPropertyValue('border-' + sides[0] + '-color')) || '', (v, live) => { setB('color', v, live); if (!live) render(); });
        const bsSel = h('select', { class: 'dbx-s' + (getProp('border-' + sides[0] + '-style') ? ' set' : ''), style: 'flex:0 0 66px' }, h('option', { value: '' }, '— ' + cs.getPropertyValue('border-' + sides[0] + '-style')),
            ['solid', 'dashed', 'dotted', 'none'].map(v => h('option', { value: v, selected: getProp('border-' + sides[0] + '-style') === v }, v)));
        bsSel.addEventListener('change', () => { setB('style', bsSel.value); render(); });
        const boxRows = [row('background', bc, bt, x(getProp('background-color'), () => { setProps({ 'background-color': null }); render(); })),
            row('border', sideSeg),
            row('', numIn(getProp(bw), r1(num(cs.getPropertyValue(bw))), (v, live) => { setB('width', px(v), live); if (!live) render(); }, { step: 0.5, unit: 'px', title: 'line weight' }), bsSel),
            row('', brc, brt, x(['width', 'style', 'color'].some(w => sides.some(s => getProp('border-' + s + '-' + w))), () => { const o = {}; ['top', 'right', 'bottom', 'left'].forEach(s => ['width', 'style', 'color'].forEach(w => { o['border-' + s + '-' + w] = null; })); setProps(o); render(); }, 'Borders back to how they were')),
            row('opacity', numIn(getProp('opacity'), r1(num(cs.opacity)), (v, live) => { setProps({ opacity: v === '' ? null : String(Math.max(0, Math.min(1, num(v)))) }, live); if (!live) render(); }, { step: 0.05 }),
                x(getProp('opacity'), () => { setProps({ opacity: null }); render(); }))];
        return h('div', null, box, ...sec('PLACE AND SIZE', ...place), ...sec('SPACING', ...space), ...sec('TYPE', ...type), ...sec('BOX', ...boxRows));
    }
    let boxSide = 'all';
    function reorder(d) {
        const el = selEl, p = el.parentElement;
        if (!p) return;
        const kids = [...p.children].filter(k => !ours(k));
        const vis = kids.map(k => ({ k, o: num(getComputedStyle(k).order) })).map((v, i) => Object.assign(v, { i }))
            .sort((a, b) => a.o - b.o || a.i - b.i).map(v => v.k);
        const i = vis.indexOf(el), j = i + d;
        if (j < 0 || j >= vis.length) return;
        [vis[i], vis[j]] = [vis[j], vis[i]];
        const media = mediaNow();
        vis.forEach((k, n) => { const r = ruleFor(selOne(k), media, true); r.props.order = String(n + 1); });
        const pcs = getComputedStyle(p);
        if (!/flex|grid/.test(pcs.display)) { const r = ruleFor(selOne(p), media, true); r.props.display = 'flex'; r.props['flex-direction'] = 'column'; }
        commit(); render();
    }

    // ═════════════════════════════════════════════════════════════════════
    // What the page uses: typefaces, sizes, weights, widths, colours.
    // ═════════════════════════════════════════════════════════════════════
    const unq = f => (f || '').trim().replace(/^["']|["']$/g, '');
    const firstFamily = v => unq((v || '').split(',')[0]);
    const KNOWN = ['Plex', 'PlexMono', 'Cutive Mono', 'Helvetica', 'Helvetica Neue', 'Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana', 'system-ui'];
    function familyOptions() {
        const set = new Set(KNOWN);
        inventory().fams.forEach((v, k) => set.add(k));
        (S().fontFiles || []).forEach(f => set.add(f.family));
        (S().googleFonts || []).forEach(g => set.add(g.split(':')[0]));
        return [...set];
    }
    const famValue = (f, orig) => '"' + f + '", ' + (/mono|courier/i.test(orig) ? 'monospace' : 'sans-serif');
    function inventory() {
        R.collectRules();
        const fams = new Map(), sizes = new Map(), weights = new Map(), widths = new Map(), colors = new Map(), where = new Map();
        const bump = (m, k, by) => { if (k === null || k === undefined || k === '') return; m.set(k, (m.get(k) || 0) + (by || 1)); };
        const lk = v => { const m = /^\s*(-?[\d.]+)(px|em|rem|%)?\s*$/.exec(String(v)); return m ? (+m[1]) + (m[2] || '') : null; };
        const col = (text, sel, kind) => {
            (String(text).match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)|\b(?:black|white)\b/g) || []).forEach(m => {
                const k = R.colorKey(m); if (!k || /00$/.test(k) && k.length === 9) return;
                const c = colors.get(k) || { ui: 0, map: 0, vars: new Set() };
                c[kind] += 1; colors.set(k, c);
                if (sel) { const w = where.get(k) || new Set(); if (w.size < 12) w.add(sel); where.set(k, w); }
            });
        };
        R.rules.forEach(e => {
            const sel = e.r.selectorText;
            if (/^#dbx|dbx-/.test(sel)) return;
            Object.keys(e.orig).forEach(p => {
                const v = e.orig[p][0];
                if (!v) return;
                if (p === 'font-family') bump(fams, firstFamily(v));
                else if (p === 'font' && v.indexOf('var(') >= 0) { const m = /(?:"([^"]+)"|([A-Za-z][\w-]*))\s*(?:,|$)/.exec(v.replace(/^.*?\d[\w.%]*(?:\/[\d.]+\w*)?\s+/, '')); if (m) bump(fams, m[1] || m[2]); }
                if (p === 'font-size') bump(sizes, lk(v));
                if (p === 'font-weight') bump(weights, v.trim());
                if (/^(border-(top|right|bottom|left)-width|outline-width|stroke-width|text-decoration-thickness)$/.test(p)) bump(widths, lk(v));
                if (/^(border(-top|-right|-bottom|-left)?|outline)$/.test(p)) { const m = /(-?\.?\d[\d.]*px)/.exec(v); if (m) bump(widths, lk(m[1])); }
                col(v, sel, 'ui');
                if (p.startsWith('--')) { const k = R.colorKey(v.trim()); if (k) { const c = colors.get(k); if (c) c.vars.add((sel === ':root' ? '' : sel + ' ') + p); } }
            });
        });
        // Colours written into the page's own drawing (symbols, swatches).
        document.querySelectorAll('[fill],[stroke],[style]').forEach(el => {
            if (ours(el)) return;
            ['fill', 'stroke'].forEach(a => { const v = el.getAttribute(a); if (v && v !== 'none') col(v, null, 'ui'); });
        });
        // And the map's.
        const L = R.layers;
        const walk = (e, f) => { if (typeof e === 'string') f(e); else if (Array.isArray(e)) e.forEach(x => walk(x, f)); };
        Object.keys(L).forEach(id => Object.keys(L[id].paint || {}).forEach(p => { if (/-color$/.test(p)) walk(L[id].paint[p], s => col(s, 'map: ' + id, 'map')); }));
        return { fams, sizes, weights, widths, colors, where };
    }

    // ═════════════════════════════════════════════════════════════════════
    // TYPE
    // ═════════════════════════════════════════════════════════════════════
    function renderType() {
        const inv = inventory();
        const s = S();
        const out = [h('div', { class: 'dbx-note' }, 'Each line is something the site uses. Change it here and it changes everywhere it is used. To change one part only, pick it in ', h('b', null, 'ARRANGE'), '.')];
        out.push(h('div', { class: 'dbx-h' }, 'TYPEFACES'));
        const opts = familyOptions();
        [...inv.fams.entries()].sort((a, b) => b[1] - a[1]).forEach(([f, n]) => {
            if (/^(inherit|initial|sans-serif|serif|monospace|ui-monospace)$/.test(f)) return;
            const to = s.fonts[f];
            const sel = h('select', { class: 'dbx-s' + (to ? ' set' : ''), style: 'flex:0 0 118px' }, h('option', { value: '' }, 'keep'), opts.filter(o => o !== f).map(o => h('option', { value: o, selected: to === o }, o)));
            sel.addEventListener('change', () => { if (sel.value) s.fonts[f] = sel.value; else delete s.fonts[f]; commit(); render(); });
            out.push(h('div', { class: 'dbx-li' + (to ? ' set' : '') },
                h('span', { class: 'dbx-sample', style: 'font-family:"' + (to || f) + '"', title: f + ' · used in ' + n + ' rules' }, f, h('small', { style: 'font:9.5px Plex,sans-serif;color:#999;margin-left:6px' }, to ? '→ ' + to : n + '×')),
                sel, x(to, () => { delete s.fonts[f]; commit(); render(); })));
        });
        // Bring in a typeface.
        const gIn = h('input', { class: 'dbx-t', placeholder: 'Google Fonts name, e.g. Inter' });
        out.push(h('div', { class: 'dbx-h' }, 'ADD A TYPEFACE'));
        out.push(h('div', { class: 'dbx-row' }, gIn, h('button', { class: 'dbx-btn', onclick: () => {
            const v = gIn.value.trim(); if (!v) return;
            const spec = /:/.test(v) ? v : v + ':wght@100;200;300;400;500;600;700';
            if (s.googleFonts.indexOf(spec) < 0) s.googleFonts.push(spec);
            commit(); render(); } }, 'add')));
        const file = h('input', { type: 'file', accept: '.woff2,.woff,.ttf,.otf', style: 'display:none' });
        file.addEventListener('change', () => {
            const f = file.files[0]; if (!f) return;
            const rd = new FileReader();
            rd.onload = () => {
                const family = f.name.replace(/\.(woff2?|ttf|otf)$/i, '').replace(/[-_](regular|light|thin|medium|book|\d00)$/i, '').replace(/[-_]+/g, ' ');
                const weight = /thin|100/i.test(f.name) ? 100 : /extralight|200/i.test(f.name) ? 200 : /light|300/i.test(f.name) ? 300 : /medium|500/i.test(f.name) ? 500 : /semibold|600/i.test(f.name) ? 600 : /bold|700/i.test(f.name) ? 700 : 400;
                const ext = f.name.split('.').pop().toLowerCase();
                s.fontFiles.push({ family, weight, src: rd.result, format: ext === 'ttf' ? 'truetype' : ext === 'otf' ? 'opentype' : ext, file: f.name });
                commit(); render();
            };
            rd.readAsDataURL(f);
        });
        out.push(h('div', { class: 'dbx-row' }, h('button', { class: 'dbx-btn', onclick: () => file.click() }, 'upload a font file…'), file,
            h('span', { class: 'dbx-note', style: 'margin:0' }, '.woff2 .woff .ttf .otf')));
        s.googleFonts.forEach((g, i) => out.push(h('div', { class: 'dbx-li' }, h('span', { class: 'nm', style: 'font-family:"' + g.split(':')[0] + '"' }, g.split(':')[0], h('small', null, 'Google Fonts')),
            x(true, () => { s.googleFonts.splice(i, 1); commit(); render(); }, 'Remove'))));
        s.fontFiles.forEach((f, i) => {
            const w = numIn(f.weight, '400', v => { f.weight = Math.round(num(v)) || 400; commit(); }, { w4: true, title: 'weight this file is', step: 100 });
            out.push(h('div', { class: 'dbx-li' }, h('span', { class: 'nm', style: 'font-family:"' + f.family + '"' }, f.family, h('small', null, f.file || 'file')), w,
                x(true, () => { s.fontFiles.splice(i, 1); commit(); render(); }, 'Remove')));
        });
        out.push(h('div', { class: 'dbx-note' }, 'A typeface added here shows up in every typeface list.'));
        // Sizes and weights.
        out.push(h('div', { class: 'dbx-h' }, 'TYPE SIZES'));
        [...inv.sizes.entries()].filter(([k]) => /px$/.test(k) && num(k) > 0).sort((a, b) => num(a[0]) - num(b[0])).forEach(([k, n]) => {
            const to = s.sizes[k];
            out.push(h('div', { class: 'dbx-li' + (to ? ' set' : '') }, h('span', { class: 'nm', style: 'font-size:' + Math.min(18, num(to || k)) + 'px' }, k, h('small', null, n + '×')),
                h('span', { class: 'ct' }, '→'), numIn(to || '', k, v => { if (v) s.sizes[k] = px(v); else delete s.sizes[k]; commit(); render(); }, { step: 0.5, unit: 'px' }),
                x(to, () => { delete s.sizes[k]; commit(); render(); })));
        });
        out.push(h('div', { class: 'dbx-h' }, 'WEIGHTS'));
        [...inv.weights.entries()].sort().forEach(([k, n]) => {
            const to = s.weights[k];
            const sel = h('select', { class: 'dbx-s' + (to ? ' set' : ''), style: 'flex:0 0 70px' }, h('option', { value: '' }, 'keep'), ['100', '200', '300', '400', '500', '600', '700', '800', '900'].map(w => h('option', { value: w, selected: String(to) === w }, w)));
            sel.addEventListener('change', () => { if (sel.value) s.weights[k] = sel.value; else delete s.weights[k]; commit(); render(); });
            out.push(h('div', { class: 'dbx-li' + (to ? ' set' : '') }, h('span', { class: 'nm', style: 'font-weight:' + (to || k) }, k, h('small', null, n + '×')), sel, x(to, () => { delete s.weights[k]; commit(); render(); })));
        });
        out.push(h('div', { class: 'dbx-note' }, 'A weight shows only if the typeface has it: Plex here has 400 and 500, Cutive Mono only 400.'));
        return out;
    }

    // ═════════════════════════════════════════════════════════════════════
    // COLOUR
    // ═════════════════════════════════════════════════════════════════════
    const VAR_NAMES = { '--frame': 'window outlines', '--rule': 'rules inside windows', '--hair': 'row separators', '--sub': 'secondary text',
        '--sel': 'selection', '--tab': 'tab behind', '--r-old': 'reception · closed', '--r-active': 'reception · receiving', '--r-future': 'reception · to come',
        '--r-cont': 'reception · contaminated', '--c-done': 'construction · finished', '--c-active': 'construction · under way', '--c-planned': 'construction · planned',
        '--terrain': 'terrain change', '--unknown': 'no status', '--stack': 'behind the sheets', '--stack-tab': 'sheet tab behind', '--grid': 'table gridlines', '--tabc': 'tab stripe' };
    function renderColour() {
        const inv = inventory();
        const s = S();
        const keys = new Set([...inv.colors.keys(), ...Object.keys(s.colors)]);
        const rows = [...keys].map(k => ({ k, c: inv.colors.get(k) || { ui: 0, map: 0, vars: new Set() } }));
        const named = rows.filter(r => r.c.vars.size).sort((a, b) => a.k < b.k ? -1 : 1);
        const other = rows.filter(r => !r.c.vars.size).sort((a, b) => (b.c.ui + b.c.map) - (a.c.ui + a.c.map));
        const out = [h('div', { class: 'dbx-note' }, 'A colour changed here changes everywhere it is used, in the interface and on the map. Untick ', h('b', null, 'map'), ' or ', h('b', null, 'page'), ' to keep it in one of them only.')];
        const line = r => {
            const entry = s.colors[r.k];
            const to = entry ? (typeof entry === 'string' ? entry : entry.to) : '';
            const ui = !entry || entry.ui !== false, mp = !entry || entry.map !== false;
            const set = (patch) => { const e = Object.assign({ to: to || r.k, ui, map: mp }, patch); if (!e.to || (R.colorKey(e.to) === r.k && e.ui && e.map)) delete s.colors[r.k]; else s.colors[r.k] = e; };
            const [c, t] = colorIn(to, r.k, (v, live) => { set({ to: v }); commit(live); if (!live) render(); });
            const names = [...r.c.vars].map(v => { const n = v.split(' ').pop(); return VAR_NAMES[n] || n; });
            const where = inv.where.get(r.k);
            const cb = (on, lab, key) => h('label', { style: 'display:flex;align-items:center;gap:2px;font-size:9.5px;color:#777;cursor:pointer', title: lab === 'page' ? 'Change it in the interface' : 'Change it on the map' },
                h('input', { type: 'checkbox', checked: on, style: 'margin:0;accent-color:#00f', onchange: e => { set({ [key]: e.target.checked }); commit(); render(); } }), lab);
            return h('div', { class: 'dbx-li' + (entry ? ' set' : ''), title: where ? [...where].join('\n') : '' },
                h('span', { class: 'dbx-sw', style: 'flex:0 0 22px' }, h('i', { style: 'background:' + r.k + ';right:50%' }), h('i', { style: 'background:' + (to || r.k) + ';left:50%' })),
                h('span', { class: 'nm' }, names.length ? names.join(', ') : h('span', { class: 'dbx-mono' }, r.k), h('small', null, (r.c.ui ? r.c.ui + ' page' : '') + (r.c.ui && r.c.map ? ' · ' : '') + (r.c.map ? r.c.map + ' map' : ''))),
                c, t, entry ? cb(ui, 'page', 'ui') : null, entry && !PAGE ? cb(mp, 'map', 'map') : null, x(entry, () => { delete s.colors[r.k]; commit(); render(); }));
        };
        if (named.length) { out.push(h('div', { class: 'dbx-h' }, 'NAMED COLOURS')); named.forEach(r => out.push(line(r))); }
        out.push(h('div', { class: 'dbx-h' }, 'EVERY OTHER COLOUR'));
        other.forEach(r => out.push(line(r)));
        out.push(h('div', { class: 'dbx-note' }, 'The map’s site symbols take a new colour when the page is reloaded.'),
            h('button', { class: 'dbx-btn', onclick: () => location.reload() }, 'reload now'));
        return out;
    }

    // ═════════════════════════════════════════════════════════════════════
    // LINES
    // ═════════════════════════════════════════════════════════════════════
    function renderLines() {
        const inv = inventory();
        const s = S();
        const out = [h('div', { class: 'dbx-h' }, 'INTERFACE LINES')];
        const hl = s.vars['--hl'];
        out.push(h('div', { class: 'dbx-li' + (hl ? ' set' : '') }, h('span', { class: 'nm' }, 'hairline', h('small', null, 'one screen pixel, set by the page')),
            numIn(hl || '', r1(num(getComputedStyle(document.documentElement).getPropertyValue('--hl'))), v => { if (v) s.vars['--hl'] = px(v); else delete s.vars['--hl']; commit(); render(); }, { step: 0.25, unit: 'px' }),
            x(hl, () => { delete s.vars['--hl']; commit(); render(); })));
        [...inv.widths.entries()].sort((a, b) => num(a[0]) - num(b[0])).forEach(([k, n]) => {
            const to = s.widths[k];
            out.push(h('div', { class: 'dbx-li' + (to ? ' set' : '') },
                h('span', { style: 'flex:0 0 26px;height:0;border-top:' + Math.max(0.5, num(to || k)) + 'px solid #000' }),
                h('span', { class: 'nm' }, k, h('small', null, n + '×')),
                h('span', { class: 'ct' }, '→'), numIn(to || '', k, v => { if (v) s.widths[k] = /^[\d.]+$/.test(v) && /px$/.test(k) ? v + 'px' : v; else delete s.widths[k]; commit(); render(); }, { step: 0.25, unit: /px$/.test(k) ? 'px' : '' }),
                x(to, () => { delete s.widths[k]; commit(); render(); })));
        });
        out.push(h('div', { class: 'dbx-note' }, 'Every border, rule and outline of the interface that has this weight. 0.5 px is the half-pixel the page uses on most frames.'));
        if (!PAGE) {
            out.push(h('div', { class: 'dbx-h' }, 'MAP LINES'));
            const lw = +s.map.lineWidth || 1;
            const rng = h('input', { type: 'range', class: 'dbx-r', min: 0.2, max: 4, step: 0.05, value: lw });
            const n = numIn(lw === 1 ? '' : lw, '1', v => { s.map.lineWidth = num(v) || 1; rng.value = s.map.lineWidth; commit(); }, { step: 0.05, w4: true });
            rng.addEventListener('input', () => { s.map.lineWidth = +rng.value; n.value = rng.value; n.classList.add('set'); commit(true); });
            out.push(h('div', { class: 'dbx-li' + (lw !== 1 ? ' set' : '') }, h('span', { class: 'nm', style: 'flex:0 0 70px' }, 'all lines ×'), rng, n, x(lw !== 1, () => { s.map.lineWidth = 1; commit(); render(); })));
            out.push(...mapLayerRows(l => l.type === 'line'));
        }
        return out;
    }

    // ═════════════════════════════════════════════════════════════════════
    // MAP
    // ═════════════════════════════════════════════════════════════════════
    const LAYER_NAMES = {
        satellite: 'Aerial photo (Esri)', graytone: 'Grey map (Kartverket)', 'relief-ground': 'Relief · grey ground', 'relief-shade': 'Relief · shading, 10 m',
        relief: 'Relief · Kartverket shading, 1 m', bym: 'Oslo aerial survey', historical: 'Historical imagery', hillshade: 'Terrain shading (light tool)',
        'dem-far': 'Elevation, far', dod: 'Terrain change · colour', dodfar: 'Terrain change · far view', 'dodfp-fill': 'Studied areas · fill',
        'dodfp-line': 'Studied areas · white dashes', 'dodsel-line': 'Chosen cluster · outline', 'dod-iso': 'Change contours, 1 m', 'dod-edge': 'Edge of each change',
        'dodsel-edge': 'Chosen cluster · edge', 'dod-in-new': 'Terrain contours in the changes · newer', 'dod-in-old': 'Terrain contours in the changes · older',
        'dod-contours': 'Terrain contours · newer', 'dod-contours-old': 'Terrain contours · older', 'dod-contours-far': 'Terrain contours · far',
        'fp-fill': 'Site · fill', 'fp-line': 'Site line, status colour', 'fp-soft': 'Site · dashed, to come', 'fp-exp': 'Planned expansion', 'fp-paper': 'Permitted / licensed outline',
        'site-hot': 'Site · hover ring', 'site-sym': 'Site symbols', 'cov-old-line': 'Plan, old', 'cov-current-line': 'Plan, in force', 'cov-future-line': 'Plan, proposed',
        'flow-modelled': 'Flows · modelled', 'flow-structural': 'Flows · shared ownership', 'flow-evidenced': 'Flows · documented',
        'flow-modelled-cas': 'Flows · modelled, casing', 'flow-structural-cas': 'Flows · shared ownership, casing', 'flow-evidenced-cas': 'Flows · documented, casing',
        'flow-head': 'Flow arrowheads', 'prof-line': 'Cross section · line', 'prof-pt': 'Cross section · points', 'prof-cur': 'Cross section · cursor'
    };
    const groupOf = id => /^(satellite|graytone|relief|bym|historical|hillshade|dem)/.test(id) ? 'BACKGROUND'
        : /^dod.*contour|^dod-in-/.test(id) ? 'CONTOURS' : /^dod/.test(id) ? 'TERRAIN CHANGE' : /^(fp-|site-)/.test(id) ? 'SITES'
        : /^flow/.test(id) ? 'FLOWS' : /^cov-/.test(id) ? 'PLAN COVERAGE' : /^prof-/.test(id) ? 'TOOLS' : 'OTHER';
    const layerName = id => LAYER_NAMES[id] || (/^dodold-/.test(id) ? 'Terrain change · older survey · ' + id.slice(7) : /^dod-hit/.test(id) ? 'Terrain change · click areas' + (id.length > 7 ? ' · ' + id.slice(8) : '') : /^dod-/.test(id) ? 'Terrain change · ' + id.slice(4) : id);
    const openLayers = new Set();
    function mapLayers() {
        const m = R.map;
        if (!m) return [];
        let ls = [];
        try { ls = m.getStyle().layers; } catch (e) {}
        return ls.map(l => ({ id: l.id, type: l.type }));
    }
    function mapLayerRows(filter) {
        const s = S();
        const ls = mapLayers().filter(filter || (() => true));
        if (!ls.length) return [h('div', { class: 'dbx-note' }, 'The map has not drawn its layers yet.')];
        const out = [];
        let g = null;
        // Top of the map first.
        ls.slice().reverse().sort((a, b) => ['SITES', 'FLOWS', 'TERRAIN CHANGE', 'CONTOURS', 'PLAN COVERAGE', 'TOOLS', 'BACKGROUND', 'OTHER'].indexOf(groupOf(a.id)) - ['SITES', 'FLOWS', 'TERRAIN CHANGE', 'CONTOURS', 'PLAN COVERAGE', 'TOOLS', 'BACKGROUND', 'OTHER'].indexOf(groupOf(b.id))).forEach(l => {
            const gg = groupOf(l.id);
            if (gg !== g) { g = gg; out.push(h('div', { class: 'dbx-grp' }, gg)); }
            const L = s.map.layers[l.id] || {};
            const set = Object.keys(L).length > 0;
            const upd = (patch, live) => {
                const cur = Object.assign({}, s.map.layers[l.id] || {}, patch);
                Object.keys(cur).forEach(k => { const v = cur[k]; if (v === undefined || v === null || v === '' || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) || ((k === 'width' || k === 'opacity' || k === 'size') && +v === 1)) delete cur[k]; });
                if (Object.keys(cur).length) s.map.layers[l.id] = cur; else delete s.map.layers[l.id];
                commit(live);
            };
            const det = h('details', { class: 'dbx-det', open: openLayers.has(l.id) });
            det.addEventListener('toggle', () => { if (det.open) openLayers.add(l.id); else openLayers.delete(l.id); });
            const eye = h('input', { type: 'checkbox', checked: !L.hide, title: 'Shown on the map (untick to hide it always)', style: 'margin:0;accent-color:#00f',
                onclick: e => e.stopPropagation(), onchange: e => { upd({ hide: e.target.checked ? undefined : true }); render(); } });
            det.appendChild(h('summary', null, h('i', { class: 'tri' }), eye, h('span', { class: 'nm', style: 'flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' + (set ? ';color:#00f' : '') }, layerName(l.id)),
                h('span', { class: 'ct', style: 'color:#aaa;font-size:9.5px' }, l.type)));
            const inner = h('div', { class: 'in' });
            const slider = (label, key, min, max, step) => {
                const v = L[key] === undefined ? 1 : +L[key];
                const rng = h('input', { type: 'range', class: 'dbx-r', min, max, step, value: v });
                const n = numIn(v === 1 ? '' : v, '1', val => { upd({ [key]: val === '' ? undefined : num(val) }); render(); }, { w4: true, step });
                rng.addEventListener('input', () => { n.value = rng.value; n.classList.add('set'); upd({ [key]: +rng.value }, true); });
                return h('div', { class: 'dbx-row' }, h('span', { class: 'lb' }, label), rng, n);
            };
            const paintNum = (label, prop, min, max, step, def) => {
                const P = L.paint || {};
                const v = P[prop] === undefined ? '' : P[prop];
                const cur = (R.layers[l.id] && R.layers[l.id].paint[prop]);
                const base = typeof cur === 'number' ? cur : def;
                const rng = h('input', { type: 'range', class: 'dbx-r', min, max, step, value: v === '' ? base : v });
                const setP = (val, live) => { const p = Object.assign({}, L.paint || {}); if (val === '' || val === undefined) delete p[prop]; else p[prop] = +val; L.paint = p; upd({ paint: p }, live); };
                const n = numIn(v, base, val => { setP(val === '' ? '' : num(val)); render(); }, { w4: true, step });
                rng.addEventListener('input', () => { n.value = rng.value; n.classList.add('set'); setP(rng.value, true); });
                return h('div', { class: 'dbx-row' }, h('span', { class: 'lb' }, label), rng, n);
            };
            const paintCol = (label, prop) => {
                const P = L.paint || {};
                const cur = R.layers[l.id] && R.layers[l.id].paint[prop];
                const [c, t] = colorIn(P[prop] || '', typeof cur === 'string' ? cur : '', (v, live) => { const p = Object.assign({}, L.paint || {}); if (v) p[prop] = v; else delete p[prop]; L.paint = p; upd({ paint: p }, live); if (!live) render(); });
                return h('div', { class: 'dbx-row' }, h('span', { class: 'lb' }, label), c, t);
            };
            if (l.type === 'line') {
                inner.append(slider('width ×', 'width', 0.1, 5, 0.05), slider('opacity ×', 'opacity', 0, 1, 0.05));
                const DASH = [['', 'as drawn'], ['1 0', 'solid'], ['1 1', 'dots, close'], ['0.5 1.5', 'dots'], ['2 2', 'short dashes'], ['3 2', 'dashes'], ['5 3', 'long dashes'], ['custom', 'other…']];
                const curD = L.dash ? L.dash.join(' ') : '';
                const known = DASH.some(d => d[0] === curD);
                const dSel = h('select', { class: 'dbx-s' + (L.dash ? ' set' : '') }, DASH.map(([v, t]) => h('option', { value: v, selected: known ? v === curD : v === 'custom' }, t)));
                const dIn = h('input', { class: 'dbx-t dbx-mono', value: curD, placeholder: 'dash gap', style: 'flex:0 0 64px', title: 'Dash and gap lengths, in line widths, e.g. 3 2' });
                const setD = v => { const a = v.trim() ? v.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n)) : null; upd({ dash: a && a.length ? a : undefined }); render(); };
                dSel.addEventListener('change', () => { if (dSel.value !== 'custom') setD(dSel.value); else dIn.focus(); });
                dIn.addEventListener('change', () => setD(dIn.value));
                inner.append(h('div', { class: 'dbx-row' }, h('span', { class: 'lb' }, 'dashes'), dSel, dIn));
                const cap = h('select', { class: 'dbx-s' }, h('option', { value: '' }, 'line ends: as drawn'), ['butt', 'round', 'square'].map(v => h('option', { value: v, selected: (L.layout || {})['line-cap'] === v }, 'ends: ' + v)));
                cap.addEventListener('change', () => { const lay = Object.assign({}, L.layout || {}); if (cap.value) lay['line-cap'] = cap.value; else delete lay['line-cap']; upd({ layout: lay }); });
                inner.append(h('div', { class: 'dbx-row' }, h('span', { class: 'lb' }, ''), cap));
            } else if (l.type === 'fill') {
                inner.append(slider('opacity ×', 'opacity', 0, 1, 0.05));
            } else if (l.type === 'circle') {
                inner.append(slider('size ×', 'width', 0.1, 4, 0.05), slider('opacity ×', 'opacity', 0, 1, 0.05));
            } else if (l.type === 'symbol') {
                inner.append(slider('size ×', 'size', 0.2, 3, 0.05), slider('opacity ×', 'opacity', 0, 1, 0.05));
            } else if (l.type === 'raster') {
                inner.append(slider('opacity ×', 'opacity', 0, 1, 0.05), paintNum('saturation', 'raster-saturation', -1, 1, 0.05, 0), paintNum('contrast', 'raster-contrast', -1, 1, 0.05, 0),
                    paintNum('darkest', 'raster-brightness-min', 0, 1, 0.05, 0), paintNum('lightest', 'raster-brightness-max', 0, 1, 0.05, 1), paintNum('hue turn', 'raster-hue-rotate', 0, 359, 1, 0));
            } else if (l.type === 'hillshade') {
                inner.append(paintNum('strength', 'hillshade-exaggeration', 0, 1, 0.05, 0.5), paintCol('shadow', 'hillshade-shadow-color'), paintCol('light', 'hillshade-highlight-color'), paintCol('accent', 'hillshade-accent-color'));
            } else if (l.type === 'background') {
                inner.append(paintCol('colour', 'background-color'));
            }
            // The colours this layer draws with, each changeable for this layer alone.
            const found = new Set();
            const walk = e => { if (typeof e === 'string') { const k = R.colorKey(e); if (k) found.add(k); } else if (Array.isArray(e)) e.forEach(walk); };
            const reg = R.layers[l.id];
            if (reg) Object.keys(reg.paint).forEach(p => { if (/-color$/.test(p)) walk(reg.paint[p]); });
            if (reg && Object.keys(reg.paint).some(p => /-color$/.test(p) && JSON.stringify(reg.paint[p]).indexOf('"get"') >= 0)) {
                ['--r-old', '--r-active', '--r-future', '--r-cont', '--c-done', '--c-active', '--c-planned'].forEach(v => { const k = R.colorKey(getComputedStyle(document.documentElement).getPropertyValue(v)); if (k) found.add(k); });
            }
            if (found.size && !/raster|hillshade|background/.test(l.type)) {
                inner.append(h('div', { class: 'dbx-note', style: 'margin:6px 0 2px' }, 'colours in this layer only'));
                found.forEach(k => {
                    const loc = L.colors || {};
                    const [c, t] = colorIn(loc[k] || '', k, (v, live) => { const cl = Object.assign({}, L.colors || {}); if (v && R.colorKey(v) !== k) cl[k] = v; else delete cl[k]; L.colors = cl; upd({ colors: cl }, live); if (!live) render(); });
                    inner.append(h('div', { class: 'dbx-row' }, h('span', { class: 'dbx-sw', style: 'flex:0 0 22px' }, h('i', { style: 'background:' + k + ';right:50%' }), h('i', { style: 'background:' + (loc[k] || k) + ';left:50%' })),
                        h('span', { class: 'dbx-mono', style: 'flex:0 0 74px' }, k), c, t, x(loc[k], () => { const cl = Object.assign({}, L.colors || {}); delete cl[k]; upd({ colors: cl }); render(); })));
                });
            }
            inner.append(h('div', { class: 'dbx-row', style: 'margin-top:4px' }, h('span', { class: 'dbx-mono', style: 'color:#aaa;flex:1' }, l.id),
                set ? h('button', { class: 'dbx-btn', onclick: () => { delete s.map.layers[l.id]; commit(); render(); } }, 'reset layer') : null));
            det.appendChild(inner);
            out.push(det);
        });
        return out;
    }
    function renderMap() {
        return [h('div', { class: 'dbx-row' }, h('div', { class: 'dbx-note', style: 'flex:1' }, 'Every layer the map has drawn so far, top first. Layers that load later (contours, flows, a run) appear once they are on: switch them on, then ', h('b', null, 'refresh'), '.'),
            h('button', { class: 'dbx-btn', onclick: () => render() }, 'refresh')),
            ...mapLayerRows()];
    }

    // ═════════════════════════════════════════════════════════════════════
    // FILE
    // ═════════════════════════════════════════════════════════════════════
    let confirmReset = false;
    function download(name, text, type) {
        const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'application/json' })), download: name });
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    const today = () => new Date().toISOString().slice(0, 10);
    function renderFile() {
        const s = S();
        const n = (o) => Object.keys(o).length;
        const rulesBy = m => s.rules.filter(r => (r.media || 'all') === m).length;
        const sum = [['Colours', n(s.colors)], ['Typefaces', n(s.fonts) + s.fontFiles.length + s.googleFonts.length], ['Type sizes', n(s.sizes)], ['Weights', n(s.weights)],
            ['Line weights', n(s.widths) + (s.vars['--hl'] ? 1 : 0)], ['Parts, desktop', rulesBy('desktop')], ['Parts, phone', rulesBy('phone')], ['Parts, both', rulesBy('all')]];
        if (!PAGE) sum.push(['Map layers', n(s.map.layers) + ((+s.map.lineWidth || 1) !== 1 ? 1 : 0)]);
        const out = [h('div', { class: 'dbx-h' }, 'YOUR CHANGES')];
        sum.forEach(([k, v]) => out.push(h('div', { class: 'dbx-li' + (v ? ' set' : '') }, h('span', { class: 'nm' }, k), h('span', { class: 'ct', style: 'color:' + (v ? '#00f' : '#aaa') }, String(v)))));
        const file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
        file.addEventListener('change', () => {
            const f = file.files[0]; if (!f) return;
            f.text().then(t => { try { R.state = JSON.parse(t); commit(); render(); } catch (e) { msg.textContent = 'That file is not a style file.'; } });
        });
        const msg = h('div', { class: 'dbx-note' });
        const json = () => JSON.stringify(s, null, 1);
        out.push(h('div', { class: 'dbx-h' }, 'SAVE'),
            h('div', { class: 'dbx-row', style: 'gap:4px;flex-wrap:wrap' },
                h('button', { class: 'dbx-btn big on', onclick: () => download(PAGE ? 'dirtybusiness-cargo-style-' + today() + '.json' : 'dirtybusiness-style-' + today() + '.json', json()) }, 'download the style file'),
                h('button', { class: 'dbx-btn big', onclick: () => { navigator.clipboard.writeText(json()).then(() => { msg.textContent = 'Copied.'; }); } }, 'copy'),
                h('button', { class: 'dbx-btn big', onclick: () => file.click() }, 'open a style file…'), file),
            msg,
            h('div', { class: 'dbx-note' }, 'The file is everything you changed. Nobody else sees it until it is put into the site.'));
        if (PAGE) {
            const ta = h('textarea', { class: 'dbx-ta', readonly: true }, R.buildCss(true) || '/* nothing changed yet */');
            out.push(h('div', { class: 'dbx-h' }, 'CSS FOR CARGO'), h('div', { class: 'dbx-note' }, 'Paste this into Cargo’s Custom CSS to make it stay.'), ta,
                h('button', { class: 'dbx-btn', onclick: () => { ta.select(); navigator.clipboard.writeText(ta.value); } }, 'copy CSS'));
        } else {
            const src = BASE + 'style-editor.js';
            const bm = "javascript:(function(){if(window.__dbEditor)return;var s=document.createElement('script');s.src='" + src.replace(/^http:\/\/(localhost|127\.0\.0\.1)[^/]*\//, 'https://boundarieslab.github.io/db_mp/') + "?'+Date.now();document.body.appendChild(s);})();";
            out.push(h('div', { class: 'dbx-h' }, 'THE CARGO HEADER AND TABS'),
                h('div', { class: 'dbx-note' }, 'The header, the logo and the About / Map / Sites tabs belong to Cargo, outside the map. To arrange them, drag this button to your bookmarks bar, open dirtybusiness.no and click it there:'),
                h('div', { class: 'dbx-row' }, h('a', { href: bm, class: 'dbx-btn', style: 'text-decoration:none;display:inline-flex;align-items:center;color:#000', onclick: e => e.preventDefault() }, 'DB style')));
        }
        out.push(h('div', { class: 'dbx-h' }, 'START OVER'),
            h('div', { class: 'dbx-row' }, h('button', { class: 'dbx-btn' + (confirmReset ? ' on' : ''), onclick: () => {
                if (!confirmReset) { confirmReset = true; render(); setTimeout(() => { confirmReset = false; if (tab === 'FILE') render(); }, 4000); return; }
                confirmReset = false; R.state = JSON.parse(JSON.stringify(R.BAKED)); commit(); render(); } }, confirmReset ? 'click again to clear everything' : 'back to the site as it is'),
                h('span', { class: 'dbx-note', style: 'margin:0 0 0 6px' }, 'Undo brings it back.')));
        return out;
    }

    // ── render ──────────────────────────────────────────────────────────
    function render() {
        const y = body.scrollTop;
        body.textContent = '';
        const f = { ARRANGE: renderArrange, TYPE: renderType, COLOUR: renderColour, LINES: renderLines, MAP: renderMap, FILE: renderFile }[tab];
        try { [].concat(f()).forEach(n => n && body.appendChild(n)); }
        catch (e) { console.error(e); body.appendChild(h('div', { class: 'dbx-note' }, 'Something went wrong drawing this tab: ' + e.message)); }
        body.scrollTop = y;
        badge();
    }
    let lastPhone = isPhone();
    window.addEventListener('resize', () => { if (isPhone() !== lastPhone) { lastPhone = isPhone(); render(); } else badge(); });
    render();
    // The map's layers arrive after the editor: draw the tab again when they have.
    if (!PAGE) { let tries = 0; const t = setInterval(() => { if (R.map || ++tries > 50) { clearInterval(t); setTimeout(() => { if (tab === 'MAP' || tab === 'LINES' || tab === 'COLOUR') render(); }, 1500); } }, 200); }
    window.__dbEditorApi = { select, setArrange, render, get selSel() { return selSel; } };
    }
})();
