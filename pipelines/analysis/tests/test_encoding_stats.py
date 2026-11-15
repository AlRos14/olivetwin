import numpy as np
import pytest
from PIL import Image

from otanalysis.encoding import NODATA_CODE, clipped_fraction, decode, encode, read_png, write_png
from otanalysis.stats import compute_stats

ENCODINGS = [
    (0.0, 0.0025, 0.0, 0.6),        # humedad m³/m³
    (-1.0, 2 / 254, -1.0, 1.0),     # NDVI/NDMI
    (-35.0, 0.16, -35.0, 5.0),      # radar dB
    (-25.0, 0.12, -25.0, 5.0),      # HV−HH
    (0.0, 0.25, 0.0, 60.0),         # pendiente
    (3.0, 0.03, 3.0, 10.0),         # pH
]


@pytest.mark.parametrize("offset,scale,lo,hi", ENCODINGS)
def test_roundtrip_within_half_step(offset, scale, lo, hi):
    rng = np.random.default_rng(0)
    vals = rng.uniform(lo, min(hi, offset + 254 * scale), size=(40, 50))
    vals[0, :5] = np.nan
    codes = encode(vals, offset, scale)
    assert codes.dtype == np.uint8
    assert (codes[0, :5] == NODATA_CODE).all()
    assert codes[np.isfinite(vals)].max() <= 254
    back = decode(codes, offset, scale)
    ok = np.isfinite(vals)
    assert np.isnan(back[~ok]).all()
    assert np.abs(back[ok] - vals[ok]).max() <= scale / 2 + 1e-9


def test_clipping_never_produces_nodata_code():
    vals = np.array([[-100.0, 1e6, 0.1]])
    codes = encode(vals, 0.0, 0.0025)
    assert codes.tolist() == [[0, 254, 40]]
    assert clipped_fraction(vals, 0.0, 0.0025) == pytest.approx(2 / 3)


def test_png_is_8bit_gray_without_alpha(work_dir):
    codes = encode(np.linspace(0, 0.5, 12 * 7).reshape(7, 12), 0.0, 0.0025)
    p = work_dir / "x" / "20260101.png"
    write_png(p, codes)
    with Image.open(p) as im:
        assert im.mode == "L" and im.size == (12, 7)
        assert "transparency" not in im.info and "gamma" not in im.info and "icc_profile" not in im.info
    raw = p.read_bytes()
    assert raw[25] == 0 and raw[24] == 8  # IHDR: color type 0 (gris), bit depth 8
    assert (read_png(p) == codes).all()


def test_stats_known_values():
    v = np.array([[1.0, 2.0, np.nan], [3.0, 4.0, 5.0]])
    s = compute_stats(v)
    assert s["mean"] == 3.0 and s["median"] == 3.0 and s["min"] == 1.0 and s["max"] == 5.0
    assert s["p10"] == pytest.approx(1.4) and s["p90"] == pytest.approx(4.6)
    assert s["validFraction"] == pytest.approx(5 / 6, abs=1e-4)
    assert s["min"] <= s["p10"] <= s["median"] <= s["p90"] <= s["max"]


def test_stats_all_nodata():
    s = compute_stats(np.full((3, 3), np.nan))
    assert s == {"mean": None, "median": None, "p10": None, "p90": None, "min": None, "max": None,
                 "validFraction": 0.0}
