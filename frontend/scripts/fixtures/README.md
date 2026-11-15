# Data validator fixtures (A04 + WP04-01)

Self-test cases run by `npm run validate:data` and
`frontend/src/types/contract.test.ts`. The script discovers them by folder and by
`.json` extension; there is no hard-coded list of names.

Fixtures are contractual test material: **they are not observations** and are
not served from `frontend/public/data/`. The PNG existence/alpha check
is disabled for them; the schema and semantic validation do apply.

## `valid/`

They must validate against `contracts/manifest.schema.json` and the semantic rules.

| Fixture | What it covers |
|---|---|
| `sample-empty.json` | `sample` manifest with `zones: []` (real Phase A state). |
| `real-empty.json` | `real` manifest with `zones: []`; the empty mode is valid. |
| `sample-plan-4.3.json` | Full example from section 4.3 of plan v2 (zone, NDVI layer, three-class legend, synthetic provenance). |
| `real-with-processed-real.json` | `real` zone with a `processed_real` layer and complete `provenance` (date, scene and URL). It is a **contractual fixture** for AT-16: it must not be published in `data/real/` or presented as scientific data. |
| `sample-with-timesteps.json` | `sample` manifest v1.2.0 with three ordered time steps, the last one equal to `layer.image`/`bbox`, and partial `provenance` in one step. |
| `real-with-timesteps.json` | `real` manifest v1.2.0 with `processed_real` and complete effective provenance in every step. Contractual fixture; it is not a real observation. |

## `invalid/`

They must be rejected by the schema or by semantic validation. The JSON has
to parse: if a fixture were malformed, the script reports it as an
error in the fixture itself.

| Fixture | Error it represents |
|---|---|
| `unknown-dataset-mode.json` | `datasetMode: "unknown"` outside the `sample`/`real` enum. |
| `zones-null.json` | `zones` is not an array. |
| `missing-schema-version.json` | `schemaVersion` is missing, which is mandatory. |
| `layer-legend-object.json` | `legend` is an object instead of the ordered `{value, color, label}` list. |
| `status-processed-real-in-sample.json` | `sample` mode with a `processed_real` layer. |
| `status-synthetic-in-real.json` | `real` mode with a `synthetic` layer. |
| `bbox-inverted.json` | `zone.bbox` with west ≥ east; it also invalidates layer containment. |
| `layer-outside-zone.json` | `layer.bbox` outside `zone.bbox` beyond the 0.01° tolerance. |
| `image-absolute-path.json` | `image` path with a leading `/` (`/x.png`). |
| `image-parent-traversal.json` | `image` path with `..` (`../x.png`). |
| `image-percent-encoded.json` | `image` path with percent-encoding (`%2e%2e`, which the browser normalises as `..`). |
| `image-external-url.json` | External URL in `image` (`https://x/y.png`). |
| `acquisition-date-impossible.json` | `provenance.acquisitionDate` with an impossible date (`2026-13-45`). |
| `image-crs-unsupported.json` | `imageCrs` other than `EPSG:3857`. |
| `image-wrong-mode-directory.json` | `image` from `real` referenced from a `sample` manifest. |
| `duplicate-zone-ids.json` | Two zones with the same `id`. |
| `legend-unordered.json` | Legend stops not sorted by `value`. |
| `legend-single-stop.json` | Legend with a single stop (minimum: two). |
| `range-inverted.json` | `range` with `min` ≥ `max`. |
| `zone-id-not-kebab.json` | Zone `id` that does not satisfy kebab-case (`Jaen_Demo`). |
| `timesteps-unordered.json` | `timeSteps` with non-increasing dates. |
| `timesteps-duplicate-date.json` | Two steps with the same `date`. |
| `timesteps-last-step-mismatch.json` | `layer.image` does not match the `image` of the last step. |
| `timestep-outside-zone.json` | An intermediate step with `bbox` outside `zone.bbox`. |
| `timesteps-processed-real-step-missing-scene.json` | `processed_real` with a step whose effective provenance leaves `sceneId` as `null`. |
| `timesteps-schema-version-1.1.0.json` | `timeSteps` declared with `schemaVersion: "1.1.0"` instead of `"1.2.0"`. |
