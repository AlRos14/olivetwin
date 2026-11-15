"""Codificación ``png-uint8-linear``: valor = offset + scale * código (0..254), 255 = sin dato."""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image

NODATA_CODE = 255
MAX_CODE = 254


def encode(values: np.ndarray, offset: float, scale: float) -> np.ndarray:
    """Cuantiza valores float (NaN = sin dato) a uint8; recorta a 0..254."""
    if scale <= 0:
        raise ValueError("scale debe ser > 0")
    arr = np.asarray(values, dtype=np.float64)
    valid = np.isfinite(arr)
    codes = np.full(arr.shape, NODATA_CODE, dtype=np.uint8)
    q = np.rint((arr[valid] - offset) / scale)
    codes[valid] = np.clip(q, 0, MAX_CODE).astype(np.uint8)
    return codes


def decode(codes: np.ndarray, offset: float, scale: float) -> np.ndarray:
    codes = np.asarray(codes)
    out = offset + scale * codes.astype(np.float64)
    out[codes == NODATA_CODE] = np.nan
    return out


def clipped_fraction(values: np.ndarray, offset: float, scale: float) -> float:
    """Fracción de celdas válidas que quedan fuera del rango codificable."""
    arr = np.asarray(values, dtype=np.float64)
    valid = np.isfinite(arr)
    if not valid.any():
        return 0.0
    lo, hi = offset, offset + scale * MAX_CODE
    v = arr[valid]
    return float(((v < lo - scale / 2) | (v > hi + scale / 2)).mean())


def png_bytes(codes: np.ndarray) -> bytes:
    """PNG gris 8 bits (modo L), sin alfa ni fragmentos de color/gamma."""
    if codes.dtype != np.uint8 or codes.ndim != 2:
        raise ValueError("se espera un array uint8 2D")
    img = Image.fromarray(codes, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def write_png(path: Path, codes: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".png.tmp")
    tmp.write_bytes(png_bytes(codes))
    tmp.replace(path)


def read_png(path: Path) -> np.ndarray:
    with Image.open(path) as img:
        if img.mode != "L":
            raise ValueError(f"{path}: modo {img.mode}, se esperaba L")
        return np.array(img)
