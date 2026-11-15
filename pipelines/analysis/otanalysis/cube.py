"""Ensamblado, fusión idempotente y escritura del cubo de análisis (analysis.json + PNG)."""
from __future__ import annotations

import datetime as dt
import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import PIPELINE_NAME, PIPELINE_VERSION, SCHEMA_VERSION
from .encoding import encode, write_png
from .grid import Grid
from .stats import compute_stats

# Orden canónico de variables en el cubo (las no listadas van al final).
VARIABLE_ORDER = [
    "soil-moisture-all", "soil-moisture", "radar-hh", "radar-hv", "radar-hv-hh", "insar-coherence", "los-displacement",
    "ndvi", "ndmi", "elevation", "slope", "soil-clay", "soil-sand", "soil-soc", "soil-ph",
    "climate-precip-annual", "climate-tmean-annual", "climate-tmin-coldest", "climate-tabsmin",
    "landcover-agri", "landcover-olive",
]
CROP_ORDER = ["olivo", "almendro", "trigo"]
SERIES_ORDER = ["precipitation", "et0", "temperature-max", "temperature-min", "smap-soil-moisture"]


@dataclass
class StepData:
    date: str | None
    values: np.ndarray
    provenance: dict = field(default_factory=dict)
    label: str | None = None


@dataclass
class VariableData:
    meta: dict
    steps: list[StepData]


@dataclass
class SourceResult:
    source: str
    owned_ids: list[str]
    variables: list[VariableData] = field(default_factory=list)
    series: list[dict] = field(default_factory=list)
    unavailable: list[dict] = field(default_factory=list)
    crops: list["CropData"] = field(default_factory=list)
    owned_crops: list[str] = field(default_factory=list)


@dataclass
class CropFactorData:
    id: str
    label: str
    variables: list[str]
    requirement: str
    values: np.ndarray
    parameters: dict = field(default_factory=dict)
    #: Tramos legibles {optimal, acceptable, unsuitable} del requisito.
    classes: dict | None = None
    #: Fuente del requisito si no es la ficha ECOCROP del cultivo: {citation, url?}.
    reference: dict | None = None


@dataclass
class CropData:
    meta: dict  # id, name, scientificName, assumptions, method, source
    suitability: np.ndarray
    factors: list[CropFactorData]


CROP_SCALE = 1 / 254


def step_filename(date: str | None) -> str:
    """Nombre del PNG de un paso: YYYYMMDDTHHMMSS, YYYYMMDD o static."""
    if date is None:
        return "static.png"
    if len(date) == 10:
        return date.replace("-", "") + ".png"
    t = dt.datetime.fromisoformat(date.replace("Z", "+00:00")).astimezone(dt.timezone.utc)
    return t.strftime("%Y%m%dT%H%M%S") + ".png"


def _order(items: list[dict], order: list[str]) -> list[dict]:
    rank = {k: i for i, k in enumerate(order)}
    return sorted(items, key=lambda it: (rank.get(it["id"], len(order)), it["id"]))


class Cube:
    """Cubo de una zona en disco (``<public>/data/real/zones/<zona>/analysis``)."""

    def __init__(self, public_dir: Path, zone_id: str, grid: Grid, mode: str = "real"):
        self.public_dir = public_dir
        self.zone_id = zone_id
        self.grid = grid
        self.mode = mode
        self.rel_dir = f"data/{mode}/zones/{zone_id}/analysis"
        self.dir = public_dir / self.rel_dir
        self.path = self.dir / "analysis.json"
        self.doc = self._load()

    def _load(self) -> dict:
        base = {
            "schemaVersion": SCHEMA_VERSION, "zoneId": self.zone_id, "generatedAt": "",
            "pipeline": {}, "grid": self.grid.to_contract(), "variables": [],
            "zoneSeries": [], "unavailable": [], "crops": [],
        }
        if not self.path.exists():
            return base
        doc = json.loads(self.path.read_text())
        if doc.get("grid") != self.grid.to_contract():
            print(f"AVISO: la rejilla de {self.path} ha cambiado; se descarta el cubo anterior.")
            return base
        for key in ("variables", "zoneSeries", "unavailable", "crops"):
            doc.setdefault(key, [])
        return doc

    # -- fusión ---------------------------------------------------------------
    def apply(self, result: SourceResult, approved_by: str) -> None:
        produced_vars = {v.meta["id"] for v in result.variables}
        produced_series = {s["id"] for s in result.series}
        produced_crops = {c.meta["id"] for c in result.crops}
        existing_crops = {c["id"] for c in self.doc["crops"]}
        keep_crops = {i for i in result.owned_crops if i not in produced_crops and i in existing_crops}
        produced = produced_vars | produced_series | {f"crop-{i}" for i in produced_crops}
        existing_vars = {v["id"] for v in self.doc["variables"]}
        existing_series = {s["id"] for s in self.doc["zoneSeries"]}

        # Ids que la fuente reclama pero no ha producido en esta ejecución: si ya
        # existían de una ejecución anterior se conservan (no se borra un dato bueno
        # por un fallo transitorio) y no se marcan como no disponibles.
        keep_previous = {i for i in result.owned_ids if i not in produced and (i in existing_vars or i in existing_series)}
        keep_previous |= {f"crop-{i}" for i in keep_crops}
        unavailable = [u for u in result.unavailable if u["id"] not in keep_previous and u["id"] not in produced]
        for u in result.unavailable:
            if u["id"] in keep_previous:
                print(f"AVISO [{self.zone_id}] {u['id']}: no se pudo regenerar ({u['reason']}); se conserva la versión anterior.")

        owned = set(result.owned_ids) | {f"crop-{i}" for i in result.owned_crops}
        replace_ids = (owned - keep_previous) | produced
        self.doc["variables"] = [v for v in self.doc["variables"] if v["id"] not in replace_ids]
        self.doc["zoneSeries"] = [s for s in self.doc["zoneSeries"] if s["id"] not in replace_ids]
        self.doc["unavailable"] = [u for u in self.doc["unavailable"]
                                   if u["id"] not in replace_ids and u["id"] not in produced]
        for vid in set(result.owned_ids) - keep_previous - produced_vars:
            stale = self.dir / vid
            if stale.is_dir():
                shutil.rmtree(stale)

        self.doc["crops"] = [c for c in self.doc["crops"]
                             if c["id"] in keep_crops or c["id"] not in set(result.owned_crops) | produced_crops]
        for cid in set(result.owned_crops) - keep_crops - produced_crops:
            stale = self.dir / "crops" / cid
            if stale.is_dir():
                shutil.rmtree(stale)
        for crop in result.crops:
            self.doc["crops"].append(self._write_crop(crop, approved_by))

        for var in result.variables:
            self.doc["variables"].append(self._write_variable(var, approved_by))
        for s in result.series:
            s = json.loads(json.dumps(s))
            s["provenance"]["approvedBy"] = approved_by
            self.doc["zoneSeries"].append(s)
        self.doc["unavailable"].extend(unavailable)

    def _raster(self, rel_name: str, values: np.ndarray) -> dict:
        if values.shape != self.grid.shape:
            raise ValueError(f"{rel_name}: forma {values.shape} != rejilla {self.grid.shape}")
        write_png(self.dir / rel_name, encode(values, 0.0, CROP_SCALE))
        return {"data": f"{self.rel_dir}/{rel_name}", "scale": CROP_SCALE, "offset": 0,
                "stats": compute_stats(values, decimals=4)}

    def _write_crop(self, crop: "CropData", approved_by: str) -> dict:
        cid = crop.meta["id"]
        cdir = self.dir / "crops" / cid
        cdir.mkdir(parents=True, exist_ok=True)
        keep = {"suitability.png"} | {f"{f.id}.png" for f in crop.factors}
        if len(keep) != len(crop.factors) + 1:
            raise ValueError(f"{cid}: ids de factor repetidos o «suitability»")
        out = json.loads(json.dumps(crop.meta))
        out["source"]["approvedBy"] = approved_by
        out["suitability"] = self._raster(f"crops/{cid}/suitability.png", crop.suitability)
        out["factors"] = []
        for f in crop.factors:
            fd = {"id": f.id, "label": f.label, "variables": f.variables, "requirement": f.requirement}
            if f.parameters:
                fd["parameters"] = f.parameters
            if f.classes:
                fd["classes"] = f.classes
            if f.reference:
                fd["reference"] = f.reference
            fd["raster"] = self._raster(f"crops/{cid}/{f.id}.png", f.values)
            out["factors"].append(fd)
        for old in cdir.glob("*.png"):
            if old.name not in keep:
                old.unlink()
        return out

    def _write_variable(self, var: VariableData, approved_by: str) -> dict:
        meta = json.loads(json.dumps(var.meta))
        vid = meta["id"]
        vdir = self.dir / vid
        vdir.mkdir(parents=True, exist_ok=True)
        steps_out = []
        keep = set()
        steps = sorted(var.steps, key=lambda s: (s.date is None, s.date or ""))
        for st in steps:
            if st.values.shape != self.grid.shape:
                raise ValueError(f"{vid}: forma {st.values.shape} != rejilla {self.grid.shape}")
            fname = step_filename(st.date)
            if fname in keep:
                raise ValueError(f"{vid}: dos pasos con el mismo nombre de PNG {fname}")
            keep.add(fname)
            codes = encode(st.values, meta["offset"], meta["scale"])
            write_png(vdir / fname, codes)
            step = {"date": st.date}
            if st.label:
                step["label"] = st.label
            step["data"] = f"{self.rel_dir}/{vid}/{fname}"
            step["stats"] = compute_stats(st.values, decimals=max(4, meta.get("decimals", 3) + 2))
            if st.provenance:
                step["provenance"] = st.provenance
            steps_out.append(step)
        for old in vdir.glob("*.png"):
            if old.name not in keep:
                old.unlink()
        meta["status"] = "processed_real"
        meta["provenance"]["approvedBy"] = approved_by
        meta["steps"] = steps_out
        return meta

    # -- escritura ------------------------------------------------------------
    def finalize(self, extra_unavailable: list[dict]) -> dict:
        ids_done = {v["id"] for v in self.doc["variables"]} | {s["id"] for s in self.doc["zoneSeries"]}
        current = {u["id"]: u for u in self.doc["unavailable"]}
        for u in extra_unavailable:
            if u["id"] not in ids_done:
                current[u["id"]] = u
        doc = {
            "schemaVersion": SCHEMA_VERSION,
            "zoneId": self.zone_id,
            "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "pipeline": {"name": PIPELINE_NAME, "version": PIPELINE_VERSION,
                         "source": "pipelines/analysis/build_analysis.py"},
            "grid": self.grid.to_contract(),
            "variables": _order(self.doc["variables"], VARIABLE_ORDER),
        }
        if self.doc["zoneSeries"]:
            doc["zoneSeries"] = _order(self.doc["zoneSeries"], SERIES_ORDER)
        if current:
            doc["unavailable"] = sorted(current.values(), key=lambda u: u["id"])
        var_ids = {v["id"] for v in doc["variables"]}
        crops = []
        for c in self.doc["crops"]:
            missing = {v for f in c["factors"] for v in f["variables"]} - var_ids
            if missing:
                print(f"AVISO: el cultivo {c['id']} usa variables ausentes {sorted(missing)}; se omite")
                continue
            crops.append(c)
        if crops:
            doc["crops"] = sorted(crops, key=lambda c: CROP_ORDER.index(c["id"]) if c["id"] in CROP_ORDER else 99)
        self.doc = doc
        return doc

    def write(self) -> Path:
        self.dir.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self.doc, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
        tmp.replace(self.path)
        return self.path
