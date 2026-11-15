"""NISAR L2 GCOV PROVISIONAL → ``radar-hh``, ``radar-hv`` y ``radar-hv-hh`` (gamma0 en dB).

Se usa el mismo track/dirección/frame que SME2 y las mismas fechas (ciclos) que la serie SME2.
El recorte se pide a NASA Harmony (GeoTIFF en la proyección nativa del producto). En cada celda de
250 m se promedia la potencia LINEAL de los píxeles válidos (≥ 50 % de la celda) y después se pasa a dB.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import rasterio

from ..context import PERIOD_END, PERIOD_START, Ctx
from ..cube import SourceResult, StepData, VariableData
from ..net import cmr_granules, granule_name, harmony_subset, log
from ..resample import average_to_grid, power_to_db
from .nisar_common import NISAR_PROVIDER, nisar_license, parse_l2l3_name, pick_latest_versions, production_flag_note
from .sme2 import COLLECTION as SME2_COLLECTION

COLLECTION = "C2854338529-ASF"
COLLECTION_TITLE = "NISAR Provisional Geocoded Polarimetric Covariance Product (Version 1)"
DOI = "10.5067/NIL2GCOV-P1"
VAR = "/science/LSAR/GCOV/grids/frequencyA/{pol}"
MIN_VALID = 0.5

TEXT = {
    "radar-hh": dict(
        title="Retrodispersión radar HH (NISAR GCOV)",
        description=(
            "Retrodispersión radar en banda L de NISAR, polarización HH (emite y recibe en horizontal), "
            "expresada como gamma0 en dB. Media en potencia lineal de los píxeles de 20 m dentro de cada "
            "celda. Es sensible a la rugosidad y la humedad del suelo y a la estructura de la vegetación."
        ),
        caveat=(
            "Producto PROVISIONAL, no totalmente calibrado. El radar no mide producción, ni vigor, ni humedad "
            "por sí solo: el valor mezcla rugosidad, humedad del suelo, vegetación y geometría de observación "
            "(la pendiente y la orientación respecto al satélite modifican la señal). Compare fechas de la "
            "misma pasada, no zonas con pasadas distintas."
        ),
    ),
    "radar-hv": dict(
        title="Retrodispersión radar HV (NISAR GCOV)",
        description=(
            "Retrodispersión radar en banda L de NISAR, polarización cruzada HV, gamma0 en dB (media en "
            "potencia lineal por celda). La señal cruzada procede sobre todo de la dispersión de volumen, "
            "por lo que crece con la cantidad y estructura de la vegetación leñosa (copas, ramas)."
        ),
        caveat=(
            "Producto PROVISIONAL. HV es un indicador de estructura/volumen, no de producción ni de salud del "
            "olivar; no es NDVI. Los valores cercanos a −25…−30 dB pueden estar próximos al ruido del "
            "sensor. La topografía también modifica la señal."
        ),
    ),
    "radar-hv-hh": dict(
        title="Razón de polarización cruzada HV−HH (NISAR GCOV)",
        description=(
            "Diferencia HV − HH en dB (equivale a 10·log10 de la razón de potencias HV/HH por celda). "
            "Valores más altos indican más dispersión de volumen relativa (más estructura vegetal) frente a "
            "la dispersión superficial del suelo."
        ),
        caveat=(
            "NO es NDVI ni un índice de salud del cultivo: es solo un indicador de estructura derivado del "
            "radar. Producto PROVISIONAL; la humedad y rugosidad del suelo también cambian la razón."
        ),
    ),
}


def _find(dir_: Path, pol: str) -> Path | None:
    hits = sorted(p for p in dir_.glob(f"*{pol}*.tif"))
    return hits[0] if hits else None


def _read_power(path: Path):
    with rasterio.open(path) as ds:
        arr = ds.read(1).astype(np.float64)
        if ds.nodata is not None and not np.isnan(ds.nodata):
            arr[arr == ds.nodata] = np.nan
        arr[~np.isfinite(arr) | (arr <= 0)] = np.nan
        return arr, ds.transform, ds.crs, abs(ds.res[0])


def run(ctx: Ctx) -> SourceResult:
    zone, grid = ctx.zone, ctx.grid
    ids = ["radar-hh", "radar-hv", "radar-hv-hh"]
    res = SourceResult(source="gcov", owned_ids=ids)
    t0, t1 = f"{PERIOD_START}T00:00:00Z", f"{PERIOD_END}T23:59:59Z"
    sme2_dates = {parse_l2l3_name(granule_name(i))["start"]
                  for i in cmr_granules(SME2_COLLECTION, zone.bbox, t0, t1) if zone.nisar_key in granule_name(i)}
    items = cmr_granules(COLLECTION, zone.bbox, t0, t1)
    by_name = {granule_name(i): i for i in items if zone.nisar_key in granule_name(i)}
    names = [n for n in pick_latest_versions(list(by_name)) if parse_l2l3_name(n)["start"] in sme2_dates]
    log(f"[{zone.id}] GCOV: {len(by_name)} granulos {zone.nisar_key}; {len(names)} coinciden con fechas SME2")
    if not names:
        for vid in ids:
            res.unavailable.append({"id": vid, "title": TEXT[vid]["title"],
                                    "reason": f"CMR devolvió 0 granulos de {COLLECTION} para {zone.nisar_key} "
                                              f"en fechas SME2 entre {PERIOD_START} y {PERIOD_END}."})
        return res

    bbox = grid.padded_bbox_wgs84(0.01)
    jobs = {}
    for n in names:
        pols = ["HHHH"] + ([] if "_SHSH_" in n else ["HVHV"])
        out = ctx.cache_dir("gcov", zone.id, n)
        variables = [VAR.format(pol=p) for p in pols]
        harmony_subset(COLLECTION, by_name[n]["meta"]["concept-id"], bbox, variables, out, wait=False)
        jobs[n] = (out, variables)
    steps = {vid: [] for vid in ids}
    failures = []
    crids, pversions = set(), set()
    for n, (out, variables) in jobs.items():
        info = parse_l2l3_name(n)
        try:
            st = harmony_subset(COLLECTION, by_name[n]["meta"]["concept-id"], bbox, variables, out, wait=True)
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{n}: {exc}")
            log(f"  GCOV {n}: fallo Harmony: {exc}")
            continue
        crids.add(info["crid"])
        base_prov = {"acquisitionDate": info["start_iso"], "sceneId": n,
                     "granuleConceptId": by_name[n]["meta"]["concept-id"], "crid": info["crid"],
                     "harmonyJobId": st["jobId"]}
        notes = [f"Track {int(info['track'])} {zone.direction_label}, frame {int(info['frame'])}, ciclo "
                 f"{int(info['cycle'])}, modo {info['pol']}_{info['obsmode']}. Recorte Harmony (GeoTIFF nativo), "
                 f"media en potencia lineal por celda de 250 m Web Mercator (≥ {int(MIN_VALID * 100)} % de "
                 "píxeles válidos), conversión 10·log10."]
        fn = production_flag_note(info["production_flags"])
        if fn:
            notes.append(fn)
        grids_lin = {}
        for pol, vid in (("HHHH", "radar-hh"), ("HVHV", "radar-hv")):
            f = _find(out, pol)
            if f is None:
                continue
            p, tr, crs, resm = _read_power(f)
            mean_lin, _ = average_to_grid(p, tr, crs, grid, MIN_VALID)
            grids_lin[vid] = mean_lin
            prov = {**base_prov, "nativeCrs": str(crs), "nativePixelM": round(resm, 2), "note": " ".join(notes)}
            steps[vid].append(StepData(date=info["start_iso"], values=power_to_db(mean_lin), provenance=prov))
        if "radar-hh" in grids_lin and "radar-hv" in grids_lin:
            ratio = power_to_db(grids_lin["radar-hv"]) - power_to_db(grids_lin["radar-hh"])
            steps["radar-hv-hh"].append(StepData(date=info["start_iso"], values=ratio,
                                                 provenance={**base_prov, "note": " ".join(notes)}))
        elif "radar-hh" in grids_lin:
            log(f"  {info['start_iso']}: modo {info['pol']} sin HV; solo HH")
        log(f"  GCOV {info['start_iso']} ok ({', '.join(grids_lin)})")

    product_base = f"NISAR L2 GCOV PROVISIONAL ({COLLECTION}) — {VAR.format(pol='{pol}')}"
    enc = {
        "radar-hh": dict(unit="dB", scale=0.16, offset=-35.0, displayRange=[-20.0, -2.0], pol="HHHH"),
        "radar-hv": dict(unit="dB", scale=0.16, offset=-35.0, displayRange=[-28.0, -10.0], pol="HVHV"),
        "radar-hv-hh": dict(unit="dB", scale=0.12, offset=-25.0, displayRange=[-12.0, -3.0], pol="HVHV/HHHH"),
    }
    for vid in ids:
        if not steps[vid]:
            reason = "; ".join(failures) or "sin escenas utilizables"
            res.unavailable.append({"id": vid, "title": TEXT[vid]["title"], "reason": f"Harmony/GCOV: {reason}"})
            continue
        e = enc[vid]
        note = (f"{len(steps[vid])} fechas de la misma pasada que SME2 (track {zone.nisar_track} "
                f"{zone.direction_label}, frame {zone.nisar_frame}). gamma0 (no sigma0).")
        missing = sorted({parse_l2l3_name(n)['start_iso'] for n in names}
                         - {s.date for s in steps[vid]})
        if missing:
            note += f" Fechas SME2 sin este dato: {', '.join(missing)}."
        if failures:
            note += f" Fallos de descarga: {'; '.join(failures)}."
        meta = {
            "id": vid, "title": TEXT[vid]["title"], "group": "nisar", "unit": e["unit"],
            "scale": e["scale"], "offset": e["offset"], "decimals": 1,
            "displayRange": e["displayRange"], "palette": "radar", "temporal": True,
            "description": TEXT[vid]["description"], "caveat": TEXT[vid]["caveat"],
            "provenance": {
                "provider": NISAR_PROVIDER,
                "product": product_base.replace("{pol}", e["pol"]),
                "processingVersion": f"CRID {', '.join(sorted(crids))}",
                "license": nisar_license(COLLECTION_TITLE, DOI, "CMR no declara UseConstraints para esta "
                                                                "colección; se aplica la guía general"),
                "referenceUrl": "https://nisar-docs.asf.alaska.edu/gcov",
                "maturity": "PROVISIONAL",
                "doi": DOI,
                "note": note,
            },
        }
        res.variables.append(VariableData(meta=meta, steps=steps[vid]))
    return res
