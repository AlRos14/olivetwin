"""SMAP SPL3SMP_E (9 km, radiómetro) → serie de zona ``smap-soil-moisture`` (media diaria de la zona).

Recorte por bbox, variables y fechas con NASA Harmony (servicio HOSS, salida NetCDF-4). Se usa la
pasada AM (descendente, ~06:00 hora solar local) y se descartan las celdas con el bit 0 de
``retrieval_qual_flag`` = 1 (calidad no recomendada).
"""
from __future__ import annotations

import datetime as dt
import json
import re

import h5py
import numpy as np

from ..context import PERIOD_END, PERIOD_START, Ctx
from ..cube import SourceResult
from ..net import cmr_collection, log

COLLECTION = "C2938664763-NSIDC_CPRD"
GROUP = "Soil_Moisture_Retrieval_Data_AM"
VARIABLES = [f"{GROUP}/soil_moisture", f"{GROUP}/retrieval_qual_flag",
             f"{GROUP}/latitude", f"{GROUP}/longitude"]


def _submit_or_load(ctx: Ctx, bbox) -> dict:
    out = ctx.cache_dir("smap", ctx.zone.id)
    marker = out / "harmony.json"
    state = json.loads(marker.read_text()) if marker.exists() else {}
    if state.get("status") == "done":
        return state
    from harmony import BBox, Client, Collection, Environment, Request

    client = Client(env=Environment.PROD)
    if not state.get("jobId"):
        req = Request(collection=Collection(id=COLLECTION), spatial=BBox(*bbox),
                      temporal={"start": dt.datetime.fromisoformat(f"{PERIOD_START}T00:00:00"),
                                "stop": dt.datetime.fromisoformat(f"{PERIOD_END}T23:59:59")},
                      variables=VARIABLES, skip_preview=True)
        if not req.is_valid():
            raise RuntimeError(f"Petición Harmony inválida: {req.error_messages()}")
        job = client.submit(req)
        state = {"jobId": job, "status": "submitted"}
        marker.write_text(json.dumps(state, indent=2))
        log(f"  SMAP Harmony: trabajo {job}")
    client.wait_for_processing(state["jobId"], show_progress=False)
    files = [p.rsplit("/", 1)[-1] for p in
             (f.result() for f in client.download_all(state["jobId"], directory=str(out), overwrite=False))]
    st = client.status(state["jobId"])
    state.update(status="done", files=sorted(files), message=st.get("message"))
    marker.write_text(json.dumps(state, indent=2))
    return state


def zone_mean(sm: np.ndarray, qf: np.ndarray, lat: np.ndarray, lon: np.ndarray, bbox) -> tuple[float | None, int]:
    """Media de las celdas válidas y recomendadas cuyo centro cae dentro del bbox."""
    w, s, e, n = bbox
    inside = (lon >= w) & (lon <= e) & (lat >= s) & (lat <= n)
    ok = inside & np.isfinite(sm) & (sm >= 0) & (sm <= 1) & ((qf.astype(np.int64) & 1) == 0)
    if not ok.any():
        return None, 0
    return float(round(float(sm[ok].mean()), 4)), int(ok.sum())


def run(ctx: Ctx) -> SourceResult:
    zone, grid = ctx.zone, ctx.grid
    res = SourceResult(source="smap", owned_ids=["smap-soil-moisture"])
    bbox = grid.bbox_wgs84
    # Las celdas de 9 km cuyo centro cae en la zona; se pide un margen para no recortar celdas de borde.
    st = _submit_or_load(ctx, grid.padded_bbox_wgs84(0.05))
    out = ctx.cache_dir("smap", zone.id)
    by_date: dict[str, tuple[str, str]] = {}
    for fn in st["files"]:
        m = re.search(r"SMAP_L3_SM_P_E_(\d{8})_(R\d+)_(\d{3})", fn)
        if not m:
            continue
        d = dt.datetime.strptime(m.group(1), "%Y%m%d").date().isoformat()
        if d not in by_date or m.group(3) > by_date[d][1]:
            by_date[d] = (fn, m.group(3))
    points, crids, n_cells = [], set(), []
    for d in sorted(by_date):
        fn = by_date[d][0]
        crids.add(re.search(r"_(R\d+)_", fn).group(1))
        with h5py.File(out / fn, "r") as f:
            g = f[GROUP]
            sm = g["soil_moisture"][...].astype(np.float64)
            fill = g["soil_moisture"].attrs.get("_FillValue", -9999.0)
            sm[sm == fill] = np.nan
            v, n = zone_mean(sm, g["retrieval_qual_flag"][...], g["latitude"][...], g["longitude"][...], bbox)
        points.append({"date": d, "value": v})
        n_cells.append(n)
    if not points or all(p["value"] is None for p in points):
        res.unavailable.append({"id": "smap-soil-moisture", "title": "Humedad del suelo SMAP (9 km)",
                                "reason": f"Harmony devolvió {len(st.get('files', []))} ficheros SPL3SMP_E sin "
                                          "celdas válidas y recomendadas sobre la zona."})
        return res
    coll = cmr_collection(COLLECTION)["umm"]
    license_text = (coll.get("UseConstraints") or {}).get("LicenseText", "").strip()
    valid_days = sum(p["value"] is not None for p in points)
    res.series.append({
        "id": "smap-soil-moisture",
        "title": "Humedad superficial SMAP (media de zona, pasada AM)",
        "unit": "m³/m³",
        "chart": "line",
        "caveat": ("Radiómetro SMAP a 9 km: cada valor es la media de muy pocas celdas grandes que mezclan "
                   "olivar, otros cultivos y monte; describe la tendencia regional de los ~5 cm superiores, no la "
                   "de una parcela. Días sin dato = sin pasada sobre la zona o calidad no recomendada."),
        "provenance": {
            "provider": "NASA SMAP, distribuido por NSIDC DAAC",
            "product": f"SPL3SMP_E v{coll.get('Version')} ({COLLECTION}) — {GROUP}/soil_moisture",
            "processingVersion": f"Versión de colección {coll.get('Version')}; CRID {', '.join(sorted(crids))}",
            "license": f"{license_text} Cita: {coll.get('EntryTitle')}, NSIDC DAAC, doi:{coll.get('DOI', {}).get('DOI')}.",
            "referenceUrl": f"https://doi.org/{coll.get('DOI', {}).get('DOI')}",
            "harmonyJobId": st["jobId"],
            "note": (f"Media diaria de las celdas de 9 km cuyo centro cae en la rejilla de la zona "
                     f"(máx. {max(n_cells)} celdas), solo con bit 0 de retrieval_qual_flag = 0 (retrieval recomendada; "
                     "en el fichero, las celdas sin retrieval llevan los bits 0–2 a 1). "
                     f"{valid_days} de {len(points)} días con dato."),
        },
        "points": points,
    })
    log(f"[{zone.id}] SMAP: {valid_days}/{len(points)} días con dato, máx {max(n_cells)} celdas")
    return res
