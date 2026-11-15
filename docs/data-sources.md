# Data sources, software and licences

Licence audit of OliveTwin (2026-11-15). Goal: to check that everything the
project uses is **open source or can be used for research**, as
the challenge requires ([`challenge.md`](challenge.md#other-resources-licence-policy)).
The mandatory attributions are recorded in [`NOTICE`](../NOTICE).

## Result

| Category | Verdict |
|---|---|
| Data published in `frontend/public/data/` | ✅ All open or free to use with attribution. |
| Crop requirements and reference models | ✅ Use in research allowed. ⚠️ FAO ECOCROP and FAO GAEZ: **non-commercial uses only**. ⚠️ UGR tables: no explicit licence. |
| Map services at runtime | ✅ Use allowed with attribution (visible on the map). |
| Software dependencies (npm and Python) | ✅ All with open source licences (OSI). |
| Optional AI model (Gemma via Ollama) | ⚠️ Not an OSI licence, but it allows research; it is not distributed with the project. |

**Conclusion:** OliveTwin complies with the challenge policy for **research and non-commercial
use**. It must not be used for commercial purposes without replacing FAO ECOCROP and
FAO GAEZ (or asking FAO for permission). The project's own code is Apache-2.0
([`LICENSE`](../LICENSE)); the data licences remain those of each
source.

## 1. Data published in the application

They are in `frontend/public/data/real/` (manifest and analysis cubes for Jaén and
Toledo). Each variable carries its provenance and licence in the JSON itself
(`provenance.license`).

| Data (id in the cube) | Source | Provider | Licence / conditions | Mandatory attribution |
|---|---|---|---|---|
| NISAR soil moisture (`soil-moisture`, `soil-moisture-all`) and manifest layer | NISAR L3 SME2 (PROVISIONAL) | NASA/JPL–ISRO, ASF DAAC | NASA ESDIS open data, no restrictions ([Data Use Guidance](https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance)) | Acknowledge NASA and cite the product (doi:10.5067/NIL3SME2-P1) |
| HH, HV and HV/HH radar (`radar-hh`, `radar-hv`, `radar-hv-hh`) | NISAR L2 GCOV (PROVISIONAL) | NASA/JPL–ISRO, ASF DAAC | NASA ESDIS open data | Cite doi:10.5067/NIL2GCOV-P1 |
| Radar coherence (`insar-coherence`) | NISAR L2 GUNW (PROVISIONAL) | NASA/JPL–ISRO, ASF DAAC | NASA ESDIS open data | Cite doi:10.5067/NIL2GUNW-P1 |
| SMAP moisture (`smap-soil-moisture` series) | SMAP SPL3SMP_E v006 | NASA, NSIDC DAAC | Free, open and unrestricted when citing the product | Recommended NSIDC citation |
| NDVI and NDMI (`ndvi`, `ndmi`) | Sentinel-2 L2A | ESA Copernicus, via Microsoft Planetary Computer | Free, full and open access (Commission Delegated Regulation (EU) 1159/2013) | "Contains modified Copernicus Sentinel data 2026" |
| Elevation and slope (`elevation`, `slope`) | Copernicus DEM GLO-30 | ESA/EU (DLR, Airbus), via Planetary Computer | Free worldwide Copernicus DEM licence | WorldDEM-30 text © DLR and © Airbus (see NOTICE) |
| Clay, sand, organic carbon and pH (`soil-*`) | SoilGrids 2.0 | ISRIC – World Soil Information | **CC BY 4.0** | ISRIC; Poggio et al. (2021) |
| Daily weather and 1991–2020 climatology (series and `climate-*`) | Open-Meteo Historical Weather API (ERA5/ERA5-Land) | Open-Meteo; Copernicus C3S/ECMWF | **CC BY 4.0** | "Weather data by Open-Meteo.com"; Copernicus C3S |
| Agricultural surface and olive grove (`landcover-agri`, `landcover-olive`) | CORINE Land Cover 2018 | EEA, Copernicus Land Monitoring Service | Free, full and open access with attribution | "© European Union, Copernicus Land Monitoring Service 2018, EEA" |
| Crop suitability maps (`crops`) | OliveTwin's own computation | — | Apache-2.0 (code); inherits the conditions of its inputs (below) | Those of the sources in section 2 |

## 2. Crop requirements and reference models

They are used to compute suitability; their values appear on the maps and in the
interface (optimal, acceptable and unsuitable bands).

| What is used | Source | Licence / conditions | Notes |
|---|---|---|---|
| Crop requirements (temperature, frost, rainfall, altitude; olive, almond, wheat) | FAO ECOCROP | FAO terms of use: study, **research** and **non-commercial** purposes, citing FAO | ⚠️ Non-commercial. Accepted by the owner. |
| Climate factor for olive and wheat | FAO and IIASA, GAEZ v4 (theme 3, rainfed, low inputs) | FAO terms of use; FAO databases are CC BY 4.0 unless otherwise indicated | ⚠️ GAEZ does not declare its own licence in its metadata: FAO terms apply (they allow research). |
| pH, texture, slope and organic carbon classes | University of Granada, "CambioUso" (Dorronsoro et al.), based on Sys et al. (1993) and FAO (1976) | Public teaching resource, **without an explicit licence** | ⚠️ Cited with full attribution. It is advisable to ask the authors for confirmation before use outside research. |
| S1/S2/S3/N class bands (85/60/40) | LUSET (Yen et al., 2006), reproduced in Selmy et al. (2024), *Agronomy* 14(11):2601 | **CC BY 4.0** | — |
| USDA texture classes | USDA Soil Survey Manual (Handbook 18, 2017) | Work of the U.S. Government, public domain | — |
| Ecocrop model contrast | `ecocrop.rds` table of the R package Recocrop 0.4-2 | GPL ≥ 3 | It is only downloaded to the pipeline's local cache for comparison; it is not redistributed. |

## 3. External services loaded by the browser

They are not downloaded or stored: the map requests them live and shows their attribution.

| Service | Provider | Conditions | Compliance |
|---|---|---|---|
| Satellite view and Parcels view (PNOA orthophoto) | IGN/CNIG | **CC BY 4.0** (declared in the service: "CC BY 4.0 scne.es") | Attribution "PNOA cedido por © IGN" on the map |
| SIGPAC parcels (Parcels view) | Fondo Español de Garantía Agraria (FEGA) | The WMS service declares `AccessConstraints: none` and `Fees: none` | Attribution to FEGA on the map |
| General view | OpenStreetMap | ODbL data; [tile usage policy](https://operations.osmfoundation.org/policies/tiles/): visible attribution, no bulk downloads | Attribution "© OpenStreetMap contributors"; no tile preloading |
| AI interpretation (optional) | The endpoint configured by the user (by default, local Ollama) | That of the chosen model | See section 5 |

## 4. Software

| Component | Licences | Notes |
|---|---|---|
| Frontend, direct dependencies | Vue 3 (MIT), Leaflet (BSD-2-Clause), Ajv and ajv-formats (MIT), Vite, Vitest, vue-tsc, jsdom, pngjs (MIT), TypeScript (Apache-2.0) | Ajv is in `devDependencies` but is included in the bundle to validate the data. |
| Frontend, all installed dependencies (≈ 140) | MIT, ISC, BSD-2/3-Clause, Apache-2.0, BlueOak-1.0.0, MIT-0, CC0-1.0, MPL-2.0 | MPL-2.0 only in `lightningcss`, a build tool that is not distributed. |
| Analysis pipeline (Python, direct) | numpy, rasterio, affine, h5py, shapely (BSD-3-Clause); pyproj, earthaccess, jsonschema, pytest, rdata, rfc3339-validator (MIT); pillow (MIT-CMU); requests and harmony-py (Apache-2.0) | `harmony-py` is NASA software under Apache-2.0. |
| Pipeline, transitive dependencies | MIT, BSD, Apache-2.0, PSF-2.0, MPL-2.0 (`certifi`, `tqdm`) | All open source. |
| E2E test browsers | Playwright (Apache-2.0) | Outside the repository (external harness). |

## 5. Language model (optional)

AI interpretation is optional and the model is **not part of the
repository**: each user installs and runs it. The default configuration
uses Ollama (MIT) with `gemma3:4b`, subject to Google's Gemma Terms of Use.
It is not an OSI open source licence, but it allows use
in research under its prohibited use policy. Any
other model compatible with the OpenAI API can be used.

## 6. Discarded sources

| Source | Reason |
|---|---|
| Provincial yields from the MAPA Yearbook | Valid licence (Ley 37/2007), but the owner decided not to use them (2026-11-15): they describe the province, not the compared box. |
| Climate tables of Sys et al. (1993) | No openly accessible copy that can be cited. |
| Available soil water (SoilGrids) | SoilGrids 2.0 does not publish water retention maps; there are no citable thresholds for the olive tree. |
| NISAR GUNW displacement | Not published: it requires validated reference and corrections (see `unavailable` in the cube). |

## 7. Recommendations

1. **Before any commercial use**, replace FAO ECOCROP and FAO GAEZ or
   ask FAO for permission.
2. **Confirm with the authors** of the University of Granada tables the
   use of their classes in a public application.
3. **Keep the attributions** visible on the map and in [`NOTICE`](../NOTICE).
   If a source is added, add it here and in NOTICE in the same change.
4. **NISAR SME2, GCOV and GUNW are PROVISIONAL products**: their licence is
   open, but they must be presented as such.
