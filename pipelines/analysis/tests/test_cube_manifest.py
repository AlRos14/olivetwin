import json
import shutil
from pathlib import Path

import numpy as np
import pytest

from otanalysis.cube import Cube, SourceResult, StepData, VariableData, step_filename
from otanalysis.grid import Grid
from otanalysis.manifest import update_manifest, validate_cube

REPO = Path(__file__).resolve().parents[3]
SCHEMA = REPO / "contracts" / "analysis.schema.json"
GRID = Grid.from_bbox((-3.70, 37.70, -3.60, 37.76), 250)


def _var(vid="soil-moisture", dates=("2026-06-20T05:23:26Z", "2026-07-02T05:23:25Z"), value=0.2):
    steps = []
    for i, d in enumerate(dates):
        v = np.full(GRID.shape, value + 0.01 * i)
        v[0, 0] = np.nan
        steps.append(StepData(date=d, values=v, provenance={"sceneId": f"S{i}"}))
    meta = {"id": vid, "title": "t", "group": "nisar", "unit": "m³/m³", "scale": 0.0025, "offset": 0.0,
            "decimals": 3, "displayRange": [0.05, 0.4], "palette": "moisture", "temporal": True,
            "description": "d", "caveat": "c",
            "provenance": {"provider": "p", "product": "x", "processingVersion": "v", "license": "l"}}
    return VariableData(meta=meta, steps=steps)


def _result(**kw):
    return SourceResult(source="sme2", owned_ids=["soil-moisture"], variables=[_var(**kw)])


def test_step_filename():
    assert step_filename("2026-06-20T05:23:26Z") == "20260620T052326.png"
    assert step_filename("2026-06-20") == "20260620.png"
    assert step_filename(None) == "static.png"


def test_apply_is_idempotent_and_valid(work_dir):
    for _ in range(2):
        cube = Cube(work_dir, "jaen", GRID)
        cube.apply(_result(), "AlRos14")
        doc = cube.finalize([{"id": "yield-validation", "title": "y", "reason": "r"}])
        cube.write()
    assert [v["id"] for v in doc["variables"]] == ["soil-moisture"]
    var = doc["variables"][0]
    assert var["status"] == "processed_real" and var["provenance"]["approvedBy"] == "AlRos14"
    assert [s["data"] for s in var["steps"]] == [
        "data/real/zones/jaen/analysis/soil-moisture/20260620T052326.png",
        "data/real/zones/jaen/analysis/soil-moisture/20260702T052325.png"]
    assert var["steps"][0]["stats"]["validFraction"] == pytest.approx(1 - 1 / GRID.width / GRID.height, abs=1e-4)
    assert validate_cube(doc, SCHEMA, work_dir) == []
    assert len(list((work_dir / "data/real/zones/jaen/analysis/soil-moisture").glob("*.png"))) == 2


def test_replacing_removes_stale_pngs(work_dir):
    cube = Cube(work_dir, "jaen", GRID)
    cube.apply(_result(), "A")
    cube.finalize([])
    cube.write()
    cube = Cube(work_dir, "jaen", GRID)
    cube.apply(_result(dates=("2026-08-19T05:23:23Z",)), "A")
    doc = cube.finalize([])
    names = sorted(p.name for p in (work_dir / "data/real/zones/jaen/analysis/soil-moisture").glob("*.png"))
    assert names == ["20260819T052323.png"] and len(doc["variables"][0]["steps"]) == 1


def test_failed_source_keeps_previous_variable(work_dir):
    cube = Cube(work_dir, "jaen", GRID)
    cube.apply(_result(), "A")
    cube.finalize([])
    cube.write()
    cube = Cube(work_dir, "jaen", GRID)
    cube.apply(SourceResult(source="sme2", owned_ids=["soil-moisture"],
                            unavailable=[{"id": "soil-moisture", "title": "t", "reason": "fallo"}]), "A")
    doc = cube.finalize([])
    assert [v["id"] for v in doc["variables"]] == ["soil-moisture"]
    assert "unavailable" not in doc


def test_unavailable_replaced_when_produced(work_dir):
    cube = Cube(work_dir, "jaen", GRID)
    cube.apply(SourceResult(source="sme2", owned_ids=["soil-moisture"],
                            unavailable=[{"id": "soil-moisture", "title": "t", "reason": "fallo"}]), "A")
    cube.apply(SourceResult(source="dem", owned_ids=["slope"], variables=[_var("slope")]), "A")
    cube.apply(_result(), "A")
    doc = cube.finalize([])
    assert "unavailable" not in doc
    assert [v["id"] for v in doc["variables"]] == ["soil-moisture", "slope"]


def test_grid_change_discards_previous_cube(work_dir):
    cube = Cube(work_dir, "jaen", GRID)
    cube.apply(_result(), "A")
    cube.finalize([])
    cube.write()
    other = Grid.from_bbox((-3.70, 37.70, -3.50, 37.76), 250)
    assert Cube(work_dir, "jaen", other).doc["variables"] == []


def test_validate_detects_wrong_png(work_dir):
    cube = Cube(work_dir, "jaen", GRID)
    cube.apply(_result(), "A")
    doc = cube.finalize([])
    cube.write()
    from PIL import Image
    p = work_dir / doc["variables"][0]["steps"][0]["data"]
    Image.new("RGBA", (3, 3)).save(p)
    errs = validate_cube(doc, SCHEMA, work_dir)
    assert any("modo RGBA" in e for e in errs)


def test_update_manifest_only_touches_version_and_analysis(work_dir):
    src = REPO / "frontend/public/data/real/manifest.json"
    dst = work_dir / "manifest.json"
    shutil.copy(src, dst)
    before = json.loads(dst.read_text())
    assert update_manifest(dst, ["jaen", "toledo"]) in (True, False)
    after = json.loads(dst.read_text())
    assert after["schemaVersion"] == "1.3.0"
    for zb, za in zip(before["zones"], after["zones"]):
        za = dict(za)
        assert za.pop("analysis") == f"data/real/zones/{zb['id']}/analysis/analysis.json"
        zb = {k: v for k, v in zb.items() if k != "analysis"}
        assert za == zb
    before.pop("schemaVersion"), after.pop("schemaVersion")
    before.pop("zones"), after.pop("zones")
    assert before == after
    assert update_manifest(dst, ["jaen", "toledo"]) is False
