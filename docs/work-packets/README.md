# OliveTwin work packets

This directory brings together the project's execution plans and the status of their
nodes. The plans are working documents: they describe the agreed scope, they do not
replace the contract or the QA report.

## Plans

| Plan | Content | Status |
|---|---|---|
| [`OliveTwin_Fase_A_Baseline_GitHub.md`](OliveTwin_Fase_A_Baseline_GitHub.md) | GitHub baseline: repository, Vue bootstrap, minimal contract, governance, CI and review (nodes A00–A05). | Executed; independent review in [`docs/baseline-review.md`](../baseline-review.md). |
| [`OliveTwin_WP04_WP07_Plan_Actualizado.md`](OliveTwin_WP04_WP07_Plan_Actualizado.md) | Plan v2 of the "demo of the demo": WP-04 (data and contract) and WP-07 (map and UI) in parallel, integration, QA and acceptance. | Executed and integrated; QA in [`docs/qa-results.md`](../qa-results.md). |

> **Note on images:** the plans reference DAG diagrams in PNG
> (`OliveTwin_Fase_A_DAG.png` and `OliveTwin_WP04_WP07_DAG.png`). Those binaries are not
> versioned in this repository; the equivalent diagrams in Mermaid and in
> text are included in each plan.

## Phase A — baseline (A00–A05)

| Node | Content | Status | Evidence |
|---|---|---|---|
| A00 | Repository and access | Done | Real private repository verified in `docs/baseline-review.md`. |
| A01 | Tree and Vue 3 + Vite + TypeScript bootstrap | Integrated | `frontend/` compiles; `npm run build` documented in the review. |
| A02 | Minimal contract v1.1.0 and examples | Frozen | [`docs/contract-freeze.md`](../contract-freeze.md) and [`contracts/`](../../contracts/). |
| A03 | Git governance, agents and PR template | Integrated | [`AGENTS.md`](../../AGENTS.md), [`docs/contributing.md`](../contributing.md) and the template in `.github/`. |
| A04 | CI and manifest validation | Integrated | `ci` check green and `npm run validate:data` in CI. |
| A05 | Independent review and baseline PR | PASS with limitations | [`docs/baseline-review.md`](../baseline-review.md). The merge is an act of the human owner. |

## Phase B — WP-04 ∥ WP-07 (demo of the demo)

Interfaces frozen in [`docs/c0-interfaces.md`](../c0-interfaces.md). Nodes
PRE00/PRE01/PRE02/C0 of plan v2 were satisfied by the Phase A baseline and by the
C0 document; they were not repeated.

### WP-04 — Architecture, contracts and data

| Node | Content | Status | Evidence |
|---|---|---|---|
| WP04-01 | JSON Schema v1.1.0, TypeScript types and fixtures | Integrated | `contracts/manifest.schema.json`, `frontend/src/types/manifest.ts`. |
| WP04-02 | Sample generator and data (Jaén and Toledo), empty real manifest | Integrated and **withdrawn** in the final demo (real data only, see `docs/c0-interfaces.md` §7) | `frontend/public/data/real/`. |
| WP04-03 | Manifest loader with `BASE_URL`, validation and errors | Integrated | `frontend/src/services/`. |
| WP04-04 | State composable `sample`/`real`, selection and cancellation | Integrated | `frontend/src/composables/useOliveTwinData.ts`. |
| WP04-05 | Scientific handoff and contract reference | Integrated | [`docs/handoff-science.md`](../handoff-science.md), [`docs/data-contract.md`](../data-contract.md). |

### WP-07 — Frontend, cartography and interaction

| Node | Content | Status | Evidence |
|---|---|---|---|
| WP07-01 | Leaflet map, PNOA/OSM, Spain and Canary Islands | Integrated | `frontend/src/components/OliveMap.vue`. |
| WP07-02 | Zones, outlines and `fitBounds` from props | Integrated | `frontend/src/components/StudyZoneMarkers.vue`. |
| WP07-03 | PNG overlays by `bbox`, opacity and lifecycle | Integrated | `frontend/src/components/ScientificOverlay.vue`. |
| WP07-04 | Panel, selectors, legend, provenance and notices | Integrated | Components in `frontend/src/components/` and `frontend/src/styles/ui.css`. |

### Integration and acceptance

| Node | Content | Status | Evidence |
|---|---|---|---|
| INT01 | Final composition in `App.vue` and props/emits wiring | Integrated | `frontend/src/App.vue`. |
| INT02 | Tests, build, E2E and visual smoke test | Completed | [`docs/qa-results.md`](../qa-results.md); specs in `frontend/tests/e2e/`. |
| G2 | Final acceptance with independent review and human approval | **Pending** | `docs/acceptance.md` does not exist; human approval cannot be replaced by an agent. |

## Documentary corrections after QA

| Issue | Description | Status |
|---|---|---|
| B-01 | `README.md` and `frontend/README.md` described Phase A and denied the map and the layers. | Fixed in the documentation branch; pending independent review. |
| B-02 | `docs/work-packets/` only contained a placeholder. | Fixed with this index and the copy of the two plans; pending independent review. |

The details of both bugs are in [`docs/qa-results.md`](../qa-results.md) §6.
