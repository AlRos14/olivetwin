"""Climatología 1991–2020 (Open-Meteo, ERA5/ERA5-Land) → variables estáticas de clima de la rejilla.

Puntos: las 4 esquinas y el centro de la rejilla de cada zona (5 puntos). Cada punto descarga la serie
diaria 1991-01-01..2020-12-31 (``temperature_2m_mean/max/min``, ``precipitation_sum``) del modelo
``era5_seamless``. Coste en el API gratuito: ~783 «llamadas» por punto (10 958 días / 14), por lo
que se respeta el límite horario (5 000) espaciando peticiones y reintentando tras HTTP 429.

Interpolación: las temperaturas de cada punto se reducen al nivel del mar con el gradiente
estándar 6,5 °C/km usando la elevación que Open-Meteo declara para ese punto, se interpolan por
distancia inversa (potencia 2, distancias en metros Web Mercator) y se devuelven a la altitud media
de cada celda (Copernicus DEM). La precipitación se interpola sin corrección por altitud.
"""
from __future__ import annotations

import datetime as dt
import json
import time
from dataclasses import dataclass, field

import numpy as np
import requests
from pyproj import Transformer

from ..context import Ctx
from ..cube import SourceResult, StepData, VariableData
from ..net import log
from .climate import API, LICENSE as OM_LICENSE, MODEL

PERIOD = ("1991-01-01", "2020-12-31")
DAILY = ["temperature_2m_mean", "temperature_2m_max", "temperature_2m_min", "precipitation_sum"]
LAPSE_C_PER_M = 0.0065
LAPSE_SOURCE = ("Gradiente térmico vertical estándar de 6,5 °C/km de la Atmósfera Estándar de la OACI "
                "(ICAO Doc 7488/3, Manual of the ICAO Standard Atmosphere, 1993; ISO 2533:1975).")
IDW_POWER = 2.0
MIN_SECONDS_BETWEEN_REQUESTS = 40.0
_TO_3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


@dataclass
class PointClimate:
    lon: float
    lat: float
    elevation: float
    tmean: np.ndarray       # (12,) media de la temperatura media diaria
    tmin: np.ndarray        # (12,) media de la mínima diaria
    tmax: np.ndarray        # (12,) media de la máxima diaria
    prec: np.ndarray        # (12,) precipitación mensual total, media de los años
    exmin: np.ndarray       # (12,) media interanual de la mínima absoluta de cada mes
    annual_absmin: float    # media de las mínimas absolutas anuales
    years: int
    extra: dict = field(default_factory=dict)


def lattice_points(bbox) -> list[tuple[float, float]]:
    w, s, e, n = bbox
    return [(w, n), (e, n), (w, s), (e, s), ((w + e) / 2, (s + n) / 2)]


def to_sea_level(t: np.ndarray, elevation_m: float) -> np.ndarray:
    return np.asarray(t) + LAPSE_C_PER_M * elevation_m


def from_sea_level(t0: np.ndarray, elevation_m) -> np.ndarray:
    return np.asarray(t0) - LAPSE_C_PER_M * np.asarray(elevation_m)


def idw_weights(px: np.ndarray, py: np.ndarray, gx: np.ndarray, gy: np.ndarray, power: float = IDW_POWER) -> np.ndarray:
    """Pesos IDW normalizados, forma (n_puntos, *gx.shape). Si una celda coincide con un punto, peso 1."""
    d = np.sqrt((gx[None] - px[:, None, None]) ** 2 + (gy[None] - py[:, None, None]) ** 2)
    exact = d < 1e-6
    w = 1.0 / np.maximum(d, 1e-6) ** power
    w = np.where(exact.any(axis=0)[None], exact.astype(float), w)
    return w / w.sum(axis=0, keepdims=True)


def summarize_daily(daily: dict) -> dict:
    """Climatología mensual a partir de la serie diaria de Open-Meteo."""
    dates = np.array([dt.date.fromisoformat(d) for d in daily["time"]])
    years = np.array([d.year for d in dates])
    months = np.array([d.month for d in dates])
    arr = {k: np.array([np.nan if v is None else v for v in daily[k]], dtype=float) for k in DAILY}
    uy = np.unique(years)
    out = {k: np.full(12, np.nan) for k in ("tmean", "tmin", "tmax", "prec", "exmin")}
    for m in range(1, 13):
        sel = months == m
        out["tmean"][m - 1] = np.nanmean(arr["temperature_2m_mean"][sel])
        out["tmin"][m - 1] = np.nanmean(arr["temperature_2m_min"][sel])
        out["tmax"][m - 1] = np.nanmean(arr["temperature_2m_max"][sel])
        totals, exmins = [], []
        for y in uy:
            s2 = sel & (years == y)
            p = arr["precipitation_sum"][s2]
            if np.isfinite(p).all():
                totals.append(p.sum())
            t = arr["temperature_2m_min"][s2]
            if np.isfinite(t).any():
                exmins.append(np.nanmin(t))
        out["prec"][m - 1] = np.mean(totals)
        out["exmin"][m - 1] = np.mean(exmins)
    absmins = [np.nanmin(arr["temperature_2m_min"][years == y]) for y in uy]
    out["annual_absmin"] = float(np.mean(absmins))
    out["years"] = int(len(uy))
    out["missing"] = {k: int(np.isnan(v).sum()) for k, v in arr.items()}
    return out


def _fetch_point(ctx: Ctx, i: int, lon: float, lat: float) -> dict:
    cache = ctx.cache_dir("climatology", ctx.zone.id) / f"p{i}_{lat:.4f}_{lon:.4f}_{PERIOD[0]}_{PERIOD[1]}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    params = {"latitude": round(lat, 4), "longitude": round(lon, 4), "start_date": PERIOD[0],
              "end_date": PERIOD[1], "daily": ",".join(DAILY), "timezone": "UTC", "models": MODEL}
    for attempt in range(20):
        r = requests.get(API, params=params, timeout=300)
        if r.status_code == 429 or (r.status_code == 400 and "limit" in r.text.lower()):
            reason = r.text[:200].replace("\n", " ")
            log(f"  Open-Meteo límite de uso ({r.status_code}: {reason}); espera 5 min (intento {attempt + 1})")
            time.sleep(300)
            continue
        r.raise_for_status()
        data = r.json()
        cache.write_text(json.dumps(data))
        time.sleep(MIN_SECONDS_BETWEEN_REQUESTS)
        return data
    raise RuntimeError("Open-Meteo: límite de uso persistente tras 20 reintentos")


def point_climates(ctx: Ctx) -> list[PointClimate]:
    pts = []
    for i, (lon, lat) in enumerate(lattice_points(ctx.grid.bbox_wgs84)):
        data = _fetch_point(ctx, i, lon, lat)
        s = summarize_daily(data["daily"])
        pts.append(PointClimate(lon=data["longitude"], lat=data["latitude"], elevation=float(data["elevation"]),
                                tmean=s["tmean"], tmin=s["tmin"], tmax=s["tmax"], prec=s["prec"], exmin=s["exmin"],
                                annual_absmin=s["annual_absmin"], years=s["years"],
                                extra={"requested": [round(lon, 4), round(lat, 4)], "missing": s["missing"]}))
    return pts


@dataclass
class GridClimate:
    tmean: np.ndarray   # (12, h, w)
    tmin: np.ndarray
    exmin: np.ndarray
    prec: np.ndarray
    annual_absmin: np.ndarray  # (h, w)
    elevation: np.ndarray
    points: list


def grid_climate(points: list[PointClimate], grid, elevation: np.ndarray) -> GridClimate:
    px, py = _TO_3857.transform([p.lon for p in points], [p.lat for p in points])
    px, py = np.asarray(px), np.asarray(py)
    cols = grid.x0 + (np.arange(grid.width) + 0.5) * grid.cell
    rows = grid.y0 - (np.arange(grid.height) + 0.5) * grid.cell
    gx, gy = np.meshgrid(cols, rows)
    w = idw_weights(px, py, gx, gy)

    def interp_temp(values: np.ndarray) -> np.ndarray:  # values (n, 12) o (n,)
        sl = np.stack([to_sea_level(v, p.elevation) for v, p in zip(values, points)])
        if sl.ndim == 1:
            return from_sea_level(np.tensordot(sl, w, axes=(0, 0)), elevation)
        return np.stack([from_sea_level(np.tensordot(sl[:, m], w, axes=(0, 0)), elevation) for m in range(12)])

    prec = np.stack([np.tensordot(np.array([p.prec[m] for p in points]), w, axes=(0, 0)) for m in range(12)])
    nan_elev = ~np.isfinite(elevation)
    out = GridClimate(
        tmean=interp_temp(np.array([p.tmean for p in points])),
        tmin=interp_temp(np.array([p.tmin for p in points])),
        exmin=interp_temp(np.array([p.exmin for p in points])),
        prec=prec,
        annual_absmin=interp_temp(np.array([p.annual_absmin for p in points])),
        elevation=elevation, points=points)
    for a in (out.tmean, out.tmin, out.exmin, out.prec):
        a[:, nan_elev] = np.nan
    out.annual_absmin[nan_elev] = np.nan
    return out


def grid_elevation(ctx: Ctx) -> np.ndarray:
    """Altitud media por celda (Copernicus DEM), la misma que publica la fuente ``dem`` (usa su caché)."""
    from . import dem

    res = dem.run(ctx)
    var = next(v for v in res.variables if v.meta["id"] == "elevation")
    return var.steps[0].values


def compute(ctx: Ctx) -> GridClimate:
    elev = grid_elevation(ctx)
    return grid_climate(point_climates(ctx), ctx.grid, elev)


DESCRIPTIONS = {
    "climate-precip-annual": ("Precipitación media anual 1991–2020", "mm", "moisture", 10.0, 0.0, [300.0, 900.0], 0),
    "climate-tmean-annual": ("Temperatura media anual 1991–2020", "°C", "heat", 0.1, 0.0, [8.0, 20.0], 1),
    "climate-tmin-coldest": ("Mínima media del mes más frío 1991–2020", "°C", "heat", 0.1, -10.0, [-4.0, 6.0], 1),
    "climate-tabsmin": ("Mínima absoluta anual media 1991–2020", "°C", "heat", 0.1, -20.0, [-12.0, 0.0], 1),
}
TEXTS = {
    "climate-precip-annual": (
        "Precipitación total anual media del periodo 1991–2020 (reanálisis ERA5/ERA5-Land vía Open-Meteo), "
        "interpolada por distancia inversa entre 5 puntos de la zona.",
        "Reanálisis de 9–25 km interpolado entre pocos puntos: no recoge el efecto local del relieve sobre la "
        "lluvia (no se corrige por altitud) ni sustituye a estaciones pluviométricas. Media de 30 años, no un año concreto."),
    "climate-tmean-annual": (
        "Temperatura media anual 1991–2020 (media de las medias diarias), interpolada entre 5 puntos y corregida "
        "por la altitud de cada celda con 6,5 °C/km.",
        "Corrección por altitud con un gradiente estándar: no representa inversiones térmicas de fondo de valle ni "
        "efectos de orientación. Reanálisis, no observación local."),
    "climate-tmin-coldest": (
        "Media 1991–2020 de la temperatura mínima diaria del mes más frío (el mes con la mínima media más baja), "
        "corregida por altitud con 6,5 °C/km.",
        "Las heladas reales dependen de inversiones y del relieve local que el reanálisis y la corrección estándar "
        "no capturan; úsese como indicador relativo."),
    "climate-tabsmin": (
        "Media 1991–2020 de la temperatura mínima absoluta de cada año (el día más frío), corregida por altitud con "
        "6,5 °C/km.",
        "Los extremos fríos del reanálisis suelen ser menos intensos que en estaciones situadas en hondonadas; no "
        "es la mínima de un año concreto ni una probabilidad de helada."),
}


def run(ctx: Ctx) -> SourceResult:
    ids = list(DESCRIPTIONS)
    res = SourceResult(source="climatology", owned_ids=ids)
    gc = compute(ctx)
    coldest = np.nanmin(gc.tmin, axis=0)
    values = {
        "climate-precip-annual": np.nansum(gc.prec, axis=0) + np.where(np.isfinite(gc.prec[0]), 0, np.nan),
        "climate-tmean-annual": np.mean(gc.tmean, axis=0),
        "climate-tmin-coldest": coldest,
        "climate-tabsmin": gc.annual_absmin,
    }
    pts_note = "; ".join(f"({p.lat:.3f}, {p.lon:.3f}, {p.elevation:.0f} m)" for p in gc.points)
    for vid, (title, unit, palette, scale, offset, rng, dec) in DESCRIPTIONS.items():
        v = values[vid]
        log(f"[{ctx.zone.id}] {vid}: media {np.nanmean(v):.2f} {unit}, rango {np.nanmin(v):.2f}–{np.nanmax(v):.2f}")
        desc, caveat = TEXTS[vid]
        method = ("Interpolación IDW (potencia 2) de 5 puntos (esquinas y centro de la rejilla)"
                  + ("; temperaturas reducidas al nivel del mar con la elevación declarada por Open-Meteo y "
                     "devueltas a la altitud media de la celda (Copernicus DEM) con 6,5 °C/km. " + LAPSE_SOURCE
                     if vid != "climate-precip-annual" else "; sin corrección por altitud."))
        res.variables.append(VariableData(meta={
            "id": vid, "title": title, "group": "climate", "unit": unit, "scale": scale, "offset": offset,
            "decimals": dec, "displayRange": rng, "palette": palette, "temporal": False,
            "description": desc, "caveat": caveat,
            "provenance": {
                "provider": "Open-Meteo.com (reanálisis ERA5/ERA5-Land de Copernicus C3S / ECMWF)",
                "product": f"Historical Weather API, modelo {MODEL}, series diarias {', '.join(DAILY)}",
                "processingVersion": f"Climatología {PERIOD[0][:4]}–{PERIOD[1][:4]} (periodo normal OMM)",
                "license": OM_LICENSE,
                "referenceUrl": "https://open-meteo.com/en/docs/historical-weather-api",
                "note": f"{method} Puntos (lat, lon, elevación Open-Meteo): {pts_note}.",
            },
        }, steps=[StepData(date=None, values=v, provenance={
            "note": f"Climatología {PERIOD[0]}–{PERIOD[1]} ({gc.points[0].years} años); estática, date = null."})]))
    return res
