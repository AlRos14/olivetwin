# OliveTwin

**NASA Space Apps Challenge 2026 — reto «Dancing with the SARs».**

OliveTwin es una aplicación web estática para explorar, sobre un mapa de España,
capas de **vegetación (NDVI)** y **humedad superficial** en zonas de estudio
delimitadas. El objetivo del proyecto es investigar por qué dos olivares
cercanos y aparentemente similares pueden producir cantidades distintas,
combinando observaciones radar, vegetación, humedad y registros de cosecha.

Estado actual: **Fase A (baseline)**. La aplicación Vue se prepara en esta fase;
el mapa Leaflet y las capas visuales se implementan en Fase B (WP-04 y WP-07).
Los manifiestos `sample` y `real` existen vacíos a propósito: todavía no se
muestran capas.

Repositorio: <https://github.com/AlRos14/olivetwin> (privado).

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
- **El mapa base no son los datos científicos.** PNOA/IGN y OpenStreetMap
  sirven para orientación y no tienen por qué coincidir en fecha con las capas.

## Mapa de módulos

| Ruta | Contenido | Propiedad |
|---|---|---|
| `frontend/` | Aplicación Vue 3 + Vite + TypeScript, `package.json`, `package-lock.json` y configuración de Vite. | Fase A / integración |
| `frontend/public/data/sample/` | Manifiesto y assets optimizados del modo de datos sintéticos. | WP-04 |
| `frontend/public/data/real/` | Manifiesto y assets del modo de datos reales; inicialmente `zones: []`. | WP-04 |
| `frontend/src/types/`, `frontend/src/services/`, `frontend/src/composables/` | Tipos del contrato, carga de manifiestos y estado de la aplicación. | WP-04 |
| `frontend/src/components/` | Componentes de mapa, paneles, leyenda y controles. | WP-07 |
| `frontend/src/App.vue` | Composición e integración de la vista; no es propietario de la lógica de datos ni de la UI. | Integración |
| `contracts/` | JSON Schema y documentación del contrato de datos v1.1.0. | A02 / WP-04 |
| `pipelines/nisar/` | Trabajo de adquisición y procesamiento radar. | Fase posterior |
| `pipelines/vegetation/` | Trabajo de índices de vegetación. | Fase posterior |
| `pipelines/historical/` | Trabajo con registros históricos y de cosecha. | Fase posterior |
| `data/references/` | Material de referencia para el equipo; sin binarios grandes versionados. | Compartido |
| `scripts/` | Utilidades de datos, incluidos generación y validación de manifiestos. | WP-04 |
| `docs/` | Contrato congelado, guía de contribución y documentación de trabajo. | Compartido |
| `.github/` | CI y plantilla de pull request. | Integración |

Las carpetas `pipelines/`, `data/references/` y `docs/work-packets/` están
reservadas en Fase A y pueden contener solo marcadores (`.gitkeep`). No se
versionan HDF5, GeoTIFF intermedios ni otros binarios científicos grandes.

## Arranque local

Requisitos: **Node.js 22 LTS** (la versión exacta se fija en `.nvmrc`) y npm.
Con `nvm` instalado:

```bash
nvm use
cd frontend
npm ci
npm run dev
```

Comprobaciones antes de abrir o actualizar una pull request:

```bash
cd frontend
npm ci
npm run validate:data   # valida los manifiestos con el esquema de contracts/
npm run build           # genera frontend/dist/
npm run preview         # opcional: sirve la build localmente
```

`npm ci` requiere que `frontend/package-lock.json` esté versionado. Si algún
script no existe todavía en tu rama, no lo simules: indica el bloqueo.

## Modos de datos: `sample` y `real`

La aplicación distingue dos modos y nunca sustituye un modo por otro de forma
silenciosa:

- **`sample`**: datos sintéticos, generados para probar la interfaz. Deben
  mostrarse con un aviso visible de que no son observaciones reales.
- **`real`**: datos procesados a partir de fuentes verificables. En Fase A el
  manifiesto es válido y está vacío (`zones: []`); la interfaz debe explicar
  que no hay zonas disponibles en lugar de recurrir a los datos de muestra.

El modo se selecciona en la interfaz (WP-07) y se resuelve con el manifiesto
correspondiente (WP-04). Los estados de carga previstos son `loading`, `ready`,
`empty` y `error`.

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

Documentación relacionada:

- [`docs/contract-freeze.md`](docs/contract-freeze.md) — acuerdo congelado de
  Fase A.
- [`contracts/README.md`](contracts/README.md) — esquema y convenciones.

## Fase B: work packets

| Work packet | Responsabilidad | Ámbito principal |
|---|---|---|
| **WP-04** | Contratos completos, tipos, manifiestos, generador de datos de muestra, loader, validador y estado `sample`/`real`. | `contracts/`, `frontend/src/types/`, `frontend/src/services/`, `frontend/src/composables/`, `frontend/public/data/`, scripts de datos. |
| **WP-07** | Mapa Leaflet, mapas base PNOA/OSM, zonas, overlays, opacidad, leyendas, controles y avisos. | `frontend/src/components/`, estilos y código de Leaflet. |

`frontend/src/App.vue` se limita a la integración entre ambos. El reparto
detallado y las reglas de convivencia están en [`AGENTS.md`](AGENTS.md). La
carpeta `docs/work-packets/` queda reservada para la documentación de cada
paquete en Fase B; sus owners humanos están **pendientes de asignar**.

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

- El repositorio es **privado en una cuenta gratuita**. La protección de rama y
  los rulesets de GitHub pueden no estar disponibles; hasta que el plan lo
  permita, las reglas se aplican por convención y no se declarará `main` como
  protegida si no lo está.
- Fase A no incluye mapa, PNG de capas, datos NISAR ni resultados científicos.
- Solo `AlRos14` está verificado como colaborador; el resto de identidades y
  los owners de WP están pendientes de asignación. No se crea `CODEOWNERS`
  con usuarios no verificados.
