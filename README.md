# OliveTwin

**NASA Space Apps Challenge 2026 — reto «Dancing with the SARs».**

OliveTwin es una aplicación web estática para explorar, sobre un mapa de España,
capas de **vegetación (NDVI)** y **humedad superficial** en zonas de estudio
delimitadas. El objetivo del proyecto es investigar por qué dos olivares
cercanos y aparentemente similares pueden producir cantidades distintas,
combinando observaciones radar, vegetación, humedad y registros de cosecha.

Repositorio: <https://github.com/AlRos14/olivetwin> (privado).

## Estado actual: demo con datos reales NISAR SME2

La Fase B (WP-04 + WP-07) está **integrada** y la demo publica únicamente
**datos reales** (decisión de producto del 2026-11-14). La aplicación arranca sin
backend y permite recorrer la demo de principio a fin.

Qué se puede hacer hoy:

- **Mapa Leaflet de España** (Península, Baleares y Canarias) con dos mapas base:
  **Ortofoto PNOA** del IGN/CNIG (por defecto) y **OpenStreetMap**, con
  atribuciones visibles y cambio sin recargar la página.
- **Dos zonas reales, Jaén y Toledo**, delimitadas por su `bbox`, con **humedad
  superficial NISAR L3 SME2** y **tres fechas** cada una.
- **Línea temporal**: slider, botones anterior/siguiente y reproducción. Cambiar
  de fecha actualiza el overlay sin recrear la imagen ni parpadear, y la
  procedencia muestra la escena del paso activo.
- **Capa visible con opacidad 0–100 %**, visibilidad, leyenda, unidad, rango,
  fecha y procedencia verificable.
- **Aviso persistente**: «Producto NISAR SME2 PROVISIONAL: no totalmente
  calibrado; humedad superficial ≠ necesidad de riego».
- Mensajes de error si el manifiesto o un PNG no están disponibles, sin romper
  el mapa base ni inventar datos.

> **Importante:** el mapa base (PNOA/OSM) es cartografía real y el overlay es una
> representación visual del producto NISAR L3 SME2 **PROVISIONAL**. La humedad
> superficial (~5 cm) no equivale a humedad profunda ni a una necesidad de
> riego, y los colores del PNG no permiten recuperar valores exactos por píxel.

El informe de QA con la evidencia de los escenarios AT-01…AT-20 (adaptados a
datos reales) está en [`docs/qa-results.md`](docs/qa-results.md). La
re-ejecución del 2026-11-14 figura en la sección final de ese informe.

## Límites científicos

Estas precisiones forman parte del alcance del proyecto y deben respetarse en
código, textos y demos:

- **El radar no mide producción directamente.** NISAR y otros radares aportan
  observaciones (por ejemplo, respuesta radar o humedad superficial estimada)
  que requieren interpretación y validación; no demuestran por sí mismas una
  causa agronómica ni un rendimiento en kg/ha.
- **El NDVI es un índice óptico, no un producto NISAR.** En una implementación
  real puede proceder de Landsat o Sentinel-2. No debe presentarse como
  observación radar.
- **La humedad superficial SME2 no es riego.** Estima humedad en la capa
  superficial del suelo (~5 cm); no equivale a humedad profunda ni a una dosis de
  riego, y su resolución limita su uso a parcelas suficientemente grandes.
- **El producto es PROVISIONAL.** NISAR L3 SME2 no está totalmente calibrado;
  conviene interpretar cambios relativos con cautela y no como verdad absoluta.
- **Los overlays PNG son representaciones visuales.** Sus colores no permiten
  recuperar valores científicos exactos ni hacer consultas por píxel.
- **El mapa base no es un dato científico.** PNOA/IGN y OpenStreetMap sirven
  para orientación y no tienen por qué coincidir en fecha con las capas.

## Arranque local

Requisitos: **Node.js 22 LTS** (fijada en `.nvmrc`) y npm.
Con `nvm` instalado:

```bash
nvm use
cd frontend
npm ci
npm run dev
```

Vite imprime la URL de desarrollo (por defecto `http://localhost:5173/`). La
aplicación carga `public/data/real/manifest.json` y los PNG de Jaén y Toledo al
abrirse (Jaén se autoselecciona); no necesita backend, base de datos ni claves.
Requiere Internet para las teselas PNOA/OSM.

### Scripts npm

Se ejecutan desde `frontend/` (o con `--prefix frontend` desde la raíz):

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo de Vite con recarga en caliente. |
| `npm run build` | `vue-tsc -b` + `vite build`; genera `frontend/dist/`. |
| `npm run preview` | Sirve localmente la build de producción. |
| `npm test` | Suite de Vitest (contrato, servicios, composable y componentes). |
| `npm run validate:data` | Valida el manifiesto real con el esquema y los assets de `public/data/` (`sample/` es opcional). |
| `npm run typecheck` | Comprobación de tipos con `vue-tsc` sin generar build. |

Comprobaciones antes de abrir o actualizar una pull request:

```bash
cd frontend
npm ci
npm run validate:data
npm test
npm run build
```

`npm ci` requiere que `frontend/package-lock.json` esté versionado. Si un script
falla, no se simula el resultado: se registra el error y su causa.

### Build en una subruta

La aplicación resuelve manifiestos y PNG con `import.meta.env.BASE_URL`, así que
puede publicarse en una subruta (por ejemplo GitHub Pages). Para comprobarlo:

```bash
cd frontend
npm run build -- --base /olivetwin/
npm run preview -- --base /olivetwin/
```

La URL local será `http://localhost:4173/olivetwin/`. Después conviene restaurar
la build normal con `npm run build`. El escenario AT-17 de
[`docs/qa-results.md`](docs/qa-results.md) documenta esta prueba.

## Pruebas

- **Unitarias (Vitest):** junto al código de cada nodo, con patrón `*.test.ts`
  (`frontend/src/**`, `frontend/tests/**`, `frontend/scripts/**`).
- **Validación de datos:** `npm run validate:data` comprueba esquema, semántica,
  rutas, coherencia `datasetMode`/`status`, fixtures válidos e inválidos, y la
  existencia y transparencia de los PNG publicados.
- **E2E (Playwright, harness externo):** los escenarios en navegador real y las
  capturas están descritos en
  [`frontend/tests/e2e/README.md`](frontend/tests/e2e/README.md). Playwright no
  es dependencia de `frontend/package.json` y no se ejecuta en CI.
- **Informe de QA:** [`docs/qa-results.md`](docs/qa-results.md), con evidencias
  en `docs/qa/`.

## Datos: solo reales

La demo carga siempre `datasetMode: "real"`:

- `frontend/public/data/real/manifest.json` declara **Jaén** y **Toledo**, cada
  una con su capa `soil-moisture` y **tres `timeSteps`** (20 jun, 2 jul y 14 jul
  de 2026).
- Cada paso tiene su PNG, su `bbox` y su procedencia (`acquisitionDate`,
  `sceneId`, CRID y URL de referencia).
- La interfaz no ofrece selector de modo ni aviso «DATOS SIMULADOS». El
  componente `DataModeSwitch.vue` permanece en el repositorio sin uso.
- El contrato sigue admitiendo `datasetMode: "sample"` para fixtures y pruebas,
  pero `frontend/public/data/sample/` no se publica y `validate:data` lo trata
  como opcional.

Los estados de carga son `loading`, `ready`, `empty` y `error`. Un manifiesto
roto, un 404 o un JSON inválido producen un error visible; **no** hay fallback a
otro modo ni a datos sintéticos.

## Cómo añadir datos reales

Añadir una zona real **no requiere modificar componentes Vue**: basta un PNG
georreferenciado y su entrada en `frontend/public/data/real/manifest.json`,
validados y aprobados científicamente.

- Guía completa, contrato y checklist:
  [`docs/handoff-science.md`](docs/handoff-science.md).
- Conversor de NISAR L3 SME2 a capa `soil-moisture` (PNG + `bbox` + leyenda +
  procedencia): [`pipelines/nisar/README.md`](pipelines/nisar/README.md).
- Referencia práctica del contrato:
  [`docs/data-contract.md`](docs/data-contract.md).

Resumen del flujo con el pipeline existente:

```bash
# 1) Staging (no toca la app): HDF5 NISAR SME2 → PNG + metadatos
python pipelines/nisar/sme2_to_overlay.py nisar_sme2_data/*.h5 \
  --aoi WEST SOUTH EAST NORTH --zone-id jaen --zone-name "Jaén" \
  --staging pipelines/nisar/sme2_staging

# 2) Publicar todas las fechas como timeSteps tras la aprobación humana
python pipelines/nisar/sme2_to_overlay.py nisar_sme2_data/*.h5 \
  --aoi WEST SOUTH EAST NORTH --zone-id jaen --zone-name "Jaén" \
  --publish --approved-by "Nombre del revisor"

# 3) Re-render desde el staging sin volver a abrir los HDF5
python pipelines/nisar/sme2_to_overlay.py \
  --from-staging pipelines/nisar/sme2_staging/jaen \
  --zone-id jaen --zone-name "Jaén" \
  --auto-scale --publish --approved-by "Nombre del revisor"

# 4) Validar y publicar la build estática
npm run validate:data --prefix frontend
```

`--publish` sin `--date` escribe todas las fechas en
`public/data/real/zones/<id>/soil-moisture/<fecha>.png`, añade o sustituye la
capa sin duplicarla y sube el manifiesto a `schemaVersion: "1.2.0"`. Después,
revisa la alineación y la línea temporal en el navegador. No se versionan HDF5,
GeoTIFF ni otros binarios científicos grandes.

## Contrato de datos

El contrato vigente es la versión **v1.2.0** (aditiva sobre v1.1.0).
Convenciones que no deben cambiarse sin una versión mayor:

- `bbox = [west, south, east, north]` en WGS84 (EPSG:4326). Leaflet recibe
  `[[south, west], [north, east]]`.
- Las rutas `image` son relativas a `public/`, sin `/` inicial ni `..`, y se
  resuelven con `import.meta.env.BASE_URL`.
- `status` de capa: `synthetic` o `processed_real`, coherente con
  `datasetMode`; `sample` solo admite `synthetic` y `real` solo
  `processed_real`.
- `layer.timeSteps` (v1.2.0) es opcional: pasos ordenados por fecha, con el
  `image`/`bbox` de `layer` iguales a los del último paso. Unidad, rango y
  leyenda son comunes para comparar fechas.

## Mapa de módulos

| Ruta | Contenido | Propiedad |
|---|---|---|
| `frontend/` | Aplicación Vue 3 + Vite + TypeScript, `package.json`, `package-lock.json` y configuración de Vite. | Integración |
| `frontend/public/data/real/` | Manifiesto real y PNG NISAR SME2 de Jaén y Toledo (3 fechas). | WP-04 / Ciencia |
| `frontend/src/types/`, `frontend/src/services/`, `frontend/src/composables/` | Tipos del contrato, carga de manifiestos y estado de la aplicación. | WP-04 |
| `frontend/src/components/`, `frontend/src/styles/` | Mapa Leaflet, paneles, leyenda, controles y estilos. | WP-07 |
| `frontend/src/App.vue` | Composición e integración de la vista; no es propietario de la lógica de datos ni de la UI. | INT01 |
| `frontend/tests/e2e/` | Specs E2E de Playwright e instrucciones del harness externo. | INT02 |
| `contracts/` | JSON Schema y documentación del contrato de datos v1.2.0. | WP-04 / A02 |
| `pipelines/nisar/` | Conversor NISAR L3 SME2 → capa `soil-moisture` y sus pruebas. | Ciencia |
| `pipelines/vegetation/` | Trabajo futuro de índices de vegetación. | Fase posterior |
| `pipelines/historical/` | Trabajo futuro con registros históricos y de cosecha. | Fase posterior |
| `data/references/` | Material de referencia para el equipo; sin binarios grandes versionados. | Compartido |
| `scripts/` | Utilidades de datos (hoy, validación en `frontend/scripts/`). | WP-04 |
| `docs/` | Contrato, handoff, QA, revisión del baseline y planes. | Compartido |
| `.github/` | CI y plantilla de pull request. | Integración |

No se versionan HDF5, GeoTIFF intermedios, NetCDF ni otros binarios científicos
grandes; solo se publican PNG optimizados y JSON en `frontend/public/data/`.

## Índice de documentación

| Documento | Contenido |
|---|---|
| [`docs/c0-interfaces.md`](docs/c0-interfaces.md) | Interfaces congeladas entre WP-04 y WP-07 (tipos, composable, props/emits). |
| [`docs/contract-freeze.md`](docs/contract-freeze.md) | Acuerdo de congelación del contrato y regla de cambios. |
| [`docs/data-contract.md`](docs/data-contract.md) | Referencia práctica del contrato, validación y diagnóstico. |
| [`docs/handoff-science.md`](docs/handoff-science.md) | Cómo publicar una zona real sin tocar Vue. |
| [`docs/qa-results.md`](docs/qa-results.md) | Resultados de aceptación, E2E, evidencias, bugs y limitaciones. |
| [`docs/baseline-review.md`](docs/baseline-review.md) | Revisión independiente del baseline de Fase A. |
| [`docs/work-packets/README.md`](docs/work-packets/README.md) | Índice de planes y nodos de Fase A y Fase B con su estado. |
| [`contracts/README.md`](contracts/README.md) | Esquema JSON y convenciones resumidas. |
| [`frontend/tests/e2e/README.md`](frontend/tests/e2e/README.md) | Cómo recrear y ejecutar el harness E2E. |
| [`pipelines/nisar/README.md`](pipelines/nisar/README.md) | Conversor NISAR SME2, salvaguardas y limitaciones. |
| [`AGENTS.md`](AGENTS.md) | Reglas para agentes y mapa de ámbitos de escritura. |
| [`docs/contributing.md`](docs/contributing.md) | Ramas, pull requests, revisión y check `ci`. |

## Fase B: work packets

| Work packet | Responsabilidad | Ámbito principal |
|---|---|---|
| **WP-04** | Contratos completos, tipos, manifiestos, loader, validador y estado de datos. | `contracts/`, `frontend/src/types/`, `frontend/src/services/`, `frontend/src/composables/`, `frontend/public/data/`, scripts de datos. |
| **WP-07** | Mapa Leaflet, mapas base PNOA/OSM, zonas, overlays, opacidad, leyendas, controles y avisos. | `frontend/src/components/`, estilos y código de Leaflet. |

Sus resultados se componen en `frontend/src/App.vue`, que se limita a la
composición. El reparto detallado, los criterios de aceptación y las reglas de
convivencia están en [`AGENTS.md`](AGENTS.md) y en el
[índice de work packets](docs/work-packets/README.md).

## Colaboración

- Guía de contribución, ramas, PR y revisión:
  [`docs/contributing.md`](docs/contributing.md).
- Reglas para agentes automáticos: [`AGENTS.md`](AGENTS.md).
- Plantilla de pull request:
  [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).
- Incidencias y propuestas: pestaña **Issues** del repositorio.

`main` debe estar siempre compilable. Los cambios entran por pull request
pequeña, con el check `ci` en verde y revisión independiente; no se fusiona
sin aprobación humana.

## Limitaciones conocidas

- **Producto PROVISIONAL.** La humedad NISAR L3 SME2 no está totalmente
  calibrada; las comparaciones entre fechas o zonas deben interpretarse con
  cautela. Jaén se observa en pasada ascendente (~05:23 UTC) y Toledo en
  descendente (~19:09 UTC): la comparación incluye la hora del día.
- **Sin estimación en algunas superficies.** El producto no estima humedad en
  zonas urbanas, agua o vegetación densa; esos píxeles son transparentes.
- **Dependencia de red.** PNOA y OSM son servicios externos. Si PNOA falla, la
  interfaz permite cambiar a OSM y avisa sin bloquear el mapa; sin Internet las
  teselas no cargan.
- **Los E2E no están en CI.** Requieren un harness de Playwright externo al
  repositorio ([instrucciones](frontend/tests/e2e/README.md)).
- **La demo no cubre producción ni riego.** Solo muestra humedad superficial
  georreferenciada; no calcula kg/ha ni dosis de riego.
- El repositorio es **privado en una cuenta gratuita**. La protección de rama y
  los rulesets de GitHub pueden no estar disponibles; hasta que el plan lo
  permita, las reglas se aplican por convención y no se declarará `main` como
  protegida si no lo está.
- Solo `AlRos14` está verificado como colaborador; el resto de identidades y
  los owners de WP están pendientes de asignación. No se crea `CODEOWNERS`
  con usuarios no verificados.
