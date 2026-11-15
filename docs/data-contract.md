# OliveTwin data contract v1.3.0 — practical reference

This document describes the contract **as implemented** in the
repository: the JSON Schema, the data validator, the manifest loader and
the state composable. It does not replace the freeze documents, but it
avoids having to read the code to know what can be published and what is rejected.

> **Product decision (2026-11-14):** the demo publishes **real data only**
> from NISAR L3 SME2 for Jaén and Toledo. The contract still admits `datasetMode:
> "sample"` for tests and fixtures, but the application neither loads nor offers sample
> data; see [`docs/c0-interfaces.md`](c0-interfaces.md) §7.

| Document | Role |
|---|---|
| [`contracts/manifest.schema.json`](../contracts/manifest.schema.json) | Structural source of truth (JSON Schema draft 2020-12). |
| [`docs/contract-freeze.md`](contract-freeze.md) | Freeze agreement and change rule. |
| [`contracts/README.md`](../contracts/README.md) | Summary of the schema and conventions. |
| [`docs/c0-interfaces.md`](c0-interfaces.md) | Interfaces frozen between WP-04 and WP-07. |
| [`docs/handoff-science.md`](handoff-science.md) | Guide to publishing a real zone without touching Vue. |

Current version: **1.3.0**. The value is declared in `schemaVersion`; the
validator only admits major `1` and the exact versions `1.1.0`
(manifests without a time series), `1.2.0` (with or without `timeSteps`) and `1.3.0`
(mandatory if any zone declares `analysis`). Both extensions are
**additive**: a v1.1.0 or v1.2.0 manifest remains valid and is displayed
as before.

## 1. Where each thing lives

```text
frontend/public/data/
└── real/
    ├── manifest.json                    # datasetMode: "real" (mandatory)
    └── zones/<zone>/<layer>/<date>.png  # approved PNGs and their timeSteps

# Optional and NOT used by the demo: synthetic material for local tests
# frontend/public/data/sample/manifest.json
```

- All published assets are **optimised PNGs and JSON**. HDF5, GeoTIFF, NetCDF or
  other scientific binaries are not versioned (see `.gitignore`).
- The real manifest is the only one the application loads. The contract keeps
  `sample` for fixtures and tests, but `frontend/public/data/sample/` is not
  published in this branch and `validate:data` treats it as optional.
- `frontend/public/data/real/` only contains data with scientific approval:
  Jaén and Toledo (3 dates each) published from the NISAR SME2 pipeline.
- `image` paths are **relative to `frontend/public/`**, never to the file
  system or to the working directory.

## 2. Manifest structure

### 2.1 Manifest

| Field | Mandatory | Type | Rule |
|---|---|---|---|
| `schemaVersion` | Yes | string | SemVer with major 1. Admitted values: `"1.1.0"` or `"1.2.0"`; with `timeSteps`, `"1.2.0"` is mandatory. |
| `datasetMode` | Yes | string | Closed enum: `"sample"` \| `"real"`. |
| `appTitle` | Yes | string | Not empty or whitespace-only. |
| `zones` | Yes | array | It can be `[]`; **never** `null`. |

The root object is closed (`additionalProperties: false`): an unknown field
in the manifest is rejected in order to detect typos. The same happens
with zones and layers; the only deliberate exception is `provenance` (§2.5).

### 2.2 Zone (`zones[]`)

| Field | Mandatory | Type | Rule |
|---|---|---|---|
| `id` | Yes | string | Kebab-case `^[a-z0-9]+(?:-[a-z0-9]+)*$`; unique in the manifest. |
| `name` | Yes | string | Not empty or whitespace-only. |
| `description` | No | string | If present, not empty. In a synthetic zone it must clarify that the location is illustrative. |
| `bbox` | Yes | number[4] | `[west, south, east, north]` in WGS84; see §3. |
| `layers` | Yes | array | It can be `[]`. Each layer is described in §2.3. |

**A zone without layers is valid.** It is not filled with sample data or
invented values: the interface simply will have no layer to paint.

### 2.3 Layer (`zones[].layers[]`)

| Field | Mandatory | Type | Rule |
|---|---|---|---|
| `id` | Yes | string | Closed enum: `"ndvi"` \| `"soil-moisture"`. Adding another id requires a contract change. |
| `title` | Yes | string | Not empty or whitespace-only. |
| `kind` | Yes | string | Constant `"image-overlay"`; in v1.2.0 there is no other layer type. |
| `variable` | No | string | Scientific label, for example `"NDVI"` or `"Humedad superficial"`. |
| `image` | Yes | string | Path relative to `public/`, safe and under `data/<datasetMode>/`; see §3.4. |
| `bbox` | Yes | number[4] | Coverage of the PNG; it may be smaller than `zone.bbox`. |
| `imageCrs` | Yes | string | Closed enum: `"EPSG:3857"`. |
| `unit` | Yes | string | Not empty or whitespace-only (`index`, `m³/m³`, `%`…). |
| `range` | No | number[2] | `[min, max]`, both numbers and strictly `min < max`. |
| `legend` | Yes | array | At least 2 stops `{value, color, label}`; see §2.4. |
| `status` | Yes | string | Closed enum: `"synthetic"` \| `"processed_real"`. |
| `provenance` | Yes | object | Traceability; see §2.5. |
| `qualityNote` | Yes | string | Not empty; limitations that the UI can show. |
| `timeSteps` | No | array | **v1.2.0**: ordered time series of at least one step; see §2.7. |

### 2.4 Legend

`legend` is an **ordered list** of classes, not a free object:

```json
[
  { "value": 0, "color": "#ffffd9", "label": "Más seco" },
  { "value": 0.3, "color": "#41b6c4", "label": "0.30 m³/m³" },
  { "value": 0.6, "color": "#081d58", "label": "Más húmedo" }
]
```

- `value`: number; it may be negative (for example NDVI).
- `color`: six-digit hexadecimal `#rrggbb`; names and
  three-digit colours are not admitted.
- `label`: non-empty text.
- **Strictly increasing** order by `value`. The validator rejects repeated or
  out-of-order values.
- The legend allows the PNG to be interpreted; it does **not** allow the exact
  scientific value of a pixel to be recovered.

### 2.5 Provenance (`provenance`)

| Field | Mandatory | Type | Rule |
|---|---|---|---|
| `provider` | Yes | string | Provider or origin of the processing. In synthetic data, a synthetic generator; never a real mission. |
| `product` | Yes | string | Product or description. In synthetic data it must be clear that it is not satellite data. |
| `processingVersion` | Yes | string | Version of the processing or of the generator (`sample-v1`, CRID, pipeline version…). |
| `acquisitionDate` | Conditional | string \| null | ISO 8601 date (date or date-time with time zone). **Mandatory and non-null if `status: processed_real`.** |
| `sceneId` | Conditional | string \| null | Scene or product identifier. **Mandatory and non-empty if `processed_real`.** |
| `referenceUrl` | Conditional | string \| null | Verifiable `http(s)://` URL. **Mandatory and non-null if `processed_real`.** |
| `note` | No | string \| null | Free note about provenance or limitations. |

`provenance` keeps `additionalProperties: true` deliberately. It is the
only additive route for pipeline metadata without changing the contract, for
example `crid`, `maturity` or `approvedBy`. Providers, products, dates,
scenes or URLs are not invented.

### 2.6 Minimal valid example (synthetic)

Structurally and semantically valid; to publish it, the corresponding PNG would
also be needed in `frontend/public/data/sample/zones/zona-ejemplo/ndvi.png`.

```json
{
  "schemaVersion": "1.1.0",
  "datasetMode": "sample",
  "appTitle": "OliveTwin",
  "zones": [
    {
      "id": "zona-ejemplo",
      "name": "Zona de ejemplo",
      "description": "Ubicación ilustrativa; no es una parcela real.",
      "bbox": [-4.0, 37.5, -3.9, 37.6],
      "layers": [
        {
          "id": "ndvi",
          "title": "Vegetación (NDVI)",
          "kind": "image-overlay",
          "variable": "NDVI",
          "image": "data/sample/zones/zona-ejemplo/ndvi.png",
          "bbox": [-4.0, 37.5, -3.9, 37.6],
          "imageCrs": "EPSG:3857",
          "unit": "index",
          "range": [0, 1],
          "legend": [
            { "value": 0, "color": "#dfc27d", "label": "Bajo" },
            { "value": 1, "color": "#01665e", "label": "Alto" }
          ],
          "status": "synthetic",
          "provenance": {
            "provider": "Generador sintético OliveTwin",
            "product": "NDVI ilustrativo — no satelital",
            "acquisitionDate": null,
            "sceneId": null,
            "processingVersion": "sample-v1",
            "referenceUrl": null,
            "note": "Datos inventados para probar la interfaz"
          },
          "qualityNote": "NO apto para decisiones agronómicas"
        }
      ]
    }
  ]
}
```

### 2.7 Timeline (`timeSteps`, v1.2.0)

A layer can declare **several dates** in `timeSteps`. The extension is
optional and additive; the rest of the layer rules do not change. Unit,
`range`, `legend` and `status` are **common to all steps**: the scale must
be fixed through time so that dates can be compared.

```json
{
  "schemaVersion": "1.2.0",
  "datasetMode": "sample",
  "appTitle": "OliveTwin",
  "zones": [
    {
      "id": "jaen-demo",
      "name": "Jaén — demostración temporal",
      "bbox": [-3.86, 37.69, -3.61, 37.9],
      "layers": [
        {
          "id": "ndvi",
          "title": "Vegetación (NDVI)",
          "kind": "image-overlay",
          "image": "data/sample/zones/jaen-demo/ndvi-2026-11-01.png",
          "bbox": [-3.86, 37.69, -3.61, 37.9],
          "imageCrs": "EPSG:3857",
          "unit": "index",
          "range": [-1, 1],
          "legend": [
            { "value": -1, "color": "#8c510a", "label": "Bajo" },
            { "value": 0, "color": "#dfc27d", "label": "Intermedio" },
            { "value": 1, "color": "#01665e", "label": "Alto" }
          ],
          "status": "synthetic",
          "provenance": {
            "provider": "Generador sintético",
            "product": "NDVI ilustrativo — no satelital",
            "processingVersion": "sample-v1"
          },
          "qualityNote": "NO apto para decisiones agronómicas",
          "timeSteps": [
            {
              "date": "2026-09-01",
              "label": "1 sep",
              "image": "data/sample/zones/jaen-demo/ndvi-2026-09-01.png",
              "bbox": [-3.86, 37.69, -3.61, 37.9]
            },
            {
              "date": "2026-10-01",
              "label": "1 oct",
              "image": "data/sample/zones/jaen-demo/ndvi-2026-10-01.png",
              "bbox": [-3.86, 37.69, -3.61, 37.9],
              "provenance": { "note": "Paso intermedio sintético" }
            },
            {
              "date": "2026-11-01",
              "label": "1 nov",
              "image": "data/sample/zones/jaen-demo/ndvi-2026-11-01.png",
              "bbox": [-3.86, 37.69, -3.61, 37.9]
            }
          ]
        }
      ]
    }
  ]
}
```

Mandatory rules:

| Rule | Detail |
|---|---|
| `schemaVersion` | `"1.2.0"` if `timeSteps` is used; without a time series, `"1.1.0"` and `"1.2.0"` are admitted. |
| Size | `timeSteps` has at least one step. |
| `date` | Real ISO 8601: date (`2026-10-19`) or date-time with time zone (`2026-10-19T11:19:03Z`). |
| Order | Strictly increasing by `date`, without duplicates. |
| Step `image` | Same safe rules as `layer.image` and `data/<datasetMode>/` prefix; PNG existing with alpha in `validate:data`. |
| Step `bbox` | `[west, south, east, north]`, valid and within `zone.bbox` with 0.01° tolerance. |
| Last step | `layer.image` and `layer.bbox` must be **exactly** those of the last step. Thus a v1.1 consumer still shows the most recent date. |
| Step `provenance` | Partial; the effective provenance is `{ ...layer.provenance, ...step.provenance }`. |
| `processed_real` | The effective provenance of **each** step must have `acquisitionDate`, `sceneId` and `referenceUrl` as non-empty strings (not `null`). |

At runtime, `useOliveTwinData` selects the last step by default when the
layer is chosen. `selectTimeStep(index)` changes the active step and `ActiveOverlay` exposes
the step's `url`/`bbox` together with `timeIndex` and `timeStep`. Changing the mode, zone
or layer resets the index; an out-of-range index is ignored.

### 2.8 Per-zone analysis cube (`zone.analysis`, v1.3.0)

`zone.analysis` points to `data/<mode>/zones/<id>/analysis/analysis.json`, which
validates against [`contracts/analysis.schema.json`](../contracts/analysis.schema.json).
It is generated by [`pipelines/analysis/`](../pipelines/analysis/README.md) and used by the
"Analysis" and "Twins" tabs of the application.

| Block | Content |
|---|---|
| `grid` | Common EPSG:3857 grid: exact WGS84 `bbox`, `width`, `height`, `cellSizeM` (m in Web Mercator), `encoding: "png-uint8-linear"`, `nodata: 255`. |
| `variables[]` | `id`, `title`, `group` (`nisar`, `optical`, `terrain`, `soil`, `climate`), `unit`, `scale`, `offset`, `displayRange`, `palette`, `temporal`, `description`, `caveat`, `status`, `provenance` (with `license`) and `steps[]`. |
| `steps[]` | `date` (ISO; `null` only in static products), `data` (8-bit grey PNG), `stats` (`mean`, `median`, `p10`, `p90`, `min`, `max`, `validFraction`) and the step's `provenance`. |
| `zoneSeries[]` | Zone series `{id, title, unit, chart: bar\|line, provenance, points[{date, value}]}`. |
| `unavailable[]` | Planned sources not incorporated, with the verifiable reason. |
| `suitability` | `title`, `note` and `criteria[{variable, aggregate, direction, weight, rationale}]` (relative index; the interface no longer uses it). |
| `crops[]` | Crop suitability: `id`, `name`, `scientificName`, `assumptions`, `method`, `source` (provenance with licence), `suitability` (raster 0–1) and `factors[{id, label, variables, requirement, parameters, raster}]`. Each raster is `{data, scale, offset, stats}` with the same encoding as the steps. |

**Decoding.** Each PNG pixel is a code 0–254: value =
`offset + scale × code`; 255 is "no data" and is never filled. The app
decodes the PNG in JavaScript (without canvas) so that the browser's colour management
does not alter the codes, and it reads the **data** of the cell on click,
not the colour.

**Suitability index (withdrawn on 2026-11-15).** The optional `suitability` field
(criteria with weights and percentile ranges) remains in the schema for
compatibility, but the pipeline no longer generates it and the interface does not use it:
it is replaced by crop suitability.

**Crop suitability.** The pipeline computes, with crop requirements from
verifiable sources (FAO GAEZ v4 and FAO ECOCROP; pH, texture, slope and organic carbon from the
suitability tables of the University of Granada based on Sys et al., 1993), a score
0–1 per factor and the overall one (minimum of the factors, as in Ecocrop). Each factor
can declare `classes` (optimal / acceptable / unsuitable bands in plain language) and
`reference` (citation and URL when the source is not the ECOCROP sheet); the crop can
declare `otherRequirements` (cited requirements that do not enter the map). The
interface recalculates nothing and invents no thresholds: it shows the rasters, the published
bands, distributes the surface into bands and marks in each cell the factor with the
lowest score. Variables without a published requirement are shown as "No verified
reference value".

**Validation.** `npm run validate:data` checks schema, paths under the zone,
date order, `stats` coherence, criteria and crop factors that
point to existing variables, unique crop and factor ids, and that each
PNG (steps and suitability rasters) exists, is 8-bit grey, has the size of
the grid and does not exceed 2 MB. The fixtures are in
`frontend/scripts/fixtures/analysis/{valid,invalid}/`.

## 3. Geospatial and asset conventions

### 3.1 `bbox` = `[west, south, east, north]`

- Four numbers in decimal degrees, **WGS84 / EPSG:4326**.
- Order: `[minimum longitude, minimum latitude, maximum longitude, maximum latitude]`.
- The schema checks the global range: longitude ±180°, latitude ±90°. It does **not**
  restrict zones to Spain; the navigable map is centred on Spain.
- `west < east` and `south < north` are semantic validation (not schema validation).
- Leaflet receives the transformed box:
  `[[south, west], [north, east]]`. Components do not reorder the JSON.
- `zone.bbox` delimits the study area; `layer.bbox` delimits the actual
  coverage of the PNG and may be equal or smaller. The validator requires that
  `layer.bbox` stays within `zone.bbox` with a tolerance of **0.01°**.

### 3.2 Overlay PNG

Each `image` must be a PNG:

- prepared in **EPSG:3857 (Web Mercator)**;
- **north up**;
- with the exact extent of `layer.bbox` (the PNG does not carry coordinates:
  the position is given by the JSON);
- with an alpha channel: RGBA (`color type 6`), grey+alpha (`4`) or palette with `tRNS`;
- with **alpha 0** in the pixels without data. "No data" is not represented as
  moisture 0 or as an opaque colour; transparent pixels must also carry
  RGB at 0 to avoid halos;
- with a reasonable size (indicative target: less than 1 MB per PNG). If the
  raster is huge, it is cropped, optimised or a tiling is prepared in a
  later phase; each layer admits one image, or one per time step if it uses
  `timeSteps`.

The reprojection must be documented. For discrete values or to avoid inventing
intermediate values, nearest neighbour is used; bilinear resampling smooths and
can fabricate values that did not exist in the original data.

With `timeSteps`, **each step** provides its own PNG and its `bbox`; the
same rules of CRS, orientation, transparency and safe path apply. The last PNG
is the one that must match `layer.image`.

A PNG is a **visual representation**: it does not expose queryable scientific
values. Per-pixel query would require a numeric `values`/grid with its own
contract (P1, outside v1.2.0).

### 3.3 `imageCrs`

In v1.2.0 the only admitted value is `"EPSG:3857"`. A PNG in EPSG:4326 or another
CRS is rejected even if it looks "almost right" when overlaid.

### 3.4 Image paths

The `image` field:

- is relative to `frontend/public/`;
- **does not** start with `/`;
- **does not** contain `..`, `:` (absolute URLs or disk drives) or `\`;
- in publication validation, it must start with `data/sample/` or
  `data/real/` according to `datasetMode`.

Valid examples:

```text
data/sample/zones/jaen-demo/ndvi.png
data/real/zones/mi-zona/soil-moisture.png
```

The application resolves the URL with the Vite base:

```ts
const url = `${import.meta.env.BASE_URL}${layer.image}`
```

`BASE_URL` ends in `/` and allows deploying at the root or under a subpath (for
example `/olivetwin/`). **The scientific team does not build URLs**: it writes the contract
path and the loader resolves it. Vue components do not compose paths either;
they receive `ActiveOverlay.url` already resolved.

## 4. Data mode and layer status

### 4.1 Mandatory coherence

| `datasetMode` | `status` admitted in all layers |
|---|---|
| `sample` | `synthetic` |
| `real` | `processed_real` |

The rule is applied twice:

1. in the **schema**, through `if/then`;
2. in the **semantic validator** and in the **runtime loader**, which produce
   a specific and readable error (`mode-mismatch` / `status-mismatch`).

Layers of both modes are not mixed even if the zone or layer `id` matches.

### 4.2 `processed_real` is not a cosmetic label

To declare `status: "processed_real"` the following is required:

- `provenance.acquisitionDate`: non-empty ISO 8601 string (not `null`);
- `provenance.sceneId`: non-empty string (not `null`);
- `provenance.referenceUrl`: verifiable URL (not `null`);
- human scientific approval recorded outside the JSON and, preferably,
  also in `provenance.approvedBy`;
- that the PNG and the `bbox` correspond to the described product.

Changing a text, a file name or the `status` does not turn a synthetic datum
into a real one. An agent cannot approve its own scientific work.

### 4.3 `zones: []` is a valid state

- `real/manifest.json` with `zones: []` is **empty**, not an error. Today the
  published manifest declares Jaén and Toledo, but the empty state is still
  supported (for example, if the zones are withdrawn).
- The application does not fall back to `sample` if there is no data, if the manifest returns 404
  or if the JSON is invalid. Nor are PNGs from a previous load reused.

### 4.4 Runtime load states

| State | Meaning | What the UI does |
|---|---|---|
| `loading` | Manifest requested; zones, selection and previous overlays are cleared. | Loading indicator. |
| `ready` | Valid manifest with at least one zone. | Zones available; the user chooses. |
| `empty` | Valid manifest with `zones: []`. | "There are no zones with real scientific data yet" in real mode. |
| `error` | 404, network failure, broken JSON, invalid schema, mode/status incoherence or unsafe path. | Error message and option to retry; **no fallback** to sample. |

Loader and composable rules (`loadManifest`, `useOliveTwinData`):

- `loadManifest` downloads `${BASE_URL}data/<mode>/manifest.json` with
  `cache: 'no-cache'`.
- Before Ajv it checks `datasetMode` and the `status` coherence in order to give a
  specific message; afterwards it validates the complete schema.
- `assertManifestCoherence` checks mode, status and safe paths again.
- Each `setDataMode` or `reload` increments a counter and aborts the previous
  request (`AbortController`). A late response does **not** overwrite the current
  mode.
- When the mode changes, `zones`, `selectedZoneId` and `selectedLayerId` are cleared.
- When a zone is selected, its first layer is chosen, or `null` if it has none.
- When a layer (or a zone with a layer) is selected, `selectedTimeIndex` points to the
  **last** step if the layer has `timeSteps`; otherwise it is `null`.
- `selectTimeStep(index)` only accepts an integer within `0..timeSteps.length-1`;
  out of range or without a time series it is ignored. Changing the mode, zone or layer
  resets the index.
- `selectZone`/`selectLayer` ignore ids that do not exist in the active
  manifest.
- `overlay` is `null` if there is no valid zone and layer. If there is a selection, the URL is
  resolved with `BASE_URL` and delivered as `ActiveOverlay`; with `timeSteps`, the
  URL, the `bbox`, `timeIndex` and `timeStep` come from the active step.
- Initial opacity `0.7`, always clamped to `[0, 1]`; overlay visible by
  default.
- There is no persistence of the mode or of the selection between reloads.

The browser does **not** check the existence or the alpha channel of the PNG (it would have
to download and decode it). Those checks are done before publishing
with `npm run validate:data --prefix frontend`; if a PNG is missing in production, the
UI shows the image error without breaking the base map.

## 5. Implemented validation

Validation is split into three layers. The shared logic lives in
[`frontend/scripts/validate-lib.mjs`](../frontend/scripts/validate-lib.mjs).

### 5.1 JSON Schema

It checks structure, types, enums, patterns, mandatory fields, closure of
objects, global `bbox` range, `range` size, `legend` shape, safe
`image` pattern and `datasetMode`/`status` coherence.

### 5.2 Semantic rules (not expressible in the schema)

| Rule | Detail |
|---|---|
| `schemaVersion` | Must match `^1\.[0-9]+\.[0-9]+$`. |
| Expected mode | The published manifest must declare the mode of its folder (`sample` or `real`). |
| Zone and layer `bbox` | `west < east` and `south < north`. |
| Layer within zone | `layer.bbox` within `zone.bbox` with `0.01°` tolerance. |
| `range` | Strictly `min < max`. |
| `legend` | Strictly increasing order by `value`. |
| Ids | Unique zone in the manifest; unique layer within its zone. |
| Zone `id` | Kebab-case. |
| `image` prefix | `data/<datasetMode>/` (publication). |
| Status coherence | `sample` ⇒ `synthetic`; `real` ⇒ `processed_real`. |
| `processed_real` | `acquisitionDate`, `sceneId` and `referenceUrl` as non-empty strings. |
| Version and `timeSteps` | `timeSteps` requires `schemaVersion: "1.2.0"`; without a series, `"1.1.0"` and `"1.2.0"` are admitted. |
| Step dates | Real ISO 8601, in strictly increasing order and without duplicates. |
| Step `bbox` | Each step within `zone.bbox` with `0.01°` tolerance. |
| Last step | `layer.image` and `layer.bbox` identical to those of the last `timeStep`. |
| Step provenance | In `processed_real`, the effective provenance of each step includes `acquisitionDate`, `sceneId` and `referenceUrl`. |

### 5.3 Assets

For each `image` of the published manifests — including **all**
`timeSteps[].image` — it is checked that:

- the file exists under `frontend/public/`;
- the PNG signature is correct;
- the PNG has an alpha channel (`color type` 4 or 6, or `tRNS`);
- the declared dimensions are valid.

The runtime does not download or decode the PNG to check alpha, but it does reject
unsafe layer and step paths before painting.

The contractual fixtures in `frontend/scripts/fixtures/` are validated without
checking assets, because they are not served from `public/`.

### 5.4 Validation command

From the repository root:

```bash
npm run validate:data --prefix frontend
```

The command:

1. compiles the schema with Ajv (draft 2020-12);
2. validates `public/data/real/manifest.json` against schema + semantics + assets,
   requiring the mode to match the folder. `sample/manifest.json` is
   **optional**: if it exists it is validated the same way and, if it does not exist, it is reported as
   skipped without failing;
3. requires all fixtures in `fixtures/valid/` to pass;
4. requires all fixtures in `fixtures/invalid/` to fail.

It exits with code 1 if something fails. In the current state of the branch, 35
checks are run (manifests + fixtures).

### 5.5 Runtime validation versus publication validation

The runtime service repeats the critical checks in order not to depend on the
build: `datasetMode` coherence, `status` coherence and safe paths. The
check of the `data/<mode>/` prefix, the existence of the PNG and the alpha channel are
run in `validate:data` before publishing. That is why **local validation is
mandatory**: a hand-edited manifest that bypasses the CLI can point to an
asset of the other mode even if the browser accepts it.

## 6. Validating and updating the published data

The demo does not include a sample data generator. The PNGs and the real manifest
are produced with the NISAR SME2 pipeline and validated before publishing:

```bash
npm ci --prefix frontend
npm run validate:data --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
```

`validate:data` checks the real manifest, all the PNGs of the series
(`timeSteps[].image`), the contractual fixtures and the assets. `npm test`
runs Vitest (contract, services, composable and components) and `npm run
build` runs `vue-tsc -b` and generates `frontend/dist/`.

### 6.1 Adding dates to an existing zone

The pipeline opens the NISAR SME2 HDF5 files in a *staging* area and only writes to
`frontend/public/data/real/` with `--publish`:

```bash
# 1) Staging: does not touch the application. Review report.json and the PNGs.
python pipelines/nisar/sme2_to_overlay.py nisar_sme2_data/*.h5 \
  --aoi WEST SOUTH EAST NORTH \
  --zone-id jaen --zone-name "Jaén" \
  --staging pipelines/nisar/sme2_staging

# 2) Publication of the whole series (one or several dates) after the review
python pipelines/nisar/sme2_to_overlay.py nisar_sme2_data/*.h5 \
  --aoi WEST SOUTH EAST NORTH \
  --zone-id jaen --zone-name "Jaén" \
  --publish --approved-by "Nombre del revisor"
```

Without `--date`, `--publish` writes **all** usable scenes as ordered
`timeSteps` and sets `layer.image`/`layer.bbox` to the last step. With
`--date YYYY-MM-DD` it publishes a single date without a time series. The scale
(`--auto-scale` or `--vmin/--vmax`) is shared between dates so that the slider
is comparable.

To re-render without reopening the HDF5 files (for example, with another scale):

```bash
python pipelines/nisar/sme2_to_overlay.py \
  --from-staging pipelines/nisar/sme2_staging/jaen \
  --zone-id jaen --zone-name "Jaén" \
  --auto-scale --publish --approved-by "Nombre del revisor"
```

`--from-staging` rebuilds the series from `layer.staging.json` and the master
GeoTIFF of the staging, and applies the same warp, colour, verification and publication.
After publishing, run `npm run validate:data --prefix frontend` and review
the alignment in the browser before deploying the static site.

### 6.2 Adding a new zone

1. Run the pipeline with a new `--zone-id` and the zone's `bbox`. With
   `--publish --approved-by` it creates `zones/<id>/soil-moisture/<date>.png` and
   adds the zone to the real manifest without duplicating layers.
2. Check that the manifest is raised to `schemaVersion: "1.2.0"` if it writes
   `timeSteps`, and that the provenance of each step includes `acquisitionDate`,
   `sceneId` and `referenceUrl`.
3. Run `npm run validate:data --prefix frontend`, review the framing and
   transparency in the browser and publish the static build.

HDF5, GeoTIFF and NetCDF are not versioned: the staging stays outside Git and only the
optimised PNGs and JSON are published.

## 7. Contract change policy

| Type of change | Version | Examples |
|---|---|---|
| **Additive** | Minor: `1.2.0`, `1.3.0`… | New **optional** property in the schema (this is how `layer.timeSteps` was added in v1.2.0), new reusable `$def`, new documentation or clarification. |
| **Incompatible** | Major: `2.0.0` | New mandatory field, change of type or semantics, removal or renaming, change of the `bbox` order, extension of an enum that consumers treat exhaustively. |

Concrete rules:

- Changing the `bbox` order or the meaning of `sample`/`real` is **always**
  major.
- Adding a new layer `id` (`ndvi`, `soil-moisture` are a closed enum) is
  **major**.
- Adding an optional field to `provenance` does **not** require changing the schema:
  `provenance` already admits additional properties. Documenting it is enough.
- Adding an optional property to the manifest, zone or layer requires updating the
  JSON Schema and raising the minor.
- Every contract change is opened as an issue, reviewed by integration and
  updates `docs/contract-freeze.md` and this document in the same change.
- WP-04 does not change the contract unilaterally; WP-07 does not rewrite it or edit
  the types.

## 8. Quick troubleshooting

| Symptom | Probable cause | Solution |
|---|---|---|
| `image debe estar bajo "data/real/"` | A real layer's path points to `sample/` or to another folder. | Move the PNG and fix `image`. |
| `layer.bbox queda fuera de zone.bbox` | The raster coverage exceeds the zone (more than 0.01°). | Extend `zone.bbox` or crop the raster. |
| `processed_real exige provenance.sceneId` | The scene, the date or the URL is missing, or they are `null`. | Complete the verifiable provenance (also in the effective provenance of each time step). |
| `timeSteps debe estar en orden estrictamente creciente` | Two steps out of order or with the same `date`. | Reorder and remove duplicates; each step must have a different date. |
| `layer.image debe coincidir con el image del último timeStep` | The layer shows an old date while `timeSteps` ends in another. | Match `layer.image`/`layer.bbox` to the last step. |
| `layer.timeSteps exige schemaVersion "1.2.0"` | Time series declared as `1.1.0`. | Change `schemaVersion` to `"1.2.0"`. |
| `el PNG ... no tiene canal alfa` | The PNG was exported as opaque RGB. | Re-export as RGBA with alpha 0 for no-data. |
| `must NOT have fewer than 2 items` in `legend` | Legend with a single stop. | Add at least two ordered classes. |
| `datasetMode="sample" exige status="synthetic"` | Real layer inside a `sample` fixture manifest. | Separate the manifests; do not mix modes. It only affects fixtures, not the demo. |
| The app shows "There are no zones…" | `real/manifest.json` has `zones: []`. | This is the valid state if the published zones are withdrawn. |
| The app shows an error and does not fall back to another mode | Invalid JSON, 404 or mode incoherence. | Fix the manifest; there is no fallback by design. |
| The "Sample data / Real data" selector does not appear | This is the product decision: the demo uses real data only. | Expected; see [`docs/c0-interfaces.md`](c0-interfaces.md) §7. |

## 9. Verification of this reference

The commands in §6 were re-run on branch `b/intreal` on 2026-11-14, after
withdrawing the sample data and publishing Jaén/Toledo:

| Command | Result |
|---|---|
| `npm ci --prefix frontend` | Correct installation (with `EBADENGINE` warnings from dependencies, no error). |
| `npm run validate:data --prefix frontend` | `OK — 35 comprobaciones superadas (0 fallos)`; `sample/manifest.json` skipped as optional and `real/manifest.json` validated with its 6 PNGs. |
| `npm test --prefix frontend` | 18 files and 259 tests passed. |
| `npm run build --prefix frontend` | `vue-tsc -b` + `vite build` correct; `dist/` generated. |
| `npm run build --prefix frontend -- --base /olivetwin/` | Build under subpath correct; AT-17 serves it with `vite preview` and requests manifest/PNG under `/olivetwin/`. |

The guide to publishing real data is in
[`docs/handoff-science.md`](handoff-science.md).
