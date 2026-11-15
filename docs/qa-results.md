# OliveTwin demo QA — E2E results

Results of the end-to-end tests (Playwright) of the demo with
real NISAR data from Jaén and Toledo, and evidence screenshots in
[`qa/`](qa/). The instructions to reproduce them are in
[`frontend/tests/e2e/README.md`](../frontend/tests/e2e/README.md).

> The historical Phase A run (sample mode with synthetic data,
> scenarios AT-01…AT-20 and SAMPLE-01…08) was removed from the report and its screenshots
> were deleted on 2026-11-15: they described an interface that no longer exists. It is still
> available in the git history.

## Current status (2026-11-15)

| Spec | Result |
|---|---|
| `app.spec.ts` (10 scenarios: opening, slider, Toledo, Satellite view ↔ General view, broken manifest, alignment with the cube grid, Analysis and suitability, Compare, mobile, console and network) | 10 / 10 passed |
| `subpath.spec.ts` (manifest, cube and data PNGs under `/olivetwin/`) | 1 / 1 passed |

Current screenshots: `qa/real-01…12` (`real-12-comparar.jpg` corresponds to the
Compare tab) and `qa/consola-red.json` (no application errors). The
AI interpretation is not part of the E2E because it depends on an external
model; it was tested manually with Ollama and `gemma3:4b`.

## 1. Re-run 2026-11-14 — real-data-only demo (INT-R)

**Node:** INT-R (R1 role, integration) · **Branch/worktree:** `b/intreal`
**Scope:** removal of the sample data, Jaén auto-selection, 3-date
timeline and PROVISIONAL notice. The E2E were adapted to the real layer.

### 1.1 Commands and results

| Command | Result |
|---|---|
| `npm ci --prefix frontend` | OK (140 packages; `EBADENGINE` warnings from dependencies, no error). |
| `npm run validate:data --prefix frontend` | **OK — 35 checks, 0 failures**: `sample/manifest.json` skipped as optional and `real/manifest.json` valid with its 6 PNGs. |
| `npm test --prefix frontend` | **OK — 18 files, 259 tests**. |
| `npm run build --prefix frontend` | OK; `vue-tsc -b` + `vite build` (JS 409.00 kB, CSS 27.78 kB). |
| `npm run build --prefix frontend -- --base /olivetwin/` | OK; build under subpath generated. |
| `npx playwright test app.spec.ts` | **OK — 8/8** with the external harness (`scratchpad/qa-harness`, Playwright 1.64.0). |
| `npx playwright test subpath.spec.ts` | **OK — 1/1** with `OLIVE_SUB_URL=http://localhost:4174/olivetwin/`. |
| Restoring with `npm run build --prefix frontend` | OK; `dist/` returns to the normal base. |

### 1.2 E2E scenarios

| Scenario | Result | Evidence |
|---|---|---|
| Open → Jaén auto-selected, overlay and 3-date slider; no "SIMULATED DATA" | **PASS** | `docs/qa/real-01-jaen.jpg` |
| Moving the slider changes `src` without recreating the `<img>` (same element); play advances | **PASS** | `docs/qa/real-02-slider-primer-paso.jpg`, `real-03-reproduccion.jpg` |
| Switching to Toledo resets to the last step and keeps a single overlay | **PASS** | `docs/qa/real-04-toledo.jpg` |
| PNOA ↔ OSM keeps the overlay, the opacity and the same image | **PASS** | `docs/qa/real-05-osm-overlay.jpg` |
| Broken real manifest ⇒ visible error, no zones or overlay | **PASS** | `docs/qa/real-06-json-roto.jpg` |
| AT-19 · overlay aligned with the real `bbox` and PNG with transparency | **PASS** | `docs/qa/real-07-overlay-bbox.jpg` |
| Mobile 390×844: the timeline lives inside the panel and there is no overflow | **PASS** | `docs/qa/real-08-movil.jpg` |
| AT-17 · build under `/olivetwin/`: manifest, PNG, overlay and slider under the subpath | **PASS** | `docs/qa/real-09-subruta.jpg` |
| Console and network: no JS errors or 4xx/5xx responses from the application | **PASS** | `docs/qa/consola-red.json` |

The screenshots are JPEG quality 70 and weigh less than 500 KB. The PNOA
and OSM tiles are external: waiting for tiles is *best-effort* and a network failure does not
turn into an application failure. The console report records only
cancelled tile requests, not application errors.

### 1.3 Limitations of this re-run

- The product shown is NISAR L3 SME2 **PROVISIONAL**; its
  scientific calibration is not validated in QA, only the integration and georeferencing.
- Jaén is observed on an ascending pass (~05:23 UTC) and Toledo on a descending
  one (~19:09 UTC); the comparison between zones includes the time of day.
- The E2E remain outside CI and require the external Playwright harness.
- The mobile screenshot is viewport emulation, not a physical device.

## 2. E2E re-run of 2026-11-15 (analysis cube v1.3.0)

External harness with `@playwright/test@1.65.1` and Chrome Headless Shell 159,
against `vite preview` (normal build on `:4173` and build with `--base /olivetwin/`
on `:4174`). Specs adapted to the current behaviour: Layers starts with the
cube's soil moisture (10 dates, image computed in the browser), a
single variable drop-down and the Analysis tab without a map.

| Spec | Result |
|---|---|
| `app.spec.ts` (9 scenarios: opening, slider, Toledo, PNOA↔OSM, broken manifest, AT-19 alignment with the cube grid, Analysis and suitability, mobile, console and network) | 9 / 9 passed |
| `subpath.spec.ts` (AT-17, manifest, cube and data PNGs under `/olivetwin/`) | 1 / 1 passed |

Screenshots regenerated in `docs/qa/real-01…09` and new `real-10-analisis.jpg` and
`real-11-aptitud.jpg`; `docs/qa/consola-red.json` without application errors.
The AI interpretation is not part of the E2E (it depends on an external
model); it was tested manually with Ollama and `gemma3:4b`.
