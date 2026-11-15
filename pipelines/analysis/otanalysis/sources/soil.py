"""ISRIC SoilGrids 2.0 → ``soil-clay``, ``soil-sand``, ``soil-soc``, ``soil-ph`` (0–30 cm).

Media ponderada por espesor de las capas «mean» 0–5, 5–15 y 15–30 cm (pesos 5, 10 y 15 cm),
convertida a unidades convencionales dividiendo por el factor de conversión de SoilGrids (10).
Acceso: VRT/COG oficiales de ISRIC en files.isric.org, leídos por ventana en su rejilla nativa
(Homolosine, 250 m, nodata −32768). El WCS de maps.isric.org se probó durante el desarrollo
(2026-11-15): una vez respondió HTTP 503 y otra devolvió un GeoTIFF remuestreado (≈250,5 × 249,3 m)
sin valor nodata declarado (0 = sin dato), por lo que no se usa.
"""
from __future__ import annotations

import numpy as np
import rasterio
from rasterio.warp import Resampling, transform_bounds
from rasterio.windows import from_bounds
from rasterio.windows import transform as win_transform

from ..context import Ctx
from ..cube import SourceResult, StepData, VariableData
from ..net import log
from ..resample import warp_to_grid

DEPTHS = (("0-5cm", 5.0), ("5-15cm", 10.0), ("15-30cm", 15.0))
VRT = "https://files.isric.org/soilgrids/latest/data/{prop}/{prop}_{depth}_mean.vrt"
NODATA = -32768
CONVERSION = 10.0
LICENSE = (
    "CC BY 4.0 — ISRIC – World Soil Information, SoilGrids 2.0 («The SoilGrids maps are publicly "
    "available … under the CC-BY 4.0 License»). Cita: Poggio, L. et al. (2021) SoilGrids 2.0: producing "
    "soil information for the globe with quantified spatial uncertainty. SOIL 7, 217–240, "
    "doi:10.5194/soil-7-217-2021."
)

PROPS = {
    "soil-clay": dict(prop="clay", title="Arcilla 0–30 cm (SoilGrids)", unit="%", scale=0.4, offset=0.0,
                      decimals=1, displayRange=[10.0, 50.0],
                      description="Contenido de arcilla (partículas < 0,002 mm) de la tierra fina, en %, media "
                                  "ponderada 0–30 cm del mapa SoilGrids 2.0 (250 m)."),
    "soil-sand": dict(prop="sand", title="Arena 0–30 cm (SoilGrids)", unit="%", scale=0.4, offset=0.0,
                      decimals=1, displayRange=[10.0, 70.0],
                      description="Contenido de arena (0,05–2 mm) de la tierra fina, en %, media ponderada "
                                  "0–30 cm del mapa SoilGrids 2.0 (250 m)."),
    "soil-soc": dict(prop="soc", title="Carbono orgánico 0–30 cm (SoilGrids)", unit="g/kg", scale=0.5,
                     offset=0.0, decimals=1, displayRange=[0.0, 30.0],
                     description="Carbono orgánico del suelo en la tierra fina, en g/kg, media ponderada "
                                 "0–30 cm del mapa SoilGrids 2.0 (250 m)."),
    "soil-ph": dict(prop="phh2o", title="pH en agua 0–30 cm (SoilGrids)", unit="pH", scale=0.03, offset=3.0,
                    decimals=2, displayRange=[5.5, 8.5],
                    description="pH del suelo medido en agua, media ponderada 0–30 cm del mapa SoilGrids 2.0 "
                                "(250 m)."),
}
CAVEAT = (
    "Producto MODELADO (predicción estadística a 250 m a partir de perfiles y covariables), no una "
    "medición de campo: puede no reflejar el suelo real de una parcela concreta y tiene incertidumbre "
    "notable a escala local. Sin dato en zonas urbanas, agua o suelo desnudo según la máscara de SoilGrids."
)


def depth_weighted_mean(layers: list[np.ndarray], weights: list[float]) -> np.ndarray:
    """Media ponderada; NaN si falta cualquiera de las capas."""
    stack = np.stack([np.asarray(a, dtype=np.float64) for a in layers])
    w = np.asarray(weights, dtype=np.float64)[:, None, None]
    out = (stack * w).sum(axis=0) / w.sum()
    out[~np.isfinite(stack).all(axis=0)] = np.nan
    return out


def _read_layer(ctx: Ctx, prop: str, depth: str):
    cache = ctx.cache_dir("soil", ctx.zone.id)
    tif = cache / f"{prop}_{depth}_mean.tif"
    if not tif.exists():
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
            with rasterio.open(f"/vsicurl/{VRT.format(prop=prop, depth=depth)}") as ds:
                bb = transform_bounds("EPSG:4326", ds.crs, *ctx.grid.padded_bbox_wgs84(0.02), densify_pts=21)
                win = from_bounds(*bb, ds.transform).round_offsets().round_lengths()
                arr = ds.read(1, window=win)
                prof = {"driver": "GTiff", "height": arr.shape[0], "width": arr.shape[1], "count": 1,
                        "dtype": arr.dtype, "crs": ds.crs, "transform": win_transform(win, ds.transform),
                        "nodata": ds.nodata, "compress": "deflate"}
        with rasterio.open(tif, "w", **prof) as dst:
            dst.write(arr, 1)
    return _open(tif)


def _open(tif):
    with rasterio.open(tif) as ds:
        arr = ds.read(1).astype(np.float64)
        nd = ds.nodata if ds.nodata is not None else NODATA
        arr[arr == nd] = np.nan
        return arr, ds.transform, ds.crs


def run(ctx: Ctx) -> SourceResult:
    zone, grid = ctx.zone, ctx.grid
    res = SourceResult(source="soil", owned_ids=list(PROPS))
    for vid, p in PROPS.items():
        layers = []
        for depth, _w in DEPTHS:
            arr, tr, crs = _read_layer(ctx, p["prop"], depth)
            layers.append(warp_to_grid(arr / CONVERSION, tr, crs, grid, Resampling.nearest))
        vals = depth_weighted_mean(layers, [w for _, w in DEPTHS])
        log(f"  {vid}: media {np.nanmean(vals):.2f} {p['unit']}, válido {np.isfinite(vals).mean():.3f}")
        res.variables.append(VariableData(meta={
            "id": vid, "title": p["title"], "group": "soil", "unit": p["unit"],
            "scale": p["scale"], "offset": p["offset"], "decimals": p["decimals"],
            "displayRange": p["displayRange"], "palette": "soil", "temporal": False,
            "description": p["description"], "caveat": CAVEAT,
            "provenance": {
                "provider": "ISRIC – World Soil Information",
                "product": f"SoilGrids 2.0 «{p['prop']}» mean, capas 0–5, 5–15 y 15–30 cm",
                "processingVersion": "SoilGrids 2.0 (files.isric.org/soilgrids/latest)",
                "license": LICENSE,
                "referenceUrl": "https://www.isric.org/explore/soilgrids",
                "note": (f"Media ponderada por espesor (5, 10, 15 cm) ÷ {CONVERSION:g} (factor de conversión "
                         f"de SoilGrids). Remuestreo Homolosine→3857 por vecino más próximo. Acceso: VRT/COG "
                         f"oficial de ISRIC (files.isric.org) por ventana; el WCS de maps.isric.org no se usa "
                         f"porque en las pruebas devolvió HTTP 503 o un GeoTIFF remuestreado sin nodata."),
            },
        }, steps=[StepData(date=None, values=vals, provenance={
            "note": "Mapa modelado sin fecha de observación única (date = null)."})]))
    return res
