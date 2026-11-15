"""NISAR L2 GUNW PROVISIONAL → ``insar-coherence`` (una pareja de 12 días de la misma pasada).

Se lee por HTTP (lectura parcial del HDF5 con earthaccess, sin descargar los ~2 GB del granulo) la
ventana del AOI de ``unwrappedInterferogram/HH/coherenceMagnitude`` (80 m, UTM) y su ``mask``.
"""
from __future__ import annotations

import json

import numpy as np
from affine import Affine
from pyproj import Transformer

from ..context import PERIOD_END, PERIOD_START, Ctx
from ..cube import SourceResult, StepData, VariableData
from ..net import cmr_granules, granule_name, log
from ..resample import average_to_grid
from .nisar_common import NISAR_PROVIDER, nisar_license

COLLECTION = "C2854335566-ASF"
COLLECTION_TITLE = "NISAR Provisional Geocoded Unwrapped Interferogram Product (Version 1)"
GROUP = "/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram"
PREFERRED_REFERENCE_DATE = "20260819"  # pareja de pleno verano (seca) con marcas de producción N_F_J
MIN_VALID = 0.5


def mask_valid(mask: np.ndarray) -> np.ndarray:
    """Interpreta ``mask`` según su descripción en el HDF5: dígitos (agua, subfranja ref., subfranja sec.)
    en los bits 0–7, anomalías en los bits 8–23, 255 = relleno."""
    m = np.asarray(mask).astype(np.int64)
    low = m & 0xFF
    water = low // 100
    ref = (low // 10) % 10
    sec = low % 10
    anomalies = (m >> 8) & 0xFFFF
    return (m != 255) & (water == 0) & (ref > 0) & (sec > 0) & (anomalies == 0)


def _parse(name: str) -> dict:
    p = name.split("_")
    # NISAR_L2_PR_GUNW_<cyc>_<trk>_<dir>_<frm>_<cyc2>_<mode>_<pol>_<rs>_<re>_<ss>_<se>_<crid>_<f1>_<f2>_<f3>_<cnt>
    return {"track": int(p[5]), "dir": p[6], "frame": int(p[7]), "ref_start": p[11], "sec_start": p[13],
            "crid": p[15], "flags": "_".join(p[16:19]), "counter": p[19]}


def _iso(stamp: str) -> str:
    return f"{stamp[0:4]}-{stamp[4:6]}-{stamp[6:8]}T{stamp[9:11]}:{stamp[11:13]}:{stamp[13:15]}Z"


def _read_window(ctx: Ctx, name: str) -> dict:
    cache = ctx.cache_dir("gunw", ctx.zone.id) / f"{name}_coherence.npz"
    if cache.exists():
        z = np.load(cache)
        return {k: z[k] for k in z.files}
    import earthaccess
    import h5py

    earthaccess.login(strategy="netrc")
    found = earthaccess.search_data(concept_id=COLLECTION, granule_name=name)
    if not found:
        raise RuntimeError(f"earthaccess no encuentra {name}")
    with h5py.File(earthaccess.open(found)[0], "r") as f:
        g = f[GROUP]
        epsg = int(g["projection"][()])
        x = g["xCoordinates"][:]
        y = g["yCoordinates"][:]
        to = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
        w, s, e, n = ctx.grid.padded_bbox_wgs84(0.01)
        xs, ys = to.transform([w, e, w, e], [s, s, n, n])
        ci = np.where((x >= min(xs)) & (x <= max(xs)))[0]
        ri = np.where((y >= min(ys)) & (y <= max(ys)))[0]
        if ci.size == 0 or ri.size == 0:
            raise RuntimeError("el AOI no interseca el granulo")
        sl = (slice(ri[0], ri[-1] + 1), slice(ci[0], ci[-1] + 1))
        coh = g["HH/coherenceMagnitude"][sl].astype(np.float32)
        mask = g["mask"][sl]
        freq = float(f["/science/LSAR/GUNW/grids/frequencyA/centerFrequency"][()])
        ident = f["/science/LSAR/identification"]
        meta = {"epsg": epsg, "centerFrequencyHz": freq,
                "productVersion": ident["productVersion"][()].decode(),
                "productDoi": ident["productDoi"][()].decode(),
                "crid": ident["compositeReleaseId"][()].decode()}
        dx, dy = float(x[1] - x[0]), float(y[1] - y[0])
        tr = Affine(dx, 0, float(x[ci[0]]) - dx / 2, 0, dy, float(y[ri[0]]) - dy / 2)
    np.savez_compressed(cache, coh=coh, mask=mask, transform=np.array(tr[:6]), meta=np.array(json.dumps(meta)))
    z = np.load(cache)
    return {k: z[k] for k in z.files}


def run(ctx: Ctx) -> SourceResult:
    zone, grid = ctx.zone, ctx.grid
    res = SourceResult(source="gunw", owned_ids=["insar-coherence", "los-displacement"])
    items = cmr_granules(COLLECTION, zone.bbox, f"{PERIOD_START}T00:00:00Z", f"{PERIOD_END}T23:59:59Z")
    names = sorted(granule_name(i) for i in items if zone.nisar_key in granule_name(i))
    names = [n for n in names if _parse(n)["flags"] == "N_F_J"]
    log(f"[{zone.id}] GUNW: {len(items)} granulos sobre el AOI; {len(names)} del track/frame con marcas N_F_J")
    res.unavailable.append({
        "id": "los-displacement", "title": "Desplazamiento en la línea de visión (NISAR GUNW)",
        "reason": ("No se publica aunque hay granulos GUNW: la fase desenrollada es relativa dentro de cada "
                   "componente conexa y exige fijar un punto de referencia estable, aplicar/validar las "
                   "correcciones ionosférica y troposférica y confirmar la convención de signo del producto. "
                   "Sin esa validación un mapa de milímetros sería engañoso."),
    })
    if not names:
        res.unavailable.append({"id": "insar-coherence", "title": "Coherencia interferométrica (NISAR GUNW)",
                                "reason": f"CMR devolvió 0 granulos de {COLLECTION} con marcas N_F_J para "
                                          f"{zone.nisar_key} entre {PERIOD_START} y {PERIOD_END}."})
        return res
    pick = next((n for n in names if _parse(n)["ref_start"].startswith(PREFERRED_REFERENCE_DATE)), names[-1])
    info = _parse(pick)
    try:
        d = _read_window(ctx, pick)
    except Exception as exc:  # noqa: BLE001
        res.unavailable.append({"id": "insar-coherence", "title": "Coherencia interferométrica (NISAR GUNW)",
                                "reason": f"Lectura parcial del HDF5 {pick} fallida: {exc}"})
        return res
    meta = json.loads(str(d["meta"]))
    coh = d["coh"].astype(np.float64)
    ok = mask_valid(d["mask"]) & np.isfinite(coh) & (coh >= 0) & (coh <= 1)
    coh[~ok] = np.nan
    vals, _ = average_to_grid(coh, Affine(*d["transform"]), f"EPSG:{meta['epsg']}", grid, MIN_VALID)
    ref_iso, sec_iso = _iso(info["ref_start"]), _iso(info["sec_start"])
    wavelength = 299792458.0 / meta["centerFrequencyHz"]
    log(f"  coherencia {ref_iso}→{sec_iso}: media {np.nanmean(vals):.3f}, válido {np.isfinite(vals).mean():.3f}")
    res.variables.append(VariableData(meta={
        "id": "insar-coherence", "title": "Coherencia interferométrica 12 días (NISAR GUNW)",
        "group": "nisar", "unit": "adimensional (0–1)", "scale": 1 / 254, "offset": 0.0, "decimals": 2,
        "displayRange": [0.0, 1.0], "palette": "radar", "temporal": False,
        "description": (
            "Magnitud de la coherencia interferométrica HH entre dos pasadas NISAR separadas 12 días "
            f"({ref_iso[:10]} y {sec_iso[:10]}), media por celda de los píxeles de 80 m. Valores altos indican "
            "una superficie estable entre ambas fechas (suelo desnudo, roca, construcciones); valores bajos, "
            "cambios (vegetación que se mueve o crece, laboreo, riego, lluvia)."),
        "caveat": (
            "Producto PROVISIONAL de una sola pareja de fechas: no es un mapa de cultivo ni de producción. La "
            "coherencia baja puede deberse a vegetación, labores, riego o lluvia indistintamente, y también "
            "depende de la geometría (pendiente) y del ruido del radar. No es un desplazamiento del terreno."),
        "provenance": {
            "provider": NISAR_PROVIDER,
            "product": f"NISAR L2 GUNW PROVISIONAL ({COLLECTION}) — {GROUP}/HH/coherenceMagnitude",
            "processingVersion": f"CRID {meta['crid']}; productVersion {meta['productVersion']}",
            "license": nisar_license(COLLECTION_TITLE, meta["productDoi"], "CMR: FreeAndOpenData = true"),
            "referenceUrl": "https://nisar-docs.asf.alaska.edu/gunw",
            "maturity": "PROVISIONAL",
            "doi": meta["productDoi"],
            "note": (f"Se excluyen píxeles de agua, fuera de subfranja válida o con anomalías según la capa mask; "
                     f"media por celda con ≥ {int(MIN_VALID * 100)} % de píxeles válidos. Frecuencia central del "
                     f"producto {meta['centerFrequencyHz'] / 1e9:.4f} GHz (λ ≈ {wavelength:.4f} m)."),
        },
    }, steps=[StepData(date=ref_iso, label=f"{ref_iso[:10]} → {sec_iso[:10]}", values=vals, provenance={
        "referenceAcquisition": ref_iso, "secondaryAcquisition": sec_iso, "sceneId": pick,
        "crid": info["crid"],
        "note": (f"Pareja de 12 días de la pasada {zone.direction_label} (track {zone.nisar_track}, frame "
                 f"{zone.nisar_frame}); lectura parcial HTTP del HDF5 con earthaccess."),
    })]))
    return res
