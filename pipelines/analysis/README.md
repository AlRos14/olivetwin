# pipelines/analysis — per-zone analysis cube (contract v1.3.0)

`build_analysis.py` downloads **real, open** data for the study areas (`jaen`, `toledo`) and
writes, per zone, an **analysis cube** conforming to
[`contracts/analysis.schema.json`](../../contracts/analysis.schema.json):

```
frontend/public/data/real/zones/<zone>/analysis/analysis.json
frontend/public/data/real/zones/<zone>/analysis/<variable>/<YYYYMMDDTHHMMSS | YYYYMMDD | static>.png
```

and links each cube from `frontend/public/data/real/manifest.json` (`zone.analysis`,
`schemaVersion: "1.3.0"`). It modifies nothing else in the manifest.

## Grid and encoding

- **Common grid** per zone in EPSG:3857: it starts from the NW corner of the zone `bbox`, with
  square cells of **250 m Web Mercator** (≈ 195–198 m ground at these latitudes),
  `width = ceil(Δx/250)`, `height = ceil(Δy/250)`. The exact extent is `width·250 × height·250` and
  `grid.bbox` is its WGS84 (somewhat larger than the zone to the east and south, < 250 m), so that
  the lat/lon → cell conversion on the client is exact. Jaén: 175 × 149 cells; Toledo: 303 × 252.
- **`png-uint8-linear`**: 8-bit grey PNG (`L` mode, no alpha or colour/gamma chunks) of the grid
  size; `value = offset + scale · code` for codes 0..254 (out-of-range values are clipped),
  **255 = no data**.
- The **`stats`** of each step are computed from the float values on the grid **before** quantisation
  (`validFraction` = valid cells / total).

| Variable | Unit | offset | scale |
|---|---|---|---|
| `soil-moisture-all`, `soil-moisture` | m³/m³ | 0 | 0.0025 |
| `radar-hh`, `radar-hv` | dB | −35 | 0.16 |
| `radar-hv-hh` | dB | −25 | 0.12 |
| `insar-coherence` | 1 | 0 | 1/254 |
| `ndvi`, `ndmi` | 1 | −1 | 2/254 |
| `elevation` | m | 0 | 10 |
| `slope` | ° | 0 | 0.25 |
| `soil-clay`, `soil-sand` | % | 0 | 0.4 |
| `soil-soc` | g/kg | 0 | 0.5 |
| `soil-ph` | pH | 3 | 0.03 |
| `climate-precip-annual` | mm | 0 | 10 |
| `climate-tmean-annual` | °C | 0 | 0.1 |
| `climate-tmin-coldest` | °C | −10 | 0.1 |
| `climate-tabsmin` | °C | −20 | 0.1 |
| crop rasters (`crops`) | 1 | 0 | 1/254 |

`1` is the dimensionless unit; the interface shows "dimensionless" when a variable uses it.
Annual amounts are totals in mm: the unit never carries a year denominator.

## Variables and sources

| id | What it is | Source | Licence / attribution |
|---|---|---|---|
| `soil-moisture-all` | "Surface soil moisture (NISAR SME2, all retrievals)": the same series, encoding, palette, range and resampling as `soil-moisture`, **without** the `retrievalQualityFlag` mask; only what the product does not estimate (`_FillValue` or values outside 0–1 m³/m³) remains without data. Each step indicates in `provenance.flaggedFractionOfValidCells` the fraction of cells with data that the product marks as "retrieval not recommended". It comes first in `variables`. | Same as `soil-moisture` | Same |
| `soil-moisture` | "Surface soil moisture (NISAR SME2, recommended quality)". Volumetric moisture of the top ~5 cm. **Complete** series of the same track/direction/frame (Jaén: track 87 ascending, frame 21, ~05:23 UTC; Toledo: track 95 descending, frame 68, ~19:09 UTC). Nearest neighbour. Pixels with **bit 0 of `retrievalQualityFlag` = 1** ("retrieval not recommended") are hidden. | NISAR L3 SME2 PROVISIONAL (`C2854344945-ASF`), full HDF5 from ASF | NASA ESDIS open data (CMR: `FreeAndOpenData`), cite doi:10.5067/NIL3SME2-P1 |
| `radar-hh`, `radar-hv` | gamma0 (not sigma0) in dB; mean in **linear power** per cell (≥ 50% of valid pixels) and then `10·log10`. Same dates as SME2. | NISAR L2 GCOV PROVISIONAL (`C2854338529-ASF`), clipping with NASA Harmony | NASA ESDIS guide (the collection does not declare `UseConstraints` in CMR), doi:10.5067/NIL2GCOV-P1 |
| `radar-hv-hh` | Cross-polarisation ratio HV − HH (dB) = `10·log10(HV/HH)` per cell. **It is not NDVI**: only a structure indicator. | Same as GCOV | Same |
| `insar-coherence` | HH coherence of a 12-day pair (2026-08-19 → 2026-08-31), per-cell mean of 80 m valid pixels according to the `mask` layer. | NISAR L2 GUNW PROVISIONAL (`C2854335566-ASF`), partial HTTP read of the HDF5 with `earthaccess` | NASA ESDIS, product doi 10.5067/NIL2GUNW-P1 |
| `ndvi`, `ndmi` | `(B08−B04)/(B08+B04)` and `(B8A−B11)/(B8A+B11)` over L2A reflectance with `BOA_ADD_OFFSET` (−1000 since baseline 04.00). SCL mask: classes 4 and 5 only. Mosaic of the MGRS tiles of the same pass; mean of valid subpixels with ≥ 50% valid per cell. One date per 14-day window (the tile with least cloud cover, ≤ 20%). | Sentinel-2 L2A on Microsoft Planetary Computer (`sentinel-2-l2a`), anonymous SAS signature | "Contains modified Copernicus Sentinel data 2026" (Copernicus legal notice) |
| `elevation`, `slope` | Mean altitude per cell; slope in degrees computed at 30 m in EPSG:25830 and averaged. Static (`date: null`). | Copernicus DEM GLO-30 (`cop-dem-glo-30`, Planetary Computer) | "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" |
| `soil-clay`, `soil-sand`, `soil-soc`, `soil-ph` | Thickness-weighted mean of the 0–5, 5–15 and 15–30 cm "mean" layers, ÷ 10 (SoilGrids conversion factor) → %, g/kg and pH. Static. | ISRIC SoilGrids 2.0 (official VRT/COG from files.isric.org, native grid) | CC BY 4.0, ISRIC; Poggio et al. (2021) doi:10.5194/soil-7-217-2021 |
| `precipitation`, `et0`, `temperature-max`, `temperature-min` series | Daily values at the grid centroid, 2026-06-01 → 2026-10-31. | Open-Meteo Historical Weather API, `era5_seamless` model (ERA5 + ERA5-Land) | CC BY 4.0 — Weather data by Open-Meteo.com (ERA5/ERA5-Land, Copernicus Climate Change Service) |
| `climate-precip-annual`, `climate-tmean-annual`, `climate-tmin-coldest`, `climate-tabsmin` | **1991–2020** climatology (WMO normal period), static: mean annual rainfall, mean annual temperature, mean minimum of the coldest month and mean of the annual absolute minima. See "Climatology". | Open-Meteo Historical Weather API, `era5_seamless`, daily series from 5 points per zone | CC BY 4.0 — Weather data by Open-Meteo.com (ERA5/ERA5-Land, Copernicus Climate Change Service) |
| `landcover-agri`, `landcover-olive` | Fraction of the cell with agricultural areas (CLC 2xx) and with olive groves (CLC 223). Static. See "Land cover". | CORINE Land Cover 2018 (EEA, Copernicus), ArcGIS REST vector service | © European Union, Copernicus Land Monitoring Service 2018, EEA; free and open access with attribution |
| `smap-soil-moisture` series | Daily zone mean (AM pass) of the 9 km cells whose centre falls in the grid, only with bit 0 of `retrieval_qual_flag` = 0. | SMAP SPL3SMP_E v006 (`C2938664763-NSIDC_CPRD`), clipping with Harmony (HOSS) | CMR `UseConstraints` text (free and open, cite NSIDC) |

All variables are published with `status: "processed_real"` and `provenance.approvedBy` equal to the
reviewer given with `--approved-by` (mandatory). Each step carries its provenance (scene/item
identifier, acquisition date, CRID, production-baseline notes such as `…_F_F_J_001`).

### Exploratory suitability index (retired)

The relative index with criteria and weights (`suitability` at the cube root) was retired on 2026-11-15 in favour of
crop suitability (`crops`). The pipeline no longer generates it; the field remains optional in the contract.

## Climatology (`climatology`)

- **Points**: the 4 corners and the centre of each zone's grid (5 points). Each point downloads the daily series
  1991-01-01 → 2020-12-31 of `temperature_2m_mean/max/min` and `precipitation_sum` (`era5_seamless` model). In the free API each point "costs" ~783 calls (10,958 days / 14); with the limit
  of 5,000/hour and 10,000/day, 5 points per zone were chosen and requests spaced 40 s, with retry
  after HTTP 429. Cache in `cache/climatology/<zone>/`.
- **Per point**: mean, minimum and maximum monthly temperatures; monthly rainfall (total of each month,
  averaged across years); absolute minimum of each month (interannual average); mean of the annual
  absolute minima.
- **Per cell**: **inverse distance (power 2)** interpolation in Web Mercator metres. Temperatures are reduced
  to sea level with **6.5 °C/km** using the elevation Open-Meteo declares for each point, then interpolated
  and returned to the mean cell altitude (Copernicus DEM, the same as
  `elevation`). Gradient: ICAO standard atmosphere (ICAO Doc 7488/3, 1993; ISO 2533:1975). Precipitation
  is **not** corrected for altitude.
- The monthly climatology per cell is not published; the crop model uses it.

## Crop suitability (`crops`)

Crops: `olivo` (*Olea europaea*), `almendro` (*Prunus dulcis*, in ECOCROP *Prunus amygdalus* Batsch.) and
`trigo` (rainfed wheat, *Triticum aestivum*). Rasters in
`analysis/crops/<crop>/suitability.png` and `<factor>.png` (0 = unsuitable, 1 = optimal; 255 = no data).
**Suitability = minimum of the factors** (law of the minimum). Interface classes: S1 ≥ 0.85, S2 0.60–0.85,
S3 0.40–0.60 and N < 0.40 (LUSET intervals: Yen et al., 2006; Selmy et al., 2024, *Agronomy* 14(11):2601,
table 3, CC BY 4.0); "suitable" = S1 + S2.

### Review of 2026-11-15 (owner decision, AlRos14)

The previous model (FAO ECOCROP only) gave Jaén less suitability for olive than Toledo. The diagnosis
was: (1) the Jaén box includes mountains (only 43% of its cells are flat and below 900 m); (2) ECOCROP
generic optima are not those of Mediterranean olive groves: mean monthly temperature 20–34 °C (it left
the climate of both zones at ~0.3), optimal pH 6–7 (it penalised calcareous soils) and medium/light texture
(it penalised clay-loam soils); (3) the slope ramp down to 0 at 30% was too harsh. This was
applied:

| Factor | Olive and wheat | Almond | Source |
|---|---|---|---|
| Climate | Total climate constraint factor from **FAO GAEZ v4** (theme 3, rainfed, low inputs, 1981–2010, ~9 km): `oliv200b_fc0`, `whea200b_fc0` | Temperature, frost and rainfall from ECOCROP (as before) | FAO and IIASA (2021); GAEZ does not include almond |
| pH | UGR `ph10` table (olive: S1 6.0–8.1; S2 5.6–5.9 and 8.2–8.3; S3 5.2–5.5 and 8.4–8.9; N ≤ 5.1 and ≥ 9.0) | UGR `ph10` table | University of Granada |
| Texture | UGR `text8` table (S1 "other"; olive S2 sandy clay loam; S3 sand, sandy loam, loamy sand and structured clays) | `text8` | University of Granada |
| Slope | UGR `pend1` table (olive and almond S1 ≤ 8%, S2 ≤ 16%, S3 ≤ 30%, N > 30%; wheat 6/12/30%) | `pend1` | University of Granada |
| Organic carbon | UGR `mateorg7` table (olive S1 ≥ 1.0%; almond and wheat ≥ 0.8%) | `mateorg7` | University of Granada |
| Altitude | Absolute maximum of the ECOCROP record (olive 1200 m; wheat 4500 m): 1 below, 0 above | — (no data) | FAO ECOCROP |

The UGR tables (Dorronsoro et al., "CambioUso", based on Sys et al., 1993, and FAO, 1976) are downloaded and
read as they are (`otanalysis/sources/ugr.py`, cache in `cache/ugr/`). **Project conventions**: score per
class S1 = 1, S2 = 0.725, S3 = 0.50 and N = 0.20 (midpoints of the LUSET intervals); pH and carbon are
rounded to one decimal as in the table; texture assumes structured soil (SoilGrids does not distinguish
"massive" clays); "sandy silt" has no USDA equivalent and is not applied; if carbon falls below all
classes with a value, it is assigned the worst declared one. Carbonates are not evaluated (there is no open layer).

**Result and reading.** With this model, over the agricultural area, the Toledo box (flat) has more
physical suitability for olive (99% suitable) than the Jaén box (53%), mainly because of slope; GAEZ itself gives
both an almost optimal climate for rainfed olive (0.95). It is a result of the physical suitability of each box, not
of its province: another, less steep Jaén box would come out different. Contrasting it with the provincial
yields of the MAPA yearbook was considered, but the owner decided not to use them (2026-11-15) because they describe the whole
province and not the compared box. No citable source of available soil water thresholds for
olive has been found (UGR only has drainage; SoilGrids 2.0 does not publish water retention), so that
factor has not been added.

### Ecocrop model (almond)

Almond keeps the Ecocrop model for climate (Hijmans et al., 2001; `dismo::ecocrop` 1.3-15;
Recocrop 0.4-2), with FAO record id 2397 (downloaded on 2026-11-15, `cache/ecocrop/fao/`): optimal mean monthly
temperature 12–35 °C (limits 10–40), lethal temperature −1 °C ("early growth") with the Recocrop ramp over
the extreme monthly minimum, optimal annual rainfall 600–900 mm (limits 250–1500), 6-month period
(round((150+240)/60)) with the best starting month. With 12 months its TMIN of 10 °C gave suitability 0 in 100% of
the cells (convention accepted by the owner); flowering frosts are not evaluated. FAO terms: study,
research and non-commercial purposes citing FAO (https://www.fao.org/contact-us/terms/en/).

`factor.variables` lists the published variables closest to what each factor uses; `parameters` details
the applied table row, the scores and the input variable; `classes` gives the intervals in text and
`reference` the source when it is not the ECOCROP record.

## Land cover (`landcover`)

`landcover-agri` and `landcover-olive`: fraction of each cell with agricultural areas (CLC 2xx classes) and with
olive groves (class 223) according to **CORINE Land Cover 2018** (EEA, Copernicus; ArcGIS REST service
`Corine/CLC2018_WM`, vector layer). Polygons are rasterised at 25 m and averaged to 250 m. The
Compare tab computes suitability only in cells with at least 50% agricultural area; `landcover-olive` can be
viewed as a layer in Layers and Analysis. Licence: free, full and open access with attribution.

## Unavailable sources (`unavailable`)

| id | Reason |
|---|---|
| `yield-validation` | The repository has no parcel-level yield data with a compatible licence; provincial or municipal statistics do not allow validating 250 m variables in two zones. |
| `los-displacement` | GUNW granules exist, but they are not published: the unwrapped phase is relative per connected component and requires a stable reference point, validated ionospheric/tropospheric corrections and confirming the sign convention. (The product's centre frequency, read from the HDF5, is 1.229 GHz → λ ≈ 0.2439 m.) |

If a source fails in a run, its ids are added to `unavailable` with the literal error, unless
a previous valid version already existed in the cube (in that case it is kept and a warning is shown).

## Installation

```bash
python3 -m venv pipelines/analysis/.venv
# if ensurepip is missing: python3 -m venv --without-pip … && pipelines/analysis/.venv/bin/python -m ensurepip --upgrade
pipelines/analysis/.venv/bin/pip install -r pipelines/analysis/requirements.txt
```

NASA Earthdata credentials: `~/.netrc` (`machine urs.earthdata.nasa.gov`). The code never reads
or logs them: `requests`, `harmony-py` and `earthaccess` take them on their own. Planetary Computer,
ISRIC and Open-Meteo do not require credentials.

## Usage

```bash
# All sources, both zones (writes to frontend/public and updates the manifest)
pipelines/analysis/.venv/bin/python pipelines/analysis/build_analysis.py --zone all --approved-by AlRos14

# Only some sources / skip others (the other cube variables are kept)
pipelines/analysis/.venv/bin/python pipelines/analysis/build_analysis.py --zone jaen --only s2,dem --approved-by AlRos14
pipelines/analysis/.venv/bin/python pipelines/analysis/build_analysis.py --zone all --skip gunw,smap --approved-by AlRos14

# Dry run outside the app (unversioned staging/ directory), without touching the manifest
pipelines/analysis/.venv/bin/python pipelines/analysis/build_analysis.py --zone all --approved-by AlRos14 \
  --public-dir pipelines/analysis/staging/public --no-manifest
```

Sources: `sme2`, `gcov`, `s2`, `dem`, `soil`, `climate`, `climatology`, `gunw`, `smap`, `crops`
(`climatology` and `crops` use the `dem` and `soil` caches). Re-running is idempotent:
each source replaces its variables/series (and deletes its stale PNGs) without duplicating anything. The cube is
validated against the schema (Draft 2020-12) and the PNGs are checked (`L` mode, grid size, no
alpha) before updating the manifest. Afterwards it is advisable to run `npm run validate:data` in `frontend/`.

`sanity_checks.py` (offline) compares the SME2 moisture of the grid with the visualisation PNGs already
published (cell by cell), and checks relief (mountains south of Jaén), NDVI in urban areas and the
NDVI–HV correlation; in addition, temperature versus altitude, the distribution of suitability and the limiting
factor per crop, and sensitivity to the discarded variants.

## Translations of data strings

Every free-text field written by the pipeline (variable titles and descriptions, caveats, provenance
notes, legend labels, crop requirements and the reasons in `unavailable`) is authored in Spanish. The
English rendering used by the interface lives next to the data in
`frontend/public/data/real/i18n/en.json` and is applied by `dataText()`.

After regenerating the cube:

1. List or write the missing entries from the repository root:
   `npm run i18n:data --prefix frontend -- --write` (or, from `frontend/`,
   `npm run i18n:data -- --write`).
2. Translate the new entries in `frontend/public/data/real/i18n/en.json`.
3. Run `npm run validate:data`, which reports data strings without an English entry.

## Cache

Everything downloaded is stored in `pipelines/analysis/cache/` (ignored by Git): full SME2 HDF5
(~128 MB each), Harmony GCOV/SMAP clippings, Sentinel-2 mosaics by date (`.npz`), reprojected
DEM, SoilGrids layers, GUNW window, Open-Meteo responses (including the 1991–2020 series in
`cache/climatology/`) and the ECOCROP records and the Recocrop table (`cache/ecocrop/`). A second run does not
download again. Deleting a subfolder forces its download.

## Limitations

- **SME2 and GCOV are PROVISIONAL**: not fully calibrated or validated. The SME2 series includes one
  scene with a different production baseline (`…_F_F_J_001`, 2026-07-14), annotated in its step.
- **SME2 quality mask**: in Jaén it hides ~2/3 of the pixels with an estimate (almost all with
  class 1 of `ancillaryData/landCover`, whose legend the file does not document); in Toledo, a
  much smaller fraction. Coverage without and with the mask is shown in each step. In the 2026-11-15 run the
  hidden cells had, on average, more NDVI, more HV and more slope than the kept ones (that is,
  the published moisture describes mainly the least wooded areas); the moisture criterion of the suitability
  index only covers those cells. By owner decision `soil-moisture-all` (without the
  mask) is also published: the cells that only appear in that variant are 64% of the Jaén grid and 7% of
  the Toledo grid (with data on some date) and have on average more NDVI, HV and slope (`sanity_checks.py`). The
  suitability index still uses `soil-moisture` (recommended quality); the crops do not use moisture.
- The manifest's `soil-moisture` visualisation layer **has not** been extended with the new dates:
  a test with `pipelines/nisar/sme2_to_overlay.py` on a copy regenerated the
  three already published PNGs differently and extended the Jaén zone `bbox`, so it was discarded.
- In Toledo frame 68 does not cover the whole zone since August (≈ 80% of cells with data).
- On 2026-09-24 Jaén was acquired in `SHSH` mode (no HV): that day there is only `radar-hh`.
- Radar does not measure production or vigour; NDVI/NDMI are optical (Sentinel-2), not NISAR; surface soil
  moisture is not the same as irrigation needs; SoilGrids is a modelled product.
- SCL may leave residual clouds/shadows; date selection uses per-tile cloud cover.
- The DEM is a surface model (it includes canopies and buildings).
- The climate is a reanalysis at a single point (centroid), not a local station.

## Tests

```bash
cd pipelines/analysis && env -u PYTHONPATH PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/python -m pytest -q tests
```

Offline. They cover the grid (dimensions, exact extent, lat/lon → cell), encoding (round trip
within half a scale, clipping, grey PNG without alpha), statistics, linear-power averaging and valid-subpixel
threshold, idempotent cube merging (no duplicates, stale PNGs, preservation on
failures), manifest update (only `schemaVersion` and `zone.analysis`) and utilities of each
source (BOA offset, NDVI, date selection, thickness-weighted mean, slope, GUNW mask, SMAP mean),
and the crop model: trapezoid, lethal temperature rule, period length, starting-month
search, USDA class and FAO group, texture score, altitude correction, IDW, monthly climatology and
reading of the FAO record (with "no input" → no value).
