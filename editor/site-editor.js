/* ==========================================================================
   dirtybusiness.no — the site editor.

   Opens with ?edit in the address. Click anything on the page and change it
   where it is: place, size, type, colour, lines, any CSS, its words. Add
   text, images, boxes and links, copy parts, hide them. Every map layer can
   be changed while the map is drawn, reordered, and set by zoom.

   Everything is kept in this browser as a draft and shown at once. SAVE TO
   SITE writes it to editor/site-style.js in the site's repository; the site
   shows it a minute or two later.
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
    const r2 = n => Math.round(n * 100) / 100;
    const isPhone = () => window.innerWidth <= 760;
    const esc = s => (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&');
    const uid = p => (p || 'dbu-') + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    const clone = o => JSON.parse(JSON.stringify(o));
    const LS = {
        get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
    };

    // ── history and saving ──────────────────────────────────────────────
    let hist = [JSON.stringify(S())], hi = 0, lastCommit = 0;
    function commit(merge) {
        R.apply();
        R.saveDraft();
        const snap = JSON.stringify(S());
        const now = Date.now();
        if (merge && now - lastCommit < 700 && hi === hist.length - 1 && hi > 0) hist[hi] = snap;
        else if (snap !== hist[hi]) { hist = hist.slice(0, hi + 1); hist.push(snap); if (hist.length > 400) hist.shift(); hi = hist.length - 1; }
        lastCommit = now;
        badge();
    }
    function go(d) {
        const n = hi + d;
        if (n < 0 || n >= hist.length) return;
        hi = n;
        R.state = JSON.parse(hist[hi]);
        R.saveDraft();
        if (selEl && !selEl.isConnected) selEl = null;
        render();
    }

    // ── looks of the editor ─────────────────────────────────────────────
    const F = 'Plex,"IBM Plex Sans",Helvetica,Arial,sans-serif', M = 'PlexMono,ui-monospace,Menlo,monospace';
    const css = `
[data-dbx-ui]{font:11px/1.4 ${F};color:#000;-webkit-font-smoothing:antialiased;text-align:left;letter-spacing:normal;text-transform:none}
[data-dbx-ui] *{box-sizing:border-box;border-radius:0;letter-spacing:normal;text-transform:none;font-style:normal}
[data-dbx-ui] button,[data-dbx-ui] input,[data-dbx-ui] select,[data-dbx-ui] textarea{font:inherit;color:#000;margin:0}
#dbx-bar{position:fixed;z-index:2147483001;top:8px;left:0;right:0;margin:0 auto;width:max-content;display:flex;flex-wrap:wrap;align-items:center;gap:2px;
  background:#fff;border:1px solid #000;padding:2px 3px;max-width:calc(100vw - 16px);user-select:none}
#dbx-bar.moved{margin:0}
#dbx-bar .grip{width:12px;height:22px;cursor:move;background:radial-gradient(#000 1px,transparent 1.2px) 0 0/4px 4px;opacity:.5;margin-right:2px}
#dbx-bar .sep{width:1px;height:18px;background:#ccc;margin:0 3px}
#dbx-bar .st{color:#777;font-size:10px;padding:0 4px;white-space:nowrap}
#dbx-bar .st.dirty{color:#00f}
.dbx-tb{height:22px;border:1px solid transparent;background:#fff;padding:0 7px;cursor:pointer;font-size:10px!important;font-weight:500!important;letter-spacing:.06em!important;white-space:nowrap}
.dbx-tb:hover{border-color:#000}
.dbx-tb.on{background:#00f;color:#fff!important;border-color:#00f}
.dbx-tb:disabled{opacity:.3;cursor:default;border-color:transparent}
.dbx-tb.pub{border-color:#000}
.dbx-tb.pub.dirty{background:#000;color:#fff!important}
.dbx-tb kbd{font:9px ${M};color:inherit;opacity:.55;margin-left:4px}
.dbx-menu{position:fixed;z-index:2147483003;background:#fff;border:1px solid #000;min-width:180px;padding:3px 0}
.dbx-menu button{display:block;width:100%;text-align:left;height:24px;border:0;background:#fff;padding:0 10px;cursor:pointer}
.dbx-menu button:hover{background:#00f;color:#fff!important}
.dbx-menu .lab{color:#888;font-size:9.5px;letter-spacing:.08em;padding:4px 10px 2px}
#dbx-insp,#dbx-dock{position:fixed;z-index:2147483000;background:#fff;border:1px solid #000;display:flex;flex-direction:column}
#dbx-insp{width:300px;max-height:calc(100vh - 56px)}
#dbx-dock{top:44px;right:8px;width:340px;bottom:8px}
#dbx-dock.left{right:auto;left:8px}
.dbx-head{height:24px;flex:0 0 24px;display:flex;align-items:center;gap:2px;padding:0 3px 0 8px;border-bottom:1px solid #000;cursor:move;user-select:none}
.dbx-head b{font-weight:500;letter-spacing:.06em;font-size:10px;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbx-ib{width:20px;height:20px;flex:0 0 20px;border:0;background:#fff;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1}
.dbx-ib:hover{background:#eee}.dbx-ib.on{background:#00f;color:#fff!important}
.dbx-ib:disabled{opacity:.3;cursor:default}
.dbx-body{overflow:auto;flex:1 1 auto;padding:4px 10px 14px;min-height:40px;overscroll-behavior:contain}
.dbx-tabs{display:flex;flex:0 0 auto;border-bottom:1px solid #000;flex-wrap:wrap}
.dbx-tab{flex:1 1 auto;height:24px;border:0;border-right:1px solid #ddd;background:#f5f5f5;cursor:pointer;font-size:9.5px!important;letter-spacing:.07em!important;font-weight:500!important;padding:0 6px}
.dbx-tab:last-child{border-right:0}
.dbx-tab[aria-selected=true]{background:#fff;box-shadow:inset 0 2px 0 #00f}
.dbx-h{font-size:9.5px;letter-spacing:.09em;font-weight:500;color:#555;margin:12px 0 4px;display:flex;align-items:center;gap:6px}
.dbx-h:first-child{margin-top:4px}
.dbx-sec{border-top:1px solid #e5e5e5;margin:0 -10px;padding:0 10px}
.dbx-sec>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:6px;height:26px;font-size:9.5px;letter-spacing:.09em;font-weight:500;color:#333;user-select:none}
.dbx-sec>summary::-webkit-details-marker{display:none}
.dbx-sec>summary .tri,.dbx-det>summary .tri,.dbx-tree .tri{width:0;height:0;border-left:3px solid transparent;border-right:3px solid transparent;border-top:4.5px solid #000;transform:rotate(-90deg);transition:transform .12s;flex:0 0 auto}
.dbx-sec[open]>summary .tri,.dbx-det[open]>summary .tri,.dbx-tree .tri.open{transform:none}
.dbx-sec>summary .dot{width:5px;height:5px;background:#00f;border-radius:50%!important}
.dbx-sec>.in{padding:0 0 8px}
.dbx-row{display:flex;align-items:center;gap:4px;min-height:24px}
.dbx-row>.lb{flex:0 0 72px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dbx-row>.lb.scrub{cursor:ew-resize}
.dbx-row>.lb.scrub:hover{color:#00f}
.dbx-n{width:52px;height:20px;border:1px solid #aaa;padding:0 4px;background:#fff;font-family:${M}!important;font-size:10.5px!important;flex:0 0 auto}
.dbx-n.set,.dbx-t.set,.dbx-s.set{border-color:#00f;color:#00f!important}
.dbx-n.w4{width:42px}.dbx-n.w3{width:36px}
.dbx-t,.dbx-s{height:20px;border:1px solid #aaa;padding:0 4px;background:#fff;min-width:0;flex:1 1 auto}
.dbx-t.bad{border-color:#e00;color:#e00!important}
.dbx-c{width:22px;height:20px;border:1px solid #aaa;padding:0;background:#fff;flex:0 0 22px;cursor:pointer}
.dbx-r{flex:1 1 auto;min-width:40px;accent-color:#00f;height:16px}
.dbx-btn{height:20px;border:1px solid #000;background:#fff;padding:0 7px;cursor:pointer;white-space:nowrap;flex:0 0 auto}
.dbx-btn:hover{background:#f0f0f0}.dbx-btn.on{background:#00f;color:#fff!important;border-color:#00f}
.dbx-btn.big{height:26px;padding:0 12px}
.dbx-btn.warn{border-color:#c00;color:#c00!important}
.dbx-btn:disabled{opacity:.35;cursor:default}
.dbx-x{border:0;background:none;color:#aaa!important;cursor:pointer;padding:0 3px;font-size:11px;line-height:1;flex:0 0 auto}
.dbx-x:hover{color:#000!important}.dbx-x.hid{visibility:hidden}
.dbx-sw{width:16px;height:16px;border:1px solid #999;flex:0 0 16px;background-image:linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%);background-size:6px 6px;background-position:0 0,3px 3px;position:relative}
.dbx-sw i{position:absolute;inset:0}
.dbx-note{color:#666;font-size:10px;line-height:1.45;margin:4px 0}
.dbx-note b{font-weight:500;color:#000}
.dbx-mode{background:#f3f3ff;border:1px solid #ccf;padding:4px 7px;margin:4px 0 6px;font-size:10px}
.dbx-mono{font-family:${M}!important;font-size:10px!important}
.dbx-li{display:flex;align-items:center;gap:5px;min-height:25px;border-bottom:1px solid #eee}
.dbx-li .nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbx-li .nm small{color:#888;font-size:9.5px;margin-left:4px}
.dbx-li .ct{color:#999;font-size:9.5px;white-space:nowrap}
.dbx-li.set .nm{color:#00f}
.dbx-det{border-bottom:1px solid #eee}
.dbx-det>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:5px;min-height:25px}
.dbx-det>summary::-webkit-details-marker{display:none}
.dbx-det>.in{padding:2px 0 8px 12px}
.dbx-det.drop-above{box-shadow:inset 0 2px 0 #00f}
.dbx-det.drop-below{box-shadow:inset 0 -2px 0 #00f}
.dbx-det.found>summary{background:#fffbd6}
.dbx-grp{font-size:9.5px;letter-spacing:.09em;font-weight:500;color:#555;margin:12px 0 2px;padding-bottom:3px;border-bottom:1px solid #000}
.dbx-seg{display:inline-flex;border:1px solid #aaa;flex:0 0 auto}
.dbx-seg button{height:18px;border:0;border-right:1px solid #ddd;background:#fff;cursor:pointer;padding:0 6px;font-size:10px!important}
.dbx-seg button:last-child{border-right:0}.dbx-seg button.on{background:#00f;color:#fff!important}
.dbx-anchor{display:grid;grid-template-columns:repeat(2,13px);gap:2px}
.dbx-anchor button{width:13px;height:13px;border:1px solid #999;background:#fff;padding:0;cursor:pointer}
.dbx-anchor button.on{background:#00f;border-color:#00f}
.dbx-ta{width:100%;height:120px;border:1px solid #aaa;padding:4px;font-family:${M}!important;font-size:10px!important;resize:vertical;display:block}
.dbx-ta.big{height:calc(100vh - 300px);min-height:200px}
.dbx-ta.txt{font-family:${F}!important;font-size:12px!important;height:56px}
.dbx-sample{font-size:15px;line-height:1.2;flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dbx-tree{font-size:10.5px}
.dbx-tree .nd{display:flex;align-items:center;gap:4px;height:21px;cursor:pointer;white-space:nowrap;border-bottom:1px solid #f3f3f3}
.dbx-tree .nd:hover{background:#f3f3ff}
.dbx-tree .nd.sel{background:#00f;color:#fff!important}.dbx-tree .nd.sel small,.dbx-tree .nd.sel .tw{color:#fff!important}
.dbx-tree .nd.off{color:#aaa!important}
.dbx-tree .nd.ed b{color:#00f}.dbx-tree .nd.sel.ed b{color:#fff}
.dbx-tree .nd b{font-weight:500;overflow:hidden;text-overflow:ellipsis}
.dbx-tree .nd small{color:#999;font-family:${M};font-size:9.5px;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto;min-width:0}
.dbx-tree .tw{width:12px;flex:0 0 12px;display:flex;align-items:center;justify-content:center}
.dbx-tree .eye{border:0;background:none;cursor:pointer;color:#999;font-size:11px;padding:0 4px}
.dbx-tree .eye:hover{color:#000}
.dbx-prog{height:3px;background:#eee;margin:6px 0}.dbx-prog i{display:block;height:100%;background:#00f;width:0;transition:width .3s}
.dbx-ok{color:#080!important}.dbx-err{color:#c00!important}
.dbx-stops{display:grid;grid-template-columns:44px 1fr 16px;gap:3px;align-items:center;margin:3px 0}
#dbx-ov{position:fixed;inset:0;z-index:2147482990;pointer-events:none}
#dbx-ov .hov{position:fixed;outline:1px dashed #00f;pointer-events:none}
#dbx-ov .hovn{position:fixed;background:#fff;color:#00f;border:1px solid #00f;font:10px/13px ${M};padding:0 3px;pointer-events:none;white-space:nowrap}
#dbx-ov .box{position:fixed;outline:1px solid #00f;pointer-events:none;background:rgba(0,0,255,.04)}
#dbx-ov .twin{position:fixed;outline:1px dotted #00f;pointer-events:none}
#dbx-ov .hd{position:fixed;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;background:#fff;border:1px solid #00f;pointer-events:auto;box-sizing:border-box}
#dbx-ov .gx{position:fixed;top:0;bottom:0;width:0;border-left:1px solid #f0f;pointer-events:none}
#dbx-ov .gy{position:fixed;left:0;right:0;height:0;border-top:1px solid #f0f;pointer-events:none}
#dbx-ov .nm{position:fixed;background:#00f;color:#fff;font:10px/14px ${M};padding:0 4px;pointer-events:none;white-space:nowrap}
#dbx-ov .ms{position:fixed;background:#f0f;color:#fff;font:10px/14px ${M};padding:0 4px;pointer-events:none;white-space:nowrap}
#dbx-toast{position:fixed;z-index:2147483004;left:50%;bottom:16px;transform:translateX(-50%);background:#000;color:#fff;padding:6px 12px;font:11px ${F};pointer-events:none;transition:opacity .2s}
#dbx-pill{position:fixed;z-index:2147483000;right:12px;bottom:12px;height:24px;border:1px solid #000;background:#fff;padding:0 10px;cursor:pointer;font:500 10px ${F};letter-spacing:.09em}
html.dbx-sel, html.dbx-sel *{cursor:default!important}
html.dbx-txt, html.dbx-txt *{cursor:text!important}
html.dbx-pickmap #map, html.dbx-pickmap #map *{cursor:crosshair!important}
html.dbx-sel [data-dbx-ui], html.dbx-sel [data-dbx-ui] *, html.dbx-txt [data-dbx-ui], html.dbx-txt [data-dbx-ui] *{cursor:auto!important}
html [data-dbx-ui] .dbx-head, html [data-dbx-ui] .dbx-head *, #dbx-bar .grip{cursor:move!important}
html [data-dbx-ui] .lb.scrub{cursor:ew-resize!important}
html [data-dbx-ui] button, html [data-dbx-ui] summary, html [data-dbx-ui] .nd{cursor:pointer!important}
[data-dbx-editing]{outline:1px solid #f0f!important;outline-offset:2px;cursor:text!important;-webkit-user-select:text!important;user-select:text!important}
.dbu-text{white-space:pre-wrap}
@media (max-width:760px){#dbx-insp{width:min(300px,calc(100vw - 16px))}#dbx-dock{width:min(340px,calc(100vw - 16px));top:auto;height:50vh}}
`;
    document.head.appendChild(h('style', { id: 'dbx-css' }, css));
    const ui = (tag, a, ...k) => { const el = h(tag, a, ...k); el.setAttribute('data-dbx-ui', ''); return el; };
    const ov = ui('div', { id: 'dbx-ov' });
    document.body.appendChild(ov);
    let toastT = 0;
    const toastEl = ui('div', { id: 'dbx-toast', style: 'opacity:0' });
    document.body.appendChild(toastEl);
    function toast(t, ms) { toastEl.textContent = t; toastEl.style.opacity = '1'; clearTimeout(toastT); toastT = setTimeout(() => { toastEl.style.opacity = '0'; }, ms || 2200); }

    // ── shared controls ─────────────────────────────────────────────────
    // A number box: arrows step it (Shift ×10), typing shows it at once.
    function numIn(val, placeholder, onchange, opts) {
        opts = opts || {};
        const i = h('input', { class: 'dbx-n' + (opts.w4 ? ' w4' : '') + (opts.w3 ? ' w3' : '') + (val !== '' && val !== undefined && val !== null ? ' set' : ''), type: 'text',
            value: val === undefined || val === null ? '' : String(val), placeholder: placeholder === undefined || placeholder === null ? '' : String(placeholder), title: opts.title || '', spellcheck: false });
        if (opts.k) i.dataset.k = opts.k;
        i._step = opts.step || 1; i._unit = opts.unit || ''; i._min = opts.min; i._max = opts.max;
        i._fire = (v, live) => onchange(v, live);
        i.addEventListener('change', () => onchange(i.value.trim()));
        i.addEventListener('input', () => { const v = i.value.trim(); if (v === '' || /^-?[\d.]+[a-z%]*$/i.test(v)) { i.classList.toggle('set', v !== ''); onchange(v, true); } });
        i.addEventListener('keydown', e => {
            if (e.key === 'Enter') { i.blur(); return; }
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            stepNum(i, (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
        });
        return i;
    }
    function stepNum(i, by) {
        const cur = i.value !== '' ? i.value : i.placeholder;
        const m = /^(-?[\d.]+)(.*)$/.exec(cur);
        const base = m ? +m[1] : 0, unit = m ? (m[2] || i._unit) : i._unit;
        const dec = (String(i._step).split('.')[1] || '').length;
        let n = +(base + by * i._step).toFixed(dec);
        if (i._min !== undefined && i._min !== null) n = Math.max(i._min, n);
        if (i._max !== undefined && i._max !== null) n = Math.min(i._max, n);
        i.value = n + unit;
        i.classList.add('set');
        i._fire(i.value, true);
    }
    // Dragging a label sideways changes the first number in its row.
    function scrub(lb, inp) {
        lb.classList.add('scrub');
        lb.title = (lb.title ? lb.title + ' · ' : '') + 'drag sideways to change';
        lb.addEventListener('pointerdown', e => {
            e.preventDefault();
            let last = e.clientX, acc = 0;
            lb.setPointerCapture(e.pointerId);
            const mv = ev => { acc += ev.clientX - last; last = ev.clientX; const k = ev.shiftKey ? 10 : 1; while (Math.abs(acc) >= 3) { stepNum(inp, Math.sign(acc) * k); acc -= Math.sign(acc) * 3; } };
            const up = () => { lb.removeEventListener('pointermove', mv); lb.removeEventListener('pointerup', up); inp._fire(inp.value); };
            lb.addEventListener('pointermove', mv); lb.addEventListener('pointerup', up);
        });
    }
    function row(label, ...c) {
        const lb = h('span', { class: 'lb', title: typeof label === 'string' ? label : '' }, label);
        const r = h('div', { class: 'dbx-row' }, lb, ...c);
        const first = c.flat().find(x => x && x.classList && x.classList.contains('dbx-n'));
        if (first && label) scrub(lb, first);
        return r;
    }
    function colorIn(val, fallback, onchange) {
        const k = R.colorKey(val || fallback || '#000000') || '#000000';
        const c = h('input', { type: 'color', class: 'dbx-c', value: k.slice(0, 7) });
        const t = h('input', { type: 'text', class: 'dbx-t dbx-mono' + (val ? ' set' : ''), value: val || '', placeholder: fallback || '', style: 'flex:0 0 80px', spellcheck: false });
        c.addEventListener('input', () => { const a = (R.colorKey(t.value || fallback || '') || '').slice(7); t.value = c.value + a; t.classList.add('set'); onchange(t.value, true); });
        t.addEventListener('input', () => { const kk = R.colorKey(t.value.trim()); if (kk) { c.value = kk.slice(0, 7); onchange(t.value.trim(), true); } });
        t.addEventListener('change', () => { const v = t.value.trim(); const kk = R.colorKey(v); if (kk) c.value = kk.slice(0, 7); onchange(v); });
        c.addEventListener('change', () => onchange(t.value.trim()));
        return [c, t];
    }
    function sel(options, cur, placeholder, onchange, style) {
        const s = h('select', { class: 'dbx-s' + (cur !== '' && cur !== undefined && cur !== null ? ' set' : ''), style: style || '' },
            h('option', { value: '' }, placeholder), options.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(cur) === String(v) }, t); }));
        s.addEventListener('change', () => onchange(s.value));
        return s;
    }
    function seg(options, cur, onchange) {
        return h('span', { class: 'dbx-seg' }, options.map(o => { const [v, t, ti] = Array.isArray(o) ? o : [o, o]; return h('button', { class: cur === v ? 'on' : '', title: ti || '', onclick: () => onchange(cur === v ? '' : v) }, t); }));
    }
    function swatch(col) { return h('span', { class: 'dbx-sw' }, h('i', { style: 'background:' + col })); }
    const x = (show, fn, title) => h('button', { class: 'dbx-x' + (show ? '' : ' hid'), title: title || 'Back to how it was', onclick: fn }, '✕');
    // A section that folds, and remembers whether it was open.
    const OPEN = new Set(LS.get('dbx-open', ['TEXT', 'PLACE AND SIZE', 'TYPE', 'FILL AND BORDER']));
    function section(name, dot, ...rows) {
        const d = h('details', { class: 'dbx-sec', open: OPEN.has(name) },
            h('summary', null, h('i', { class: 'tri' }), name, dot ? h('i', { class: 'dot', title: 'changed' }) : null),
            h('div', { class: 'in' }, ...rows));
        d.addEventListener('toggle', () => { if (d.open) OPEN.add(name); else OPEN.delete(name); LS.set('dbx-open', [...OPEN]); });
        return d;
    }
    function download(name, text, type) {
        const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'application/json' })), download: name });
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    const today = () => new Date().toISOString().slice(0, 10);
    // A window of the editor moves by its head and remembers where it was.
    function movable(win, head, key, onMoved) {
        const p = LS.get(key, null);
        if (p) { win.style.left = Math.min(p.l, innerWidth - 80) + 'px'; win.style.top = Math.min(p.t, innerHeight - 30) + 'px'; win.style.right = 'auto'; win.style.bottom = 'auto'; win.classList.add('moved'); }
        head.addEventListener('pointerdown', e => {
            if (e.target.closest('button,input,select')) return;
            const r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
            head.setPointerCapture(e.pointerId);
            const mv = ev => {
                const l = Math.max(0, Math.min(innerWidth - 60, ev.clientX - dx)), t = Math.max(0, Math.min(innerHeight - 24, ev.clientY - dy));
                win.style.left = l + 'px'; win.style.top = t + 'px'; win.style.right = 'auto'; win.style.bottom = 'auto'; win.classList.add('moved');
            };
            const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up);
                const b = win.getBoundingClientRect(); LS.set(key, { l: b.left, t: b.top }); if (onMoved) onMoved(); };
            head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
        });
    }
    // Keys typed in the editor stay in the editor.
    const keepKeys = el => el.addEventListener('keydown', e => { if (e.target.matches('input,select,textarea')) e.stopPropagation(); });

    // ═════════════════════════════════════════════════════════════════════
    // PICKING PARTS OF THE PAGE
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
    const STATE_CLS = /^(open|on|active|sel|hot|pick|folded|closed|tight|show|cur|drag-handle|half|full|maplibregl-compact-show|dbx-.*|dbu|dbu-.*)$/;
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
    const addedOf = el => el && el.id ? (S().added || []).find(a => a.id === el.id) : null;
    const dupOf = el => el && el.id ? (S().dups || []).find(d => d.id === el.id) : null;
    const KIND = { text: 'Text', image: 'Image', box: 'Box', link: 'Link' };
    function partName(el, sel) {
        if (!el) return '';
        const a = addedOf(el);
        if (a) return KIND[a.kind] + (a.text ? ' · ' + a.text.slice(0, 24) : '') + ' (added)';
        if (dupOf(el)) return 'Copy of ' + partName(document.querySelector(dupOf(el).of) || el.parentElement, '');
        for (const [s, n] of PARTS) if (s === sel) return n;
        for (const [s, n] of PARTS) { try { if (document.querySelector(s) === el) return n; } catch (e) {} }
        const c = [...el.classList].filter(c => !STATE_CLS.test(c))[0];
        const t = R.ownText(el);
        return (el.id ? '#' + el.id : el.tagName.toLowerCase() + (c ? '.' + c : '')) + (t ? ' “' + t.slice(0, 18) + (t.length > 18 ? '…' : '') + '”' : '');
    }
    let selMode = false, textMode = false, pickMap = false, closed = false;
    let grid = LS.get('dbx-grid', 1), snap = LS.get('dbx-snap', true);
    let both = LS.get('dbx-both', false);
    let selEl = null, selSel = '', scopeOne = false, hovEl = null;
    let guides = [], measure = null;
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
        if (!merge) placeInsp();
    }
    // What the rule for this layout says, else what another layout or "both" says.
    const getProp = p => { const r = selSel && ruleFor(selSel, mediaNow(), false); return r && r.props[p] !== undefined ? r.props[p] : ''; };
    const inherited = p => { if (getProp(p)) return ''; const r = selSel && mediaNow() !== 'all' && ruleFor(selSel, 'all', false); return r && r.props[p] !== undefined ? r.props[p] : ''; };

    function select(el, sel) {
        if (editing) endTextEdit(true);
        selEl = el;
        selSel = sel || (el ? (scopeOne ? selOne(el) : selKind(el)) : '');
        if (el) { ['left', 'top', 'right', 'bottom'].forEach(p => { if (el.style[p] && ruleFor(selSel, mediaNow(), false)) el.style.removeProperty(p); }); }
        inspPinned = false;
        renderInsp(); placeInsp();
        if (dockTab === 'OUTLINE') renderDock();
    }
    function setSelMode(on) {
        selMode = on; if (on) { textMode = false; setPickMap(false); }
        document.documentElement.classList.toggle('dbx-sel', on);
        document.documentElement.classList.toggle('dbx-txt', textMode);
        if (!on) hovEl = null;
        renderBar();
    }
    function setTextMode(on) {
        textMode = on; if (on) { selMode = false; setPickMap(false); }
        document.documentElement.classList.toggle('dbx-txt', on);
        document.documentElement.classList.toggle('dbx-sel', selMode);
        if (!on) { hovEl = null; if (editing) endTextEdit(true); }
        renderBar();
    }
    function setPickMap(on) {
        pickMap = on;
        document.documentElement.classList.toggle('dbx-pickmap', on);
        if (on) { selMode = false; textMode = false; document.documentElement.classList.remove('dbx-sel', 'dbx-txt'); toast('Click the map: the layers drawn there open in MAP.'); }
        renderBar();
        if (dockTab === 'MAP') renderDock();
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
    const FIXED = '#map, #map .maplibregl-canvas-container, #map canvas, #stage, #shell, body, html';
    const fixedEl = el => { try { return el.matches(FIXED); } catch (e) { return false; } };
    let twins = [], twinsFor = '';
    function drawOv() {
        ov.textContent = '';
        if (closed) return;
        if ((selMode || textMode) && hovEl && hovEl !== selEl && hovEl.isConnected) {
            const b = hovEl.getBoundingClientRect();
            ov.appendChild(h('div', { class: 'hov', style: `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px` }));
            ov.appendChild(h('div', { class: 'hovn', style: `left:${b.left}px;top:${b.bottom + 2 > innerHeight - 16 ? b.top - 15 : b.bottom + 2}px` }, partName(hovEl, '')));
        }
        if (selEl && selEl.isConnected) {
            // The others the change reaches, when it is for every one like it.
            if (twinsFor !== selSel) { twinsFor = selSel; try { twins = [...document.querySelectorAll(selSel)].filter(e => e !== selEl).slice(0, 80); } catch (e) { twins = []; } }
            twins.forEach(t => { if (!t.isConnected) return; const b = t.getBoundingClientRect(); if (b.width || b.height) ov.appendChild(h('div', { class: 'twin', style: `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px` })); });
            const b = selEl.getBoundingClientRect();
            ov.appendChild(h('div', { class: 'box', style: `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px` }));
            ov.appendChild(h('div', { class: 'nm', style: `left:${b.left}px;top:${Math.max(0, b.top - 15)}px` }, partName(selEl, selSel) + '  ' + Math.round(b.width) + ' × ' + Math.round(b.height) + (twins.length ? '  +' + twins.length + ' like it' : '')));
            if (measure) ov.appendChild(h('div', { class: 'ms', style: `left:${b.left}px;top:${Math.min(innerHeight - 15, b.bottom + 3)}px` }, measure));
            const P = { nw: [b.left, b.top], n: [b.left + b.width / 2, b.top], ne: [b.right, b.top], e: [b.right, b.top + b.height / 2],
                        se: [b.right, b.bottom], s: [b.left + b.width / 2, b.bottom], sw: [b.left, b.bottom], w: [b.left, b.top + b.height / 2] };
            if (selMode && !fixedEl(selEl)) HD.forEach(k => {
                const d = h('div', { class: 'hd', style: `left:${P[k][0]}px;top:${P[k][1]}px;cursor:${CUR[k]}!important` });
                d.addEventListener('pointerdown', e => startDrag(e, k));
                ov.appendChild(d);
            });
        }
        guides.forEach(g => ov.appendChild(h('div', { class: g.x !== undefined ? 'gx' : 'gy', style: g.x !== undefined ? `left:${g.x}px` : `top:${g.y}px` })));
    }
    (function loop() { drawOv(); requestAnimationFrame(loop); })();

    // ── dragging ────────────────────────────────────────────────────────
    const ours = t => !!(t && t.closest && t.closest('[data-dbx-ui]'));
    function deepest(x, y) {
        const list = document.elementsFromPoint(x, y);
        return list.find(e => !ours(e) && e !== document.documentElement && !e.matches('#dbx-ov *')) || null;
    }
    let drag = null;
    function targets(el) {
        const xs = [], ys = [];
        const add = b => { xs.push(b.left, b.right, (b.left + b.right) / 2); ys.push(b.top, b.bottom, (b.top + b.bottom) / 2); };
        add({ left: 0, right: innerWidth, top: 0, bottom: innerHeight });
        const c = container(el);
        if (c) { add({ left: c.l, right: c.r, top: c.t, bottom: c.b }); if (underHeader(c)) ys.push(c.t + frameTop()); }
        const set = new Set();
        PARTS.forEach(([s]) => { try { document.querySelectorAll(s).forEach(e => set.add(e)); } catch (e) {} });
        document.querySelectorAll('[data-dbu]').forEach(e => set.add(e));
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
            if (!e.altKey) {
                const cand = [nb.left, nb.right, (nb.left + nb.right) / 2].map(v => snapTo(v, T.xs, gx0));
                const sx = cand.reduce((a, c) => (c.line !== null && (a === null || Math.abs(c.d) < Math.abs(a.d))) ? c : a, null) || cand[0];
                const cy = [nb.top, nb.bottom, (nb.top + nb.bottom) / 2].map(v => snapTo(v, T.ys, gy0));
                const sy = cy.reduce((a, c) => (c.line !== null && (a === null || Math.abs(c.d) < Math.abs(a.d))) ? c : a, null) || cy[0];
                nb.left += sx.d; nb.right += sx.d; nb.top += sy.d; nb.bottom += sy.d;
                if (sx.line !== null) guides.push({ x: sx.line });
                if (sy.line !== null) guides.push({ y: sy.line });
            }
            if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) { nb.top = o.top; nb.bottom = o.bottom; } else { nb.left = o.left; nb.right = o.right; } }
            setProps(placeProps(selEl, nb, drag.anchor), true);
        } else {
            const sn = (v, list, g0) => e.altKey ? { d: 0, line: null } : snapTo(v, list, g0);
            if (/w/.test(k)) { const s = sn(o.left + dx, T.xs, gx0); nb.left = o.left + dx + s.d; if (s.line !== null) guides.push({ x: s.line }); }
            if (/e/.test(k)) { const s = sn(o.right + dx, T.xs, gx0); nb.right = o.right + dx + s.d; if (s.line !== null) guides.push({ x: s.line }); }
            if (/n/.test(k)) { const s = sn(o.top + dy, T.ys, gy0); nb.top = o.top + dy + s.d; if (s.line !== null) guides.push({ y: s.line }); }
            if (/s/.test(k)) { const s = sn(o.bottom + dy, T.ys, gy0); nb.bottom = o.bottom + dy + s.d; if (s.line !== null) guides.push({ y: s.line }); }
            if (e.shiftKey && k.length === 2) { const r = o.width / o.height; const w = nb.right - nb.left; const hh = w / r; if (/n/.test(k)) nb.top = nb.bottom - hh; else nb.bottom = nb.top + hh; }
            if (nb.right - nb.left < 8) nb.right = nb.left + 8;
            if (nb.bottom - nb.top < 8) nb.bottom = nb.top + 8;
            const w = /[we]/.test(k) ? nb.right - nb.left : null, hh = /[ns]/.test(k) ? nb.bottom - nb.top : null;
            const props = sizeProps(selEl, w, hh);
            if (container(selEl) || /[wn]/.test(k)) Object.assign(props, placeProps(selEl, nb, drag.anchor));
            setProps(props, true);
        }
        R.applyCss();
        const xy = readXY(selEl), bb = selEl.getBoundingClientRect();
        measure = k === 'move' ? (xy.flow ? 'nudge ' + xy.x + ', ' + xy.y : 'x ' + xy.x + '  y ' + xy.y) : Math.round(bb.width) + ' × ' + Math.round(bb.height);
    }
    function endDrag(e) {
        document.removeEventListener('pointermove', onDrag, true);
        document.removeEventListener('pointerup', endDrag, true);
        if (drag && drag.moved) { e.preventDefault(); e.stopPropagation(); lastCommit = 0; commit(false); }
        const pick = drag && !drag.moved && drag.pick;
        const moved = drag && drag.moved;
        drag = null; guides = []; measure = null;
        if (pick) { scopeOne = false; select(pick); return; }
        if (moved) { renderInsp(); if (!inspPinned) placeInsp(); }
    }

    // ── words, edited where they are ────────────────────────────────────
    let editing = null;     // { el, from, before, input?, added? }
    const textHolder = el => { let n = el; while (n && n !== document.body) { if (!ours(n) && (R.ownText(n) || addedOf(n))) return n; n = n.parentElement; } return null; };
    function setTextOverride(el, to, from) {
        const s = S();
        const sel = scopeOne ? selOne(el) : selKind(el);
        s.texts = s.texts || [];
        const i = s.texts.findIndex(t => t.sel === sel && t.from === from);
        if (to === from) { if (i >= 0) s.texts.splice(i, 1); }
        else if (i >= 0) s.texts[i].to = to;
        else s.texts.push({ sel, from, to });
    }
    function startTextEdit(el) {
        if (!el || editing) return;
        const a = addedOf(el);
        if (a && a.kind !== 'text' && a.kind !== 'link') return;
        if (selEl !== el) { scopeOne = scopeOne && !a; select(el); }
        const from = a ? a.text || '' : R.origText(el);
        editing = { el, from, before: JSON.stringify(S().texts || []), beforeText: a ? a.text : null, added: a };
        if (a || ![...el.children].length) {
            el.setAttribute('contenteditable', 'plaintext-only');
            if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
            el.setAttribute('data-dbx-editing', '');
            el.focus();
            const rg = document.createRange(); rg.selectNodeContents(el);
            const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg);
            el.addEventListener('input', onTextInput);
            el.addEventListener('blur', onTextBlur);
        } else {
            // A part with icons or other parts inside: its words are edited in a box over it.
            const b = el.getBoundingClientRect();
            const inp = ui('input', { class: 'dbx-t', value: R.ownText(el), style: `position:fixed;z-index:2147483002;left:${b.left}px;top:${Math.max(0, b.top)}px;width:${Math.max(120, b.width)}px;height:${Math.max(22, Math.min(40, b.height))}px;font-size:12px!important;border:1px solid #f0f;background:#fff` });
            document.body.appendChild(inp);
            editing.input = inp;
            inp.focus(); inp.select();
            inp.addEventListener('input', () => { setTextOverride(el, inp.value.replace(/\s+/g, ' ').trim(), from); commit(true); R.applyDom(); });
            inp.addEventListener('blur', () => endTextEdit(true));
            inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); endTextEdit(true); } if (e.key === 'Escape') { e.preventDefault(); endTextEdit(false); } });
        }
        renderBar();
    }
    function onTextInput() {
        if (!editing) return;
        const el = editing.el;
        if (editing.added) { editing.added.text = el.innerText.replace(/\n$/, ''); commit(true); }
        else { setTextOverride(el, R.ownText(el), editing.from); commit(true); }
    }
    function onTextBlur() { setTimeout(() => { if (editing && document.activeElement !== editing.el) endTextEdit(true); }, 0); }
    function endTextEdit(keep) {
        if (!editing) return;
        const E = editing; editing = null;
        const el = E.el;
        if (E.input) E.input.remove();
        else {
            el.removeEventListener('input', onTextInput); el.removeEventListener('blur', onTextBlur);
            el.removeAttribute('contenteditable'); el.removeAttribute('data-dbx-editing');
            try { getSelection().removeAllRanges(); } catch (e) {}
        }
        if (!keep) {
            if (E.added) E.added.text = E.beforeText;
            else S().texts = JSON.parse(E.before);
            if (!E.added) { R.applyDom(); if (R.ownText(el) !== E.from && !S().texts.some(t => { try { return el.matches(t.sel); } catch (e) { return false; } })) { try { el.textContent = E.from; } catch (e) {} } }
        } else if (!E.added) {
            // Words typed straight into a part that holds only words: tidy spaces.
            const t = R.ownText(el);
            setTextOverride(el, t, E.from);
        }
        lastCommit = 0; commit(false);
        R.applyDom();
        renderInsp(); renderBar();
    }

    // ── the page's own events, while picking ────────────────────────────
    const BLOCK = ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'pointerup', 'auxclick'];
    const pickable = el => { while (el && el instanceof SVGElement) el = el.parentNode; return el && el.nodeType === 1 ? el : null; };
    BLOCK.forEach(t => document.addEventListener(t, e => {
        if (closed || ours(e.target) || drag) return;
        if (editing && !editing.input && editing.el.contains(e.target)) { e.stopPropagation(); return; }
        if (pickMap) {
            if (!e.target.closest || !e.target.closest('#map')) return;
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            if (t === 'click') mapPickAt(e);
            return;
        }
        if (!selMode && !textMode) return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (textMode) {
            if (t !== 'pointerdown') return;
            const el = textHolder(pickable(deepest(e.clientX, e.clientY)));
            if (editing) endTextEdit(true);
            if (el) startTextEdit(el); else toast('No words there.');
            return;
        }
        if (t === 'dblclick') { const el = textHolder(pickable(deepest(e.clientX, e.clientY))); if (el) startTextEdit(el); return; }
        if (t !== 'pointerdown') return;
        let el = pickable(deepest(e.clientX, e.clientY));
        if (!el) return;
        if (editing) endTextEdit(true);
        if (e.altKey) { const base = selEl && selEl.contains(el) ? selEl : el; if (base.parentElement && base.parentElement !== document.documentElement) { scopeOne = false; select(base.parentElement); } return; }
        if (selEl && selEl.contains(el)) {
            if (fixedEl(selEl)) { if (el !== selEl) { scopeOne = false; select(el); } return; }
            startDrag(e, 'move'); if (drag) drag.pick = el === selEl ? null : el; return;
        }
        scopeOne = false;
        select(el);
        startDrag(e, 'move');
    }, true));
    document.addEventListener('pointermove', e => {
        if (closed || drag || !(selMode || textMode)) return;
        if (ours(e.target)) { hovEl = null; return; }
        const el = pickable(deepest(e.clientX, e.clientY));
        hovEl = textMode ? textHolder(el) : el;
    }, true);
    const typingIn = t => t && t.matches && (t.matches('input,select,textarea') || t.isContentEditable);
    document.addEventListener('keydown', e => {
        if (closed) return;
        if (editing && !editing.input) {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); endTextEdit(false); }
            else if (e.key === 'Enter' && !(editing.added && e.shiftKey)) { e.preventDefault(); endTextEdit(true); }
            return;
        }
        const typing = typingIn(e.target);
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && !typing && k === 'z') { e.preventDefault(); e.stopPropagation(); go(e.shiftKey ? 1 : -1); return; }
        if ((e.ctrlKey || e.metaKey) && !typing && k === 'y') { e.preventDefault(); e.stopPropagation(); go(1); return; }
        if (typing) return;
        if ((e.ctrlKey || e.metaKey) && k === 'd' && selEl) { e.preventDefault(); e.stopPropagation(); duplicate(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (k === 'v') { e.preventDefault(); e.stopPropagation(); setSelMode(!selMode); return; }
        if (k === 't') { e.preventDefault(); e.stopPropagation(); setTextMode(!textMode); return; }
        if (k === 'escape') {
            if (pickMap) { setPickMap(false); return; }
            if (selEl) { e.preventDefault(); e.stopPropagation(); select(null); return; }
            if (selMode || textMode) { setSelMode(false); setTextMode(false); return; }
        }
        if (!selEl) return;
        if ((k === 'delete' || k === 'backspace') && (selMode || addedOf(selEl))) { e.preventDefault(); e.stopPropagation(); removeSel(); return; }
        if (k === 'enter' && selMode) { e.preventDefault(); e.stopPropagation(); const t = textHolder(selEl); if (t) startTextEdit(t); return; }
        if (k === '[' && selEl.parentElement && selEl.parentElement !== document.documentElement) { e.preventDefault(); select(selEl.parentElement); return; }
        if (!selMode || !/^arrow/.test(k) || fixedEl(selEl)) return;
        e.preventDefault(); e.stopPropagation();
        const d = e.shiftKey ? 10 : 1;
        const b = selEl.getBoundingClientRect();
        const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
        setProps(placeProps(selEl, { left: b.left + dx, right: b.right + dx, top: b.top + dy, bottom: b.bottom + dy }, anchorOf(selEl)), true);
        R.applyCss();
        clearTimeout(nudgeT); nudgeT = setTimeout(() => renderInsp(), 120);
    }, true);
    let nudgeT = 0;

    // ═════════════════════════════════════════════════════════════════════
    // ADD, COPY, REMOVE
    // ═════════════════════════════════════════════════════════════════════
    function addPart(kind, inside) {
        const s = S();
        const id = uid();
        const a = { id, kind };
        if (kind === 'text') a.text = 'New text';
        if (kind === 'link') { a.text = 'A link'; a.href = 'https://'; }
        if (kind === 'image') { a.src = ''; a.fit = 'contain'; }
        a.parent = inside && selEl && !fixedEl(selEl) ? selOne(selEl) : 'body';
        s.added.push(a);
        const p = {};
        if (a.parent === 'body') Object.assign(p, { position: 'fixed', left: Math.round(innerWidth / 2 - 90) + 'px', top: Math.round(innerHeight / 3) + 'px', 'z-index': '900' });
        else Object.assign(p, { position: 'relative' });
        if (kind === 'text') Object.assign(p, { 'font-size': '14px', 'line-height': '1.3', color: '#000000' });
        if (kind === 'link') Object.assign(p, { 'font-size': '14px', color: '#000000', 'text-decoration': 'underline' });
        if (kind === 'box') Object.assign(p, { width: '180px', height: '110px', 'border-top-width': '0.5px', 'border-right-width': '0.5px', 'border-bottom-width': '0.5px', 'border-left-width': '0.5px',
            'border-top-style': 'solid', 'border-right-style': 'solid', 'border-bottom-style': 'solid', 'border-left-style': 'solid',
            'border-top-color': '#000000', 'border-right-color': '#000000', 'border-bottom-color': '#000000', 'border-left-color': '#000000', 'background-color': '#ffffff' });
        if (kind === 'image') Object.assign(p, { width: '240px', height: '160px', 'background-color': '#eeeeee' });
        s.rules.push({ sel: '#' + id, media: 'all', props: p });
        commit();
        R.applyDom(); R.applyCss();
        const el = document.getElementById(id);
        if (!el) { toast('Could not place it there.'); return; }
        if (!selMode && !textMode) setSelMode(true);
        scopeOne = false;
        select(el);
        if (kind === 'text' || kind === 'link') setTimeout(() => startTextEdit(el), 30);
        if (kind === 'image') { OPEN.add('TEXT'); renderInsp(); toast('Give the image an address, or upload one, in the inspector.'); }
    }
    function duplicate() {
        if (!selEl || fixedEl(selEl)) return;
        const s = S();
        const a = addedOf(selEl);
        const id = uid();
        if (a) {
            const b = Object.assign(clone(a), { id });
            s.added.push(b);
            s.rules.filter(r => r.sel === '#' + a.id).forEach(r => {
                const p = clone(r.props);
                ['left', 'top'].forEach(k => { if (/^-?[\d.]+px$/.test(p[k] || '')) p[k] = (num(p[k]) + 16) + 'px'; });
                s.rules.push({ sel: '#' + id, media: r.media, props: p });
            });
        } else {
            s.dups.push({ id, of: selOne(selEl) });
        }
        commit();
        R.applyDom(); R.applyCss();
        const el = document.getElementById(id);
        if (el) { scopeOne = false; select(el); toast('Copied. Drag it where you want it.'); }
    }
    function removeSel() {
        if (!selEl) return;
        const s = S();
        const a = addedOf(selEl), d = dupOf(selEl);
        if (a || d) {
            const id = selEl.id;
            if (a) s.added = s.added.filter(x => x.id !== id); else s.dups = s.dups.filter(x => x.id !== id);
            s.rules = s.rules.filter(r => r.sel !== '#' + id);
            commit(); R.applyDom();
            select(null);
            toast('Deleted. Ctrl+Z brings it back.');
            return;
        }
        if (fixedEl(selEl)) { toast('The map and the page frame cannot be hidden.'); return; }
        setProps({ display: 'none' });
        toast('Hidden on ' + (both ? 'desktop and phone' : isPhone() ? 'phone' : 'desktop') + '. Show it again from OUTLINE, or Ctrl+Z.', 3500);
        select(null);
    }

    // ═════════════════════════════════════════════════════════════════════
    // THE INSPECTOR, beside what is picked
    // ═════════════════════════════════════════════════════════════════════
    const insp = ui('div', { id: 'dbx-insp', hidden: true });
    const inspHead = h('div', { class: 'dbx-head' });
    const inspBody = h('div', { class: 'dbx-body' });
    insp.append(inspHead, inspBody);
    document.body.appendChild(insp);
    keepKeys(insp);
    let inspPinned = false;
    movable(insp, inspHead, 'dbx-insp-pos-unused', () => { inspPinned = true; renderInspHead(); });
    try { localStorage.removeItem('dbx-insp-pos-unused'); } catch (e) {}
    function placeInsp() {
        if (insp.hidden || inspPinned || !selEl || !selEl.isConnected) return;
        const b = selEl.getBoundingClientRect();
        const w = insp.offsetWidth || 300, hh = Math.min(insp.offsetHeight || 400, innerHeight - 56);
        const dockR = !dock.hidden && !dock.classList.contains('left') ? dock.getBoundingClientRect().left - 8 : innerWidth - 8;
        const dockL = !dock.hidden && dock.classList.contains('left') ? dock.getBoundingClientRect().right + 8 : 8;
        let l;
        if (b.right + 12 + w <= dockR) l = b.right + 12;
        else if (b.left - 12 - w >= dockL) l = b.left - 12 - w;
        else l = dockR - w;
        const top0 = bar.hidden ? 8 : bar.getBoundingClientRect().bottom + 6;
        let t = Math.max(top0, Math.min(b.top, innerHeight - hh - 8));
        insp.style.left = Math.max(dockL, Math.round(l)) + 'px'; insp.style.top = Math.round(t) + 'px';
    }
    function renderInspHead() {
        inspHead.textContent = '';
        if (!selEl) return;
        const a = addedOf(selEl), d = dupOf(selEl);
        inspHead.append(h('b', { title: selSel }, partName(selEl, selSel)),
            h('button', { class: 'dbx-ib', title: 'Pick what this sits in  [ ', onclick: () => { if (selEl.parentElement && selEl.parentElement !== document.documentElement) select(selEl.parentElement); } }, '↥'),
            h('button', { class: 'dbx-ib', title: 'Copy it  Ctrl+D', disabled: fixedEl(selEl), onclick: duplicate }, '⧉'),
            h('button', { class: 'dbx-ib', title: a || d ? 'Delete it  Del' : 'Hide it  Del', disabled: fixedEl(selEl), onclick: removeSel }, a || d ? '⌫' : '◌'),
            h('button', { class: 'dbx-ib', title: 'Everything changed on it, for this layout, back to how it was', onclick: () => { const r = ruleFor(selSel, mediaNow(), false); if (r) { r.props = {}; prune(); commit(); renderInsp(); } } }, '⟲'),
            h('button', { class: 'dbx-ib' + (inspPinned ? ' on' : ''), title: inspPinned ? 'Pinned here. Click to let it follow what is picked.' : 'Let it stay where it is (or drag it by its head)', onclick: () => { inspPinned = !inspPinned; renderInspHead(); placeInsp(); } }, '⊙'),
            h('button', { class: 'dbx-ib', title: 'Let go  Esc', onclick: () => select(null) }, '×'));
    }
    function renderInsp() {
        if (closed || !selEl || !selEl.isConnected) { insp.hidden = true; if (selEl && !selEl.isConnected) selEl = null; return; }
        insp.hidden = false;
        const foc = document.activeElement && insp.contains(document.activeElement) ? document.activeElement.dataset.k : null;
        const y = inspBody.scrollTop;
        renderInspHead();
        inspBody.textContent = '';
        try { inspBody.append(...inspector().filter(Boolean)); } catch (e) { console.error(e); inspBody.append(h('div', { class: 'dbx-note dbx-err' }, 'Could not draw this: ' + e.message)); }
        inspBody.scrollTop = y;
        if (foc) { const f = inspBody.querySelector('[data-k="' + foc + '"]'); if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {} } }
    }
    let boxSide = 'all';
    const CSS_PROPS = (() => {
        const set = new Set();
        const st = document.documentElement.style;
        for (const k in st) { if (typeof st[k] === 'string' && !/^(webkit|moz|ms)/i.test(k) && /^[a-z]/.test(k)) set.add(k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())); }
        for (let i = 0; i < st.length; i++) set.add(st[i]);
        return [...set].filter(p => p !== 'css-text' && p !== 'length' && p !== 'parent-rule' && p !== 'css-float').sort();
    })();
    const propList = h('datalist', { id: 'dbx-props' }, CSS_PROPS.map(p => h('option', { value: p })));
    document.body.appendChild(ui('div', { hidden: true }, propList));

    function inspector() {
        const el = selEl;
        const cs = getComputedStyle(el);
        const a = addedOf(el), d = dupOf(el);
        const out = [];
        // Which elements it is for, and which layout.
        const selIn = h('input', { class: 'dbx-t dbx-mono', value: selSel, spellcheck: false, title: 'Which elements this applies to (a CSS selector). You can add :hover, :focus or anything else.' });
        selIn.addEventListener('change', () => { selSel = selIn.value.trim(); twinsFor = ''; renderInsp(); });
        const scope = !a && !d ? h('div', { class: 'dbx-row' }, h('span', { class: 'lb' }, 'applies to'),
            seg([[false, 'every one like it', 'Every part made the same way: rows, tabs, buttons of the same kind'], [true, 'only this one']], scopeOne, v => { scopeOne = !scopeOne; select(el); })) : null;
        if (scope) [...scope.querySelectorAll('button')].forEach((b, i) => b.classList.toggle('on', i === (scopeOne ? 1 : 0)));
        const otherMedia = S().rules.filter(r => r.sel === selSel && (r.media || 'all') !== mediaNow() && Object.keys(r.props).length).map(r => r.media);
        out.push(h('div', { class: 'dbx-row' }, selIn), scope,
            h('div', { class: 'dbx-row' }, h('span', { class: 'lb' }, 'written for'),
                seg([['one', both ? 'this layout' : (isPhone() ? 'PHONE' : 'DESKTOP')], ['both', 'both']], both ? 'both' : 'one', v => { if (!v) return; both = v === 'both'; LS.set('dbx-both', both); render(); }),
                otherMedia.length ? h('span', { class: 'dbx-note', style: 'margin:0 0 0 4px' }, '+ rules for ' + otherMedia.join(', ')) : null));
        if (getProp('display') === 'none') out.push(h('div', { class: 'dbx-mode' }, 'Hidden in this layout. ', h('button', { class: 'dbx-btn', onclick: () => { setProps({ display: null }); renderInsp(); } }, 'show it')));
        const has = (...ps) => ps.some(p => getProp(p));
        const prop = (p, opts) => {
            opts = opts || {};
            const cur = getProp(p);
            const shown = opts.read ? opts.read() : cs.getPropertyValue(p);
            return numIn(cur, shown !== '' && shown !== undefined ? (opts.rawShown ? shown : r1(num(shown))) : '', (v, live) => { setProps({ [p]: v === '' ? null : (opts.raw ? v : px(v)) }, live); if (!live) renderInsp(); },
                Object.assign({ unit: opts.raw ? '' : 'px', k: p }, opts));
        };
        const pick = (p, options, w) => sel(options, getProp(p), '— ' + (cs.getPropertyValue(p) || ''), v => { setProps({ [p]: v || null }); renderInsp(); }, w ? 'flex:0 0 ' + w + 'px' : '');
        const clr = (p, label) => { const [c, t] = colorIn(getProp(p), R.colorKey(cs.getPropertyValue(p)) || '', (v, live) => { setProps({ [p]: v || null }, live); if (!live) renderInsp(); }); t.dataset.k = p; return row(label, c, t, x(getProp(p), () => { setProps({ [p]: null }); renderInsp(); })); };

        // TEXT
        const holder = textHolder(el) === el;
        if (a || holder) {
            const rows = [];
            if (a && (a.kind === 'text' || a.kind === 'link')) {
                const ta = h('textarea', { class: 'dbx-ta txt', spellcheck: true }, a.text || '');
                ta.dataset.k = 'atext';
                ta.addEventListener('input', () => { a.text = ta.value; commit(true); R.applyDom(); });
                rows.push(ta);
                if (a.kind === 'link') {
                    const hr = h('input', { class: 'dbx-t dbx-mono', value: a.href || '', spellcheck: false, placeholder: 'https://…' });
                    hr.addEventListener('input', () => { a.href = hr.value.trim(); commit(true); R.applyDom(); });
                    rows.push(row('goes to', hr), row('', h('label', { style: 'display:flex;align-items:center;gap:4px' }, h('input', { type: 'checkbox', checked: a.newTab !== false, onchange: e => { a.newTab = e.target.checked; commit(); R.applyDom(); } }), 'opens in a new tab')));
                }
            } else if (a && a.kind === 'image') {
                const src = h('input', { class: 'dbx-t dbx-mono', value: /^data:/.test(a.src || '') ? '' : (a.src || ''), placeholder: /^data:/.test(a.src || '') ? 'uploaded picture' : 'address of a picture', spellcheck: false });
                src.addEventListener('change', () => { a.src = src.value.trim(); commit(); R.applyDom(); });
                const file = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
                file.addEventListener('change', () => {
                    const f = file.files[0]; if (!f) return;
                    if (f.size > 3e6) { toast('That picture is over 3 MB: make it smaller first.', 4000); return; }
                    const rd = new FileReader();
                    rd.onload = () => { a.src = rd.result; a.file = f.name; commit(); R.applyDom(); renderInsp(); };
                    rd.readAsDataURL(f);
                });
                const alt = h('input', { class: 'dbx-t', value: a.alt || '', placeholder: 'what it shows, for screen readers' });
                alt.addEventListener('change', () => { a.alt = alt.value; commit(); R.applyDom(); });
                rows.push(row('picture', src), row('', h('button', { class: 'dbx-btn', onclick: () => file.click() }, 'upload…'), file, a.file ? h('span', { class: 'dbx-note', style: 'margin:0' }, a.file) : null),
                    row('fit', seg([['contain', 'whole'], ['cover', 'fill'], ['fill', 'stretch']], a.fit || 'contain', v => { a.fit = v || 'contain'; commit(); R.applyDom(); renderInsp(); })), row('description', alt));
            } else {
                const orig = R.origText(el), now = R.ownText(el);
                const ta = h('textarea', { class: 'dbx-ta txt', spellcheck: true }, now);
                ta.dataset.k = 'text';
                ta.addEventListener('input', () => { setTextOverride(el, ta.value.replace(/\s+/g, ' ').trim(), orig); commit(true); R.applyDom(); twinsFor = ''; });
                rows.push(ta, h('div', { class: 'dbx-row' }, h('span', { class: 'dbx-note', style: 'flex:1;margin:0' }, now !== orig ? 'was: “' + orig + '”' : (scopeOne ? 'This one only.' : 'Every one like it that says the same.') + ' Or double-click the words on the page.'),
                    x(now !== orig, () => { setTextOverride(el, orig, orig); commit(); R.applyDom(); renderInsp(); }, 'Back to the words the page has')));
            }
            out.push(section('TEXT', a ? false : R.origText(el) !== R.ownText(el), ...rows));
        }

        // PLACE AND SIZE
        const xy = readXY(el), c = container(el), bb = el.getBoundingClientRect();
        const place = [];
        if (!xy.flow) {
            const an = xy.a;
            const ab = (k, t) => h('button', { class: an === k ? 'on' : '', title: t, onclick: () => {
                const b = el.getBoundingClientRect(); setProps(placeProps(el, { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, k)); renderInsp(); } });
            place.push(row('held from', h('span', { class: 'dbx-anchor' }, ab('lt', 'top left'), ab('rt', 'top right'), ab('lb', 'bottom left'), ab('rb', 'bottom right')),
                h('span', { class: 'dbx-note', style: 'margin:0 0 0 6px' }, (an[0] === 'l' ? 'left' : 'right') + ' / ' + (an[1] === 't' ? (xy.under ? 'top, under the header' : 'top') : 'bottom'))));
        }
        const setXY = (which, v, live) => {
            if (v === '') return;
            const n = num(v);
            if (xy.flow) { setProps({ position: 'relative', [which === 'x' ? 'left' : 'top']: n + 'px' }, live); if (!live) renderInsp(); return; }
            const an = anchorOf(el);
            if (which === 'x') setProps(an[0] === 'l' ? { left: n + 'px', right: 'auto' } : { right: n + 'px', left: 'auto' }, live);
            else if (an[1] === 't') setProps({ top: underHeader(c) ? 'calc(var(--frame-top) + ' + n + 'px)' : n + 'px', bottom: 'auto' }, live);
            else setProps({ bottom: n + 'px', top: 'auto' }, live);
            if (!live) renderInsp();
        };
        if (!fixedEl(el)) {
            place.push(row(xy.flow ? 'nudge x' : 'x', numIn('', xy.x, (v, l) => setXY('x', v, l), { k: 'x', title: xy.flow ? 'Moves it from its place in the row' : 'Distance from the held side' })),
                row(xy.flow ? 'nudge y' : 'y', numIn('', xy.y, (v, l) => setXY('y', v, l), { k: 'y', title: xy.under ? 'Distance under the site header' : '' }),
                    h('span', { class: 'dbx-note', style: 'margin:0 0 0 4px' }, xy.flow ? 'in the flow' : 'px')));
        }
        place.push(row('width', numIn(getProp('width') || getProp('flex-basis'), Math.round(bb.width), (v, l) => { setProps(v === '' ? { width: null, 'max-width': null } : (/[a-z%]$/i.test(v) && !/px$/.test(v) ? { width: v, 'max-width': 'none' } : sizeProps(el, num(v), null)), l); if (!l) renderInsp(); }, { k: 'w', title: 'px, or %, vw, em, auto…' }),
                h('span', { class: 'dbx-note', style: 'margin:0' }, 'min'), prop('min-width', { w4: true }), h('span', { class: 'dbx-note', style: 'margin:0' }, 'max'), prop('max-width', { w4: true, read: () => cs.maxWidth === 'none' ? '' : cs.maxWidth })),
            row('height', numIn(getProp('height'), Math.round(bb.height), (v, l) => { setProps(v === '' ? { height: null, 'max-height': null, 'flex-basis': null } : (/[a-z%]$/i.test(v) && !/px$/.test(v) ? { height: v, 'max-height': 'none' } : sizeProps(el, null, num(v))), l); if (!l) renderInsp(); }, { k: 'h' }),
                h('span', { class: 'dbx-note', style: 'margin:0' }, 'min'), prop('min-height', { w4: true }), h('span', { class: 'dbx-note', style: 'margin:0' }, 'max'), prop('max-height', { w4: true, read: () => cs.maxHeight === 'none' ? '' : cs.maxHeight })),
            row('in front', prop('z-index', { raw: true, read: () => cs.zIndex === 'auto' ? '' : cs.zIndex, k: 'z' }),
                h('span', { class: 'dbx-note', style: 'margin:0 4px' }, 'order'),
                h('button', { class: 'dbx-btn', title: 'Earlier among its neighbours', onclick: () => reorder(-1) }, '▲'),
                h('button', { class: 'dbx-btn', title: 'Later among its neighbours', onclick: () => reorder(1) }, '▼')));
        out.push(section('PLACE AND SIZE', has('left', 'top', 'right', 'bottom', 'width', 'height', 'z-index', 'order', 'min-width', 'max-width', 'min-height', 'max-height'), ...place));

        // LAYOUT
        const flexy = /flex|grid/.test(getProp('display') || cs.display);
        const lay = [row('display', pick('display', ['block', 'flex', 'grid', 'inline-block', 'inline-flex', 'inline', 'contents'])),
            row('position', pick('position', ['static', 'relative', 'absolute', 'fixed', 'sticky']))];
        if (flexy) lay.push(row('direction', pick('flex-direction', ['row', 'row-reverse', 'column', 'column-reverse'])),
            row('spread', pick('justify-content', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'])),
            row('line up', pick('align-items', ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'])),
            row('wrap', pick('flex-wrap', ['nowrap', 'wrap'])),
            row('gap', prop('gap', { read: () => cs.rowGap === 'normal' ? '' : cs.rowGap }), x(getProp('gap'), () => { setProps({ gap: null }); renderInsp(); })));
        if (el.parentElement && /flex/.test(getComputedStyle(el.parentElement).display)) lay.push(row('grow', prop('flex-grow', { raw: true, w4: true, step: 1 }), h('span', { class: 'dbx-note', style: 'margin:0' }, 'shrink'), prop('flex-shrink', { raw: true, w4: true }), h('span', { class: 'dbx-note', style: 'margin:0' }, 'self'), pick('align-self', ['auto', 'flex-start', 'center', 'flex-end', 'stretch'], 70)));
        lay.push(row('overflow', pick('overflow', ['visible', 'hidden', 'auto', 'scroll'])), row('shown', pick('visibility', ['visible', 'hidden'])));
        out.push(section('LAYOUT', has('display', 'position', 'flex-direction', 'justify-content', 'align-items', 'flex-wrap', 'gap', 'overflow', 'visibility', 'flex-grow', 'flex-shrink', 'align-self'), ...lay));

        // SPACING
        const four = (base, label) => row(label, ...['top', 'right', 'bottom', 'left'].map(s => prop(base + '-' + s, { w3: true, title: s })),
            x(['top', 'right', 'bottom', 'left'].some(s => getProp(base + '-' + s)), () => { setProps({ [base + '-top']: null, [base + '-right']: null, [base + '-bottom']: null, [base + '-left']: null }); renderInsp(); }));
        const allFour = (base, label) => row(label, numIn('', '', (v, l) => { const o = {}; ['top', 'right', 'bottom', 'left'].forEach(s => { o[base + '-' + s] = v === '' ? null : px(v); }); setProps(o, l); if (!l) renderInsp(); }, { title: 'all four sides at once', k: base + '-all' }));
        out.push(section('SPACING', has('padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'),
            h('div', { class: 'dbx-note', style: 'margin:0' }, 'top · right · bottom · left'), four('padding', 'inside'), allFour('padding', 'inside, all'), four('margin', 'outside'), allFour('margin', 'outside, all')));

        // TYPE
        const fams = familyOptions();
        const fSel = h('select', { class: 'dbx-s' + (getProp('font-family') ? ' set' : '') }, h('option', { value: '' }, '— ' + firstFamily(cs.fontFamily)),
            fams.map(f => h('option', { value: f, selected: unq(getProp('font-family').split(',')[0] || '') === f, style: 'font-family:"' + f + '"' }, f)));
        fSel.addEventListener('change', () => { setProps({ 'font-family': fSel.value ? famValue(fSel.value, cs.fontFamily) : null }); renderInsp(); });
        const wSel = pick('font-weight', ['100', '200', '300', '400', '500', '600', '700', '800', '900'], 62);
        const tog = (p, on, label, title) => h('button', { class: getProp(p) === on ? 'on' : '', title, onclick: () => { setProps({ [p]: getProp(p) === on ? null : on }); renderInsp(); } }, label);
        const type = [row('typeface', fSel, x(getProp('font-family'), () => { setProps({ 'font-family': null }); renderInsp(); })),
            row('size', prop('font-size', { step: 0.5 }), wSel, x(has('font-size', 'font-weight'), () => { setProps({ 'font-size': null, 'font-weight': null }); renderInsp(); })),
            row('letters', prop('letter-spacing', { step: 0.1, read: () => cs.letterSpacing === 'normal' ? '0' : cs.letterSpacing, title: 'space between letters, px or em' }),
                h('span', { class: 'dbx-note', style: 'margin:0' }, 'line'), prop('line-height', { raw: true, step: 0.05, read: () => cs.lineHeight === 'normal' ? '' : r2(num(cs.lineHeight) / (num(cs.fontSize) || 1)), title: 'line height: 1.3 is 1.3 times the size; or px' }),
                x(has('letter-spacing', 'line-height'), () => { setProps({ 'letter-spacing': null, 'line-height': null }); renderInsp(); })),
            clr('color', 'colour'),
            row('align', seg([['left', 'L'], ['center', 'C'], ['right', 'R'], ['justify', 'J']], getProp('text-align'), v => { setProps({ 'text-align': v || null }); renderInsp(); }),
                h('span', { class: 'dbx-seg' }, tog('text-transform', 'uppercase', 'AA', 'capitals'), tog('text-transform', 'none', 'Aa', 'as written'), tog('font-style', 'italic', 'i', 'italic'),
                    tog('text-decoration-line', 'underline', 'U', 'underline'), tog('white-space', 'nowrap', '↔', 'keep on one line'))),
            row('lines max', prop('-webkit-line-clamp', { raw: true, w4: true, title: 'cut the text after this many lines' }), h('span', { class: 'dbx-note', style: 'margin:0' }, 'indent'), prop('text-indent', { w4: true }))];
        if (getProp('-webkit-line-clamp') && !getProp('display')) setTimeout(() => setProps({ display: '-webkit-box', '-webkit-box-orient': 'vertical', overflow: 'hidden' }), 0);
        out.push(section('TYPE', has('font-family', 'font-size', 'font-weight', 'letter-spacing', 'line-height', 'color', 'text-align', 'text-transform', 'font-style', 'text-decoration-line', 'white-space'), ...type));

        // FILL AND BORDER
        let side = boxSide;
        const sideSeg = seg([['all', 'all'], ['top', 'T'], ['right', 'R'], ['bottom', 'B'], ['left', 'L']], side, v => { boxSide = v || 'all'; renderInsp(); });
        const sides = side === 'all' ? ['top', 'right', 'bottom', 'left'] : [side];
        const bw = 'border-' + sides[0] + '-width';
        const setB = (what, v, live) => { const o = {}; sides.forEach(s => { o['border-' + s + '-' + what] = v === '' ? null : v; }); setProps(o, live); };
        const [brc, brt] = colorIn(getProp('border-' + sides[0] + '-color'), R.colorKey(cs.getPropertyValue('border-' + sides[0] + '-color')) || '', (v, live) => { setB('color', v, live); if (!live) renderInsp(); });
        const bsSel = sel(['solid', 'dashed', 'dotted', 'double', 'none'], getProp('border-' + sides[0] + '-style'), '— ' + cs.getPropertyValue('border-' + sides[0] + '-style'), v => { setB('style', v); renderInsp(); }, 'flex:0 0 70px');
        const bgImg = h('input', { class: 'dbx-t dbx-mono' + (getProp('background-image') ? ' set' : ''), value: (/^url\(["']?(.*?)["']?\)$/.exec(getProp('background-image') || '') || [])[1] || getProp('background-image'), placeholder: 'picture address, or a gradient', spellcheck: false });
        bgImg.addEventListener('change', () => { const v = bgImg.value.trim(); setProps({ 'background-image': !v ? null : /\(/.test(v) ? v : 'url("' + v + '")', 'background-size': v && !getProp('background-size') ? 'cover' : getProp('background-size') || null }); renderInsp(); });
        const fill = [clr('background-color', 'fill'),
            row('fill picture', bgImg, x(getProp('background-image'), () => { setProps({ 'background-image': null, 'background-size': null, 'background-position': null }); renderInsp(); })),
            getProp('background-image') ? row('', pick('background-size', ['cover', 'contain', 'auto'], 70), pick('background-position', ['center', 'top', 'bottom', 'left', 'right'])) : null,
            row('border', sideSeg),
            row('weight', numIn(getProp(bw), r1(num(cs.getPropertyValue(bw))), (v, live) => { setB('width', px(v), live); if (!live) renderInsp(); }, { step: 0.5, unit: 'px', title: 'line weight', k: 'bw' }), bsSel),
            row('', brc, brt, x(['width', 'style', 'color'].some(w => ['top', 'right', 'bottom', 'left'].some(s => getProp('border-' + s + '-' + w))), () => { const o = {}; ['top', 'right', 'bottom', 'left'].forEach(s => ['width', 'style', 'color'].forEach(w => { o['border-' + s + '-' + w] = null; })); setProps(o); renderInsp(); }, 'Borders back to how they were')),
            row('corners', numIn(getProp('border-radius'), r1(num(cs.borderTopLeftRadius)), (v, l) => { setProps({ 'border-radius': v === '' ? null : px(v) }, l); if (!l) renderInsp(); }, { k: 'rad', min: 0 }), x(getProp('border-radius'), () => { setProps({ 'border-radius': null }); renderInsp(); }))];
        out.push(section('FILL AND BORDER', has('background-color', 'background-image', 'border-radius') || ['top', 'right', 'bottom', 'left'].some(s => has('border-' + s + '-width', 'border-' + s + '-color', 'border-' + s + '-style')), ...fill));

        // EFFECTS
        const sh = /^(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?\s+(.+)$/.exec(getProp('box-shadow') || '') || [];
        const shadow = { x: sh[1] || '', y: sh[2] || '', b: sh[3] || '', s: sh[4] || '', c: sh[5] || '' };
        const setSh = (k, v, live) => { shadow[k] = v; const any = shadow.x !== '' || shadow.y !== '' || shadow.b !== '';
            setProps({ 'box-shadow': any ? num(shadow.x) + 'px ' + num(shadow.y) + 'px ' + Math.max(0, num(shadow.b)) + 'px ' + num(shadow.s) + 'px ' + (shadow.c || 'rgba(0,0,0,.35)') : null }, live); if (!live) renderInsp(); };
        const [shc, sht] = colorIn(shadow.c, 'rgba(0,0,0,.35)', (v, l) => setSh('c', v, l));
        const tf = getProp('transform') || '';
        const rot = (/rotate\((-?[\d.]+)deg\)/.exec(tf) || [])[1] || '', scl = (/scale\(([\d.]+)\)/.exec(tf) || [])[1] || '';
        const setTf = (r, s, l) => { const parts = []; if (r !== '' && num(r)) parts.push('rotate(' + num(r) + 'deg)'); if (s !== '' && num(s) !== 1) parts.push('scale(' + num(s) + ')'); setProps({ transform: parts.length ? parts.join(' ') : null }, l); if (!l) renderInsp(); };
        const fl = getProp('filter') || '', bf = getProp('backdrop-filter') || '';
        const blurOf = v => (/blur\(([\d.]+)px\)/.exec(v) || [])[1] || '';
        const eff = [row('opacity', numIn(getProp('opacity'), r2(num(cs.opacity)), (v, l) => { setProps({ opacity: v === '' ? null : String(Math.max(0, Math.min(1, num(v)))) }, l); if (!l) renderInsp(); }, { step: 0.05, min: 0, max: 1, k: 'op' }), x(getProp('opacity'), () => { setProps({ opacity: null }); renderInsp(); })),
            row('shadow x/y', numIn(shadow.x, '0', (v, l) => setSh('x', v, l), { w3: true, k: 'shx' }), numIn(shadow.y, '0', (v, l) => setSh('y', v, l), { w3: true, k: 'shy' }),
                h('span', { class: 'dbx-note', style: 'margin:0' }, 'blur'), numIn(shadow.b, '0', (v, l) => setSh('b', v, l), { w3: true, min: 0, k: 'shb' }), x(getProp('box-shadow'), () => { setProps({ 'box-shadow': null }); renderInsp(); })),
            row('shadow colour', shc, sht),
            row('blur', numIn(blurOf(fl), '0', (v, l) => { setProps({ filter: v === '' || !num(v) ? null : 'blur(' + num(v) + 'px)' }, l); if (!l) renderInsp(); }, { min: 0, k: 'blur', title: 'blurs the part itself' }),
                h('span', { class: 'dbx-note', style: 'margin:0' }, 'behind'), numIn(blurOf(bf), '0', (v, l) => { setProps({ 'backdrop-filter': v === '' || !num(v) ? null : 'blur(' + num(v) + 'px)', '-webkit-backdrop-filter': v === '' || !num(v) ? null : 'blur(' + num(v) + 'px)' }, l); if (!l) renderInsp(); }, { min: 0, k: 'bblur', title: 'frosts what is behind it; needs a see-through fill' })),
            row('turn', numIn(rot, '0', (v, l) => setTf(v, scl, l), { unit: '', k: 'rot', title: 'degrees' }), h('span', { class: 'dbx-note', style: 'margin:0' }, 'scale'), numIn(scl, '1', (v, l) => setTf(rot, v, l), { step: 0.05, unit: '', k: 'scl' })),
            row('blend', pick('mix-blend-mode', ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'exclusion', 'luminosity'])),
            row('pointer', pick('cursor', ['default', 'pointer', 'move', 'crosshair', 'text', 'grab', 'none']))];
        out.push(section('EFFECTS', has('opacity', 'box-shadow', 'filter', 'backdrop-filter', 'transform', 'mix-blend-mode', 'cursor'), ...eff));

        // ALL CSS
        const r = ruleFor(selSel, mediaNow(), false);
        const allRows = [];
        Object.keys(r ? r.props : {}).sort().forEach(p => {
            const v = h('input', { class: 'dbx-t dbx-mono set', value: r.props[p], spellcheck: false });
            v.dataset.k = 'css:' + p;
            v.addEventListener('input', () => { if (CSS.supports(p, v.value.trim()) || p.startsWith('--')) { v.classList.remove('bad'); setProps({ [p]: v.value.trim() }, true); } else v.classList.add('bad'); });
            v.addEventListener('change', () => { if (v.value.trim() === '') { setProps({ [p]: null }); renderInsp(); } });
            allRows.push(h('div', { class: 'dbx-row' }, h('span', { class: 'lb dbx-mono', style: 'flex:0 0 110px', title: p }, p), v, x(true, () => { setProps({ [p]: null }); renderInsp(); }, 'Remove')));
        });
        if (!allRows.length) allRows.push(h('div', { class: 'dbx-note' }, 'Nothing changed on it yet in this layout.'));
        const np = h('input', { class: 'dbx-t dbx-mono', list: 'dbx-props', placeholder: 'property', spellcheck: false, style: 'flex:0 0 110px' });
        const nv = h('input', { class: 'dbx-t dbx-mono', placeholder: 'value', spellcheck: false });
        np.addEventListener('change', () => { const p = np.value.trim(); if (p && !nv.value) nv.placeholder = cs.getPropertyValue(p) || 'value'; });
        const addIt = () => { const p = np.value.trim().toLowerCase(), v = nv.value.trim(); if (!p || !v) return; if (!p.startsWith('--') && !CSS.supports(p, v)) { nv.classList.add('bad'); toast('The browser does not take “' + v + '” for ' + p + '.'); return; } setProps({ [p]: v }); renderInsp(); };
        nv.addEventListener('keydown', e => { if (e.key === 'Enter') addIt(); });
        allRows.push(h('div', { class: 'dbx-row', style: 'margin-top:4px' }, np, nv, h('button', { class: 'dbx-btn', onclick: addIt }, '+')),
            h('div', { class: 'dbx-note' }, 'Any CSS property. Shown at once, kept for ' + (both ? 'desktop and phone' : isPhone() ? 'the phone layout' : 'the desktop layout') + '.'));
        out.push(section('ALL CSS', !!(r && Object.keys(r.props).length), ...allRows));
        return out;
    }
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
        commit(); renderInsp();
    }

    // ═════════════════════════════════════════════════════════════════════
    // THE TOOLBAR
    // ═════════════════════════════════════════════════════════════════════
    const bar = ui('div', { id: 'dbx-bar' });
    document.body.appendChild(bar);
    keepKeys(bar);
    const DOCK_TABS = PAGE ? ['OUTLINE', 'TYPE', 'COLOUR', 'LINES', 'CSS', 'SAVE'] : ['OUTLINE', 'MAP', 'TYPE', 'COLOUR', 'LINES', 'CSS', 'SAVE'];
    let dockTab = LS.get('dbx-dock', '');
    if (dockTab && DOCK_TABS.indexOf(dockTab) < 0) dockTab = '';
    const stable = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, kk) => { a[kk] = v[kk]; return a; }, {}) : v);
    let pubSnap = stable(R.norm(clone(R.BAKED)));
    const dirty = () => stable(S()) !== pubSnap;
    function countChanges(s) {
        const n = o => Object.keys(o || {}).length;
        return n(s.colors) + n(s.fonts) + n(s.sizes) + n(s.weights) + n(s.widths) + n(s.vars) + s.rules.length + (s.texts || []).length + (s.added || []).length +
            (s.dups || []).length + (s.css && s.css.trim() ? 1 : 0) + n(s.map.layers) + (s.map.order || []).length + ((+s.map.lineWidth || 1) !== 1 ? 1 : 0) + s.fontFiles.length + s.googleFonts.length;
    }
    let menu = null;
    function closeMenu() { if (menu) { menu.remove(); menu = null; } }
    document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target) && !e.target.closest('.dbx-addbtn')) closeMenu(); }, true);
    function openAddMenu(btn) {
        if (menu) { closeMenu(); return; }
        const b = btn.getBoundingClientRect();
        const item = (k, t, inside) => h('button', { onclick: () => { closeMenu(); addPart(k, inside); } }, t);
        menu = ui('div', { class: 'dbx-menu', style: `left:${b.left}px;top:${b.bottom + 2}px` },
            h('div', { class: 'lab' }, 'ON THE PAGE'), item('text', 'Text'), item('image', 'Image'), item('box', 'Box'), item('link', 'Link'));
        if (selEl && !fixedEl(selEl) && !(addedOf(selEl) && addedOf(selEl).kind === 'image')) menu.append(h('div', { class: 'lab' }, 'INSIDE ' + partName(selEl, selSel).toUpperCase().slice(0, 26)),
            item('text', 'Text', true), item('image', 'Image', true), item('box', 'Box', true), item('link', 'Link', true));
        if (selEl && !fixedEl(selEl)) menu.append(h('div', { class: 'lab' }, 'THE PICKED PART'), h('button', { onclick: () => { closeMenu(); duplicate(); } }, 'A copy of it   Ctrl+D'));
        document.body.appendChild(menu);
    }
    function renderBar() {
        if (closed) { bar.hidden = true; return; }
        bar.hidden = false;
        bar.textContent = '';
        const grip = h('div', { class: 'grip', title: 'Move the toolbar' });
        const tb = (label, on, fn, title, key) => h('button', { class: 'dbx-tb' + (on ? ' on' : ''), title: title || '', onclick: fn }, label, key ? h('kbd', null, key) : null);
        const d = dirty();
        bar.append(grip,
            tb('SELECT', selMode, () => setSelMode(!selMode), 'Click a part to pick it, drag to move it, drag the squares to resize. Alt-click picks what it sits in. Double-click words to change them.', 'V'),
            tb('TEXT', textMode, () => setTextMode(!textMode), 'Click any words on the page to change them', 'T'),
            (() => { const b = tb('+ ADD', !!menu, () => openAddMenu(b), 'Add text, a picture, a box or a link'); b.classList.add('dbx-addbtn'); return b; })(),
            h('span', { class: 'sep' }),
            ...DOCK_TABS.filter(t => t !== 'SAVE').map(t => tb(t, dockTab === t, () => openDock(dockTab === t ? '' : t))),
            h('span', { class: 'sep' }),
            h('button', { class: 'dbx-tb', title: 'Undo  Ctrl+Z', disabled: hi <= 0, onclick: () => go(-1) }, '↶'),
            h('button', { class: 'dbx-tb', title: 'Redo  Ctrl+Shift+Z', disabled: hi >= hist.length - 1, onclick: () => go(1) }, '↷'),
            (() => { const b = h('button', { class: 'dbx-tb' + (R.off ? ' on' : ''), title: 'Hold to see the site without your changes' }, 'BEFORE');
                const hold = on => { R.off = on; b.classList.toggle('on', on); };
                b.addEventListener('pointerdown', e => { e.preventDefault(); hold(true); });
                ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => { if (R.off) hold(false); }));
                return b; })(),
            h('span', { class: 'st' + (d ? ' dirty' : ''), title: d ? 'Your draft differs from what the site shows' : 'Your draft is what the site shows' }, countChanges(S()) + ' changes · ' + (d ? 'not on the site yet' : 'as on the site')),
            h('button', { class: 'dbx-tb pub' + (d ? ' dirty' : '') + (dockTab === 'SAVE' ? ' on' : ''), title: PAGE ? 'Save this page’s style' : 'Put your changes on the site', onclick: () => { if (!PAGE && ghReady() && d) publish(); else openDock('SAVE'); } }, PAGE ? 'SAVE' : 'SAVE TO SITE'),
            h('button', { class: 'dbx-tb', title: 'Close the editor (your changes stay in the draft)', onclick: () => closeEditor(true) }, '×'));
        if (editing) bar.append(h('span', { class: 'st dirty' }, 'Typing… Enter keeps it, Esc undoes'));
    }
    movable(bar, bar, 'dbx-bar-pos');
    function badge() { renderBar(); }

    const pill = ui('button', { id: 'dbx-pill', hidden: true, onclick: () => closeEditor(false) }, 'EDIT');
    document.body.appendChild(pill);
    function closeEditor(on) {
        closed = on;
        if (on) { if (editing) endTextEdit(true); setSelMode(false); setTextMode(false); setPickMap(false); closeMenu(); }
        pill.hidden = !on;
        document.documentElement.classList.remove('dbx-sel', 'dbx-txt', 'dbx-pickmap');
        render();
    }

    // ═════════════════════════════════════════════════════════════════════
    // THE PANEL at the side
    // ═════════════════════════════════════════════════════════════════════
    const dock = ui('div', { id: 'dbx-dock', hidden: true });
    const dockHead = h('div', { class: 'dbx-head', style: 'cursor:default' });
    const dockTabsEl = h('div', { class: 'dbx-tabs' });
    const dockBody = h('div', { class: 'dbx-body' });
    dock.append(dockHead, dockTabsEl, dockBody);
    document.body.appendChild(dock);
    keepKeys(dock);
    if (LS.get('dbx-dock-left', false)) dock.classList.add('left');
    function openDock(t) {
        dockTab = t; LS.set('dbx-dock', t);
        renderDock(); renderBar(); placeInsp();
    }
    function renderDock() {
        if (closed || !dockTab) { dock.hidden = true; return; }
        dock.hidden = false;
        if (!isPhone()) dock.style.top = (bar.hidden ? 8 : bar.getBoundingClientRect().bottom + 6) + 'px';
        dockHead.textContent = '';
        dockHead.append(h('b', null, dockTab),
            h('button', { class: 'dbx-ib', title: 'Put the panel on the other side', onclick: () => { dock.classList.toggle('left'); LS.set('dbx-dock-left', dock.classList.contains('left')); placeInsp(); } }, '⇋'),
            h('button', { class: 'dbx-ib', title: 'Close the panel', onclick: () => openDock('') }, '×'));
        dockTabsEl.textContent = '';
        DOCK_TABS.forEach(t => dockTabsEl.appendChild(h('button', { class: 'dbx-tab', 'aria-selected': String(t === dockTab), onclick: () => openDock(t) }, t)));
        const foc = document.activeElement && dock.contains(document.activeElement) ? document.activeElement.dataset.k : null;
        const y = dockBody.scrollTop;
        dockBody.textContent = '';
        const f = { OUTLINE: renderOutline, MAP: renderMap, TYPE: renderType, COLOUR: renderColour, LINES: renderLines, CSS: renderCss, SAVE: renderSave }[dockTab];
        try { [].concat(f()).forEach(n => n && dockBody.appendChild(n)); }
        catch (e) { console.error(e); dockBody.appendChild(h('div', { class: 'dbx-note dbx-err' }, 'Something went wrong drawing this: ' + e.message)); }
        dockBody.scrollTop = y;
        if (foc) { const el = dockBody.querySelector('[data-k="' + CSS.escape(foc) + '"]'); if (el) el.focus(); }
    }

    // ═════════════════════════════════════════════════════════════════════
    // OUTLINE: every part of the page, as a tree
    // ═════════════════════════════════════════════════════════════════════
    const OPEN_EL = new WeakSet();
    const SKIP = /^(script|style|link|meta|noscript|template|br|wbr)$/i;
    const kidsOf = el => [...el.children].filter(k => !ours(k) && !SKIP.test(k.tagName) && !(k.id === 'dbx-ov'));
    let outlineFilter = '';
    function renderOutline() {
        const out = [];
        const s = S();
        const fIn = h('input', { class: 'dbx-t', placeholder: 'find a part by name, words, id or class', value: outlineFilter, spellcheck: false });
        fIn.dataset.k = 'ofilter';
        fIn.addEventListener('input', () => { outlineFilter = fIn.value; renderDock(); });
        out.push(h('div', { class: 'dbx-row' }, fIn, h('button', { class: 'dbx-btn', onclick: () => renderDock() }, 'refresh')));
        if (s.added.length || s.dups.length) {
            out.push(h('div', { class: 'dbx-h' }, 'ADDED BY YOU'));
            s.added.forEach(a => { const el = document.getElementById(a.id); out.push(h('div', { class: 'dbx-li' + (el && el === selEl ? ' set' : '') }, h('span', { class: 'nm', style: 'cursor:pointer', onclick: () => el && select(el) }, KIND[a.kind], h('small', null, (a.text || a.src || '').slice(0, 30))),
                h('button', { class: 'dbx-btn', onclick: () => { if (el) { select(el); removeSel(); } } }, 'delete'))); });
            s.dups.forEach(d => { const el = document.getElementById(d.id); out.push(h('div', { class: 'dbx-li' }, h('span', { class: 'nm', style: 'cursor:pointer', onclick: () => el && select(el) }, 'Copy', h('small', null, d.of)),
                h('button', { class: 'dbx-btn', onclick: () => { if (el) { select(el); removeSel(); } else { s.dups = s.dups.filter(x => x !== d); commit(); renderDock(); } } }, 'delete'))); });
        }
        const hidden = s.rules.filter(r => r.props.display === 'none');
        if (hidden.length) {
            out.push(h('div', { class: 'dbx-h' }, 'HIDDEN'));
            hidden.forEach(r => out.push(h('div', { class: 'dbx-li' }, h('span', { class: 'nm dbx-mono', title: r.sel }, r.sel), h('span', { class: 'ct' }, r.media),
                h('button', { class: 'dbx-btn', onclick: () => { delete r.props.display; prune(); commit(); renderDock(); renderInsp(); } }, 'show'))));
        }
        out.push(h('div', { class: 'dbx-h' }, 'THE PAGE'));
        if (selEl) { let a = selEl.parentElement; while (a && a !== document.body) { OPEN_EL.add(a); a = a.parentElement; } }
        const tree = h('div', { class: 'dbx-tree' });
        const q = outlineFilter.trim().toLowerCase();
        const edited = el => s.rules.some(r => { try { return el.matches(r.sel); } catch (e) { return false; } });
        const rowOf = (el, depth) => {
            const ks = el.tagName.toLowerCase() === 'svg' ? [] : kidsOf(el);
            const open = OPEN_EL.has(el);
            const off = getComputedStyle(el).display === 'none';
            const c = [...el.classList].filter(c => !STATE_CLS.test(c))[0];
            const nd = h('div', { class: 'nd' + (el === selEl ? ' sel' : '') + (off ? ' off' : '') + (edited(el) ? ' ed' : ''), style: 'padding-left:' + (depth * 11) + 'px' },
                h('span', { class: 'tw', onclick: e => { e.stopPropagation(); if (open) OPEN_EL.delete(el); else OPEN_EL.add(el); renderDock(); } }, ks.length ? h('i', { class: 'tri' + (open ? ' open' : '') }) : null),
                h('b', null, partName(el, '').replace(/ “.*$/, '')),
                h('small', null, (el.id ? '#' + el.id : el.tagName.toLowerCase() + (c ? '.' + c : '')) + (R.ownText(el) ? ' “' + R.ownText(el).slice(0, 30) + '”' : '')),
                fixedEl(el) ? null : h('button', { class: 'eye', title: off ? 'Show it' : 'Hide it (only this one)', onclick: e => {
                    e.stopPropagation();
                    const r = ruleFor(selOne(el), mediaNow(), true);
                    if (r.props.display === 'none') delete r.props.display; else r.props.display = 'none';
                    prune(); commit(); renderDock(); } }, off ? '◌' : '●'));
            nd.addEventListener('click', () => { scopeOne = false; select(el); const b = el.getBoundingClientRect(); if (b.bottom < 0 || b.top > innerHeight) el.scrollIntoView({ block: 'center' }); });
            nd.addEventListener('mouseenter', () => { hovEl = el; });
            nd.addEventListener('mouseleave', () => { if (hovEl === el) hovEl = null; });
            tree.appendChild(nd);
            if (open) { ks.slice(0, 80).forEach(k => rowOf(k, depth + 1)); if (ks.length > 80) tree.appendChild(h('div', { class: 'dbx-note', style: 'padding-left:' + ((depth + 1) * 11) + 'px' }, '… and ' + (ks.length - 80) + ' more')); }
        };
        if (q) {
            const found = [...document.body.querySelectorAll('*')].filter(el => !ours(el) && !SKIP.test(el.tagName) && !(el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg')
                && ((el.id || '').toLowerCase().includes(q) || [...el.classList].some(c => c.toLowerCase().includes(q)) || R.ownText(el).toLowerCase().includes(q) || partName(el, '').toLowerCase().includes(q))).slice(0, 150);
            found.forEach(el => { const n0 = tree.childElementCount; rowOf(el, 0); for (let i = n0 + 1; i < tree.childElementCount; i++) tree.children[i].remove(); });
            if (!found.length) out.push(h('div', { class: 'dbx-note' }, 'Nothing found.'));
        } else kidsOf(document.body).forEach(k => rowOf(k, 0));
        out.push(tree, h('div', { class: 'dbx-note' }, 'Click a line to pick that part, even when it is folded away on the page. ● hides it.'));
        return out;
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
        return [...set].filter(f => !/^(inherit|initial|sans-serif|serif|monospace|ui-monospace)$/.test(f));
    }
    const famValue = (f, orig) => '"' + f + '", ' + (/mono|courier/i.test(orig) ? 'monospace' : 'sans-serif');
    let invCache = null, invAt = 0;
    function inventory() {
        if (invCache && Date.now() - invAt < 1500) return invCache;
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
            if (/^#dbx|dbx-|data-dbx/.test(sel)) return;
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
        document.querySelectorAll('[fill],[stroke]').forEach(el => {
            if (ours(el)) return;
            ['fill', 'stroke'].forEach(a => { const v = el.getAttribute(a); if (v && v !== 'none') col(v, null, 'ui'); });
        });
        const L = R.layers;
        const walk = (e, f) => { if (typeof e === 'string') f(e); else if (Array.isArray(e)) e.forEach(x => walk(x, f)); };
        Object.keys(L).forEach(id => Object.keys(L[id].paint || {}).forEach(p => { if (/-color$/.test(p)) walk(L[id].paint[p], s => col(s, 'map: ' + id, 'map')); }));
        invCache = { fams, sizes, weights, widths, colors, where }; invAt = Date.now();
        return invCache;
    }

    // ── TYPE ────────────────────────────────────────────────────────────
    function renderType() {
        const inv = inventory();
        const s = S();
        const out = [h('div', { class: 'dbx-note' }, 'Each line is something the site uses. Change it here and it changes everywhere. To change one part only, pick it with ', h('b', null, 'SELECT'), '.')];
        out.push(h('div', { class: 'dbx-h' }, 'TYPEFACES'));
        const opts = familyOptions();
        [...inv.fams.entries()].sort((a, b) => b[1] - a[1]).forEach(([f, n]) => {
            if (/^(inherit|initial|sans-serif|serif|monospace|ui-monospace)$/.test(f)) return;
            const to = s.fonts[f];
            const sl = sel(opts.filter(o => o !== f), to || '', 'keep', v => { if (v) s.fonts[f] = v; else delete s.fonts[f]; commit(); renderDock(); }, 'flex:0 0 118px');
            out.push(h('div', { class: 'dbx-li' + (to ? ' set' : '') },
                h('span', { class: 'dbx-sample', style: 'font-family:"' + (to || f) + '"', title: f + ' · used in ' + n + ' rules' }, f, h('small', { style: 'font:9.5px Plex,sans-serif;color:#999;margin-left:6px' }, to ? '→ ' + to : n + '×')),
                sl, x(to, () => { delete s.fonts[f]; commit(); renderDock(); })));
        });
        const gIn = h('input', { class: 'dbx-t', placeholder: 'Google Fonts name, e.g. Inter' });
        out.push(h('div', { class: 'dbx-h' }, 'ADD A TYPEFACE'));
        out.push(h('div', { class: 'dbx-row' }, gIn, h('button', { class: 'dbx-btn', onclick: () => {
            const v = gIn.value.trim(); if (!v) return;
            const spec = /:/.test(v) ? v : v + ':ital,wght@0,100..900;1,100..900';
            if (s.googleFonts.indexOf(spec) < 0) s.googleFonts.push(spec);
            commit(); renderDock(); toast(v + ' added: it is now in every typeface list.'); } }, 'add')));
        const file = h('input', { type: 'file', accept: '.woff2,.woff,.ttf,.otf', style: 'display:none' });
        file.addEventListener('change', () => {
            const f = file.files[0]; if (!f) return;
            const rd = new FileReader();
            rd.onload = () => {
                const family = f.name.replace(/\.(woff2?|ttf|otf)$/i, '').replace(/[-_](regular|light|thin|medium|book|\d00)$/i, '').replace(/[-_]+/g, ' ');
                const weight = /thin|100/i.test(f.name) ? 100 : /extralight|200/i.test(f.name) ? 200 : /light|300/i.test(f.name) ? 300 : /medium|500/i.test(f.name) ? 500 : /semibold|600/i.test(f.name) ? 600 : /bold|700/i.test(f.name) ? 700 : 400;
                const ext = f.name.split('.').pop().toLowerCase();
                s.fontFiles.push({ family, weight, src: rd.result, format: ext === 'ttf' ? 'truetype' : ext === 'otf' ? 'opentype' : ext, file: f.name });
                commit(); renderDock();
            };
            rd.readAsDataURL(f);
        });
        out.push(h('div', { class: 'dbx-row' }, h('button', { class: 'dbx-btn', onclick: () => file.click() }, 'upload a font file…'), file,
            h('span', { class: 'dbx-note', style: 'margin:0' }, '.woff2 .woff .ttf .otf')));
        s.googleFonts.forEach((g, i) => out.push(h('div', { class: 'dbx-li' }, h('span', { class: 'nm', style: 'font-family:"' + g.split(':')[0] + '"' }, g.split(':')[0], h('small', null, 'Google Fonts')),
            x(true, () => { s.googleFonts.splice(i, 1); commit(); renderDock(); }, 'Remove'))));
        s.fontFiles.forEach((f, i) => {
            const w = numIn(f.weight, '400', v => { f.weight = Math.round(num(v)) || 400; commit(); }, { w4: true, title: 'weight this file is', step: 100 });
            out.push(h('div', { class: 'dbx-li' }, h('span', { class: 'nm', style: 'font-family:"' + f.family + '"' }, f.family, h('small', null, f.file || 'file')), w,
                x(true, () => { s.fontFiles.splice(i, 1); commit(); renderDock(); }, 'Remove')));
        });
        out.push(h('div', { class: 'dbx-h' }, 'TYPE SIZES'));
        [...inv.sizes.entries()].filter(([k]) => /px$/.test(k) && num(k) > 0).sort((a, b) => num(a[0]) - num(b[0])).forEach(([k, n]) => {
            const to = s.sizes[k];
            const i = numIn(to || '', k, (v, live) => { if (v) s.sizes[k] = px(v); else delete s.sizes[k]; commit(live); if (!live) renderDock(); }, { step: 0.5, unit: 'px', k: 'size:' + k });
            const r = h('div', { class: 'dbx-li' + (to ? ' set' : '') }, h('span', { class: 'nm', style: 'font-size:' + Math.min(18, num(to || k)) + 'px' }, k, h('small', null, n + '×')),
                h('span', { class: 'ct' }, '→'), i, x(to, () => { delete s.sizes[k]; commit(); renderDock(); }));
            scrub(r.firstChild, i);
            out.push(r);
        });
        out.push(h('div', { class: 'dbx-h' }, 'WEIGHTS'));
        [...inv.weights.entries()].sort().forEach(([k, n]) => {
            const to = s.weights[k];
            const sl = sel(['100', '200', '300', '400', '500', '600', '700', '800', '900'], to || '', 'keep', v => { if (v) s.weights[k] = v; else delete s.weights[k]; commit(); renderDock(); }, 'flex:0 0 70px');
            out.push(h('div', { class: 'dbx-li' + (to ? ' set' : '') }, h('span', { class: 'nm', style: 'font-weight:' + (to || k) }, k, h('small', null, n + '×')), sl, x(to, () => { delete s.weights[k]; commit(); renderDock(); })));
        });
        out.push(h('div', { class: 'dbx-note' }, 'A weight shows only if the typeface has it: Plex here has 400 and 500, Cutive Mono only 400. Drag a size’s name sideways to change it.'));
        return out;
    }

    // ── COLOUR ──────────────────────────────────────────────────────────
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
        const out = [h('div', { class: 'dbx-note' }, 'A colour changed here changes everywhere it is used, on the page and on the map, as you drag. Untick ', h('b', null, 'map'), ' or ', h('b', null, 'page'), ' to keep it in one of them.')];
        const line = r => {
            const entry = s.colors[r.k];
            const to = entry ? (typeof entry === 'string' ? entry : entry.to) : '';
            const uiOn = !entry || entry.ui !== false, mp = !entry || entry.map !== false;
            const set = (patch) => { const e = Object.assign({ to: to || r.k, ui: uiOn, map: mp }, patch); if (!e.to || (R.colorKey(e.to) === r.k && e.ui && e.map)) delete s.colors[r.k]; else s.colors[r.k] = e; };
            const [c, t] = colorIn(to, r.k, (v, live) => { set({ to: v }); commit(live); if (!live) renderDock(); });
            t.dataset.k = 'col:' + r.k;
            const names = [...r.c.vars].map(v => { const n = v.split(' ').pop(); return VAR_NAMES[n] || n; });
            const where = inv.where.get(r.k);
            const cb = (on, lab, key) => h('label', { style: 'display:flex;align-items:center;gap:2px;font-size:9.5px;color:#777;cursor:pointer', title: lab === 'page' ? 'Change it on the page' : 'Change it on the map' },
                h('input', { type: 'checkbox', checked: on, style: 'margin:0;accent-color:#00f', onchange: e => { set({ [key]: e.target.checked }); commit(); renderDock(); } }), lab);
            return h('div', { class: 'dbx-li' + (entry ? ' set' : ''), title: where ? [...where].join('\n') : '' },
                h('span', { class: 'dbx-sw', style: 'flex:0 0 22px' }, h('i', { style: 'background:' + r.k + ';right:50%' }), h('i', { style: 'background:' + (to || r.k) + ';left:50%' })),
                h('span', { class: 'nm' }, names.length ? names.join(', ') : h('span', { class: 'dbx-mono' }, r.k), h('small', null, (r.c.ui ? r.c.ui + ' page' : '') + (r.c.ui && r.c.map ? ' · ' : '') + (r.c.map ? r.c.map + ' map' : ''))),
                c, t, entry ? cb(uiOn, 'page', 'ui') : null, entry && !PAGE ? cb(mp, 'map', 'map') : null, x(entry, () => { delete s.colors[r.k]; commit(); renderDock(); }));
        };
        if (named.length) { out.push(h('div', { class: 'dbx-h' }, 'NAMED COLOURS')); named.forEach(r => out.push(line(r))); }
        out.push(h('div', { class: 'dbx-h' }, 'EVERY OTHER COLOUR'));
        other.forEach(r => out.push(line(r)));
        out.push(h('div', { class: 'dbx-note' }, 'The map’s site symbols take a new colour when the page is reloaded.'),
            h('button', { class: 'dbx-btn', onclick: () => location.reload() }, 'reload now'));
        return out;
    }

    // ── LINES ───────────────────────────────────────────────────────────
    function renderLines() {
        const inv = inventory();
        const s = S();
        const out = [h('div', { class: 'dbx-h' }, 'PAGE LINES')];
        const hl = s.vars['--hl'];
        const hli = numIn(hl || '', r1(num(getComputedStyle(document.documentElement).getPropertyValue('--hl'))), (v, l) => { if (v) s.vars['--hl'] = px(v); else delete s.vars['--hl']; commit(l); if (!l) renderDock(); }, { step: 0.25, unit: 'px', k: 'hl' });
        const r0 = h('div', { class: 'dbx-li' + (hl ? ' set' : '') }, h('span', { class: 'nm' }, 'hairline', h('small', null, 'one screen pixel, set by the page')), hli, x(hl, () => { delete s.vars['--hl']; commit(); renderDock(); }));
        scrub(r0.firstChild, hli); out.push(r0);
        [...inv.widths.entries()].sort((a, b) => num(a[0]) - num(b[0])).forEach(([k, n]) => {
            const to = s.widths[k];
            const i = numIn(to || '', k, (v, l) => { if (v) s.widths[k] = /^[\d.]+$/.test(v) && /px$/.test(k) ? v + 'px' : v; else delete s.widths[k]; commit(l); if (!l) renderDock(); }, { step: 0.25, unit: /px$/.test(k) ? 'px' : '', k: 'w:' + k });
            const r = h('div', { class: 'dbx-li' + (to ? ' set' : '') },
                h('span', { class: 'nm' }, h('span', { style: 'display:inline-block;vertical-align:middle;width:26px;height:0;margin-right:6px;border-top:' + Math.max(0.5, num(to || k)) + 'px solid #000' }), k, h('small', null, n + '×')),
                h('span', { class: 'ct' }, '→'), i, x(to, () => { delete s.widths[k]; commit(); renderDock(); }));
            scrub(r.firstChild, i); out.push(r);
        });
        out.push(h('div', { class: 'dbx-note' }, 'Every border, rule and outline on the page that has this weight. 0.5 px is the half-pixel the page uses on most frames. Drag a name sideways to change it.'));
        if (!PAGE) {
            out.push(h('div', { class: 'dbx-h' }, 'MAP LINES'));
            out.push(mapLineAll());
            out.push(h('div', { class: 'dbx-note' }, 'Each map line on its own, and every other property of the map: ', h('button', { class: 'dbx-btn', onclick: () => openDock('MAP') }, 'MAP')));
        }
        return out;
    }

    // ── CSS ─────────────────────────────────────────────────────────────
    let cssT = 0;
    function renderCss() {
        const s = S();
        const ta = h('textarea', { class: 'dbx-ta big', spellcheck: false, placeholder: '/* Any CSS. Shown as you type, and saved with the rest.\n   e.g.\n#deck { box-shadow: 0 0 0 4px #00f; }\n@media (max-width:760px) { .status-strip { display:none } } */' }, s.css || '');
        ta.dataset.k = 'freecss';
        ta.addEventListener('input', () => { clearTimeout(cssT); cssT = setTimeout(() => { s.css = ta.value; commit(true); }, 250); });
        ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); const p = ta.selectionStart; ta.setRangeText('  ', p, ta.selectionEnd, 'end'); } });
        const gen = h('textarea', { class: 'dbx-ta', readonly: true, style: 'height:180px;color:#555' }, R.buildCss(true) || '/* nothing yet */');
        return [h('div', { class: 'dbx-note' }, 'Free CSS, written by hand. It comes last, so it wins over everything else.'), ta,
            h('details', { class: 'dbx-sec', style: 'margin-top:10px' }, h('summary', null, h('i', { class: 'tri' }), 'THE CSS YOUR CHANGES MAKE'), h('div', { class: 'in' }, gen,
                h('button', { class: 'dbx-btn', style: 'margin-top:4px', onclick: () => { navigator.clipboard.writeText(gen.value); toast('Copied.'); } }, 'copy')))];
    }

    // ═════════════════════════════════════════════════════════════════════
    // MAP: every layer, every property, in the order they are drawn
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
    const groupOf = id => /^(satellite|graytone|relief|bym|historical|hillshade|dem)/.test(id) ? 'background'
        : /^dod.*contour|^dod-in-/.test(id) ? 'contours' : /^dod/.test(id) ? 'terrain change' : /^(fp-|site-)/.test(id) ? 'sites'
        : /^flow/.test(id) ? 'flows' : /^cov-/.test(id) ? 'plans' : /^prof-/.test(id) ? 'tools' : '';
    const layerName = id => LAYER_NAMES[id] || (/^dodold-/.test(id) ? 'Terrain change · older survey · ' + id.slice(7) : /^dod-hit/.test(id) ? 'Terrain change · click areas' + (id.length > 7 ? ' · ' + id.slice(8) : '') : /^dod-/.test(id) ? 'Terrain change · ' + id.slice(4) : id);
    const openLayers = new Set(LS.get('dbx-open-layers', []));
    const openAll = new Set(), jsonOpen = new Set();
    let mapFilter = '', found = [];
    const saveOpen = () => LS.set('dbx-open-layers', [...openLayers]);
    function updLayer(id, patch, live) {
        const s = S();
        const cur = Object.assign({}, s.map.layers[id] || {}, patch);
        Object.keys(cur).forEach(k => { const v = cur[k]; if (v === undefined || v === null || v === '' || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) || ((k === 'width' || k === 'opacity' || k === 'size') && +v === 1)) delete cur[k]; });
        if (Object.keys(cur).length) s.map.layers[id] = cur; else delete s.map.layers[id];
        commit(live);
    }
    function mapLineAll() {
        const s = S();
        const lw = +s.map.lineWidth || 1;
        const rng = h('input', { type: 'range', class: 'dbx-r', min: 0.2, max: 4, step: 0.05, value: lw });
        const n = numIn(lw === 1 ? '' : lw, '1', (v, l) => { s.map.lineWidth = num(v) || 1; rng.value = s.map.lineWidth; commit(l); }, { step: 0.05, w4: true, k: 'lwall' });
        rng.addEventListener('input', () => { s.map.lineWidth = +rng.value; n.value = rng.value; n.classList.add('set'); commit(true); });
        return h('div', { class: 'dbx-li' + (lw !== 1 ? ' set' : '') }, h('span', { class: 'nm', style: 'flex:0 0 86px' }, 'all lines ×'), rng, n, x(lw !== 1, () => { s.map.lineWidth = 1; commit(); renderDock(); }));
    }
    function mapPickAt(e) {
        const m = R.map; if (!m) return;
        const rc = m.getCanvas().getBoundingClientRect();
        const p = [e.clientX - rc.left, e.clientY - rc.top];
        let feats = [];
        try { feats = m.queryRenderedFeatures([[p[0] - 5, p[1] - 5], [p[0] + 5, p[1] + 5]]); } catch (er) {}
        const ids = [];
        feats.forEach(f => { if (f.layer && ids.indexOf(f.layer.id) < 0) ids.push(f.layer.id); });
        // Pictures under it (they are not features).
        R.layerIds().slice().reverse().forEach(id => { const l = m.getLayer(id); if (l && /raster|hillshade|background/.test(l.type) && m.getLayoutProperty(id, 'visibility') !== 'none' && ids.indexOf(id) < 0) ids.push(id); });
        found = ids;
        ids.slice(0, 2).forEach(id => openLayers.add(id)); saveOpen();
        setPickMap(false);
        openDock('MAP');
        setTimeout(() => { const d = dockBody.querySelector('.dbx-det.found'); if (d) d.scrollIntoView({ block: 'start' }); }, 30);
        toast(ids.length ? ids.length + ' layer' + (ids.length > 1 ? 's' : '') + ' there, marked yellow.' : 'Nothing drawn there.');
    }
    function moveLayerTo(id, before) {
        const s = S();
        s.map.order = (s.map.order || []).filter(o => o[0] !== id);
        s.map.order.push([id, before || null]);
        commit(); R.applyNow(); renderDock();
    }
    let dragId = null, idsSig = '';
    function renderMap() {
        const m = R.map;
        if (!m) return [h('div', { class: 'dbx-note' }, 'The map has not started yet.')];
        const s = S();
        const all = R.layerIds().slice().reverse();          // top first
        idsSig = all.join('|');
        const fIn = h('input', { class: 'dbx-t', placeholder: 'find a layer', value: mapFilter, spellcheck: false });
        fIn.dataset.k = 'mfilter';
        fIn.addEventListener('input', () => { mapFilter = fIn.value; renderDock(); });
        const out = [h('div', { class: 'dbx-row' }, h('button', { class: 'dbx-btn' + (pickMap ? ' on' : ''), title: 'Then click the map: the layers drawn at that spot open here', onclick: () => setPickMap(!pickMap) }, pickMap ? 'click the map…' : '⌖ pick on the map'), fIn,
                h('button', { class: 'dbx-btn', title: 'Fold every layer', onclick: () => { openLayers.clear(); saveOpen(); found = []; renderDock(); } }, 'fold')),
            mapLineAll()];
        if ((s.map.order || []).length) out.push(h('div', { class: 'dbx-row' }, h('span', { class: 'dbx-note', style: 'flex:1;margin:0' }, s.map.order.length + ' layer' + (s.map.order.length > 1 ? 's' : '') + ' moved in the order.'),
            h('button', { class: 'dbx-btn', onclick: () => { s.map.order = []; commit(); R.applyNow(); renderDock(); } }, 'order as it was')));
        out.push(h('div', { class: 'dbx-note' }, 'Top of the map first. Drag a layer by ⠿ to draw it above or below the others. Layers that come later (contours, flows, a run) appear here as soon as the site switches them on.'));
        const q = mapFilter.trim().toLowerCase();
        all.forEach((id, idx) => {
            const l = m.getLayer(id); if (!l) return;
            if (q && !(id.toLowerCase().includes(q) || layerName(id).toLowerCase().includes(q) || groupOf(id).includes(q) || l.type.includes(q))) return;
            const L = s.map.layers[id] || {};
            const set = Object.keys(L).length > 0 || (s.map.order || []).some(o => o[0] === id);
            const det = h('details', { class: 'dbx-det' + (found.indexOf(id) >= 0 ? ' found' : ''), open: openLayers.has(id) });
            const vis = m.getLayoutProperty(id, 'visibility') !== 'none';
            const eye = h('input', { type: 'checkbox', checked: !L.hide, title: L.hide ? 'Hidden always (tick to give it back to the site)' : 'Untick to hide it always' + (vis ? '' : ' — the site has it off right now'), style: 'margin:0;accent-color:#00f',
                onclick: e => e.stopPropagation(), onchange: e => { updLayer(id, { hide: e.target.checked ? undefined : true }); renderDock(); } });
            const grip = h('span', { draggable: 'true', title: 'Drag up or down', style: 'cursor:grab;color:#999;padding:0 2px;font-size:12px' }, '⠿');
            grip.addEventListener('dragstart', e => { dragId = id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch (er) {} });
            grip.addEventListener('dragend', () => { dragId = null; dockBody.querySelectorAll('.drop-above,.drop-below').forEach(d => d.classList.remove('drop-above', 'drop-below')); });
            det.addEventListener('dragover', e => { if (!dragId || dragId === id) return; e.preventDefault(); const b = det.getBoundingClientRect(); const above = e.clientY < b.top + Math.min(b.height, 26) / 2;
                det.classList.toggle('drop-above', above); det.classList.toggle('drop-below', !above); });
            det.addEventListener('dragleave', () => det.classList.remove('drop-above', 'drop-below'));
            det.addEventListener('drop', e => {
                e.preventDefault();
                const above = det.classList.contains('drop-above');
                det.classList.remove('drop-above', 'drop-below');
                if (!dragId || dragId === id) return;
                const T = all.filter(x => x !== dragId);
                const j = T.indexOf(id);
                // moveLayer(a, b) draws a just under b: b is the row shown just above the new slot.
                const before = above ? (j > 0 ? T[j - 1] : null) : id;
                moveLayerTo(dragId, before);
            });
            const up = h('button', { class: 'dbx-x', title: 'Draw it above the next one', onclick: e => { e.preventDefault(); e.stopPropagation(); if (idx === 0) return; moveLayerTo(id, idx >= 2 ? all[idx - 2] : null); } }, '▲');
            const dn = h('button', { class: 'dbx-x', title: 'Draw it under the next one', onclick: e => { e.preventDefault(); e.stopPropagation(); if (idx >= all.length - 1) return; moveLayerTo(id, all[idx + 1]); } }, '▼');
            det.appendChild(h('summary', null, h('i', { class: 'tri' }), grip, eye,
                h('span', { class: 'nm', style: 'flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' + (set ? ';color:#00f' : '') + (vis ? '' : ';opacity:.5'), title: id + (vis ? '' : ' (off on the site now)') }, layerName(id)),
                h('span', { class: 'ct', style: 'color:#aaa;font-size:9px' }, (groupOf(id) ? groupOf(id) + ' · ' : '') + l.type), up, dn));
            const inner = h('div', { class: 'in' });
            det.appendChild(inner);
            if (det.open) buildLayer(inner, id, l.type);
            det.addEventListener('toggle', () => { if (det.open) { openLayers.add(id); if (!inner.childElementCount) buildLayer(inner, id, l.type); } else openLayers.delete(id); saveOpen(); });
            out.push(det);
        });
        return out;
    }
    // Re-list when the map gains or loses layers (not on every repaint).
    (function watchLayers() {
        if (PAGE) return;
        let tries = 0;
        const t = setInterval(() => {
            const m = R.map;
            if (!m && ++tries < 300) return;
            clearInterval(t);
            if (!m) return;
            let tm = 0;
            m.on('styledata', () => { clearTimeout(tm); tm = setTimeout(() => {
                if (dockTab !== 'MAP' || dragId) return;
                if (document.activeElement && dock.contains(document.activeElement) && document.activeElement.matches('input,textarea,select')) return;
                if (R.layerIds().slice().reverse().join('|') !== idsSig) renderDock();
            }, 700); });
            if (dockTab === 'MAP') setTimeout(renderDock, 400);
        }, 200);
    })();

    // One layer, opened.
    const SPEC = {"fill":{"p":{"fill-antialias":["b",true],"fill-opacity":["n",1,0,1],"fill-color":["c","#000000"],"fill-outline-color":["c",null],"fill-translate":["a",[0,0]],"fill-translate-anchor":["e","map",["map","viewport"]],"fill-pattern":["s",null]},"l":{"fill-sort-key":["n",null,null,null]}},"line":{"p":{"line-opacity":["n",1,0,1],"line-color":["c","#000000"],"line-translate":["a",[0,0]],"line-translate-anchor":["e","map",["map","viewport"]],"line-width":["n",1,0,null],"line-gap-width":["n",0,0,null],"line-offset":["n",0,null,null],"line-blur":["n",0,0,null],"line-dasharray":["a",null],"line-pattern":["s",null],"line-gradient":["c",null]},"l":{"line-cap":["e","butt",["butt","round","square"]],"line-join":["e","miter",["bevel","round","miter"]],"line-miter-limit":["n",2,null,null],"line-round-limit":["n",1.05,null,null],"line-sort-key":["n",null,null,null]}},"symbol":{"p":{"icon-opacity":["n",1,0,1],"icon-color":["c","#000000"],"icon-halo-color":["c","rgba(0, 0, 0, 0)"],"icon-halo-width":["n",0,0,null],"icon-halo-blur":["n",0,0,null],"icon-translate":["a",[0,0]],"icon-translate-anchor":["e","map",["map","viewport"]],"text-opacity":["n",1,0,1],"text-color":["c","#000000"],"text-halo-color":["c","rgba(0, 0, 0, 0)"],"text-halo-width":["n",0,0,null],"text-halo-blur":["n",0,0,null],"text-translate":["a",[0,0]],"text-translate-anchor":["e","map",["map","viewport"]]},"l":{"symbol-placement":["e","point",["point","line","line-center"]],"symbol-spacing":["n",250,1,null],"symbol-avoid-edges":["b",false],"symbol-sort-key":["n",null,null,null],"symbol-z-order":["e","auto",["auto","viewport-y","source"]],"icon-allow-overlap":["b",false],"icon-overlap":["e",null,["never","always","cooperative"]],"icon-ignore-placement":["b",false],"icon-optional":["b",false],"icon-rotation-alignment":["e","auto",["map","viewport","auto"]],"icon-size":["n",1,0,null],"icon-text-fit":["e","none",["none","width","height","both"]],"icon-text-fit-padding":["a",[0,0,0,0]],"icon-image":["s",null],"icon-rotate":["n",0,null,null],"icon-padding":["a",[2]],"icon-keep-upright":["b",false],"icon-offset":["a",[0,0]],"icon-anchor":["e","center",["center","left","right","top","bottom","top-left","top-right","bottom-left","bottom-right"]],"icon-pitch-alignment":["e","auto",["map","viewport","auto"]],"text-pitch-alignment":["e","auto",["map","viewport","auto"]],"text-rotation-alignment":["e","auto",["map","viewport","viewport-glyph","auto"]],"text-field":["s",""],"text-font":["a",["Open Sans Regular","Arial Unicode MS Regular"]],"text-size":["n",16,0,null],"text-max-width":["n",10,0,null],"text-line-height":["n",1.2,null,null],"text-letter-spacing":["n",0,null,null],"text-justify":["e","center",["auto","left","center","right"]],"text-radial-offset":["n",0,null,null],"text-variable-anchor":["x",null],"text-variable-anchor-offset":["x",null],"text-anchor":["e","center",["center","left","right","top","bottom","top-left","top-right","bottom-left","bottom-right"]],"text-max-angle":["n",45,null,null],"text-writing-mode":["x",null],"text-rotate":["n",0,null,null],"text-padding":["n",2,0,null],"text-keep-upright":["b",true],"text-transform":["e","none",["none","uppercase","lowercase"]],"text-offset":["a",[0,0]],"text-allow-overlap":["b",false],"text-overlap":["e",null,["never","always","cooperative"]],"text-ignore-placement":["b",false],"text-optional":["b",false]}},"circle":{"p":{"circle-radius":["n",5,0,null],"circle-color":["c","#000000"],"circle-blur":["n",0,null,null],"circle-opacity":["n",1,0,1],"circle-translate":["a",[0,0]],"circle-translate-anchor":["e","map",["map","viewport"]],"circle-pitch-scale":["e","map",["map","viewport"]],"circle-pitch-alignment":["e","viewport",["map","viewport"]],"circle-stroke-width":["n",0,0,null],"circle-stroke-color":["c","#000000"],"circle-stroke-opacity":["n",1,0,1]},"l":{"circle-sort-key":["n",null,null,null]}},"heatmap":{"p":{"heatmap-radius":["n",30,1,null],"heatmap-weight":["n",1,0,null],"heatmap-intensity":["n",1,0,null],"heatmap-color":["c",["interpolate",["linear"],["heatmap-density"],0,"rgba(0, 0, 255, 0)",0.1,"royalblue",0.3,"cyan",0.5,"lime",0.7,"yellow",1,"red"]],"heatmap-opacity":["n",1,0,1]},"l":{}},"fill-extrusion":{"p":{"fill-extrusion-opacity":["n",1,0,1],"fill-extrusion-color":["c","#000000"],"fill-extrusion-translate":["a",[0,0]],"fill-extrusion-translate-anchor":["e","map",["map","viewport"]],"fill-extrusion-pattern":["s",null],"fill-extrusion-height":["n",0,0,null],"fill-extrusion-base":["n",0,0,null],"fill-extrusion-vertical-gradient":["b",true]},"l":{}},"raster":{"p":{"raster-opacity":["n",1,0,1],"raster-hue-rotate":["n",0,null,null],"raster-brightness-min":["n",0,0,1],"raster-brightness-max":["n",1,0,1],"raster-saturation":["n",0,-1,1],"raster-contrast":["n",0,-1,1],"raster-resampling":["e","linear",["linear","nearest"]],"raster-fade-duration":["n",300,0,null]},"l":{}},"hillshade":{"p":{"hillshade-illumination-direction":["n",335,0,359],"hillshade-illumination-anchor":["e","viewport",["map","viewport"]],"hillshade-exaggeration":["n",0.5,0,1],"hillshade-shadow-color":["c","#000000"],"hillshade-highlight-color":["c","#FFFFFF"],"hillshade-accent-color":["c","#000000"]},"l":{}},"background":{"p":{"background-color":["c","#000000"],"background-pattern":["s",null],"background-opacity":["n",1,0,1]},"l":{}}};
    function buildLayer(inner, id, type) {
        const s = S(), m = R.map;
        const L = () => s.map.layers[id] || {};
        const upd = (p, l) => updLayer(id, p, l);
        const slider = (label, key, min, max, step) => {
            const v = L()[key] === undefined ? 1 : +L()[key];
            const rng = h('input', { type: 'range', class: 'dbx-r', min, max, step, value: v });
            const n = numIn(v === 1 ? '' : v, '1', (val, l) => { upd({ [key]: val === '' ? undefined : num(val) }, l); if (!l) rebuild(); }, { w4: true, step, k: id + ':' + key });
            rng.addEventListener('input', () => { n.value = rng.value; n.classList.add('set'); upd({ [key]: +rng.value }, true); });
            return row(label, rng, n);
        };
        const rebuild = () => { inner.textContent = ''; buildLayer(inner, id, type); };
        const quick = [];
        if (type === 'line') {
            quick.push(slider('width ×', 'width', 0.1, 5, 0.05), slider('opacity ×', 'opacity', 0, 1, 0.05));
            const DASH = [['', 'as drawn'], ['1 0', 'solid'], ['1 1', 'dots, close'], ['0.5 1.5', 'dots'], ['2 2', 'short dashes'], ['3 2', 'dashes'], ['5 3', 'long dashes'], ['custom', 'other…']];
            const curD = L().dash ? L().dash.join(' ') : '';
            const known = DASH.some(d => d[0] === curD);
            const dSel = h('select', { class: 'dbx-s' + (L().dash ? ' set' : '') }, DASH.map(([v, t]) => h('option', { value: v, selected: known ? v === curD : v === 'custom' }, t)));
            const dIn = h('input', { class: 'dbx-t dbx-mono', value: curD, placeholder: 'dash gap', style: 'flex:0 0 64px', title: 'Dash and gap lengths, in line widths, e.g. 3 2' });
            const setD = v => { const a = v.trim() ? v.trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n)) : null; upd({ dash: a && a.length ? a : undefined }); rebuild(); };
            dSel.addEventListener('change', () => { if (dSel.value !== 'custom') setD(dSel.value); else dIn.focus(); });
            dIn.addEventListener('change', () => setD(dIn.value));
            quick.push(row('dashes', dSel, dIn));
        } else if (type === 'fill' || type === 'fill-extrusion' || type === 'heatmap') {
            quick.push(slider('opacity ×', 'opacity', 0, 1, 0.05));
        } else if (type === 'circle') {
            quick.push(slider('size ×', 'width', 0.1, 4, 0.05), slider('opacity ×', 'opacity', 0, 1, 0.05));
        } else if (type === 'symbol') {
            quick.push(slider('size ×', 'size', 0.2, 3, 0.05), slider('opacity ×', 'opacity', 0, 1, 0.05));
        } else if (type === 'raster') {
            quick.push(slider('opacity ×', 'opacity', 0, 1, 0.05));
        }
        // Seen from which zoom to which.
        const ly = m.getLayer(id) || {};
        const zmin = L().minzoom, zmax = L().maxzoom;
        quick.push(row('from zoom', numIn(zmin === undefined ? '' : zmin, ly.minzoom === undefined ? 0 : r1(ly.minzoom), (v, l) => { upd({ minzoom: v === '' ? undefined : num(v) }, l); if (!l) rebuild(); }, { step: 0.5, w4: true, unit: '', min: 0, max: 24, k: id + ':zmin' }),
            h('span', { class: 'dbx-note', style: 'margin:0' }, 'to'), numIn(zmax === undefined ? '' : zmax, ly.maxzoom === undefined ? 24 : r1(ly.maxzoom), (v, l) => { upd({ maxzoom: v === '' ? undefined : num(v) }, l); if (!l) rebuild(); }, { step: 0.5, w4: true, unit: '', min: 0, max: 24, k: id + ':zmax' }),
            h('span', { class: 'dbx-note', style: 'margin:0' }, 'now ' + r1(m.getZoom())), x(zmin !== undefined || zmax !== undefined, () => { upd({ minzoom: undefined, maxzoom: undefined }); rebuild(); })));
        inner.append(...quick);
        // The colours this layer draws with, each changeable for this layer alone.
        const fnd = new Set();
        const walk = e => { if (typeof e === 'string') { const k = R.colorKey(e); if (k) fnd.add(k); } else if (Array.isArray(e)) e.forEach(walk); };
        const reg = R.layers[id];
        if (reg) Object.keys(reg.paint).forEach(p => { if (/-color$/.test(p)) walk(reg.paint[p]); });
        if (reg && Object.keys(reg.paint).some(p => /-color$/.test(p) && JSON.stringify(reg.paint[p]).indexOf('"get"') >= 0)) {
            ['--r-old', '--r-active', '--r-future', '--r-cont', '--c-done', '--c-active', '--c-planned'].forEach(v => { const k = R.colorKey(getComputedStyle(document.documentElement).getPropertyValue(v)); if (k) fnd.add(k); });
        }
        if (fnd.size > 1 || (fnd.size && reg && Object.keys(reg.paint).some(p => /-color$/.test(p) && Array.isArray(reg.paint[p])))) {
            inner.append(h('div', { class: 'dbx-note', style: 'margin:6px 0 2px' }, 'colours in this layer'));
            fnd.forEach(k => {
                const loc = L().colors || {};
                const [c, t] = colorIn(loc[k] || '', k, (v, live) => { const cl = Object.assign({}, L().colors || {}); if (v && R.colorKey(v) !== k) cl[k] = v; else delete cl[k]; upd({ colors: cl }, live); if (!live) rebuild(); });
                inner.append(h('div', { class: 'dbx-row' }, h('span', { class: 'dbx-sw', style: 'flex:0 0 22px' }, h('i', { style: 'background:' + k + ';right:50%' }), h('i', { style: 'background:' + (loc[k] || k) + ';left:50%' })),
                    h('span', { class: 'dbx-mono', style: 'flex:0 0 74px' }, k), c, t, x(loc[k], () => { const cl = Object.assign({}, L().colors || {}); delete cl[k]; upd({ colors: cl }); rebuild(); })));
            });
        }
        // Every property the layer has.
        const sp = SPEC[type] || { p: {}, l: {} };
        const props = [...Object.keys(sp.p).map(p => ['paint', p, sp.p[p]]), ...Object.keys(sp.l).map(p => ['layout', p, sp.l[p]])];
        const isOver = (kind, p) => Object.prototype.hasOwnProperty.call(L()[kind] || {}, p);
        props.sort((a, b) => (isOver(b[0], b[1]) ? 1 : 0) - (isOver(a[0], a[1]) ? 1 : 0));
        const allBox = h('details', { class: 'dbx-sec', open: openAll.has(id), style: 'margin:6px 0 0;padding:0' },
            h('summary', null, h('i', { class: 'tri' }), 'EVERY PROPERTY', props.some(([k, p]) => isOver(k, p)) ? h('i', { class: 'dot' }) : null));
        const allIn = h('div', { class: 'in' });
        allBox.appendChild(allIn);
        const fillAll = () => { allIn.textContent = ''; props.forEach(([kind, p, def]) => allIn.appendChild(propRow(id, type, kind, p, def, rebuild))); };
        if (allBox.open) fillAll();
        allBox.addEventListener('toggle', () => { if (allBox.open) { openAll.add(id); if (!allIn.childElementCount) fillAll(); } else openAll.delete(id); });
        inner.append(allBox,
            h('div', { class: 'dbx-row', style: 'margin-top:4px' }, h('span', { class: 'dbx-mono', style: 'color:#aaa;flex:1;overflow:hidden;text-overflow:ellipsis' }, id + (reg && reg.paint && JSON.stringify(reg).length < 4000 ? '' : '')),
                h('button', { class: 'dbx-btn', title: 'See what the site gives this layer', onclick: () => { console.log('[style] ' + id, m.getLayer(id) && m.getStyle().layers.find(l => l.id === id)); toast('Written to the browser console (F12).'); } }, 'as JSON'),
                s.map.layers[id] ? h('button', { class: 'dbx-btn', onclick: () => { delete s.map.layers[id]; commit(); renderDock(); } }, 'reset layer') : null));
    }
    const isZoomCurve = v => Array.isArray(v) && /^interpolate/.test(v[0]) && Array.isArray(v[2]) && v[2][0] === 'zoom';
    function propRow(id, type, kind, p, def, rebuild) {
        const s = S(), m = R.map;
        const [k, dflt, mn, mx, vals] = def;
        const L = () => s.map.layers[id] || {};
        const over = () => Object.prototype.hasOwnProperty.call(L()[kind] || {}, p);
        let cur;
        try { cur = kind === 'paint' ? m.getPaintProperty(id, p) : m.getLayoutProperty(id, p); } catch (e) {}
        const mine = over() ? L()[kind][p] : undefined;
        const shown = mine !== undefined ? mine : (cur !== undefined ? cur : dflt);
        const wrap = h('div', { style: 'border-bottom:1px solid #f2f2f2;padding:1px 0' });
        const msg = h('div', { class: 'dbx-note dbx-err', style: 'margin:0', hidden: true });
        const setV = (v, live) => {
            const o = Object.assign({}, L()[kind] || {});
            if (v === undefined) delete o[p]; else o[p] = v;
            updLayer(id, { [kind]: o }, live);
            if (!live) {
                R.applyNow();
                let now; try { now = kind === 'paint' ? m.getPaintProperty(id, p) : m.getLayoutProperty(id, p); } catch (e) {}
                if (v !== undefined && JSON.stringify(now) !== JSON.stringify(v) && !(p === 'line-dasharray')) { msg.hidden = false; msg.textContent = 'The map did not take this value: look at the console (F12) for why.'; }
                else msg.hidden = true;
            }
        };
        const name = type === 'symbol' ? p : p.replace(type + '-', '');
        const lb = h('span', { class: 'lb dbx-mono', style: 'flex:0 0 104px;font-size:9.5px!important' + (over() ? ';color:#00f' : ''), title: kind + ' · ' + p }, name);
        const r = h('div', { class: 'dbx-row' }, lb);
        const jsonKey = id + '|' + p;
        const expr = Array.isArray(shown) && typeof shown[0] === 'string' && !(k === 'a' || k === 'x') || (k === 'x' && Array.isArray(shown) && typeof shown[0] === 'string');
        if (isZoomCurve(shown) && (k === 'n' || k === 'c')) {
            r.append(h('span', { class: 'dbx-note', style: 'flex:1;margin:0' }, 'by zoom, ' + ((shown.length - 3) / 2) + ' stops'));
        } else if (expr) {
            r.append(h('span', { class: 'dbx-note', style: 'flex:1;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', title: JSON.stringify(shown) }, 'by data: ' + JSON.stringify(shown).slice(0, 40)));
        } else if (k === 'c') {
            const [c, t] = colorIn(mine || '', typeof cur === 'string' ? cur : (dflt || ''), (v, live) => setV(v || undefined, live));
            r.append(c, t);
        } else if (k === 'n') {
            const hasR = mn !== null && mn !== undefined && mx !== null && mx !== undefined;
            const step = hasR && mx - mn <= 1 ? 0.05 : (/rotate|angle/.test(p) ? 1 : 0.1);
            const n = numIn(mine === undefined ? '' : mine, typeof cur === 'number' ? r2(cur) : (dflt === null ? '' : dflt), (v, live) => { if (v === '') setV(undefined, live); else if (!isNaN(parseFloat(v))) setV(parseFloat(v), live); if (rng && v !== '') rng.value = parseFloat(v); }, { w4: true, step, unit: '', min: mn === null ? undefined : mn, max: mx === null ? undefined : mx, k: 'mp:' + jsonKey });
            const top = hasR ? mx : Math.max(4, (typeof cur === 'number' ? cur : (dflt || 1)) * 4);
            const rng = h('input', { type: 'range', class: 'dbx-r', min: hasR ? mn : 0, max: top, step: (top - (hasR ? mn : 0)) / 200, value: typeof shown === 'number' ? shown : 0 });
            rng.addEventListener('input', () => { n.value = r2(+rng.value); n.classList.add('set'); setV(+rng.value, true); });
            rng.addEventListener('change', () => setV(+rng.value));
            r.append(rng, n);
            scrub(lb, n);
        } else if (k === 'e') {
            r.append(sel(vals || [], mine === undefined ? '' : mine, '— ' + (cur !== undefined ? cur : dflt), v => { setV(v || undefined); rebuild(); }));
        } else if (k === 'b') {
            const cb = h('input', { type: 'checkbox', checked: !!shown, style: 'margin:0;accent-color:#00f' });
            cb.addEventListener('change', () => { setV(cb.checked); rebuild(); });
            r.append(cb, h('span', { class: 'dbx-note', style: 'margin:0;flex:1' }, mine === undefined ? 'as the site has it' : ''));
        } else {
            const t = h('input', { class: 'dbx-t dbx-mono' + (mine !== undefined ? ' set' : ''), value: shown === undefined || shown === null ? '' : (typeof shown === 'string' ? shown : JSON.stringify(shown)), spellcheck: false, placeholder: 'value' });
            t.addEventListener('change', () => {
                const v = t.value.trim();
                if (v === '') { setV(undefined); rebuild(); return; }
                let val; try { val = JSON.parse(v); } catch (e) { val = v; }
                setV(val); });
            r.append(t);
        }
        // By zoom, as a curve of stops.
        if (k === 'n' || k === 'c') r.append(h('button', { class: 'dbx-x', title: 'Change it with the zoom', style: isZoomCurve(shown) ? 'color:#00f!important' : '', onclick: () => {
            if (isZoomCurve(shown)) { jsonOpen.has('z:' + jsonKey) ? jsonOpen.delete('z:' + jsonKey) : jsonOpen.add('z:' + jsonKey); rebuild(); return; }
            const z = Math.floor(m.getZoom());
            const base = expr ? (k === 'n' ? (typeof dflt === 'number' ? dflt : 1) : (dflt || '#000000')) : shown;
            setV(['interpolate', ['linear'], ['zoom'], Math.max(0, z - 3), base, Math.min(22, z + 3), base]);
            jsonOpen.add('z:' + jsonKey); rebuild(); } }, 'z'));
        r.append(h('button', { class: 'dbx-x', title: 'Write the value or expression by hand', style: jsonOpen.has(jsonKey) ? 'color:#00f!important' : '', onclick: () => { jsonOpen.has(jsonKey) ? jsonOpen.delete(jsonKey) : jsonOpen.add(jsonKey); rebuild(); } }, '{}'),
            x(over(), () => { setV(undefined); rebuild(); }, 'Back to what the site gives it'));
        wrap.append(r, msg);
        if (isZoomCurve(shown) && jsonOpen.has('z:' + jsonKey)) wrap.append(stopsEditor(shown, k, v => setV(v), (v, l) => setV(v, l), rebuild));
        if (jsonOpen.has(jsonKey)) {
            const ta = h('textarea', { class: 'dbx-ta', style: 'height:70px', spellcheck: false }, JSON.stringify(shown === undefined ? null : shown, null, 1));
            const ok = h('button', { class: 'dbx-btn', onclick: () => { try { const v = JSON.parse(ta.value); setV(v === null ? undefined : v); ta.classList.remove('bad'); rebuild(); } catch (e) { msg.hidden = false; msg.textContent = 'Not JSON: ' + e.message; } } }, 'apply');
            wrap.append(ta, h('div', { class: 'dbx-row' }, ok, h('span', { class: 'dbx-note', style: 'margin:0' }, 'MapLibre style expression, e.g. ["interpolate",["linear"],["zoom"],10,1,16,4]')));
        }
        return wrap;
    }
    function stopsEditor(v, k, set, setLive, rebuild) {
        const curve = v[1] && v[1][0] === 'exponential' ? 'exponential' : 'linear';
        const stops = [];
        for (let i = 3; i < v.length; i += 2) stops.push([v[i], v[i + 1]]);
        const make = (st, cv) => ['interpolate', cv === 'exponential' ? ['exponential', 1.5] : ['linear'], ['zoom'], ...st.slice().sort((a, b) => a[0] - b[0]).flat()];
        const box = h('div', { style: 'background:#f7f7ff;padding:4px 6px;margin:2px 0 4px' });
        box.append(h('div', { class: 'dbx-row' }, h('span', { class: 'dbx-note', style: 'margin:0;flex:1' }, 'zoom → value'),
            seg([['linear', 'even'], ['exponential', 'faster up close']], curve, cv => { set(make(stops, cv || curve)); rebuild(); })));
        const grd = h('div', { class: 'dbx-stops' });
        stops.forEach((st, i) => {
            const z = numIn(st[0], '', (val, l) => { if (val === '') return; st[0] = num(val); setLive(make(stops, curve), l); }, { w3: true, step: 0.5, unit: '', min: 0, max: 24 });
            let ctl;
            if (k === 'c') { const [c, t] = colorIn(typeof st[1] === 'string' ? st[1] : '', '#000000', (val, l) => { if (!val) return; st[1] = val; setLive(make(stops, curve), l); }); ctl = h('span', { style: 'display:flex;gap:3px' }, c, t); }
            else ctl = numIn(typeof st[1] === 'number' ? st[1] : '', '', (val, l) => { if (val === '' || isNaN(parseFloat(val))) return; st[1] = parseFloat(val); setLive(make(stops, curve), l); }, { w4: true, step: 0.1, unit: '' });
            grd.append(z, ctl, h('button', { class: 'dbx-x', title: 'Remove this stop', onclick: () => { if (stops.length <= 2) return; stops.splice(i, 1); set(make(stops, curve)); rebuild(); } }, '✕'));
        });
        box.append(grd, h('div', { class: 'dbx-row' }, h('button', { class: 'dbx-btn', onclick: () => { const z = Math.round(R.map.getZoom() * 2) / 2; const last = stops[stops.length - 1]; stops.push([z, last ? last[1] : (k === 'c' ? '#000000' : 1)]); set(make(stops, curve)); rebuild(); } }, '+ a stop at this zoom'),
            h('span', { class: 'dbx-note', style: 'margin:0' }, 'now ' + r1(R.map.getZoom()))));
        return box;
    }

    // ═════════════════════════════════════════════════════════════════════
    // SAVE: to the site, through GitHub, or as a file
    // ═════════════════════════════════════════════════════════════════════
    const guessRepo = () => {
        const m = /^([\w-]+)\.github\.io$/i.exec(location.hostname);
        const seg = location.pathname.split('/').filter(Boolean)[0];
        return m ? { owner: m[1], repo: seg && !/\.html?$/.test(seg) ? seg : m[1] + '.github.io' } : { owner: 'boundarieslab', repo: 'db_mp' };
    };
    const GH = Object.assign({ branch: 'main', path: 'editor/site-style.js' }, guessRepo(), LS.get('dbx-gh', {}));
    const saveGH = () => LS.set('dbx-gh', GH);
    const ghReady = () => !!(GH.token && GH.owner && GH.repo);
    let pub = { busy: false, pct: 0, msg: '', ok: null, live: null };
    async function gh(method, path, body) {
        const r = await fetch('https://api.github.com/repos/' + GH.owner + '/' + GH.repo + path, {
            method, cache: 'no-store',
            headers: Object.assign({ Authorization: 'Bearer ' + GH.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body ? { 'Content-Type': 'application/json' } : {}),
            body: body ? JSON.stringify(body) : undefined });
        let j = {}; try { j = await r.json(); } catch (e) {}
        if (!r.ok) { const e = new Error(j.message || r.statusText); e.status = r.status; throw e; }
        return j;
    }
    const enc = p => p.split('/').map(encodeURIComponent).join('/');
    async function shaOf(path) {
        try { return (await gh('GET', '/contents/' + enc(path) + '?ref=' + encodeURIComponent(GH.branch))).sha; }
        catch (e) { if (e.status === 404) return null; throw e; }
    }
    async function putFile(path, b64, message) {
        for (let tries = 0; tries < 2; tries++) {
            const sha = await shaOf(path);
            try { return await gh('PUT', '/contents/' + enc(path), Object.assign({ message, content: b64, branch: GH.branch }, sha ? { sha } : {})); }
            catch (e) { if (e.status !== 409 || tries) throw e; }
        }
    }
    function b64text(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    }
    async function hashOf(str) {
        const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
        return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 14);
    }
    const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf' };
    function summary(st) {
        const bits = [];
        const n = (o) => Object.keys(o || {}).length;
        if (st.rules.length) bits.push(st.rules.length + ' part rule' + (st.rules.length > 1 ? 's' : ''));
        if ((st.texts || []).length) bits.push(st.texts.length + ' wording' + (st.texts.length > 1 ? 's' : ''));
        if ((st.added || []).length) bits.push(st.added.length + ' added');
        if (n(st.colors)) bits.push(n(st.colors) + ' colour' + (n(st.colors) > 1 ? 's' : ''));
        if (n(st.map.layers) || (st.map.order || []).length) bits.push((n(st.map.layers) + (st.map.order || []).length) + ' map change' + (n(st.map.layers) + st.map.order.length > 1 ? 's' : ''));
        if (n(st.fonts) || n(st.sizes) || n(st.weights)) bits.push('type');
        if (st.css && st.css.trim()) bits.push('free CSS');
        return bits.length ? bits.join(', ') : 'back to the page as written';
    }
    async function publish(empty) {
        if (PAGE || pub.busy) return;
        if (!ghReady()) { openDock('SAVE'); toast('First connect the editor to GitHub, below.'); return; }
        const st = empty ? R.blank() : clone(S());
        pub = { busy: true, pct: 5, msg: 'Starting…', ok: null, live: null };
        openDock('SAVE');
        const step = (pct, msg) => { pub.pct = pct; pub.msg = msg; if (dockTab === 'SAVE') renderDock(); };
        try {
            // Pictures and font files uploaded in the editor go into the site as files.
            const media = [];
            (st.added || []).forEach(a => { if (a.kind === 'image' && /^data:/.test(a.src || '')) media.push(a); });
            (st.fontFiles || []).forEach(f => { if (/^data:/.test(f.src || '')) media.push(f); });
            for (let i = 0; i < media.length; i++) {
                const it = media[i];
                const m = /^data:([^;,]+)(;base64)?,(.*)$/.exec(it.src);
                if (!m) continue;
                const b64 = m[2] ? m[3] : b64text(decodeURIComponent(m[3]));
                const ext = EXT[m[1]] || (it.file || '').split('.').pop() || 'bin';
                const path = 'editor/media/' + await hashOf(b64) + '.' + ext;
                step(10 + Math.round(60 * i / media.length), 'Uploading ' + (it.file || 'a picture') + '…');
                if (!(await shaOf(path))) await putFile(path, b64, 'Site editor: add ' + (it.file || path.split('/').pop()));
                it.src = path;
            }
            step(75, 'Writing the style…');
            const iso = new Date().toISOString();
            const body = '/* The site\'s look, saved by the site editor (index.html?edit) on ' + iso + '.\n   Applied by editor/style-runtime.js. {} means the page as written. */\nwindow.__DB_SITE_STYLE = ' + JSON.stringify(st) + ';\n';
            await putFile(GH.path, b64text(body), 'Site style: ' + summary(st));
            if (!empty) { R.state = st; R.saveDraft(); }
            pubSnap = stable(R.norm(clone(st)));
            LS.set('dbx-pub-at', iso);
            commit();
            pub = { busy: false, pct: 100, msg: empty ? 'The site will show the page as written.' : 'Saved to the site.', ok: true, live: 'waiting' };
            step(100, pub.msg);
            watchLive(iso);
        } catch (e) {
            const why = e.status === 401 ? 'GitHub did not accept the key. Check it below, or make a new one.'
                : e.status === 403 || e.status === 404 ? 'The key cannot write to ' + GH.owner + '/' + GH.repo + '. It needs “Contents: Read and write” for that repository.'
                : e.status === 422 ? 'GitHub refused the file: ' + e.message
                : (e.message || 'Could not reach GitHub.');
            pub = { busy: false, pct: 0, msg: why, ok: false, live: null };
            if (dockTab === 'SAVE') renderDock();
        }
        renderBar();
    }
    // The site takes a minute or two to show what was saved.
    function watchLive(iso) {
        if (/^(localhost|127\.|\[::1\])/.test(location.hostname)) { pub.live = 'local'; if (dockTab === 'SAVE') renderDock(); return; }
        const t0 = Date.now();
        const url = new URL(GH.path, location.href.replace(/[^\/]*([?#].*)?$/, '')).href;
        const tick = () => fetch(url + '?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : '').catch(() => '').then(t => {
            if (t.indexOf(iso) >= 0) { pub.live = 'live'; toast('Your changes are on the site now.', 4000); if (dockTab === 'SAVE') renderDock(); renderBar(); return; }
            if (Date.now() - t0 > 6 * 60e3) { pub.live = 'slow'; if (dockTab === 'SAVE') renderDock(); return; }
            setTimeout(tick, 20000);
        });
        setTimeout(tick, 30000);
    }
    let confirmReset = '';
    function renderSave() {
        const s = S();
        const out = [];
        const d = dirty();
        const at = LS.get('dbx-pub-at', '');
        if (!PAGE) {
            const loads = !!document.querySelector('script[src*="site-style.js"]');
            out.push(h('div', { class: 'dbx-mode' },
                h('div', null, h('b', null, d ? 'Your draft is not on the site yet.' : 'Your draft is what the site shows.')),
                h('div', { class: 'dbx-note', style: 'margin:2px 0 0' }, countChanges(s) + ' changes in the draft' + (at ? ' · last saved to the site ' + new Date(at).toLocaleString() : '') + '.')));
            if (!loads) out.push(h('div', { class: 'dbx-note dbx-err' }, 'This copy of index.html does not load editor/site-style.js yet, so the site will not show what is saved. Put the new index.html in the site first.'));
            const go = h('button', { class: 'dbx-btn big on', style: 'width:100%;margin-top:4px', disabled: pub.busy || !ghReady() || !d, onclick: () => publish() }, pub.busy ? 'SAVING…' : 'SAVE TO SITE');
            out.push(go);
            if (pub.busy || pub.msg) {
                out.push(h('div', { class: 'dbx-prog' }, h('i', { style: 'width:' + pub.pct + '%' })),
                    h('div', { class: 'dbx-note ' + (pub.ok === false ? 'dbx-err' : pub.ok ? 'dbx-ok' : '') }, pub.msg));
                if (pub.live === 'waiting') out.push(h('div', { class: 'dbx-note' }, 'GitHub is building the site: it usually shows the change within 1 to 3 minutes. This window will say when.'));
                if (pub.live === 'live') out.push(h('div', { class: 'dbx-note dbx-ok' }, 'It is on the site now. Visitors who had the page open see it when they reload (their browser may keep the old one up to 10 minutes).'));
                if (pub.live === 'slow') out.push(h('div', { class: 'dbx-note' }, 'Not showing yet after 6 minutes. Look at the repository’s Actions tab on GitHub to see whether the build is waiting.'));
                if (pub.live === 'local') out.push(h('div', { class: 'dbx-note' }, 'Saved to GitHub. This is a local copy, so it will not change here until you pull.'));
            }
            // The connection.
            const conn = h('details', { class: 'dbx-sec', open: !ghReady(), style: 'margin-top:12px' }, h('summary', null, h('i', { class: 'tri' }), 'GITHUB CONNECTION', ghReady() ? h('span', { class: 'dbx-ok', style: 'font-weight:400;letter-spacing:0' }, '· connected') : h('span', { class: 'dbx-err', style: 'font-weight:400;letter-spacing:0' }, '· not connected')));
            const inp = (k, ph, type) => { const i = h('input', { class: 'dbx-t dbx-mono', value: GH[k] || '', placeholder: ph, type: type || 'text', spellcheck: false, autocomplete: 'off' }); i.addEventListener('change', () => { GH[k] = i.value.trim(); saveGH(); renderDock(); renderBar(); }); return i; };
            const tmsg = h('div', { class: 'dbx-note' });
            conn.appendChild(h('div', { class: 'in' },
                h('div', { class: 'dbx-note' }, 'SAVE TO SITE writes one file, ', h('span', { class: 'dbx-mono' }, GH.path), ', into the site’s repository on GitHub, and GitHub puts it online. For that the editor needs a key from you, made once:'),
                h('div', { class: 'dbx-note' }, '1. Open ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'github.com → new fine-grained token'), '.', h('br'),
                    '2. Repository access: ', h('b', null, 'Only select repositories → ' + GH.repo), '.', h('br'),
                    '3. Permissions → Repository → ', h('b', null, 'Contents: Read and write'), '.', h('br'),
                    '4. Generate, copy it, paste it below.'),
                row('owner', inp('owner', 'boundarieslab')), row('repository', inp('repo', 'db_mp')), row('branch', inp('branch', 'main')),
                row('key', inp('token', 'github_pat_…', 'password')),
                h('div', { class: 'dbx-row' }, h('button', { class: 'dbx-btn', disabled: !ghReady(), onclick: async () => {
                    tmsg.className = 'dbx-note'; tmsg.textContent = 'Checking…';
                    try { const j = await gh('GET', ''); const can = j.permissions ? j.permissions.push : null;
                        tmsg.className = 'dbx-note ' + (can === false ? 'dbx-err' : 'dbx-ok'); tmsg.textContent = can === false ? 'The key can read ' + j.full_name + ' but not write to it.' : 'Works: ' + j.full_name + ', branch ' + GH.branch + '.'; }
                    catch (e) { tmsg.className = 'dbx-note dbx-err'; tmsg.textContent = e.status === 401 ? 'GitHub did not accept the key.' : e.status === 404 ? 'No such repository for this key.' : e.message; } } }, 'test'),
                    h('button', { class: 'dbx-btn', disabled: !GH.token, onclick: () => { delete GH.token; saveGH(); renderDock(); renderBar(); } }, 'forget the key')),
                tmsg,
                h('div', { class: 'dbx-note' }, 'The key stays in this browser only; it is not in the draft, the style file or the site.')));
            out.push(conn);
            // Taking it all off the site.
            out.push(h('div', { class: 'dbx-row', style: 'margin-top:8px' }, h('button', { class: 'dbx-btn warn', disabled: !ghReady() || pub.busy, onclick: () => {
                if (confirmReset !== 'site') { confirmReset = 'site'; renderDock(); setTimeout(() => { confirmReset = ''; if (dockTab === 'SAVE') renderDock(); }, 4000); return; }
                confirmReset = ''; publish(true); } }, confirmReset === 'site' ? 'click again: the site goes back to the page as written' : 'take every change off the site'),
                h('span', { class: 'dbx-note', style: 'margin:0 0 0 6px' }, 'your draft stays')));
        }
        // As a file.
        const file = h('input', { type: 'file', accept: '.json,.js,application/json', style: 'display:none' });
        const msg = h('div', { class: 'dbx-note' });
        file.addEventListener('change', () => {
            const f = file.files[0]; if (!f) return;
            f.text().then(t => { try { if (/__DB_SITE_STYLE/.test(t)) t = t.slice(t.indexOf('=', t.indexOf('__DB_SITE_STYLE')) + 1, t.lastIndexOf(';')); R.state = JSON.parse(t); commit(); render(); toast('Style file opened.'); } catch (e) { msg.textContent = 'That is not a style file.'; } });
        });
        const json = () => JSON.stringify(s, null, 1);
        out.push(h('div', { class: 'dbx-h' }, 'AS A FILE'),
            h('div', { class: 'dbx-row', style: 'gap:4px;flex-wrap:wrap' },
                h('button', { class: 'dbx-btn', onclick: () => download(PAGE ? 'dirtybusiness-cargo-style-' + today() + '.json' : 'dirtybusiness-style-' + today() + '.json', json()) }, 'download'),
                h('button', { class: 'dbx-btn', onclick: () => { navigator.clipboard.writeText(json()).then(() => toast('Copied.')); } }, 'copy'),
                h('button', { class: 'dbx-btn', onclick: () => file.click() }, 'open a style file…'), file), msg);
        if (PAGE) {
            const ta = h('textarea', { class: 'dbx-ta', readonly: true }, R.buildCss(true) || '/* nothing changed yet */');
            out.push(h('div', { class: 'dbx-h' }, 'CSS FOR CARGO'), h('div', { class: 'dbx-note' }, 'Paste this into Cargo’s Custom CSS to make it stay. Words, added parts and copies need the map page.'), ta,
                h('button', { class: 'dbx-btn', onclick: () => { ta.select(); navigator.clipboard.writeText(ta.value); toast('Copied.'); } }, 'copy CSS'));
        } else {
            const src = BASE + 'site-editor.js';
            const bm = "javascript:(function(){if(window.__dbEditor)return;var s=document.createElement('script');s.src='" + src.replace(/^http:\/\/(localhost|127\.0\.0\.1)[^/]*\//, 'https://boundarieslab.github.io/db_mp/') + "?'+Date.now();document.body.appendChild(s);})();";
            out.push(h('div', { class: 'dbx-h' }, 'THE CARGO HEADER AND TABS'),
                h('div', { class: 'dbx-note' }, 'The header, the logo and the About / Map / Sites tabs belong to Cargo, outside the map. To arrange them, drag this button to your bookmarks bar, open dirtybusiness.no and click it there:'),
                h('div', { class: 'dbx-row' }, h('a', { href: bm, class: 'dbx-btn', style: 'text-decoration:none;display:inline-flex;align-items:center;color:#000', onclick: e => e.preventDefault() }, 'DB edit')));
        }
        out.push(h('div', { class: 'dbx-h' }, 'START OVER'),
            h('div', { class: 'dbx-row', style: 'flex-wrap:wrap;gap:4px' },
                h('button', { class: 'dbx-btn' + (confirmReset === 'site-draft' ? ' on' : ''), onclick: () => {
                    if (confirmReset !== 'site-draft') { confirmReset = 'site-draft'; renderDock(); setTimeout(() => { confirmReset = ''; if (dockTab === 'SAVE') renderDock(); }, 4000); return; }
                    confirmReset = ''; R.state = clone(R.BAKED); commit(); render(); } }, confirmReset === 'site-draft' ? 'click again' : 'draft = what the site has'),
                h('button', { class: 'dbx-btn' + (confirmReset === 'blank' ? ' on' : ''), onclick: () => {
                    if (confirmReset !== 'blank') { confirmReset = 'blank'; renderDock(); setTimeout(() => { confirmReset = ''; if (dockTab === 'SAVE') renderDock(); }, 4000); return; }
                    confirmReset = ''; R.state = R.blank(); commit(); render(); } }, confirmReset === 'blank' ? 'click again' : 'draft = the page as written')),
            h('div', { class: 'dbx-note' }, 'Undo brings either back. ', h('a', { href: location.pathname + '?edit=old' }, 'Open the first editor'), ' if you need it.'));
        return out;
    }

    // ── render ──────────────────────────────────────────────────────────
    function render() { renderBar(); renderInsp(); renderDock(); placeInsp(); }
    let lastPhone = isPhone();
    window.addEventListener('resize', () => { if (isPhone() !== lastPhone) { lastPhone = isPhone(); render(); } else placeInsp(); });
    document.addEventListener('scroll', () => { if (selEl && !inspPinned) placeInsp(); }, true);
    render();
    toast('Editor open. V picks parts, T changes words, + ADD adds.', 3500);
    window.__dbEditorApi = { select, setSelMode, setTextMode, render, renderDock, openDock, addPart, duplicate, removeSel, startTextEdit, endTextEdit, publish, moveLayerTo,
        get selEl() { return selEl; }, get selSel() { return selSel; }, get GH() { return GH; }, get pub() { return pub; }, dirty, setScope: v => { scopeOne = v; } };
    }
})();
