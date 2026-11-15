"""Copernicus DEM GLO-30 (Planetary Computer) → ``elevation`` y ``slope``.

La pendiente se calcula en grados en una proyección métrica (EPSG:25830, ETRS89 / UTM 30N) a ~30 m
nativos y después se agregan elevación y pendiente a la rejilla con la media por celda.
"""
from __future__ import annotations

import json

import numpy as np
import rasterio
from affine import Affine
from rasterio.merge import merge
from rasterio.warp import Resampling, reproject, transform_bounds

from ..context import Ctx
from ..cube import SourceResult, StepData, VariableData
from ..net import log, pc_sign
from ..resample import average_to_grid
from .s2 import GDAL_ENV

COLLECTION = "cop-dem-glo-30"
METRIC_CRS = "EPSG:25830"
RES_M = 30.0
LICENSE = (
    "Copernicus DEM GLO-30, licencia gratuita mundial (ESA/Copernicus). Aviso obligatorio para datos "
    "adaptados: «produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and "
    "Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved». "
    "Metadatos de la colección en Planetary Computer: license «proprietary», licenciante European Space "
    "Agency (CSCDA ESA Mission-specific Annex)."
)


def slope_degrees(dem: np.ndarray, res_m: float) -> np.ndarray:
    """Pendiente (grados) por diferencias centradas; NaN en bordes y donde falte algún vecino."""
    z = np.asarray(dem, dtype=np.float64)
    out = np.full(z.shape, np.nan)
    dzdx = (z[1:-1, 2:] - z[1:-1, :-2]) / (2 * res_m)
    dzdy = (z[2:, 1:-1] - z[:-2, 1:-1]) / (2 * res_m)
    out[1:-1, 1:-1] = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))
    return out


def run(ctx: Ctx) -> SourceResult:
    zone, grid = ctx.zone, ctx.grid
    res = SourceResult(source="dem", owned_ids=["elevation", "slope"])
    cache = ctx.cache_dir("dem", zone.id)
    npz = cache / "dem_25830.npz"
    bbox = grid.padded_bbox_wgs84(0.02)
    if npz.exists():
        z = np.load(npz)
        dem_m, tr = z["dem"], Affine(*z["transform"])
        meta = json.loads(str(z["meta"]))
    else:
        items = _search(bbox)
        if not items:
            for vid in ("elevation", "slope"):
                res.unavailable.append({"id": vid, "title": vid, "reason": "Planetary Computer no devolvió teselas cop-dem-glo-30 para el AOI."})
            return res
        with rasterio.Env(**GDAL_ENV):
            srcs = [rasterio.open(pc_sign(i["assets"]["data"]["href"])) for i in items]
            mosaic, mtr = merge(srcs, bounds=bbox, nodata=np.nan, dtype="float32")
            src_crs = srcs[0].crs
            for s in srcs:
                s.close()
        dem = mosaic[0].astype(np.float64)
        ex = transform_bounds("EPSG:4326", METRIC_CRS, *grid.padded_bbox_wgs84(0.01), densify_pts=21)
        w = int(np.ceil((ex[2] - ex[0]) / RES_M))
        h = int(np.ceil((ex[3] - ex[1]) / RES_M))
        tr = Affine(RES_M, 0, ex[0], 0, -RES_M, ex[3])
        dem_m = np.full((h, w), np.nan)
        reproject(dem, dem_m, src_transform=mtr, src_crs=src_crs, src_nodata=np.nan,
                  dst_transform=tr, dst_crs=METRIC_CRS, dst_nodata=np.nan, resampling=Resampling.bilinear)
        meta = {"items": [i["id"] for i in items],
                "versions": sorted({str(i["properties"].get("gsd", "")) for i in items}),
                "props": {k: v for k, v in items[0]["properties"].items() if k in ("datetime", "start_datetime", "end_datetime", "platform", "gsd")}}
        np.savez_compressed(npz, dem=dem_m, transform=np.array(tr[:6]), meta=np.array(json.dumps(meta)))
    slope = slope_degrees(dem_m, RES_M)
    elev_g, _ = average_to_grid(dem_m, tr, METRIC_CRS, grid, 0.5)
    slope_g, _ = average_to_grid(slope, tr, METRIC_CRS, grid, 0.5)
    log(f"[{zone.id}] DEM: teselas {meta['items']}; elevación media {np.nanmean(elev_g):.0f} m, "
        f"pendiente media {np.nanmean(slope_g):.1f}°")
    prov = {
        "provider": "Copernicus (ESA/UE; DLR y Airbus Defence and Space), vía Microsoft Planetary Computer",
        "product": f"Copernicus DEM GLO-30 ({COLLECTION}), modelo digital de superficie de ~30 m",
        "processingVersion": "Teselas COG de Planetary Computer: " + ", ".join(meta["items"]),
        "license": LICENSE,
        "referenceUrl": "https://planetarycomputer.microsoft.com/dataset/cop-dem-glo-30",
        "doi": "10.5270/ESA-c5d3d65",
    }
    step_prov = {"items": meta["items"], "note": (
        "Producto estático: el DEM procede de múltiples adquisiciones de la misión TanDEM-X y no tiene "
        "una fecha única de observación; por eso date = null.")}
    common = dict(group="terrain", palette="terrain", temporal=False)
    res.variables.append(VariableData(meta={
        "id": "elevation", "title": "Elevación (Copernicus DEM)", "unit": "m",
        "scale": 10.0, "offset": 0.0, "decimals": 0,
        "displayRange": [float(np.floor(np.nanpercentile(elev_g, 1) / 50) * 50),
                         float(np.ceil(np.nanpercentile(elev_g, 99) / 50) * 50)],
        "description": ("Altitud sobre el nivel del mar (m) del modelo digital de superficie Copernicus "
                        "GLO-30, media por celda de 250 m."),
        "caveat": ("Es un modelo de SUPERFICIE: incluye edificios y copas de árboles. La media por celda "
                   "suaviza el relieve fino. No informa por sí sola de la aptitud agrícola."),
        "provenance": {**prov, "note": "Reproyección bilineal a EPSG:25830 a 30 m y media por celda de la rejilla."},
        **common}, steps=[StepData(date=None, values=elev_g, provenance=step_prov)]))
    res.variables.append(VariableData(meta={
        "id": "slope", "title": "Pendiente (Copernicus DEM)", "unit": "°",
        "scale": 0.25, "offset": 0.0, "decimals": 1, "displayRange": [0.0, 30.0],
        "description": ("Pendiente del terreno en grados, calculada a 30 m en proyección métrica "
                        "(ETRS89 / UTM 30N) con diferencias centradas y promediada por celda de 250 m."),
        "caveat": ("Calculada sobre un modelo de superficie (incluye copas y edificios), por lo que puede "
                   "sobrestimar la pendiente en bordes de arbolado o construcciones. La media por celda "
                   "oculta taludes y pendientes locales mayores."),
        "provenance": {**prov, "note": "Pendiente = atan(|∇z|) a 30 m en EPSG:25830; media por celda."},
        **common}, steps=[StepData(date=None, values=slope_g, provenance=step_prov)]))
    return res


def _search(bbox):
    import requests
    from ..net import PC_STAC
    r = requests.post(f"{PC_STAC}/search", json={"collections": [COLLECTION], "bbox": list(bbox), "limit": 50}, timeout=120)
    r.raise_for_status()
    return r.json()["features"]
