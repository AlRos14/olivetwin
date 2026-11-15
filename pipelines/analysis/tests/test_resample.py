import numpy as np
import pytest
from affine import Affine

from otanalysis.grid import Grid
from otanalysis.resample import (average_to_grid, db_to_power, linear_mean_db, power_to_db,
                                 valid_fraction_on_grid, warp_to_grid)


def _fine(grid: Grid, factor: int):
    """Raster EPSG:3857 alineado con la rejilla con ``factor``×``factor`` subpíxeles por celda."""
    tr = Affine(grid.cell / factor, 0, grid.x0, 0, -grid.cell / factor, grid.y0)
    return tr, (grid.height * factor, grid.width * factor)


GRID = Grid.from_bbox((-3.70, 37.70, -3.68, 37.715), 250)


def test_linear_mean_differs_from_mean_of_db():
    p = np.array([0.01, 0.1, 1.0])
    assert linear_mean_db(p) == pytest.approx(10 * np.log10(0.37))
    assert linear_mean_db(p) != pytest.approx(power_to_db(p).mean())
    assert np.allclose(db_to_power(power_to_db(p)), p)
    assert np.isnan(power_to_db(np.array([0.0, -1.0]))).all()


def test_average_in_linear_power_then_db():
    tr, shape = _fine(GRID, 5)
    rng = np.random.default_rng(1)
    p = rng.uniform(0.001, 0.5, size=shape)
    mean_lin, frac = average_to_grid(p, tr, "EPSG:3857", GRID, 0.5)
    expected = p.reshape(GRID.height, 5, GRID.width, 5).mean(axis=(1, 3))
    assert np.allclose(mean_lin, expected, rtol=1e-6)
    assert np.allclose(frac, 1.0)
    assert np.allclose(power_to_db(mean_lin), 10 * np.log10(expected))


def test_min_valid_fraction_threshold():
    tr, shape = _fine(GRID, 4)
    v = np.ones(shape)
    v[0:4, 0:4] = np.nan        # celda (0,0) sin dato
    v[0:4, 4:4 + 2] = np.nan    # celda (0,1): 8/16 nulos → 50 % válido (se conserva)
    v[0:4, 8:8 + 3] = np.nan    # celda (0,2): 12/16 nulos → 25 % válido (se descarta)
    mean, frac = average_to_grid(v, tr, "EPSG:3857", GRID, 0.5)
    assert frac[0, 0] == 0 and np.isnan(mean[0, 0])
    assert frac[0, 1] == pytest.approx(0.5) and mean[0, 1] == pytest.approx(1.0)
    assert frac[0, 2] == pytest.approx(0.25) and np.isnan(mean[0, 2])
    assert np.isfinite(mean[1:, :]).all()


def test_fraction_outside_footprint_is_zero():
    tr = Affine(50, 0, GRID.x0, 0, -50, GRID.y0)
    m = np.ones((5, 5), dtype=bool)  # solo cubre la celda (0,0)
    frac = valid_fraction_on_grid(m, tr, "EPSG:3857", GRID)
    assert frac[0, 0] == pytest.approx(1.0)
    assert frac[1:, :].max() == 0 and frac[0, 1:].max() == 0


def test_nearest_keeps_values():
    tr, shape = _fine(GRID, 1)
    src = np.arange(np.prod(shape), dtype=float).reshape(shape)
    out = warp_to_grid(src, tr, "EPSG:3857", GRID)
    assert np.array_equal(out, src)
