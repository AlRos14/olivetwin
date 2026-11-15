# OliveTwin manifest contract — v1.3.0

**Status:** frozen in Phase A (node A02), corrected in A02-fix to align with example §4.3 of plan v2. Additive extension C1 (v1.2.0) for the timeline, 2026-11-14. Additive extension v1.3.0 (per-zone analysis cube), 2026-11-15.
**Scope:** minimum structure shared by the data loader (WP-04) and the Vue + Leaflet interface (WP-07).
**Full agreement:** [`docs/contract-freeze.md`](../docs/contract-freeze.md).

This directory contains no loading logic, components or scientific data. It only fixes the
minimum contract so both work packets can advance in parallel without breaking. WP-04 is the
owner of `contracts/` and will extend this schema **additively**.

## Files

| File | Role |
|---|---|
| `manifest.schema.json` | JSON Schema draft 2020-12 of the minimum manifest. `$id`: `urn:olivetwin:contract:manifest:1.3.0`. |
| `analysis.schema.json` | JSON Schema of the per-zone analysis cube (v1.3.0), linked from `zone.analysis`. `$id`: `urn:olivetwin:contract:analysis:1.3.0`. |
| `README.md` | This document: conventions and local validation. |

Manifests watched by the contract:

| File | Mode | Zones in Phase A |
|---|---|---|
| `frontend/public/data/sample/manifest.json` | `sample` | `[]` |
| `frontend/public/data/real/manifest.json` | `real` | `[]` |

The absence of zones is intentional: Phase A prepares contracts, it does not display layers. A
`real` mode with `zones: []` will still be valid afterwards.

## Manifest structure

```json
{
  "schemaVersion": "1.2.0",
  "datasetMode": "sample",
  "appTitle": "OliveTwin",
  "zones": []
}
```

| Field | Type | Rule |
|---|---|---|
| `schemaVersion` | string | SemVer within major 1: pattern `^1\.[0-9]+\.[0-9]+$`. `1.1.0` (no series) and `1.2.0` are accepted; with `timeSteps`, `1.2.0` is mandatory. |
| `datasetMode` | string | Closed enum `sample` \| `real`. Mandatory. |
| `appTitle` | string | Not empty, not only spaces. Mandatory. |
| `zones` | array | Mandatory; it may be `[]`, but never `null`. |

Each zone (`$defs.zone`) requires `id`, `name`, `bbox` and `layers[]`, and optionally accepts
`description`. The zone `id` is a kebab-case slug
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`). Each layer (`$defs.layer`) requires `id`
(`ndvi` \| `soil-moisture`), `title`, `kind` (`image-overlay`), `image`, `bbox`,
`imageCrs` (`EPSG:3857`), non-empty `unit`, `status` (`synthetic` \|
`processed_real`), `legend`, `provenance` and `qualityNote`; it optionally accepts
`variable`, `range` (`[min, max]` of numbers) and, since v1.2.0, `timeSteps`
(list of at least one step `{date, label?, image, bbox, provenance?}`).

`legend` is a **list of at least two classes** with the shape
`{"value": number, "color": "#rrggbb", "label": string}`, as it appears in
example §4.3 of plan v2. It is not a free-form object and must be sorted by
`value` in strictly increasing order (semantic validation).

`provenance` requires `provider`, `product` and `processingVersion`; it accepts
`acquisitionDate`, `sceneId`, `referenceUrl` and `note` as string or `null`.
It deliberately keeps `additionalProperties: true` for additive extensions of
the scientific pipeline (for example CRID or NISAR SME2 maturity). The `source`
field of earlier draft versions does not exist.

`acquisitionDate` is a **real** ISO 8601 date, not just a correctly shaped
string: the schema applies the ajv-formats `date` (`2026-10-19`) and `date-time`
(`2026-10-19T11:19:03Z`) formats, which check the calendar, and the semantic
validator re-checks the components. Impossible dates such as `2026-13-45` or
`2026-02-30` are rejected.

The semantic validations (`west < east`, `south < north`, `layer.bbox` inside
`zone.bbox` with a tolerance of 0.01°, `min < max` in `range`, `legend` order,
uniqueness of zone `id` and of layer `id` per zone, `data/<datasetMode>/` prefix in
`image`, real acquisition dates, PNG existence and alpha channel) **are not**
part of this schema and belong to WP-04. They are implemented in
`frontend/scripts/validate-lib.mjs` and run with `npm run validate:data`
(see §Local validation). With `timeSteps` these are added: real ISO dates in
strictly increasing order without duplicates, each step's `bbox` inside
`zone.bbox`, `layer.image`/`layer.bbox` equal to the last step, prefix and PNG
of each step, and complete effective provenance per step in `processed_real`.

Coherence between `datasetMode` and `status` is expressed in the schema through
`if/then`: `sample` only accepts `synthetic` layers and `real` only
`processed_real`. In addition, `processed_real` requires
`provenance.acquisitionDate`, `sceneId` and `referenceUrl` as non-null strings.

## Analysis cube (v1.3.0)

A zone may declare `"analysis": "data/<mode>/zones/<id>/analysis/analysis.json"`.
That file describes:

- `grid`: common EPSG:3857 grid (`cellSizeM` m Web Mercator cells, row 0 = north)
  with its exact extent in WGS84 (`bbox`), `width` and `height`.
- `variables[]`: each with `scale`/`offset` to decode its 8-bit greyscale PNGs
  (value = `offset` + `scale` · code; 255 = no data), `displayRange`, `palette`,
  `temporal`, `description`, `caveat`, `status`, `provenance` (with `license`) and `steps[]`
  (`date`, `data`, precomputed `stats` and step provenance).
- `zoneSeries[]` optional: zone series (e.g. daily precipitation).
- `unavailable[]` optional: planned sources that could not be incorporated and why.
- `suitability` optional and retired (2026-11-15): exploratory relative suitability index; the
  pipeline no longer generates it and the interface does not use it (it remains in the schema for
  compatibility).
- `crops[]` optional: crop suitability (global and per-factor raster in 0–1, requirements with
  their source, assumptions and method).

Detail and rules: [`docs/contract-freeze.md`](../docs/contract-freeze.md) §2.5 and
[`docs/data-contract.md`](../docs/data-contract.md) §2.8.

## Frozen conventions

### 1. Contract version

- The current version is **1.2.0** (1.1.0 is still accepted if there is no `timeSteps`) and it is
  declared in `schemaVersion`.
- An **additive** change (new optional property, new reusable `$def`, documentation clarification)
  bumps the minor version: `1.2.0`, `1.3.0`…
- An **incompatible** change (new mandatory field, change of type, semantics, `bbox` order
  or of an exhaustively consumed enum) requires a major: `2.0.0`.
- Changing the `bbox` order, the meaning of `datasetMode` or the `status` values without bumping
  the major is not allowed.

### 2. `bbox` = `[west, south, east, north]`

- Four numbers in **decimal degrees**, **WGS84 / EPSG:4326** system.
- Order: `[west, south, east, north]`, that is `[minimum longitude, minimum latitude, maximum longitude, maximum latitude]`.
- Leaflet receives the box as `[[south, west], [north, east]]`; the conversion is
  the responsibility of WP-04/WP-07 and does not alter the stored order.
- The schema checks the global geographic range of each component (longitude ±180,
  latitude ±90); it does **not** restrict zones to Spain. It is a product decision: the navigable
  map remains centred on Spain, but the contract accepts zones outside it to
  test real NISAR data without changing the schema. See `docs/contract-freeze.md`.
- Checking that the box is valid (`west < east`, `south < north`) belongs to the
  WP-04 semantic validator.
- A layer's `bbox` describes the georeferencing of **its** PNG and may be equal to or tighter
  than the zone's.

### 3. Image paths relative to `public/`

The `image` field is a path **relative to `frontend/public/`**:

- no leading `/`: `data/sample/ndvi/jaen.png`, not `/data/sample/ndvi/jaen.png`;
- no `..`, no `:` (absolute URLs or drive letters) and no backslashes;
- **no `%` at all**: the browser normalises percent-encoding and
  `data/real/%2e%2e/%2e%2e/x.png` would resolve as `../..`. That is why the
  schema, the validator and runtime URL resolution reject any `%`, even if the
  path does not contain a literal `..`;
- the schema rejects those forms; the UI **does not** build paths on its own.

Resolution must respect Vite's `base` (GitHub Pages or another subpath):

```ts
const layerUrl = `${import.meta.env.BASE_URL}${layer.image}`;
```

`import.meta.env.BASE_URL` already ends in `/` according to the standard Vite
configuration. WP-04 exposes the resolved path; WP-07 only consumes it.

### 4. `sample` and `real` modes

- `sample` contains example material, explicitly synthetic.
- `real` contains real processed data. In Phase A it is empty, and that is a valid state.
- **There is no silent fallback**: if the chosen mode fails, is missing or is empty, the UI shows
  the corresponding state (`empty` or `error`). Real measurements are never replaced by
  examples without warning and without an explicit action by the user.
- The active mode is runtime state (`DataMode`); it is not persisted in the manifest as a
  user preference.

### 5. Layer `status`: `synthetic` vs `processed_real`

- `synthetic`: data generated for development or demonstration. It must be labelled as synthetic
  in the interface and **not** presented as a NASA observation.
- `processed_real`: data derived from a real source through the pipeline. It requires
  scientific approval and traceability; it is not declared without evidence.
- `provenance` complements `status` with mandatory provider (`provider`), product (`product`) and
  processing version (`processingVersion`), plus optional date, scene, reference URL and note.
  Do not invent missions, products, dates or URLs.

### 6. Load states

The reference values are `loading`, `ready`, `empty` and `error`. Their implementation
(service/composable) belongs to WP-04; the visual representation, to WP-07. They are not part
of the manifest JSON.

## Reference TypeScript types

```ts
export type DataMode = 'sample' | 'real';
export type BaseMap = 'pnoa' | 'osm' | 'pnoa-sigpac';
export type ManifestLoadStatus = 'loading' | 'ready' | 'empty' | 'error';
export type BBox = [west: number, south: number, east: number, north: number];
```

`frontend/src/types/manifest.ts` **is not created in Phase A**. WP-04 will materialise it from
[`docs/contract-freeze.md`](../docs/contract-freeze.md) and will be its sole owner, to
avoid a second competing module.

## Local validation

Without installing dependencies in the repository (A04 CI will automate this check):

```bash
npx -y ajv-cli@5 validate --spec=draft2020 \
  -s contracts/manifest.schema.json \
  -d frontend/public/data/sample/manifest.json \
  -d frontend/public/data/real/manifest.json
```

Since WP04-01, the full check (schema + semantics + PNG existence and alpha
channel) runs with:

```bash
npm run validate:data --prefix frontend
```

The negative cases in `frontend/scripts/fixtures/invalid/` cover, among others,
inconsistent `datasetMode`/`status`, inverted `bbox`, layer outside the zone,
absolute `image` paths, with `..`, with `%` or with an external URL, unsupported
`imageCrs`, duplicate zone ids, unordered legend, inverted `range` and impossible
acquisition dates.

Minimum negative cases the contract must reject:

1. `datasetMode: "unknown"` → fails the `enum`.
2. `zones: null` → fails `type: array`.
3. manifest without `schemaVersion` → fails `required`.
4. `legend` as an object instead of a list → fails `type: array`.
5. `image: "/abs.png"` → fails the safe-path pattern (no leading `/`).
6. `image: "../x.png"` → fails the safe-path pattern (no `..`).
7. `image: "data/sample/%2e%2e/x.png"` → fails the safe-path pattern (no `%`).
8. `provenance.acquisitionDate: "2026-13-45"` → fails the `date`/`date-time` format
   and the semantic calendar check.
9. `timeSteps` out of order, with duplicate dates, with a step outside the zone,
   with `layer.image` different from the last step or declared with `schemaVersion: "1.1.0"`
   → rejected by the semantics or by the schema's `if/then`.

A manifest with `zones: []` and `sample` or `real` mode must be accepted. The
full example §4.3 of plan v2 (zone with `description`, layer with `variable`,
`range` and `legend` as a list, `provenance` with `provider`/`product`/
`processingVersion`) must validate unchanged.

The A02-fix acceptance check was run with `ajv@8.20.0` in draft 2020-12 mode
from `frontend/`, with the temporary script outside the repository:
18/18 checks correct (valid, minimum negatives and additive `provenance`
extensions).

## Ownership and changes

| Scope | Owner |
|---|---|
| `contracts/`, `frontend/src/types`, services, composables, manifests and data scripts | WP-04 |
| `frontend/src/components`, styles and Leaflet map | WP-07 |
| Human owner of WP-04 and WP-07 | coordinated outside the repository (GA decision) |

Any extension of the contract requires integration review and updating
`docs/contract-freeze.md`. WP-07 does not edit this directory or the manifests.
