import datetime as dt

import numpy as np
import pytest

from otanalysis.sources.dem import slope_degrees
from otanalysis.sources.gunw import mask_valid
from otanalysis.sources.nisar_common import parse_l2l3_name, pick_latest_versions, production_flag_note
from otanalysis.sources.s2 import boa_offset, normalized_difference, select_dates
from otanalysis.sources.smap import zone_mean
from otanalysis.sources.soil import depth_weighted_mean

N1 = "NISAR_L3_PR_SME2_025_087_A_021_2005_DHDH_A_20260714T052325_20260714T052400_P05023_F_F_J_001"
N2 = "NISAR_L3_PR_SME2_024_087_A_021_2005_DHDH_A_20260702T052325_20260702T052400_P05023_N_F_J_001"


def test_parse_nisar_names():
    d = parse_l2l3_name(N1 + ".h5")
    assert d["start_iso"] == "2026-07-14T05:23:25Z" and d["track"] == "087" and d["dir"] == "A"
    assert d["production_flags"] == "F_F_J_001" and d["crid"] == "P05023"
    assert production_flag_note("N_F_J_001") is None
    assert "F_F_J_001" in production_flag_note("F_F_J_001")
    with pytest.raises(ValueError):
        parse_l2l3_name("foo.h5")


def test_pick_latest_versions():
    dup = N2[:-3] + "002"
    assert pick_latest_versions([N1, N2, dup]) == [dup, N1]


def test_boa_offset():
    assert boa_offset("05.12") == -1000.0
    assert boa_offset("04.00") == -1000.0
    assert boa_offset("02.14") == 0.0
    assert boa_offset(None) == 0.0


def test_normalized_difference():
    nir = np.array([0.4, 0.3, np.nan, 0.0])
    red = np.array([0.1, 0.3, 0.1, 0.0])
    out = normalized_difference(nir, red)
    assert out[0] == pytest.approx(0.6) and out[1] == 0
    assert np.isnan(out[2]) and np.isnan(out[3])


def test_select_dates_one_per_bin():
    g = {
        ("2026-06-01", 94, "A"): {"date": dt.date(2026, 6, 1), "cloud": 5.0},
        ("2026-06-03", 94, "B"): {"date": dt.date(2026, 6, 3), "cloud": 0.0},
        ("2026-06-20", 94, "A"): {"date": dt.date(2026, 6, 20), "cloud": 3.0},
    }
    assert select_dates(g, dt.date(2026, 6, 1), dt.date(2026, 6, 30), 14) == [
        ("2026-06-03", 94, "B"), ("2026-06-20", 94, "A")]


def test_depth_weighted_mean():
    a = np.full((2, 2), 10.0)
    b = np.full((2, 2), 20.0)
    c = np.full((2, 2), 40.0)
    c[0, 0] = np.nan
    out = depth_weighted_mean([a, b, c], [5, 10, 15])
    assert out[1, 1] == pytest.approx((50 + 200 + 600) / 30)
    assert np.isnan(out[0, 0])


def test_slope_of_inclined_plane():
    res = 30.0
    y, x = np.mgrid[0:20, 0:20]
    dem = x * res * np.tan(np.radians(10))
    s = slope_degrees(dem, res)
    assert np.nanmean(s) == pytest.approx(10.0, abs=1e-6)
    assert np.isnan(s[0]).all() and np.isfinite(s[1:-1, 1:-1]).all()


def test_gunw_mask_decoding():
    m = np.array([11, 12, 111, 10, 1, 255, 11 + (1 << 8), 11 + (1 << 16), 11 + (1 << 24)], dtype=np.uint32)
    assert mask_valid(m).tolist() == [True, True, False, False, False, False, False, False, True]


def test_smap_zone_mean():
    sm = np.array([[0.2, 0.3], [np.nan, 0.5]])
    qf = np.array([[0, 0], [0, 1]])
    lat = np.array([[37.7, 37.7], [37.8, 37.8]])
    lon = np.array([[-3.8, -3.0], [-3.8, -3.7]])
    v, n = zone_mean(sm, qf, lat, lon, (-3.9, 37.6, -3.5, 37.9))
    assert v == pytest.approx(0.2) and n == 1
    assert zone_mean(sm, np.ones_like(qf), lat, lon, (-3.9, 37.6, -3.5, 37.9)) == (None, 0)
