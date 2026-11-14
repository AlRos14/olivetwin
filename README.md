# OliveTwin

**NASA Space Apps Challenge 2026 — reto «Dancing with the SARs».**

OliveTwin es una aplicación web estática para explorar, sobre un mapa de España,
capas de **vegetación (NDVI)** y **humedad superficial** en zonas de estudio
delimitadas. El objetivo del proyecto es investigar por qué dos olivares
cercanos y aparentemente similares pueden producir cantidades distintas,
combinando observaciones radar, vegetación, humedad y registros de cosecha.

Repositorio: <https://github.com/AlRos14/olivetwin> (privado).

## Estado actual: demo de la demo (Fase B)

La Fase B (WP-04 + WP-07) está **integrada**: la aplicación arranca sin backend y
permite recorrer una demo funcional de principio a fin.

Qué se puede hacer hoy:

- **Mapa Leaflet de España** (Península, Baleares y Canarias) con dos mapas base:
  **Ortofoto PNOA** del IGN/CNIG (por defecto) y **OpenStreetMap**, con
  atribuciones visibles y cambio sin recargar la página.
- **Dos zonas de muestra**, Jaén y Toledo, delimitadas por su `bbox`. Son
  **ubicaciones ilustrativas, no parcelas reales**.
- **Capas de muestra de NDVI y humedad superficial**, una visible cada vez, con
  opacidad 0–100 %, visibilidad, leyenda, unidad, fecha (o «Fecha no
  disponible») y procedencia.
- **Selector «Datos de muestra | Datos reales»**. El modo real está vacío por
  ahora y lo dice explícitamente: «Todavía no hay zonas con datos científicos
  reales». Nunca se recurre a los datos de muestra de forma silenciosa.
- **Aviso persistente «DATOS SIMULADOS»** mientras se muestra una capa
  sintética o el modo de muestra está activo.
- Mensajes de error si un manifiesto o un PNG no están disponibles, sin romper
  el mapa base ni inventar datos.

> **Importante:** el mapa base (PNOA/OSM) es cartografía real; las **capas
> científicas** de esta demo son sintéticas y están marcadas como tales. No son
> observaciones de NASA ni resultados del pipeline NISAR.

El informe de QA con la evidencia de los escenarios AT-01…AT-20 y
SAMPLE-01…SAMPLE-08 está en [`docs/qa-results.md`](docs/qa-results.md). El
veredicto fue **PASS con limitaciones de documentación**; esta rama actualiza
los README y el índice de work packets para cerrarlas (pendiente de revisión
independiente).

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
- **La humedad superficial (futura SME2) no es riego.** SME2 estima humedad en
  la capa superficial del suelo; no equivale a humedad profunda ni a una dosis
  de riego, y su resolución limita su uso a parcelas suficientemente grandes.
- **Los overlays PNG son representaciones visuales.** Sus colores no permiten
  recuperar valores científicos exactos ni hacer consultas por píxel.
- **Los datos de muestra son sintéticos.** Están identificados como tales y
  nunca deben presentarse como datos reales de NASA.
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
aplicación carga `public/data/sample/manifest.json` y los PNG de las zonas al
abrirse; no necesita backend, base de datos ni claves.

### Scripts npm

Se ejecutan desde `frontend/` (o con `--prefix frontend` desde la raíz):

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo de Vite con recarga en caliente. |
| `npm run build` | `vue-tsc -b` + `vite build`; genera `frontend/dist/`. |
| `npm run preview` | Sirve localmente la build de producción. |
| `npm test` | Suite de Vitest (contrato, servicios, composable y componentes). |
| `npm run validate:data` | Valida los manifiestos con el esquema y los assets de `public/data/`. |
| `npm run generate:sample` | Regenera de forma determinista los PNG y el manifiesto de muestra. |
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

## Modos de datos: `sample` y `real`

La aplicación distingue dos modos y nunca sustituye uno por otro de forma
silenciosa:

- **`sample`** (por defecto): datos sintéticos, generados para probar la
  interfaz. Se muestran con el aviso persistente **DATOS SIMULADOS**. Incluye
  Jaén y Toledo, cada una con NDVI y humedad.
- **`real`**: datos procesados a partir de fuentes verificables. Hoy
  `frontend/public/data/real/manifest.json` es válido y está vacío
  (`zones: []`); la interfaz explica que no hay zonas disponibles en lugar de
  recurrir a los datos de muestra.

El modo se selecciona en la interfaz y se resuelve con el manifiesto
correspondiente en tiempo de ejecución (sin recompilar). Los estados de carga
son `loading`, `ready`, `empty` y `error`. Un manifiesto roto, un 404 o un JSON
inválido producen un error visible; **no** hay fallback a muestra.

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

Resumen del flujo: exportar el PNG en EPSG:3857 con píxeles sin dato
transparentes, completar la procedencia verificable, colocar el archivo bajo
`public/data/real/zones/<id>/`, editar solo el manifiesto real, ejecutar
`npm run validate:data`, revisar la alineación en el navegador y publicar tras
la aprobación humana. No se versionan HDF5, GeoTIFF ni otros binarios
científicos grandes.

## Contrato de datos

El contrato congelado es la versión **v1.1.0**. Convenciones que no deben
cambiarse sin una versión mayor:

- `bbox = [west, south, east, north]` en WGS84 (EPSG:4326). Leaflet recibe
  `[[south, west], [north, east]]`.
- Las rutas `image` son relativas a `public/`, sin `/` inicial ni `..`, y se
  resuelven con `import.meta.env.BASE_URL`.
- `status` de capa: `synthetic` o `processed_real`, coherente con
  `datasetMode`; `sample` solo admite `synthetic` y `real` solo
  `processed_real`.

## Mapa de módulos

| Ruta | Contenido | Propiedad |
|---|---|---|
| `frontend/` | Aplicación Vue 3 + Vite + TypeScript, `package.json`, `package-lock.json` y configuración de Vite. | Integración |
| `frontend/public/data/sample/` | Manifiesto y PNG sintéticos de Jaén y Toledo (NDVI y humedad). | WP-04 |
| `frontend/public/data/real/` | Manifiesto real; hoy `zones: []`, sin assets publicados. | WP-04 |
| `frontend/src/types/`, `frontend/src/services/`, `frontend/src/composables/` | Tipos del contrato, carga de manifiestos y estado de la aplicación. | WP-04 |
| `frontend/src/components/`, `frontend/src/styles/` | Mapa Leaflet, paneles, leyenda, controles y estilos. | WP-07 |
| `frontend/src/App.vue` | Composición e integración de la vista; no es propietario de la lógica de datos ni de la UI. | INT01 |
| `frontend/tests/e2e/` | Specs E2E de Playwright e instrucciones del harness externo. | INT02 |
| `contracts/` | JSON Schema y documentación del contrato de datos v1.1.0. | WP-04 / A02 |
| `pipelines/nisar/` | Conversor NISAR L3 SME2 → capa `soil-moisture` y sus pruebas. | Ciencia |
| `pipelines/vegetation/` | Trabajo futuro de índices de vegetación. | Fase posterior |
| `pipelines/historical/` | Trabajo futuro con registros históricos y de cosecha. | Fase posterior |
| `data/references/` | Material de referencia para el equipo; sin binarios grandes versionados. | Compartido |
| `scripts/` | Generación reproducible de los datos de muestra. | WP-04 |
| `docs/` | Contrato, handoff, QA, revisión del baseline y planes. | Compartido |
| `.github/` | CI y plantilla de pull request. | Integración |

No se versionan HDF5, GeoTIFF intermedios, NetCDF ni otros binarios científicos
grandes; solo se publican PNG optimizados y JSON en `frontend/public/data/`.

## Índice de documentación

| Documento | Contenido |
|---|---|
| [`docs/c0-interfaces.md`](docs/c0-interfaces.md) | Interfaces congeladas entre WP-04 y WP-07 (tipos, composable, props/emits). |
| [`docs/contract-freeze.md`](docs/contract-freeze.md) | Acuerdo de congelación del contrato v1.1.0 y regla de cambios. |
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
| **WP-04** | Contratos completos, tipos, manifiestos, generador de datos de muestra, loader, validador y estado `sample`/`real`. | `contracts/`, `frontend/src/types/`, `frontend/src/services/`, `frontend/src/composables/`, `frontend/public/data/`, scripts de datos. |
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

- **El modo real está vacío.** No hay ninguna capa `processed_real` publicada;
  el fixture contractual de las pruebas no se expone como dato real.
- **Dependencia de red.** PNOA y OSM son servicios externos. Si PNOA falla, la
  interfaz permite cambiar a OSM y avisa sin bloquear el mapa; sin Internet las
  teselas no cargan.
- **Los E2E no están en CI.** Requieren un harness de Playwright externo al
  repositorio ([instrucciones](frontend/tests/e2e/README.md)).
- **La demo sintética no cumple por sí sola los requisitos del concurso** si
  estos exigen una fuente NASA real; eso depende de la integración científica y
  del reglamento vigente.
- El repositorio es **privado en una cuenta gratuita**. La protección de rama y
  los rulesets de GitHub pueden no estar disponibles; hasta que el plan lo
  permita, las reglas se aplican por convención y no se declarará `main` como
  protegida si no lo está.
- Solo `AlRos14` está verificado como colaborador; el resto de identidades y
  los owners de WP están pendientes de asignación. No se crea `CODEOWNERS`
  con usuarios no verificados.
