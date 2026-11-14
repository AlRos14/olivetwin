"""Genera un HDF5 con la estructura de NISAR L3 SME2 (solo para tests; datos inventados)."""
import h5py
import numpy as np
from pyproj import Transformer

X0, Y0, R = -17367530.445161372, 7314540.830638504, 200.0  # EASE-Grid 2.0 global, esquina sup.-izq.


def make(path, lon=-90.28, lat=29.93, seed=0, ncols=400, nrows=400):
    cx, cy = Transformer.from_crs(4326, 6933, always_xy=True).transform(lon, lat)
    c0 = int((cx - X0) / R) - ncols // 2
    r0 = int((Y0 - cy) / R) - nrows // 2
    x = X0 + R * (np.arange(c0, c0 + ncols) + 0.5)
    y = Y0 - R * (np.arange(r0, r0 + nrows) + 0.5)
    rng = np.random.default_rng(seed)
    cols, rows = np.meshgrid(np.arange(ncols), np.arange(nrows))
    sm = (0.15 + 0.4 * (cols % 60) / 60 + 0.02 * rng.standard_normal(cols.shape)).astype("float32")
    sm[(rows // 7 + cols // 9) % 4 == 0] = -9999.0
    g = "/science/LSAR/SME2/grids"
    with h5py.File(path, "w") as f:
        f[f"{g}/xCoordinates"] = x
        f[f"{g}/yCoordinates"] = y
        p = f.create_dataset(f"{g}/projection", data=np.uint32(6933))
        p.attrs["epsg_code"] = 6933
        for name in ("soilMoisture", "algorithmCandidates/DSG/soilMoisture"):
            d = f.create_dataset(f"{g}/{name}", data=sm)
            d.attrs["units"] = b"meter^3/meter^3"
            d.attrs["_FillValue"] = np.float32(-9999.0)
    return sm, x, y
