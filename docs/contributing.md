# Guía de contribución

OliveTwin se desarrolla en un único repositorio:
<https://github.com/AlRos14/olivetwin> (público). Esta guía explica dónde
plantear trabajo, qué puede editar cada persona y qué necesita una pull request
para integrarse.

## Dónde abrir una Issue

Usa la pestaña **Issues** del repositorio para:

- proponer una funcionalidad o un cambio de contrato;
- reportar un error reproducible;
- pedir acceso, revisión o aclaración sobre un ámbito;
- registrar un bloqueo o una limitación.

Antes de abrir una Issue, busca si ya existe una equivalente. Incluye contexto,
resultado esperado, resultado actual, archivos afectados, comandos ejecutados y
la procedencia de los datos implicados. No publiques secretos, tokens ni datos
personales en una Issue.

No hay usuarios de ejemplo ni owners inventados. Las identidades del equipo se
irán registrando cuando estén verificadas; por ahora solo `AlRos14` figura como
owner del repositorio y colaborador verificado.

## ¿Qué puedo editar?

La asignación de personas a **WP-04** y **WP-07** se coordina **fuera del repositorio** (decisión GA, hackatón de 48 h): no se registra ni se verifica en GitHub.
Los scopes de archivos sí son obligatorios: si necesitas tocar un área
compartida, avisa en la Issue correspondiente antes de hacerlo.

| Área | Uso | Quién edita |
|---|---|---|
| `frontend/src/components/`, estilos, Leaflet | Mapa, paneles, leyenda, controles y avisos. | WP-07 |
| `frontend/src/types/`, `frontend/src/services/`, `frontend/src/composables/` | Contrato, carga de manifiestos y estado. | WP-04 |
| `frontend/public/data/` | Manifiestos y assets optimizados `sample`/`real`. | WP-04 |
| `contracts/` | JSON Schema y documentación del contrato. | Owner del contrato (WP-04) con revisión de integración |
| `scripts/` de datos | Generación y validación de datos. | WP-04 |
| `frontend/src/App.vue` | Composición de la vista. | Integración, coordinada entre WP-04 y WP-07 |
| `frontend/package.json`, `package-lock.json` | Dependencias y scripts. | Coordinación explícita antes de añadir dependencias |
| `.github/workflows/` | CI. | Integración |
| `pipelines/`, `data/references/` | Trabajo científico y referencias. | Equipo de datos / responsable del pipeline |
| `README.md`, `AGENTS.md`, `docs/contributing.md` | Gobierno y documentación. | Responsable de colaboración |

Si necesitas un cambio fuera de tu ámbito, no sobrescribas el archivo: abre una
Issue o pide al owner que lo haga. Un solo owner por archivo o subpaquete;
autor y revisor nunca deben ser la misma persona.

## Ramas

Crea una rama corta desde `main`. Convención:

- `bootstrap/...` — estructura y puesta en marcha (por ejemplo,
  `bootstrap/phase-a`).
- `wp04/...` — contratos, datos, loader y validación.
- `wp07/...` — mapa Leaflet, componentes y estilos.
- `wp02/...` — trabajo del paquete WP-02.

Usa minúsculas y guiones, con un nombre descriptivo y breve. No trabajes
directamente sobre `main` y no reutilices una rama ya fusionada.

## Pull requests

`main` debe estar **siempre compilable**. Los cambios entran por pull request
pequeña:

1. Abre una Issue o enlaza el work packet.
2. Crea una rama corta desde `main`.
3. Haz commits pequeños con prefijo convencional (`feat:`, `fix:`, `docs:`,
   `chore:`, `test:`, `ci:`, `refactor:`).
4. Abre la PR contra `main` usando
   [`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md).
5. Espera el check **`ci`** en verde y una revisión independiente.
6. La fusión se hace con **squash merge** y se borra la rama.

Reglas de una PR:

- un propósito por PR; evita mezclar refactorizaciones, formato y cambios
  funcionales;
- no incluyas archivos ajenos a tu ámbito;
- actualiza la documentación y los ejemplos si cambia el comportamiento;
- incluye capturas o una descripción verificable si el cambio es de interfaz;
- no fusiones tu propia PR.

### Check requerido: `ci`

El workflow de CI ejecuta la instalación, la validación de los manifiestos y la
build. El nombre estable del job es **`ci`**. Una PR con `ci` en rojo no se
fusiona, aunque la instalación de npm haya funcionado: el check también verifica
el build y el contrato de datos.

### Revisión independiente

- Cada work packet tiene un owner humano y requiere revisión de otra persona.
- Un comentario automático, una aprobación de un agente o una revisión de la
  misma sesión **no cuentan** como aprobación humana.
- Si varias personas comparten credenciales, GitHub no puede distinguir quién
  aprobó. En ese caso, deja constancia de la revisión por un canal externo o
  usa una cuenta de bot separada para las automatizaciones.
- Los cambios en `contracts/` y `.github/workflows/` requieren además revisión
  de integración.
- El revisor comprueba el ámbito, las pruebas, la procedencia de los datos, la
  ausencia de binarios grandes y que no se afirmen resultados científicos no
  validados.

## Datos y archivos grandes

- **No versiones** HDF5, GeoTIFF intermedios, NetCDF ni otros binarios
  científicos grandes. `.gitignore` excluye `*.h5`, `*.hdf5`, `*.tif`, `*.tiff`
  y `*.nc`.
- Publica solo assets optimizados (PNG y JSON) en `frontend/public/data/`.
- Toda capa debe declarar procedencia, fecha cuando exista y estado
  (`synthetic` o `processed_real`).
- Los datos sintéticos deben estar marcados como tales y nunca presentarse como
  observaciones de NASA.
- Una excepción para versionar una prueba pequeña requiere justificación y
  aprobación del owner; no la añadas por iniciativa propia.
- No incorpores datos sin licencia y procedencia claras.

## Contrato de datos

El contrato congelado es **v1.1.0**. Las ampliaciones deben ser aditivas o
aprobarse como cambio de interfaz con su versión. No cambies sin acuerdo:

- el orden `bbox = [west, south, east, north]` en EPSG:4326;
- la coherencia entre `datasetMode` y el `status` de cada capa;
- las rutas relativas a `public/` y su resolución con `import.meta.env.BASE_URL`.

Consulta [`docs/contract-freeze.md`](contract-freeze.md) y
[`contracts/README.md`](../contracts/README.md).

## Protección de `main`

Configurada el 2026-11-14, al hacerse público el repositorio:

- PR obligatoria para entrar en `main`; check requerido `ci`;
- sin force-push ni borrado de `main`;
- 0 aprobaciones requeridas en GitHub (hackatón de 48 h): la revisión
  independiente se mantiene como norma del equipo, no como bloqueo técnico;
- el administrador puede saltarse la protección solo en una emergencia.

No se crea un archivo `CODEOWNERS` con usuarios ficticios. Se completará cuando
las identidades reales estén verificadas.

## Antes de pedir revisión

- [ ] La rama parte de `main` y tiene un propósito.
- [ ] Solo se han modificado archivos de mi ámbito.
- [ ] `npm ci` funciona desde una instalación limpia.
- [ ] `npm run validate:data` pasa.
- [ ] `npm run build` pasa.
- [ ] La PR enlaza su Issue o work packet.
- [ ] La plantilla de PR está completa, con procedencia y riesgos.
- [ ] No hay binarios grandes, secretos ni datos sintéticos sin marcar.
- [ ] He solicitado revisión a una persona distinta de quien implementó.
