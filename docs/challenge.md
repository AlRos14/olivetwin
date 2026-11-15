# NASA Space Apps Challenge 2026 — "Dancing with the SARs"

OliveTwin is developed for this NASA Space Apps Challenge 2026 challenge:

- **Official challenge page:**
  <https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/>

Anyone or any agent working in the repository must keep the challenge in mind
and prioritise the resources on this page. The rules, requirements and evaluation
criteria are those published on the official page; the summary below is
a working reference and does not replace it.

> **Provenance:** the statement and the resources were provided by the team from
> the official challenge page (recorded on 2026-11-15). The page could not be
> downloaded automatically from the working environment, so it is worth
> checking it against the official website in case it changes. According to the page, more
> resources may be added before the hackathon.

## Challenge statement (summary)

**Challenge:** build an **interactive application** that uses radar data from the
**NISAR** mission (NASA-ISRO Synthetic Aperture Radar) to **track and
visualise one or more types of change on the Earth's surface** in locations
around the world. Some examples are wetlands and floodplains, forest
loss from deforestation or fires, changes in crops and their condition,
soil moisture, glaciers and sea ice, and ground deformation from
earthquakes or subsidence.

**Technical context given by the statement:**

- SAR is **active** microwave remote sensing: it emits its own pulse and
  observes day and night and through clouds. It "synthesises" a long antenna
  by combining successive acquisitions to gain spatial resolution.
- The radar signal is sensitive above all to **roughness** and to the **dielectric
  constant**. Backscatter in different
  **polarisations** informs about structure, geometry and material; the high
  dielectric constant of water highlights water bodies, floods and
  **soil moisture**. SAR also measures displacements at the centimetre
  scale (earthquakes, subsidence).

**Desired outcome:** an **open source** and easy-to-use solution that translates
complex radar observations into useful information for scientists, managers,
educators, decision-makers and the general public, showing the patterns
and rates of the surface at different time steps. Visualisations such as
interactive change-detection maps, time-series animations or dashboards are encouraged.

**Steps proposed by the challenge:**

1. Choose an interesting study area.
2. Download openly accessible NISAR data with the listed resources, and, if
   desired, complementary data (optical images, GIS layers) for
   context.
3. Present the findings in an interactive digital medium (report, video,
   presentation, *story map*…) and **formulate hypotheses about the physical
   factors** behind what is (or is not) seen in the SAR data: which
   polarisations highlight the changes and which future NISAR applications
   are possible.

**Optional considerations** (not mandatory):

- Analyse NISAR with different polarisations or frequencies (also from other
  sensors), several dates for a time series and auxiliary data
  (population, vegetation type…).
- Show how human factors (agriculture, industry…) affect
  natural resources.
- Tell a compelling story with data visualisations.
- Provide context and personal stories if the study area is known.
- Make the summary interactive (image sliders, web maps…).

## How OliveTwin fits the challenge

Comparison with the current state of the repository (see [`README.md`](../README.md)).
Future lines are options, not commitments or results.

| Challenge element | Status in OliveTwin |
|---|---|
| Interactive application with NISAR data | Covered: web map with NISAR SME2, GCOV and GUNW; Layers, Analysis, Twins and Story tabs. |
| Type of surface change | Surface soil moisture in agricultural areas (olive grove). |
| Study area | Jaén and Toledo (Spain). |
| Time series | Covered: ~10 NISAR dates and 11 Sentinel-2 dates per zone (Jun–Oct 2026), charts with daily rainfall and a change map between two dates. |
| Complementary data (optical, GIS) | Covered: Sentinel-2 NDVI/NDMI, elevation and slope (Copernicus DEM), soil (SoilGrids), climate (Open-Meteo/ERA5) and SMAP for contrast. |
| Polarisations / backscatter | Covered: GCOV HH, HV and the HV−HH ratio, and InSAR coherence from a GUNW pair. The InSAR displacement is not published (no validated corrections). |
| Human factors (agriculture) | This is the axis of the project (olive groves). Crop suitability maps (olive, almond, rainfed wheat) with FAO ECOCROP requirements; not validated against harvests. |
| Hypotheses about physical factors | Covered: Story tab (formulated as questions) and interpretation with a language model based on the computed statistics (change over time, possible causes and implications for the crop). |
| Open source solution | Covered: public code under [Apache-2.0](../LICENSE) (OSI licence, attribution required through [`NOTICE`](../NOTICE)). |
| Presentation / storytelling | Partial: interactive story in the app (Story + Twins). The delivery video or slides are missing. |

## NASA notice

> *NASA does not endorse any non-U.S. Government entity and is not responsible
> for information contained on non-U.S. Government websites. For non-U.S.
> Government websites, participants must comply with any data use parameters of
> that specific website.*

## NASA resources

| Resource | What it is for |
|---|---|
| [NASA Earthdata Search](https://search.earthdata.nasa.gov/search) | Discover, search, compare, visualise and access NASA Earth science data. |
| [ASF Data Search Vertex](https://search.asf.alaska.edu/) | NASA archive of SAR data, operated by the Alaska Satellite Facility (ASF) for the ESDIS project. |
| [NISAR Data User Guide](https://nisar-docs.asf.alaska.edu/) | ASF guide to accessing and working with NISAR data. |
| [Intro to Remote Sensing](https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/remote-sensing) | Remote sensing basics: instruments, resolution types and processing. |
| [Intro to Synthetic Aperture Radar (SAR)](https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar) | SAR basics: frequency and wavelength, polarisation and scattering mechanisms. |
| [NASA ARSET Trainings](https://appliedsciences.nasa.gov/get-involved/training) | Training for beginners and advanced users (agriculture, water resources, disasters…), with introductory material on remote sensing, SAR and NISAR in English and Spanish. |
| [NISAR StoryMaps](https://nisar.jpl.nasa.gov/applications/arcgis-storymaps/) | Interactive StoryMaps on SAR applications: floods, fires, subsidence, oil spills and glaciers. |
| [NISAR Applications White Papers](https://nisar.jpl.nasa.gov/applications/societal-benefit/) | Two-page summaries on NISAR applications with societal benefit. |
| [UAVSAR Postcards](https://uavsar.jpl.nasa.gov/education/postcards.html) | False-colour composites of airborne UAVSAR data. |

## Resources from partner space agencies

### CSA (Canadian Space Agency)

| Resource | What it is for |
|---|---|
| [RADARSAT Constellation Mission (RCM) — Data](https://donnees-data.asc-csa.gc.ca/en/dataset/rcm) | Canadian constellation of three radar satellites (day/night, any weather); includes ecosystem and agriculture monitoring. |
| [Synthetic Aperture Radar Python Tutorial](https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial) | Tutorial for working with SAR images with Python and QGIS: access and visualisation. |
| [RADARSAT-1 — Data](https://donnees-data.asc-csa.gc.ca/en/dataset/radarsat1) | Canadian RADARSAT-1 archive (launched in 1995), published under an open licence. |

### CONAE (National Commission for Space Activities, Argentina)

| Resource | What it is for |
|---|---|
| [SAOCOM Catalogue](https://catalogos.conae.gov.ar/catalogo/catalogoSatSaocomInfo.html) | SAOCOM SAR mission catalogue and information: registration, download and processing tutorials. |
| [SAOCOM Catalogue Registration](https://www.argentina.gob.ar/noticias/la-informacion-saocom-cada-vez-mas-accesible) | Registration protocol to access the catalogue with the ONE CLICK profile. |

## Other resources: licence policy

The audit of the sources and licences used by OliveTwin is in
[`data-sources.md`](data-sources.md).

In addition to the resources above, **any resource (data,
software, models or documentation) that is open source / open data or whose
licence allows its use in research may be used**.

- **Allowed:** open licences (for example, free software or open data
  licences) and licences that expressly authorise use in research.
- **Not allowed:** resources subject to a **commercial licence** (paid or
  proprietary licences that do not authorise use in research).
- When in doubt about a licence, the resource is not incorporated until clarified
  with the repository owner.

This policy does not relax the repository rules
([`AGENTS.md`](../AGENTS.md) and [`docs/contributing.md`](contributing.md)):

- every incorporated resource must have **verifiable licence and provenance**,
  and its attribution when the licence requires it;
- on websites that are not U.S. Government sites, the data use parameters of that
  site must be complied with (NASA notice);
- the accounts or registrations required by some catalogues (for example, SAOCOM
  ONE CLICK or Earthdata Login) are personal: **no credentials,
  tokens or secrets are versioned**;
- HDF5, GeoTIFF, NetCDF or other large scientific binaries are not versioned;
- the scientific limits of the project remain in force (radar does not measure
  production, NDVI is not NISAR and surface soil moisture is not irrigation).
