/* ==========================================================================
   dirtybusiness.no — the style layer.

   Applies the saved look on top of the page, without touching the page's own
   code: variables, replacements of colours, typefaces, type sizes and line
   weights everywhere they occur, rules for single elements (place, size,
   spacing, type, box), and the map's layers.

   The saved look lives in index.html, in <script type="application/json"
   id="db-style">. Empty, the page is exactly as written.
   With ?edit in the address the editor opens, and a draft kept in this
   browser is shown instead of the saved look.

   Must load after maplibre-gl.js and before the page's own script.
   ========================================================================== */
(function () {
    'use strict';
    if (window.__dbStyle) return;

    const Q = new URLSearchParams(location.search);
    const EDIT = Q.has('edit');
    const PAGE_MODE = !document.getElementById('map');        // e.g. the Cargo page, through the bookmarklet
    const KEY = PAGE_MODE ? 'db-style-draft-page' : 'db-style-draft';
    const MEDIA = { all: '', desktop: '(min-width:761px)', phone: '(max-width:760px)' };

    // ── state ────────────────────────────────────────────────────────────
    const blank = () => ({ version: 1, vars: {}, colors: {}, fonts: {}, fontFiles: [], googleFonts: [],
                           sizes: {}, weights: {}, widths: {}, rules: [],
                           map: { lineWidth: 1, layers: {} } });
    function norm(s) {
        const b = blank();
        s = (s && typeof s === 'object') ? s : {};
        Object.keys(b).forEach(k => { if (s[k] === undefined || s[k] === null) s[k] = b[k]; });
        if (!s.map.layers) s.map.layers = {};
        if (s.map.lineWidth === undefined) s.map.lineWidth = 1;
        return s;
    }
    function readBaked() {
        const el = document.getElementById('db-style');
        if (!el) return blank();
        try { return norm(JSON.parse(el.textContent || '{}')); } catch (e) { return blank(); }
    }
    const BAKED = readBaked();
    let S = BAKED;
    if (EDIT) { try { const d = localStorage.getItem(KEY); if (d) S = norm(JSON.parse(d)); } catch (e) {} }
    let OFF = false;                      // the editor's before/after: the page as written

    // ── colours ──────────────────────────────────────────────────────────
    const NAMED = { black: '#000000', white: '#ffffff' };
    const hx = n => ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
    function colorKey(str) {
        if (typeof str !== 'string') return null;
        let s = str.trim().toLowerCase();
        if (NAMED[s]) return NAMED[s];
        let m = /^#([0-9a-f]{3,8})$/.exec(s);
        if (m) {
            let h = m[1];
            if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
            if (h.length !== 6 && h.length !== 8) return null;
            if (h.length === 8 && h.slice(6) === 'ff') h = h.slice(0, 6);
            return '#' + h;
        }
        m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,\/]+([\d.]+%?))?\s*\)$/.exec(s);
        if (m) {
            let a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
            const base = '#' + hx(+m[1]) + hx(+m[2]) + hx(+m[3]);
            return a >= 1 ? base : base + hx(a * 255);
        }
        return null;
    }
    const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)|\b(?:black|white)\b/g;
    // target: 'ui' or 'map'. Per-layer tables come first when given.
    function colorTo(key, target, local) {
        if (local && local[key]) return local[key];
        const c = S.colors[key];
        if (!c) return null;
        if (typeof c === 'string') return c;
        if (target === 'ui' && c.ui === false) return null;
        if (target === 'map' && c.map === false) return null;
        return c.to || null;
    }
    const hasColors = () => Object.keys(S.colors).length > 0;
    function remapColorText(text, target) {
        if (!text || !hasColors()) return text;
        return String(text).replace(COLOR_RE, m => { const k = colorKey(m); const t = k && colorTo(k, target); return t || m; });
    }

    // ── values in stylesheets and style attributes ───────────────────────
    const WIDTH_PROPS = /^(border-(top|right|bottom|left)-width|outline-width|stroke-width|column-rule-width|text-decoration-thickness)$/;
    const lenKey = v => { const m = /^\s*(-?[\d.]+)(px|em|rem|%)?\s*$/.exec(String(v)); return m ? (+m[1]) + (m[2] || '') : null; };
    const unq = f => f.trim().replace(/^["']|["']$/g, '');
    function remapFamilies(v) {
        if (!Object.keys(S.fonts).length) return v;
        return v.split(',').map(f => { const t = S.fonts[unq(f)]; return t ? (/[\s\d]/.test(t) && !/^["']/.test(t) ? '"' + t + '"' : t) : f.trim(); }).join(', ');
    }
    function remapWord(text, table) {
        // Replace whole length tokens in a shorthand (border: .5px solid …).
        if (!Object.keys(table).length) return text;
        return text.replace(/(^|[\s(,])(-?\.?\d[\d.]*(?:px|em|rem|%)?)(?=$|[\s),\/])/g, (all, pre, tok) => {
            const k = lenKey(tok); return pre + (k !== null && table[k] !== undefined ? table[k] : tok);
        });
    }
    function remapValue(prop, v) {
        if (v === '' || v === undefined || v === null) return v;
        let out = String(v);
        if (hasColors()) out = remapColorText(out, 'ui');
        if (prop === 'font-family') out = remapFamilies(out);
        else if (prop === 'font-size') { const k = lenKey(out); if (k !== null && S.sizes[k] !== undefined) out = S.sizes[k]; }
        else if (prop === 'font-weight') { if (S.weights[out.trim()] !== undefined) out = String(S.weights[out.trim()]); }
        else if (WIDTH_PROPS.test(prop)) { const k = lenKey(out); if (k !== null && S.widths[k] !== undefined) out = S.widths[k]; }
        else if (/^(font|border(-top|-right|-bottom|-left)?|outline)$/.test(prop) && out.indexOf('var(') >= 0) {
            // A shorthand with a variable keeps its longhands unresolved: work on the text.
            if (prop === 'font') {
                Object.keys(S.fonts).forEach(f => { out = out.split('"' + f + '"').join('"' + S.fonts[f] + '"'); out = out.replace(new RegExp('(^|[\\s,])' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[\\s,])', 'g'), '$1"' + S.fonts[f] + '"'); });
                out = remapWord(out, S.sizes);
                Object.keys(S.weights).forEach(w => { out = out.replace(new RegExp('^' + w + '(?=\\s)'), S.weights[w]); });
            } else out = remapWord(out, S.widths);
        }
        return out;
    }
    const isOurs = el => !!(el && el.closest && el.closest('#dbx,#dbx-ov'));

    // Every rule of every stylesheet that can be read, with its first value kept.
    const RULES = [];
    const SEEN = new WeakSet();
    function collect(list) {
        for (const r of list) {
            if (r.style && r.selectorText !== undefined) {
                if (!SEEN.has(r)) { SEEN.add(r); RULES.push({ r, orig: {} }); }
            }
            if (r.cssRules) collect(r.cssRules);
        }
    }
    function collectRules() {
        for (const sh of document.styleSheets) {
            const own = sh.ownerNode;
            if (own && /^dbx/.test(own.id || '')) continue;
            try { collect(sh.cssRules); } catch (e) { /* another origin: cannot be read */ }
        }
    }
    const SHORTHANDS = ['font', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'outline'];
    function applyRules() {
        collectRules();
        for (const e of RULES) {
            const st = e.r.style;
            const props = [];
            for (let i = 0; i < st.length; i++) props.push(st[i]);
            SHORTHANDS.forEach(p => { const v = st.getPropertyValue(p); if (v && v.indexOf('var(') >= 0) props.push(p); });
            Object.keys(e.orig).forEach(p => { if (props.indexOf(p) < 0) props.push(p); });
            for (const p of props) {
                if (!(p in e.orig)) {
                    const v = st.getPropertyValue(p);
                    if (v === '' && SHORTHANDS.indexOf(p) < 0) continue;
                    e.orig[p] = [v, st.getPropertyPriority(p)];
                }
                const [ov, pr] = e.orig[p];
                if (!ov) continue;
                const nv = OFF ? ov : remapValue(p, ov);
                if (st.getPropertyValue(p) !== nv) st.setProperty(p, nv, pr);
            }
        }
    }

    // Attributes written into the page: fill and stroke of the drawn symbols,
    // and style="" set by the page's script.
    const D_ORIG = new WeakMap(), D_LAST = new WeakMap();
    const D_ATTRS = ['fill', 'stroke', 'stop-color', 'style', 'color'];
    function remapStyleText(t) {
        return t.split(';').map(d => {
            const i = d.indexOf(':');
            if (i < 0) return d;
            const p = d.slice(0, i).trim().toLowerCase();
            const v = d.slice(i + 1);
            const imp = /!important\s*$/.test(v);
            const core = v.replace(/!important\s*$/, '').trim();
            const nv = remapValue(p, core);
            return nv === core ? d : d.slice(0, i + 1) + nv + (imp ? ' !important' : '');
        }).join(';');
    }
    const needDom = () => hasColors() || Object.keys(S.fonts).length || Object.keys(S.sizes).length || Object.keys(S.widths).length || Object.keys(S.weights).length;
    let domTouched = false;
    function remapEl(el) {
        if (isOurs(el)) return;
        let orig = D_ORIG.get(el), last = D_LAST.get(el);
        for (const a of D_ATTRS) {
            if (!el.hasAttribute(a)) continue;
            const cur = el.getAttribute(a);
            // What the page last wrote is the original; what we wrote is not.
            const o = (last && a in last && last[a] === cur) ? orig[a] : cur;
            const nv = OFF ? o : (a === 'style' ? remapStyleText(o) : remapColorText(o, 'ui'));
            if (nv !== o || (orig && a in orig)) {
                if (!orig) { orig = {}; D_ORIG.set(el, orig); }
                if (!last) { last = {}; D_LAST.set(el, last); }
                orig[a] = o; last[a] = nv; domTouched = true;
            }
            if (nv !== cur) el.setAttribute(a, nv);
        }
    }
    function remapTree(root) {
        if (!root || root.nodeType !== 1) return;
        remapEl(root);
        root.querySelectorAll('[fill],[stroke],[stop-color],[style],[color]').forEach(remapEl);
    }
    let obs = null;
    function watchDom() {
        const want = needDom() && !OFF;
        if (want || domTouched) remapTree(document.documentElement);
        if (want && !obs) {
            obs = new MutationObserver(list => {
                for (const m of list) {
                    if (m.type === 'attributes') remapEl(m.target);
                    else m.addedNodes.forEach(n => remapTree(n));
                }
            });
            obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: D_ATTRS });
        } else if (!want && obs) { obs.disconnect(); obs = null; }
    }

    // An SVG turned into a picture (the map's site symbols) is recoloured as text.
    const imgDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (imgDesc && imgDesc.set) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
            configurable: true, enumerable: imgDesc.enumerable,
            get: imgDesc.get,
            set(v) {
                if (typeof v === 'string' && v.startsWith('data:image/svg+xml') && hasColors() && !OFF) {
                    try {
                        const i = v.indexOf(',');
                        const head = v.slice(0, i + 1), body = decodeURIComponent(v.slice(i + 1));
                        v = head + encodeURIComponent(remapColorText(body, 'map'));
                    } catch (e) {}
                }
                imgDesc.set.call(this, v);
            }
        });
    }

    // ── generated rules: variables, typefaces, single elements ──────────
    const POS = /^(left|top|right|bottom)$/;
    function ruleCss(rule, forCargo) {
        const props = rule.props || {};
        const ks = Object.keys(props);
        if (!ks.length) return '';
        const sel = rule.sel;
        const hi = sel.split(',').map(s => {
            s = s.trim();
            if (/^html\b/.test(s)) return 'html:root' + s.slice(4);
            if (/^body\b/.test(s)) return 'html:root body' + s.slice(4);
            return 'html:root body ' + s;
        }).join(',');
        const pos = ks.filter(k => POS.test(k)), rest = ks.filter(k => !POS.test(k));
        let out = '';
        if (forCargo) {
            out += hi + '{' + ks.map(k => k + ':' + props[k] + ' !important').join(';') + '}\n';
        } else {
            // A window the reader drags keeps the place they gave it: no !important on
            // place, only a selector that outweighs the page's own.
            if (pos.length) out += hi + '{' + pos.map(k => k + ':' + props[k]).join(';') + '}\n';
            if (rest.length) out += hi + '{' + rest.map(k => k + ':' + props[k] + ' !important').join(';') + '}\n';
        }
        return out;
    }
    function buildCss(forCargo) {
        if (OFF && !forCargo) return '';
        let css = '';
        (S.fontFiles || []).forEach(f => {
            css += '@font-face{font-family:"' + f.family + '";src:url(' + f.src + ')' + (f.format ? ' format("' + f.format + '")' : '') +
                   ';font-weight:' + (f.weight || 400) + ';font-style:' + (f.style || 'normal') + ';font-display:swap}\n';
        });
        const vk = Object.keys(S.vars);
        if (vk.length) {
            const by = {};
            vk.forEach(k => { const i = k.indexOf('|'); const sel = i > 0 ? k.slice(0, i) : ':root'; const n = i > 0 ? k.slice(i + 1) : k;
                (by[sel] = by[sel] || []).push(n + ':' + S.vars[k] + ' !important'); });
            Object.keys(by).forEach(sel => { css += (sel === ':root' ? 'html:root' : 'html:root body ' + sel) + '{' + by[sel].join(';') + '}\n'; });
        }
        ['all', 'desktop', 'phone'].forEach(m => {
            const part = (S.rules || []).filter(r => (r.media || 'all') === m).map(r => ruleCss(r, forCargo)).join('');
            if (!part) return;
            css += MEDIA[m] ? '@media ' + MEDIA[m] + '{\n' + part + '}\n' : part;
        });
        return css;
    }
    function applyCss() {
        let el = document.getElementById('dbx-rules');
        if (!el) { el = document.createElement('style'); el.id = 'dbx-rules'; }
        (document.head || document.documentElement).appendChild(el);   // always last
        const css = buildCss(false);
        if (el.textContent !== css) el.textContent = css;
        // Web fonts by name.
        const want = OFF ? [] : (S.googleFonts || []);
        document.querySelectorAll('link[data-dbx-font]').forEach(l => { if (want.indexOf(l.dataset.dbxFont) < 0) l.remove(); });
        want.forEach(g => {
            if (document.querySelector('link[data-dbx-font="' + CSS.escape(g) + '"]')) return;
            const l = document.createElement('link');
            l.rel = 'stylesheet'; l.dataset.dbxFont = g;
            l.href = 'https://fonts.googleapis.com/css2?family=' + g.trim().replace(/\s+/g, '+') + '&display=swap';
            document.head.appendChild(l);
        });
    }

    // ── the map ──────────────────────────────────────────────────────────
    const ML = window.maplibregl;
    const REG = {};              // id → { type, paint:{}, layout:{} } as the page asked for them
    const TOUCHED = {};          // id → props set by the style layer and not by the page
    let MAP = null;
    let O = null;
    const layerOf = id => (S.map.layers || {})[id] || {};
    function scaleExpr(e, k, clamp) {
        if (k === 1 || k === undefined || k === null || isNaN(k)) return e;
        if (typeof e === 'number') { const n = e * k; return clamp ? Math.min(1, n) : n; }
        if (!Array.isArray(e) || typeof e[0] !== 'string') return e;
        const op = e[0];
        if (/^interpolate/.test(op)) { const r = e.slice(0, 3); for (let i = 3; i < e.length; i += 2) r.push(e[i], scaleExpr(e[i + 1], k, clamp)); return r; }
        if (op === 'step') { const r = [op, e[1], scaleExpr(e[2], k, clamp)]; for (let i = 3; i < e.length; i += 2) r.push(e[i], scaleExpr(e[i + 1], k, clamp)); return r; }
        if (op === 'case') { const r = [op]; for (let i = 1; i < e.length - 1; i += 2) r.push(e[i], scaleExpr(e[i + 1], k, clamp)); r.push(scaleExpr(e[e.length - 1], k, clamp)); return r; }
        if (op === 'match') { const r = [op, e[1]]; for (let i = 2; i < e.length - 1; i += 2) r.push(e[i], scaleExpr(e[i + 1], k, clamp)); r.push(scaleExpr(e[e.length - 1], k, clamp)); return r; }
        if (op === 'literal') return e;
        return clamp ? ['min', 1, ['*', k, e]] : ['*', k, e];
    }
    // All the colours a layer's table may change, as from → to.
    function colorTable(id) {
        const t = {};
        Object.keys(S.colors).forEach(k => { const v = colorTo(k, 'map'); if (v) t[k] = v; });
        const loc = layerOf(id).colors || {};
        Object.keys(loc).forEach(k => { t[k] = loc[k]; });
        return t;
    }
    // Only where a colour comes out of the expression: a branch of case / match / step /
    // interpolate, or the whole value. Inputs and conditions are left alone.
    function remapExpr(e, table) {
        if (typeof e === 'string') { const k = colorKey(e); return k && table[k] ? table[k] : e; }
        if (!Array.isArray(e) || typeof e[0] !== 'string') return e;
        const op = e[0];
        if (op === 'get' && e.length === 2 && typeof e[1] === 'string') {
            // A colour read from the data: answered through a match on its value.
            const ks = Object.keys(table);
            if (!ks.length) return e;
            const m = ['match', ['to-string', e]];
            const seen = new Set();
            ks.forEach(k => [k, k.toUpperCase()].forEach(lab => { if (!seen.has(lab)) { seen.add(lab); m.push(lab, table[k]); } }));
            m.push(e);
            return m;
        }
        if (op === 'case') { const r = [op]; for (let i = 1; i < e.length - 1; i += 2) r.push(e[i], remapExpr(e[i + 1], table)); r.push(remapExpr(e[e.length - 1], table)); return r; }
        if (op === 'match') { const r = [op, e[1]]; for (let i = 2; i < e.length - 1; i += 2) r.push(e[i], remapExpr(e[i + 1], table)); r.push(remapExpr(e[e.length - 1], table)); return r; }
        if (op === 'step') { const r = [op, e[1], remapExpr(e[2], table)]; for (let i = 3; i < e.length; i += 2) r.push(e[i], remapExpr(e[i + 1], table)); return r; }
        if (/^interpolate/.test(op)) { const r = e.slice(0, 3); for (let i = 3; i < e.length; i += 2) r.push(e[i], remapExpr(e[i + 1], table)); return r; }
        if (op === 'coalesce' || op === 'to-color') return [op].concat(e.slice(1).map(x => remapExpr(x, table)));
        return e;
    }
    // The map's look as saved in data/map-style.json (edited in Maputnik). Only what
    // differs from data/maputnik/baseline.json is taken; the rest stays the page's.
    let FILE = {};
    const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    function loadMapFile() {
        if (PAGE_MODE || !window.fetch) return;
        const q = EDIT ? '?v=' + Date.now() : '';
        Promise.all(['data/map-style.json', 'data/maputnik/baseline.json'].map(u => fetch(u + q).then(r => r.ok ? r.json() : null).catch(() => null)))
            .then(([st, base]) => {
                if (!st || !base || !Array.isArray(st.layers) || !base.layers) return;
                const out = {};
                st.layers.forEach(l => {
                    const b = base.layers[l.id];
                    if (!b) return;
                    const o = {};
                    ['paint', 'layout'].forEach(k => {
                        const cur = l[k] || {}, was = b[k] || {};
                        new Set(Object.keys(cur).concat(Object.keys(was))).forEach(p => {
                            if (p === 'visibility' || same(cur[p], was[p])) return;
                            (o[k] = o[k] || {})[p] = cur[p] === undefined ? null : cur[p];
                        });
                    });
                    ['minzoom', 'maxzoom'].forEach(z => { if (!same(l[z], b[z])) o[z] = l[z] === undefined ? null : l[z]; });
                    if (Object.keys(o).length) out[l.id] = o;
                });
                FILE = out;
                if (Object.keys(out).length) apply();
            });
    }
    function xPaint(id, prop, v) {
        if (OFF) return v;
        const L = layerOf(id);
        if (L.paint && Object.prototype.hasOwnProperty.call(L.paint, prop)) return L.paint[prop];
        if (prop === 'line-dasharray' && L.dash) return L.dash;
        const F = FILE[id];
        if (F && own(F.paint, prop)) v = F.paint[prop] === null ? undefined : F.paint[prop];
        if (v === undefined) return v;
        let out = v;
        if (/-color$/.test(prop)) { const t = colorTable(id); if (Object.keys(t).length) out = remapExpr(out, t); }
        if (prop === 'line-width') out = scaleExpr(out, (L.width === undefined ? 1 : +L.width) * (+S.map.lineWidth || 1));
        if (prop === 'circle-stroke-width' || prop === 'circle-radius') out = scaleExpr(out, L.width === undefined ? 1 : +L.width);
        if (/-opacity$/.test(prop) && L.opacity !== undefined) out = scaleExpr(out, +L.opacity, true);
        if (prop === 'line-dasharray' && L.dash) out = L.dash;
        return out;
    }
    function xLayout(id, prop, v) {
        if (OFF) return v;
        const L = layerOf(id);
        const F = FILE[id];
        if (prop !== 'visibility' && F && own(F.layout, prop)) v = F.layout[prop] === null ? undefined : F.layout[prop];
        if (prop === 'visibility' && L.hide) return 'none';
        if (L.layout && Object.prototype.hasOwnProperty.call(L.layout, prop)) return L.layout[prop];
        if (prop === 'icon-size' && L.size !== undefined && v !== undefined) return scaleExpr(v, +L.size);
        return v;
    }
    function register(layer) {
        REG[layer.id] = { type: layer.type, paint: Object.assign({}, layer.paint || {}), layout: Object.assign({}, layer.layout || {}), minzoom: layer.minzoom, maxzoom: layer.maxzoom };
    }
    function xLayer(layer) {
        const L = layerOf(layer.id);
        const out = Object.assign({}, layer);
        const paint = Object.assign({}, layer.paint || {});
        Object.keys(paint).forEach(p => { paint[p] = xPaint(layer.id, p, paint[p]); });
        const F = FILE[layer.id] || {};
        if (!OFF && F.paint) Object.keys(F.paint).forEach(p => { if (!(p in paint) && F.paint[p] !== null) paint[p] = xPaint(layer.id, p, F.paint[p]); });
        if (!OFF && own(F, 'minzoom')) { if (F.minzoom === null) delete out.minzoom; else out.minzoom = F.minzoom; }
        if (!OFF && own(F, 'maxzoom')) { if (F.maxzoom === null) delete out.maxzoom; else out.maxzoom = F.maxzoom; }
        if (!OFF && L.paint) Object.keys(L.paint).forEach(p => { if (!(p in paint)) paint[p] = L.paint[p]; });
        if (!OFF && L.dash && layer.type === 'line' && !('line-dasharray' in paint)) paint['line-dasharray'] = L.dash;
        Object.keys(paint).forEach(p => { if (paint[p] === undefined) delete paint[p]; });
        out.paint = paint;
        const layout = Object.assign({}, layer.layout || {});
        Object.keys(layout).forEach(p => { layout[p] = xLayout(layer.id, p, layout[p]); if (layout[p] === undefined) delete layout[p]; });
        if (!OFF && L.hide) layout.visibility = 'none';
        if (!OFF && F.layout) Object.keys(F.layout).forEach(p => { if (!(p in layout) && p !== 'visibility' && F.layout[p] !== null) layout[p] = F.layout[p]; });
        if (!OFF && L.layout) Object.keys(L.layout).forEach(p => { if (!(p in layout)) layout[p] = L.layout[p]; });
        out.layout = layout;
        return out;
    }
    function grab(m) { if (!MAP && m && m.getContainer && m.getContainer().id === 'map') MAP = m; }
    if (ML && ML.Map) {
        const P = ML.Map.prototype;
        O = { addLayer: P.addLayer, setPaintProperty: P.setPaintProperty, setLayoutProperty: P.setLayoutProperty, addControl: P.addControl };
        P.addControl = function () { grab(this); return O.addControl.apply(this, arguments); };
        P.addLayer = function (layer, before) {
            grab(this);
            try { if (layer && layer.id && this === MAP) { register(layer); layer = xLayer(layer); } } catch (e) {}
            return O.addLayer.call(this, layer, before);
        };
        P.setPaintProperty = function (id, prop, val, opt) {
            if (this === MAP) {
                (REG[id] || (REG[id] = { paint: {}, layout: {} })).paint[prop] = val;
                if (TOUCHED[id]) delete TOUCHED[id]['p:' + prop];
                try { val = xPaint(id, prop, val); } catch (e) {}
            }
            return O.setPaintProperty.call(this, id, prop, val, opt);
        };
        P.setLayoutProperty = function (id, prop, val, opt) {
            if (this === MAP) {
                (REG[id] || (REG[id] = { paint: {}, layout: {} })).layout[prop] = val;
                if (TOUCHED[id]) delete TOUCHED[id]['l:' + prop];
                try { val = xLayout(id, prop, val); } catch (e) {}
            }
            return O.setLayoutProperty.call(this, id, prop, val, opt);
        };
    }
    // Layers written into the starting style never pass through addLayer.
    function captureStyleLayers() {
        if (!MAP) return;
        let st; try { st = MAP.getStyle(); } catch (e) { return; }
        (st && st.layers || []).forEach(l => { if (!REG[l.id]) register(l); else REG[l.id].type = REG[l.id].type || l.type; });
    }
    let mapCaptured = false, mapEverStyled = false;
    function applyMap() {
        if (!MAP || !O) return;
        const styled = hasColors() || (+S.map.lineWidth || 1) !== 1 || Object.keys(S.map.layers || {}).length > 0 || Object.keys(FILE).length > 0;
        if (!styled && !mapEverStyled) return;          // nothing asked of the map: leave it alone
        mapEverStyled = mapEverStyled || styled;
        if (!mapCaptured) {
            try { if (!MAP.isStyleLoaded()) return; captureStyleLayers(); mapCaptured = true; } catch (e) { return; }
        }
        Object.keys(REG).forEach(id => {
            if (!MAP.getLayer(id)) return;
            const R = REG[id], L = layerOf(id), T = TOUCHED[id] || (TOUCHED[id] = {});
            const pk = new Set(Object.keys(R.paint));
            if (L.paint) Object.keys(L.paint).forEach(p => pk.add(p));
            const F = FILE[id] || {};
            if (F.paint) Object.keys(F.paint).forEach(p => pk.add(p));
            if (OFF ? (own(T, 'z')) : (own(F, 'minzoom') || own(F, 'maxzoom') || own(T, 'z'))) {
                const mn = !OFF && own(F, 'minzoom') ? F.minzoom : R.minzoom, mx = !OFF && own(F, 'maxzoom') ? F.maxzoom : R.maxzoom;
                try { MAP.setLayerZoomRange(id, mn === null || mn === undefined ? 0 : mn, mx === null || mx === undefined ? 24 : mx); T.z = 1; } catch (e) {}
            }
            if (L.dash && (R.type || MAP.getLayer(id).type) === 'line') pk.add('line-dasharray');
            Object.keys(T).filter(k => k.startsWith('p:')).forEach(k => pk.add(k.slice(2)));
            pk.forEach(p => {
                const orig = R.paint[p];
                let v = xPaint(id, p, orig);
                if (orig === undefined && v !== undefined) T['p:' + p] = 1;
                if (orig === undefined && v === undefined) { if (!T['p:' + p]) return; delete T['p:' + p]; v = undefined; }
                try { O.setPaintProperty.call(MAP, id, p, v === undefined ? null : v); } catch (e) {}
            });
            const lk = new Set(Object.keys(R.layout));
            lk.add('visibility');
            if (L.layout) Object.keys(L.layout).forEach(p => lk.add(p));
            if (F.layout) Object.keys(F.layout).forEach(p => { if (p !== 'visibility') lk.add(p); });
            Object.keys(T).filter(k => k.startsWith('l:')).forEach(k => lk.add(k.slice(2)));
            lk.forEach(p => {
                const orig = R.layout[p];
                let v = xLayout(id, p, orig);
                if (orig === undefined && v !== undefined) T['l:' + p] = 1;
                if (orig === undefined && v === undefined) { if (!T['l:' + p]) return; delete T['l:' + p]; v = p === 'visibility' ? 'visible' : undefined; }
                if (p === 'visibility' && v === undefined) v = 'visible';
                try { O.setLayoutProperty.call(MAP, id, p, v === undefined ? null : v); } catch (e) {}
            });
        });
    }
    function whenMap(fn) {
        const ready = () => { try { return MAP && MAP.isStyleLoaded(); } catch (e) { return false; } };
        if (ready()) return fn();
        const t = setInterval(() => { if (ready()) { clearInterval(t); fn(); } }, 120);
        setTimeout(() => clearInterval(t), 60000);
    }

    // ── apply ────────────────────────────────────────────────────────────
    let queued = false;
    function applyNow() {
        queued = false;
        try { applyCss(); } catch (e) { console.warn('[style] css', e); }
        try { applyRules(); } catch (e) { console.warn('[style] rules', e); }
        try { watchDom(); } catch (e) { console.warn('[style] page', e); }
        try { applyMap(); } catch (e) { console.warn('[style] map', e); }
    }
    function apply() { if (!queued) { queued = true; requestAnimationFrame(applyNow); } }

    const api = {
        EDIT, PAGE_MODE, KEY, MEDIA, BAKED,
        get state() { return S; },
        set state(v) { S = norm(v); apply(); },
        get off() { return OFF; },
        set off(v) { OFF = !!v; apply(); },
        get map() { return MAP; },
        layers: REG,
        get mapFile() { return FILE; },
        apply, applyNow, applyCss, buildCss, remapValue, colorKey, remapColorText, collectRules, rules: RULES, norm, blank,
        saveDraft() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} },
        clearDraft() { try { localStorage.removeItem(KEY); } catch (e) {} }
    };
    window.__dbStyle = api;

    loadMapFile();
    // First pass now (stylesheets are parsed), again once the page has built itself.
    applyNow();
    document.addEventListener('DOMContentLoaded', apply);
    window.addEventListener('load', apply);
    whenMap(apply);
    // Sheets added later (MapLibre's own) are read when they arrive.
    new MutationObserver(ms => { if (ms.some(m => [...m.addedNodes].some(n => (n.tagName === 'STYLE' || n.tagName === 'LINK') && !/^dbx/.test(n.id || '')))) apply(); })
        .observe(document.head || document.documentElement, { childList: true });

    if (EDIT) {
        const me = document.currentScript && document.currentScript.src;
        const base = me ? me.replace(/[^\/]*$/, '') : 'editor/';
        const s = document.createElement('script');
        s.src = base + 'style-editor.js?v=' + Date.now();
        s.defer = true;
        (document.body || document.documentElement).appendChild(s);
    }
})();
