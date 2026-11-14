#!/usr/bin/env python3
"""Convierte productos NISAR L3 SME2 (HDF5) en capas OliveTwin (contrato v1.2.0).

Para cada fichero .h5 (o, con --from-staging, para cada GeoTIFF maestro ya
preparado):
  1. recorta la capa de humedad al AOI (rejilla EASE-Grid 2.0, EPSG:6933);
  2. guarda el recorte como GeoTIFF maestro (valores reales, NaN = sin dato);
  3. reproyecta a EPSG:3857 por vecino más próximo (sin inventar valores) y
     a la vez sobremuestrea para que Leaflet no difumine píxeles de 200 m;
  4. pinta un PNG RGBA con una escala FIJA común a todas las fechas (alpha 0
     donde no hay dato);
  5. calcula el bbox WGS84 a partir de las esquinas exactas del raster 3857;
  6. comprueba la georreferencia: píxeles de origen conocidos deben caer, al
     interpolar linealmente en Mercator dentro del bbox (como hace Leaflet
     ImageOverlay), sobre un píxel PNG opaco con el color esperado.

Salida (en --staging, por defecto ./sme2_staging/<zone-id>/):
  - geotiff/<fecha>_<capa>.tif         maestro científico (NO versionar)
  - png/soil-moisture_<fecha>.png      overlay por fecha
  - layer.staging.json                 capa elegida + serie preparada (con metadatos)
  - timeseries.json                    serie publicable (contrato v1.2.0 timeSteps)
  - report.json                        comprobaciones, escala y estadísticas

Publicación (--publish --approved-by "Nombre"):
  - sin --date: copia TODAS las escenas utilizables como `timeSteps` ordenados
    en frontend/public/data/real/zones/<zone-id>/soil-moisture/<fecha>.png y
    escribe schemaVersion "1.2.0" si el manifiesto era 1.1.0;
  - con --date: publica solo esa fecha, sin timeSteps (capa única).
  Sin aprobación científica explícita NO se toca el manifiesto real: el
  contrato reserva `processed_real` para datos revisados.

Escala:
  - --auto-scale: percentiles p2–p98 agrupados de todas las escenas, redondeados
    hacia fuera a múltiplos de 0.05 (común a toda la serie);
  - --vmin/--vmax: escala manual fija (por defecto 0–0,6 m³/m³).

Re-render: `--from-staging DIR [DIR ...]` lee `layer.staging.json` y el GeoTIFF
maestro de cada DIR y repite warp/colorize/verify/publish sin volver a abrir HDF5.

Requisitos: numpy, h5py, rasterio, pyproj, pillow.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
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
SCHEMA_VERSION = "1.2.0"
REFERENCE_URL = "https://nisar-docs.asf.alaska.edu/sme2"
SCALE_STEP = 0.05  # redondeo hacia fuera de la escala automática (m³/m³)

# Paleta secuencial seco -> húmedo, distinta de la de NDVI. Las paradas son la leyenda.
PALETTE = ["#a6611a", "#e9c46a", "#d9f0a3", "#41b6c4", "#2c7fb8", "#253494"]

NAME_RE = re.compile(
    r"NISAR_L3_(?P<config>[A-Z]{2})_SME2_(?P<cycle>\d{3})_(?P<track>\d{3})_(?P<dir>[AD])_"
    r"(?P<frame>\d{3}).*?_(?P<start>\d{8}T\d{6})_(?P<end>\d{8}T\d{6})_(?P<crid>[A-Z]\d{5})_"
)


class SceneSkipped(Exception):
    """Escena descartada con un motivo legible (no invalida las demás)."""


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


# ------------------------------------------------------------ escenas (HDF5/staging)
def load_h5_scene(h5_path: Path, layer: str, aoi: tuple[float, float, float, float]) -> dict:
    meta = parse_name(h5_path)
    c = crop(h5_path, layer, aoi)
    if not c:
        raise SceneSkipped(f"{h5_path.name}: el AOI queda fuera de la escena")
    c.update({"meta": meta, "source": h5_path, "writeMaster": True, "stagingMaturity": None})
    return c


def meta_from_provenance(prov: dict, fallback_id: str) -> dict:
    """Reconstruye la meta de una escena desde la procedencia de staging."""
    scene_id = prov.get("sceneId")
    if scene_id:
        try:
            # La escena guardada en el manifiesto no incluye la extensión .h5.
            return parse_name(Path(str(scene_id) + ".h5"))
        except ValueError:
            pass
    acq = prov.get("acquisitionDate")
    if not acq:
        raise SceneSkipped(f"{fallback_id}: sin sceneId reconocible ni acquisitionDate")
    try:
        dt = datetime.fromisoformat(str(acq).replace("Z", "+00:00"))
    except ValueError as exc:
        raise SceneSkipped(f"{fallback_id}: acquisitionDate no es ISO 8601 ({acq})") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc)
    return {
        "sceneId": str(scene_id or fallback_id),
        "crid": str(prov.get("crid") or prov.get("processingVersion") or "desconocido"),
        "cycle": None,
        "track": None,
        "frame": None,
        "direction": None,
        "acquisitionStart": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "date": dt.strftime("%Y-%m-%d"),
    }


def load_staging_geotiff(tif: Path, prov: dict, maturity: str | None = None) -> dict:
    """Carga un GeoTIFF maestro (EPSG:6933, NaN = sin dato) como escena re-renderizable."""
    if not tif.is_file():
        raise SceneSkipped(f"{tif}: no existe el GeoTIFF maestro")
    with rasterio.open(tif) as ds:
        arr = ds.read(1).astype("float32")
        transform = ds.transform
        epsg = ds.crs.to_epsg() if ds.crs else SRC_EPSG_DEFAULT
        tags = ds.tags()
    arr[~np.isfinite(arr)] = np.nan
    units = decode(tags.get("units"))
    layer_path = decode(tags.get("source_layer")) or f"{SME2_ROOT}/grids/{DEFAULT_LAYER}"
    if "soilm" in layer_path.lower() or "meter^3" in units or "m3" in units:
        with np.errstate(invalid="ignore"):
            arr[(arr < 0) | (arr > 1)] = np.nan
    h, w = arr.shape
    # Centros de píxel a partir de la transformada (fila 0 = norte).
    x = transform.c + (np.arange(w) + 0.5) * transform.a
    y = transform.f + (np.arange(h) + 0.5) * transform.e
    meta = meta_from_provenance(prov, tif.stem)
    return {
        "data": arr, "x": x, "y": y, "dx": abs(transform.a), "dy": abs(transform.e),
        "epsg": int(epsg or SRC_EPSG_DEFAULT), "units": units, "layerPath": layer_path,
        "aoiCoverage": None, "meta": meta, "source": tif, "writeMaster": False,
        "transform": transform, "stagingMaturity": maturity or prov.get("maturity"),
    }


def load_staging_dir(directory: Path) -> list[dict]:
    """Lee una carpeta de staging: layer.staging.json + GeoTIFF(s) maestro(s)."""
    if not directory.is_dir():
        raise SceneSkipped(f"{directory}: no es un directorio de staging")
    manifest = directory / "layer.staging.json"
    if not manifest.is_file():
        raise SceneSkipped(f"{directory}: falta layer.staging.json")
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SceneSkipped(f"{manifest}: JSON no válido ({exc})") from exc
    if not isinstance(data, dict):
        raise SceneSkipped(f"{manifest}: estructura inesperada")
    layer = data.get("layer") if isinstance(data.get("layer"), dict) else data
    layer_prov = layer.get("provenance") if isinstance(layer.get("provenance"), dict) else {}
    layer_maturity = layer_prov.get("maturity")

    series = data.get("series")
    if isinstance(series, list) and series:
        scenes = []
        for entry in series:
            if not isinstance(entry, dict):
                continue
            rel = entry.get("geotiff")
            if not rel:
                continue
            tif = Path(rel) if Path(rel).is_absolute() else directory / rel
            prov = entry.get("provenance") if isinstance(entry.get("provenance"), dict) else layer_prov
            scene = load_staging_geotiff(tif, prov, entry.get("maturity") or layer_maturity)
            # Metadatos de órbita del staging (útiles si sceneId no es un nombre NISAR estándar).
            for key in ("track", "frame", "cycle", "direction"):
                if entry.get(key) is not None:
                    scene["meta"][key] = entry[key]
            scenes.append(scene)
        if not scenes:
            raise SceneSkipped(f"{manifest}: la serie no contiene GeoTIFF utilizables")
        return scenes

    tifs = sorted((directory / "geotiff").glob("*.tif"))
    if not tifs:
        raise SceneSkipped(f"{directory}: no hay GeoTIFF maestro en geotiff/")
    if len(tifs) > 1:
        raise SceneSkipped(
            f"{directory}: {len(tifs)} GeoTIFF sin 'series' en layer.staging.json; "
            "pasa un DIR por escena o regenera el staging con esta versión")
    return [load_staging_geotiff(tifs[0], layer_prov, layer_maturity)]


def check_scene(scene: dict, min_valid: float) -> None:
    data = scene["data"]
    valid = float(np.isfinite(data).mean()) if data.size else 0.0
    if valid < min_valid:
        raise SceneSkipped(f"{scene['meta']['sceneId']}: solo {valid:.0%} de píxeles válidos")
    units = scene.get("units") or ""
    if units and "meter^3" not in units and "m3" not in units:
        raise SceneSkipped(f"{scene['meta']['sceneId']}: unidades inesperadas '{units}'")
    scene["validFraction"] = valid


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


def fmt_m3(v: float) -> str:
    """Número con coma decimal para la leyenda en español: 0,10 m³/m³."""
    return f"{v:.2f}".replace(".", ",") + " m³/m³"


def legend(vmin: float, vmax: float) -> list[dict]:
    vals = np.linspace(vmin, vmax, len(PALETTE))
    stops = [{"value": round(float(v), 4), "color": c, "label": fmt_m3(float(v))}
             for v, c in zip(vals[1:-1], PALETTE[1:-1])]
    return ([{"value": round(float(vals[0]), 4), "color": PALETTE[0], "label": "Más seco"}]
            + stops
            + [{"value": round(float(vals[-1]), 4), "color": PALETTE[-1], "label": "Más húmedo"}])


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


# ------------------------------------------------------------------------ escala
def auto_scale(scenes: list[dict], step: float = SCALE_STEP) -> tuple[float, float, dict]:
    """Percentiles p2–p98 agrupados, redondeados hacia fuera a múltiplos de `step`."""
    vals = np.concatenate([s["data"][np.isfinite(s["data"])] for s in scenes])
    vals = vals[np.isfinite(vals)]
    if vals.size == 0:
        raise ValueError("No hay valores válidos para --auto-scale")
    p2, p98 = (float(v) for v in np.percentile(vals, [2, 98]))
    vmin = max(0.0, math.floor(p2 / step + 1e-9) * step)
    vmax = min(1.0, math.ceil(p98 / step - 1e-9) * step)
    if vmax <= vmin:  # serie degenerada: garantizar un intervalo no nulo
        vmax = min(1.0, vmin + step)
        if vmax <= vmin:
            vmin = max(0.0, vmax - step)
    return round(vmin, 2), round(vmax, 2), {"p2": round(p2, 6), "p98": round(p98, 6),
                                            "samples": int(vals.size), "step": step}


# ------------------------------------------------------------------- serie/leyenda
def scene_note(meta: dict, vmin: float, vmax: float) -> str:
    bits = []
    if meta.get("track") is not None:
        bits.append(f"Track {meta['track']} {meta.get('direction') or ''}".strip())
    if meta.get("frame") is not None:
        bits.append(f"frame {meta['frame']}")
    if meta.get("cycle") is not None:
        bits.append(f"ciclo {meta['cycle']}")
    prefix = (", ".join(bits) + ". ") if bits else ""
    return (f"{prefix}Recorte AOI, reproyección EPSG:6933→3857 por vecino más próximo, "
            f"escala fija {vmin}–{vmax} m³/m³.")


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
            "note": scene_note(meta, vmin, vmax),
            "maturity": maturity,
            "crid": meta["crid"],
        },
        "qualityNote": (f"Producto {maturity}: no totalmente calibrado; usar cambios relativos con "
                        "cautela. Sin estimación en zonas urbanas, agua o vegetación densa "
                        "(VWC > 5 kg/m²). Humedad superficial (~5 cm), no equivale a necesidad de riego."),
    }


def build_step(meta: dict, image_rel: str, bbox: list[float], vmin: float, vmax: float) -> dict:
    return {
        "date": meta["acquisitionStart"],
        "image": image_rel,
        "bbox": bbox,
        "provenance": {
            "acquisitionDate": meta["acquisitionStart"],
            "sceneId": meta["sceneId"],
            "processingVersion": meta["crid"],
            "note": scene_note(meta, vmin, vmax),
            "crid": meta["crid"],
        },
    }


def publish_stem(meta: dict) -> str:
    """YYYYMMDDTHHMMSS de la adquisición (nombre único de PNG publicado)."""
    return meta["acquisitionStart"][:19].replace("-", "").replace(":", "")


def scene_tag(meta: dict) -> str:
    tag = publish_stem(meta)
    if meta.get("track") is not None:
        tag += f"_{(meta.get('direction') or 'x')[0].upper()}{meta['track']:03d}"
    if meta.get("frame") is not None:
        tag += f"_F{meta['frame']:03d}"
    return tag


def bbox_union(a, b) -> list[float]:
    return [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]


def atomic_write(path: Path, data: bytes) -> None:
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def _version_tuple(value) -> tuple[int, int, int] | None:
    m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", str(value))
    return tuple(int(x) for x in m.groups()) if m else None


def publish(args, layer_entry: dict, steps: list[dict],
            png_sources: list[tuple[Path, str]]) -> Path:
    """Copia los PNG y publica la capa (y su serie) en el manifiesto real."""
    public = Path(args.public_dir)
    manifest_path = public / "data/real/manifest.json"
    if not manifest_path.is_file():
        sys.exit(f"ERROR: no existe {manifest_path} (¿--public-dir correcto?)")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        sys.exit(f"ERROR: {manifest_path} no es JSON válido: {exc}")
    # Validar todo ANTES de escribir nada.
    if manifest.get("datasetMode") != "real":
        sys.exit(f"ERROR: {manifest_path} no es un manifiesto real")
    zones = manifest.get("zones")
    if not isinstance(zones, list) or not all(isinstance(z, dict) and isinstance(z.get("layers"), list)
                                              and "id" in z for z in zones):
        sys.exit(f"ERROR: {manifest_path} no tiene una lista 'zones' válida")
    dests = []
    for src, rel in png_sources:
        dst = (public / rel).resolve()
        if public.resolve() not in dst.parents:
            sys.exit(f"ERROR: ruta de imagen fuera de {public}: {rel}")
        dests.append((src, dst))

    layer_entry = dict(layer_entry)
    layer_entry["provenance"] = dict(layer_entry["provenance"], approvedBy=args.approved_by)
    zone = next((z for z in zones if z["id"] == args.zone_id), None)
    if zone is None:
        base_bbox = list(args.aoi) if args.aoi else list(layer_entry["bbox"])
        zone = {"id": args.zone_id, "name": args.zone_name,
                "bbox": bbox_union(base_bbox, layer_entry["bbox"]), "layers": []}
        if args.zone_description:
            zone["description"] = args.zone_description
        zones.append(zone)

    # El bbox de la zona debe contener la capa y TODOS los pasos de la serie.
    old = zone.get("bbox")
    new = list(old) if isinstance(old, list) and len(old) == 4 else list(layer_entry["bbox"])
    new = bbox_union(new, layer_entry["bbox"])
    for step in steps:
        new = bbox_union(new, step["bbox"])
    if old != new:
        print(f"[aviso] bbox de la zona '{args.zone_id}' ampliado de {old} a {new} "
              "para contener la capa y todos sus pasos", file=sys.stderr)
        zone["bbox"] = new

    if steps:
        current = _version_tuple(manifest.get("schemaVersion"))
        if current is None or current < (1, 2, 0):
            manifest["schemaVersion"] = SCHEMA_VERSION
        layer_entry["timeSteps"] = steps
    zone["layers"] = [l for l in zone["layers"] if l.get("id") != "soil-moisture"] + [layer_entry]

    for src, dst in dests:
        dst.parent.mkdir(parents=True, exist_ok=True)
        atomic_write(dst, src.read_bytes())
    atomic_write(manifest_path, (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return manifest_path


def render_scene(scene: dict, vmin: float, vmax: float, args, out: Path) -> dict:
    meta = scene["meta"]
    layer_name = scene["layerPath"].split("/grids/", 1)[-1]
    tag = scene_tag(meta)
    if scene.get("writeMaster", True):
        src_t = write_master(scene, out / "geotiff" / f"{tag}_{layer_name.replace('/', '_')}.tif")
        geotiff_rel = f"geotiff/{tag}_{layer_name.replace('/', '_')}.tif"
    else:
        src_t = scene["transform"]
        geotiff_rel = str(scene["source"])
    merc, bounds = warp_to_mercator(scene, src_t, args.upscale)
    # 3857 -> 4326 conserva los ejes (cilíndrica): las esquinas dan el bbox exacto.
    to_ll = Transformer.from_crs(3857, 4326, always_xy=True)
    (bw, bs), (be, bn) = to_ll.transform(bounds[0], bounds[1]), to_ll.transform(bounds[2], bounds[3])
    bbox = [round(v, 7) for v in (bw, bs, be, bn)]
    rgba = colorize(merc, vmin, vmax)
    png = out / "png" / f"soil-moisture_{tag}.png"
    png.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(png, optimize=True)
    check = verify_georef(scene, rgba, bbox, vmin, vmax)
    v = scene["data"][np.isfinite(scene["data"])]
    clipped = float((v > vmax).mean())
    return {
        "meta": meta, "png": png, "bbox": bbox, "layerName": layer_name,
        "geotiff": geotiff_rel,
        "stats": {"validFraction": round(scene["validFraction"], 4), "min": float(v.min()),
                  "median": float(np.median(v)), "max": float(v.max()),
                  "clippedAboveVmax": clipped, "shape": list(scene["data"].shape),
                  "pngShape": list(rgba.shape[:2]),
                  "aoiCoverage": (round(scene["aoiCoverage"], 3)
                                  if scene.get("aoiCoverage") is not None else None),
                  "pngBytes": png.stat().st_size},
        "georefCheck": check,
        "maturity": scene.get("stagingMaturity"),
    }


# ---------------------------------------------------------------------------- main
def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("h5", nargs="*", type=Path,
                   help="Ficheros NISAR L3 SME2 .h5 (no usar junto con --from-staging)")
    p.add_argument("--from-staging", nargs="+", type=Path, default=None, metavar="DIR",
                   help="Re-renderiza desde directorios de staging (layer.staging.json + geotiff/*.tif) "
                        "en lugar de ficheros .h5")
    p.add_argument("--aoi", nargs=4, type=float, default=None, metavar=("W", "S", "E", "N"),
                   help="Área de estudio en grados WGS84: west south east north "
                        "(obligatorio con HDF5; opcional al re-renderizar)")
    p.add_argument("--zone-id", required=True, help="id de zona (kebab-case), p. ej. jaen-olivar")
    p.add_argument("--zone-name", required=True)
    p.add_argument("--zone-description", default=None)
    p.add_argument("--layer", default=DEFAULT_LAYER,
                   help="Capa bajo /science/LSAR/SME2/grids/ (por defecto soilMoisture; "
                        "alternativas: algorithmCandidates/{DSG,PMI,TSR}/soilMoisture)")
    p.add_argument("--vmin", type=float, default=None, help="Mínimo de escala manual (por defecto 0.0)")
    p.add_argument("--vmax", type=float, default=None, help="Máximo de escala manual (por defecto 0.6)")
    p.add_argument("--auto-scale", action="store_true",
                   help="Escala común automática: percentiles p2–p98 agrupados, redondeados hacia "
                        "fuera a múltiplos de 0.05")
    p.add_argument("--upscale", type=int, default=8, help="Factor de sobremuestreo nearest (1-16)")
    p.add_argument("--maturity", default=None, choices=["PROVISIONAL", "VALIDATED", "BETA"],
                   help="Madurez del producto (por defecto la de staging o PROVISIONAL)")
    p.add_argument("--date", default=None,
                   help="Fecha YYYY-MM-DD a publicar en solitario (sin timeSteps)")
    p.add_argument("--min-valid", type=float, default=0.10, help="Fracción mínima de píxeles válidos")
    p.add_argument("--allow-skipped", action="store_true",
                   help="Permite publicar la serie de las escenas restantes aunque se descartaran "
                        "otras (con aviso)")
    p.add_argument("--staging", type=Path, default=Path("sme2_staging"))
    p.add_argument("--public-dir", default="frontend/public", help="Raíz public/ del frontend")
    p.add_argument("--publish", action="store_true", help="Escribir en el manifiesto real")
    p.add_argument("--approved-by", default=None, help="Persona que aprueba científicamente (obligatorio con --publish)")
    args = p.parse_args(argv)

    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", args.zone_id):
        p.error("--zone-id debe ser kebab-case [a-z0-9-]")
    if bool(args.h5) == bool(args.from_staging):
        p.error("indica ficheros .h5 o --from-staging DIR [DIR ...], pero no ambos")
    if args.h5 and args.aoi is None:
        p.error("--aoi es obligatorio al convertir ficheros .h5")
    if args.aoi is not None:
        w, s, e, n = args.aoi
        if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
            p.error("--aoi inválido: se espera west < east y south < north")
    if args.auto_scale and (args.vmin is not None or args.vmax is not None):
        p.error("--auto-scale no se combina con --vmin/--vmax")
    if not args.auto_scale:
        args.vmin = 0.0 if args.vmin is None else args.vmin
        args.vmax = 0.6 if args.vmax is None else args.vmax
        if not 0 <= args.vmin < args.vmax <= 1:
            p.error("--vmin/--vmax deben cumplir 0 <= vmin < vmax <= 1 (m³/m³)")
    if not 0 < args.min_valid <= 1:
        p.error("--min-valid debe estar en (0, 1]")
    if not 1 <= args.upscale <= 16:
        p.error("--upscale fuera de rango")
    if args.publish and not (args.approved_by or "").strip():
        p.error("--publish exige --approved-by: processed_real requiere aprobación científica")

    out = args.staging / args.zone_id
    results, problems, warnings, skipped = [], [], [], []

    # 1) Cargar y validar escenas (HDF5 o staging), sin pintar todavía.
    scenes = []
    sources = list(args.from_staging) if args.from_staging else list(args.h5)
    for src in sorted(sources):
        try:
            if args.from_staging:
                loaded = load_staging_dir(src)
            else:
                loaded = [load_h5_scene(src, args.layer, tuple(args.aoi))]
        except ValueError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
        except SceneSkipped as exc:
            skipped.append(str(exc))
            continue
        for scene in loaded:
            try:
                check_scene(scene, args.min_valid)
            except SceneSkipped as exc:
                skipped.append(str(exc))
                continue
            scenes.append(scene)

    if not scenes:
        print("ERROR: ninguna escena utilizable", *skipped, *problems, sep="\n  ", file=sys.stderr)
        return 1

    # Orden estricto por fecha y sin duplicados (requisito de timeSteps).
    scenes.sort(key=lambda s: s["meta"]["acquisitionStart"])
    unique, seen = [], set()
    for scene in scenes:
        ts = scene["meta"]["acquisitionStart"]
        if ts in seen:
            skipped.append(f"{scene['meta']['sceneId']}: fecha duplicada {ts}; se omite")
            continue
        seen.add(ts)
        unique.append(scene)
    scenes = unique

    # 2) CRID: mezclar versiones de procesamiento invalida la comparación.
    crids = {s["meta"]["crid"] for s in scenes}
    if len(crids) > 1:
        problems.append(f"Se mezclan versiones de procesamiento (CRID): {sorted(crids)}")

    # 3) Escala común a TODA la serie.
    if args.auto_scale:
        try:
            vmin, vmax, percentiles = auto_scale(scenes)
        except ValueError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
        scale_info = {"vmin": vmin, "vmax": vmax, "mode": "auto", "percentiles": percentiles}
    else:
        vmin, vmax = args.vmin, args.vmax
        scale_info = {"vmin": vmin, "vmax": vmax, "mode": "manual"}

    # 4) Warp + colorize + verify (mismo código para HDF5 y staging).
    for scene in scenes:
        r = render_scene(scene, vmin, vmax, args, out)
        check = r["georefCheck"]
        if not check["ok"]:
            problems.append(f"{r['meta']['sceneId']}: verificación de georreferencia fallida {check}")
        if scene.get("aoiCoverage") is not None and scene["aoiCoverage"] < 0.9:
            warnings.append(f"{r['meta']['sceneId']}: la escena cubre solo {scene['aoiCoverage']:.0%} del AOI")
        if r["stats"]["clippedAboveVmax"] > 0.05:
            warnings.append(f"{r['meta']['sceneId']}: {r['stats']['clippedAboveVmax']:.0%} de píxeles "
                            f"por encima de vmax={vmax} (saturan)")
        results.append(r)
        print(f"[ok] {r['meta']['date']} {str(r['meta'].get('direction')):<10} "
              f"{r['stats']['shape']} válidos={scene['validFraction']:.0%} "
              f"mediana={r['stats']['median']:.3f} georef={check['passed']}/{check['checked']} "
              f"-> {r['png']}")

    if args.date:
        matches = [r for r in results if r["meta"]["date"] == args.date]
        if not matches:
            print(f"ERROR: no hay escena utilizable en {args.date}", file=sys.stderr)
            return 1
        chosen = matches[-1]
    else:
        chosen = results[-1]

    def maturity_for(r: dict) -> str:
        return args.maturity or r.get("maturity") or "PROVISIONAL"

    # 5) Rutas de publicación y capa/serie (sin escribir aún).
    zone_dir = f"data/real/zones/{args.zone_id}/soil-moisture"
    series = []  # (paso, resultado, ruta publicable) para TODAS las escenas utilizables
    for r in results:
        rel = f"{zone_dir}/{publish_stem(r['meta'])}.png"
        series.append((build_step(r["meta"], rel, r["bbox"], vmin, vmax), r, rel))
    if args.date:
        layer_entry = build_layer(chosen["meta"], f"{zone_dir}/{publish_stem(chosen['meta'])}.png",
                                  chosen["bbox"], vmin, vmax, chosen["layerName"],
                                  maturity_for(chosen))
        steps, png_sources = [], [(chosen["png"], f"{zone_dir}/{publish_stem(chosen['meta'])}.png")]
        chosen_geotiff = chosen["geotiff"]
    else:
        steps = [step for step, _, _ in series]
        png_sources = [(r["png"], rel) for _, r, rel in series]
        last = results[-1]
        layer_entry = build_layer(last["meta"], steps[-1]["image"], last["bbox"], vmin, vmax,
                                  last["layerName"], maturity_for(last))
        chosen_geotiff = last["geotiff"]

    # 6) Staging: capa elegida + serie y reporte (solo en modo HDF5; no pisar la fuente).
    if not args.from_staging:
        (out / "layer.staging.json").write_text(json.dumps({
            "_staging": "NO copiar a mano al manifiesto: publicar con --publish --approved-by tras la revisión científica.",
            "zoneId": args.zone_id,
            "schemaVersion": SCHEMA_VERSION,
            "layer": layer_entry,
            "series": [{"date": step["date"], "image": rel, "bbox": step["bbox"],
                        "geotiff": r["geotiff"], "maturity": maturity_for(r),
                        "track": r["meta"].get("track"), "frame": r["meta"].get("frame"),
                        "cycle": r["meta"].get("cycle"), "direction": r["meta"].get("direction"),
                        "provenance": step["provenance"]}
                       for step, r, rel in series],
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (out / "timeseries.json").write_text(json.dumps({
            "note": "Serie publicable como layer.timeSteps (contrato v1.2.0).",
            "zoneId": args.zone_id, "layerId": "soil-moisture",
            "scale": [vmin, vmax],
            "steps": [{"date": step["date"], "image": rel, "bbox": step["bbox"],
                       "sceneId": r["meta"]["sceneId"], "direction": r["meta"].get("direction"),
                       "median": r["stats"]["median"]}
                      for step, r, rel in series],
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report = {"schemaVersion": SCHEMA_VERSION,
              "mode": "from-staging" if args.from_staging else "hdf5",
              "aoi": args.aoi, "layer": args.layer, "scale": scale_info,
              "chosen": chosen["meta"]["sceneId"],
              "chosenGeotiff": chosen_geotiff,
              "seriesLength": len(results),
              "problems": problems, "skipped": skipped, "warnings": warnings,
              "scenes": [{"sceneId": r["meta"]["sceneId"], "date": r["meta"]["date"],
                          "bbox": r["bbox"], **r["stats"], "georefCheck": r["georefCheck"]}
                         for r in results]}
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                                     encoding="utf-8")

    for msg in skipped:
        print(f"[descartada] {msg}", file=sys.stderr)
    for msg in problems + warnings:
        print(f"[aviso] {msg}", file=sys.stderr)
    print(f"Staging listo en {out} ({len(results)} escena(s); capa elegida: {chosen['meta']['date']}; "
          f"escala {vmin}–{vmax} m³/m³, {scale_info['mode']})")

    if args.publish:
        if problems:
            print("ERROR: no se publica con fallos de georreferencia o CRID mezclados", file=sys.stderr)
            return 1
        if skipped and not args.date and not args.allow_skipped:
            print("ERROR: se descartaron escenas; la serie publicada sería incompleta. "
                  "Usa --allow-skipped para publicar solo las restantes o --date para una fecha.",
                  file=sys.stderr)
            return 1
        if skipped and args.allow_skipped and not args.date:
            print(f"[aviso] se publica la serie de {len(results)} escena(s) omitiendo "
                  f"{len(skipped)} descartada(s) por --allow-skipped", file=sys.stderr)
        mp = publish(args, layer_entry, steps, png_sources)
        extra = f" con {len(steps)} pasos temporales" if steps else f" ({chosen['meta']['date']})"
        print(f"Publicado en {mp}{extra}. Ejecuta `npm run validate:data --prefix frontend` antes de la PR.")
    else:
        print("No se ha tocado el manifiesto real (usa --publish --approved-by tras la revisión científica).")
    # Códigos: 0 = ok; 1 = error/publicación bloqueada; 2 = staging con problemas (georref. o CRID).
    return 2 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
