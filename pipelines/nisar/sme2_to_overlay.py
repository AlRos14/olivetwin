#!/usr/bin/env python3
"""Convierte productos NISAR L3 SME2 (HDF5) en capas OliveTwin (contrato v1.1.0).

Para cada fichero .h5:
  1. recorta la capa de humedad al AOI (rejilla EASE-Grid 2.0, EPSG:6933);
  2. guarda el recorte como GeoTIFF maestro (valores reales, NaN = sin dato);
  3. reproyecta a EPSG:3857 por vecino más próximo (sin inventar valores) y
     a la vez sobremuestrea para que Leaflet no difumine píxeles de 200 m;
  4. pinta un PNG RGBA con escala FIJA (alpha 0 donde no hay dato);
  5. calcula el bbox WGS84 a partir de las esquinas exactas del raster 3857;
  6. comprueba la georreferencia: píxeles de origen conocidos deben caer, al
     interpolar linealmente en Mercator dentro del bbox (como hace Leaflet
     ImageOverlay), sobre un píxel PNG opaco con el color esperado.

Salida (en --staging, por defecto ./sme2_staging/<zone-id>/):
  - geotiff/<fecha>_<capa>.tif         maestro científico (NO versionar)
  - png/soil-moisture_<fecha>.png      overlay por fecha
  - layer.json                         entrada de capa para el manifiesto real
  - timeseries.json                    todas las fechas (futura extensión v1.2)
  - report.json                        comprobaciones y estadísticas

Publicación (--publish --approved-by "Nombre"): copia el PNG de la fecha
elegida a frontend/public/data/real/zones/<zone-id>/soil-moisture.png y añade o
reemplaza la zona en frontend/public/data/real/manifest.json. Sin aprobación
científica explícita NO se toca el manifiesto real: el contrato reserva
`processed_real` para datos revisados.

Requisitos: numpy, h5py, rasterio, pyproj, pillow.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import h5py
import numpy as np
import rasterio
from PIL import Image
from pyproj import Transformer
from rasterio.transform import from_origin
from rasterio.warp import Resampling, calculate_default_transform, reproject

SME2_ROOT = "/science/LSAR/SME2"
DEFAULT_LAYER = "soilMoisture"  # variable principal documentada por ASF
SRC_EPSG_DEFAULT = 6933  # EASE-Grid 2.0 global
DST_CRS = "EPSG:3857"
SCHEMA_VERSION = "1.1.0"
REFERENCE_URL = "https://nisar-docs.asf.alaska.edu/sme2"

# Paleta secuencial seca -> húmeda (tipo YlGnBu). Las paradas son la leyenda.
PALETTE = ["#ffffd9", "#c7e9b4", "#41b6c4", "#225ea8", "#081d58"]

NAME_RE = re.compile(
    r"NISAR_L3_(?P<config>[A-Z]{2})_SME2_(?P<cycle>\d{3})_(?P<track>\d{3})_(?P<dir>[AD])_"
    r"(?P<frame>\d{3}).*?_(?P<start>\d{8}T\d{6})_(?P<end>\d{8}T\d{6})_(?P<crid>[A-Z]\d{5})_"
)


# --------------------------------------------------------------------------- HDF5
def parse_name(path: Path) -> dict:
    m = NAME_RE.search(path.name)
    if not m:
        raise ValueError(f"Nombre de fichero no reconocido como NISAR L3 SME2: {path.name}")
    d = m.groupdict()
    start = datetime.strptime(d["start"], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
    return {
        "sceneId": path.stem,
        "crid": d["crid"],
        "cycle": int(d["cycle"]),
        "track": int(d["track"]),
        "frame": int(d["frame"]),
        "direction": "ascending" if d["dir"] == "A" else "descending",
        "acquisitionStart": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "date": start.strftime("%Y-%m-%d"),
    }


def resolve_layer(f: h5py.File, layer: str) -> str:
    path = layer if layer.startswith("/") else f"{SME2_ROOT}/grids/{layer}"
    if path not in f or not isinstance(f[path], h5py.Dataset) or f[path].ndim != 2:
        raise KeyError(f"No existe la capa 2D {path}")
    return path


def find_coords(f: h5py.File, dset_path: str) -> tuple[str, str, str]:
    parts = dset_path.strip("/").split("/")
    for n in range(len(parts) - 1, 0, -1):
        base = "/" + "/".join(parts[:n])
        for xn, yn in (("xCoordinates", "yCoordinates"), ("x", "y")):
            if f"{base}/{xn}" in f and f"{base}/{yn}" in f:
                return f"{base}/{xn}", f"{base}/{yn}", base
    raise KeyError(f"No se encontraron xCoordinates/yCoordinates para {dset_path}")


def get_epsg(f: h5py.File, base: str) -> int:
    for cand in (f"{base}/projection", f"{SME2_ROOT}/grids/projection"):
        if cand in f:
            ds = f[cand]
            for k in ("epsg_code", "epsg"):
                if k in ds.attrs:
                    return int(np.asarray(ds.attrs[k]).item())
            try:
                return int(np.asarray(ds[()]).item())
            except (TypeError, ValueError):
                pass
    return SRC_EPSG_DEFAULT


def decode(v) -> str:
    if v is None:
        return ""
    v = np.asarray(v).item() if np.ndim(v) == 0 else v
    return v.decode() if isinstance(v, bytes) else str(v)


def crop(h5_path: Path, layer: str, aoi: tuple[float, float, float, float]) -> dict:
    west, south, east, north = aoi
    with h5py.File(h5_path, "r") as f:
        path = resolve_layer(f, layer)
        xp, yp, base = find_coords(f, path)
        x, y = f[xp][:].astype("float64"), f[yp][:].astype("float64")
        epsg = get_epsg(f, base)
        d = f[path]
        if d.shape != (len(y), len(x)):
            raise ValueError(f"Forma {d.shape} no coincide con coordenadas ({len(y)}, {len(x)})")
        tr = Transformer.from_crs(4326, epsg, always_xy=True)
        # Densificar el contorno del AOI para no perder bordes curvados.
        lons = np.concatenate([np.linspace(west, east, 50), np.full(50, east),
                               np.linspace(east, west, 50), np.full(50, west)])
        lats = np.concatenate([np.full(50, south), np.linspace(south, north, 50),
                               np.full(50, north), np.linspace(north, south, 50)])
        px, py = tr.transform(lons, lats)
        # Incluir todo píxel cuya celda toque el AOI (centro a menos de medio píxel).
        hx, hy = abs(x[1] - x[0]) / 2, abs(y[1] - y[0]) / 2
        ix = np.where((x + hx > px.min()) & (x - hx < px.max()))[0]
        iy = np.where((y + hy > py.min()) & (y - hy < py.max()))[0]
        if ix.size == 0 or iy.size == 0:
            return {}
        arr = d[iy[0]:iy[-1] + 1, ix[0]:ix[-1] + 1].astype("float32")
        fv = d.attrs.get("_FillValue")
        if fv is not None:
            fv = float(np.asarray(fv).astype("float32").item())
            if np.isfinite(fv):
                arr[arr == fv] = np.nan
        arr[~np.isfinite(arr)] = np.nan
        with np.errstate(invalid="ignore"):
            arr[(arr < 0) | (arr > 1)] = np.nan  # fuera de rango físico m3/m3
        units = decode(d.attrs.get("units"))
        xc, yc = x[ix[0]:ix[-1] + 1], y[iy[0]:iy[-1] + 1]
    if yc.size > 1 and yc[0] < yc[-1]:  # norte arriba
        yc, arr = yc[::-1], arr[::-1, :]
    dx = abs(x[1] - x[0])
    dy = abs(y[1] - y[0])
    coverage = (ix.size * dx * iy.size * dy) / max((px.max() - px.min()) * (py.max() - py.min()), 1e-9)
    return {"data": arr, "x": xc, "y": yc, "dx": dx, "dy": dy, "epsg": epsg,
            "units": units, "layerPath": path, "aoiCoverage": min(coverage, 1.0)}


# --------------------------------------------------------------------- raster/PNG
def hex_rgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype="float64")


def colorize(values: np.ndarray, vmin: float, vmax: float) -> np.ndarray:
    stops = np.array([hex_rgb(c) for c in PALETTE])
    valid = np.isfinite(values)
    t = np.clip((np.where(valid, values, vmin) - vmin) / (vmax - vmin), 0, 1)
    pos = t * (len(stops) - 1)
    i0 = np.clip(np.floor(pos).astype(int), 0, len(stops) - 2)
    frac = (pos - i0)[..., None]
    rgb = stops[i0] * (1 - frac) + stops[i0 + 1] * frac
    out = np.zeros(values.shape + (4,), dtype="uint8")
    out[..., :3] = np.where(valid[..., None], np.rint(rgb), 0).astype("uint8")
    out[..., 3] = np.where(valid, 255, 0)
    return out


def legend(vmin: float, vmax: float) -> list[dict]:
    vals = np.linspace(vmin, vmax, len(PALETTE))
    labels = ["Más seco"] + [""] * (len(PALETTE) - 2) + ["Más húmedo"]
    return [{"value": round(float(v), 4), "color": c, "label": (lab or f"{v:.2f} m³/m³")}
            for v, c, lab in zip(vals, PALETTE, labels)]


def write_master(c: dict, path: Path) -> rasterio.Affine:
    transform = from_origin(c["x"][0] - c["dx"] / 2, c["y"][0] + c["dy"] / 2, c["dx"], c["dy"])
    path.parent.mkdir(parents=True, exist_ok=True)
    h, w = c["data"].shape
    with rasterio.open(path, "w", driver="GTiff", height=h, width=w, count=1, dtype="float32",
                       crs=f"EPSG:{c['epsg']}", transform=transform, nodata=np.nan,
                       compress="deflate") as ds:
        ds.write(c["data"], 1)
        ds.update_tags(units=c["units"], source_layer=c["layerPath"])
    return transform


def warp_to_mercator(c: dict, src_transform, upscale: int):
    h, w = c["data"].shape
    src_crs = f"EPSG:{c['epsg']}"
    left, top = src_transform.c, src_transform.f
    right, bottom = left + w * c["dx"], top - h * c["dy"]
    dst_t, dw, dh = calculate_default_transform(src_crs, DST_CRS, w, h, left, bottom, right, top)
    # Sobremuestreo por vecino más próximo: mismo extent, píxeles `upscale` veces menores.
    dst_t = dst_t @ rasterio.Affine.scale(1 / upscale, 1 / upscale)
    dw, dh = dw * upscale, dh * upscale
    dst = np.full((dh, dw), np.nan, dtype="float32")
    reproject(c["data"], dst, src_transform=src_transform, src_crs=src_crs, src_nodata=np.nan,
              dst_transform=dst_t, dst_crs=DST_CRS, dst_nodata=np.nan,
              resampling=Resampling.nearest)
    bounds = (dst_t.c, dst_t.f + dh * dst_t.e, dst_t.c + dw * dst_t.a, dst_t.f)  # l, b, r, t
    return dst, bounds


def verify_georef(c: dict, rgba: np.ndarray, bbox: list[float], vmin: float, vmax: float,
                  n: int = 25) -> dict:
    """Replica la colocación de Leaflet ImageOverlay y comprueba píxeles de origen."""
    to_ll = Transformer.from_crs(c["epsg"], 4326, always_xy=True)
    to_merc = Transformer.from_crs(4326, 3857, always_xy=True)
    west, south, east, north = bbox
    (mx0, my0), (mx1, my1) = to_merc.transform(west, south), to_merc.transform(east, north)
    H, W = rgba.shape[:2]
    rows, cols = np.where(np.isfinite(c["data"]))
    if rows.size == 0:
        return {"checked": 0, "passed": 0, "ok": False, "reason": "sin píxeles válidos"}
    rng = np.random.default_rng(0)
    pick = rng.choice(rows.size, size=min(n, rows.size), replace=False)
    passed, worst = 0, 0.0
    for k in pick:
        r, col = rows[k], cols[k]
        lon, lat = to_ll.transform(c["x"][col], c["y"][r])
        mx, my = to_merc.transform(lon, lat)
        pc = int((mx - mx0) / (mx1 - mx0) * W)
        pr = int((my1 - my) / (my1 - my0) * H)
        if not (0 <= pr < H and 0 <= pc < W):
            continue
        expected = colorize(np.array([c["data"][r, col]]), vmin, vmax)[0]
        got = rgba[pr, pc]
        diff = float(np.abs(got.astype(int) - expected.astype(int)).max())
        worst = max(worst, diff)
        if got[3] == 255 and diff <= 1:
            passed += 1
    return {"checked": int(pick.size), "passed": passed, "maxColorDiff": worst,
            "ok": passed == pick.size}


# ------------------------------------------------------------------------ manifest
def build_layer(meta: dict, image_rel: str, bbox: list[float], vmin: float, vmax: float,
                layer_name: str, maturity: str) -> dict:
    return {
        "id": "soil-moisture",
        "title": "Humedad superficial (NISAR SME2)",
        "kind": "image-overlay",
        "variable": "soil_moisture",
        "image": image_rel,
        "bbox": bbox,
        "imageCrs": "EPSG:3857",
        "unit": "m³/m³",
        "range": [vmin, vmax],
        "legend": legend(vmin, vmax),
        "status": "processed_real",
        "provenance": {
            "provider": "NASA/JPL–ISRO NISAR, distribuido por ASF DAAC",
            "product": f"NISAR L3 SME2 — {layer_name}",
            "acquisitionDate": meta["acquisitionStart"],
            "sceneId": meta["sceneId"],
            "processingVersion": meta["crid"],
            "referenceUrl": REFERENCE_URL,
            "note": (f"Track {meta['track']} {meta['direction']}, frame {meta['frame']}, ciclo "
                     f"{meta['cycle']}. Recorte AOI, reproyección EPSG:6933→3857 por vecino "
                     f"más próximo, escala fija {vmin}–{vmax} m³/m³."),
            "maturity": maturity,
            "crid": meta["crid"],
        },
        "qualityNote": (f"Producto {maturity}: no totalmente calibrado; usar cambios relativos con "
                        "cautela. Sin estimación en zonas urbanas, agua o vegetación densa "
                        "(VWC > 5 kg/m²). Humedad superficial (~5 cm), no equivale a necesidad de riego."),
    }


def publish(args, layer_entry: dict, png_src: Path) -> Path:
    public = Path(args.public_dir)
    manifest_path = public / "data/real/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("datasetMode") != "real":
        sys.exit(f"ERROR: {manifest_path} no es un manifiesto real")
    dst = public / layer_entry["image"]
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(png_src, dst)
    layer_entry = dict(layer_entry)
    layer_entry["provenance"] = dict(layer_entry["provenance"], approvedBy=args.approved_by)
    zones = manifest["zones"]
    zone = next((z for z in zones if z["id"] == args.zone_id), None)
    if zone is None:
        zone = {"id": args.zone_id, "name": args.zone_name, "bbox": list(args.aoi), "layers": []}
        if args.zone_description:
            zone["description"] = args.zone_description
        zones.append(zone)
    zone["layers"] = [l for l in zone["layers"] if l["id"] != "soil-moisture"] + [layer_entry]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest_path


# ---------------------------------------------------------------------------- main
def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("h5", nargs="+", type=Path, help="Ficheros NISAR L3 SME2 .h5")
    p.add_argument("--aoi", nargs=4, type=float, required=True, metavar=("W", "S", "E", "N"),
                   help="Área de estudio en grados WGS84: west south east north")
    p.add_argument("--zone-id", required=True, help="id de zona (kebab-case), p. ej. jaen-olivar")
    p.add_argument("--zone-name", required=True)
    p.add_argument("--zone-description", default=None)
    p.add_argument("--layer", default=DEFAULT_LAYER,
                   help="Capa bajo /science/LSAR/SME2/grids/ (por defecto soilMoisture; "
                        "alternativas: algorithmCandidates/{DSG,PMI,TSR}/soilMoisture)")
    p.add_argument("--vmin", type=float, default=0.0)
    p.add_argument("--vmax", type=float, default=0.6)
    p.add_argument("--upscale", type=int, default=8, help="Factor de sobremuestreo nearest (1-16)")
    p.add_argument("--maturity", default="PROVISIONAL", choices=["PROVISIONAL", "VALIDATED", "BETA"])
    p.add_argument("--date", default=None, help="Fecha YYYY-MM-DD a publicar (por defecto la más reciente)")
    p.add_argument("--min-valid", type=float, default=0.10, help="Fracción mínima de píxeles válidos")
    p.add_argument("--staging", type=Path, default=Path("sme2_staging"))
    p.add_argument("--public-dir", default="frontend/public", help="Raíz public/ del frontend")
    p.add_argument("--publish", action="store_true", help="Escribir en el manifiesto real")
    p.add_argument("--approved-by", default=None, help="Persona que aprueba científicamente (obligatorio con --publish)")
    args = p.parse_args(argv)

    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", args.zone_id):
        p.error("--zone-id debe ser kebab-case [a-z0-9-]")
    w, s, e, n = args.aoi
    if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
        p.error("--aoi inválido: se espera west < east y south < north")
    if not 0 <= args.vmin < args.vmax <= 1:
        p.error("--vmin/--vmax deben cumplir 0 <= vmin < vmax <= 1 (m³/m³)")
    if not 1 <= args.upscale <= 16:
        p.error("--upscale fuera de rango")
    if args.publish and not (args.approved_by or "").strip():
        p.error("--publish exige --approved-by: processed_real requiere aprobación científica")

    out = args.staging / args.zone_id
    image_rel = f"data/real/zones/{args.zone_id}/soil-moisture.png"
    results, problems = [], []
    for h5_path in sorted(args.h5):
        meta = parse_name(h5_path)
        c = crop(h5_path, args.layer, tuple(args.aoi))
        if not c:
            problems.append(f"{h5_path.name}: el AOI queda fuera de la escena")
            continue
        valid = float(np.isfinite(c["data"]).mean())
        if valid < args.min_valid:
            problems.append(f"{h5_path.name}: solo {valid:.0%} de píxeles válidos")
            continue
        if c["units"] and "meter^3" not in c["units"] and "m3" not in c["units"]:
            problems.append(f"{h5_path.name}: unidades inesperadas '{c['units']}'")
            continue
        layer_name = c["layerPath"].split("/grids/", 1)[-1]
        tag = f"{meta['date']}_{meta['direction'][0].upper()}{meta['track']:03d}"
        src_t = write_master(c, out / "geotiff" / f"{tag}_{layer_name.replace('/', '_')}.tif")
        merc, bounds = warp_to_mercator(c, src_t, args.upscale)
        # 3857 -> 4326 conserva los ejes (cilíndrica): las esquinas dan el bbox exacto.
        to_ll = Transformer.from_crs(3857, 4326, always_xy=True)
        (bw, bs), (be, bn) = to_ll.transform(bounds[0], bounds[1]), to_ll.transform(bounds[2], bounds[3])
        bbox = [round(v, 7) for v in (bw, bs, be, bn)]
        rgba = colorize(merc, args.vmin, args.vmax)
        png = out / "png" / f"soil-moisture_{tag}.png"
        png.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(rgba, "RGBA").save(png, optimize=True)
        check = verify_georef(c, rgba, bbox, args.vmin, args.vmax)
        if not check["ok"]:
            problems.append(f"{h5_path.name}: verificación de georreferencia fallida {check}")
        v = c["data"][np.isfinite(c["data"])]
        results.append({
            "meta": meta, "png": png, "bbox": bbox, "layerName": layer_name,
            "layer": build_layer(meta, image_rel, bbox, args.vmin, args.vmax, layer_name, args.maturity),
            "stats": {"validFraction": round(valid, 4), "min": float(v.min()), "median": float(np.median(v)),
                      "max": float(v.max()), "clippedAboveVmax": float((v > args.vmax).mean()),
                      "shape": list(c["data"].shape), "pngShape": list(rgba.shape[:2]),
                      "aoiCoverage": round(c["aoiCoverage"], 3), "pngBytes": png.stat().st_size},
            "georefCheck": check,
        })
        print(f"[ok] {meta['date']} {meta['direction']:<10} {c['data'].shape} válidos={valid:.0%} "
              f"mediana={np.median(v):.3f} georef={check['passed']}/{check['checked']} -> {png}")

    if not results:
        print("ERROR: ninguna escena utilizable", *problems, sep="\n  ", file=sys.stderr)
        return 1

    crids = {r["meta"]["crid"] for r in results}
    if len(crids) > 1:
        problems.append(f"Se mezclan versiones de procesamiento (CRID): {sorted(crids)}")
    results.sort(key=lambda r: r["meta"]["acquisitionStart"])
    chosen = results[-1]
    if args.date:
        matches = [r for r in results if r["meta"]["date"] == args.date]
        if not matches:
            print(f"ERROR: no hay escena utilizable en {args.date}", file=sys.stderr)
            return 1
        chosen = matches[-1]

    (out / "layer.json").write_text(json.dumps(chosen["layer"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "timeseries.json").write_text(json.dumps({
        "note": "Borrador para una futura extensión aditiva del contrato (v1.2); no lo consume la app v1.1.0.",
        "zoneId": args.zone_id, "layerId": "soil-moisture",
        "steps": [{"date": r["meta"]["acquisitionStart"], "image": str(r["png"]), "bbox": r["bbox"],
                   "sceneId": r["meta"]["sceneId"], "direction": r["meta"]["direction"],
                   "median": r["stats"]["median"]} for r in results],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {"schemaVersion": SCHEMA_VERSION, "aoi": args.aoi, "layer": args.layer,
              "scale": [args.vmin, args.vmax], "chosen": chosen["meta"]["sceneId"],
              "problems": problems,
              "scenes": [{"sceneId": r["meta"]["sceneId"], "bbox": r["bbox"], **r["stats"],
                          "georefCheck": r["georefCheck"]} for r in results]}
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for msg in problems:
        print(f"[aviso] {msg}", file=sys.stderr)
    print(f"Staging listo en {out} (capa elegida: {chosen['meta']['date']})")

    if args.publish:
        if any("georreferencia" in m or "CRID" in m for m in problems):
            print("ERROR: no se publica con avisos de georreferencia o CRID mezclados", file=sys.stderr)
            return 1
        mp = publish(args, chosen["layer"], chosen["png"])
        print(f"Publicado en {mp}. Ejecuta `npm run validate:data --prefix frontend` antes de la PR.")
    else:
        print("No se ha tocado el manifiesto real (usa --publish --approved-by tras la revisión científica).")
    return 0 if not any("georreferencia" in m for m in problems) else 2


if __name__ == "__main__":
    sys.exit(main())
