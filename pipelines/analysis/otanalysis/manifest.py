"""Actualización del manifiesto y validación del cubo contra el contrato."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from . import SCHEMA_VERSION
from .encoding import NODATA_CODE, read_png


def update_manifest(manifest_path: Path, zone_ids: list[str], mode: str = "real") -> bool:
    """Sube schemaVersion a 1.3.0 y añade zone.analysis; no toca nada más. Devuelve True si cambió."""
    text = manifest_path.read_text()
    doc = json.loads(text)
    changed = False
    if doc.get("schemaVersion") != SCHEMA_VERSION:
        doc["schemaVersion"] = SCHEMA_VERSION
        changed = True
    for zone in doc["zones"]:
        if zone["id"] in zone_ids:
            rel = f"data/{mode}/zones/{zone['id']}/analysis/analysis.json"
            if zone.get("analysis") != rel:
                zone["analysis"] = rel
                changed = True
    if changed:
        tmp = manifest_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
        tmp.replace(manifest_path)
    return changed


def validate_cube(doc: dict, schema_path: Path, public_dir: Path, zone_bbox=None) -> list[str]:
    """Esquema (Draft 2020-12) + comprobaciones de PNG (modo L, tamaño de la rejilla, sin alfa)."""
    from jsonschema import Draft202012Validator, FormatChecker

    schema = json.loads(schema_path.read_text())
    errors = [f"{'/'.join(map(str, e.path))}: {e.message}"
              for e in Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(doc)]
    grid = doc["grid"]
    if zone_bbox is not None:
        w, s, e, n = grid["bbox"]
        tol = 0.01
        if w < zone_bbox[0] - tol or s < zone_bbox[1] - tol or e > zone_bbox[2] + tol or n > zone_bbox[3] + tol:
            errors.append(f"grid.bbox {grid['bbox']} se sale de zone.bbox {zone_bbox}")
    from PIL import Image

    for v in doc["variables"]:
        if v["temporal"] is False and len(v["steps"]) != 1:
            errors.append(f"{v['id']}: variable estática con {len(v['steps'])} pasos")
        dates = [s["date"] for s in v["steps"]]
        if v["temporal"] and dates != sorted(dates):
            errors.append(f"{v['id']}: pasos no ordenados")
        for s in v["steps"]:
            p = public_dir / s["data"]
            if not p.exists():
                errors.append(f"{v['id']}: falta {s['data']}")
                continue
            with Image.open(p) as im:
                if im.mode != "L" or im.size != (grid["width"], grid["height"]) or "transparency" in im.info:
                    errors.append(f"{s['data']}: modo {im.mode}, tamaño {im.size}, info {list(im.info)}")
                    continue
                if any(k in im.info for k in ("icc_profile", "gamma")):
                    errors.append(f"{s['data']}: contiene fragmentos de color/gamma")
            codes = read_png(p)
            vf = float((codes != NODATA_CODE).mean())
            if abs(vf - s["stats"]["validFraction"]) > 0.002:
                errors.append(f"{s['data']}: validFraction {s['stats']['validFraction']} ≠ PNG {vf:.4f}")
            if s["stats"]["mean"] is not None and not np.isfinite(s["stats"]["mean"]):
                errors.append(f"{s['data']}: media no finita")
    var_ids = {v["id"] for v in doc["variables"]}
    crop_ids = set()
    for c in doc.get("crops", []):
        if c["id"] in crop_ids:
            errors.append(f"cultivo duplicado {c['id']}")
        crop_ids.add(c["id"])
        rasters = [("suitability", c["suitability"])] + [(f["id"], f["raster"]) for f in c["factors"]]
        if len({r[0] for r in rasters}) != len(rasters):
            errors.append(f"{c['id']}: ids de factor repetidos")
        for f in c["factors"]:
            missing = set(f["variables"]) - var_ids
            if missing:
                errors.append(f"{c['id']}/{f['id']}: variables inexistentes {sorted(missing)}")
        for name, r in rasters:
            p = public_dir / r["data"]
            if not p.exists():
                errors.append(f"{c['id']}/{name}: falta {r['data']}")
                continue
            with Image.open(p) as im:
                if im.mode != "L" or im.size != (grid["width"], grid["height"]) or "transparency" in im.info:
                    errors.append(f"{r['data']}: modo {im.mode}, tamaño {im.size}")
                    continue
            codes = read_png(p)
            if abs(float((codes != NODATA_CODE).mean()) - r["stats"]["validFraction"]) > 0.002:
                errors.append(f"{r['data']}: validFraction no coincide con el PNG")
            if p.stat().st_size > 2 * 1024 * 1024:
                errors.append(f"{r['data']}: supera 2 MB")
    return errors
