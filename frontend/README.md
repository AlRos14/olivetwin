# frontend — OliveTwin

Aplicación estática del proyecto OliveTwin (NASA Space Apps Challenge 2026,
*Dancing with the SARs*), construida con **Vue 3 + Vite + TypeScript** y
**Leaflet**.

Incluye la demo integrada de Fase B: mapa de España con PNOA/OSM, **humedad
superficial NISAR L3 SME2** de Jaén y Toledo con **tres fechas**, línea temporal,
opacidad, leyenda, procedencia y aviso de producto PROVISIONAL. La demo publica
**solo datos reales**; no hay selector de datos de muestra. No hay backend,
router ni gestor de estado externo: el estado vive en composables y props/emits.

El mapa base es cartografía real (PNOA/IGN y OpenStreetMap) y no forma parte de
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
│   │   ├── DataModeSwitch.vue     # selector de modo; conservado sin uso en la demo
│   │   ├── ZoneSelector.vue       # selector de zona
│   │   ├── LayerPanel.vue         # capa, opacidad, visibilidad y mapa base
│   │   ├── LayerLegend.vue        # leyenda de la capa activa
│   │   ├── DataProvenance.vue     # fuente, fecha del paso, unidad y notas
│   │   ├── StatusBanner.vue       # avisos y errores de carga
│   │   └── map/                   # helpers de Leaflet (basemaps, geo, teselas)
│   ├── composables/
│   │   └── useOliveTwinData.ts    # estado, selección, paso temporal y overlay
│   ├── services/
│   │   ├── manifestService.ts     # carga y valida manifiestos en runtime
│   │   ├── manifestSemantics.ts   # reglas semánticas del contrato
│   │   └── assetUrl.ts            # resuelve rutas con BASE_URL
│   ├── types/
│   │   └── manifest.ts            # tipos del contrato v1.2.0
│   └── styles/
│       ├── map.css                # estilos del mapa y controles
│       └── ui.css                 # estilos del panel
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
- El contrato completo (v1.2.0) está en
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
