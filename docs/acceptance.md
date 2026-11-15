# G2 — OliveTwin demo acceptance

**Date:** 2026-11-14 · **Verdict:** **PASS with limitations** (scientific and environment limitations, not functional).
**Independent review:** a reviewing agent other than the implementers (PASS, 0 blockers; 4 minor documentation findings fixed in this same PR).
**Human approval:** project owner (`AlRos14`): scope decisions (real data only, timeline) and scientific approval of the published data.

## What works (verified in real Chromium and in CI)

- Static Vue 3 + Vite + TS + Leaflet app, no backend; normal build and under the `/olivetwin/` subpath.
- Map of Spain with PNOA (default) or OSM, visible attributions and Spain/Canary Islands controls.
- **Real** NISAR L3 SME2 data (surface soil moisture, PROVISIONAL, CRID P05023) in **Jaén** and **Toledo**, 3 dates each
  (2026-06-20, 2026-07-02, 2026-07-14), common scale 0.05–0.40 m³/m³, verified georeferencing (25/25 pixels per scene
  in the pipeline; overlay aligned with its bbox in the browser, AT-19).
- Timeline: slider with previous/next/play, no flicker; provenance per date (scene, CRID, UTC time).
- Opacity, visibility, legend, provenance, persistent PROVISIONAL notice, explicit error on a broken manifest or a 404 PNG.
- Contract v1.2.0 with schema, semantics and runtime validation; pipeline `pipelines/nisar/sme2_to_overlay.py` to add
  zones/dates without touching Vue (`docs/handoff-science.md`).

## Evidence

| Check | Result |
|---|---|
| CI (`ci`: validate:data, vitest, build, pytest) | green in the PR |
| Vitest | 259 tests |
| `validate:data` | 35 checks |
| NISAR pipeline pytest | 19 tests |
| Playwright E2E | `docs/qa-results.md`, screenshots `docs/qa/real-*.jpg` |

## Limitations (explicit)

- **Scientific:** SME2 PROVISIONAL, not fully calibrated; surface soil moisture (~5 cm) ≠ irrigation need; Jaén
  (ascending, ~05:23 UTC) and Toledo (descending, ~19:09 UTC) are observed at different times of day; the 2026-07-14 scene
  has a different production tag (`F_F_J`) and its decrease may be partly due to processing. No SME2 quality flags applied.
- **Out of scope:** real NDVI, SIGPAC, A/B comparator, kg/ha, prediction, per-pixel query.
- **Environment:** PNOA and OSM are external services; the E2E use an external Playwright harness and do not run in CI.
- **Deployment:** not published to GitHub Pages yet; the demo runs with `npm run dev` or `npm run build && npm run preview`.

## How to reproduce

```bash
cd frontend && npm ci && npm run validate:data && npm test && npm run build && npm run preview
```
