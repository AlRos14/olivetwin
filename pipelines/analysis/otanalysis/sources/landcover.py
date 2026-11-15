"""CORINE Land Cover 2018 (Copernicus) → ``landcover-agri`` y ``landcover-olive``.

Fracción de cada celda de 250 m ocupada por superficie agrícola (clases CLC de nivel 1 «2», territorios
agrícolas) y por olivar (clase 223 «Olivares»). Los polígonos se piden al servicio vectorial oficial de la
EEA (ArcGIS REST, capa «Corine Land Cover 2018 vector») recortados al recuadro de la zona, en EPSG:3857, y
se rasterizan a 25 m antes de promediar a la rejilla (10 × 10 subceldas por celda).

Uso en OliveTwin: comparar zonas solo sobre tierra agrícola y contrastar la aptitud con el olivar que
existe hoy (referencia, no entra en el modelo de aptitud para no hacerlo circular).
"""
from __future__ import annotations

import json

import numpy as np
from affine import Affine
from rasterio.features import rasterize

from ..context import Ctx
from ..cube import SourceResult, StepData, VariableData
from ..net import log, retry, session

SERVICE = "https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2018_WM/MapServer/0/query"
REFERENCE = "https://land.copernicus.eu/en/products/corine-land-cover/clc2018"
SUBCELLS = 10
PAGE = 1000
LICENSE = (
    "Copernicus Land Monitoring Service: acceso libre, completo y abierto, con atribución («© European Union, "
    "Copernicus Land Monitoring Service 2018, European Environment Agency (EEA)»), según la política de datos de "
    "Copernicus (Reglamento Delegado (UE) 1159/2013)."
)
CAVEAT = (
    "CORINE es una cartografía por fotointerpretación con unidad mínima de 25 ha y referencia 2018: no distingue "
    "parcelas pequeñas ni cambios posteriores, y cada polígono tiene una sola clase dominante."
)
VARIABLES = {
    "landcover-agri": dict(
        title="Superficie agrícola (CORINE Land Cover 2018)", where="Code_18 LIKE '2%'",
        description="Fracción de la celda (0–1) ocupada por territorios agrícolas (clases 2xx de CORINE Land Cover 2018: "
                    "cultivos herbáceos, leñosos como olivar y viñedo, prados y mosaicos agrícolas)."),
    "landcover-olive": dict(
        title="Olivar (CORINE Land Cover 2018)", where="Code_18 = '223'",
        description="Fracción de la celda (0–1) ocupada por olivares (clase 223 de CORINE Land Cover 2018)."),
}


def _fetch(ctx: Ctx) -> list[dict]:
    """Polígonos agrícolas (2xx) del recuadro, en EPSG:3857 y recortados al recuadro con un pequeño margen."""
    cache = ctx.cache_dir("landcover") / f"{ctx.zone.id}_clc2018_agri.json"
    if cache.exists():
        return json.loads(cache.read_text())
    g = ctx.grid
    pad = 2 * g.cell
    envelope = {"xmin": g.x0 - pad, "ymin": g.y1 - pad, "xmax": g.x1 + pad, "ymax": g.y0 + pad,
                "spatialReference": {"wkid": 3857}}
    sess = session()
    features: list[dict] = []
    offset = 0
    while True:
        params = {
            "where": "Code_18 LIKE '2%'", "geometry": json.dumps(envelope), "geometryType": "esriGeometryEnvelope",
            "inSR": 3857, "outSR": 3857, "spatialRel": "esriSpatialRelIntersects", "outFields": "Code_18",
            "returnGeometry": "true", "maxAllowableOffset": 25, "resultOffset": offset,
            "resultRecordCount": PAGE, "orderByFields": "OBJECTID", "f": "json",
        }

        def _do():
            r = sess.get(SERVICE, params=params, timeout=180)
            r.raise_for_status()
            data = r.json()
            if "error" in data:
                raise RuntimeError(f"CORINE: {data['error']}")
            return data

        data = retry(_do)
        batch = [{"code": f["attributes"]["Code_18"], "rings": f["geometry"]["rings"]}
                 for f in data.get("features", []) if f.get("geometry")]
        features.extend(batch)
        if not data.get("exceededTransferLimit") and len(batch) < PAGE:
            break
        offset += PAGE
    cache.write_text(json.dumps(features))
    return features


def _fraction(ctx: Ctx, features: list[dict], predicate) -> np.ndarray:
    g = ctx.grid
    fine = g.cell / SUBCELLS
    shape = (g.height * SUBCELLS, g.width * SUBCELLS)
    transform = Affine(fine, 0.0, g.x0, 0.0, -fine, g.y0)
    shapes = [({"type": "Polygon", "coordinates": f["rings"]}, 1) for f in features if predicate(f["code"])]
    if not shapes:
        return np.zeros(g.shape)
    # Los anillos de ArcGIS (exterior horario, huecos antihorarios) se rasterizan como un único polígono por
    # entidad; con la regla par/impar de GDAL los huecos quedan fuera.
    mask = rasterize(shapes, out_shape=shape, transform=transform, fill=0, dtype="uint8")
    return mask.reshape(g.height, SUBCELLS, g.width, SUBCELLS).mean(axis=(1, 3))


def run(ctx: Ctx) -> SourceResult:
    res = SourceResult(source="landcover", owned_ids=list(VARIABLES))
    features = _fetch(ctx)
    agri = _fraction(ctx, features, lambda code: str(code).startswith("2"))
    olive = _fraction(ctx, features, lambda code: str(code) == "223")
    log(f"[{ctx.zone.id}] CORINE 2018: {len(features)} polígonos agrícolas; superficie agrícola "
        f"{agri.mean() * 100:.1f} %, olivar {olive.mean() * 100:.1f} % del recuadro")
    for vid, values in (("landcover-agri", agri), ("landcover-olive", olive)):
        meta = VARIABLES[vid]
        res.variables.append(VariableData(meta={
            "id": vid, "title": meta["title"], "group": "landcover", "unit": "fracción",
            "scale": 1 / 250, "offset": 0.0, "decimals": 2, "displayRange": [0.0, 1.0],
            "palette": "vegetation", "temporal": False,
            "description": meta["description"], "caveat": CAVEAT,
            "provenance": {
                "provider": "European Environment Agency (EEA), Copernicus Land Monitoring Service",
                "product": "CORINE Land Cover 2018 (CLC2018), versión V2020_20u1, capa vectorial",
                "processingVersion": "Servicio ArcGIS REST de la EEA (Corine/CLC2018_WM, capa 0); rasterizado a 25 m "
                                     "y promediado a 250 m en OliveTwin",
                "license": LICENSE,
                "referenceUrl": REFERENCE,
                "note": (f"Consulta: {meta['where']} (agrícola: Code_18 LIKE '2%'), recuadro de la zona en EPSG:3857 "
                         f"con margen de {2 * ctx.grid.cell:g} m; geometría generalizada a 25 m "
                         f"(maxAllowableOffset). {len(features)} polígonos agrícolas."),
            },
        }, steps=[StepData(date=None, values=values, provenance={
            "note": "Cartografía de referencia 2018 sin fecha de observación única (date = null)."})]))
    return res
