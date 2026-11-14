# C0 — Interfaces congeladas para la Fase B (WP-04 ∥ WP-07)

**Estado:** congelado el 2026-11-14 por R1 (orquestación). Complementa `docs/contract-freeze.md`
(contrato de datos v1.1.0). Cambiar algo de este documento es un **cambio de interfaz**: abrir Issue
y bloquear solo los nodos afectados.

## 1. Tipos

`frontend/src/types/manifest.ts` — **owner WP-04**. Creado en C0 como stub; WP-04 solo lo amplía de
forma aditiva. WP-07 lo importa y no lo modifica.

## 2. Proveedor de estado (WP-04)

`frontend/src/composables/useOliveTwinData.ts` exporta:

```ts
export function useOliveTwinData(options?: { initialMode?: DataMode; fetchImpl?: typeof fetch }): {
  vm: DeepReadonly<OliveTwinViewModel>          // reactive, solo lectura para la UI
  selectedZone: ComputedRef<StudyZone | null>
  selectedLayer: ComputedRef<StudyLayer | null>
  overlay: ComputedRef<ActiveOverlay | null>    // URL ya resuelta con BASE_URL
} & OliveTwinActions
```

Reglas:

- Modo inicial `sample`. Real vacío → `loadStatus: 'empty'`. JSON roto, 404 o schema inválido →
  `'error'` + `errorMessage`. **Nunca** se recurre a `sample` como alternativa.
- Cada `setDataMode`/`reload` invalida la carga anterior (AbortController o contador): una respuesta
  tardía nunca sobrescribe el modo actual.
- Al cambiar de modo: `selectedZoneId = null`, `selectedLayerId = null`. Al cambiar de zona: capa = la
  primera disponible de la zona, o `null`.
- `overlay` es `null` si no hay zona y capa válidas en el manifiesto **activo**.
- Los servicios (`frontend/src/services/`) resuelven `image` con `import.meta.env.BASE_URL` y rechazan
  rutas con `/` inicial, `..`, `:` o `\`.

## 3. Componentes (WP-07)

Solo props y emits; ningún componente hace `fetch`, construye rutas ni importa servicios o composables.

| Componente | Props | Emits |
|---|---|---|
| `OliveMap.vue` | `baseMap: BaseMap`, `zones: StudyZone[]`, `selectedZoneId: string \| null`, `overlay: ActiveOverlay \| null` | `select-zone(id: string)`, `basemap-error(baseMap: BaseMap)` |
| `StudyZoneMarkers.vue` | (hijo de OliveMap) `map: L.Map`, `zones`, `selectedZoneId` | `select-zone(id)` |
| `ScientificOverlay.vue` | (hijo de OliveMap) `map: L.Map`, `overlay: ActiveOverlay \| null` | `image-error(url: string)` |
| `DataModeSwitch.vue` | `modelValue: DataMode` | `update:modelValue(mode)` |
| `ZoneSelector.vue` | `zones`, `modelValue: string \| null`, `disabled?: boolean` | `update:modelValue(id \| null)` |
| `LayerPanel.vue` | `zone: StudyZone \| null`, `selectedLayerId`, `opacity: number (0–1)`, `visible: boolean`, `baseMap: BaseMap` | `select-layer(id)`, `update:opacity(n)`, `update:visible(b)`, `update:baseMap(b)` |
| `LayerLegend.vue` | `layer: StudyLayer \| null` | — |
| `DataProvenance.vue` | `layer: StudyLayer \| null`, `dataMode: DataMode` | — |
| `StatusBanner.vue` | `dataMode`, `loadStatus`, `errorMessage`, `hasSyntheticLayer: boolean`, `overlayError: string \| null`, `basemapError: BaseMap \| null` | `retry()`, `switch-basemap(baseMap: BaseMap)`, `dismiss-overlay-error()` |

- Encuadre: vista inicial de la España peninsular + Baleares; `OliveMap` incluye un control propio
  «Canarias» (y «España») para saltar al archipiélago. `fitBounds` (con padding) solo cuando cambia
  `selectedZoneId` a una zona existente; si pasa a `null` (p. ej. cambio de modo) vuelve a la vista de
  España. La zona activa se deriva de `zones` + `selectedZoneId`. Navegación no restringida a España.
- Fallo de overlay o de mapa base: el mapa sigue usable; `OliveMap` reemite `image-error(url)` de
  `ScientificOverlay` y emite `basemap-error`. `StatusBanner` muestra «La imagen de la capa no está
  disponible» y, para PNOA, «La ortofoto PNOA no responde» con botón «Usar OpenStreetMap»
  (`switch-basemap('osm')`).
- `leaflet/dist/leaflet.css` lo importa `OliveMap.vue`; cada componente importa su hoja (`map.css` /
  `ui.css`).
- Estado del mapa base (`pnoa`/`osm`) lo guarda `App.vue`; por defecto `pnoa`. Cambiarlo no toca el
  overlay ni la opacidad.
- PNOA: `https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/{z}/{x}/{-y}.jpeg` con `{-y}` y **sin** `tms: true`.
  OSM: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Atribuciones visibles siempre.
- Leaflet: `bbox [w,s,e,n]` → `L.latLngBounds([[s,w],[n,e]])`.
- Aviso «DATOS SIMULADOS» persistente si `hasSyntheticLayer` o `dataMode === 'sample'`.

## 4. Integración (INT01)

Solo INT01 edita `frontend/src/App.vue` y `frontend/src/main.ts`: instancia `useOliveTwinData()`,
mantiene `baseMap`, `overlayError` y `basemapError`, y conecta props/emits.

- `hasSyntheticLayer = selectedLayer?.status === 'synthetic'`.
- `overlayError` se limpia al cambiar capa, zona o modo; `basemapError` al cambiar de mapa base.
- El texto «Todavía no hay zonas con datos científicos reales» lo muestra `StatusBanner` con
  `loadStatus === 'empty'`; `ZoneSelector` queda `disabled` sin zonas.

## 5. Ownership de archivos en Fase B

| Nodo | Scope exclusivo |
|---|---|
| WP04-01 | `contracts/`, `frontend/src/types/`, `frontend/scripts/validate-data.mjs`, `frontend/scripts/fixtures/` |
| WP04-02 | `scripts/generate-sample-data.mjs`, `frontend/public/data/sample/`, `frontend/public/data/real/` |
| WP04-03 | `frontend/src/services/` |
| WP04-04 | `frontend/src/composables/` |
| WP04-05 | `docs/data-contract.md`, `docs/handoff-science.md` |
| WP07-01..03 | Un único agente/owner (R4), en secuencia 01 → 02 → 03: `frontend/src/components/OliveMap.vue`, `StudyZoneMarkers.vue`, `ScientificOverlay.vue`, `frontend/src/components/map/`, `frontend/src/styles/map.css` |
| WP07-04 | `frontend/src/components/{DataModeSwitch,ZoneSelector,LayerPanel,LayerLegend,DataProvenance,StatusBanner}.vue`, `frontend/src/styles/ui.css` |
| INT01 | `frontend/src/App.vue`, `frontend/src/main.ts`, `frontend/src/style.css` |
| INT02 | `frontend/tests/`, `docs/qa-results.md` |
| G2 | `docs/acceptance.md` |

Los tests unitarios viven junto al código de cada nodo (`*.test.ts` en su propio scope). Vitest incluye
`src/**`, `tests/**` y `scripts/**` (`*.test.ts` / `*.test.mjs`).
Dependencias: instaladas una única vez en C0 (`leaflet`, `vitest`, `@vue/test-utils`, `jsdom`, `pngjs`).
Nadie más edita `frontend/package.json` sin coordinarlo con R1.

## 6. C1 — Línea temporal (contrato v1.2.0, aditivo) — 2026-11-14

Decisión del responsable de proyecto: las capas reales pueden traer **varias fechas** y la UI ofrece
un **slider temporal**. Cambio aditivo: manifiestos v1.1.0 siguen siendo válidos.

### 6.1 Contrato (WP-04)

- `layer.timeSteps?: TimeStep[]` (≥ 1). `TimeStep = { date, label?, image, bbox, provenance? }`
  (`frontend/src/types/manifest.ts`). `date` ISO 8601 válida (fecha o fecha-hora); pasos en orden
  estrictamente creciente de `date`, sin duplicados.
- `image` de cada paso: mismas reglas de ruta segura y prefijo `data/<datasetMode>/`; PNG existente con
  alpha. `bbox` de cada paso dentro de `zone.bbox`.
- `layer.image` y `layer.bbox` = los del **último** paso (compatibilidad v1.1).
- Unidad, `range`, `legend` y `status` son comunes a todos los pasos (la escala es fija en el tiempo,
  imprescindible para comparar fechas).
- `provenance` del paso es parcial y se superpone a la de la capa. En `processed_real`, la procedencia
  efectiva de **cada** paso debe cumplir los mismos requisitos (`acquisitionDate`, `sceneId`,
  `referenceUrl`).
- Manifiestos que usen `timeSteps` declaran `schemaVersion: "1.2.0"`.

### 6.2 Estado (WP-04, `useOliveTwinData`)

- `vm.selectedTimeIndex`; acción `selectTimeStep(index)`; computed adicional `activeTimeStep`.
- Al seleccionar capa (o zona, que selecciona su primera capa): índice = **último** paso si hay
  `timeSteps`, si no `null`. Cambiar modo/zona/capa reinicia el índice.
- `overlay.url`/`overlay.bbox` salen del paso activo; `overlay.timeIndex` y `overlay.timeStep` lo
  identifican.

### 6.3 UI (WP-07)

| Componente | Props | Emits |
|---|---|---|
| `TimeSlider.vue` (nuevo) | `steps: TimeStep[]`, `modelValue: number \| null` | `update:modelValue(index: number)` |
| `DataProvenance.vue` | + `timeStep?: TimeStep \| null` (procedencia efectiva del paso) | — |

- `TimeSlider` solo se renderiza con ≥ 2 pasos. Slider `range` (paso 1) con `aria-valuetext` = fecha,
  botones anterior/siguiente y reproducir/pausar (avanza ~1,5 s por paso, se detiene en el último,
  se cancela al desmontar o al cambiar `steps`; respeta `prefers-reduced-motion` sin autoarranque).
  Marcas con las fechas (formato es-ES, UTC). Nada de controles inertes.
- `ScientificOverlay`: si solo cambia `url`/`timeIndex` (misma zona, capa y bbox) usa `setUrl` en vez
  de recrear, para que la animación no parpadee; precarga la imagen del paso siguiente.
- La leyenda no cambia entre pasos.

### 6.4 Integración y pipeline

- INT: `App.vue` coloca `TimeSlider` sobre el mapa (abajo, centrado; en móvil dentro del panel),
  conectado a `data.selectTimeStep`; pasa `activeTimeStep` a `DataProvenance`.
- `pipelines/nisar/sme2_to_overlay.py --publish` escribe **todas** las fechas como `timeSteps`
  (`data/real/zones/<zona>/soil-moisture/<fecha>.png`), con escala fija común.
