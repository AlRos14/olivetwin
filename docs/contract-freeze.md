# OliveTwin minimal contract freeze — v1.1.0, additive extensions v1.2.0 and v1.3.0

**Agreement date:** 14 November 2026 (Phase A, node A02; corrected in A02-fix).
**Status:** frozen for the start of Phase B; aligned with example §4.3 of plan v2.
**Repository:** <https://github.com/AlRos14/olivetwin> (public, owner `AlRos14`).
**Scope:** data manifests, spatial conventions and reference types shared by
WP-04 (data and contracts) and WP-07 (Vue + Leaflet).

This document is the agreement that allows both work packets to be launched in parallel. It does not define the
loader, the scientific logic or UI components: that belongs to WP-04 and WP-07.

## 1. Relationship with the Phase B plan

This baseline **replaces nodes PRE00, PRE01, PRE02 and C0** of the Phase B plan. Once
GA is approved:

- the project bootstrap is not repeated;
- the basic contract described here is not renegotiated;
- the Phase B orchestrator marks those nodes as already satisfied and launches WP-04 and WP-07.

The complete schema, the fixtures, the PNG generator and the scientific validation remain
the responsibility of WP-04.

## 2. Immutable fields and conventions

| Object | Minimum fields / conventions | Ownership of later work |
|---|---|---|
| Manifest | `schemaVersion`, `datasetMode` (`sample`/`real`), `appTitle`, `zones[]` | WP-04 completes the schema |
| Zone | `id`, `name`, `bbox`, `layers[]`; optional `description` | WP-04 formalises the JSON Schema; WP-07 renders it |
| Layer | `id` (`ndvi` or `soil-moisture`), `title`, `kind: image-overlay`, `image`, `bbox`, `imageCrs`, `unit`, `status`, `legend`, `provenance`, `qualityNote`; optional `variable` and `range` (`[min,max]`) | WP-04 defines restrictions/validator; WP-07 uses props |
| BBox | `[west, south, east, north]`, WGS84 EPSG:4326; Leaflet receives `[[south,west],[north,east]]` | Do not change the order without a major version |
| PNG layer | RGBA PNG + image `bbox`, suitable presentation CRS, nodata transparency | WP-04 generates the sample; scientists produce the real data |
| Mode | `sample` / `real` at runtime; never a silent fallback | WP-04 state, WP-07 UI selector |
| Load status | `loading`, `ready`, `empty`, `error` | WP-04 service/composable |
| Base map | `pnoa` / `osm` | WP-07 |
| Paths | `image` relative to `public/`, without a leading `/`, without `..` and without `%`; resolve with `import.meta.env.BASE_URL` | WP-04 loads, WP-07 does not create paths |
| Provenance | `synthetic` vs `processed_real`; do not present invented data as real NASA data | Scientific approval when there is real data |

Application notes:

- `schemaVersion` must match `^1\.[0-9]+\.[0-9]+$`. This baseline admits
  `1.1.0` (no time series) and `1.2.0` (with or without `timeSteps`, see §2.4).
- `zones: []` is valid in both modes; in `real` it expresses a deliberate absence of measurements,
  not an error that must be filled with examples.
- `image` paths are resolved as `${import.meta.env.BASE_URL}${image}`. WP-04 delivers the
  resolved URL; WP-07 does not compose paths.
- `legend` is a **list of at least two classes** `{value: number, color: "#rrggbb", label:
  string}`, consistent with example §4.3 of plan v2; it is not a free object and must be
  sorted by `value` in strictly increasing order (semantic validation).
- `provenance` requires `provider`, `product` and `processingVersion`. It admits
  `acquisitionDate` (ISO 8601 date or `null`), `sceneId`, `referenceUrl` and `note` (string or
  `null`). `additionalProperties: true` is kept for additive extensions of the scientific
  pipeline (for example CRID or NISAR SME2 maturity). The former `source` field is removed.
- The semantics of the values (`bbox` range, `min < max` in `range`, legend order,
  uniqueness of `id`, zone/layer coherence, `data/<datasetMode>/` prefix, existence and alpha of the
  PNG, `datasetMode`/`status` coherence and `imageCrs` values) belongs to the WP-04 validator
  (`frontend/scripts/validate-lib.mjs`), complemented by the schema's `if/then` and not
  by the minimal JSON Schema alone.

### 2.1 Product decision: global `bbox`, map centred on Spain

The contract **does not restrict zones to Spain**. The admitted range of `bbox` is the global one
(longitude ±180°, latitude ±90°) and it is kept that way deliberately: the team can test
manifests with real NISAR data from zones outside Spain without touching the schema or its
consumers. This decision does not change the visible product: the navigable map of WP-07 remains
centred on Spain (Mainland, Balearic Islands and Canary Islands) and the initial framing is not enlarged by
the mere presence of an external zone. `fitBounds` only applies to the selected zone.

### 2.2 A02-fix correction within v1.1.0

The first draft of A02 diverged from example §4.3 of plan v2 in three points:
`legend` was an object, `provenance` required `source` and `variable`, `range` and
`description` were missing. A02-fix corrected the schema before any consumers existed in Phase B;
therefore the version is still **1.1.0** (a correction prior to implementation, not a change
to an already deployed interface). From GA approval onwards, any change is governed by the
rule in section 4.

### 2.3 WP04-01 extension (additive) within v1.1.0

Node WP04-01 completed the JSON Schema and the validator with the rules that the freeze already
explicitly delegated to WP-04. **No fields are added, nothing is renamed and the
`bbox` order does not change**, so the existing manifests and fixtures remain valid and
`frontend/src/types/manifest.ts` requires no changes. The version declared by the manifests
remains `1.1.0`.

| Rule | Where it applies | Effect |
|---|---|---|
| `imageCrs` closed to `["EPSG:3857"]` | Schema | The overlay PNG is prepared in Web Mercator, north up and extent of `layer.bbox`. It used to be a free string "to be specified in WP-04". |
| `unit` not empty or whitespace-only | Schema (`minLength: 1` + pattern `\S`) | Prevents empty units in the legend and provenance. |
| `legend` with at least 2 stops | Schema (`minItems: 2`) | A scale needs at least two ends; example §4.3 uses three. |
| `legend` sorted by strictly increasing `value` | Semantics | The UI can paint the scale without reordering; repeated values are rejected. |
| Zone `id` in kebab-case | Schema (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) | Stable slugs (`jaen-demo`), without capitals, double hyphens or leading/trailing hyphens. |
| `datasetMode: sample` ⇒ every layer `synthetic`; `datasetMode: real` ⇒ every layer `processed_real` | Schema (`if/then`) and semantics | Blocks mixing examples with real data and vice versa. |
| `processed_real` requires `provenance.acquisitionDate`, `sceneId` and `referenceUrl` as non-null strings | Schema (`if/then`) and semantics | The real status is not granted without a date, scene/product identifier and reference URL. |
| `west < east`, `south < north` in zone and layer | Semantics | Valid geographic boxes. |
| `layer.bbox` within `zone.bbox` with `0.01°` tolerance | Semantics | Raster coverage cannot fall outside its study area. |
| `range` with strictly `min < max` | Semantics | The scale has a non-degenerate interval. |
| Unique zone `id` and unique layer `id` per zone | Semantics | Avoids ambiguous selections in the active manifest. |
| `image` under `data/<datasetMode>/` | Semantics | A `sample` manifest cannot reference `real` assets or vice versa. |
| `image` without any `%` | Schema (pattern), semantics and runtime (`assetUrl`) | The browser normalises percent-encoding: `%2e%2e` is equivalent to `..`, so any `%` is banned even if there is no literal `..`. |
| `acquisitionDate` is a real date | Schema (`format: date`/`date-time` with ajv-formats) and semantics (calendar) | `2026-10-19T11:19:03Z` (NISAR pipeline) and `2026-10-19` are accepted; `2026-13-45` or `2026-02-30`, which `Date.parse` would silently normalise, are rejected. |
| PNG existing in `frontend/public/` and with an alpha channel (colour type 4 or 6, or `tRNS`) | Semantics + assets | An overlay without transparency or a 404 is detected before publishing. |
| `schemaVersion` semver with major 1 | Schema + semantics | Only `1.x.y` contracts are admitted. |

The product decision on the **global** `bbox` (longitude ±180°, latitude ±90°, without restricting the
zones to Spain) remains unchanged and is recorded in §2.1. The navigable map is still
centred on Spain; the contract only allows testing external zones without touching the schema.

The semantic and asset logic lives in `frontend/scripts/validate-lib.mjs`, shared by the
CLI `frontend/scripts/validate-data.mjs` and the tests `frontend/src/types/contract.test.ts`.
The WP-04 runtime replicates in `frontend/src/services/manifestSemantics.ts` the minimal
subset of geometry and ids (`bbox` order, containment with 0.01° tolerance and uniqueness of
zone ids) to avoid loading `node:fs`/`node:path` in the browser; both implementations must
remain aligned and tested.
The contractual fixtures live in `frontend/scripts/fixtures/` and are **not** published in
`frontend/public/data/`; the fixture `real-with-processed-real.json` exists only to test the
`processed_real` status and explicitly declares that it is not a scientific observation.

### 2.4 C1 extension (additive, v1.2.0): timeline

Decision C1 (docs/c0-interfaces.md §6) adds **one optional property**,
`layer.timeSteps`, so that a real layer can carry several dates and the UI
offers a time control. It is a minor change per §4.1: it does not change
existing fields, does not alter the `bbox` order or the meaning of
`sample`/`real`, and v1.1.0 manifests without `timeSteps` still validate.

| Rule | Where it applies | Effect |
|---|---|---|
| `layer.timeSteps` is an array of ≥ 1 steps `{date, label?, image, bbox, provenance?}` | Schema | Unit, `range`, `legend` and `status` still belong to the layer and are common to all steps. |
| `schemaVersion: "1.2.0"` mandatory if there are `timeSteps`; without a series, `"1.1.0"` and `"1.2.0"` are admitted | Schema (`if/then` + `const`) and semantics | A manifest with a series cannot declare itself v1.1.0. |
| `date` a real ISO 8601 date and strictly increasing order without duplicates | Schema (`format`) and semantics | The slider does not receive impossible or repeated dates. |
| `image` of each step with the same safe rules and `data/<datasetMode>/` prefix | Schema, semantics and assets | Assets from different modes are not mixed and nothing outside `public/` is read. |
| `bbox` of each step within `zone.bbox` (0.01° tolerance) | Semantics | The coverage of any date stays within the zone. |
| `layer.image` and `layer.bbox` equal to those of the **last** step | Semantics and runtime | A v1.1 consumer that ignores `timeSteps` still shows the most recent date. |
| Effective provenance `{ ...layer.provenance, ...step.provenance }` with `acquisitionDate`, `sceneId` and `referenceUrl` in `processed_real` | Semantics | A real series with steps lacking traceability is not approved. |
| PNG of **each** step existing and with alpha | Assets (`validate:data`) | A 404 or an opaque PNG is detected before publishing. |

`frontend/src/types/manifest.ts` already exposed `TimeStep` and the fields
`timeSteps`/`selectedTimeIndex`/`selectTimeStep` frozen in C1; this
extension does not reinterpret them. The state (`useOliveTwinData`) chooses the last
step by default and resets the index when the mode, zone or layer changes.

### 2.5 v1.3.0 extension (additive): per-zone analysis cube

To measure variables of agronomic interest (moisture, radar backscatter,
vegetation, relief, soil and climate) and compare them cell by cell, a zone can
**optionally** link an analysis cube with `zone.analysis`. It is a minor change
per §4.1: it does not change existing fields or the `bbox` order, and
v1.1.0/v1.2.0 manifests still validate.

| Rule | Where it applies | Effect |
|---|---|---|
| `zone.analysis` = `data/<datasetMode>/zones/<zone.id>/analysis/analysis.json` | Schema (pattern) and semantics | The cube lives next to the zone and in the correct mode. |
| `schemaVersion: "1.3.0"` mandatory if any zone declares `analysis`; `timeSteps` admits `"1.2.0"` or `"1.3.0"` | Schema (`if/then`) and semantics | A v1.2 consumer does not receive fields it does not know about without a version warning. |
| The cube complies with [`contracts/analysis.schema.json`](../contracts/analysis.schema.json) | Its own schema | Common EPSG:3857 grid, variables with `scale`/`offset`, steps with statistics, zone series, unavailable sources and index criteria. |
| Data as **8-bit grey** PNGs (value = `offset` + `scale` · code; 255 = no data) with the exact grid size and ≤ 2 MB | Semantics and assets (`validate:data`) | Only PNG and JSON are published; never GeoTIFF/HDF5. |
| Steps of temporal variables with a real ISO date and strictly increasing order; static variables with a single step | Semantics | Series and change maps compare real dates. |
| `status` consistent with the mode and mandatory `provenance.license` | Schema and semantics | Each variable declares the licence and attribution of its source. |
| Suitability index criteria that point to existing variables | Semantics | The index does not reference missing data. |
| Optional `crops[]`: crop suitability with a global and per-factor raster (0–1), source with licence, assumptions and method; factors that use existing variables; unique ids | Schema, semantics and assets | Suitability maps are traceable and are validated like the rest of the cube. |
| Optional `cropFactor.classes` and `cropFactor.reference`; optional `crop.otherRequirements[]` with existing variables | Schema and semantics | The optimal / acceptable / unsuitable bands and the source of each requirement are published with the data; the UI does not invent them. |
| `variable.group` admits `landcover` (land use, e.g. CORINE) | Schema | Additive extension of the enum; previous cubes remain valid. |

The suitability index is **exploratory and relative to the zone** (weighted percentile
ranges): it is not an agronomic threshold or a harvest prediction, and the UI always says so.

## 3. Reference TypeScript types

```ts
export type DataMode = 'sample' | 'real';
export type BaseMap = 'pnoa' | 'osm';
export type ManifestLoadStatus = 'loading' | 'ready' | 'empty' | 'error';
export type BBox = [west: number, south: number, east: number, north: number];
```

These types are the reference contract. **`frontend/src/types/manifest.ts` is not created in
Phase A**: WP-04 materialises it from this agreement and remains the sole owner of the
file, avoiding a second competing module. WP-07 imports those types, it does not redefine them.

## 4. Change rule

1. **Additive (minor: 1.2.0, 1.3.0…):** new optional property, new reusable `$def`,
   new variant that does not break existing consumers or a documentation clarification. The JSON
   Schema and this document are updated in the same change.
2. **Incompatible (major: 2.0.0):** new mandatory field, change of type or semantics,
   removal or renaming of a field, change of the `bbox` order, or extension of an enum that
   consumers treat exhaustively (`datasetMode`, `status`, layer `id`).
3. Changing the `bbox` order or the meaning of `sample`/`real` is **always** major, without
   exceptions.
4. Every extension requires integration review of `contracts/` and an update of this
   document. An unapproved change is not considered part of the contract.
5. The example manifests (`frontend/public/data/{sample,real}/manifest.json`) are
   kept valid against the current version of the schema.

## 5. Ownership

| Scope | Owner |
|---|---|
| `contracts/`, `frontend/src/types`, services, composables, manifests and data scripts | **WP-04** |
| `frontend/src/components`, styles and Leaflet map | **WP-07** |
| Human owner of WP-04 and WP-07 | coordinated outside the repository (GA decision) |

The assignment of people to both work packets is coordinated **outside the repository** (GA decision, 48 h hackathon): it is neither recorded nor verified on GitHub. Only `AlRos14` appears as
a collaborator of the repository. What does govern inside the repo are the file scopes and the
independent review of each PR.

## 6. Verification of the freeze

Local validation of the two initial manifests, of the complete example §4.3 and of the
negative cases with JSON Schema draft 2020-12 (temporary script outside the repository, not
versioned):

```bash
npx -y ajv-cli@5 validate --spec=draft2020 \
  -s contracts/manifest.schema.json \
  -d frontend/public/data/real/manifest.json
```

Required negative cases:

| Case | Expected result |
|---|---|
| `datasetMode: "unknown"` | rejected by `enum` |
| `zones: null` | rejected by `type: array` |
| no `schemaVersion` | rejected by `required` |
| `legend` as an object | rejected by `type: array` |
| `image: "/abs.png"` | rejected by the safe-path pattern |
| `image: "../x.png"` | rejected by the safe-path pattern |
| `image: "data/sample/%2e%2e/x.png"` | rejected by the safe-path pattern (no `%`) |
| `acquisitionDate: "2026-13-45"` | rejected by `format: date` and by calendar semantics |

Evidence of the A02-fix run with `ajv@8.20.0` in draft 2020-12 mode, from
`frontend/` and with the runner in `/tmp` (not versioned), 18/18 checks correct:

- the complete example §4.3 of plan v2 (with `description`, `variable`, `range` and `legend`
  as a list): valid;
- empty `sample/manifest.json` and `real/manifest.json`: valid;
- `datasetMode: "unknown"`: invalid by `enum`;
- `zones: null`: invalid by `type: array`;
- no `schemaVersion`: invalid by `required`;
- `legend` as an object: invalid by `type: array`;
- `image: "/abs.png"` and `image: "../x.png"`: invalid by the path pattern;
- `provenance` without `provider` or without `processingVersion`: invalid by `required`;
- `provenance` with `source` and with extra fields `crid`/`maturity`: valid
  (`additionalProperties: true`), no longer requiring `source`;
- `range` with a single value, empty `legend` or a colour that is not `#rrggbb`: invalid;
- zone with a `bbox` outside Spain: valid, confirming that the contract is global.

The automation in CI belongs to A04 (`frontend/scripts/validate-data.*` and
`.github/workflows/ci.yml`); WP-04 will extend the schema and add semantic test cases.

## 7. Out of scope of this freeze

- Loading, caching or composables logic (WP-04).
- Generation of PNG, GeoTIFF, HDF5 or NISAR data (WP-04 / scientific pipeline).
- Components, styles, base map and Leaflet overlays (WP-07).
- Choice of hosting, Vite `base` and deployment (Phase B).
- Reference scientists, missions and real products: they are not declared without evidence.
