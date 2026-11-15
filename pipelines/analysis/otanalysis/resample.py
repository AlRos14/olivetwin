"""Remuestreo de rásteres a la rejilla de análisis y utilidades de radar."""
from __future__ import annotations

import numpy as np
from rasterio.crs import CRS
from rasterio.warp import Resampling, reproject

from .grid import Grid


def _crs(crs) -> CRS:
    return crs if isinstance(crs, CRS) else CRS.from_user_input(crs)


def warp_to_grid(src: np.ndarray, src_transform, src_crs, grid: Grid,
                 resampling: Resampling = Resampling.nearest) -> np.ndarray:
    """Reproyecta ``src`` (NaN = sin dato) a la rejilla. Devuelve float64 con NaN."""
    data = np.asarray(src, dtype=np.float64)
    dst = np.full(grid.shape, np.nan, dtype=np.float64)
    reproject(
        source=data, destination=dst,
        src_transform=src_transform, src_crs=_crs(src_crs), src_nodata=np.nan,
        dst_transform=grid.transform, dst_crs=CRS.from_epsg(3857), dst_nodata=np.nan,
        resampling=resampling,
    )
    return dst


def valid_fraction_on_grid(valid_mask: np.ndarray, src_transform, src_crs, grid: Grid) -> np.ndarray:
    """Fracción (0..1) de subpíxeles de origen válidos dentro de cada celda.

    Los píxeles fuera de la huella del origen cuentan como no válidos.
    """
    m = np.asarray(valid_mask, dtype=np.float32)
    dst = np.zeros(grid.shape, dtype=np.float32)
    reproject(
        source=m, destination=dst,
        src_transform=src_transform, src_crs=_crs(src_crs), src_nodata=None,
        dst_transform=grid.transform, dst_crs=CRS.from_epsg(3857), dst_nodata=None,
        init_dest_nodata=False, resampling=Resampling.average,
    )
    return dst.astype(np.float64)


def average_to_grid(src: np.ndarray, src_transform, src_crs, grid: Grid,
                    min_valid_fraction: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
    """Media de los subpíxeles válidos por celda, exigiendo una fracción mínima válida.

    Devuelve (valores con NaN, fracción válida).
    """
    data = np.asarray(src, dtype=np.float64)
    mean = warp_to_grid(data, src_transform, src_crs, grid, Resampling.average)
    frac = valid_fraction_on_grid(np.isfinite(data), src_transform, src_crs, grid)
    mean[frac < min_valid_fraction] = np.nan
    return mean, frac


def power_to_db(power: np.ndarray) -> np.ndarray:
    p = np.asarray(power, dtype=np.float64)
    out = np.full(p.shape, np.nan)
    ok = np.isfinite(p) & (p > 0)
    out[ok] = 10.0 * np.log10(p[ok])
    return out


def db_to_power(db: np.ndarray) -> np.ndarray:
    return np.power(10.0, np.asarray(db, dtype=np.float64) / 10.0)


def linear_mean_db(power_samples: np.ndarray) -> float:
    """dB de la media en potencia lineal (no la media de los dB)."""
    p = np.asarray(power_samples, dtype=np.float64)
    p = p[np.isfinite(p) & (p > 0)]
    if p.size == 0:
        return float("nan")
    return float(10.0 * np.log10(p.mean()))
