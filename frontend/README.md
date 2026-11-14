# frontend — OliveTwin

Aplicación estática del proyecto OliveTwin (NASA Space Apps Challenge 2026,
*Dancing with the SARs*), construida con **Vue 3 + Vite + TypeScript** y
**Leaflet**.

Incluye la demo integrada de Fase B: mapa de España con PNOA/OSM, zonas de
muestra Jaén y Toledo, capas sintéticas de NDVI y humedad, opacidad, leyenda,
procedencia y selector **Datos de muestra / Datos reales**. El modo real está
vacío y se comunica como tal. No hay backend, router ni gestor de estado
externo: el estado vive en composables y props/emits.

Las **capas científicas de muestra son sintéticas** y se marcan con
«DATOS SIMULADOS». El mapa base es cartografía real y no forma parte de los
datos científicos ni de NISAR.

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
| `validate:data` | Valida `public/data/{sample,real}/manifest.json`, sus assets y los fixtures contractuales. |
| `generate:sample` | Regenera los cuatro PNG sintéticos y el manifiesto de muestra con el generador de la raíz. |

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
│       ├── sample/                # manifiesto + zones/<id>/{ndvi,moisture}.png
│       └── real/                  # manifiesto válido con zones: [] (sin assets)
├── src/
│   ├── App.vue                    # composición de la vista (INT01)
│   ├── main.ts                    # monta la aplicación
│   ├── style.css                  # estilos globales mínimos
│   ├── components/
│   │   ├── OliveMap.vue           # mapa Leaflet, PNOA/OSM y encuadres
│   │   ├── StudyZoneMarkers.vue   # contornos y selección de zonas
│   │   ├── ScientificOverlay.vue  # ImageOverlay por bbox y opacidad
│   │   ├── DataModeSwitch.vue     # Datos de muestra / Datos reales
│   │   ├── ZoneSelector.vue       # selector de zona
│   │   ├── LayerPanel.vue         # capa, opacidad, visibilidad y mapa base
│   │   ├── LayerLegend.vue        # leyenda de la capa activa
│   │   ├── DataProvenance.vue     # fuente, fecha, unidad y notas
│   │   ├── StatusBanner.vue       # avisos, errores y «DATOS SIMULADOS»
│   │   └── map/                   # helpers de Leaflet (basemaps, geo, teselas)
│   ├── composables/
│   │   └── useOliveTwinData.ts    # estado sample/real, selección y overlay
│   ├── services/
│   │   ├── manifestService.ts     # carga y valida manifiestos en runtime
│   │   ├── manifestSemantics.ts   # reglas semánticas del contrato
│   │   └── assetUrl.ts            # resuelve rutas con BASE_URL
│   ├── types/
│   │   └── manifest.ts            # tipos del contrato v1.1.0
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

- `public/data/sample/manifest.json` declara `datasetMode: "sample"` y solo
  admite capas `synthetic`.
- `public/data/real/manifest.json` declara `datasetMode: "real"` y hoy tiene
  `zones: []`. Es un estado válido, no un error.
- Las rutas `image` son relativas a `public/` y se resuelven con
  `import.meta.env.BASE_URL`.
- El contrato completo está en
  [`docs/data-contract.md`](../docs/data-contract.md) y
  [`contracts/manifest.schema.json`](../contracts/manifest.schema.json).
- Para publicar datos reales, sigue
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
