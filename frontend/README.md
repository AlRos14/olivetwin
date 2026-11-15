# frontend — OliveTwin

Static application of the OliveTwin project (NASA Space Apps Challenge 2026,
*Dancing with the SARs*), built with **Vue 3 + Vite + TypeScript** and
**Leaflet**.

Tabs: **Layers** (any analysis-cube variable on the map, with timeline, legend
and relevance), **Analysis** (no map: images of a variable, change, charts,
values, reference values and crop suitability, plus interpretation with an
OpenAI-compatible language model), **Compare** (Area A versus Area B for a crop)
and **Story**. The demo publishes **real data only** from Jaén and Toledo; the
subtitle states that the NISAR product is PROVISIONAL. There is no backend,
router or external state manager: state lives in composables and props/emits.
How to run it: [main README](../README.md).

The base map is real cartography (PNOA/IGN, OpenStreetMap and SIGPAC parcels from
FEGA) and is not part of the scientific data or NISAR. Surface soil moisture
(~5 cm) is not the same as irrigation needs.

## Languages

The interface is in English by default and offers a discreet EN|ES selector;
the choice is kept in `localStorage`. UI strings live in
`src/i18n/messages/` (the English catalog is the source of truth and `es/`
mirrors its shape) and are resolved through `t()`. Free-text fields that come
from the published data (titles, descriptions, notices, provenance, legends and
crops in `manifest.json` and `analysis.json`) are authored in Spanish by the
pipelines; their English rendering is in `public/data/real/i18n/en.json` and is
applied by `dataText()`. If an entry is missing, the Spanish source is shown.
Dates are ISO 8601 in every language (see `src/services/dateFormat.ts`) and
numbers use the locale decimal separator.

## Local start

Requirements: Node 22 LTS (see `.nvmrc` at the repository root; Vite requires
`^20.19.0 || >=22.12.0`).

```bash
cd frontend
npm ci
npm run dev      # development server
npm run build    # type check + production build in dist/
npm run preview  # serves dist/ locally
```

## Scripts

| Script | Description |
|---|---|
| `dev` | Vite development server. |
| `build` | `vue-tsc -b` + `vite build`; generates `dist/` (ignored by Git). |
| `preview` | Serves the production build. |
| `test` | Vitest in `run` mode (`--passWithNoTests`); includes `src/**`, `tests/**` and `scripts/**` with the `*.test.ts` / `*.test.mjs` pattern. |
| `typecheck` | Type check only with `vue-tsc -b`. |
| `validate:data` | Validates `public/data/real/manifest.json`, its assets (all `timeSteps`) and the contract fixtures. `sample/` is optional. |

Build under a subpath:

```bash
npm run build -- --base /olivetwin/
npm run preview -- --base /olivetwin/
```

Manifest and PNG paths resolve with `import.meta.env.BASE_URL`, not with an
absolute `/`.

## Structure

```text
frontend/
├── index.html
├── public/
│   └── data/
│       └── real/                  # manifest + zones/<id>/soil-moisture/<date>.png
├── src/
│   ├── App.vue                    # view composition (INT01)
│   ├── main.ts                    # mounts the application
│   ├── style.css                  # minimal global styles
│   ├── components/
│   │   ├── OliveMap.vue           # Leaflet map, PNOA/OSM and framings
│   │   ├── StudyZoneMarkers.vue   # zone outlines and selection
│   │   ├── ScientificOverlay.vue  # ImageOverlay by bbox and opacity
│   │   ├── TimeSlider.vue         # timeline (slider, previous/next, play)
│   │   ├── ZoneSelector.vue       # zone selector
│   │   ├── LayerPanel.vue         # layer, opacity, visibility and base map
│   │   ├── LayerLegend.vue        # legend of the active layer
│   │   ├── StatusBanner.vue       # load notices and errors
│   │   ├── AnalysisControls.vue   # Analysis controls (variable, dates, images, crop, AI)
│   │   ├── AnalysisWorkspace.vue  # Analysis area: images, change, charts, values, suitability
│   │   ├── LlmReport.vue          # model interpretation (safe text, streaming)
│   │   ├── LlmSettingsPanel.vue   # endpoint, model and API key of the AI model
│   │   ├── DistributionChart.vue  # distribution by date (SVG)
│   │   ├── layerOptions.ts        # cube variables in Layers and their legend
│   │   ├── CompareControls.vue    # Compare: Area A, Area B and crop
│   │   ├── CompareWorkspace.vue   # Compare: verdict, reasons, maps and factors
│   │   ├── CropReferenceCard.vue  # reference values of the crop for one variable
│   │   ├── CropRangesTable.vue    # crop ranges for all variables
│   │   ├── HistogramChart.vue     # area share by intervals (SVG)
│   │   ├── LayerRelevance.vue     # "Relevance" box of Layers
│   │   ├── SeriesChart.vue        # SVG time series (zone and rain)
│   │   ├── StoryPanel.vue         # challenge story and hypotheses
│   │   ├── AnalysisOverlay.vue    # computed layer of the analysis cube
│   │   └── map/                   # Leaflet helpers (basemaps, geo, tiles)
│   ├── composables/
│   │   ├── useOliveTwinData.ts    # state, selection, time step and overlay
│   │   ├── useZoneAnalysis.ts     # analysis cube: map layer and raster cache
│   │   ├── useAnalysisWorkspace.ts # Analysis tab: series, suitability and reports
│   │   ├── useZoneComparison.ts   # Compare tab: two zones and one crop
│   │   └── useLlm.ts              # model configuration and streaming reports
│   ├── services/
│   │   ├── manifestService.ts     # loads and validates manifests at runtime
│   │   ├── manifestSemantics.ts   # semantic rules of the contract
│   │   ├── assetUrl.ts            # resolves paths with BASE_URL
│   │   ├── analysisService.ts     # loads and validates the analysis cube
│   │   ├── analysisMath.ts        # decoding, change, common zone, statistics and histogram
│   │   ├── seriesAnalysis.ts      # date sampling, trend, change and climate
│   │   ├── cropSuitability.ts     # suitability classes and limiting factor
│   │   ├── cropRequirements.ts    # published requirements of each variable per crop
│   │   ├── cropComparison.ts      # verdict and reasons of Compare
│   │   ├── dateFormat.ts          # ISO 8601 dates in UTC
│   │   ├── llmClient.ts           # OpenAI-compatible client (streaming)
│   │   ├── llmPrompts.ts          # prompts for the model
│   │   ├── markdownLite.ts        # safe Markdown (no HTML)
│   │   ├── pngGray.ts             # decodes 8-bit grey PNG without canvas
│   │   └── palettes.ts            # palettes and RGBA rendering
│   ├── types/
│   │   ├── manifest.ts            # contract types (manifest)
│   │   └── analysis.ts            # analysis cube types v1.3.0
│   └── styles/
│       ├── map.css                # map and control styles
│       ├── ui.css                 # panel styles
│       └── analysis.css           # analysis, twins, chart and story styles
├── scripts/
│   ├── validate-data.mjs          # validate:data CLI
│   ├── validate-lib.mjs           # schema, semantics and PNG check
│   └── fixtures/                  # valid and invalid test manifests
├── tests/
│   └── e2e/                       # Playwright specs and harness instructions
├── package.json
├── package-lock.json
├── tsconfig*.json
└── vite.config.ts
```

Ownership of each folder is frozen in
[`docs/c0-interfaces.md`](../docs/c0-interfaces.md) §5 and in
[`AGENTS.md`](../AGENTS.md): WP-04 owns types, services, composables,
manifests and validation; WP-07 owns components and styles; INT01 only composes
`App.vue` and `main.ts`; INT02 owns `tests/` and the QA documentation.

## Data and contract

- `public/data/real/manifest.json` declares `datasetMode: "real"`, Jaén and
  Toledo, and three `timeSteps` of NISAR L3 SME2 surface soil moisture per zone.
- The real manifest is mandatory for `validate:data`; the sample one is optional
  and is not loaded by the application.
- `image` paths are relative to `public/` and resolve with
  `import.meta.env.BASE_URL`.
- Each zone links its analysis cube (`zone.analysis`, contract v1.3.0,
  [`contracts/analysis.schema.json`](../contracts/analysis.schema.json)),
  generated by [`pipelines/analysis/`](../pipelines/analysis/README.md).
- The full contract (v1.3.0) is in
  [`docs/data-contract.md`](../docs/data-contract.md) and
  [`contracts/manifest.schema.json`](../contracts/manifest.schema.json).
- To add real dates or zones, use the NISAR pipeline
  (`--publish` and `--from-staging`) and follow
  [`docs/handoff-science.md`](../docs/handoff-science.md); Vue components are
  not edited.

## Tests

```bash
npm test                 # Vitest: contract, services, composables and components
npm run validate:data    # manifests, assets and fixtures
npm run build            # vue-tsc + static build
```

Unit tests live next to the code (`*.test.ts`). Browser E2E scenarios use
Playwright with a harness **external** to the repository and do not run in CI;
instructions and limitations in
[`tests/e2e/README.md`](tests/e2e/README.md). The QA report with evidence is in
[`docs/qa-results.md`](../docs/qa-results.md).

## Deployment

The result is a static SPA in `dist/`. It can be served at the root or under a
subpath (for example `/olivetwin/`) as long as the build is generated with the
corresponding `--base`. PNOA and OpenStreetMap are external services: without
Internet the tiles do not load, although the application and its messages keep
working. The demo is published on GitHub Pages at
<https://alros14.github.io/olivetwin/> on every merge to `main`.
