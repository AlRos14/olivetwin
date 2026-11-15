# Scientific handoff: adding a real zone without touching Vue

This guide explains how the scientific team incorporates a zone with **real**
data into OliveTwin. The goal is that adding a PNG and metadata is
sufficient: **Vue components, types, services and the loader are not modified**.

The application publishes **real data only** (product decision of
2026-11-14): `frontend/public/data/real/manifest.json` declares Jaén and Toledo with
three dates each, and there is no mode selector or sample data in the
demo. The contract keeps `datasetMode: "sample"` for fixtures and tests, but
the application does not load it.

A real layer appears in the demo only if it meets contract v1.2.0 and has
passed validation and scientific review. v1.1.0 manifests without a time
series remain valid; to publish several dates, `timeSteps` and
`schemaVersion: "1.2.0"` are used (§3.1).

## 0. Scientific limits that cannot be crossed

- **Radar does not measure production directly.** NISAR provides observations
  (for example estimated surface soil moisture) that require interpretation and
  validation; they do not by themselves demonstrate an agronomic cause or kg/ha.
- **NDVI is an optical index, not a NISAR product.** It may come from Landsat or
  Sentinel-2. It is not labelled as radar or as NISAR.
- **SME2 surface soil moisture is not irrigation.** It estimates moisture in the surface
  layer of the soil; it is not equivalent to deep moisture or to an irrigation dose,
  and its resolution limits its use to sufficiently large plots.
- **The PNG is a visual representation.** Its colours do not allow exact
  scientific values to be recovered or per-pixel queries to be made.
- **Synthetic data are not NASA observations.** They are not assigned an invented
  date, scene or mission.

## 1. Requirements of the scientific deliverable

Before touching the repository, the scientific team must have:

1. An authorised and verifiable source (product, scene, date, processing
   version and reference URL).
2. Reviewed geometry: CRS, extent, orientation and nodata pixels.
3. Units and scale checked against the product documentation.
4. A quality note explaining limitations and maturity.
5. A reviewing person who approves the result. **Approval is human**;
   an agent cannot approve its own scientific work.

## 2. Step 1 — export the PNG

| Requirement | Detail |
|---|---|
| Format | PNG with alpha channel: RGBA, grey+alpha or palette with `tRNS`. |
| Presentation CRS | **EPSG:3857 (Web Mercator)**. It is the only one admitted in v1.2.0. |
| Orientation | **North up**: the first pixel row is the northern edge. |
| Extent | Exactly that of `layer.bbox`. The PNG does not store coordinates; the position is provided by the JSON. |
| Nodata pixels | **Alpha 0**, with RGB at 0. "No data" is not painted as an opaque value 0. |
| Reprojection | Document the method. For discrete values or to avoid inventing values, nearest neighbour. |
| Size | Optimised; indicative target < 1 MB per PNG. |
| Palette | The manifest legend must reproduce the actual palette of the PNG. |
| No screenshots | A cropped screenshot without georeferencing is not accepted. |

The layer's `bbox` is computed from the **exact corners of the raster in
EPSG:3857**, reprojected to WGS84. It is not estimated "by eye" by looking at the map.

`bbox` order in the JSON: `[west, south, east, north]`, WGS84 degrees. Leaflet
receives it as `[[south, west], [north, east]]`, but **the JSON is not reordered**.

If the PNG covers less than the study area, `layer.bbox` may be smaller than
`zone.bbox`; it must stay inside it with a maximum tolerance of `0.01°`.

## 3. Step 2 — complete the metadata

> Free-text values in the data files (names, descriptions, notes, legend labels) are written in
> Spanish, the source language of the data, and translated for the English interface in
> `frontend/public/data/real/i18n/en.json` (see [`contributing.md`](contributing.md#translations)).

The complete real manifest has this shape. It is a **template**: the values
between `<...>` must be replaced with verifiable data. While the
placeholders are left, `validate:data` will reject the manifest, and that is intentional.

```json
{
  "schemaVersion": "1.1.0",
  "datasetMode": "real",
  "appTitle": "OliveTwin",
  "zones": [
    {
      "id": "zone-name",
      "name": "Readable zone name (Spanish, the data language)",
      "description": "What the area is, how it was delimited and what must not be inferred from the layer.",
      "bbox": [-4.00, 37.50, -3.90, 37.60],
      "layers": [
        {
          "id": "soil-moisture",
          "title": "Humedad superficial (NISAR SME2)",
          "kind": "image-overlay",
          "variable": "soil_moisture",
          "image": "data/real/zones/zone-name/soil-moisture.png",
          "bbox": [-3.99, 37.51, -3.91, 37.59],
          "imageCrs": "EPSG:3857",
          "unit": "m³/m³",
          "range": [0, 0.6],
          "legend": [
            { "value": 0, "color": "#ffffd9", "label": "Más seco" },
            { "value": 0.15, "color": "#c7e9b4", "label": "0.15 m³/m³" },
            { "value": 0.3, "color": "#41b6c4", "label": "0.30 m³/m³" },
            { "value": 0.45, "color": "#225ea8", "label": "0.45 m³/m³" },
            { "value": 0.6, "color": "#081d58", "label": "Más húmedo" }
          ],
          "status": "processed_real",
          "provenance": {
            "provider": "<actual product provider>",
            "product": "<product, version and variable>",
            "acquisitionDate": "<YYYY-MM-DD or ISO 8601 date-time with time zone>",
            "sceneId": "<scene or product identifier>",
            "processingVersion": "<processing version or CRID>",
            "referenceUrl": "<https://... verificable>",
            "note": "AOI crop, reprojection, scale and any relevant limitation.",
            "maturity": "<PROVISIONAL | VALIDATED | BETA, si aplica>",
            "approvedBy": "<approver name and date>"
          },
          "qualityNote": "Quality and maturity limitations; what must not be concluded from this layer."
        }
      ]
    }
  ]
}
```

Completion notes:

- Zone `id`: kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) and unique.
- Layer `id`: only `"ndvi"` or `"soil-moisture"` in v1.2.0. No new
  identifiers are invented.
- `image`: relative to `frontend/public/`, under `data/real/`, without a leading `/`,
  without `..`, without `:` or `\`.
- `range` and `legend` must be consistent with the PNG scale. The legend is
  sorted by strictly increasing `value` and has at least two stops.
- `status`: `"processed_real"` only after scientific approval.
- `provenance.acquisitionDate`, `sceneId` and `referenceUrl` are **mandatory and
  non-null** for `processed_real`.
- `provider`, `product`, `processingVersion` cannot be empty.
- `maturity`, `crid` and `approvedBy` are extensions admitted within
  `provenance`; no new properties are added outside `provenance` without
  changing the contract.
- Dates, scenes or URLs from the documentation or from another product are not copied:
  each layer declares its own provenance.

The fixture
[`frontend/scripts/fixtures/valid/real-with-processed-real.json`](../frontend/scripts/fixtures/valid/real-with-processed-real.json)
is a **contractual** example that validates the `processed_real` status, but it is not
a scientific observation and **is not copied to `public/data/real/`**.

### 3.1 Several dates: `timeSteps` (v1.2.0)

If the product has a time series, declare **all** the steps in
`layer.timeSteps`, in order from oldest to most recent. Unit, `range`,
`legend` and `status` are common to all steps: do not change the scale between
dates or the visual comparisons will be misleading.

Requirements:

- `schemaVersion: "1.2.0"` in the manifest.
- Each step has a real ISO 8601 `date` (date or date-time with time zone), `image`,
  `bbox` and, optionally, `label` and partial `provenance`.
- **Strictly increasing** dates, without duplicates.
- Each step's `image` is an RGBA PNG in EPSG:3857 under `data/real/` and its
  `bbox` falls within `zone.bbox`.
- `layer.image` and `layer.bbox` must be those of the **last** step.
- In `processed_real`, the effective provenance
  `{ ...layer.provenance, ...step.provenance }` of each step must include
  `acquisitionDate`, `sceneId` and `referenceUrl`. If a step has no verifiable scene or
  URL, it is not published as `processed_real`.

```json
{
  "schemaVersion": "1.2.0",
  "datasetMode": "real",
  "appTitle": "OliveTwin",
  "zones": [
    {
      "id": "zone-name",
      "name": "Readable zone name (Spanish, the data language)",
      "bbox": [-4.0, 37.5, -3.9, 37.6],
      "layers": [
        {
          "id": "soil-moisture",
          "title": "Humedad superficial (NISAR SME2)",
          "kind": "image-overlay",
          "image": "data/real/zones/zone-name/soil-moisture-2026-03-15.png",
          "bbox": [-4.0, 37.5, -3.9, 37.6],
          "imageCrs": "EPSG:3857",
          "unit": "m³/m³",
          "range": [0, 0.6],
          "legend": [
            { "value": 0, "color": "#ffffd9", "label": "Más seco" },
            { "value": 0.3, "color": "#41b6c4", "label": "0.30 m³/m³" },
            { "value": 0.6, "color": "#081d58", "label": "Más húmedo" }
          ],
          "status": "processed_real",
          "provenance": {
            "provider": "<actual product provider>",
            "product": "<product, version and variable>",
            "acquisitionDate": "2026-03-15",
            "sceneId": "<identifier of the last step>",
            "processingVersion": "<processing version or CRID>",
            "referenceUrl": "<https://... verificable>",
            "note": "Fixed scale shared by every step of the series.",
            "approvedBy": "<approver name and date>"
          },
          "qualityNote": "Quality and maturity limitations of the series.",
          "timeSteps": [
            {
              "date": "2026-01-15",
              "label": "15 ene",
              "image": "data/real/zones/zone-name/soil-moisture-2026-01-15.png",
              "bbox": [-4.0, 37.5, -3.9, 37.6],
              "provenance": {
                "acquisitionDate": "2026-01-15",
                "sceneId": "<scene of 15 Jan>"
              }
            },
            {
              "date": "2026-02-15",
              "label": "15 feb",
              "image": "data/real/zones/zone-name/soil-moisture-2026-02-15.png",
              "bbox": [-4.0, 37.5, -3.9, 37.6],
              "provenance": {
                "acquisitionDate": "2026-02-15",
                "sceneId": "<scene of 15 Feb>"
              }
            },
            {
              "date": "2026-03-15",
              "label": "15 mar",
              "image": "data/real/zones/zone-name/soil-moisture-2026-03-15.png",
              "bbox": [-4.0, 37.5, -3.9, 37.6],
              "provenance": {
                "acquisitionDate": "2026-03-15",
                "sceneId": "<scene of 15 Mar>"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

The values between `<...>` are placeholders: replace them with verifiable
provenance. `example.org`/`example.invalid` and the fixture scenes are only
useful for tests, never for the public demo.

The fixture
[`frontend/scripts/fixtures/valid/real-with-timesteps.json`](../frontend/scripts/fixtures/valid/real-with-timesteps.json)
shows the complete shape without being a real observation.

### NDVI variant

For an optical layer, use `"id": "ndvi"`, `"unit": "index"`,
`"range": [0, 1]` and a provenance that identifies the real optical source
(Landsat, Sentinel-2 or another authorised one). **Do not describe it as NISAR.** The
NISAR pipeline of this repository does not generate NDVI.

## 4. Step 3 — place the files

```text
frontend/public/data/real/
├── manifest.json
└── zones/
    └── zone-name/
        └── soil-moisture/
            ├── 20260620T052326.png
            ├── 20260702T052325.png
            └── 20260714T052325.png
```

- Add the PNGs in `frontend/public/data/real/zones/<id>/soil-moisture/`.
- Edit **only** `frontend/public/data/real/manifest.json` to declare the zone,
  the layer and its `timeSteps`. If the zone already exists, replace or extend its
  `soil-moisture` layer without duplicating it.
- Do not copy anything to `sample/` or reuse a sample manifest: the demo does not
  load them.
- Do not version HDF5, GeoTIFF, NetCDF, intermediate crops or `.h5`. The
  `.gitignore` already excludes them.
- There is no need to touch `App.vue`, `main.ts`, components, types, services or
  `package.json`.

## 5. Step 4 — validate

From the repository root:

```bash
npm ci --prefix frontend
npm run validate:data --prefix frontend
```

The validation checks:

- that the JSON schema compiles;
- that the published manifests meet schema, semantics and assets;
- that the manifest mode matches its folder;
- that each `image` — including each `timeSteps[].image` — exists in
  `public/`, is a PNG and has an alpha channel;
- that `bbox`, `range`, legend, ids, `datasetMode`/`status` coherence and
  `processed_real` provenance are correct;
- that `timeSteps`, if present, has real ISO dates in strict order, without
  duplicates, each `bbox` within the zone and the last step equal to
  `layer.image`/`layer.bbox`;
- that the effective provenance of each step of a `processed_real` layer includes
  date, scene and URL;
- that `schemaVersion` is `"1.2.0"` when there is `timeSteps`;
- that valid fixtures pass and invalid ones fail.

To complete the delivery:

```bash
npm test --prefix frontend
npm run build --prefix frontend
```

`npm run build` must generate `frontend/dist/` without errors. If validation
fails, the layer is not published: fix the JSON or the PNG and repeat.

## 6. Step 5 — review the alignment in the browser

```bash
npm run dev --prefix frontend
```

Open the URL that Vite prints (by default `http://localhost:5173/`) and:

1. Select the new zone in the selector (the first zone is auto-selected on
   load).
2. Enable the layer and raise it to 100 % opacity.
3. Compare with the PNOA base map and with OpenStreetMap: the PNG edges must
   fall over the same area in both.
4. Check that nodata areas are transparent (the base map shows through) and
   that there is no opaque filled rectangle.
5. Verify that the legend, the unit and the date shown match the
   manifest. The interface does not show provenance (product decision of
   2026-11-15): check it in the manifest and with `validate:data`.
6. Go through the timeline: each date must change only the image (without
   recreating the map or flickering) and the slider must show the date of the
   active step.
7. Navigate outside the zone: no scientific colour must appear outside
   `layer.bbox`.

To review the production build:

```bash
npm run build --prefix frontend
npm run preview --prefix frontend
```

**Integration note:** `frontend/src/App.vue` already composes the map, the
timeline and the panel with the real manifest. Do not declare a layer reviewed only
with unit tests: geographic alignment is checked in the browser.

## 7. Step 6 — scientific approval and publication

1. The reviewing person checks source, date, scene, units, scale,
   quality and alignment. The approval is recorded in the Issue/PR with name and
   date; optionally `provenance.approvedBy` is added.
2. Only then is `status: "processed_real"` kept.
3. A small PR is opened with the PNG, the manifest and the validation
   evidence. The review is independent of the author; an automatic comment
   is not a human approval.
4. The `ci` check must be green. It is not merged without review.
5. After the merge the **static site is rebuilt and published**. The PNG and the JSON
   must be part of the deployment; it is not enough to have them in the repository.
6. On the published website, the zone appears directly in the demo (real
   data only) without changing any Vue component.

A real layer is not published "to test" with fictitious data. To test the
load there is the contractual fixture and the tests; the public demo does not expose
fixtures as real data.

## 8. NISAR SME2: using the existing converter

The repository includes
[`pipelines/nisar/sme2_to_overlay.py`](../pipelines/nisar/sme2_to_overlay.py),
which converts **NISAR L3 SME2** products (HDF5 downloaded from ASF) into a
`soil-moisture` layer compliant with the contract: RGBA PNG in EPSG:3857, WGS84 `bbox`,
legend and provenance. It does not generate NDVI.

### 8.1 Installation

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r pipelines/nisar/requirements.txt
```

It requires Python with `numpy`, `h5py`, `rasterio`, `pyproj` and `pillow`. The
installation is done in a virtual environment; scientific dependencies are not installed in the frontend's
`package.json`.

### 8.2 Staging: does not touch the application

```bash
python pipelines/nisar/sme2_to_overlay.py ruta/a/NISAR_L3_*.h5 \
  --aoi -90.32 29.90 -90.24 29.96 \
  --zone-id delta-mississippi \
  --zone-name "Mississippi Delta" \
  --staging pipelines/nisar/sme2_staging
```

`--aoi` is `west south east north` in WGS84. The command:

- crops the SME2 layer to the AOI on the EASE-Grid 2.0 grid;
- masks `_FillValue`, non-finite values and values outside the physical range;
- saves a master GeoTIFF with the real values (not versioned);
- reprojects to EPSG:3857 by nearest neighbour and oversamples so that
  Leaflet does not blur it;
- paints the PNG with a fixed scale and alpha 0 for no-data;
- computes the `bbox` from the raster corners;
- verifies the georeferencing with 25 control pixels;
- **does not write** to `frontend/public/data/real/`.

Outputs in `pipelines/nisar/sme2_staging/<zone-id>/`:

| File | Contents |
|---|---|
| `png/soil-moisture_<date>_<orbit>.png` | Overlay per date. |
| `layer.staging.json` | Prepared layer entry; it is not copied by hand. |
| `report.json` | Coverage, statistics, warnings, discarded scenes and georeferencing check. |
| `timeseries.json` | Draft of all dates. `--publish` without `--date` writes the whole series as `timeSteps` (see §8.4). |
| `geotiff/` | Intermediate scientific master; **not versioned**. |

### 8.3 Review before publishing

Review `report.json`:

- `problems` must be empty. If there are georeferencing failures or mixed CRIDs,
  the script does not publish.
- `warnings`: AOI coverage below 90 %, pixels that saturate above
  `--vmax`, discarded scenes…
- `skipped`: scenes outside the AOI, with few valid pixels or with unexpected
  units.
- `georefCheck.ok`: the alignment check must pass.
- The chosen date is the most recent by default. If any scene was discarded,
  `--date YYYY-MM-DD` must be given explicitly so as not to silently publish
  an old date.

Also check that the scale (`--vmin`/`--vmax`) is appropriate, that the
units are `m³/m³` and that the maturity (`--maturity`, `PROVISIONAL` by default)
describes the product.

### 8.4 Publication after approval

Only after the scientific review:

```bash
python pipelines/nisar/sme2_to_overlay.py ruta/a/NISAR_L3_*.h5 \
  --aoi -90.32 29.90 -90.24 29.96 \
  --zone-id delta-mississippi \
  --zone-name "Mississippi Delta" \
  --publish --approved-by "Reviewer name"

npm run validate:data --prefix frontend
```

`--publish` requires `--approved-by`; without it, the script ends with an error. Without
`--date`, it writes **all** the dates as
`frontend/public/data/real/zones/<zone-id>/soil-moisture/<date>.png` and
updates the real manifest atomically:

- adds the ordered `layer.timeSteps`, with the provenance of each scene;
- sets `layer.image`/`layer.bbox` to the last step;
- raises `schemaVersion` to `"1.2.0"` if it was `1.1.0`;
- if the zone already exists, replaces its `soil-moisture` layer without duplicating it;
- if the zone's `bbox` does not contain the layer's, it extends it with a warning;
- adds `approvedBy` to the provenance.

With `--date YYYY-MM-DD` it publishes a single image and does not write `timeSteps`.
To re-render without reopening the HDF5, use
`--from-staging pipelines/nisar/sme2_staging/<zone-id>` with the same
`--zone-id`/`--zone-name` and `--publish --approved-by`; the result keeps the
`bbox` and the series from the staging. The complete guide to the converter is in
[`pipelines/nisar/README.md`](../pipelines/nisar/README.md).

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Correct (there may be warnings on stderr). |
| 1 | Input error, no usable scene or publication blocked. |
| 2 | Staging with problems: failed georeferencing or mixed CRIDs. |

### 8.5 Converter tests

```bash
python -m pytest -q pipelines/nisar/tests
```

The tests use **synthetic** HDF5 with the product structure. They serve to
test the converter, not to declare a real observation. Before publishing
it is advisable to compare a real scene with the ASF documentation and with the team's
reference notebook.

### 8.6 What the pipeline does not do

- It does not download data for you: the HDF5 files are obtained from ASF with the team's
  tool and must have clear provenance and licence.
- It does not convert NDVI: NDVI is optical and requires other processing.
- It does not decide whether a plot needs irrigation.
- It does not replace scientific review or human approval.

## 9. Final checklist

- [ ] Authorised source, with verifiable product, scene, date, version and URL.
- [ ] RGBA PNG in EPSG:3857, north up and exact extent of `layer.bbox`.
- [ ] Nodata pixels with alpha 0; no opaque filled rectangles.
- [ ] `bbox` in `[west, south, east, north]` order; `layer.bbox` within
      `zone.bbox` (0.01° tolerance).
- [ ] `image` under `data/real/zones/<id>/` and without unsafe paths.
- [ ] `status: "processed_real"` only after human approval.
- [ ] Complete `provenance`: provider, product, version, date, scene and URL.
- [ ] If there is `timeSteps`: `schemaVersion: "1.2.0"`, ISO dates in order and
      unique, each PNG/`bbox` valid and the last step equal to
      `layer.image`/`layer.bbox`. In `processed_real`, each step has
      complete effective provenance.
- [ ] `legend` with at least two stops, sorted and consistent with the palette.
- [ ] `qualityNote` explains maturity and limitations; it does not promise irrigation or kg/ha.
- [ ] `npm run validate:data --prefix frontend` passes.
- [ ] `npm test --prefix frontend` and `npm run build --prefix frontend` pass.
- [ ] Visual review of alignment with PNOA and OSM and of the timeline.
- [ ] No Vue components have been modified and no large scientific binaries have been
      versioned.
- [ ] Approval recorded in the PR; `ci` check green; no auto-merge.

## 10. What the scientific team is NOT required to do

- Write Vue, TypeScript, CSS or Leaflet.
- Build asset paths or know `import.meta.env.BASE_URL`.
- Generate national tiles or a global mosaic.
- Compute indices in the browser.
- Set up an API, database, authentication or backend.
- Deploy the website (integration does that).
- Invent values where there is no data or fill coverage gaps.
- Deliver HDF5/GeoTIFF versioned in Git.
- Perform per-pixel queries: v1.2.0 only paints georeferenced images (one per date at most).

## 11. Warning about the published data and the competition

The demo publishes **NISAR L3 SME2 surface soil moisture** for Jaén and Toledo
(**PROVISIONAL** product, not fully calibrated). They are not synthetic data or
an agronomic conclusion: they are georeferenced observations of the product,
with their provenance and limitations declared in the manifest, in the
analysis cubes and in this documentation. Since 2026-11-15 the interface only
shows "PROVISIONAL NISAR data" in the subtitle, without notices or a provenance panel.

Surface soil moisture **is not equivalent to an irrigation need**. Publishing a
layer does not by itself demonstrate a
conclusion about production or kg/ha. The requirements of the NASA Space Apps
Challenge or of possible global awards depend on what the
current rules establish and on the scientific review of the product.

## 12. References

- Practical contract and validation: [`docs/data-contract.md`](data-contract.md).
- Freeze and change rule: [`docs/contract-freeze.md`](contract-freeze.md).
- Schema: [`contracts/manifest.schema.json`](../contracts/manifest.schema.json).
- NISAR SME2 converter: [`pipelines/nisar/README.md`](../pipelines/nisar/README.md).
- ASF documentation on SME2: <https://nisar-docs.asf.alaska.edu/sme2>.
