# C0 — Frozen interfaces for Phase B (WP-04 ∥ WP-07)

**Status:** frozen on 2026-11-14 by R1 (orchestration). It complements `docs/contract-freeze.md`
(data contract v1.1.0). Changing anything in this document is an **interface change**: open an Issue
and block only the affected nodes.

## 1. Types

`frontend/src/types/manifest.ts` — **WP-04 owner**. Created in C0 as a stub; WP-04 only extends it
additively. WP-07 imports it and does not modify it.

## 2. State provider (WP-04)

`frontend/src/composables/useOliveTwinData.ts` exports:

```ts
export function useOliveTwinData(options?: { initialMode?: DataMode; fetchImpl?: typeof fetch }): {
  vm: DeepReadonly<OliveTwinViewModel>          // reactive, read-only for the UI
  selectedZone: ComputedRef<StudyZone | null>
  selectedLayer: ComputedRef<StudyLayer | null>
  overlay: ComputedRef<ActiveOverlay | null>    // URL already resolved with BASE_URL
} & OliveTwinActions
```

Rules:

- *(C0 historical note: the initial mode was `sample`; since §7 it is `real`.)* Empty real data → `loadStatus: 'empty'`. Broken JSON, 404 or invalid schema →
  `'error'` + `errorMessage`. `sample` is **never** used as a fallback.
- Each `setDataMode`/`reload` invalidates the previous load (AbortController or counter): a late
  response never overwrites the current mode.
- When the mode changes: `selectedZoneId = null`, `selectedLayerId = null`. When the zone changes: layer = the
  first one available in the zone, or `null`.
- `overlay` is `null` if there is no valid zone and layer in the **active** manifest.
- The services (`frontend/src/services/`) resolve `image` with `import.meta.env.BASE_URL` and reject
  paths with a leading `/`, `..`, `:` or `\`.

## 3. Components (WP-07)

Props and emits only; no component performs `fetch`, builds paths or imports services or composables.

| Component | Props | Emits |
|---|---|---|
| `OliveMap.vue` | `baseMap: BaseMap`, `zones: StudyZone[]`, `selectedZoneId: string \| null`, `overlay: ActiveOverlay \| null` | `select-zone(id: string)`, `basemap-error(baseMap: BaseMap)` |
| `StudyZoneMarkers.vue` | (child of OliveMap) `map: L.Map`, `zones`, `selectedZoneId` | `select-zone(id)` |
| `ScientificOverlay.vue` | (child of OliveMap) `map: L.Map`, `overlay: ActiveOverlay \| null` | `image-error(url: string)` |
| `DataModeSwitch.vue` | `modelValue: DataMode` | `update:modelValue(mode)` · *removed on 2026-11-15 (unused)* |
| `ZoneSelector.vue` | `zones`, `modelValue: string \| null`, `disabled?: boolean` | `update:modelValue(id \| null)` |
| `LayerPanel.vue` | `zone: StudyZone \| null`, `selectedLayerId`, `opacity: number (0–1)`, `visible: boolean`, `baseMap: BaseMap` | `select-layer(id)`, `update:opacity(n)`, `update:visible(b)`, `update:baseMap(b)` |
| `LayerLegend.vue` | `layer: StudyLayer \| null` | — |
| `DataProvenance.vue` | `layer: StudyLayer \| null`, `dataMode: DataMode` · *removed on 2026-11-15 (unused)* | — |
| `StatusBanner.vue` | `dataMode`, `loadStatus`, `errorMessage`, `hasSyntheticLayer: boolean`, `overlayError: string \| null`, `basemapError: BaseMap \| null` | `retry()`, `switch-basemap(baseMap: BaseMap)`, `dismiss-overlay-error()` |

- Framing: initial view of peninsular Spain + Balearic Islands; `OliveMap` includes its own
  "Canary Islands" control (and "Spain") to jump to the archipelago. `fitBounds` (with padding) only when
  `selectedZoneId` changes to an existing zone; if it becomes `null` (e.g. a mode change) the view returns to
  Spain. The active zone is derived from `zones` + `selectedZoneId`. Navigation is not restricted to Spain.
- Overlay or base map failure: the map remains usable; `OliveMap` re-emits `image-error(url)` from
  `ScientificOverlay` and emits `basemap-error`. `StatusBanner` shows "The layer image is not
  available" and, for PNOA, "The PNOA orthophoto is not responding" with a "Use OpenStreetMap" button
  (`switch-basemap('osm')`).
- `leaflet/dist/leaflet.css` is imported by `OliveMap.vue`; each component imports its sheet (`map.css` /
  `ui.css`).
- The base map state (`pnoa`/`osm`) is held by `App.vue`; `pnoa` by default. Changing it does not touch the
  overlay or the opacity.
- PNOA: `https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{-y}.jpeg` with `{-y}` and **without** `tms: true`.
  OSM: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Attributions always visible.
- Leaflet: `bbox [w,s,e,n]` → `L.latLngBounds([[s,w],[n,e]])`.
- Persistent "SIMULATED DATA" notice if `hasSyntheticLayer` or `dataMode === 'sample'`. *(C0 historical note; since §7 the app starts in `real` and there is no sample mode.)*

## 4. Integration (INT01)

Only INT01 edits `frontend/src/App.vue` and `frontend/src/main.ts`: it instantiates `useOliveTwinData()`,
keeps `baseMap`, `overlayError` and `basemapError`, and wires props/emits.

- `hasSyntheticLayer = selectedLayer?.status === 'synthetic'`.
- `overlayError` is cleared when the layer, zone or mode changes; `basemapError` when the base map changes.
- The text "There are no zones with real scientific data yet" is shown by `StatusBanner` with
  `loadStatus === 'empty'`; `ZoneSelector` is left `disabled` with no zones.

## 5. File ownership in Phase B

| Node | Exclusive scope |
|---|---|
| WP04-01 | `contracts/`, `frontend/src/types/`, `frontend/scripts/validate-data.mjs`, `frontend/scripts/fixtures/` |
| WP04-02 | *(withdrawn in §7)* ~~`scripts/generate-sample-data.mjs`, `frontend/public/data/sample/`~~; `frontend/public/data/real/` |
| WP04-03 | `frontend/src/services/` |
| WP04-04 | `frontend/src/composables/` |
| WP04-05 | `docs/data-contract.md`, `docs/handoff-science.md` |
| WP07-01..03 | A single agent/owner (R4), in sequence 01 → 02 → 03: `frontend/src/components/OliveMap.vue`, `StudyZoneMarkers.vue`, `ScientificOverlay.vue`, `frontend/src/components/map/`, `frontend/src/styles/map.css` |
| WP07-04 | `frontend/src/components/{DataModeSwitch,ZoneSelector,LayerPanel,LayerLegend,DataProvenance,StatusBanner}.vue`, `frontend/src/styles/ui.css` |
| INT01 | `frontend/src/App.vue`, `frontend/src/main.ts`, `frontend/src/style.css` |
| INT02 | `frontend/tests/`, `docs/qa-results.md` |
| G2 | `docs/acceptance.md` |

The unit tests live next to each node's code (`*.test.ts` in its own scope). Vitest includes
`src/**`, `tests/**` and `scripts/**` (`*.test.ts` / `*.test.mjs`).
Dependencies: installed only once in C0 (`leaflet`, `vitest`, `@vue/test-utils`, `jsdom`, `pngjs`).
Nobody else edits `frontend/package.json` without coordinating with R1.

## 6. C1 — Timeline (contract v1.2.0, additive) — 2026-11-14

Project owner's decision: real layers may carry **several dates** and the UI offers
a **time slider**. Additive change: v1.1.0 manifests remain valid.

### 6.1 Contract (WP-04)

- `layer.timeSteps?: TimeStep[]` (≥ 1). `TimeStep = { date, label?, image, bbox, provenance? }`
  (`frontend/src/types/manifest.ts`). `date` is a valid ISO 8601 timestamp (date or date-time); steps in
  strictly increasing `date` order, without duplicates.
- `image` of each step: same safe-path rules and `data/<datasetMode>/` prefix; an existing PNG with
  alpha. The `bbox` of each step within `zone.bbox`.
- `layer.image` and `layer.bbox` = those of the **last** step (v1.1 compatibility).
- Unit, `range`, `legend` and `status` are common to all steps (the scale is fixed through time,
  essential to compare dates).
- The step's `provenance` is partial and overrides the layer's. In `processed_real`, the effective
  provenance of **each** step must meet the same requirements (`acquisitionDate`, `sceneId`,
  `referenceUrl`).
- Manifests that use `timeSteps` declare `schemaVersion: "1.2.0"`.

### 6.2 State (WP-04, `useOliveTwinData`)

- `vm.selectedTimeIndex`; action `selectTimeStep(index)`; additional computed `activeTimeStep`.
- When selecting a layer (or a zone, which selects its first layer): index = the **last** step if there are
  `timeSteps`, otherwise `null`. Changing mode/zone/layer resets the index.
- `overlay.url`/`overlay.bbox` come from the active step; `overlay.timeIndex` and `overlay.timeStep`
  identify it.

### 6.3 UI (WP-07)

| Component | Props | Emits |
|---|---|---|
| `TimeSlider.vue` (new) | `steps: TimeStep[]`, `modelValue: number \| null` | `update:modelValue(index: number)` |
| `DataProvenance.vue` | + `timeStep?: TimeStep \| null` (effective provenance of the step). Removed on 2026-11-15 (§7). | — |

- `TimeSlider` only renders with ≥ 2 steps. `range` slider (step 1) with `aria-valuetext` = date,
  previous/next and play/pause buttons (advances ~1.5 s per step, stops at the last one,
  is cancelled on unmount or when `steps` changes; respects `prefers-reduced-motion` without autostart).
  Ticks with the dates (ISO 8601 format, UTC). No inert controls.
- `ScientificOverlay`: if only `url`/`timeIndex` changes (same zone, layer and bbox) it uses `setUrl` instead
  of recreating, so the animation does not flicker; it preloads the next step's image.
- The legend does not change between steps.

### 6.4 Integration and pipeline

- INT: `App.vue` places `TimeSlider` over the map (bottom, centred; on mobile inside the panel),
  connected to `data.selectTimeStep`.
- `pipelines/nisar/sme2_to_overlay.py --publish` writes **all** dates as `timeSteps`
  (`data/real/zones/<zone>/soil-moisture/<date>.png`), with a common fixed scale.

## 7. Product decision: the demo uses real data only (2026-11-14)

The project owner decided that the demo **does not include sample data**.
Only real NISAR L3 SME2 data from Jaén and Toledo are published and shown, with the
timeline from §6. Integration consequences (without changing the frozen interfaces
of §1–§3):

- `App.vue` instantiates `useOliveTwinData({ initialMode: 'real' })`, does not render
  `DataModeSwitch` and offers no switch to `sample`. The component was removed on
  2026-11-15.
- `StatusBanner` always receives `dataMode: 'real'`; it never shows "SIMULATED
  DATA". The persistent header notice states that the product is
  PROVISIONAL and that surface soil moisture is not equivalent to irrigation.
- `frontend/public/data/sample/` and the `generate:sample` script are removed.
  `validate:data` treats the `sample/` manifest as **optional** and the `real/` one
  as **mandatory**.
- The contract and the fixtures still accept `datasetMode: "sample"`; this is not a
  schema change.
- The demo auto-selects the first zone on load to show data immediately;
  both zones remain visible and selectable.

**Update 2026-11-15 (project owner's decision):** the
interface no longer shows the persistent header notice, the
"Provenance and quality" panel (`DataProvenance.vue`, later removed as unused) or the warning texts of the Analysis, Twins and
Story tabs (legend notes, notice and rationale for the
suitability criteria, "What it is and what it is not", "Unavailable sources" and "What cannot be
concluded"). The subtitle keeps "PROVISIONAL NISAR data". The provenance, the
licences and the limitations remain declared in the manifest, in the analysis
cubes and in the documentation, and `validate:data` still requires them. The
synthetic-data notices (`StatusBanner`, legend) are kept.

## 8. Analysis cube (contract v1.3.0, additive) — 2026-11-15

Goal: measure variables of agronomic interest (NISAR moisture, GCOV backscatter,
NDVI/NDMI, relief, soil and climate) and compare them cell by cell. Contract:
[`contracts/analysis.schema.json`](../contracts/analysis.schema.json) and
[`docs/contract-freeze.md`](contract-freeze.md) §2.5.

### 8.1 Data (WP-04)

- Types: `frontend/src/types/analysis.ts` (includes `CropSuitability`, `CropFactor`,
  `AnalysisRaster`); `StudyZone.analysis?: string`.
- Services: `analysisService.ts` (loads and validates the cube; `loadRaster` decodes
  any raster), `pngGray.ts` (8-bit grey PNG without canvas), `analysisMath.ts`
  (cells, aggregates, difference), `seriesAnalysis.ts` (interval, uniform sampling
  of dates with a maximum of `MAX_SAMPLES = 12`, trend, cell-by-cell change, previous
  rainfall and interval climate), `cropSuitability.ts` (bands and limiting factor),
  `cropRequirements.ts` (published requirement of each variable for a crop and
  distribution of the zone into optimal / acceptable / unsuitable; it never invents thresholds),
  `dateFormat.ts` (ISO 8601 dates in UTC),
  `palettes.ts`, `llmClient.ts` (OpenAI-compatible endpoint with streaming;
  URL/model in `localStorage`, key only in `sessionStorage`), `llmPrompts.ts`
  (messages with the computed statistics and the caveats in the system prompt) and
  `markdownLite.ts` (model response as text blocks, never HTML).
- State:
  - `useZoneAnalysis(selectedZone)`: `state` (read-only), `analysis`,
    `variable`, `overlay` (variable at the active step as a `data:` URL);
    actions `selectVariable` and `selectStep`; loaders with shared cache `loadStep` and
    `loadRaster`.
  - `useAnalysisWorkspace(zoneAnalysis, selectedZone, llmSettings)`: mode
    (`series` | `crop`), variable (all of them; `isSingle` for single-image
    ones, with `spatial`: histogram and mean by parts of the zone),
    `requirementView` (the crop's fixed reference value for the variable),
    interval, number of images, crop,
    `frames`, `rangeStats` (statistics of all the dates of the interval over
    the common zone with data on all of them, and coverage of each date), `change`
    (summary also over the common zone), `cropView` and reports
    `variableReport`/`cropReport` with `runVariableReport`, `runCropReport` and
    `stop*`. Cells without data are painted with hatching (`renderRgba` with
    `hatchNoData`) on the map and in the images.
  - `useLlmSettings()` and `useLlmReport()` in `useLlm.ts`.
  - `useZoneComparison(zones, llmSettings)`: Area A, Area B and crop (common to
    both); loads each zone's cube, summarises suitability and factors (`viewA`,
    `viewB`), computes `comparison` with `compareZones` (`cropComparison.ts`) and the
    report `report` with `runReport`/`stopReport`.
- Pipeline: [`pipelines/analysis/`](../pipelines/analysis/README.md).

- Additive extension of the same v1.3.0 (not merged yet), 2026-11-15:
  `cropFactor.classes` (optimal / acceptable / unsuitable bands in text),
  `cropFactor.reference` (citation, URL and licence when the source is not the
  ECOCROP sheet) and `crop.otherRequirements` (requirements cited outside the map). They are
  optional; cubes without them remain valid.

### 8.2 UI (WP-07)

| Component | Props / emits |
|---|---|
| `LayerPanel.vue` | A single "Variable" drop-down: manifest layers (`layer:<id>`) and, with `extraVariables`/`selectedVariableId`, grouped cube variables (`cube:<id>`) → emits `select-layer(id)` or `select-variable(id)`. |
| `LayerLegend.vue` | `layer: LegendSource \| null` (manifest layer or cube variable adapted with `variableLegend`). |
| `LayerRelevance.vue` | `variableId`: "Relevance" box below the Layers legend (what the layer is and what it is for in the crop; texts in `variableRelevance.ts`). |
| `AnalysisControls.vue` | `workspace`, `status`, `error`, `settings` → emits `update-settings`. |
| `AnalysisWorkspace.vue` | `workspace`, `zoneName`, `zoneSeries`: images, change, charts, values, suitability and zoom with cell-value inspection. |
| `LlmReport.vue`, `LlmSettingsPanel.vue` | Model report (`run`/`stop`) and settings (`update`). |
| `SeriesChart.vue`, `DistributionChart.vue`, `HistogramChart.vue` | SVG charts with no dependencies. |
| `CropReferenceCard.vue` | `cropName`, `variableName`, `view`: the crop's reference values for the variable (bands, area and source). |
| `CropRangesTable.vue` | `crop`, `variables`, `factors`: optimal / acceptable / unsuitable ranges of all variables and distribution of the zone. |
| `CompareControls.vue` | `comparison`, `settings` → emits `update-settings`: Area A, Area B and crop. |
| `CompareWorkspace.vue` | `comparison`: computed verdict, reasons, suitability maps and factor table for "Area A" and "Area B" (without naming the province) and the AI report. |
| `StoryPanel.vue` | Story; emits `navigate('analysis' \| 'compare')`. |
| `AnalysisOverlay.vue` | Child of `OliveMap`; `OliveMap` adds `analysisOverlay`, `analysisOpacity` and `analysisVisible`. |

### 8.3 Integration (INT01)

`App.vue` has the **Layers** (default), **Analysis**, **Compare** and
**Story** tabs. Layers renders whatever is chosen in the "Variable" drop-down. If the
zone has an analysis cube, it offers only its variables (without the number of dates) and
starts with the preferred variable (`soil-moisture-all`); the manifest layer
is hidden (`LayerPanel` with `showLayers: false`) and is only used if the zone has no
cube or it does not load. Same opacity and visibility for both. Analysis replaces the map with `AnalysisWorkspace` and
uses `AnalysisControls` in the panel. Compare (2026-11-15, replaces Twins)
also replaces the map: `CompareWorkspace` and `CompareControls` with
`useZoneComparison(zones, llmSettings)`, which loads the cube of two study
zones and compares their suitability for a crop. Analysis is disabled if the
zone does not declare `analysis`; Compare, if there are fewer than two zones with a cube.

**Compare.** The verdict is deterministic (`cropComparison.ts`). Each zone is the chosen
box, not its province: the results and the AI report speak only
of "Area A" and "Area B". It is computed only over the cells with at least 50 %
of agricultural surface (`landcover-agri`, CORINE 2018) if the cube includes it. The
zone with more suitable surface wins (S1 + S2, suitability ≥ 0.60) if the difference reaches
5 points; otherwise, the one with the higher mean suitability if the difference reaches 0.05; if
neither, they are equivalent. The reasons are the factors whose mean score
differs by at least 0.05, ordered by difference, with the observed value of their
variables and the part of the zone in which each factor limits. The AI
(`buildComparisonMessages`) receives that result and only explains it. Owner
decision (2026-11-15): no provincial data (MAPA yields) or
the current olive grove are shown in Compare, because they do not describe the compared box.

**Suitability classes (2026-11-15).** `suitabilityBins` splits into N < 0.40, S3
0.40–0.60, S2 0.60–0.85 and S1 ≥ 0.85 (LUSET), in Analysis and in Compare. The weighted
relative index was withdrawn (2026-11-15) in favour
of crop suitability.
