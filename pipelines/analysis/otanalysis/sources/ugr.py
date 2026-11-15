"""Tablas de aptitud específica de la Universidad de Granada («CambioUso», Dorronsoro et al.).

Cada página da, para un cultivo y un parámetro, las clases S1, S2, S3 y N (esquema de la FAO, 1976, y Sys et
al., 1993). Aquí se descargan, se leen tal cual y se aplican por clases. La puntuación de cada clase es una
**convención del proyecto**: S1 = 1 (sin limitación) y el punto medio de los tramos de clase de LUSET (Yen et
al., 2006; reproducidos en Selmy et al., 2024, Agronomy 14(11):2601, tabla 3, CC BY 4.0) para el resto:
S2 = 0,725 (60–85), S3 = 0,50 (40–60) y N = 0,20 (0–40).
"""
from __future__ import annotations

import html as htmlmod
import math
import re
from typing import Callable

import numpy as np
import requests

from ..context import Ctx

BASE = "https://edafologia.ugr.es/programas_suelos/practgest/olivar/suelos/soil32/aptitudes/{crop}/{page}.htm"
PAGES = {"pendiente": "pend1", "carbono": "mateorg7", "textura": "text8", "ph": "ph10"}
CLASSES = ("S1", "S2", "S3", "N")
RATINGS = {"S1": 1.0, "S2": 0.725, "S3": 0.50, "N": 0.20}
CITATION = (
    "Dorronsoro-Díaz, C., Fernández, J., Dorronsoro-Díaz, B., Díez, M., Sierra, M. y Dorronsoro-Fernández, C. "
    "CambioUso: evaluación de aptitudes específicas de los suelos según el esquema de la FAO en zonas olivareras. "
    "Dpto. de Edafología y Química Agrícola, Universidad de Granada (IV Congreso Ibérico de la Ciencia del Suelo, "
    "2010). Tablas basadas en Sys, Van Ranst, Debaveye y Beernaert (1993), Land Evaluation Part III: Crop "
    "requirements, y FAO (1976), A framework for land evaluation.")
LICENSE = "Recurso docente público de la Universidad de Granada; se cita con atribución completa."
RATING_NOTE = (
    "Puntuación por clase (convención del proyecto): S1 = 1; S2 = 0,725, S3 = 0,50 y N = 0,20, puntos medios de los "
    "tramos de clase de LUSET (Yen et al., 2006; Selmy et al., 2024, Agronomy 14(11):2601, tabla 3, CC BY 4.0).")

# Nombres de clase textural en español (USDA) → clase de `usda_texture`.
SPANISH_TEXTURE = {
    "arena": "sand", "arena franca": "loamy sand", "franco arenosa": "sandy loam", "franca": "loam",
    "franco limosa": "silt loam", "limosa": "silt", "franco arcillo arenosa": "sandy clay loam",
    "franco arcillosa": "clay loam", "franco arcillo limosa": "silty clay loam", "arcillo arenosa": "sandy clay",
    "arcillo limosa": "silty clay", "arcillosa": "clay",
}
USDA_SPANISH = {usda: es for es, usda in SPANISH_TEXTURE.items()}


def fetch(ctx: Ctx, crop: str, parameter: str) -> tuple[list[list[str]] | None, str]:
    """Filas de la tabla (celdas como texto) y la URL; None si no se pudo descargar."""
    page = PAGES[parameter]
    url = BASE.format(crop=crop, page=page)
    path = ctx.cache_dir("ugr") / f"{crop}_{page}.htm"
    if not path.exists():
        try:
            r = requests.get(url, timeout=60)
            r.raise_for_status()
        except requests.RequestException:
            return None, url
        path.write_bytes(r.content)
    return table_rows(path.read_bytes().decode("latin-1", errors="ignore")), url


def table_rows(html: str) -> list[list[str]] | None:
    i = html.find("<table")
    if i < 0:
        return None
    rows = re.findall(r"<tr>(.*?)</tr>", html[i:html.find("</table>", i)], flags=re.S | re.I)
    out = []
    for r in rows:
        cells = [re.sub(r"\s+", " ", htmlmod.unescape(re.sub(r"<[^>]+>", "", c))).strip()
                 for c in re.findall(r"<td[^>]*>(.*?)</td>", r, flags=re.S | re.I)]
        if any(cells):
            out.append(cells)
    return out


def class_cells(rows: list[list[str]], label: str | None) -> list[str] | None:
    """Las cuatro celdas S1…N de la fila cuyo primer elemento es `label` (o de la fila de valores si es None)."""
    for cells in rows:
        if label is None:
            if len(cells) == 4 and not cells[0].startswith("S1"):
                return cells
        elif cells and cells[0] == label and len(cells) >= 5:
            return cells[1:5]
    return None


def _num(text: str) -> float:
    return float(text.replace(",", ".").replace("−", "-"))


def condition(cell: str) -> Callable[[np.ndarray], np.ndarray] | None:
    """Convierte una celda («≤ 8», «≥ 1,0», «6,0-8,1», «5,6-5,9 y 8,2-8,3», «≤5,1 y ≥9,0») en un predicado."""
    cell = cell.strip()
    if not cell or cell.startswith("--") or cell == "—":
        return None
    parts = [p.strip() for p in re.split(r"\s+y\s+", cell) if p.strip()]
    preds = []
    for part in parts:
        m = re.fullmatch(r"([≤≥<>])\s*(-?\d+(?:[.,]\d+)?)", part)
        if m:
            op, v = m.group(1), _num(m.group(2))
            preds.append({"≤": lambda x, v=v: x <= v, "≥": lambda x, v=v: x >= v,
                          "<": lambda x, v=v: x < v, ">": lambda x, v=v: x > v}[op])
            continue
        m = re.fullmatch(r"(-?\d+(?:[.,]\d+)?)\s*-\s*(-?\d+(?:[.,]\d+)?)", part)
        if m:
            lo, hi = _num(m.group(1)), _num(m.group(2))
            preds.append(lambda x, lo=lo, hi=hi: (x >= lo) & (x <= hi))
            continue
        raise ValueError(f"Celda UGR no reconocida: {cell!r}")

    def pred(x: np.ndarray) -> np.ndarray:
        out = np.zeros(np.shape(x), dtype=bool)
        for p in preds:
            out |= p(x)
        return out

    return pred


def numeric_rating(values: np.ndarray, cells: list[str], decimals: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Clase (S1…N, por orden: la primera que se cumple) y puntuación de cada celda. `decimals` redondea el valor a la
    precisión de la tabla para que no caiga entre dos clases (p. ej. pH 8,15 entre 8,1 y 8,2)."""
    x = np.asarray(values, dtype=float)
    xr = np.round(x, decimals) if decimals is not None else x
    cls = np.full(x.shape, "", dtype=object)
    for name, cell in zip(CLASSES, cells):
        pred = condition(cell)
        if pred is None:
            continue
        with np.errstate(invalid="ignore"):
            hit = pred(xr) & (cls == "") & np.isfinite(x)
        cls[hit] = name
    # Fuera de todas las clases declaradas: la peor clase con contenido (p. ej. carbono «< 0,5» en S3 y N «--»).
    worst = next(name for name, cell in reversed(list(zip(CLASSES, cells))) if condition(cell) is not None)
    cls[(cls == "") & np.isfinite(x)] = worst
    rating = np.full(x.shape, np.nan)
    for name in CLASSES:
        rating[cls == name] = RATINGS[name]
    return cls, rating


def texture_classes(cells: list[str]) -> tuple[dict[str, str], list[str]]:
    """Clase S1…N de cada textura USDA según la fila «Clase» de la UGR. «otras» = el resto (S1). Se supone suelo
    estructurado (SoilGrids no distingue estructura): las texturas listadas como «masivas» no se aplican."""
    mapping: dict[str, str] = {}
    unmapped: list[str] = []
    for name, cell in zip(CLASSES, cells):
        for segment in cell.split(";"):
            segment = segment.strip()
            if not segment or segment.startswith("--") or segment == "otras":
                continue
            if "masiv" in segment:
                continue
            segment = re.sub(r"\s+(estructuradas?)\b", "", segment)
            for item in re.split(r",|\s+y\s+", segment):
                item = item.strip()
                if not item:
                    continue
                usda = SPANISH_TEXTURE.get(item)
                if usda is None:
                    unmapped.append(item)
                elif usda not in mapping:
                    mapping[usda] = name
    return mapping, unmapped


def texture_rating(usda: np.ndarray, mapping: dict[str, str]) -> tuple[np.ndarray, np.ndarray]:
    cls = np.full(usda.shape, "", dtype=object)
    has = usda != ""
    cls[has] = "S1"
    for texture, name in mapping.items():
        cls[usda == texture] = name
    rating = np.full(usda.shape, np.nan)
    for name in CLASSES:
        rating[cls == name] = RATINGS[name]
    return cls, rating


def classes_text(cells: list[str], unit: str = "", rename: Callable[[str], str] | None = None) -> dict:
    """Tramos legibles: óptimo = S1; aceptable = S2 y S3; no apto = N."""
    f = rename or (lambda text: text)
    u = f" {unit}" if unit else ""
    s1, s2, s3, n = (c.strip() for c in cells)
    blank = lambda c: not c or c.startswith("--")
    return {
        "optimal": f(s1) + u,
        "acceptable": "; ".join(f"{k}: {f(c)}{u}" for k, c in (("S2", s2), ("S3", s3)) if not blank(c)) or "—",
        "unsuitable": "— (la tabla no fija clase N)" if blank(n) else f(n) + u,
    }


def slope_degrees(pct: float) -> float:
    return math.degrees(math.atan(pct / 100.0))
