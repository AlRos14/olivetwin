#!/usr/bin/env python3
"""Construye el cubo de análisis (contrato v1.3.0) de cada zona de OliveTwin con datos reales abiertos.

Uso:
    pipelines/analysis/.venv/bin/python pipelines/analysis/build_analysis.py \
        --zone all --approved-by AlRos14 [--only sme2,gcov] [--skip gunw]

Fuentes: sme2, gcov, s2, dem, soil, climate, climatology, gunw, smap, landcover, crops. Re-ejecutar es idempotente: cada fuente
reemplaza solo sus variables/series y nunca las duplica. Las descargas se guardan en
pipelines/analysis/cache/ (no versionado).
"""
from __future__ import annotations

import argparse
import importlib
import sys
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE))

from otanalysis.context import Ctx  # noqa: E402
from otanalysis.cube import Cube, SourceResult  # noqa: E402
from otanalysis.grid import Grid  # noqa: E402
from otanalysis.manifest import update_manifest, validate_cube  # noqa: E402
from otanalysis.net import log  # noqa: E402
from otanalysis.zones import ZONES  # noqa: E402

SOURCES = ["sme2", "gcov", "s2", "dem", "soil", "climate", "climatology", "gunw", "smap", "landcover", "crops"]
SOURCE_IDS = {
    "sme2": [("soil-moisture-all", "Humedad superficial (NISAR SME2, todas las estimaciones)"),
             ("soil-moisture", "Humedad superficial (NISAR SME2, calidad recomendada)")],
    "gcov": [("radar-hh", "Radar HH (NISAR GCOV)"), ("radar-hv", "Radar HV (NISAR GCOV)"),
             ("radar-hv-hh", "Razón HV−HH (NISAR GCOV)")],
    "s2": [("ndvi", "NDVI (Sentinel-2)"), ("ndmi", "NDMI (Sentinel-2)")],
    "dem": [("elevation", "Elevación (Copernicus DEM)"), ("slope", "Pendiente (Copernicus DEM)")],
    "soil": [("soil-clay", "Arcilla (SoilGrids)"), ("soil-sand", "Arena (SoilGrids)"),
             ("soil-soc", "Carbono orgánico (SoilGrids)"), ("soil-ph", "pH (SoilGrids)")],
    "climate": [("precipitation", "Precipitación"), ("et0", "ET0"), ("temperature-max", "Temperatura máxima"),
                ("temperature-min", "Temperatura mínima")],
    "gunw": [("insar-coherence", "Coherencia interferométrica (NISAR GUNW)"),
             ("los-displacement", "Desplazamiento LOS (NISAR GUNW)")],
    "smap": [("smap-soil-moisture", "Humedad del suelo SMAP (9 km)")],
    "climatology": [("climate-precip-annual", "Precipitación media anual 1991–2020"),
                    ("climate-tmean-annual", "Temperatura media anual 1991–2020"),
                    ("climate-tmin-coldest", "Mínima media del mes más frío 1991–2020"),
                    ("climate-tabsmin", "Mínima absoluta anual media 1991–2020")],
    "landcover": [("landcover-agri", "Superficie agrícola (CORINE Land Cover 2018)"),
                  ("landcover-olive", "Olivar (CORINE Land Cover 2018)")],
    "crops": [("crop-olivo", "Aptitud del olivo"), ("crop-almendro", "Aptitud del almendro"),
              ("crop-trigo", "Aptitud del trigo de secano")],
}

ALWAYS_UNAVAILABLE = [{
    "id": "yield-validation",
    "title": "Validación con rendimientos (producción de aceituna)",
    "reason": ("No hay en el repositorio datos de rendimiento a nivel de parcela con una licencia compatible; "
               "las estadísticas provinciales/municipales agregadas no permiten validar variables de 250 m en dos "
               "zonas. Por eso ningún indicador de este cubo está validado frente a producción."),
}]


def run_source(name: str, ctx: Ctx) -> SourceResult:
    mod = importlib.import_module(f"otanalysis.sources.{name}")
    try:
        return mod.run(ctx)
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        msg = f"{type(exc).__name__}: {exc}".replace("\n", " ")[:400]
        log(f"[{ctx.zone.id}] fuente {name} FALLÓ: {msg}")
        unavailable = [{"id": i, "title": t, "reason": f"Error al procesar la fuente «{name}»: {msg}"}
                       for i, t in SOURCE_IDS[name]]
        if name == "crops":
            return SourceResult(source=name, owned_ids=[], unavailable=unavailable,
                                owned_crops=[i.removeprefix("crop-") for i, _ in SOURCE_IDS[name]])
        return SourceResult(source=name, owned_ids=[i for i, _ in SOURCE_IDS[name]], unavailable=unavailable)


def parse_list(value: str | None) -> list[str]:
    if not value:
        return []
    items = [v.strip() for v in value.split(",") if v.strip()]
    bad = [v for v in items if v not in SOURCES]
    if bad:
        raise SystemExit(f"Fuentes desconocidas: {bad}. Válidas: {SOURCES}")
    return items


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zone", default="all", choices=[*ZONES, "all"])
    ap.add_argument("--only", help="lista separada por comas de fuentes a ejecutar")
    ap.add_argument("--skip", help="lista separada por comas de fuentes a omitir")
    ap.add_argument("--public-dir", default=str(REPO / "frontend" / "public"))
    ap.add_argument("--approved-by", help="revisor humano que aprueba publicar como processed_real (obligatorio)")
    ap.add_argument("--cache-dir", default=str(HERE / "cache"))
    ap.add_argument("--no-manifest", action="store_true", help="no actualizar manifest.json")
    args = ap.parse_args(argv)

    if not args.approved_by:
        ap.error("--approved-by es obligatorio: las salidas se publican como processed_real")
    only, skip = parse_list(args.only), parse_list(args.skip)
    sources = [s for s in (only or SOURCES) if s not in skip]
    zones = list(ZONES) if args.zone == "all" else [args.zone]
    public = Path(args.public_dir).resolve()
    schema = REPO / "contracts" / "analysis.schema.json"
    cache = Path(args.cache_dir).resolve()
    cache.mkdir(parents=True, exist_ok=True)

    ok = True
    for zid in zones:
        zone = ZONES[zid]
        grid = Grid.from_bbox(zone.bbox, 250.0)
        log(f"== Zona {zid}: rejilla {grid.width}×{grid.height}, bbox {grid.bbox_wgs84}; fuentes {sources}")
        ctx = Ctx(zone=zone, grid=grid, cache=cache)
        cube = Cube(public, zid, grid)
        for name in sources:
            log(f"[{zid}] fuente {name}")
            cube.apply(run_source(name, ctx), args.approved_by)
        doc = cube.finalize(ALWAYS_UNAVAILABLE)
        if not doc["variables"]:
            log(f"[{zid}] sin variables: no se escribe el cubo")
            ok = False
            continue
        cube.write()
        errors = validate_cube(doc, schema, public, zone.bbox)
        if errors:
            ok = False
            log(f"[{zid}] VALIDACIÓN FALLIDA:\n  " + "\n  ".join(errors))
        else:
            log(f"[{zid}] {cube.path.relative_to(REPO)} válido ({len(doc['variables'])} variables, "
                f"{len(doc.get('zoneSeries', []))} series, {len(doc.get('unavailable', []))} no disponibles)")
    if ok and not args.no_manifest:
        written = [z for z in zones if (public / f"data/real/zones/{z}/analysis/analysis.json").exists()]
        if update_manifest(public / "data" / "real" / "manifest.json", written):
            log("manifest.json actualizado (schemaVersion 1.3.0 + zone.analysis)")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
