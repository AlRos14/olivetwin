import math

import numpy as np
import pytest
from pyproj import Transformer

from otanalysis.grid import Grid
from otanalysis.zones import ZONES

TO_3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


@pytest.mark.parametrize("zid", list(ZONES))
def test_grid_covers_zone_with_whole_cells(zid):
    zone = ZONES[zid]
    g = Grid.from_bbox(zone.bbox, 250)
    x0, y0 = TO_3857.transform(zone.bbox[0], zone.bbox[3])
    x1, y1 = TO_3857.transform(zone.bbox[2], zone.bbox[1])
    assert g.width == math.ceil((x1 - x0) / 250)
    assert g.height == math.ceil((y0 - y1) / 250)
    assert g.x0 == pytest.approx(x0) and g.y0 == pytest.approx(y0)
    assert g.x1 - g.x0 == pytest.approx(g.width * 250)
    assert g.y0 - g.y1 == pytest.approx(g.height * 250)
    # Esquina NO idéntica; extensión ≥ zona y dentro de la tolerancia del validador (0,01°).
    w, s, e, n = g.bbox_wgs84
    assert w == pytest.approx(zone.bbox[0], abs=1e-7) and n == pytest.approx(zone.bbox[3], abs=1e-7)
    assert e >= zone.bbox[2] - 1e-7 and s <= zone.bbox[1] + 1e-7
    assert e - zone.bbox[2] < 0.01 and zone.bbox[1] - s < 0.01


def test_grid_contract_and_cells():
    g = Grid.from_bbox((-4.0, 37.6, -3.6, 37.9), 250)
    c = g.to_contract()
    assert c["crs"] == "EPSG:3857" and c["encoding"] == "png-uint8-linear" and c["nodata"] == 255
    assert (c["width"], c["height"]) == (g.width, g.height)
    w, s, e, n = g.bbox_wgs84
    assert g.lonlat_to_cell(w + 1e-6, n - 1e-6) == (0, 0)
    assert g.lonlat_to_cell(e - 1e-6, s + 1e-6) == (g.height - 1, g.width - 1)
    assert g.lonlat_to_cell(w - 0.01, n) is None
    # Coherencia con la transformada afín (centro de la celda (5, 7)).
    x, y = g.transform @ (7.5, 5.5)
    lon, lat = Transformer.from_crs(3857, 4326, always_xy=True).transform(x, y)
    assert g.lonlat_to_cell(lon, lat) == (5, 7)


def test_degenerate_bbox():
    with pytest.raises(ValueError):
        Grid.from_bbox((1.0, 1.0, 1.0, 1.0))


def test_shape_matches():
    g = Grid.from_bbox((-4.0, 37.6, -3.9, 37.7), 250)
    assert np.zeros(g.shape).shape == (g.height, g.width)
