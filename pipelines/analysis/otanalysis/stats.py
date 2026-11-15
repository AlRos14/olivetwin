"""Estadísticas por paso, calculadas sobre los valores float de la rejilla antes de cuantizar."""
from __future__ import annotations

import numpy as np


def _r(x: float, nd: int = 6) -> float:
    return float(round(float(x), nd))


def compute_stats(values: np.ndarray, decimals: int = 6) -> dict:
    arr = np.asarray(values, dtype=np.float64)
    valid = np.isfinite(arr)
    total = arr.size
    n = int(valid.sum())
    vf = float(n / total) if total else 0.0
    if n == 0:
        return {"mean": None, "median": None, "p10": None, "p90": None, "min": None, "max": None,
                "validFraction": 0.0}
    v = arr[valid]
    p10, med, p90 = np.percentile(v, [10, 50, 90])
    return {
        "mean": _r(v.mean(), decimals),
        "median": _r(med, decimals),
        "p10": _r(p10, decimals),
        "p90": _r(p90, decimals),
        "min": _r(v.min(), decimals),
        "max": _r(v.max(), decimals),
        "validFraction": _r(vf, 4),
    }
