#!/usr/bin/env python3
"""Put one finished DoD run on the map, as a draft.

    python tools/add_dod_run.py <run_dir> [<run_dir> ...] [--publish]
    python tools/add_dod_run.py --root <runs_folder> [--after-batch]
    python tools/add_dod_run.py <run_dir> [<run_dir> ...] --plan-check
    python tools/add_dod_run.py --root <runs_folder> --refresh

--rebuild is for runs that were recomputed (the co-registration of 5 October 2026):
every run under --root is drawn again from its folder. A run with a plan check is
rebuilt too: its tiles and click targets, then the plan finding again from the plan
outlines already in the run folder (--slide TEXT as for --plan-check), its flags,
its outlines and its figures in index.html. Its click targets as they were are
kept in the run folder as dod_<slug>_map_before_rebuild.geojson. The tiles of the
run before are moved, not removed, to <runs_folder>/../tiles_replaced/.

--refresh is for runs that are already on the map: it carries over what can change
in a run folder without the run being recomputed, which is the calculated-area
outline and its hectares (mismo_dato.py), the kommune outline, and the flags on the
click targets (marca_pendiente.py). No tile is redrawn and no plan finding touched.

--plan-check is for a run that is already on the map: it fetches the plan
outlines from the DiBK NAP WMS (fetch_nap_plans.py, kept as nap_plans.geojson in
the run folder), writes the plan finding into the run's click targets
(make_plan_flags.py) and marks the run plan: true. Add --slide TEXT to set a
landslide aside. Nothing is recomputed or redrawn.

--root takes every finished run under a folder such as .../ANALISIS/DoD/runs_1m.
--after-batch first waits for run_lote.py to write its "finished" line there.
A run that is already on the map with a plan check (Gjerdrum) is left alone:
replacing it would throw the plan finding away.

<run_dir> is a folder written by unigis_tesis/lote_dod/run_lote.py. It must hold
DoD_final.tif, new_aligned.tif, poligonos.gpkg, footprint.geojson,
run_summary.json and run_params.json.

For each run this
  1. builds the tiles and click targets            (make_dod_tiles.py)
  2. adds its calculated-area outline              (make_dod_footprints.py)
  3. writes or replaces its entry in index.html, marked draft: true

A draft run is not shown on the public map. Open the map with ?review in the
address to see it. When it has been looked at, run this again with --publish
(nothing is recomputed) or delete "draft: true, " from its line in index.html.

Every run is drawn against the same colour range, +/-12.1 m, so one legend
serves the whole map. A run larger than 250 M pixels is drawn from a 2 m (or
coarser) copy of its rasters; the figures always come from the 1 m run.
"""
import json, math, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, 'tools'))
from make_dod_footprints import polygonal          # noqa: E402
RNG = 12.093
ASIDE = None
MAX_PX = 250e6
FOLD = str.maketrans({'ø': 'o', 'Ø': 'o', 'å': 'a', 'Å': 'a', 'æ': 'ae', 'Æ': 'ae', 'é': 'e'})


def slug_of(p):
    name = re.sub(r'[^a-z0-9]+', '_', p['kommune'].translate(FOLD).lower()).strip('_')
    return f"{name}_{p['epochs']['old']}_{p['epochs']['new']}"


def bbox(coords, b=None):
    b = b or [180, 90, -180, -90]
    if isinstance(coords[0], (int, float)):
        return [min(b[0], coords[0]), min(b[1], coords[1]), max(b[2], coords[0]), max(b[3], coords[1])]
    for c in coords:
        b = bbox(c, b)
    return b


def land_of(run):
    """The kommune's land in hectares, when lote_dod/limite_kommune.py has written it."""
    k = os.path.join(run, 'kommune.geojson')
    return json.load(open(k, encoding='utf-8'))['properties']['ha_land'] if os.path.exists(k) else None


def set_land(slug, land):
    """Write the kommune's land into a run's entry without touching the rest of it."""
    if not land:
        return
    path = os.path.join(HERE, 'index.html')
    html = open(path, encoding='utf-8').read()
    new, n = re.subn(r"(\{ id: '" + re.escape(slug) + r"',.*?area: [\d.]+,)( land: [\d.]+,)?",
                     lambda m: m.group(1) + f' land: {land},', html, count=1, flags=re.S)
    if n and new != html:
        open(path, 'w', encoding='utf-8', newline='').write(new)


def slope_flags(slug, run):
    """Carry the steep-ground flags (lote_dod/marca_pendiente.py) into the click targets."""
    if os.path.exists(os.path.join(run, 'slope_flags.csv')):
        subprocess.run([sys.executable, '-X', 'utf8', os.path.join(HERE, 'tools', 'make_slope_flags.py'),
                        slug, run], check=True)


def set_area(slug, area):
    """Write the calculated area into a run's entry without touching the rest of it."""
    path = os.path.join(HERE, 'index.html')
    html = open(path, encoding='utf-8').read()
    new, n = re.subn(r"(\{ id: '" + re.escape(slug) + r"',.*?area: )[\d.]+", lambda m: m.group(1) + str(round(area, 1)),
                     html, count=1, flags=re.S)
    if n and new != html:
        open(path, 'w', encoding='utf-8', newline='').write(new)


def set_counts(slug, count, ha):
    """Write polygon count and changed hectares into a run's entry."""
    path = os.path.join(HERE, 'index.html')
    html = open(path, encoding='utf-8').read()
    new, n = re.subn(r"(\{ id: '" + re.escape(slug) + r"',.*?count: )\d+(, ha: )[\d.]+",
                     lambda m: m.group(1) + str(count) + m.group(2) + str(ha), html, count=1, flags=re.S)
    if n and new != html:
        open(path, 'w', encoding='utf-8', newline='').write(new)


def tiles_cmd(run, slug, p, root):
    px = p['grid']['width'] * p['grid']['height']
    cmd = [sys.executable, '-X', 'utf8', os.path.join(HERE, 'tools', 'make_dod_tiles.py'), run, slug,
           '--rng', str(RNG), '--plan-unchecked']
    if px > MAX_PX:
        cmd += ['--res', str(float(math.ceil(math.sqrt(px / MAX_PX))))]
    if ASIDE or root:
        cmd += ['--aside', ASIDE or os.path.join(os.path.dirname(os.path.abspath(root)), 'tiles_replaced')]
    return cmd


def entry(slug, p, s, fp, draft, land=None):
    b = bbox(polygonal(fp['geometry'])['coordinates'])
    b = [round(b[0] - 0.002, 5), round(b[1] - 0.001, 5), round(b[2] + 0.002, 5), round(b[3] + 0.001, 5)]
    years = f"{p['epochs']['old']}–{p['epochs']['new']}"
    return (f"        , {{ id: '{slug}', kommune: '{p['kommune']}', years: '{years}',"
            f" tiles: 'data/dod/{slug}/{{z}}/{{x}}/{{y}}.png', geojson: 'data/dod_{slug}.geojson',"
            f" bounds: {json.dumps(b)}, count: {s['n_poligonos']}, ha: {round(s['area_total_m2'] / 1e4, 1)},"
            f" area: {round(fp['properties']['ha'], 1)},{f' land: {land},' if land else ''} plan: false, {'draft: true, ' if draft else ''}"
            f"src: 'DoDetector, DTM1' }}\n")


def has_plan_check(slug):
    html = open(os.path.join(HERE, 'index.html'), encoding='utf-8').read()
    # Up to "src:", not to the first brace: the tile URL has braces of its own.
    m = re.search(r"\{ id: '" + re.escape(slug) + r"',.*?src:", html, re.S)
    return bool(m and 'plan: true' in m.group(0))


def plan_check(run, slug, p, slide=None):
    gj = os.path.join(HERE, 'data', f'dod_{slug}.geojson')
    if not os.path.exists(gj):
        sys.exit(f'{slug} is not on the map yet; add it first')
    plans = os.path.join(run, 'nap_plans.geojson')
    tool = lambda n: os.path.join(HERE, 'tools', n)
    if not os.path.exists(plans):
        subprocess.run([sys.executable, '-X', 'utf8', tool('fetch_nap_plans.py'), run, plans], check=True)
    n = len(json.load(open(plans, encoding='utf-8'))['features'])
    if not n:
        print('   the service holds no plan here (kommuner such as Lillestrøm and Oslo deliver none); '
              'left as "not checked"')
        return
    cmd = [sys.executable, '-X', 'utf8', tool('make_plan_flags.py'), slug, plans,
           str(p['epochs']['old']), str(p['epochs']['new'])]
    subprocess.run(cmd + (['--slide', slide] if slide else []), check=True)
    path = os.path.join(HERE, 'index.html')
    html = open(path, encoding='utf-8').read()
    m = re.search(r"        , \{ id: '" + re.escape(slug) + r"',[^\n]*\n", html)
    if not m:
        if has_plan_check(slug):               # the first entry is written by hand, over several lines
            print(f'   index.html: {slug} already marked as checked')
            return
        sys.exit(f'{slug} has no line in DOD_RUNS')
    html = html.replace(m.group(0), m.group(0).replace('plan: false', 'plan: true'))
    open(path, 'w', encoding='utf-8', newline='').write(html)
    print(f'   index.html: {slug} now carries its plan finding')


def register(line, slug):
    path = os.path.join(HERE, 'index.html')
    html = open(path, encoding='utf-8').read()
    html = re.sub(r"        , \{ id: '" + re.escape(slug) + r"',[^\n]*\n", '', html)
    mark = '        /*NEXT_RUN*/'
    if html.count(mark) != 1:
        sys.exit('index.html has no /*NEXT_RUN*/ marker in DOD_RUNS')
    html = html.replace(mark, line + mark)
    open(path, 'w', encoding='utf-8', newline='').write(html)


if __name__ == '__main__':
    args = sys.argv[1:]
    publish = '--publish' in args
    slide = None
    if '--slide' in args:
        i = args.index('--slide'); slide = args[i + 1]; del args[i:i + 2]
    if '--aside' in args:           # where a rebuilt run's earlier tiles are moved to
        i = args.index('--aside'); ASIDE = args[i + 1]; del args[i:i + 2]
    root = args[args.index('--root') + 1] if '--root' in args else None
    runs = [a for a in args if not a.startswith('--') and a != root]
    if root:
        log = os.path.join(root, 'lote.log')
        while '--after-batch' in args:
            txt = open(log, encoding='utf-8', errors='replace').read()
            if '##### finished' in txt[txt.rfind('args='):]:
                break
            time.sleep(60)
        for dp, dn, fn in os.walk(root):
            if '_validation' in dp or 'before_coregistration' in dp:   # earlier results kept beside a run
                continue
            if {'run_params.json', 'footprint.geojson', 'poligonos.gpkg'} <= set(fn):
                runs.append(dp)
    if not runs:
        sys.exit(__doc__)
    for run in sorted(runs):
        p = json.load(open(os.path.join(run, 'run_params.json'), encoding='utf-8'))
        s = json.load(open(os.path.join(run, 'run_summary.json'), encoding='utf-8'))
        fp = json.load(open(os.path.join(run, 'footprint.geojson'), encoding='utf-8'))
        p['kommune'] = {'Skipvet': 'Skiptvet'}.get(p['kommune'], p['kommune'])   # misspelt in the config
        slug = slug_of(p)
        print(f'== {slug}', flush=True)
        if '--refresh' in args:
            if not os.path.exists(os.path.join(HERE, 'data', f'dod_{slug}.geojson')):
                print('   not on the map; skipped')
                continue
            subprocess.run([sys.executable, '-X', 'utf8', os.path.join(HERE, 'tools', 'make_dod_footprints.py'),
                            f'{slug}={run}'], check=True)
            set_land(slug, land_of(run))
            set_area(slug, fp['properties']['ha'])
            slope_flags(slug, run)
            continue
        if '--plan-check' in args:
            plan_check(run, slug, p, slide)
            slope_flags(slug, run)
            continue
        gj = os.path.join(HERE, 'data', f'dod_{slug}.geojson')
        checked = os.path.exists(gj) and '"pl":' in open(gj, encoding='utf-8').read()
        if (has_plan_check(slug) or checked) and '--rebuild' in args:
            keep = os.path.join(run, f'dod_{slug}_map_before_rebuild.geojson')
            if not os.path.exists(keep):
                open(keep, 'w', encoding='utf-8').write(open(gj, encoding='utf-8').read())
            subprocess.run(tiles_cmd(run, slug, p, root), check=True)
            plan_check(run, slug, p, slide)
            slope_flags(slug, run)
            subprocess.run([sys.executable, '-X', 'utf8', os.path.join(HERE, 'tools', 'make_dod_footprints.py'),
                            f'{slug}={run}'], check=True)
            set_land(slug, land_of(run))
            set_area(slug, fp['properties']['ha'])
            set_counts(slug, s['n_poligonos'], round(s['area_total_m2'] / 1e4, 1))
            print('   rebuilt with its plan check')
            continue
        if has_plan_check(slug) or checked:
            # The outlines carry no finding, so they can follow the run folder.
            subprocess.run([sys.executable, '-X', 'utf8', os.path.join(HERE, 'tools', 'make_dod_footprints.py'),
                            f'{slug}={run}'], check=True)
            set_land(slug, land_of(run))
            slope_flags(slug, run)
            print('   already on the map with a plan check; only its outlines and steep-ground flags were refreshed')
            continue
        if not s.get('n_poligonos'):
            print('   no change polygons in this run; nothing to draw')
            continue
        have = os.path.exists(os.path.join(HERE, 'data', f'dod_{slug}.geojson'))
        if not (publish and have):
            subprocess.run(tiles_cmd(run, slug, p, root if '--rebuild' in args else None), check=True)
            slope_flags(slug, run)
        subprocess.run([sys.executable, '-X', 'utf8', os.path.join(HERE, 'tools', 'make_dod_footprints.py'),
                        f'{slug}={run}'], check=True)
        register(entry(slug, p, s, fp, not publish, land_of(run)), slug)
        print(f"   index.html: {slug} {'published' if publish else 'added as draft'}")
