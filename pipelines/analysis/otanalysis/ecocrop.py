"""Modelo Ecocrop (Hijmans et al., 2001) y utilidades de suelo para la aptitud por cultivo.

Reglas y su procedencia (ver README):
- Puntuación trapezoidal ``approx4`` de Recocrop (src/ecocrop.cpp): 0 fuera de [a, d], 1 en [b, c],
  lineal en los tramos. Igual que ``.getY`` de dismo::ecocrop.
- Temperatura: trapecio (TMIN, TOPMN, TOPMX, TMAX) sobre la temperatura media de cada mes del
  periodo de crecimiento (dismo::ecocrop y Recocrop).
- Temperatura letal: trapecio (KTMP − 1, KTMP + 1, ∞, ∞) sobre la temperatura mínima extrema de cada
  mes (Recocrop ``ecocropPars``/``?ecocropPars``: «ktmp requires extreme minimum temperature data»).
- Precipitación: trapecio (RMIN, ROPMN, ROPMX, RMAX). ``ecocrop()`` admite la variante de dismo (lluvia
  total del periodo, si ``p`` trae RMIN…); el pipeline la aplica a la lluvia ANUAL como factor estático,
  porque la ficha FAO da esos umbrales como «Rainfall (annual)» (ver README).
- Se toma el mínimo de los factores (ley del mínimo), el mínimo de cada factor a lo largo de los meses
  del periodo y el mejor mes de inicio (dismo: ``maxper``/``maxsuit``).
"""
from __future__ import annotations

import numpy as np

INF = float("inf")


def trapezoid(x, a: float, b: float, c: float, d: float) -> np.ndarray:
    """Recocrop ``approx4``: 0 si x < a o x > d; 1 si b ≤ x ≤ c; rampas lineales en medio. NaN se conserva."""
    x = np.asarray(x, dtype=float)
    out = np.zeros_like(x)
    out[(x >= b) & (x <= c)] = 1.0
    up = (x >= a) & (x < b)
    if b > a:
        out[up] = (x[up] - a) / (b - a)
    down = (x > c) & (x <= d)
    if np.isfinite(d) and d > c:
        out[down] = (d - x[down]) / (d - c)
    out[np.isnan(x)] = np.nan
    return out


def killing_score(exmin, ktmp: float) -> np.ndarray:
    """Recocrop: trapecio (KTMP−1, KTMP+1, ∞, ∞) sobre la mínima extrema."""
    return trapezoid(exmin, ktmp - 1.0, ktmp + 1.0, INF, INF)


def duration_months(gmin: float, gmax: float) -> int:
    """dismo::ecocrop: ``round((GMIN + GMAX) / 60)`` meses (redondeo de R: mitad al par), entre 1 y 12."""
    return int(min(12, max(1, round((gmin + gmax) / 60.0))))


def window(months_values: np.ndarray, start: int, n: int) -> np.ndarray:
    """Meses ``start .. start+n-1`` (circular) de un array con eje 0 = 12 meses."""
    idx = [(start + k) % 12 for k in range(n)]
    return months_values[idx]


def ecocrop(tmean: np.ndarray, exmin: np.ndarray, prec: np.ndarray, p: dict, n_months: int,
            static_scores: dict[str, np.ndarray] | None = None) -> dict:
    """Aptitud Ecocrop por celda.

    tmean, exmin, prec: arrays (12, ...) mensuales. ``p``: TMIN, TOPMN, TOPMX, TMAX, KTMP, RMIN, ROPMN,
    ROPMX, RMAX. ``static_scores``: factores de suelo ya puntuados (0–1).
    Devuelve dict con ``suitability``, ``start`` (mes 0–11 elegido) y una puntuación por factor
    (``temperatura``, ``heladas``, ``precipitacion`` y los estáticos) evaluada en ese mismo inicio.
    Con ``n_months == 12`` solo hay un periodo posible (todo el año).
    """
    static_scores = static_scores or {}
    t_month = trapezoid(tmean, p["TMIN"], p["TOPMN"], p["TOPMX"], p["TMAX"])
    k_month = killing_score(exmin, p["KTMP"]) if p.get("KTMP") is not None else None
    starts = [0] if n_months == 12 else list(range(12))
    shape = tmean.shape[1:]
    best = np.full(shape, -1.0)
    best_start = np.zeros(shape, dtype=int)
    best_tie = np.full(shape, -1.0)
    factors_at = {}
    per_start = []
    for s in starts:
        f = {"temperatura": np.min(window(t_month, s, n_months), axis=0)}
        if k_month is not None:
            f["heladas"] = np.min(window(k_month, s, n_months), axis=0)
        if p.get("RMIN") is not None:
            f["precipitacion"] = trapezoid(np.sum(window(prec, s, n_months), axis=0),
                                           p["RMIN"], p["ROPMN"], p["ROPMX"], p["RMAX"])
        f.update(static_scores)
        stack = np.stack(list(f.values()))
        suit = np.min(stack, axis=0)
        tie = np.mean(stack, axis=0)
        per_start.append(f)
        # Mejor inicio: mayor aptitud; empate → mayor media de factores; luego el mes más temprano.
        better = (suit > best) | ((suit == best) & (tie > best_tie))
        better &= np.isfinite(suit)
        best = np.where(better, suit, best)
        best_tie = np.where(better, tie, best_tie)
        best_start = np.where(better, s, best_start)
    for name in per_start[0]:
        stack = np.stack([pf[name] * np.ones(shape) for pf in per_start])
        factors_at[name] = np.take_along_axis(stack, np.searchsorted(starts, best_start)[None], axis=0)[0]
    suit = np.where(best < 0, np.nan, best)
    for name in factors_at:
        factors_at[name] = np.where(np.isnan(suit), np.nan, factors_at[name])
    return {"suitability": suit, "start": np.where(np.isnan(suit), -1, best_start), "factors": factors_at}


# --- Suelo -------------------------------------------------------------------------------------------

USDA_CLASSES = ["sand", "loamy sand", "sandy loam", "loam", "silt loam", "silt", "sandy clay loam",
                "clay loam", "silty clay loam", "sandy clay", "silty clay", "clay"]


def usda_texture(clay, sand) -> np.ndarray:
    """Clase textural USDA (Soil Survey Manual, USDA Handbook 18, 2017, cap. 3, pp. 122–123).

    Devuelve un array de cadenas ('' si falta dato). silt = 100 − clay − sand.
    """
    clay = np.asarray(clay, dtype=float)
    sand = np.asarray(sand, dtype=float)
    silt = 100.0 - clay - sand
    out = np.full(clay.shape, "", dtype=object)
    ok = np.isfinite(clay) & np.isfinite(sand)
    rules = [
        ("sand", (sand > 85) & (silt + 1.5 * clay < 15)),
        ("loamy sand", (sand >= 70) & (sand <= 90) & (silt + 1.5 * clay >= 15) & (silt + 2 * clay < 30)),
        ("sandy loam", ((clay >= 7) & (clay < 20) & (sand > 52) & (silt + 2 * clay >= 30))
         | ((clay < 7) & (silt < 50) & (silt + 2 * clay >= 30))),
        ("loam", (clay >= 7) & (clay < 27) & (silt >= 28) & (silt < 50) & (sand <= 52)),
        ("silt loam", ((silt >= 50) & (clay >= 12) & (clay < 27)) | ((silt >= 50) & (silt < 80) & (clay < 12))),
        ("silt", (silt >= 80) & (clay < 12)),
        ("sandy clay loam", (clay >= 20) & (clay < 35) & (silt < 28) & (sand > 45)),
        ("clay loam", (clay >= 27) & (clay < 40) & (sand > 20) & (sand <= 45)),
        ("silty clay loam", (clay >= 27) & (clay < 40) & (sand <= 20)),
        ("sandy clay", (clay >= 35) & (sand > 45)),
        ("silty clay", (clay >= 40) & (silt >= 40)),
        ("clay", (clay >= 40) & (sand <= 45) & (silt < 40)),
    ]
    for name, cond in rules:
        sel = ok & cond & (out == "")
        out[sel] = name
    return out


def fao_texture_group(clay, sand) -> np.ndarray:
    """Clase textural simplificada FAO/Unesco (Soil Map of the World), según la documentación de HWSD v1.2
    (FAO/IIASA/ISRIC/ISSCAS/JRC, 2012, p. 12): gruesa = < 18 % arcilla y > 65 % arena; fina = > 35 % arcilla;
    media = el resto. Devuelve 'coarse' | 'medium' | 'fine' | ''."""
    clay = np.asarray(clay, dtype=float)
    sand = np.asarray(sand, dtype=float)
    out = np.full(clay.shape, "", dtype=object)
    ok = np.isfinite(clay) & np.isfinite(sand)
    out[ok] = "medium"
    out[ok & (clay < 18) & (sand > 65)] = "coarse"
    out[ok & (clay > 35)] = "fine"
    return out


# Convención del proyecto: términos agronómicos de ECOCROP ↔ clases FAO.
ECOCROP_TO_FAO = {"L": "coarse", "M": "medium", "H": "fine"}
ECOCROP_CODE_LABELS = {"L": "ligera", "M": "media", "H": "pesada", "O": "orgánica", "W": "amplia (cualquiera)"}
ABSOLUTE_ONLY_SCORE = 0.5


def parse_texture_codes(codes: str) -> set[str]:
    return {c.upper() for c in codes.replace(",", " ").split() if c.strip()}


def texture_score(group: np.ndarray, optimal: set[str], absolute: set[str]) -> np.ndarray:
    """1 si el grupo está en el conjunto óptimo, ``ABSOLUTE_ONLY_SCORE`` si solo en el absoluto, 0 si no.

    'W' (amplia) acepta cualquier grupo. 'O' (orgánica) no se asigna nunca: SoilGrids da suelos minerales.
    """
    def accepted(codes: set[str]) -> set[str]:
        if "W" in codes:
            return {"coarse", "medium", "fine"}
        return {ECOCROP_TO_FAO[c] for c in codes if c in ECOCROP_TO_FAO}

    opt, ab = accepted(optimal), accepted(absolute) | accepted(optimal)
    out = np.full(group.shape, np.nan)
    has = group != ""
    out[has] = 0.0
    out[has & np.isin(group, list(ab))] = ABSOLUTE_ONLY_SCORE
    out[has & np.isin(group, list(opt))] = 1.0
    return out
