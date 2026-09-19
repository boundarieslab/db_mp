# db_mp — Dirty Business map

The interactive map behind [dirtybusiness.no](https://dirtybusiness.no), published at
**https://boundarieslab.github.io/db_mp/**. It plots mass reception facilities
(landfills, massemottak, quarries, sorting plants) against the construction projects
that generate the surplus masses, in the Greater Oslo region.

A project of the Laboratory for Urban Boundaries.

## How it fits together

```
db_database (Google Sheet, hello@lub.global)
        |
        |  File > Share > Publish to web > CSV, one published URL per tab
        v
  two published CSVs ---> index.html ---> MapLibre map, site window, table
        |                     |
        |                     |-- data/*.geojson        footprints, DoD, plan sweep
        |                     `-- network/*.html        ownership graphs, in an iframe
        v
   the map reads the sheet live: edit a cell, reload the map, the change is there.
   Nothing is committed to this repo when the data changes.
```

Everything is one file. `index.html` carries the markup, the CSS and the whole
application. Only MapLibre GL JS 4.7.1 and PapaParse 5.4.1 are loaded from a CDN.

The map was Leaflet 1.9.4 until September 2026 and was ported to MapLibre GL so
that terrain can be tilted. Two things about MapLibre are worth knowing before
editing the file:

* **Zoom is counted against 512px tiles.** Every service used here serves 256px
  tiles, so a source declared `tileSize: 256` is fetched one level deeper than the
  map's own zoom. Leaflet zoom 10 is MapLibre zoom 9, and every zoom number in
  `index.html` is MapLibre's. A source's `minzoom` / `maxzoom` stay in tile terms.
* **A source's `maxzoom` replaces Leaflet's `maxNativeZoom`.** Past it the deepest
  real tile is stretched rather than requested and 404'd, which is what keeps
  Kartverket's basemap (nothing above tile zoom 18) on screen at full zoom.

The map needs WebGL; a browser without it gets a message rather than a grey rectangle.

## The interface

```
+-- bar (left) -----------+                               +-- site window --+
| search · EN NO          |                               | aerial, framed  |
| RECEPTION | CONSTRUCTION| TERRAIN CHANGE                | on the footprint|
|  the tab's own switches |                               | status, owner,  |
| tools: key 3D light     |          the map              | network graph   |
|  section select reset   |                               +-----------------+
|  share · help           |
| layers: background, 3D, |   compass (click: north up, drag: turn)
|  plan coverage          |   zoom, scale
+-------------------------+
+-- table: the database, and the legend: its colour boxes switch the map --+
+-- status line: what is shown, coordinates (WGS84 / UTM 33), attribution --+
```

* **Colour is status and nothing else, and every hue is pure** — HSL saturation
  100 across the board. The lifecycle is carried by hue, lightness and the line,
  never by desaturating a colour.

  | | closed / finished | running | still to come | other |
  |---|---|---|---|---|
  | Reception | `#FFD400` yellow | `#FF0000` red | `#FF8000` orange, dashed | `#B300FF` violet: built for contaminated masses |
  | Construction | `#00B218` deep green | `#00FF00` green | `#95FF00` chartreuse, dashed | |
  | Either | | | | `#FFFFFF` hollow, dotted: no status |
  | Terrain change | | | | `#007FFF` blue |

  Outline 2px and 18% fill while it runs, 1.5px and 12% once it is over, dashed
  and 10% before it is built. The classes and colours are in `CLASSES` in
  `index.html`; the sheet's free-text `Status` is classified by `statusClass()`,
  and a `StatusClass` column, if the sheet grows one, wins.
* **Red and green sit close together** for a red-green colour-blind reader, so
  the two families are also told apart by shape: a reception site is drawn on a
  round plate, a construction project on a square one.
* **Every site is its pictogram.** The mark says what the place is, drawn black
  and white; the plate under it says what state it is in. A site with a footprint
  also draws its outline, at every zoom — pure colour, thin fill, soft glow. Marks
  are fetched only when the map first asks for one.
* **The table is the legend.** Its colour boxes filter the map and the table
  together; alt-click shows one colour alone. Hovering a row lights the site on the
  map and shows an aerial of the whole site; clicking opens it.
* **3D never moves the map.** Right-drag or Ctrl-drag turns and tilts, always.
* **SHARE copies the whole view**: `#site=UID&v=zoom/lat/lon/bearing/pitch&l=layers`.
  A bare `#site=UID` still works.
* Icons are 1-bit, drawn on a 16 px grid, and generated as inline SVG paths.

## Repository layout

| Path | What it is |
|---|---|
| `index.html` | The entire application. |
| `network/*.html` | One standalone ownership-network graph per facility, opened in an iframe in the site window. Reception nodes are `#FF0000`, construction nodes `#00FF00`; the map passes the site's own status colour as `?fc=RRGGBB`. |
| `picto_grammar/*.png` | The pictogram grammar at drawing size. Naming: `f_*` facility, `cp_*` construction project; `_r_` receiving, `_s_` source; then the type. |
| `assets/marks/*.png` | The same 29 marks trimmed to 88px for the map, plus the 9 plates (`plate-<category>-<class>.png`). Rebuilt from `picto_grammar/` whenever the grammar changes. |
| `data/facility_polygons.geojson` | Hand-resolved facility footprints, joined to the sheet by `uid`. |
| `data/plan_coverage.geojson` | The national plan sweep, context only. |
| `data/dod/<slug>/{z}/{x}/{y}.png` | Pre-rendered DoD tiles, z11-16. Only tiles containing change exist, so a 404 inside the layer bounds is the normal case. |
| `data/dod_<slug>.geojson` | The same change as polygons, loaded invisibly as click targets. Properties: `a` area, `v` volume, `dh` mean change, `pl` plan finding (0 none, 1 in force during the window, 2 adopted later, 3 date unknown), `pn` / `pd` plan name and date, `ls` the Gjerdrum landslide. |
| `tools/make_dod_tiles.py` | Builds both of the above from one pipeline run. |
| `tools/smoke_test.js` | Headless checks of everything that has broken before, plus the interface rules above. |
| `tools/fixtures/` | Stub CSVs, an embed page and a synthetic DEM tile, so the test runs offline. |

## Data sources

| Source | Used for |
|---|---|
| Google Sheet `db_database`, Facilities tab (published CSV) | reception sites, table, site window |
| Google Sheet, construction projects tab (published CSV) | construction projects, same |
| Esri World Imagery | default basemap, and the static aerials in the hover card and site window |
| Kartverket `topograatone` WMTS | grey basemap |
| Kartverket stedsnavn API (`ws.geonorge.no/stedsnavn`) | place names in search |
| Tilezen terrain tiles (Kartverket 10 m) and our own DTM1 Terrarium tiles | 3D, light, cross sections, ground height on click |
| Esri Wayback WMTS | historical imagery, one release pinned per year 2014-2025 in `WAYBACK_YEARS` |
| `unigis_tesis` DoD run (Kartverket DTM1) | the DoD layer, pre-rendered into `data/dod/` |

## The DoD layer

The map's own measurement, not a third-party service. It is drawn the same way the
thesis figures are drawn, so the two can be read side by side: dh in matplotlib
`turbo`, `Normalize(-rng, +rng, clip=True)`, multiplied by a hillshade of the newer
DTM (`LightSource(315, 45)`, `vert_exag=2`, `shade = 0.40 + 0.60 * hs`), with
`rng = min(max(|p2|, |p98|), 25)`. That shading is per pixel, so the layer has to be
a raster; a polygon fill cannot show the terraces inside a deposit.

The raster is clipped to the vectorised change polygons. `DoD_final.tif` still holds
thin registration threads along streams and roads - about 20 % of its valid pixels in
Gjerdrum - which the pipeline's own vectorisation discards. Left in, they make a whole
municipality read as green.

To add a municipality, from a finished run holding `DoD_final.tif`,
`new_aligned.tif` and `poligonos.gpkg`:

    python tools/make_dod_tiles.py <run_dir> <slug>

Then add one entry to `DOD_RUNS` in `index.html` with the bounds and counts it
prints; the TERRAIN CHANGE tab lists runs from that array. Currently only
`gjerdrum_2007_2020` exists, because it is the only completed run outside the `G:`
drive.

## The Facilities columns the map actually reads

`UID` - `Name` - `Latitude` - `Longitude` - `Status` - `Type` - `Subtype` -
`Municipality` - `County` - `Company` - `Operator` - `OrgNr` - `ParentCompany` -
`MassesAccepted` - `Area_m2` - `AnnualCapacity` - `TotalCapacity` - `PermitRef` -
`Description` - `Description_NO` - `Images` (comma-separated URLs) - `GraphURL` -
`Website` - `PermitDocuments` - `Sources` - optionally `StatusClass`
(active / future / old / contaminated).

A record without coordinates is listed in the table and opens in the site window,
but is not drawn.

Anything else in the sheet is reference material for the investigation, not map input.

## GraphURL

`GraphURL` should be
`https://boundarieslab.github.io/db_mp/network/<file>.html`.

Two older shapes are still in the sheet and neither works in an iframe:
`dirtybusiness.github.io/network-maps/...` returns 404 (that repo does not exist), and
a `github.com/.../blob/...` link serves the source-code page, which GitHub refuses to
frame (`X-Frame-Options: DENY`).

So `index.html` does not trust the column. `resolveGraphURL()` reduces whatever is
there to a filename, maps a handful of legacy names through `GRAPH_ALIASES`, and
serves it from this repo if it is in `KNOWN_GRAPHS`. A URL pointing anywhere else is
passed through unchanged, so an external graph still works. **When you add a graph
file, add its name to `KNOWN_GRAPHS`.**

## Adding a facility

1. Add a row to the Facilities tab. Coordinates in WGS84 decimal degrees.
2. `UID` follows `COUNTY_MUNICIPALITY_NUMBER`, two letters each, three digits:
   `AK_LI_003`. Several existing rows do not, see below.
3. Write `Status` so it starts with the state: `active`, `closed`, `planned`.
4. If there is an ownership graph, drop the HTML file in `network/`, add the filename
   to `KNOWN_GRAPHS` in `index.html`, and put the full
   `boundarieslab.github.io/db_mp/network/...` URL in `GraphURL`.
5. Reload the map. No deploy step for data-only changes.

## Testing

    python3 -m http.server 8901 --bind 127.0.0.1     # from the repo root
    node tools/smoke_test.js

Sheet CSVs and every tile server are stubbed, so the result never depends on
Kartverket or Esri being up. It needs `playwright` and, for a fully offline run, the
two CDN libraries copied into `vendor/`.

## Known gaps

- **Most of the 94 facilities have no coordinates yet**, so they are in the table but
  not on the map. Construction projects need coordinates too.
- **Footprints cover 19 of the 94 researched facilities.** `data/facility_polygons.geojson`
  holds the extents resolved by hand against reguleringsplaner, cadastral parcels and
  NGU delineations; the other 75 sites are still a point, and until they have an extent
  nothing can be joined to them. `data/plan_coverage.geojson` puts the national sweep
  underneath as context: 1 736 polygons, classified old / current / future, drawn as
  pale hairlines and never clickable.
- **The DoD layer covers Gjerdrum only.** Every other municipality needs a pipeline
  run, which needs the `G:` source drive.
- **Nothing joins detected change to the facility that received the masses.** Both are
  on the map, but only visually.
- **The plan finding comes from the national register**, which holds nothing for Oslo
  or Lillestrøm, and only plans still in force; "no plan on record" is an upper bound.
