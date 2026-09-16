#!/usr/bin/env python3
"""Turn a unigis_tesis DTM into Terrarium raster-DEM tiles for the web map's 3D.

    python tools/make_terrain_tiles.py <run_dir> <slug>

<run_dir> is a folder like
    unigis_tesis/data/outputs/AK_GJERDRUM/2007_to_2020
holding new_aligned.tif (the newer DTM1 of the pair).

It writes
    data/terrain/<slug>/{z}/{x}/{y}.png

encoded the way MapLibre's `encoding: 'terrarium'` expects:

    height = (R * 256 + G + B / 256) - 32768

so a metre is one step of G and the fractional part survives in B. The
elevation is resampled first and encoded afterwards — resampling the encoded
bytes would average three unrelated channels and produce nonsense terrain.

This is the sibling of make_dod_tiles.py and shares its tile grid, so the 661
turbo x hillshade tiles drape over this surface without any realignment.

One trap: new_aligned.tif declares nodata = -9999 but actually pads with 0.0,
and 40 % of the Gjerdrum raster is that pad. Left alone it renders as a 140 m
pit around the study area. Anything <= 0 is therefore treated as no data here —
safe inland, and it would need revisiting for a coastal municipality.

Requires: rasterio, scipy, pillow, numpy.
"""
import math, os, sys
import numpy as np
import rasterio
from scipy.ndimage import binary_erosion, distance_transform_edt
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform_bounds
from rasterio.transform import from_origin
from PIL import Image

ZMIN, ZMAX = 11, 15          # z15 is ~2.4 m/px at 60 N; MapLibre overzooms past it
R = 20037508.342789244


def lonlat_to_tile(lon, lat, z):
    n = 2 ** z
    lr = math.radians(lat)
    return ((lon + 180.0) / 360.0 * n,
            (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n)


def terrarium(h):
    """Elevation in metres -> R, G, B. NaN becomes the fill height."""
    v = h + 32768.0
    np.clip(v, 0, 65535.999, out=v)
    r = np.floor(v / 256.0)
    g = np.floor(v - r * 256.0)
    b = np.floor((v - np.floor(v)) * 256.0)
    return r.astype(np.uint8), g.astype(np.uint8), b.astype(np.uint8)


def main(run, slug):
    src_tif = os.path.join(run, 'new_aligned.tif')
    outdir = os.path.join(os.path.dirname(__file__), '..', 'data', 'terrain', slug)
    outdir = os.path.normpath(outdir)
    written = skipped = nbytes = 0

    with rasterio.open(src_tif) as src:
        # Clip the tile range to where there is real ground, so we never ship a
        # tile that is pure extrapolation.
        dec = 8
        # read(1, ...) returns a 2-D array; indexing [0] here would take the
        # first row, which at the top edge is all pad.
        band = src.read(1, out_shape=(src.height // dec, src.width // dec),
                        resampling=Resampling.average)
        good = np.isfinite(band) & (band > 0)
        if not good.any():
            sys.exit('  no valid elevation in ' + src_tif)
        rows, cols = np.where(good)
        r0, r1, c0, c1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
        left, top = src.xy(r0 * dec, c0 * dec, offset='ul')
        right, bot = src.xy(r1 * dec, c1 * dec, offset='ul')
        w, s, e, n = transform_bounds(src.crs, 'EPSG:4326', left, bot, right, top, densify_pts=51)
        print(f'  {src.crs}, {src.width}x{src.height}, {good.mean()*100:.0f} % of the '
              f'raster carries ground; the rest is pad')

        for z in range(ZMIN, ZMAX + 1):
            x0f, y1f = lonlat_to_tile(w, s, z)
            x1f, y0f = lonlat_to_tile(e, n, z)
            X0, Y0 = int(math.floor(x0f)), int(math.floor(y0f))
            nx = int(math.floor(x1f)) - X0 + 1
            ny = int(math.floor(y1f)) - Y0 + 1
            res = 2 * R / (2 ** z * 256)
            tr = from_origin(-R + X0 * 256 * res, R - Y0 * 256 * res, res, res)

            dst = np.full((ny * 256, nx * 256), np.nan, np.float32)
            reproject(rasterio.band(src, 1), dst,
                      dst_transform=tr, dst_crs='EPSG:3857', num_threads=4,
                      src_nodata=0, dst_nodata=float('nan'),
                      resampling=Resampling.average if z < ZMAX else Resampling.bilinear)
            have = np.isfinite(dst) & (dst > 0)
            if not have.any():
                continue
            # A warp blends across the edge of the coverage, so the outermost
            # ring or two of "valid" pixels are real ground averaged with pad
            # and come out tens of metres low — a hairline trench around the
            # whole study area. Drop that ring and let the fill below extend
            # the nearest real height instead.
            have = binary_erosion(have, np.ones((5, 5), bool), border_value=0)
            if not have.any():
                continue
            # Extend the nearest real height outward instead of dropping to the
            # fill value: a flat shelf at the median would put a cliff around
            # every edge of the coverage.
            idx = distance_transform_edt(~have, return_distances=False, return_indices=True)
            dst = dst[tuple(idx)]

            for ix in range(nx):
                for iy in range(ny):
                    sl = (slice(iy * 256, (iy + 1) * 256), slice(ix * 256, (ix + 1) * 256))
                    if not have[sl].any():
                        skipped += 1
                        continue
                    r, g, b = terrarium(dst[sl].astype(np.float64))
                    dd = f'{outdir}/{z}/{X0 + ix}'
                    os.makedirs(dd, exist_ok=True)
                    pth = f'{dd}/{Y0 + iy}.png'
                    Image.fromarray(np.dstack([r, g, b]), 'RGB').save(pth, optimize=True)
                    nbytes += os.path.getsize(pth)
                    written += 1
            del dst, have
            print(f'  z{z}: {nx}x{ny} tiles')

    print(f'  {written} tiles ({skipped} empty skipped), {nbytes / 1048576:.1f} MB')
    print(f'  bounds for index.html: [{w:.5f}, {s:.5f}, {e:.5f}, {n:.5f}]')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
