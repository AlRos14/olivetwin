"""Genera los fixtures del cubo de análisis (datos sintéticos de prueba del validador)."""
import copy
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

PROV = {
    "provider": "Fixture sintético OliveTwin",
    "product": "Rejilla sintética de prueba",
    "processingVersion": "fixture-1",
    "license": "Apache-2.0 (fixture del repositorio)",
    "referenceUrl": None,
    "note": "Datos sintéticos solo para probar el validador; no son observaciones.",
}


def stats(m):
    return {"mean": m, "median": m, "p10": m - 0.02, "p90": m + 0.02,
            "min": m - 0.05, "max": m + 0.05, "validFraction": 0.9}


BASE = {
    "schemaVersion": "1.3.0",
    "zoneId": "demo-zona",
    "generatedAt": "2026-11-15T03:00:00Z",
    "pipeline": {"name": "fixture", "version": "0"},
    "grid": {"crs": "EPSG:3857", "bbox": [-3.9, 37.6, -3.6, 37.9], "width": 4, "height": 3,
             "cellSizeM": 250, "encoding": "png-uint8-linear", "nodata": 255},
    "variables": [
        {"id": "soil-moisture", "title": "Humedad sintética", "group": "nisar", "unit": "m³/m³",
         "scale": 0.0025, "offset": 0, "decimals": 3, "displayRange": [0.05, 0.4],
         "palette": "moisture", "temporal": True,
         "description": "Variable sintética de prueba.", "caveat": "No es una observación.",
         "status": "synthetic", "provenance": PROV,
         "steps": [
             {"date": "2026-06-20T05:23:26Z",
              "data": "data/sample/zones/demo-zona/analysis/soil-moisture/20260620.png",
              "stats": stats(0.2)},
             {"date": "2026-07-02T05:23:25Z",
              "data": "data/sample/zones/demo-zona/analysis/soil-moisture/20260702.png",
              "stats": stats(0.18)},
         ]},
        {"id": "slope", "title": "Pendiente sintética", "group": "terrain", "unit": "°",
         "scale": 0.25, "offset": 0, "displayRange": [0, 30], "palette": "terrain", "temporal": False,
         "description": "Variable sintética de prueba.", "caveat": "No es una observación.",
         "status": "synthetic", "provenance": PROV,
         "steps": [{"date": None, "data": "data/sample/zones/demo-zona/analysis/slope/static.png",
                    "stats": stats(8)}]},
    ],
    "zoneSeries": [
        {"id": "precipitation", "title": "Precipitación sintética", "unit": "mm", "chart": "bar",
         "provenance": PROV,
         "points": [{"date": "2026-06-20", "value": 0}, {"date": "2026-06-21", "value": 3.2}]},
    ],
    "unavailable": [{"id": "gunw", "title": "Deformación InSAR", "reason": "Fixture: sin datos."}],
    "suitability": {
        "title": "Índice exploratorio",
        "note": "Fixture: exploratorio y no validado.",
        "criteria": [
            {"variable": "soil-moisture", "aggregate": "mean", "direction": "higher-better",
             "weight": 1, "rationale": "Hipótesis de prueba."},
            {"variable": "slope", "aggregate": "static", "direction": "lower-better",
             "weight": 1, "rationale": "Hipótesis de prueba."},
        ],
    },
}


CROP = {
    "id": "olivo",
    "name": "Olivo",
    "scientificName": "Olea europaea L.",
    "assumptions": "Fixture: secano.",
    "method": "Fixture: mínimo de las puntuaciones de los factores.",
    "source": PROV,
    "suitability": {"data": "data/sample/zones/demo-zona/analysis/crops/olivo/suitability.png",
                    "scale": 1 / 254, "offset": 0, "stats": stats(0.6)},
    "factors": [
        {"id": "pendiente", "label": "Pendiente", "variables": ["slope"],
         "requirement": "Fixture: requisito de prueba.",
         "parameters": {"absMin": None, "optMin": None, "optMax": 15, "absMax": 30},
         "raster": {"data": "data/sample/zones/demo-zona/analysis/crops/olivo/pendiente.png",
                    "scale": 1 / 254, "offset": 0, "stats": stats(0.7)}},
    ],
}


def dump(name, obj):
    path = HERE / name
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def variant(mutate):
    obj = copy.deepcopy(BASE)
    mutate(obj)
    return obj


def add_second_static_step(obj):
    step = copy.deepcopy(obj["variables"][1]["steps"][0])
    step["data"] = "data/sample/zones/demo-zona/analysis/slope/static2.png"
    obj["variables"][1]["steps"].append(step)


if __name__ == "__main__":
    dump("valid/sample-minimal.json", BASE)
    dump("valid/sample-with-crops.json", variant(lambda o: o.update(crops=[copy.deepcopy(CROP)])))
    dump("invalid/crop-factor-unknown-variable.json",
         variant(lambda o: o.update(crops=[{**copy.deepcopy(CROP), "factors": [
             {**copy.deepcopy(CROP["factors"][0]), "variables": ["soil-ph"]}]}])))
    dump("invalid/criterion-unknown-variable.json",
         variant(lambda o: o["suitability"]["criteria"][0].update(variable="ndvi")))
    dump("invalid/steps-unordered.json", variant(lambda o: o["variables"][0]["steps"].reverse()))
    dump("invalid/data-outside-zone-dir.json",
         variant(lambda o: o["variables"][0]["steps"][0].update(
             data="data/sample/zones/otra-zona/analysis/soil-moisture/20260620.png")))
    dump("invalid/static-with-two-steps.json", variant(add_second_static_step))
