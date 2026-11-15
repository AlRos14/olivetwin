"""NISAR L3 SME2 PROVISIONAL → ``soil-moisture-all`` (sin máscara de calidad) y ``soil-moisture`` (calidad recomendada)."""
from __future__ import annotations

import json

import h5py
import numpy as np
from affine import Affine
from pyproj import Transformer
from rasterio.warp import Resampling

from ..context import PERIOD_END, PERIOD_START, Ctx
from ..cube import SourceResult, StepData, VariableData
from ..net import cmr_granules, download, granule_data_url, granule_name, log
from ..resample import warp_to_grid
from .nisar_common import NISAR_PROVIDER, nisar_license, parse_l2l3_name, pick_latest_versions, production_flag_note

COLLECTION = "C2854344945-ASF"
COLLECTION_TITLE = "NISAR Provisional Soil Moisture (Version 1)"
DOI = "10.5067/NIL3SME2-P1"
GRIDS = "/science/LSAR/SME2/grids"
FILL = -9999.0

DESCRIPTION = (
    "Humedad volumétrica del suelo en la capa superficial (~5 cm), en m³/m³, estimada por NISAR a partir "
    "de la retrodispersión radar en banda L (producto L3 SME2, rejilla EASE-Grid 2.0 de 200 m), "
    "remuestreada a la rejilla de análisis por vecino más próximo. Serie de una sola pasada "
    "({direction}, track {track}, frame {frame}) para que las fechas sean comparables."
)
CAVEAT = (
    "Producto PROVISIONAL: no está totalmente calibrado ni validado; use los cambios relativos con cautela "
    "(objetivo de precisión de la misión: 0,06 m³/m³ en zonas sin bandera). Solo describe los ~5 cm "
    "superiores: no equivale a agua disponible en la zona de raíces ni a necesidad de riego. Se han "
    "ocultado los píxeles que el producto marca como «no recomendados» (bit 0 de retrievalQualityFlag). "
    "Sin estimación en zonas urbanas o de agua. La hora de paso (~{hour} UTC) influye en el valor."
)

DESCRIPTION_ALL = DESCRIPTION + (
    " Incluye también los píxeles que el producto marca como «retrieval no recomendada» (bit 0 de "
    "retrievalQualityFlag = 1); solo quedan sin dato los píxeles sin estimación del propio producto."
)
CAVEAT_ALL = (
    "Producto PROVISIONAL: no está totalmente calibrado ni validado; use los cambios relativos con cautela. "
    "Esta versión NO aplica la máscara de calidad: incluye estimaciones que NISAR marca como menos fiables "
    "(«retrieval no recomendada»; la documentación de SME2 marca así, por ejemplo, la vegetación densa con "
    "VWC > 5 kg/m²). En esta zona son el {flagged:.0f} % de los píxeles nativos con estimación, y las celdas "
    "marcadas tienen de media más NDVI, más retrodispersión HV y más pendiente que las de calidad recomendada "
    "(comprobación del pipeline). Compárela con la "
    "versión de calidad recomendada antes de sacar conclusiones. Solo describe los ~5 cm superiores: no "
    "equivale a agua disponible en la zona de raíces ni a necesidad de riego. Sin estimación en zonas urbanas o "
    "de agua. La hora de paso (~{hour} UTC) influye en el valor."
)


def _read_crop(path, bbox_6933) -> tuple[np.ndarray, np.ndarray, Affine, dict]:
    with h5py.File(path, "r") as f:
        g = f[GRIDS]
        x = g["xCoordinates"][:]
        y = g["yCoordinates"][:]
        x0, y0, x1, y1 = bbox_6933
        ci = np.where((x >= x0) & (x <= x1))[0]
        ri = np.where((y >= y0) & (y <= y1))[0]
        if ci.size == 0 or ri.size == 0:
            raise ValueError("el AOI no interseca la rejilla del granulo")
        sl = (slice(ri[0], ri[-1] + 1), slice(ci[0], ci[-1] + 1))
        sm = g["soilMoisture"][sl].astype(np.float64)
        qf = g["retrievalQualityFlag"][sl]
        lc = g["ancillaryData/landCover"][sl]
        epsg = int(g["projection"].attrs["epsg_code"])
        ident = f["/science/LSAR/identification"]
        meta = {
            "epsg": epsg,
            "productVersion": ident["productVersion"][()].decode(),
            "crid": ident["compositeReleaseId"][()].decode(),
            "productDoi": ident["productDoi"][()].decode(),
            "units": g["soilMoisture"].attrs.get("units", b"").decode(),
        }
        dx = float(x[1] - x[0])
        dy = float(y[1] - y[0])
        transform = Affine(dx, 0, float(x[ci[0]]) - dx / 2, 0, dy, float(y[ri[0]]) - dy / 2)
    meta["landCover"] = lc
    return sm, qf, transform, meta


def run(ctx: Ctx) -> SourceResult:
    zone, grid = ctx.zone, ctx.grid
    res = SourceResult(source="sme2", owned_ids=["soil-moisture-all", "soil-moisture"])
    items = cmr_granules(COLLECTION, zone.bbox, f"{PERIOD_START}T00:00:00Z", f"{PERIOD_END}T23:59:59Z")
    names = [granule_name(i) for i in items if zone.nisar_key in granule_name(i)]
    log(f"[{zone.id}] SME2: {len(items)} granulos sobre el AOI, {len(names)} del track/frame {zone.nisar_key}")
    if not names:
        for vid in ("soil-moisture-all", "soil-moisture"):
            res.unavailable.append({"id": vid, "title": "Humedad superficial (NISAR SME2)",
                                    "reason": f"CMR devolvió 0 granulos de {COLLECTION} para {zone.nisar_key} "
                                              f"sobre el AOI entre {PERIOD_START} y {PERIOD_END}."})
        return res
    by_name = {granule_name(i): i for i in items}
    names = pick_latest_versions(names)

    to_6933 = Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True)
    w, s, e, n = grid.padded_bbox_wgs84(0.01)
    xs, ys = to_6933.transform([w, e, w, e], [s, s, n, n])
    bbox_6933 = (min(xs), min(ys), max(xs), max(ys))

    steps = []
    steps_all = []
    versions = set()
    masked_total, masked_lc1, valid_total = 0, 0, 0
    for name in names:
        item = by_name[name]
        info = parse_l2l3_name(name)
        url = granule_data_url(item)
        if url is None:
            log(f"  {name}: sin URL HTTPS de datos en CMR; se omite")
            continue
        path = download(url, ctx.cache / "sme2" / "h5" / url.rsplit("/", 1)[1])
        sm, qf, transform, meta = _read_crop(path, bbox_6933)
        if meta["units"] and "meter^3/meter^3" not in meta["units"]:
            raise ValueError(f"{name}: unidades inesperadas {meta['units']}")
        valid = np.isfinite(sm) & (sm != FILL) & (sm >= 0) & (sm <= 1)
        not_recommended = valid & ((qf.astype(np.int32) & 1) == 1)
        valid_total += int(valid.sum())
        masked_total += int(not_recommended.sum())
        masked_lc1 += int((not_recommended & (meta["landCover"] == 1)).sum())
        sm_all = np.where(valid, sm, np.nan)
        sm_rec = np.where(valid & ~not_recommended, sm, np.nan)
        on_grid_all = warp_to_grid(sm_all, transform, f"EPSG:{meta['epsg']}", grid, Resampling.nearest)
        on_grid = warp_to_grid(sm_rec, transform, f"EPSG:{meta['epsg']}", grid, Resampling.nearest)
        vf_all = float(np.isfinite(on_grid_all).mean())
        vf = float(np.isfinite(on_grid).mean())
        versions.add((meta["crid"], meta["productVersion"]))
        notes = [
            f"Track {int(info['track'])} {'ascendente' if info['dir'] == 'A' else 'descendente'}, frame "
            f"{int(info['frame'])}, ciclo {int(info['cycle'])}, modo {info['pol']}_{info['obsmode']}. "
            "Recorte AOI y remuestreo EPSG:6933→3857 por vecino más próximo a celdas de 250 m Web Mercator.",
            f"Máscara de calidad: se ocultan los píxeles con bit 0 de retrievalQualityFlag = 1 (retrieval "
            f"no recomendada). Cobertura de la rejilla sin máscara {vf_all:.3f}, con máscara {vf:.3f}.",
        ]
        flag_note = production_flag_note(info["production_flags"])
        if flag_note:
            notes.append(flag_note)
        if info["pol"] != "DHDH":
            notes.append(f"Adquisición en modo {info['pol']} (distinto del DHDH habitual de la serie).")
        log(f"  {info['start_iso']} {name[-24:]} válido sin máscara {vf_all:.3f} → con máscara {vf:.3f}")
        n_all = int(np.isfinite(on_grid_all).sum())
        flagged = (n_all - int(np.isfinite(on_grid).sum())) / n_all if n_all else 0.0
        notes_all = [notes[0], ("Sin máscara de calidad: se conservan los píxeles con bit 0 de retrievalQualityFlag = 1 "
                                f"(retrieval no recomendada), que son el {100 * flagged:.1f} % de las celdas con dato.")]
        notes_all += notes[2:]
        steps_all.append(StepData(
            date=info["start_iso"], values=on_grid_all,
            provenance={
                "acquisitionDate": info["start_iso"], "sceneId": name,
                "granuleConceptId": item["meta"]["concept-id"], "crid": meta["crid"],
                "productVersion": meta["productVersion"],
                "qualityMask": "ninguna (solo _FillValue y valores fuera de 0–1 m³/m³ → sin dato)",
                "flaggedFractionOfValidCells": round(flagged, 4),
                "note": " ".join(notes_all),
            },
        ))
        steps.append(StepData(
            date=info["start_iso"], values=on_grid,
            provenance={
                "acquisitionDate": info["start_iso"], "sceneId": name,
                "granuleConceptId": item["meta"]["concept-id"], "crid": meta["crid"],
                "productVersion": meta["productVersion"],
                "qualityMask": "retrievalQualityFlag bit0 = 1 → sin dato",
                "validFractionBeforeQualityMask": round(vf_all, 4),
                "note": " ".join(notes),
            },
        ))
    if not steps:
        for vid in ("soil-moisture-all", "soil-moisture"):
            res.unavailable.append({"id": vid, "title": "Humedad superficial (NISAR SME2)",
                                    "reason": "Ningún granulo SME2 del track/frame tenía URL de descarga HTTPS en CMR."})
        return res
    crids = sorted({v[0] for v in versions})
    pversions = sorted({v[1] for v in versions})
    hour = steps[0].date[11:16]
    meta = {
        "id": "soil-moisture",
        "title": "Humedad superficial (NISAR SME2, calidad recomendada)",
        "group": "nisar", "unit": "m³/m³", "scale": 0.0025, "offset": 0.0, "decimals": 3,
        "displayRange": [0.05, 0.4], "palette": "moisture", "temporal": True,
        "description": DESCRIPTION.format(direction=zone.direction_label, track=zone.nisar_track, frame=zone.nisar_frame),
        "caveat": CAVEAT.format(hour=hour),
        "provenance": {
            "provider": NISAR_PROVIDER,
            "product": f"NISAR L3 SME2 PROVISIONAL ({COLLECTION}) — {GRIDS}/soilMoisture",
            "processingVersion": f"CRID {', '.join(crids)}; productVersion {', '.join(pversions)}",
            "license": nisar_license(COLLECTION_TITLE, DOI, "CMR: FreeAndOpenData = true"),
            "referenceUrl": "https://nisar-docs.asf.alaska.edu/sme2",
            "maturity": "PROVISIONAL",
            "doi": DOI,
            "note": (f"Serie completa disponible en CMR para track {zone.nisar_track} "
                     f"{zone.direction_label}, frame {zone.nisar_frame} entre {PERIOD_START} y {PERIOD_END} "
                     f"({len(steps)} escenas). No se mezclan pasadas ni tracks."),
        },
    }
    if masked_total:
        meta["provenance"]["note"] += (
            f" En esta zona la máscara de calidad oculta el {100 * masked_total / valid_total:.0f} % de los píxeles "
            f"nativos con estimación; el {100 * masked_lc1 / masked_total:.0f} % de ellos tiene la clase 1 en la capa "
            "auxiliar ancillaryData/landCover del producto (el fichero no documenta la leyenda de clases).")
    if len(crids) > 1:
        meta["provenance"]["note"] += " La serie mezcla versiones de procesamiento (CRID): compare con cautela."
    flagged_pct = 100 * masked_total / valid_total if valid_total else 0.0
    meta_all = json.loads(json.dumps(meta))
    meta_all.update({
        "id": "soil-moisture-all",
        "title": "Humedad superficial (NISAR SME2, todas las estimaciones)",
        "description": DESCRIPTION_ALL.format(direction=zone.direction_label, track=zone.nisar_track,
                                              frame=zone.nisar_frame),
        "caveat": CAVEAT_ALL.format(flagged=flagged_pct, hour=hour),
    })
    meta_all["provenance"]["note"] = (
        f"Serie completa disponible en CMR para track {zone.nisar_track} {zone.direction_label}, frame "
        f"{zone.nisar_frame} entre {PERIOD_START} y {PERIOD_END} ({len(steps_all)} escenas), SIN máscara de "
        f"calidad. En esta zona el {flagged_pct:.0f} % de los píxeles nativos con estimación tiene bit 0 de "
        "retrievalQualityFlag = 1. Misma codificación y remuestreo que «soil-moisture».")
    if len(crids) > 1:
        meta_all["provenance"]["note"] += " La serie mezcla versiones de procesamiento (CRID): compare con cautela."
    res.variables.append(VariableData(meta=meta_all, steps=steps_all))
    res.variables.append(VariableData(meta=meta, steps=steps))
    return res
