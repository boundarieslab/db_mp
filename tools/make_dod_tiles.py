#!/usr/bin/env python3
"""Turn one unigis_tesis DoD run into the web map's DoD layer.

    python tools/make_dod_tiles.py <run_dir> <slug>

<run_dir> is a folder like
    unigis_tesis/data/outputs/AK_GJERDRUM/2007_to_2020
holding DoD_final.tif, new_aligned.tif and poligonos.gpkg.

It writes two things into data/:
    data/dod/<slug>/{z}/{x}/{y}.png    the picture
    data/dod_<slug>.geojson            the click targets

The picture follows src/unigis_tesis/diagramas/perfil_topografico.py exactly, so
the map and the thesis figures show the same thing: dh in matplotlib "turbo",
symmetric around zero, multiplied by a hillshade of the newer DTM. That shading
is per pixel, which is why this is a raster and not a polygon fill.

Requires: rasterio, fiona, shapely, pyproj, matplotlib, pillow, numpy.
"""
import json, math, os, sys
import numpy as np
import rasterio, fiona
import matplotlib as mpl, matplotlib.colors as mcolors
from rasterio.features import rasterize
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform_bounds
from rasterio.transform import from_origin
from shapely.geometry import shape, mapping
from shapely.ops import transform as shp_transform
from pyproj import Transformer
from PIL import Image

ZMIN, ZMAX = 11, 16
R = 20037508.342789244
SIMPLIFY_DEG = 0.00003      # click targets only; not drawn
COORD_DECIMALS = 5          # ~1 m, and it halves the file


def change_mask(dod_path, gpkg_path):
    """Valid DoD pixels that fall inside a vectorised change polygon.

    DoD_final still carries thin registration threads along streams and roads -
    about 20% of its valid pixels in Gjerdrum. The pipeline's own vectorisation
    already drops them, so the map drops them too; left in, they turn a whole
    municipality green."""
    with rasterio.open(dod_path) as s:
        d = s.read(1)
        valid = np.isfinite(d) & (d != s.nodata)
        with fiona.open(gpkg_path, layer='poligonos_cambio') as src:
            geoms = [shape(f['geometry']) for f in src]
        poly = rasterize(((g, 1) for g in geoms), out_shape=(s.height, s.width),
                         transform=s.transform, fill=0, dtype='uint8').astype(bool)
    return d, valid & poly, len(geoms)


def composite(run, out_tif):
    dtm = os.path.join(run, 'new_aligned.tif')
    with rasterio.open(dtm) as s:
        prof = s.profile
        elev = s.read(1).astype(np.float32)
        nod = s.nodata
    elev[elev == nod] = np.nan
    np.copyto(elev, np.float32(np.nanmedian(elev)), where=np.isnan(elev))

    # matplotlib LightSource(315, 45).hillshade(elev, vert_exag=2, dx=1, dy=1),
    # written out in float32 because the array is 115 M pixels.
    e_dy, e_dx = np.gradient(np.float32(2.0) * elev, np.float32(-1.0), np.float32(1.0))
    del elev
    az, alt = math.radians(90 - 315), math.radians(45)
    d0, d1, d2 = math.cos(az) * math.cos(alt), math.sin(az) * math.cos(alt), math.sin(alt)
    mag = np.sqrt(e_dx * e_dx + e_dy * e_dy + 1.0, dtype=np.float32)
    inten = (-e_dx * np.float32(d0) - e_dy * np.float32(d1) + np.float32(d2)) / mag
    del e_dx, e_dy, mag
    lo, hi = float(inten.min()), float(inten.max())
    inten -= np.float32(lo); inten /= np.float32(hi - lo)
    np.clip(inten, 0, 1, out=inten)
    shade = np.float32(0.40) + np.float32(0.60) * inten
    del inten

    d, mask, npoly = change_mask(os.path.join(run, 'DoD_final.tif'),
                                 os.path.join(run, 'poligonos.gpkg'))
    vals = d[mask].astype(np.float64)
    del d
    rng = min(max(abs(np.percentile(vals, 2)), abs(np.percentile(vals, 98))), 25.0) or 5.0
    print(f'  {npoly} polygons, {mask.sum():,} px, rng +/-{rng:.3f} m')

    rgb = mpl.colormaps.get_cmap('turbo')(mcolors.Normalize(-rng, rng, clip=True)(vals))[:, :3]
    rgb *= shade[mask][:, None]
    del shade, vals

    # RGB stays premultiplied by alpha (0 where transparent) so that resampling
    # never bleeds black in from outside the change.
    rgba = np.zeros((4,) + mask.shape, np.uint8)
    for b in range(3):
        rgba[b][mask] = np.clip(rgb[:, b] * 255, 0, 255).astype(np.uint8)
    rgba[3][mask] = 255
    del rgb

    prof.update(dtype='uint8', count=4, nodata=None, compress='deflate', zlevel=9,
                predictor=2, tiled=True, blockxsize=256, blockysize=256,
                photometric='RGB', BIGTIFF='IF_SAFER')
    with rasterio.open(out_tif, 'w', **prof) as dst:
        dst.write(rgba)
        dst.colorinterp = [rasterio.enums.ColorInterp.red, rasterio.enums.ColorInterp.green,
                           rasterio.enums.ColorInterp.blue, rasterio.enums.ColorInterp.alpha]
    return rng


def lonlat_to_tile(lon, lat, z):
    n = 2 ** z
    lr = math.radians(lat)
    return ((lon + 180.0) / 360.0 * n,
            (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n)


def tiles(src_tif, outdir):
    written = skipped = nbytes = 0
    with rasterio.open(src_tif) as src:
        w, s, e, n = transform_bounds(src.crs, 'EPSG:4326', *src.bounds, densify_pts=51)
        for z in range(ZMIN, ZMAX + 1):
            x0f, y1f = lonlat_to_tile(w, s, z)
            x1f, y0f = lonlat_to_tile(e, n, z)
            X0, Y0 = int(math.floor(x0f)), int(math.floor(y0f))
            nx = int(math.floor(x1f)) - X0 + 1
            ny = int(math.floor(y1f)) - Y0 + 1
            res = 2 * R / (2 ** z * 256)
            tr = from_origin(-R + X0 * 256 * res, R - Y0 * 256 * res, res, res)
            dst = np.zeros((4, ny * 256, nx * 256), np.uint8)
            reproject(rasterio.band(src, [1, 2, 3, 4]), dst,
                      dst_transform=tr, dst_crs='EPSG:3857', num_threads=4,
                      resampling=Resampling.average if z < ZMAX else Resampling.bilinear)
            for ix in range(nx):
                for iy in range(ny):
                    a = dst[:, iy*256:(iy+1)*256, ix*256:(ix+1)*256]
                    if a[3].max() == 0:
                        skipped += 1
                        continue
                    al = a[3].astype(np.float32) / 255.0
                    rgb = np.clip(a[:3].astype(np.float32) / np.where(al > 0.004, al, 1.0),
                                  0, 255).astype(np.uint8)
                    dd = f'{outdir}/{z}/{X0+ix}'
                    os.makedirs(dd, exist_ok=True)
                    pth = f'{dd}/{Y0+iy}.png'
                    Image.fromarray(np.dstack([rgb[0], rgb[1], rgb[2], a[3]]), 'RGBA').save(
                        pth, optimize=True)
                    nbytes += os.path.getsize(pth)
                    written += 1
            del dst
        print(f'  {written} tiles ({skipped} empty skipped), {nbytes/1048576:.1f} MB')
        print(f'  bounds for index.html: [[{s:.5f}, {w:.5f}], [{n:.5f}, {e:.5f}]]')


def hit_targets(gpkg, out_json):
    tf = Transformer.from_crs('EPSG:25832', 'EPSG:4326', always_xy=True).transform
    rnd = lambda o: [rnd(i) for i in o] if isinstance(o, (list, tuple)) else round(o, COORD_DECIMALS)
    feats = []
    with fiona.open(gpkg, layer='poligonos_cambio') as src:
        for f in src:
            p = f['properties']
            g = shp_transform(tf, shape(f['geometry'])).simplify(
                SIMPLIFY_DEG, preserve_topology=True)
            if g.is_empty:
                continue
            feats.append({'type': 'Feature',
                          'geometry': {'type': g.geom_type,
                                       'coordinates': rnd(mapping(g)['coordinates'])},
                          'properties': {'a': int(round(p['area_m2'])),
                                         'v': int(round(p['volume_m3'])),
                                         'dh': round(p['mean_dh_m'], 2),
                                         'np': 1 if p['sin_plan'] else 0}})
    txt = json.dumps({'type': 'FeatureCollection', 'features': feats}, separators=(',', ':'))
    open(out_json, 'w').write(txt)
    print(f'  {len(feats)} click targets, {len(txt)/1024:.0f} KB')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    run, slug = sys.argv[1], sys.argv[2]
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    tmp = os.path.join(here, f'_dod_{slug}.tif')
    print('compositing turbo x hillshade...')
    rng = composite(run, tmp)
    print('tiling...')
    tiles(tmp, os.path.join(here, 'data', 'dod', slug))
    print('click targets...')
    hit_targets(os.path.join(run, 'poligonos.gpkg'),
                os.path.join(here, 'data', f'dod_{slug}.geojson'))
    os.remove(tmp)
    print(f'\ndone. Legend range for index.html: +/-{rng:.1f} m')
