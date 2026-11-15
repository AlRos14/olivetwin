"""FAO GAEZ v4: factor de restricción climática total de un cultivo de secano.

Se usa la capa «Total climate related crop yield constraint factor ‘0’» del tema 3 (agroclimático) de GAEZ v4
(FAO e IIASA, 2021): fracción del rendimiento potencial que permite el clima (1 = sin restricción térmica,
hídrica ni agroclimática), para el cultivo en secano, con insumos bajos (manejo tradicional), clima 1981–2010
(CRU TS 3.2) y agua útil del suelo de referencia de 200 mm/m. Rejilla de 5′ (~9 km), remuestreada a 250 m de
forma bilineal: describe el clima regional, no diferencias entre parcelas.
"""
from __future__ import annotations

import numpy as np
import rasterio
from rasterio.warp import Resampling, transform_bounds
from rasterio.windows import from_bounds
from rasterio.windows import transform as win_transform

from ..context import Ctx
from ..resample import warp_to_grid

URL = "https://s3.eu-west-1.amazonaws.com/data.gaezdev.aws.fao.org/res02/CRUTS32/Hist/8110L/{code}200b_fc0.tif"
REFERENCE = "https://gaez.fao.org/"
CITATION = "FAO e IIASA (2021). Global Agro-Ecological Zones version 4 (GAEZ v4). Roma: FAO."
LICENSE = (
    "© FAO e IIASA, GAEZ v4. Términos de uso de FAO (https://www.fao.org/contact-us/terms/en/): uso para estudio, "
    "investigación y fines no comerciales citando a FAO; las bases de datos de FAO se publican con CC BY 4.0 salvo "
    "que sus metadatos indiquen otra cosa (https://www.fao.org/contact-us/terms/db-terms-of-use/en)."
)


def climate_factor(ctx: Ctx, code: str) -> tuple[np.ndarray, str]:
    """Factor 0–1 en la rejilla de la zona y la URL de la capa."""
    url = URL.format(code=code)
    cache = ctx.cache_dir("gaez", ctx.zone.id) / f"{code}200b_fc0.tif"
    if not cache.exists():
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
            with rasterio.open(f"/vsicurl/{url}") as ds:
                bb = transform_bounds("EPSG:4326", ds.crs, *ctx.grid.padded_bbox_wgs84(0.2), densify_pts=21)
                win = from_bounds(*bb, ds.transform).round_offsets().round_lengths()
                arr = ds.read(1, window=win, boundless=True, fill_value=ds.nodata if ds.nodata is not None else -1)
                prof = {"driver": "GTiff", "height": arr.shape[0], "width": arr.shape[1], "count": 1,
                        "dtype": arr.dtype, "crs": ds.crs, "transform": win_transform(win, ds.transform),
                        "nodata": ds.nodata}
        with rasterio.open(cache, "w", **prof) as dst:
            dst.write(arr, 1)
    with rasterio.open(cache) as ds:
        arr = ds.read(1).astype(np.float64)
        if ds.nodata is not None:
            arr[arr == ds.nodata] = np.nan
        arr[arr < 0] = np.nan
        values = warp_to_grid(arr / 10000.0, ds.transform, ds.crs, ctx.grid, Resampling.bilinear)
    return np.clip(values, 0.0, 1.0), url
