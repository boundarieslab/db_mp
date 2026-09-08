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
  two published CSVs ---> index.html ---> Leaflet map + sidebar
        |                     |
        |                     |-- picto_grammar/*.png   marker icons, by type
        |                     `-- network/*.html        ownership graphs, in an iframe
        v
   the map reads the sheet live: edit a cell, reload the map, the change is there.
   Nothing is committed to this repo when the data changes.
```

Everything is one file. `index.html` carries the markup, the CSS and the whole
application. Only Leaflet 1.9.4 and PapaParse 5.4.1 are loaded from a CDN.

## Repository layout

| Path | What it is |
|---|---|
| `index.html` | The entire application. |
| `network/*.html` | One standalone ownership-network graph per facility, opened in an iframe in the sidebar. Most are hand-built D3-style graphs in IBM Plex Mono. |
| `picto_grammar/*.png` | The marker pictogram set. Naming: `f_*` facility, `cp_*` construction project; `_r_` receiving, `_s_` source; then the type (`f_d_inert`, `cp_r_bolig`, and so on). |

## Data sources

| Source | Used for |
|---|---|
| Google Sheet `db_database`, Facilities tab (published CSV) | facility markers and sidebar |
| Google Sheet, construction projects tab (published CSV) | project markers and sidebar |
| Kartverket `topograatone` WMTS | grayscale basemap |
| Esri World Imagery | satellite basemap |
| Esri Wayback WMTS | historical imagery, one release pinned per year 2014-2025 in `WAYBACK_YEARS` |
| Geonorge `wms.hoyde-dom1_33`, layer `DOM1_33_Terrengskygge` | terrain hillshade overlay |

## The Facilities columns the map actually reads

`UID` - `Name` - `Latitude` - `Longitude` - `Status` - `Type` - `Municipality` -
`County` - `Company` - `Operator` - `OrgNr` - `ParentCompany` - `Description` -
`Description_NO` - `Images` (comma-separated URLs, drives the slideshow) -
`GraphURL` - `Website` - `PermitDocuments`

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
3. Set `Type` to a value that has a pictogram in `picto_grammar/`.
4. If there is an ownership graph, drop the HTML file in `network/`, add the filename
   to `KNOWN_GRAPHS` in `index.html`, and put the full
   `boundarieslab.github.io/db_mp/network/...` URL in `GraphURL`.
5. Reload the map. No deploy step for data-only changes.

## Known gaps

- **The database is smaller than it claims.** The sheet's own user guide and its
  Statistics tab describe 58 facilities across 7 counties. The Facilities tab holds
  19 filled rows, all in Oslo, Akershus and Ostfold. The 58 is a target.
- **No facility footprints.** The `FacilityPolygons` tab is an empty template, so
  every site is a point and extent cannot be drawn or joined to anything.
- **`RelatedGeometries` references facilities that do not exist** in the Facilities
  tab: `BU_DR_001`, `BU_LI_003`, `OF_FR_001`.
- **UID scheme is inconsistent**: `AK_LI_002` next to `AK_UL_00120`, `AK_LI_00512`,
  and a bare `C28`.
- **Two graphs are LibreOffice exports, not master networks**, and look nothing like
  the rest: `skedsmo_massesenter_network.html` (447 KB) and
  `veidekke_gardermoen_network.html`.
- **Two graphs have no facility**: `mr_pukk_network.html` (Mr. Pukk Furuset) and
  `feiring_bruK_enebakk_network.html` (Feiring Bruk, Enebakk), both sites that exist
  in reality but not yet in the database.
- The DoD change polygons produced by the detection pipeline are not on this map.
  Connecting detected terrain change to the facility that received the masses is the
  obvious next step.
