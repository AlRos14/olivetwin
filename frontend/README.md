# frontend — OliveTwin

Aplicación estática del proyecto OliveTwin (NASA Space Apps Challenge 2026,
*Dancing with the SARs*), construida con **Vue 3 + Vite + TypeScript** y
**Leaflet**.

Pestañas: **Capas** (cualquier variable del cubo de análisis en el mapa, con
línea temporal, leyenda y relevancia), **Análisis** (sin mapa: imágenes de una
variable, cambio, gráficas, valores, valores de referencia y aptitud por cultivo,
e interpretación con un modelo de lenguaje compatible con OpenAI), **Comparar**
(zona A frente a zona B para un cultivo) e **Historia**. La demo publica **solo
datos reales** de Jaén y Toledo; el subtítulo indica que el producto NISAR es
PROVISIONAL. No hay backend, router ni gestor de estado externo: el estado vive
en composables y props/emits. Cómo arrancarla: [README principal](../README.md).

El mapa base es cartografía real (PNOA/IGN, OpenStreetMap y recintos SIGPAC del
FEGA) y no forma parte de
los datos científicos ni de NISAR. La humedad superficial (~5 cm) no equivale a
necesidad de riego.

## Arranque local

Requisitos: Node 22 LTS (ver `.nvmrc` en la raíz del repositorio; Vite exige
`^20.19.0 || >=22.12.0`).

```bash
cd frontend
npm ci
npm run dev      # servidor de desarrollo
npm run build    # comprobación de tipos + build de producción en dist/
npm run preview  # sirve localmente el contenido de dist/
```

## Scripts

| Script | Descripción |
|---|---|
| `dev` | Servidor de desarrollo de Vite. |
| `build` | `vue-tsc -b` + `vite build`; genera `dist/` (ignorado por Git). |
| `preview` | Sirve el build de producción. |
| `test` | Vitest en modo `run` (`--passWithNoTests`); incluye `src/**`, `tests/**` y `scripts/**` con patrón `*.test.ts` / `*.test.mjs`. |
| `typecheck` | Solo comprobación de tipos con `vue-tsc -b`. |
| `validate:data` | Valida `public/data/real/manifest.json`, sus assets (todos los `timeSteps`) y los fixtures contractuales. `sample/` es opcional. |

Build bajo subruta:

```bash
npm run build -- --base /olivetwin/
npm run preview -- --base /olivetwin/
```

Las rutas de manifiestos y PNG se resuelven con `import.meta.env.BASE_URL`, no
con `/` absoluto.

## Estructura

```text
frontend/
├── index.html
├── public/
│   └── data/
│       └── real/                  # manifiesto + zones/<id>/soil-moisture/<fecha>.png
├── src/
│   ├── App.vue                    # composición de la vista (INT01)
│   ├── main.ts                    # monta la aplicación
│   ├── style.css                  # estilos globales mínimos
│   ├── components/
│   │   ├── OliveMap.vue           # mapa Leaflet, PNOA/OSM y encuadres
│   │   ├── StudyZoneMarkers.vue   # contornos y selección de zonas
│   │   ├── ScientificOverlay.vue  # ImageOverlay por bbox y opacidad
│   │   ├── TimeSlider.vue         # línea temporal (slider, anterior/siguiente, reproducir)
│   │   ├── ZoneSelector.vue       # selector de zona
│   │   ├── LayerPanel.vue         # capa, opacidad, visibilidad y mapa base
│   │   ├── LayerLegend.vue        # leyenda de la capa activa
│   │   ├── StatusBanner.vue       # avisos y errores de carga
│   │   ├── AnalysisControls.vue   # controles de Análisis (variable, fechas, imágenes, cultivo, IA)
│   │   ├── AnalysisWorkspace.vue  # área de Análisis: imágenes, cambio, gráficas, valores, aptitud
│   │   ├── LlmReport.vue          # interpretación del modelo (texto seguro, streaming)
│   │   ├── LlmSettingsPanel.vue   # endpoint, modelo y clave del modelo de IA
│   │   ├── DistributionChart.vue  # distribución por fecha (SVG)
│   │   ├── layerOptions.ts        # variables del cubo en Capas y su leyenda
│   │   ├── CompareControls.vue    # Comparar: zona A, zona B y cultivo
│   │   ├── CompareWorkspace.vue   # Comparar: veredicto, motivos, mapas y factores
│   │   ├── CropReferenceCard.vue  # valores de referencia del cultivo para una variable
│   │   ├── CropRangesTable.vue    # rangos del cultivo para todas las variables
│   │   ├── HistogramChart.vue     # reparto de la superficie por tramos (SVG)
│   │   ├── LayerRelevance.vue     # recuadro «Relevancia» de Capas
│   │   ├── SeriesChart.vue        # serie temporal SVG (zona y lluvia)
│   │   ├── StoryPanel.vue         # relato del reto e hipótesis
│   │   ├── AnalysisOverlay.vue    # capa calculada del cubo de análisis
│   │   └── map/                   # helpers de Leaflet (basemaps, geo, teselas)
│   ├── composables/
│   │   ├── useOliveTwinData.ts    # estado, selección, paso temporal y overlay
│   │   ├── useZoneAnalysis.ts     # cubo de análisis: capa del mapa y caché de rásteres
│   │   ├── useAnalysisWorkspace.ts # pestaña Análisis: serie, aptitud e informes
│   │   ├── useZoneComparison.ts   # pestaña Comparar: dos zonas y un cultivo
│   │   └── useLlm.ts              # configuración del modelo e informes en streaming
│   ├── services/
│   │   ├── manifestService.ts     # carga y valida manifiestos en runtime
│   │   ├── manifestSemantics.ts   # reglas semánticas del contrato
│   │   ├── assetUrl.ts            # resuelve rutas con BASE_URL
│   │   ├── analysisService.ts     # carga y valida el cubo de análisis
│   │   ├── analysisMath.ts        # decodificación, cambio, zona común, estadísticas e histograma
│   │   ├── seriesAnalysis.ts      # muestreo de fechas, tendencia, cambio y clima
│   │   ├── cropSuitability.ts     # clases de aptitud y factor limitante
│   │   ├── cropRequirements.ts    # requisitos publicados de cada variable por cultivo
│   │   ├── cropComparison.ts      # veredicto y motivos de Comparar
│   │   ├── dateFormat.ts          # fechas MM/DD/YYYY en UTC
│   │   ├── llmClient.ts           # cliente compatible con OpenAI (streaming)
│   │   ├── llmPrompts.ts          # mensajes para el modelo
│   │   ├── markdownLite.ts        # Markdown seguro (sin HTML)
│   │   ├── pngGray.ts             # decodifica PNG gris de 8 bits sin canvas
│   │   └── palettes.ts            # paletas y render a RGBA
│   ├── types/
│   │   ├── manifest.ts            # tipos del contrato (manifiesto)
│   │   └── analysis.ts            # tipos del cubo de análisis v1.3.0
│   └── styles/
│       ├── map.css                # estilos del mapa y controles
│       ├── ui.css                 # estilos del panel
│       └── analysis.css           # estilos de análisis, gemelos, gráfica e historia
├── scripts/
│   ├── validate-data.mjs          # CLI de validate:data
│   ├── validate-lib.mjs           # esquema, semántica y comprobación de PNG
│   └── fixtures/                  # manifiestos válidos e inválidos de prueba
├── tests/
│   └── e2e/                       # specs Playwright e instrucciones del harness
├── package.json
├── package-lock.json
├── tsconfig*.json
└── vite.config.ts
```

La propiedad de cada carpeta está congelada en
[`docs/c0-interfaces.md`](../docs/c0-interfaces.md) §5 y en
[`AGENTS.md`](../AGENTS.md): WP-04 posee tipos, servicios, composables,
manifiestos y validación; WP-07 posee componentes y estilos; INT01 solo compone
`App.vue` y `main.ts`; INT02 posee `tests/` y la documentación de QA.

## Datos y contrato

- `public/data/real/manifest.json` declara `datasetMode: "real"`, Jaén y Toledo,
  y tres `timeSteps` de humedad superficial NISAR L3 SME2 por zona.
- El manifiesto real es obligatorio para `validate:data`; el de muestra es
  opcional y no lo carga la aplicación.
- Las rutas `image` son relativas a `public/` y se resuelven con
  `import.meta.env.BASE_URL`.
- Cada zona enlaza su cubo de análisis (`zone.analysis`, contrato v1.3.0,
  [`contracts/analysis.schema.json`](../contracts/analysis.schema.json)),
  generado por [`pipelines/analysis/`](../pipelines/analysis/README.md).
- El contrato completo (v1.3.0) está en
  [`docs/data-contract.md`](../docs/data-contract.md) y
  [`contracts/manifest.schema.json`](../contracts/manifest.schema.json).
- Para añadir fechas o zonas reales, usa el pipeline NISAR
  (`--publish` y `--from-staging`) y sigue
  [`docs/handoff-science.md`](../docs/handoff-science.md); no se editan
  componentes Vue.

## Pruebas

```bash
npm test                 # Vitest: contrato, servicios, composable y componentes
npm run validate:data    # manifiestos, assets y fixtures
npm run build            # vue-tsc + build estático
```

Los tests unitarios viven junto al código (`*.test.ts`). Los escenarios E2E en
navegador real usan Playwright con un harness **externo** al repositorio y no se
ejecutan en CI; instrucciones y limitaciones en
[`tests/e2e/README.md`](tests/e2e/README.md). El informe de QA con evidencias
está en [`docs/qa-results.md`](../docs/qa-results.md).

## Despliegue

El resultado es una SPA estática en `dist/`. Puede servirse en la raíz o en una
subruta (por ejemplo `/olivetwin/`) siempre que la build se genere con el
`--base` correspondiente. PNOA y OpenStreetMap son servicios externos: sin
Internet las teselas no cargan, aunque la aplicación y sus mensajes siguen
funcionando.
