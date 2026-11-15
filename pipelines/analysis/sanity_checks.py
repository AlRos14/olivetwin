#!/usr/bin/env python3
"""Comprobaciones de coherencia (georreferencia y plausibilidad) de los cubos publicados.

No descarga nada: usa los cubos de frontend/public y la caché de SME2 (HDF5). Imprime un informe.

1. SME2: los PNG de visualización ya publicados (capa soil-moisture del manifiesto, RGBA en
   EPSG:3857) se invierten con la paleta del conversor y se muestrean en los centros de las celdas
   de la rejilla; deben coincidir celda a celda con la humedad SIN máscara de calidad calculada aquí
   desde el mismo HDF5 (misma fuente, ambos por vecino más próximo).
2. Relieve: la pendiente y la altitud medias deben ser mayores en la franja sur de Jaén (sierras al
   sur de la capital) que en la franja norte (campiña).
3. Vegetación: NDVI menor en las celdas que SoilGrids deja sin dato (su máscara urbana/agua) que en el
   resto; correlación espacial positiva entre NDVI medio y HV medio.
4. Clima y cultivos: temperatura media anual frente a altitud; distribución de la aptitud y factor
   limitante por cultivo; sensibilidad del modelo a las variantes descartadas (periodo de 12 meses para el
   almendro, periodo de 8 meses de la tabla de Recocrop para el olivo, lluvia sumada solo en el periodo).
"""
from __future__ import annotations

import glob
import json
import sys
from pathlib import Path

import warnings

import numpy as np
from PIL import Image
from pyproj import Transformer

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "pipelines" / "nisar"))

from otanalysis.encoding import decode, read_png  # noqa: E402
from otanalysis.grid import Grid  # noqa: E402
from otanalysis.resample import warp_to_grid  # noqa: E402
from otanalysis.sources.sme2 import _read_crop  # noqa: E402
from otanalysis.zones import ZONES  # noqa: E402

PUBLIC = REPO / "frontend" / "public"
warnings.filterwarnings("ignore", message="Mean of empty slice")
TO_3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


def load_var(cube: dict, vid: str) -> list[tuple[str | None, np.ndarray]]:
    var = next((v for v in cube["variables"] if v["id"] == vid), None)
    if var is None:
        return []
    return [(s["date"], decode(read_png(PUBLIC / s["data"]), var["offset"], var["scale"])) for s in var["steps"]]


def display_png_values(path: Path, bbox, grid: Grid) -> np.ndarray:
    """Invierte la paleta del conversor SME2 (0,05–0,4) y muestrea el PNG en los centros de celda."""
    from sme2_to_overlay import colorize

    lut_vals = np.linspace(0.05, 0.4, 2048)
    lut_rgb = colorize(lut_vals[None, :], 0.05, 0.4)[0, :, :3].astype(np.int32)
    img = np.array(Image.open(path).convert("RGBA")).astype(np.int32)
    h, w = img.shape[:2]
    x0, y1 = TO_3857.transform(bbox[0], bbox[1])
    x1, y0 = TO_3857.transform(bbox[2], bbox[3])
    out = np.full(grid.shape, np.nan)
    cols = grid.x0 + (np.arange(grid.width) + 0.5) * grid.cell
    rows = grid.y0 - (np.arange(grid.height) + 0.5) * grid.cell
    for r, y in enumerate(rows):
        py = int((y0 - y) / (y0 - y1) * h)
        if not 0 <= py < h:
            continue
        for c, x in enumerate(cols):
            px = int((x - x0) / (x1 - x0) * w)
            if not 0 <= px < w or img[py, px, 3] == 0:
                continue
            d = ((lut_rgb - img[py, px, :3]) ** 2).sum(axis=1)
            out[r, c] = lut_vals[int(d.argmin())]
    return out


def check_sme2(zid: str, manifest: dict) -> None:
    zone, grid = ZONES[zid], Grid.from_bbox(ZONES[zid].bbox)
    layer = next(lyr for z in manifest["zones"] if z["id"] == zid for lyr in z["layers"] if lyr["id"] == "soil-moisture")
    to6933 = Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True)
    w, s, e, n = grid.padded_bbox_wgs84(0.01)
    xs, ys = to6933.transform([w, e, w, e], [s, s, n, n])
    for step in layer["timeSteps"]:
        h5 = glob.glob(str(HERE / "cache" / "sme2" / "h5" / f"{step['provenance']['sceneId']}.h5"))
        if not h5:
            print(f"  {zid} {step['date']}: HDF5 no está en caché; se omite")
            continue
        sm, qf, tr, meta = _read_crop(h5[0], (min(xs), min(ys), max(xs), max(ys)))
        sm = np.where((sm >= 0) & (sm <= 1), sm, np.nan)
        ours = warp_to_grid(sm, tr, f"EPSG:{meta['epsg']}", grid)
        disp = display_png_values(PUBLIC / step["image"], step["bbox"], grid)
        both = np.isfinite(ours) & np.isfinite(disp)
        clipped = both & (ours > 0.05) & (ours < 0.4)
        diff = np.abs(ours[clipped] - disp[clipped])
        print(f"  SME2 {zid} {step['date']}: celdas comparables {both.sum()}, media display "
              f"{np.nanmean(disp):.3f} vs rejilla sin máscara {np.nanmean(ours[both]):.3f}; dentro de 0,05–0,4: "
              f"|Δ| mediana {np.median(diff):.4f}, p95 {np.percentile(diff, 95):.4f}, "
              f"fracción |Δ|<0,01 {np.mean(diff < 0.01):.3f}")


def check_terrain_veg(zid: str) -> None:
    cube = json.loads((PUBLIC / f"data/real/zones/{zid}/analysis/analysis.json").read_text())
    grid = Grid.from_bbox(ZONES[zid].bbox)
    slope = load_var(cube, "slope")
    elev = load_var(cube, "elevation")
    if slope and elev and zid == "jaen":
        rows_lat = np.array([Transformer.from_crs(3857, 4326, always_xy=True).transform(grid.x0, grid.y0 - (r + 0.5) * grid.cell)[1]
                             for r in range(grid.height)])
        south, north = rows_lat < 37.72, rows_lat > 37.82
        sl, el = slope[0][1], elev[0][1]
        print(f"  Relieve jaen: pendiente media sur (<37,72°N) {np.nanmean(sl[south]):.1f}° vs norte (>37,82°N) "
              f"{np.nanmean(sl[north]):.1f}°; altitud media sur {np.nanmean(el[south]):.0f} m vs norte "
              f"{np.nanmean(el[north]):.0f} m")
    ndvi = load_var(cube, "ndvi")
    clay = load_var(cube, "soil-clay")
    hv = load_var(cube, "radar-hv")
    if ndvi and clay:
        nd = np.nanmean(np.stack([a for _, a in ndvi]), axis=0)
        masked = ~np.isfinite(clay[0][1])
        print(f"  NDVI {zid}: media en celdas sin dato SoilGrids (urbano/agua) {np.nanmean(nd[masked]):.3f} "
              f"(n={masked.sum()}) vs resto {np.nanmean(nd[~masked]):.3f}")
    if ndvi and hv:
        nd = np.nanmean(np.stack([a for _, a in ndvi]), axis=0)
        h = np.nanmean(np.stack([a for _, a in hv]), axis=0)
        ok = np.isfinite(nd) & np.isfinite(h)
        print(f"  Correlación espacial NDVI medio vs HV medio ({zid}): r = {np.corrcoef(nd[ok], h[ok])[0, 1]:.2f}")
    sm_all = load_var(cube, "soil-moisture-all")
    sm_rec = load_var(cube, "soil-moisture")
    if sm_all and sm_rec:
        a = np.isfinite(np.stack([x for _, x in sm_all])).any(axis=0)
        r = np.isfinite(np.stack([x for _, x in sm_rec])).any(axis=0)
        flagged = a & ~r
        others = {"NDVI medio": load_var(cube, "ndvi"), "HV medio (dB)": load_var(cube, "radar-hv"),
                  "pendiente (°)": load_var(cube, "slope")}
        parts = []
        for name, var in others.items():
            if var:
                m = np.nanmean(np.stack([x for _, x in var]), axis=0)
                parts.append(f"{name} {np.nanmean(m[flagged]):.3f} vs {np.nanmean(m[r]):.3f}")
        print(f"  SME2 {zid}: celdas solo en «todas las estimaciones» {flagged.mean():.3f}; marcadas vs recomendadas: "
              + "; ".join(parts))
    sm = load_var(cube, "soil-moisture")
    if sm:
        print(f"  Humedad {zid}: {len(sm)} pasos; media por paso " +
              ", ".join(f"{d[:10]}={np.nanmean(a):.3f}" for d, a in sm))


def check_climate_crops(zid: str) -> None:
    from pathlib import Path as _P

    from otanalysis.context import Ctx
    from otanalysis.ecocrop import duration_months, ecocrop, trapezoid
    from otanalysis.sources import climatology, crops

    cube = json.loads((PUBLIC / f"data/real/zones/{zid}/analysis/analysis.json").read_text())
    elev = load_var(cube, "elevation")
    tmean = load_var(cube, "climate-tmean-annual")
    if not (elev and tmean):
        print(f"  {zid}: sin variables de clima publicadas")
        return
    e, t = elev[0][1], tmean[0][1]
    ok = np.isfinite(e) & np.isfinite(t)
    low, high = ok & (e < 500), ok & (e > 1000)
    print(f"  Clima {zid}: r(altitud, Tmedia anual) = {np.corrcoef(e[ok], t[ok])[0, 1]:.3f}; Tmedia en celdas <500 m "
          f"{np.mean(t[low]) if low.any() else float('nan'):.1f} °C (n={low.sum()}) vs >1000 m "
          f"{np.mean(t[high]) if high.any() else float('nan'):.1f} °C (n={high.sum()})")
    for c in cube.get("crops", []):
        s = decode(read_png(PUBLIC / c["suitability"]["data"]), 0, c["suitability"]["scale"])
        v = s[np.isfinite(s)]
        facs = {f["id"]: decode(read_png(PUBLIC / f["raster"]["data"]), 0, f["raster"]["scale"]) for f in c["factors"]}
        stack = np.stack(list(facs.values()))
        okc = np.isfinite(s) & np.isfinite(stack).all(axis=0)
        idx = np.argmin(stack[:, okc], axis=0)
        lim = {k: round(float((idx == i).mean()), 3) for i, k in enumerate(facs)}
        print(f"  Cultivo {zid}/{c['id']}: media {v.mean():.3f}, p10 {np.percentile(v, 10):.3f}, p90 "
              f"{np.percentile(v, 90):.3f}, =0 {np.mean(v == 0):.3f}, ≥0,5 {np.mean(v >= 0.5):.3f}; limitante {lim}")
    ctx = Ctx(zone=ZONES[zid], grid=Grid.from_bbox(ZONES[zid].bbox), cache=HERE / "cache")
    gc = climatology.compute(ctx)
    for cid, gmin, gmax, ktmp_key, label in (("almendro", 365, 365, "KTMP_REST", "almendro con 12 meses"),
                                             ("olivo", 365, 365, "KTMP", "olivo, 12 meses con KTMP «early growth»"),
                                             ("olivo", 365, 365, "KTMP_REST", "olivo, 12 meses (ciclo FAO) con KTMP «during rest»")):
        p, _, _ = crops.fetch_sheet(ctx, cid)
        n = duration_months(gmin, gmax)
        r = ecocrop(gc.tmean, gc.exmin, gc.prec, {k: p[k] for k in ("TMIN", "TOPMN", "TOPMX", "TMAX")} |
                    {"KTMP": p[ktmp_key]}, n)
        sv = r["suitability"][np.isfinite(r["suitability"])]
        print(f"  Variante descartada {zid} ({label}, {n} meses, solo clima): media {sv.mean():.3f}, =0 {np.mean(sv == 0):.3f}")
    for cid in ("olivo", "almendro", "trigo"):
        p, _, _ = crops.fetch_sheet(ctx, cid)
        n = duration_months(p["GMIN"], p["GMAX"])
        best = np.zeros(gc.prec.shape[1:])
        for st in ([0] if n == 12 else range(12)):
            tot = np.sum(gc.prec[[(st + k) % 12 for k in range(n)]], axis=0)
            best = np.fmax(best, trapezoid(tot, p["RMIN"], p["ROPMN"], p["ROPMX"], p["RMAX"]))
        print(f"  Lluvia solo del periodo ({zid}/{cid}, {n} meses, mejor inicio): puntuación media {np.nanmean(best):.3f}, "
              f"=0 {np.nanmean(best == 0):.3f}")


def main() -> int:
    manifest = json.loads((PUBLIC / "data/real/manifest.json").read_text())
    for zid in ZONES:
        print(f"== {zid}")
        check_sme2(zid, manifest)
        check_terrain_veg(zid)
        check_climate_crops(zid)
    return 0


if __name__ == "__main__":
    sys.exit(main())
