"""Open-Meteo Historical Weather API (ERA5/ERA5-Land) → series diarias de zona."""
from __future__ import annotations

import datetime as dt
import json

import requests

from ..context import PERIOD_END, PERIOD_START, Ctx
from ..cube import SourceResult
from ..net import log, retry

API = "https://archive-api.open-meteo.com/v1/archive"
MODEL = "era5_seamless"
LICENSE = (
    "CC BY 4.0 — Weather data by Open-Meteo.com (https://open-meteo.com/) (ERA5/ERA5-Land, Copernicus "
    "Climate Change Service). Generated using Copernicus Climate Change Service information 2026. "
    "Cita: Zippenfenig, P. (2023) Open-Meteo.com Weather API, doi:10.5281/ZENODO.7970649."
)
SERIES = [
    ("precipitation", "precipitation_sum", "Precipitación diaria", "mm", "bar",
     "Reanálisis (ERA5/ERA5-Land, ~9–25 km) en el centroide de la zona: no sustituye a un pluviómetro local; "
     "las tormentas convectivas pueden estar infra o sobreestimadas."),
    ("et0", "et0_fao_evapotranspiration", "Evapotranspiración de referencia ET0 (FAO-56)", "mm", "line",
     "ET0 de un cultivo de referencia (césped) calculada por Open-Meteo con FAO Penman-Monteith a partir del "
     "reanálisis; no es la evapotranspiración real del olivar ni su necesidad de riego."),
    ("temperature-max", "temperature_2m_max", "Temperatura máxima diaria a 2 m", "°C", "line",
     "Reanálisis en el centroide de la zona: suaviza diferencias locales de relieve y exposición."),
    ("temperature-min", "temperature_2m_min", "Temperatura mínima diaria a 2 m", "°C", "line",
     "Reanálisis en el centroide de la zona: suaviza diferencias locales de relieve y exposición."),
]


def run(ctx: Ctx) -> SourceResult:
    zone, grid = ctx.zone, ctx.grid
    res = SourceResult(source="climate", owned_ids=[s[0] for s in SERIES])
    lon, lat = grid.centroid_wgs84
    cache = ctx.cache_dir("climate", zone.id) / f"openmeteo_{MODEL}_{PERIOD_START}_{PERIOD_END}.json"
    params = {"latitude": round(lat, 4), "longitude": round(lon, 4), "start_date": PERIOD_START,
              "end_date": PERIOD_END, "daily": ",".join(s[1] for s in SERIES), "timezone": "UTC",
              "models": MODEL}
    if cache.exists():
        data = json.loads(cache.read_text())
    else:
        def _get():
            r = requests.get(API, params=params, timeout=120)
            r.raise_for_status()
            return r.json()
        data = retry(_get)
        cache.write_text(json.dumps(data))
    daily = data["daily"]
    dates = daily["time"]
    units = data.get("daily_units", {})
    last_valid = max((d for d, v in zip(dates, daily[SERIES[0][1]]) if v is not None), default=None)
    log(f"[{zone.id}] Open-Meteo: {len(dates)} días, último con dato {last_valid}, celda "
        f"{data.get('latitude')},{data.get('longitude')} elev {data.get('elevation')} m")
    for sid, var, title, unit, chart, caveat in SERIES:
        pts = [{"date": d, "value": (None if v is None else float(v))} for d, v in zip(dates, daily[var])]
        while pts and pts[-1]["value"] is None:
            pts.pop()
        if not pts:
            res.unavailable.append({"id": sid, "title": title, "reason": f"Open-Meteo no devolvió valores de {var}."})
            continue
        res.series.append({
            "id": sid, "title": title, "unit": units.get(var, unit), "chart": chart,
            "caveat": caveat,
            "provenance": {
                "provider": "Open-Meteo.com (reanálisis ERA5/ERA5-Land de Copernicus C3S / ECMWF)",
                "product": f"Historical Weather API, modelo {MODEL}, variable diaria {var}",
                "processingVersion": f"Consulta {dt.date.today().isoformat()} (API v1/archive)",
                "license": LICENSE,
                "referenceUrl": "https://open-meteo.com/en/docs/historical-weather-api",
                "note": (f"Centroide de la rejilla ({lat:.4f}, {lon:.4f}); celda devuelta "
                         f"{data.get('latitude')}, {data.get('longitude')} (elevación {data.get('elevation')} m). "
                         f"Días en UTC. Periodo {pts[0]['date']} a {pts[-1]['date']}."),
            },
            "points": pts,
        })
    return res
