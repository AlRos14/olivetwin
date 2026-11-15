"""Aptitud por cultivo (olivo, almendro, trigo de secano) con el modelo Ecocrop y requisitos FAO ECOCROP.

Fuente de los requisitos: fichas («Data sheet») de FAO ECOCROP, https://ecocrop.apps.fao.org/, guardadas
en caché el día de la descarga; contraste con la tabla ``ecocrop.rds`` del paquete R Recocrop 0.4-2.
Ver ``otanalysis/ecocrop.py`` para las reglas del modelo y README para las decisiones.
"""
from __future__ import annotations

import datetime as dt
import html as htmlmod
import json
import re

import numpy as np
import requests

from ..context import Ctx
from ..cube import CropData, CropFactorData, SourceResult
from ..ecocrop import (INF, ABSOLUTE_ONLY_SCORE, ECOCROP_CODE_LABELS, duration_months, ecocrop, fao_texture_group,
                       killing_score, trapezoid, texture_score, usda_texture)
from ..net import log
from . import climatology, dem, gaez, soil, ugr

FAO_SHEET = "https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id={id}"
FAO_TERMS = "https://www.fao.org/contact-us/terms/en/"
RECOCROP_RDS = "https://raw.githubusercontent.com/cran/Recocrop/master/inst/parameters/ecocrop.rds"

CROPS = {
    "olivo": dict(
        name="Olivo", fao_id=1553, rds="Olea europaea L.", scientific="Olea europaea L.", gaez="oliv",
        cycle="recocrop", ktmp_fallback_to_rest=True,
        method_extra=(
            "Ciclo: la ficha FAO actual da {FAO_GMIN}–{FAO_GMAX} días y la tabla de Recocrop {REC_GMIN}–{REC_GMAX}; por "
            "decisión del owner se usa la de Recocrop (la que acompaña al código de referencia): "
            "round(({REC_GMIN}+{REC_GMAX})/60) = {N} meses, probando los 12 meses de inicio y conservando el mejor, como "
            "hace la referencia para periodos de menos de 12 meses. Con 12 meses y el rango térmico FAO (óptimo "
            "{TOPMN}–{TOPMX} °C) el invierno limitaba la puntuación en el 100 % de las celdas de ambas zonas. "
            "Temperatura letal: {KTMP_NOTE}")),
    "almendro": dict(
        name="Almendro", fao_id=2397, rds="Prunus amygdalus Batsch.",
        scientific="Prunus dulcis (Mill.) D.A.Webb (en ECOCROP: Prunus amygdalus Batsch.)",
        method_extra=(
            "Ciclo: el de la ficha FAO ({FAO_GMIN}–{FAO_GMAX} días → {N} meses) aunque es leñoso, porque con 12 meses su "
            "TMIN de {TMIN} °C daba temperatura 0 en invierno y aptitud 0 en el 100 % de las celdas (convención "
            "aceptada por el owner); no se evalúan las heladas de floración ni el reposo fuera del periodo elegido. "
            "Temperatura letal: {KTMP_NOTE}")),
    "trigo": dict(
        name="Trigo de secano", fao_id=2114, rds="Triticum aestivum L.", scientific="Triticum aestivum L.", gaez="whea",
        method_extra=(
            "Ciclo de la ficha FAO ({FAO_GMIN}–{FAO_GMAX} días → {N} meses) con el mejor mes de inicio y la temperatura "
            "letal de «early growth»: el modelo no representa el trigo de invierno sembrado en otoño que pasa el "
            "invierno en reposo. Se usa T. aestivum porque la ficha FAO de T. durum (id 10582) no da temperaturas "
            "letales («no input»). Temperatura letal: {KTMP_NOTE}")),
}
TEXTURE_WORDS = {"heavy": "H", "medium": "M", "light": "L", "organic": "O", "wide": "W"}

LICENSE = (
    "Requisitos de cultivo: © FAO, base de datos ECOCROP (https://ecocrop.apps.fao.org/). Términos de FAO para "
    "contenido web: puede copiarse, imprimirse y descargarse para estudio privado, investigación y docencia y "
    "para productos o servicios no comerciales, reconociendo a FAO como fuente y titular del copyright y sin "
    f"implicar respaldo de FAO ({FAO_TERMS}). Contraste: tabla ecocrop.rds del paquete R Recocrop 0.4-2 (GPL ≥ 3). "
    "Entradas: clima Open-Meteo/ERA5 (CC BY 4.0, Copernicus C3S), SoilGrids 2.0 (CC BY 4.0, ISRIC), "
    "Copernicus DEM GLO-30 (© DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, Copernicus)."
)


def _num(s: str):
    s = s.strip()
    try:
        return float(s)
    except ValueError:
        return None


def parse_datasheet(html: str) -> dict:
    """Extrae de la ficha FAO los valores que usa el modelo, con sus códigos ECOCROP."""
    rows = re.findall(r"<tr>(.*?)</tr>", html, flags=re.S)
    cells = [[htmlmod.unescape(re.sub(r"<[^>]+>", "", c)).strip()
              for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, flags=re.S)] for r in rows]
    out: dict = {"_raw": {}}

    def row(label):
        return next((c for c in cells if c and c[0] == label), None)

    for label, codes in (("Temperat. requir.", ("TOPMN", "TOPMX", "TMIN", "TMAX")),
                         ("Rainfall (annual)", ("ROPMN", "ROPMX", "RMIN", "RMAX")),
                         ("Soil PH", ("PHOPMN", "PHOPMX", "PHMIN", "PHMAX")),
                         ("Altitude", ("ALTOPMN", "ALTOPMX", "ALTMIN", "ALTMAX"))):
        r = row(label)
        if r:
            out["_raw"][label] = r[1:5]
            for code, v in zip(codes, r[1:5]):
                out[code] = _num(v)
    for c in cells:
        if "Soil texture" in c:
            i = c.index("Soil texture")
            out["_raw"]["Soil texture"] = c[i + 1:i + 3]
            out["TEXT"] = " ".join(TEXTURE_WORDS[w.strip()] for w in c[i + 1].split(",") if w.strip() in TEXTURE_WORDS)
            out["TEXTR"] = " ".join(TEXTURE_WORDS[w.strip()] for w in c[i + 2].split(",") if w.strip() in TEXTURE_WORDS)
        if "Killing temp. during rest" in c:
            i = c.index("Killing temp. during rest")
            out["_raw"]["Killing temp. during rest"] = c[i + 1]
            out["KTMP_REST"] = _num(c[i + 1])
        if "Killing temp. early growth" in c:
            i = c.index("Killing temp. early growth")
            out["_raw"]["Killing temp. early growth"] = c[i + 1]
            out["KTMP"] = _num(c[i + 1])
        if "Crop cycle" in c:
            i = c.index("Crop cycle")
            out["_raw"]["Crop cycle"] = c[i + 1:i + 3]
            out["GMIN"], out["GMAX"] = _num(c[i + 1]), _num(c[i + 2])
        if "Life span" in c:
            out["_raw"]["Life span"] = c[c.index("Life span") + 1]
    h2 = re.search(r"<h2>(.*?)</h2>", html)
    out["_raw"]["name"] = h2.group(1).strip() if h2 else None
    return out


def fetch_sheet(ctx: Ctx, crop_id: str) -> tuple[dict, str, str]:
    d = ctx.cache_dir("ecocrop", "fao")
    fid = CROPS[crop_id]["fao_id"]
    path = d / f"{crop_id}_dataSheet.html"
    meta = d / f"{crop_id}_dataSheet.meta.json"
    url = FAO_SHEET.format(id=fid)
    if not path.exists():
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        path.write_text(r.text)
        meta.write_text(json.dumps({"url": url, "retrieved": dt.date.today().isoformat()}))
    if not meta.exists():
        meta.write_text(json.dumps({"url": url, "retrieved": dt.date.fromtimestamp(path.stat().st_mtime).isoformat()}))
    m = json.loads(meta.read_text())
    return parse_datasheet(path.read_text()), m["url"], m["retrieved"]


def recocrop_row(ctx: Ctx, sci: str) -> dict | None:
    """Fila de la tabla de Recocrop para contraste (None si no se puede leer)."""
    try:
        import rdata
    except ImportError:
        return None
    path = ctx.cache_dir("ecocrop") / "recocrop_ecocrop.rds"
    if not path.exists():
        r = requests.get(RECOCROP_RDS, timeout=120)
        r.raise_for_status()
        path.write_bytes(r.content)
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        df = rdata.read_rds(str(path))
    sel = df[df["SCIENTNAME"].astype(str).str.strip() == sci]
    if sel.empty:
        return None
    row = sel.iloc[0]
    keys = ["NAME", "GMIN", "GMAX", "KTMP", "TMIN", "TOPMN", "TOPMX", "TMAX", "RMIN", "ROPMN", "ROPMX", "RMAX",
            "TEXT", "TEXTR", "PHMIN", "PHOPMN", "PHOPMX", "PHMAX"]
    return {k: (row[k].item() if hasattr(row[k], "item") else str(row[k]).strip()) for k in keys}


MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
          "noviembre", "diciembre"]


def _fmt(v) -> str:
    return (f"{v:g}").replace(".", ",").replace("-", "−") if isinstance(v, (int, float)) else str(v)


def _texture_label(codes: str) -> str:
    return ", ".join(ECOCROP_CODE_LABELS.get(c, c) for c in codes.split()) or "—"


def trapezoid_classes(a, b, c, d, unit: str) -> dict:
    """Tramos legibles de un trapecio ECOCROP: óptimo [b, c], aceptable entre absoluto y óptimo, no apto fuera."""
    u = f" {unit}" if unit else ""
    return {
        "optimal": f"{_fmt(b)}–{_fmt(c)}{u}",
        "acceptable": f"{_fmt(a)}–{_fmt(b)} y {_fmt(c)}–{_fmt(d)}{u}",
        "unsuitable": f"< {_fmt(a)} o > {_fmt(d)}{u}",
    }


TEXTURE_GROUPS = {
    "L": "ligera (arcilla < 18 % y arena > 65 %)",
    "M": "media (ni ligera ni pesada)",
    "H": "pesada (arcilla > 35 %)",
}


def texture_classes(optimal: set[str], absolute: set[str]) -> dict:
    """Tramos de textura por grupo FAO/Unesco (ligera/media/pesada) a partir de TEXT/TEXTR de ECOCROP."""
    def groups(codes: set[str]) -> set[str]:
        return set(TEXTURE_GROUPS) if "W" in codes else {c for c in codes if c in TEXTURE_GROUPS}

    opt = groups(optimal)
    ok = groups(absolute) | opt
    ordered = [c for c in ("L", "M", "H")]
    label = lambda codes: "; ".join(TEXTURE_GROUPS[c] for c in ordered if c in codes) or "ninguna"
    return {"optimal": label(opt), "acceptable": label(ok - opt), "unsuitable": label(set(TEXTURE_GROUPS) - ok)}


USDA_CLASSES = ["sand", "loamy sand", "sandy loam", "loam", "silt loam", "silt", "sandy clay loam", "clay loam",
                "silty clay loam", "sandy clay", "silty clay", "clay"]


def ugr_soil(ctx: Ctx, crop_id: str, soils: dict, terrain: dict | None, static: dict, factors_meta: dict,
             notes: list[str]) -> None:
    """pH, textura, pendiente y carbono orgánico por clases S1–N de las tablas de la UGR (ver ``ugr.py``)."""
    def ref(url: str) -> dict:
        return {"citation": ugr.CITATION, "url": url, "license": ugr.LICENSE}

    def row(parameter: str, label: str | None):
        rows, url = ugr.fetch(ctx, crop_id, parameter)
        cells = ugr.class_cells(rows, label) if rows else None
        if not cells:
            notes.append(f"{parameter}: no se pudo leer la tabla de la UGR")
        return cells, url

    def literal(cells: list[str], unit: str = "") -> str:
        u = f" {unit}" if unit else ""
        return "; ".join(f"{k} {c}{u}" for k, c in zip(ugr.CLASSES, cells) if c and not c.startswith("--"))

    cells, url = row("ph", None)
    if cells:
        _, static["ph"] = ugr.numeric_rating(soils["ph"], cells, decimals=1)
        factors_meta["ph"] = dict(
            label="pH del suelo", variables=["soil-ph"],
            requirement=f"pH superficial: {literal(cells)} (tabla de aptitud de la UGR). {ugr.RATING_NOTE}",
            parameters={"ugrRow": cells, "ratings": ugr.RATINGS,
                        "appliedTo": "pH en agua 0–30 cm de SoilGrids, redondeado a 1 decimal como la tabla"},
            classes=ugr.classes_text(cells), reference=ref(url))
    cells, url = row("textura", "Clase")
    if cells:
        mapping, unmapped = ugr.texture_classes(cells)
        _, static["textura"] = ugr.texture_rating(soils["usda"], mapping)
        others = ", ".join(ugr.USDA_SPANISH[c] for c in USDA_CLASSES if c not in mapping)
        counts = {k: int(v) for k, v in zip(*np.unique(soils["usda"][soils["usda"] != ""], return_counts=True))}
        factors_meta["textura"] = dict(
            label="Textura del suelo", variables=["soil-clay", "soil-sand"],
            requirement=(f"Textura superficial: {literal(cells)} (tabla de aptitud de la UGR; «otras» = {others}). Se "
                         "supone suelo estructurado: SoilGrids no distingue las arcillas «masivas». "
                         + (f"Sin equivalencia USDA: {', '.join(unmapped)}. " if unmapped else "") + ugr.RATING_NOTE),
            parameters={"ugrRow": cells, "usdaClass": mapping, "ratings": ugr.RATINGS, "usdaClassCells": counts,
                        "usdaClassSource": "USDA Soil Survey Manual (Handbook 18, 2017), cap. 3, pp. 122–123",
                        "appliedTo": "clase textural USDA con arcilla y arena 0–30 cm de SoilGrids"},
            classes=ugr.classes_text(cells, rename=lambda c: f"otras ({others})" if c == "otras" else c),
            reference=ref(url))
    cells, url = row("pendiente", "%")
    if cells and terrain is not None and "slope" in terrain:
        slope_pct = np.tan(np.radians(terrain["slope"])) * 100.0
        _, static["pendiente"] = ugr.numeric_rating(slope_pct, cells)
        factors_meta["pendiente"] = dict(
            label="Pendiente", variables=["slope"],
            requirement=f"Pendiente: {literal(cells, '%')} (tabla de aptitud de la UGR). {ugr.RATING_NOTE}",
            parameters={"ugrRow": cells, "unit": "%", "ratings": ugr.RATINGS,
                        "appliedTo": "pendiente media de la celda (Copernicus DEM GLO-30, grados convertidos a %)"},
            classes=ugr.classes_text(cells, "%"), reference=ref(url))
    cells, url = row("carbono", "%")
    if cells and soils.get("soc") is not None:
        _, static["carbono"] = ugr.numeric_rating(soils["soc"] / 10.0, cells, decimals=1)
        factors_meta["carbono"] = dict(
            label="Carbono orgánico", variables=["soil-soc"],
            requirement=(f"Carbono orgánico: {literal(cells, '%')} (tabla de aptitud de la UGR; sin clase N, lo que "
                         f"queda por debajo es la peor clase con valor). {ugr.RATING_NOTE}"),
            parameters={"ugrRow": cells, "unit": "%", "ratings": ugr.RATINGS,
                        "appliedTo": "carbono orgánico 0–30 cm de SoilGrids (g/kg ÷ 10 = %), redondeado a 1 decimal"},
            classes=ugr.classes_text(cells, "%"), reference=ref(url))


def build_crop(ctx: Ctx, crop_id: str, gc, soils: dict, terrain: dict | None = None) -> tuple[CropData | None, list[str]]:
    cfg = CROPS[crop_id]
    p, url, retrieved = fetch_sheet(ctx, crop_id)
    notes: list[str] = []
    rec = recocrop_row(ctx, cfg["rds"])
    diffs = []
    if rec:
        for k in ("GMIN", "GMAX", "KTMP", "TMIN", "TOPMN", "TOPMX", "TMAX", "RMIN", "ROPMN", "ROPMX", "RMAX",
                  "PHMIN", "PHOPMN", "PHOPMX", "PHMAX"):
            if p.get(k) is not None and rec.get(k) is not None and float(rec[k]) != float(p[k]):
                diffs.append(f"{k} FAO={_fmt(p[k])} vs Recocrop={_fmt(float(rec[k]))}")
    if cfg.get("cycle") == "recocrop":
        if not rec or rec.get("GMIN") is None or rec.get("GMAX") is None:
            return None, [f"{crop_id}: no se pudo leer GMIN/GMAX de la tabla de Recocrop"]
        gmin, gmax, cycle_src = float(rec["GMIN"]), float(rec["GMAX"]), "Recocrop"
    else:
        if not (p.get("GMIN") and p.get("GMAX")):
            return None, [f"{crop_id}: la ficha FAO no da el ciclo (GMIN/GMAX)"]
        gmin, gmax, cycle_src = p["GMIN"], p["GMAX"], "FAO"
    n_months = duration_months(gmin, gmax)
    full_year = n_months == 12
    # Referencia (dismo/Recocrop): KTMP = «early growth» de FAO, evaluado en el periodo de crecimiento.
    # Si el periodo es el año entero incluye el reposo y se usa «during rest» (convención del proyecto).
    ktmp_key = "KTMP_REST" if full_year else "KTMP"
    ktmp = p.get(ktmp_key)
    ktmp_note = ("«Killing temp. during rest» de la ficha FAO ({v} °C), porque el periodo de 12 meses incluye el "
                 "reposo (convención del proyecto; dismo/Recocrop usan «early growth» porque evalúan solo la estación "
                 "de crecimiento)." if full_year else
                 "«Killing temp. early growth» de la ficha FAO ({v} °C), el valor que usan dismo y Recocrop (su KTMP) "
                 "para el periodo de crecimiento.")

    static: dict[str, np.ndarray] = {}
    factors_meta: dict[str, dict] = {}
    # Suelo y relieve: tablas de aptitud específica de la UGR; ECOCROP solo como respaldo si no se pueden leer.
    ugr_soil(ctx, crop_id, soils, terrain, static, factors_meta, notes)
    # Precipitación anual (FAO: «Rainfall (annual)»); con GAEZ, el agua ya entra en el factor de clima.
    if cfg.get("gaez"):
        pass
    elif None not in (p.get("RMIN"), p.get("ROPMN"), p.get("ROPMX"), p.get("RMAX")):
        annual = np.sum(gc.prec, axis=0)
        static["precipitacion"] = trapezoid(annual, p["RMIN"], p["ROPMN"], p["ROPMX"], p["RMAX"])
        factors_meta["precipitacion"] = dict(
            label="Precipitación anual", variables=["climate-precip-annual"],
            requirement=(f"Lluvia anual óptima {_fmt(p['ROPMN'])}–{_fmt(p['ROPMX'])} mm; límites "
                         f"{_fmt(p['RMIN'])}–{_fmt(p['RMAX'])} mm (ECOCROP ROPMN–ROPMX, RMIN–RMAX, «Rainfall (annual)»)."),
            parameters={k: p[k] for k in ("RMIN", "ROPMN", "ROPMX", "RMAX")} | {
                "appliedTo": "precipitación media anual 1991–2020 de la celda (mm)"},
            classes=trapezoid_classes(p["RMIN"], p["ROPMN"], p["ROPMX"], p["RMAX"], "mm"))
    else:
        notes.append("precipitación: falta algún umbral en la ficha FAO; factor omitido")
    if "ph" in static:
        pass
    elif None not in (p.get("PHMIN"), p.get("PHOPMN"), p.get("PHOPMX"), p.get("PHMAX")):
        static["ph"] = trapezoid(soils["ph"], p["PHMIN"], p["PHOPMN"], p["PHOPMX"], p["PHMAX"])
        factors_meta["ph"] = dict(
            label="pH del suelo", variables=["soil-ph"],
            requirement=(f"pH óptimo {_fmt(p['PHOPMN'])}–{_fmt(p['PHOPMX'])}; tolera {_fmt(p['PHMIN'])}–"
                         f"{_fmt(p['PHMAX'])} (ECOCROP PHOPMN–PHOPMX, PHMIN–PHMAX)."),
            parameters={k: p[k] for k in ("PHMIN", "PHOPMN", "PHOPMX", "PHMAX")} | {
                "appliedTo": "pH en agua 0–30 cm de SoilGrids"},
            classes=trapezoid_classes(p["PHMIN"], p["PHOPMN"], p["PHOPMX"], p["PHMAX"], ""))
    else:
        notes.append("pH: falta algún umbral en la ficha FAO; factor omitido")
    if "textura" in static:
        pass
    elif p.get("TEXT") and p.get("TEXTR"):
        opt = set(p["TEXT"].split())
        ab = set(p["TEXTR"].split())
        static["textura"] = texture_score(soils["group"], opt, ab)
        usda_counts = {k: int(v) for k, v in zip(*np.unique(soils["usda"][soils["usda"] != ""], return_counts=True))}
        group_counts = {k: int(v) for k, v in zip(*np.unique(soils["group"][soils["group"] != ""], return_counts=True))}
        factors_meta["textura"] = dict(
            label="Textura del suelo", variables=["soil-clay", "soil-sand"],
            requirement=(f"Óptima: {_texture_label(p['TEXT'])}; admisible: {_texture_label(p['TEXTR'])} "
                         f"(ECOCROP TEXT/TEXTR). Puntuación 1 si óptima, {_fmt(ABSOLUTE_ONLY_SCORE)} si solo admisible, 0 si no."),
            parameters={"TEXT": p["TEXT"], "TEXTR": p["TEXTR"], "faoSheetText": p["_raw"].get("Soil texture"),
                        "absoluteOnlyScore": ABSOLUTE_ONLY_SCORE,
                        "groupMapping": "ligera=L↔gruesa, media=M↔media, pesada=H↔fina (clases FAO/Unesco: gruesa <18 % "
                                        "arcilla y >65 % arena; fina >35 % arcilla; media el resto)",
                        "usdaClassSource": "USDA Soil Survey Manual (Handbook 18, 2017), cap. 3, pp. 122–123",
                        "faoGroupSource": "FAO/IIASA/ISRIC/ISSCAS/JRC (2012) Harmonized World Soil Database v1.2, "
                                          "documentación, p. 12 (clases texturales del Mapa de Suelos FAO/Unesco)",
                        "usdaClassCells": usda_counts, "faoGroupCells": group_counts,
                        "appliedTo": "arcilla y arena 0–30 cm de SoilGrids (limo = 100 − arcilla − arena)"},
            classes=texture_classes(opt, ab))
    else:
        notes.append("textura: la ficha FAO no da TEXT/TEXTR; factor omitido")
    # Altitud: FAO solo da el máximo absoluto (ALTMAX); por encima, no apto. Sin óptimo publicado.
    if p.get("ALTMAX") is not None and terrain is not None and "elevation" in terrain:
        alt = p["ALTMAX"]
        static["altitud"] = trapezoid(terrain["elevation"], -INF, -INF, alt, alt)
        factors_meta["altitud"] = dict(
            label="Altitud", variables=["elevation"],
            requirement=(f"Altitud máxima absoluta {_fmt(alt)} m (ECOCROP «Altitude», máximo absoluto); la ficha no da "
                         "óptimo. Puntuación 1 hasta ese máximo y 0 por encima."),
            parameters={"ALTMAX": alt, "faoSheetAltitude": p["_raw"].get("Altitude"),
                        "appliedTo": "elevación media de la celda (Copernicus DEM GLO-30, m)"},
            classes={"optimal": f"≤ {_fmt(alt)} m", "acceptable": "— (la ficha no da tramo intermedio)",
                     "unsuitable": f"> {_fmt(alt)} m"})
    elif p.get("ALTMAX") is None:
        notes.append("altitud: la ficha FAO no da máximo; factor omitido")

    if cfg.get("gaez"):
        clim, gaez_url = gaez.climate_factor(ctx, cfg["gaez"])
        static = {"clima": clim, **static}
        factors_meta["clima"] = dict(
            label="Clima (FAO GAEZ v4)",
            variables=["climate-tmean-annual", "climate-tmin-coldest", "climate-tabsmin", "climate-precip-annual"],
            requirement=("Factor de restricción climática total de FAO GAEZ v4 para el cultivo en secano con insumos "
                         "bajos (clima 1981–2010): fracción del rendimiento potencial que permite el clima por "
                         "temperatura, agua y riesgos agroclimáticos (1 = sin restricción)."),
            parameters={"layer": f"{cfg['gaez']}200b_fc0", "theme": "GAEZ v4 tema 3, agroclimático",
                        "waterSupply": "secano (agua útil de referencia 200 mm/m)", "inputLevel": "bajo",
                        "climate": "CRU TS 3.2, 1981–2010", "resolution": "5′ (~9 km), remuestreo bilineal a 250 m",
                        "appliedTo": "factor 0–1 (valor GAEZ ÷ 10 000)"},
            classes={"optimal": "≥ 0,85 (sin restricción o ligera)", "acceptable": "0,40–0,85",
                     "unsuitable": "< 0,40"},
            reference={"citation": gaez.CITATION, "url": gaez_url, "license": gaez.LICENSE})
        stack = np.stack(list(static.values()))
        complete = np.isfinite(stack).all(axis=0)
        suitability = np.full(stack.shape[1:], np.nan)
        suitability[complete] = np.min(stack[:, complete], axis=0)
        result = {"suitability": suitability, "factors": static, "start": None}
        ktmp, ktmp_note = None, ""
    else:
        tparams = (p.get("TMIN"), p.get("TOPMN"), p.get("TOPMX"), p.get("TMAX"))
        if None in tparams:
            return None, notes + ["temperatura: falta algún umbral en la ficha FAO; cultivo omitido"]
        model_p = {"TMIN": p["TMIN"], "TOPMN": p["TOPMN"], "TOPMX": p["TOPMX"], "TMAX": p["TMAX"], "KTMP": ktmp}
        if ktmp is None:
            notes.append(f"heladas: la ficha FAO no da {ktmp_key}; factor omitido")
        result = ecocrop(gc.tmean, gc.exmin, gc.prec, model_p, n_months, static_scores=static)
        ok = np.isfinite(result["suitability"])
        degenerate = ok.any() and float((result["suitability"][ok] == 0).mean()) >= 0.99
        if degenerate and cfg.get("ktmp_fallback_to_rest") and not full_year and p.get("KTMP_REST") is not None:
            zero_share = float((result["suitability"][ok] == 0).mean())
            ktmp_key, ktmp = "KTMP_REST", p["KTMP_REST"]
            model_p["KTMP"] = ktmp
            result = ecocrop(gc.tmean, gc.exmin, gc.prec, model_p, n_months, static_scores=static)
            ktmp_note = (f"con «early growth» ({_fmt(p['KTMP'])} °C, la de la referencia) la aptitud era 0 en el "
                         f"{100 * zero_share:.1f} % de las celdas, así que se usa «during rest» ({{v}} °C) como respaldo "
                         "acordado con el owner.")
            notes.append("temperatura letal: respaldo a «during rest» por mapa degenerado con «early growth»")
        months = "todo el año" if full_year else f"{n_months} meses consecutivos (se elige el mejor mes de inicio)"
        factors_meta["temperatura"] = dict(
            label="Temperatura media mensual", variables=["climate-tmean-annual", "elevation"],
            requirement=(f"Media mensual óptima {_fmt(p['TOPMN'])}–{_fmt(p['TOPMX'])} °C; límites {_fmt(p['TMIN'])}–"
                         f"{_fmt(p['TMAX'])} °C (ECOCROP TOPMN–TOPMX, TMIN–TMAX), en {months}."),
            parameters={k: p[k] for k in ("TMIN", "TOPMN", "TOPMX", "TMAX")} | {
                "GMIN": gmin, "GMAX": gmax, "cycleSource": cycle_src, "faoCropCycle": [p.get("GMIN"), p.get("GMAX")],
                "growingPeriodMonths": n_months,
                "appliedTo": "temperatura media de cada mes 1991–2020 (climatología mensual interpolada y corregida por "
                             "altitud; se publica su media anual en climate-tmean-annual)"},
            classes={k: v + " (media de cada mes del periodo)" for k, v in
                     trapezoid_classes(p["TMIN"], p["TOPMN"], p["TOPMX"], p["TMAX"], "°C").items()})
        if ktmp is not None:
            factors_meta["heladas"] = dict(
                label="Temperatura letal (heladas)", variables=["climate-tabsmin", "climate-tmin-coldest", "elevation"],
                requirement=(f"Mínima extrema mensual por encima de {_fmt(ktmp)} °C (ECOCROP «Killing temp. "
                             f"{'during rest' if ktmp_key == 'KTMP_REST' else 'early growth'}»), con rampa de {_fmt(ktmp - 1)} a "
                             f"{_fmt(ktmp + 1)} °C como Recocrop, en {months}."),
                parameters={"KTMP_early_growth": p.get("KTMP"), "KTMP_during_rest": p.get("KTMP_REST"),
                            "appliedKTMP": ktmp, "appliedKTMPField": ktmp_key, "ramp": [ktmp - 1, ktmp + 1],
                            "appliedTo": "media 1991–2020 de la mínima absoluta de cada mes (interpolada y corregida "
                                         "por altitud)"},
                classes={"optimal": f"mínima extrema ≥ {_fmt(ktmp + 1)} °C",
                         "acceptable": f"mínima extrema entre {_fmt(ktmp - 1)} y {_fmt(ktmp + 1)} °C",
                         "unsuitable": f"mínima extrema < {_fmt(ktmp - 1)} °C"})
    order = ["clima", "temperatura", "heladas", "precipitacion", "ph", "textura", "altitud", "pendiente", "carbono"]
    factors = [CropFactorData(id=fid, values=result["factors"][fid], **factors_meta[fid])
               for fid in order if fid in result["factors"] and fid in factors_meta]
    valid = np.isfinite(result["suitability"])
    start_hist = {}
    if not full_year and valid.any() and result["start"] is not None:
        vals, cnt = np.unique(result["start"][valid], return_counts=True)
        start_hist = {MONTHS[int(v)]: int(c) for v, c in zip(vals, cnt)}
    soil_note = (" pH, textura, pendiente y carbono orgánico: clases S1–N de las tablas de aptitud de la Universidad de "
                 f"Granada (basadas en Sys et al., 1993), puntuadas por clase: {ugr.RATING_NOTE}")
    if cfg.get("gaez"):
        assumptions = ("Secano con manejo tradicional (insumos bajos); clima 1981–2010 según FAO GAEZ v4; suelo "
                       "SoilGrids 0–30 cm; relieve Copernicus DEM.")
        method = (
            "Aptitud = MÍNIMO de los factores (ley del mínimo); 0 = no apto, 1 = óptimo; clases S1 ≥ 0,85, S2 0,60–0,85, "
            "S3 0,40–0,60, N < 0,40 (tramos de LUSET). Clima: factor de restricción climática total de FAO GAEZ v4 para "
            "el cultivo en secano con insumos bajos (temperatura, agua y riesgos agroclimáticos; ~9 km). Sustituye a la "
            "temperatura, las heladas y la lluvia de ECOCROP, cuyos óptimos genéricos (p. ej. 20–34 °C de media mensual "
            "para el olivo) no reflejan el clima mediterráneo."
            + soil_note
            + (f" Altitud: 1 hasta el máximo absoluto de la ficha ECOCROP ({_fmt(p['ALTMAX'])} m) y 0 por encima."
               if "altitud" in factors_meta else "")
            + " No se evalúan profundidad, drenaje, carbonatos, salinidad ni variedades; el suelo es modelado (SoilGrids).")
    else:
        assumptions = (f"Secano; clima medio 1991–2020; suelo SoilGrids 0–30 cm; ciclo de {n_months} meses "
                       f"({cycle_src} {_fmt(gmin)}–{_fmt(gmax)} días).")
        method = ("Modelo Ecocrop (Hijmans et al., 2001; dismo::ecocrop y Recocrop): cada factor se puntúa 0–1 con un "
            "trapecio entre los límites absolutos y óptimos de ECOCROP; la aptitud es el MÍNIMO de los factores (ley "
            "del mínimo); 0 = no apto, 1 = óptimo. Temperatura: trapecio sobre la media de cada mes del periodo, se "
            "toma el peor mes. Heladas: regla de Recocrop (rampa KTMP−1…KTMP+1 sobre la mínima extrema de cada mes). "
            + ("Periodo de 12 meses. " if full_year else
               f"Periodo de {n_months} meses = round((GMIN+GMAX)/60) como dismo; se prueban los 12 meses de inicio y se "
               "conserva el mejor (los rásteres de factor muestran ese mismo inicio). ")
            + "Precipitación: trapecio sobre la lluvia anual (la ficha FAO da los umbrales como «Rainfall (annual)»; con "
            "la lluvia sumada solo en el periodo, como en dismo, la aptitud de almendro y trigo era 0 en los 10 puntos "
            "de clima porque el mejor periodo térmico coincide con la estación seca). "
            + cfg["method_extra"].format(
                FAO_GMIN=_fmt(p.get("GMIN")), FAO_GMAX=_fmt(p.get("GMAX")),
                REC_GMIN=_fmt(float(rec["GMIN"])) if rec else "?", REC_GMAX=_fmt(float(rec["GMAX"])) if rec else "?",
                N=n_months, TOPMN=_fmt(p["TOPMN"]), TOPMX=_fmt(p["TOPMX"]), TMIN=_fmt(p["TMIN"]),
                KTMP_NOTE=ktmp_note.format(v=_fmt(ktmp)) if ktmp is not None else "no disponible en la ficha FAO.")
            + (f" Altitud: 1 hasta el máximo absoluto de la ficha FAO ({_fmt(p['ALTMAX'])} m) y 0 por encima."
               if "altitud" in factors_meta else "")
            + soil_note
            + " No se evalúan profundidad, drenaje, carbonatos, salinidad ni variedades; el suelo es modelado "
            "(SoilGrids) y el clima es una media, no un año concreto.")
    meta = {
        "id": crop_id, "name": cfg["name"], "scientificName": cfg["scientific"],
        "assumptions": assumptions,
        "method": method,
        "source": {
            "provider": ("FAO GAEZ v4 (clima), Universidad de Granada (suelo y relieve) y FAO ECOCROP (altitud); modelo y "
                         "cálculo OliveTwin" if cfg.get("gaez") else
                         "FAO ECOCROP (clima y altitud) y Universidad de Granada (suelo y relieve); modelo y cálculo "
                         "OliveTwin"),
            "product": f"Ficha ECOCROP «{p['_raw'].get('name')}» (id {cfg['fao_id']}) — requisitos de cultivo",
            "processingVersion": "Ecocrop según Hijmans et al. (2001), dismo 1.3-15 y Recocrop 0.4-2; pipeline OliveTwin",
            "license": LICENSE,
            "referenceUrl": url,
            "note": (f"Ficha descargada el {retrieved}. "
                     + (f"Diferencias con la tabla de Recocrop: {'; '.join(diffs)}. " if diffs else
                        ("Valores idénticos a la tabla de Recocrop. " if rec else ""))
                     + ("Mes de inicio elegido (nº de celdas): "
                        + ", ".join(f"{k} {v}" for k, v in start_hist.items()) + ". " if start_hist else "")
                     + ("; ".join(notes) + "." if notes else "")).strip(),
        },
    }
    return CropData(meta=meta, suitability=result["suitability"], factors=factors), notes


def soil_inputs(ctx: Ctx) -> dict:
    res = soil.run(ctx)
    vals = {v.meta["id"]: v.steps[0].values for v in res.variables}
    clay, sand = vals["soil-clay"], vals["soil-sand"]
    return {"ph": vals["soil-ph"], "clay": clay, "sand": sand, "soc": vals.get("soil-soc"),
            "usda": usda_texture(clay, sand), "group": fao_texture_group(clay, sand)}


def run(ctx: Ctx) -> SourceResult:
    res = SourceResult(source="crops", owned_ids=[], owned_crops=list(CROPS))
    gc = climatology.compute(ctx)
    soils = soil_inputs(ctx)
    terrain = {v.meta["id"]: v.steps[0].values for v in dem.run(ctx).variables}
    for cid in CROPS:
        crop, notes = build_crop(ctx, cid, gc, soils, terrain)
        if crop is None:
            res.unavailable.append({"id": f"crop-{cid}", "title": f"Aptitud {CROPS[cid]['name']}",
                                    "reason": "; ".join(notes)})
            continue
        s = crop.suitability
        lim = limiting_shares(crop)
        log(f"[{ctx.zone.id}] {cid}: aptitud media {np.nanmean(s):.3f}, p10 {np.nanpercentile(s, 10):.3f}, "
            f"p90 {np.nanpercentile(s, 90):.3f}, válido {np.isfinite(s).mean():.3f}; limitante {lim}")
        res.crops.append(crop)
    return res


def limiting_shares(crop: CropData) -> dict:
    """Fracción de celdas válidas en que cada factor es el (primer) mínimo."""
    names = [f.id for f in crop.factors]
    stack = np.stack([f.values for f in crop.factors])
    ok = np.isfinite(crop.suitability) & np.isfinite(stack).all(axis=0)
    if not ok.any():
        return {}
    idx = np.argmin(np.where(np.isfinite(stack), stack, np.inf), axis=0)[ok]
    return {names[i]: round(float((idx == i).mean()), 3) for i in range(len(names))}


__all__ = ["run", "parse_datasheet", "limiting_shares", "killing_score"]
