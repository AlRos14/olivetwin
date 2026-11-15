import datetime as dt

import numpy as np
import pytest

from otanalysis.ecocrop import (ABSOLUTE_ONLY_SCORE, duration_months, ecocrop, fao_texture_group, killing_score,
                                texture_score, trapezoid, usda_texture)
from otanalysis.grid import Grid
from otanalysis.sources.climatology import (LAPSE_C_PER_M, PointClimate, from_sea_level, grid_climate, idw_weights,
                                            summarize_daily, to_sea_level)
from otanalysis.sources import ugr
from otanalysis.sources.crops import limiting_shares, parse_datasheet, texture_classes, trapezoid_classes
from otanalysis.cube import CropData, CropFactorData


# --- trapecio y temperatura letal ----------------------------------------------------------------------
def test_trapezoid_matches_recocrop_approx4():
    x = np.array([4.0, 5.0, 12.5, 20.0, 27.0, 34.0, 37.0, 40.0, 41.0, np.nan])
    out = trapezoid(x, 5, 20, 34, 40)
    assert out[:9].tolist() == pytest.approx([0, 0, 0.5, 1, 1, 1, 0.5, 0, 0])
    assert np.isnan(out[9])


def test_trapezoid_open_ended():
    out = trapezoid(np.array([-30.0, 0.0, 100.0]), -1, 1, np.inf, np.inf)
    assert out.tolist() == [0.0, 0.5, 1.0]


def test_killing_score_ramp_ktmp_pm_1():
    out = killing_score(np.array([-2.0, -1.0, -0.5, 0.0, 1.0, 5.0]), 0.0)
    assert out.tolist() == pytest.approx([0, 0, 0.25, 0.5, 1, 1])
    assert killing_score(np.array([-9.5]), -10.0)[0] == pytest.approx(0.75)


@pytest.mark.parametrize("gmin,gmax,months", [(365, 365, 12), (150, 240, 6), (90, 250, 6), (210, 300, 8), (60, 60, 2)])
def test_duration_months_dismo_rule(gmin, gmax, months):
    assert duration_months(gmin, gmax) == months


# --- búsqueda del mes de inicio -------------------------------------------------------------------------
P = {"TMIN": 5, "TOPMN": 15, "TOPMX": 23, "TMAX": 27, "KTMP": 0}


def test_best_start_month_is_searched():
    # Meses 0..11; solo mar–ago (2..7) tienen temperatura óptima y sin helada.
    tmean = np.array([2, 3, 18, 18, 18, 18, 18, 18, 3, 2, 2, 2], dtype=float)[:, None]
    exmin = np.array([-5, -5, 5, 5, 5, 5, 5, 5, -5, -5, -5, -5], dtype=float)[:, None]
    prec = np.zeros((12, 1))
    r = ecocrop(tmean, exmin, prec, P, 6)
    assert r["suitability"][0] == 1.0 and r["start"][0] == 2
    assert r["factors"]["temperatura"][0] == 1.0 and r["factors"]["heladas"][0] == 1.0
    r4 = ecocrop(tmean, exmin, prec, P, 7)  # 7 meses: siempre incluye un mes frío
    assert r4["suitability"][0] == 0.0


def test_full_year_single_period_and_min_rule():
    tmean = np.full((12, 2), 20.0)
    tmean[0, 1] = 10.0  # enero frío en la celda 1 → 0,5
    exmin = np.full((12, 2), 5.0)
    r = ecocrop(tmean, exmin, np.zeros((12, 2)), P, 12, static_scores={"ph": np.array([0.8, 1.0])})
    assert r["start"].tolist() == [0, 0]
    assert r["suitability"].tolist() == pytest.approx([0.8, 0.5])
    assert r["factors"]["temperatura"].tolist() == pytest.approx([1.0, 0.5])


def test_window_rain_option_and_nan_propagation():
    tmean = np.full((12, 2), 20.0)
    tmean[:, 1] = np.nan
    prec = np.full((12, 2), 50.0)
    p = dict(P, RMIN=100, ROPMN=200, ROPMX=400, RMAX=800)
    r = ecocrop(tmean, np.full((12, 2), 5.0), prec, p, 3)
    assert r["factors"]["precipitacion"][0] == pytest.approx(0.5)  # 3 meses × 50 = 150 mm
    assert np.isnan(r["suitability"][1])


def test_limiting_shares():
    f = [CropFactorData("a", "A", ["x"], "r", np.array([0.2, 0.9])),
         CropFactorData("b", "B", ["x"], "r", np.array([0.5, 0.1]))]
    crop = CropData(meta={}, suitability=np.array([0.2, 0.1]), factors=f)
    assert limiting_shares(crop) == {"a": 0.5, "b": 0.5}


# --- textura -------------------------------------------------------------------------------------------
@pytest.mark.parametrize("clay,sand,cls", [
    (5, 92, "sand"), (10, 82, "loamy sand"), (10, 65, "sandy loam"), (20, 40, "loam"), (10, 20, "silt loam"),
    (5, 5, "silt"), (25, 60, "sandy clay loam"), (30, 30, "clay loam"), (35, 10, "silty clay loam"),
    (40, 50, "sandy clay"), (45, 5, "silty clay"), (50, 20, "clay")])
def test_usda_texture_examples(clay, sand, cls):
    assert usda_texture(np.array([clay]), np.array([sand]))[0] == cls


def test_usda_texture_covers_whole_triangle():
    c, s = np.meshgrid(np.arange(0, 100.5, 0.5), np.arange(0, 100.5, 0.5))
    inside = c + s <= 100
    classes = usda_texture(c[inside], s[inside])
    assert (classes != "").all()
    assert set(classes) == {"sand", "loamy sand", "sandy loam", "loam", "silt loam", "silt", "sandy clay loam",
                            "clay loam", "silty clay loam", "sandy clay", "silty clay", "clay"}


def test_fao_groups_and_texture_score():
    g = fao_texture_group(np.array([10, 20, 40, np.nan]), np.array([80, 40, 30, 50]))
    assert g.tolist() == ["coarse", "medium", "fine", ""]
    s = texture_score(g, {"M"}, {"M", "L"})  # almendro: óptima media; admisible media, ligera
    assert s[:3].tolist() == [ABSOLUTE_ONLY_SCORE, 1.0, 0.0] and np.isnan(s[3])
    assert texture_score(g, {"L", "M"}, {"W"})[:3].tolist() == [1.0, 1.0, ABSOLUTE_ONLY_SCORE]


# --- climatología y altitud -----------------------------------------------------------------------------
def test_lapse_rate_roundtrip_and_sign():
    assert LAPSE_C_PER_M == pytest.approx(0.0065)
    t0 = to_sea_level(np.array([10.0]), 1000)
    assert t0[0] == pytest.approx(16.5)
    assert from_sea_level(t0, 2000)[0] == pytest.approx(3.5)


def test_idw_exact_at_points_and_normalized():
    px, py = np.array([0.0, 1000.0]), np.array([0.0, 0.0])
    gx, gy = np.meshgrid([0.0, 500.0, 1000.0], [0.0])
    w = idw_weights(px, py, gx, gy)
    assert np.allclose(w.sum(axis=0), 1)
    assert w[:, 0, 0].tolist() == [1.0, 0.0] and w[:, 0, 2].tolist() == [0.0, 1.0]
    assert w[:, 0, 1].tolist() == pytest.approx([0.5, 0.5])


def test_grid_climate_lapse_correction():
    grid = Grid.from_bbox((-3.70, 37.70, -3.69, 37.71), 250)
    pts = [PointClimate(lon=lon, lat=lat, elevation=500.0, tmean=np.full(12, 15.0), tmin=np.full(12, 8.0),
                        tmax=np.full(12, 22.0), prec=np.full(12, 40.0), exmin=np.full(12, 1.0), annual_absmin=-3.0,
                        years=30) for lon, lat in [(-3.70, 37.71), (-3.69, 37.71), (-3.70, 37.70), (-3.69, 37.70)]]
    elev = np.full(grid.shape, 500.0)
    elev[0, 0] = 1500.0
    elev[1, 1] = np.nan
    gc = grid_climate(pts, grid, elev)
    assert gc.tmean[0, 2, 2] == pytest.approx(15.0)
    assert gc.tmean[0, 0, 0] == pytest.approx(15.0 - 6.5)
    assert gc.annual_absmin[0, 0] == pytest.approx(-9.5)
    assert gc.prec[0, 0, 0] == pytest.approx(40.0)  # sin corrección por altitud
    assert np.isnan(gc.tmean[0, 1, 1]) and np.isnan(gc.prec[0, 1, 1])


def test_summarize_daily_monthly_climatology():
    days = [dt.date(2001, 1, 1) + dt.timedelta(days=i) for i in range(365 * 2)]
    daily = {"time": [d.isoformat() for d in days],
             "temperature_2m_mean": [10.0 + (d.year - 2001) * 2 for d in days],
             "temperature_2m_max": [15.0] * len(days),
             "temperature_2m_min": [-(d.day % 3) - (d.year - 2001) * 2.0 for d in days],
             "precipitation_sum": [1.0 if d.month == 1 else 0.0 for d in days]}
    s = summarize_daily(daily)
    assert s["tmean"][0] == pytest.approx(11.0)
    assert s["prec"][0] == pytest.approx(31.0) and s["prec"][5] == 0.0
    assert s["exmin"][0] == pytest.approx((-2 - 4) / 2)
    assert s["annual_absmin"] == pytest.approx((-2 - 4) / 2) and s["years"] == 2


# --- ficha FAO ---------------------------------------------------------------------------------------
SHEET = """<h2>Olea europaea</h2><table>
<tr><th>Temperat. requir.</th><td>20</td><td>34</td><td>5</td><td>40</td><th>Soil texture</th><td>medium, light</td><td>wide</td></tr>
<tr><th>Rainfall (annual)</th><td>400</td><td>700</td><td>200</td><td>1200</td><th>Soil fertility</th><td></td><td></td></tr>
<tr><th>Soil PH</th><td>6</td><td>7</td><td>5.3</td><td>8.5</td><th>Soil drainage</th><td></td><td></td></tr>
<tr><th>Altitude</th><td>---</td><td>---</td><td>-</td><td>1200</td><th>Soil salinity</th><td></td><td></td></tr>
</table><table>
<tr><th>Killing temp. during rest</th><td>-10</td><th>Killing temp. early growth</th><td>no input</td></tr>
</table><table><tr><th>Product. system</th><td></td><th>Crop cycle</th><td>365</td><td>365</td></tr></table>"""


def test_parse_datasheet_codes_and_missing_values():
    p = parse_datasheet(SHEET)
    assert (p["TOPMN"], p["TOPMX"], p["TMIN"], p["TMAX"]) == (20, 34, 5, 40)
    assert (p["ROPMN"], p["ROPMX"], p["RMIN"], p["RMAX"]) == (400, 700, 200, 1200)
    assert (p["PHOPMN"], p["PHOPMX"], p["PHMIN"], p["PHMAX"]) == (6, 7, 5.3, 8.5)
    assert p["TEXT"] == "M L" and p["TEXTR"] == "W"
    assert p["KTMP_REST"] == -10 and p["KTMP"] is None  # «no input» → no se inventa
    assert (p["GMIN"], p["GMAX"]) == (365, 365) and p["_raw"]["name"] == "Olea europaea"
    assert p["ALTMAX"] == 1200 and p["ALTOPMN"] is None and p["ALTMIN"] is None  # «---»/«-» → sin dato


def test_requirement_classes_from_ecocrop_limits():
    assert trapezoid_classes(200, 400, 700, 1200, "mm") == {
        "optimal": "400–700 mm", "acceptable": "200–400 y 700–1200 mm", "unsuitable": "< 200 o > 1200 mm"}
    olive = texture_classes({"M", "L"}, {"W"})
    assert olive["optimal"].startswith("ligera") and "media" in olive["optimal"]
    assert olive["acceptable"].startswith("pesada") and olive["unsuitable"] == "ninguna"
    wheat = texture_classes({"M", "O"}, {"H", "M"})
    assert wheat["optimal"].startswith("media") and wheat["acceptable"].startswith("pesada")
    assert wheat["unsuitable"].startswith("ligera")


# --- tablas de aptitud de la UGR ------------------------------------------------------------------------
UGR_SLOPE = """<FORM><select><option>Clase S1</select></FORM>
<table width="674" border="1">
  <tr><td></td><td><div>S1</div></td><td>S2t</td><td>S3t</td><td>Nt</td></tr>
  <tr><td>Clase</td><td>1. Llana y 2. Suave</td><td>3. Inclinada</td><td>4. Moderada</td><td>5. Escarpada</td></tr>
  <tr><td><div align="center"><font size="3">%</font></div></td><td>&#8804; 8</td><td>&#8804; 16</td>
  <td>&#8804; 30</td><td>&gt; 30</td></tr>
</table>"""
UGR_PH = """<table><tr><td>S1</td><td>S2a</td><td>S3a</td><td>Na</td></tr>
<tr><td>6,0-8,1</td><td>5,6-5,9 y 8,2-8,3</td><td>5,2-5,5 y 8,4-8,9</td><td>&#8804;5,1 y &#8805;9,0</td></tr></table>"""
UGR_TEXT = """<table><tr><td></td><td>S1</td><td>S2x</td><td>S3x</td><td>Nx</td></tr>
<tr><td>Tipo</td><td>Favorable</td><td>Algo</td><td>Desfavorable</td><td>Muy</td></tr>
<tr><td>Clase</td><td>otras</td><td>franco arcillo arenosa, limo arenosa</td>
<td>arena, franco arenosa, arena franca, arcillosa y arcillo limosa estructurada</td>
<td>arcillosa y arcillo limosa masivas</td></tr></table>"""


def test_ugr_slope_classes_and_ratings():
    cells = ugr.class_cells(ugr.table_rows(UGR_SLOPE), "%")
    assert cells == ["≤ 8", "≤ 16", "≤ 30", "> 30"]
    cls, rating = ugr.numeric_rating(np.array([0.0, 8.0, 12.0, 30.0, 45.0, np.nan]), cells)
    assert cls[:5].tolist() == ["S1", "S1", "S2", "S3", "N"]
    assert rating[:5].tolist() == [1.0, 1.0, 0.725, 0.5, 0.2] and np.isnan(rating[5])
    assert ugr.classes_text(cells, "%")["unsuitable"] == "> 30 %"
    assert ugr.slope_degrees(100) == pytest.approx(45)


def test_ugr_ph_two_sided_rounded_to_table_precision():
    cells = ugr.class_cells(ugr.table_rows(UGR_PH), None)
    assert cells[0] == "6,0-8,1"
    cls, _ = ugr.numeric_rating(np.array([7.6, 8.14, 8.16, 8.5, 5.0, 9.2]), cells, decimals=1)
    assert cls.tolist() == ["S1", "S1", "S2", "S3", "N", "N"]


def test_ugr_carbon_without_n_class_uses_worst_declared():
    cells = ["≥ 1,0", "≥ 0,5", "< 0,5", "--"]
    cls, rating = ugr.numeric_rating(np.array([1.8, 0.7, 0.2]), cells, decimals=1)
    assert cls.tolist() == ["S1", "S2", "S3"]
    assert ugr.classes_text(cells, "%")["unsuitable"].startswith("—")


def test_ugr_texture_assumes_structured_soil():
    cells = ugr.class_cells(ugr.table_rows(UGR_TEXT), "Clase")
    mapping, unmapped = ugr.texture_classes(cells)
    assert mapping["sandy clay loam"] == "S2" and mapping["clay"] == "S3" and mapping["sand"] == "S3"
    assert "loam" not in mapping and unmapped == ["limo arenosa"]
    cls, rating = ugr.texture_rating(np.array(["clay loam", "clay", "sandy clay loam", ""], dtype=object), mapping)
    assert cls.tolist() == ["S1", "S3", "S2", ""] and np.isnan(rating[3])

