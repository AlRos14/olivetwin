"""Sentinel-2 L2A (Microsoft Planetary Computer) → ``ndvi`` y ``ndmi``.

Para cada fecha elegida se construye un mosaico nativo (UTM) de las teselas MGRS de la misma
órbita relativa, se enmascaran nubes/sombras/nieve con SCL (se conservan solo las clases 4
«vegetación» y 5 «no vegetado»), se aplica BOA_ADD_OFFSET (−1000 desde la línea de procesado 04.00)
y se agrega a la rejilla con la media de los subpíxeles válidos, exigiendo ≥ 50 % válidos por celda.
"""
from __future__ import annotations

import datetime as dt
import json
import math
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import rasterio
from affine import Affine
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
from shapely.geometry import box, shape
from shapely.ops import unary_union

from ..context import PERIOD_END, PERIOD_START, Ctx
from ..cube import SourceResult, StepData, VariableData
from ..net import log, pc_search, pc_sign
from ..resample import average_to_grid

COLLECTION = "sentinel-2-l2a"
SCL_KEEP = (4, 5)
MAX_CLOUD = 20.0
BIN_DAYS = 14
MIN_VALID = 0.5
GDAL_ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MULTIRANGE="YES",
                GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES", GDAL_HTTP_MAX_RETRY=5, GDAL_HTTP_RETRY_DELAY=3)
BANDS10 = ("B04", "B08")
BANDS20 = ("B8A", "B11", "SCL")

LICENSE = (
    "Contains modified Copernicus Sentinel data 2026. Acceso libre, completo y abierto (Reglamento "
    "Delegado (UE) 1159/2013; «Legal notice on the use of Copernicus Sentinel Data and Service "
    "Information»). Producto L2A de ESA (Sen2Cor) distribuido como COG por Microsoft Planetary Computer."
)


def boa_offset(baseline: str | None) -> float:
    """BOA_ADD_OFFSET: −1000 para líneas de procesado ≥ 04.00, 0 antes."""
    try:
        major = float(str(baseline).split(".")[0])
    except (TypeError, ValueError):
        return 0.0
    return -1000.0 if major >= 4 else 0.0


def normalized_difference(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    a = a.astype(np.float32)
    b = b.astype(np.float32)
    den = a + b
    out = np.full(a.shape, np.nan, dtype=np.float32)
    ok = np.isfinite(den) & (den > 0)
    out[ok] = (a[ok] - b[ok]) / den[ok]
    return out


def select_dates(groups: dict, start: dt.date, end: dt.date, bin_days: int = BIN_DAYS) -> list:
    """Elige, en cada ventana consecutiva de ``bin_days`` días, el grupo con menor nubosidad."""
    chosen = []
    t = start
    while t <= end:
        t_end = t + dt.timedelta(days=bin_days)
        cands = [(g["cloud"], k) for k, g in groups.items() if t <= g["date"] < t_end]
        if cands:
            chosen.append(min(cands)[1])
        t = t_end
    return chosen


def _group_items(items: list[dict], aoi) -> dict:
    groups: dict = {}
    for it in items:
        p = it["properties"]
        key = (p["datetime"][:10], p.get("sat:relative_orbit"), p["platform"])
        groups.setdefault(key, []).append(it)
    out = {}
    for key, its in groups.items():
        cover = unary_union([shape(i["geometry"]) for i in its])
        if not cover.buffer(1e-6).covers(aoi):
            continue
        clouds = [i["properties"].get("eo:cloud_cover", 100.0) for i in its]
        cloud = max(clouds)
        if cloud > MAX_CLOUD:
            continue
        out[key] = {"date": dt.date.fromisoformat(key[0]), "cloud": cloud, "items": its}
    return out


def _read_into(href: str, crs, extent, res: float, out: np.ndarray) -> None:
    """Lee la intersección de una tesela con la extensión objetivo y la pega donde aún no hay dato."""
    x0, y0, x1, y1 = extent
    with rasterio.Env(**GDAL_ENV):
        with rasterio.open(pc_sign(href)) as ds:
            if ds.crs != crs:
                raise ValueError("CRS distinto dentro del mismo mosaico")
            b = ds.bounds
            ix0, iy0, ix1, iy1 = max(x0, b.left), max(y0, b.bottom), min(x1, b.right), min(y1, b.top)
            if ix1 <= ix0 or iy1 <= iy0:
                return
            win = from_bounds(ix0, iy0, ix1, iy1, ds.transform).round_offsets().round_lengths()
            arr = ds.read(1, window=win)
    r0 = int(round((y1 - iy1) / res))
    c0 = int(round((ix0 - x0) / res))
    h, w = arr.shape
    h = min(h, out.shape[0] - r0)
    w = min(w, out.shape[1] - c0)
    dst = out[r0:r0 + h, c0:c0 + w]
    empty = dst == 0
    dst[empty] = arr[:h, :w][empty]


def _mosaic(ctx: Ctx, key, items: list[dict]) -> dict:
    tag = f"{key[0]}_R{key[1]:03d}_{key[2]}"
    cache = ctx.cache_dir("s2", ctx.zone.id) / f"{tag}.npz"
    if cache.exists():
        z = np.load(cache, allow_pickle=False)
        return {k: z[k] for k in z.files}
    crs = rasterio.crs.CRS.from_string(items[0]["properties"]["proj:code"]) \
        if "proj:code" in items[0]["properties"] else rasterio.crs.CRS.from_epsg(items[0]["properties"]["proj:epsg"])
    for it in items[1:]:
        c = it["properties"].get("proj:code") or f"EPSG:{it['properties'].get('proj:epsg')}"
        if rasterio.crs.CRS.from_string(c) != crs:
            raise ValueError(f"{tag}: teselas en CRS distintos; no soportado")
    gb = ctx.grid.bounds_3857
    ex = transform_bounds("EPSG:3857", crs, *gb, densify_pts=21)
    ex = (math.floor(ex[0] / 20) * 20 - 20, math.floor(ex[1] / 20) * 20 - 20,
          math.ceil(ex[2] / 20) * 20 + 20, math.ceil(ex[3] / 20) * 20 + 20)
    w10, h10 = int((ex[2] - ex[0]) / 10), int((ex[3] - ex[1]) / 10)
    arrays = {b: np.zeros((h10, w10), np.uint16) for b in BANDS10}
    arrays.update({b: np.zeros((h10 // 2, w10 // 2), np.uint8 if b == "SCL" else np.uint16) for b in BANDS20})
    tasks = []
    for it in sorted(items, key=lambda i: i["properties"].get("eo:cloud_cover", 100)):
        for b in BANDS10 + BANDS20:
            tasks.append((it["assets"][b]["href"], b))
    # Las teselas se procesan en orden de nubosidad; cada banda en su hilo para conservar ese orden.
    def _band(b):
        res = 10.0 if b in BANDS10 else 20.0
        for href, bb in tasks:
            if bb == b:
                _read_into(href, crs, ex, res, arrays[b])
    with ThreadPoolExecutor(max_workers=5) as pool:
        list(pool.map(_band, BANDS10 + BANDS20))
    meta = {"crs": crs.to_string(), "extent": ex,
            "baselines": sorted({i["properties"].get("s2:processing_baseline") for i in items}),
            "ids": [i["id"] for i in items]}
    np.savez_compressed(cache, meta=np.array(json.dumps(meta)), **arrays)
    z = np.load(cache, allow_pickle=False)
    return {k: z[k] for k in z.files}


def _indices(m: dict, offset: float):
    meta = json.loads(str(m["meta"]))
    scl = m["SCL"]
    valid20 = np.isin(scl, SCL_KEEP)
    valid10 = np.repeat(np.repeat(valid20, 2, axis=0), 2, axis=1)

    def refl(dn, valid):
        r = (dn.astype(np.float32) + offset) / 10000.0
        ok = valid & (dn > 0) & (r > 0)
        return np.where(ok, r, np.nan)

    red, nir = refl(m["B04"], valid10), refl(m["B08"], valid10)
    nir20, swir = refl(m["B8A"], valid20), refl(m["B11"], valid20)
    ndvi = normalized_difference(nir, red)
    ndmi = normalized_difference(nir20, swir)
    x0, _, _, y1 = meta["extent"]
    t10 = Affine(10, 0, x0, 0, -10, y1)
    t20 = Affine(20, 0, x0, 0, -20, y1)
    observed = scl > 0
    return meta, (ndvi, t10), (ndmi, t20), float(observed.mean()), float(valid20[observed].mean()) if observed.any() else 0.0


TEXT = {
    "ndvi": dict(
        title="NDVI (Sentinel-2)",
        description=(
            "Índice de vegetación de diferencia normalizada, (B08 − B04)/(B08 + B04), a partir de "
            "reflectancias de superficie Sentinel-2 L2A (óptico, 10 m), promediado por celda de 250 m. "
            "Valores altos indican más cubierta verde fotosintéticamente activa."
        ),
        caveat=(
            "Es un dato ÓPTICO de Sentinel-2, no de NISAR. No mide producción ni salud del cultivo: mezcla "
            "olivo, cubierta del suelo y suelo desnudo dentro de cada celda (en olivar tradicional la copa "
            "cubre solo una parte). Las nubes, sombras y nieve se ocultan con la clasificación SCL, que puede "
            "dejar errores residuales; celdas con < 50 % de píxeles válidos quedan sin dato."
        ),
        scale=2 / 254, offset=-1.0, displayRange=[0.0, 0.8],
    ),
    "ndmi": dict(
        title="NDMI (Sentinel-2)",
        description=(
            "Índice de humedad de diferencia normalizada, (B8A − B11)/(B8A + B11), a partir de "
            "reflectancias Sentinel-2 L2A (infrarrojo cercano y de onda corta, 20 m), promediado por celda. "
            "Responde al contenido de agua de la vegetación (y en menor medida del suelo)."
        ),
        caveat=(
            "Dato ÓPTICO de Sentinel-2, no de NISAR. No mide la humedad del suelo ni la necesidad de riego: "
            "refleja sobre todo el agua en hojas y la proporción de vegetación en la celda. Nubes y sombras "
            "enmascaradas con SCL (errores residuales posibles)."
        ),
        scale=2 / 254, offset=-1.0, displayRange=[-0.3, 0.4],
    ),
}


def run(ctx: Ctx) -> SourceResult:
    zone, grid = ctx.zone, ctx.grid
    res = SourceResult(source="s2", owned_ids=["ndvi", "ndmi"])
    aoi = box(*grid.bbox_wgs84)
    items = pc_search(COLLECTION, grid.bbox_wgs84, f"{PERIOD_START}T00:00:00Z/{PERIOD_END}T23:59:59Z")
    groups = _group_items(items, aoi)
    keys = select_dates(groups, dt.date.fromisoformat(PERIOD_START), dt.date.fromisoformat(PERIOD_END))
    log(f"[{zone.id}] S2: {len(items)} ítems, {len(groups)} pasadas que cubren el AOI con nubosidad ≤ "
        f"{MAX_CLOUD} %, {len(keys)} fechas elegidas (una por ventana de {BIN_DAYS} días)")
    if not keys:
        for vid in ("ndvi", "ndmi"):
            res.unavailable.append({"id": vid, "title": TEXT[vid]["title"],
                                    "reason": f"Planetary Computer: ninguna pasada Sentinel-2 L2A cubre el AOI "
                                              f"con nubosidad ≤ {MAX_CLOUD} % entre {PERIOD_START} y {PERIOD_END}."})
        return res
    steps = {"ndvi": [], "ndmi": []}
    baselines = set()
    for key in keys:
        g = groups[key]
        m = _mosaic(ctx, key, g["items"])
        offs = {boa_offset(i["properties"].get("s2:processing_baseline")) for i in g["items"]}
        if len(offs) != 1:
            log(f"  {key}: teselas con distinto BOA offset; se omite")
            continue
        offset = offs.pop()
        meta, (ndvi, t10), (ndmi, t20), observed, clear = _indices(m, offset)
        baselines.update(meta["baselines"])
        crs = meta["crs"]
        date = min(i["properties"]["datetime"] for i in g["items"])
        date = date[:19] + "Z"
        for vid, (arr, tr) in (("ndvi", (ndvi, t10)), ("ndmi", (ndmi, t20))):
            vals, frac = average_to_grid(arr, tr, crs, grid, MIN_VALID)
            steps[vid].append(StepData(date=date, values=vals, provenance={
                "acquisitionDate": date,
                "items": meta["ids"],
                "platform": key[2],
                "relativeOrbit": key[1],
                "processingBaseline": ", ".join(meta["baselines"]),
                "boaAddOffset": offset,
                "maxTileCloudCover": round(g["cloud"], 2),
                "note": (f"Mosaico de {len(meta['ids'])} teselas MGRS de la misma pasada. Píxeles SCL 4/5 "
                         f"conservados: {clear:.3f} de los observados. Media por celda de los subpíxeles "
                         f"válidos (≥ {int(MIN_VALID * 100)} %)."),
            }))
        log(f"  S2 {date} {key[2]} R{key[1]} nubes≤{g['cloud']:.1f}% claros {clear:.3f} "
            f"ndvi vf={np.isfinite(steps['ndvi'][-1].values).mean():.3f}")
    for vid in ("ndvi", "ndmi"):
        t = TEXT[vid]
        meta = {
            "id": vid, "title": t["title"], "group": "optical", "unit": "adimensional",
            "scale": t["scale"], "offset": t["offset"], "decimals": 3,
            "displayRange": t["displayRange"], "palette": "vegetation", "temporal": True,
            "description": t["description"], "caveat": t["caveat"],
            "provenance": {
                "provider": "ESA Copernicus Sentinel-2, vía Microsoft Planetary Computer",
                "product": f"Sentinel-2 MSI L2A ({COLLECTION}), bandas {'B04, B08' if vid == 'ndvi' else 'B8A, B11'} + SCL",
                "processingVersion": f"Líneas de procesado ESA {', '.join(sorted(baselines))}; BOA_ADD_OFFSET aplicado",
                "license": LICENSE,
                "referenceUrl": "https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a",
                "note": (f"Una fecha por ventana de {BIN_DAYS} días con la menor nubosidad de tesela (≤ {MAX_CLOUD} %) "
                         f"entre {PERIOD_START} y {PERIOD_END}; SCL: se conservan las clases 4 y 5."),
            },
        }
        res.variables.append(VariableData(meta=meta, steps=steps[vid]))
    return res
