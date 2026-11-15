# Congelación del contrato mínimo OliveTwin — v1.1.0, ampliaciones aditivas v1.2.0 y v1.3.0

**Fecha del acuerdo:** 14 de noviembre de 2026 (Fase A, nodo A02; corregido en A02-fix).
**Estado:** congelado para el arranque de Fase B; alineado con el ejemplo §4.3 del plan v2.
**Repositorio:** <https://github.com/AlRos14/olivetwin> (público, owner `AlRos14`).
**Alcance:** manifiestos de datos, convenciones espaciales y tipos de referencia compartidos por
WP-04 (datos y contratos) y WP-07 (Vue + Leaflet).

Este documento es el acuerdo que permite lanzar ambos work packets en paralelo. No define el
loader, ni la lógica científica, ni componentes de interfaz: eso pertenece a WP-04 y WP-07.

## 1. Relación con el plan de Fase B

Este baseline **sustituye los nodos PRE00, PRE01, PRE02 y C0** del plan de Fase B. Una vez
aprobado GA:

- no se repite el bootstrap del proyecto;
- no se renegocia el contrato básico aquí descrito;
- el orquestador de Fase B marca esos nodos como ya satisfechos y lanza WP-04 y WP-07.

El esquema completo, los fixtures, el generador de PNG y la validación científica siguen
siendo responsabilidad de WP-04.

## 2. Campos y convenciones inmutables

| Objeto | Campos mínimos / convenios | Propiedad del trabajo posterior |
|---|---|---|
| Manifest | `schemaVersion`, `datasetMode` (`sample`/`real`), `appTitle`, `zones[]` | WP-04 completa el schema |
| Zona | `id`, `name`, `bbox`, `layers[]`; `description` opcional | WP-04 formaliza JSON Schema; WP-07 visualiza |
| Capa | `id` (`ndvi` o `soil-moisture`), `title`, `kind: image-overlay`, `image`, `bbox`, `imageCrs`, `unit`, `status`, `legend`, `provenance`, `qualityNote`; `variable` y `range` (`[min,max]`) opcionales | WP-04 define restricciones/validador; WP-07 usa props |
| BBox | `[west, south, east, north]`, WGS84 EPSG:4326; Leaflet recibe `[[south,west],[north,east]]` | No cambiar orden sin versión mayor |
| Capa PNG | PNG RGBA + `bbox` de imagen, CRS de presentación adecuado, transparencia de nodata | WP-04 genera muestra; científicos producen real |
| Modo | `sample` / `real` en runtime; nunca fallback silencioso | WP-04 estado, WP-07 selector UI |
| Estado de carga | `loading`, `ready`, `empty`, `error` | WP-04 servicio/composable |
| Mapa base | `pnoa` / `osm` | WP-07 |
| Rutas | `image` relativa a `public/`, sin `/` inicial, sin `..` y sin `%`; resolver con `import.meta.env.BASE_URL` | WP-04 carga, WP-07 no crea rutas |
| Procedencia | `synthetic` vs `processed_real`; no presentar datos inventados como NASA real | Aprobación científica cuando haya real |

Notas de aplicación:

- `schemaVersion` debe cumplir `^1\.[0-9]+\.[0-9]+$`. En este baseline se admiten
  `1.1.0` (sin serie temporal) y `1.2.0` (con o sin `timeSteps`, ver §2.4).
- `zones: []` es válido en ambos modos; en `real` expresa ausencia deliberada de mediciones,
  no un error que deba rellenarse con ejemplos.
- Las rutas `image` se resuelven como `${import.meta.env.BASE_URL}${image}`. WP-04 entrega la
  URL resuelta; WP-07 no compone rutas.
- `legend` es una **lista de al menos dos clases** `{value: number, color: "#rrggbb", label:
  string}`, coherente con el ejemplo §4.3 del plan v2; no es un objeto libre y debe estar
  ordenada por `value` de forma creciente estricta (validación semántica).
- `provenance` exige `provider`, `product` y `processingVersion`. Admite
  `acquisitionDate` (fecha ISO 8601 o `null`), `sceneId`, `referenceUrl` y `note` (string o
  `null`). Se mantiene `additionalProperties: true` para extensiones aditivas del pipeline
  científico (por ejemplo CRID o madurez de NISAR SME2). El antiguo campo `source` se elimina.
- La semántica de los valores (rango de `bbox`, `min < max` en `range`, orden de la leyenda,
  unicidad de `id`, coherencia zona/capa, prefijo `data/<datasetMode>/`, existencia y alfa del
  PNG, coherencia `datasetMode`/`status` y valores de `imageCrs`) corresponde al validador de
  WP-04 (`frontend/scripts/validate-lib.mjs`), complementado por el `if/then` del esquema y no
  por el JSON Schema mínimo por sí solo.

### 2.1 Decisión de producto: `bbox` global, mapa centrado en España

El contrato **no limita las zonas a España**. El rango admitido de `bbox` es el global
(longitud ±180°, latitud ±90°) y se mantiene así deliberadamente: el equipo puede probar
manifiestos con datos NISAR reales de zonas fuera de España sin tocar el esquema ni sus
consumidores. Esta decisión no cambia el producto visible: el mapa navegable de WP-07 sigue
centrado en España (Península, Baleares y Canarias) y el encuadre inicial no se amplía por
la mera presencia de una zona exterior. `fitBounds` solo se aplica a la zona seleccionada.

### 2.2 Corrección A02-fix dentro de v1.1.0

La primera redacción de A02 divergía del ejemplo §4.3 del plan v2 en tres puntos:
`legend` era un objeto, `provenance` exigía `source` y faltaban `variable`, `range` y
`description`. A02-fix corrigió el esquema antes de que existieran consumidores en Fase B;
por ello la versión sigue siendo **1.1.0** (corrección previa a la implementación, no cambio
de interfaz ya desplegada). A partir de la aprobación de GA, cualquier cambio se rige por la
regla de la sección 4.

### 2.3 Ampliación WP04-01 (aditiva) dentro de v1.1.0

El nodo WP04-01 completó el JSON Schema y el validador con las reglas que la congelación ya
delegaba explícitamente en WP-04. **No se añaden campos, no se renombra nada y no cambia el
orden de `bbox`**, por lo que los manifiestos y fixtures existentes siguen siendo válidos y
`frontend/src/types/manifest.ts` no requiere cambios. La versión declarada por los manifiestos
continúa siendo `1.1.0`.

| Regla | Dónde se aplica | Efecto |
|---|---|---|
| `imageCrs` cerrado a `["EPSG:3857"]` | Esquema | El PNG de overlay se prepara en Web Mercator, norte arriba y extensión de `layer.bbox`. Antes era una cadena libre «por concretar en WP-04». |
| `unit` no vacío ni solo espacios | Esquema (`minLength: 1` + patrón `\S`) | Evita unidades vacías en la leyenda y la procedencia. |
| `legend` con al menos 2 paradas | Esquema (`minItems: 2`) | Una escala necesita al menos dos extremos; el ejemplo §4.3 usa tres. |
| `legend` ordenada por `value` creciente estricto | Semántica | La UI puede pintar la escala sin reordenar; valores repetidos se rechazan. |
| `id` de zona en kebab-case | Esquema (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) | Slugs estables (`jaen-demo`), sin mayúsculas, guiones dobles ni guiones en los extremos. |
| `datasetMode: sample` ⇒ toda capa `synthetic`; `datasetMode: real` ⇒ toda capa `processed_real` | Esquema (`if/then`) y semántica | Bloquea mezclar ejemplos con datos reales y viceversa. |
| `processed_real` exige `provenance.acquisitionDate`, `sceneId` y `referenceUrl` como cadenas no nulas | Esquema (`if/then`) y semántica | No se concede el estado real sin fecha, identificador de escena/producto y URL de referencia. |
| `west < east`, `south < north` en zona y capa | Semántica | Cajas geográficas válidas. |
| `layer.bbox` dentro de `zone.bbox` con tolerancia `0.01°` | Semántica | La cobertura del raster no puede salirse de su zona de estudio. |
| `range` con `min < max` estricto | Semántica | La escala tiene un intervalo no degenerado. |
| `id` de zona único e `id` de capa único por zona | Semántica | Evita selecciones ambiguas en el manifiesto activo. |
| `image` bajo `data/<datasetMode>/` | Semántica | Un manifiesto `sample` no puede referenciar assets de `real` ni al revés. |
| `image` sin ningún `%` | Esquema (patrón), semántica y runtime (`assetUrl`) | El navegador normaliza la codificación porcentual: `%2e%2e` equivale a `..`, así que se veta cualquier `%` aunque no haya `..` literal. |
| `acquisitionDate` es una fecha real | Esquema (`format: date`/`date-time` con ajv-formats) y semántica (calendario) | Se aceptan `2026-10-19T11:19:03Z` (pipeline NISAR) y `2026-10-19`; se rechazan `2026-13-45` o `2026-02-30`, que `Date.parse` normalizaría en silencio. |
| PNG existente en `frontend/public/` y con canal alfa (color type 4 o 6, o `tRNS`) | Semántica + assets | Un overlay sin transparencia o un 404 se detectan antes de publicar. |
| `schemaVersion` semver de la major 1 | Esquema + semántica | Solo se admiten contratos `1.x.y`. |

La decisión de producto sobre `bbox` **global** (longitud ±180°, latitud ±90°, sin limitar las
zonas a España) se mantiene sin cambios y queda registrada en §2.1. El mapa navegable sigue
centrado en España; el contrato solo permite probar zonas externas sin tocar el esquema.

La lógica semántica y de assets vive en `frontend/scripts/validate-lib.mjs`, compartida por la
CLI `frontend/scripts/validate-data.mjs` y los tests `frontend/src/types/contract.test.ts`.
El runtime de WP-04 replica en `frontend/src/services/manifestSemantics.ts` el subconjunto
mínimo de geometría e ids (orden de `bbox`, contención con tolerancia de 0.01° y unicidad de
ids de zona) para no cargar `node:fs`/`node:path` en el navegador; ambas implementaciones deben
mantenerse alineadas y probadas.
Los fixtures contractuales viven en `frontend/scripts/fixtures/` y **no** se publican en
`frontend/public/data/`; el fixture `real-with-processed-real.json` existe solo para probar el
estado `processed_real` y declara explícitamente que no es una observación científica.

### 2.4 Ampliación C1 (aditiva, v1.2.0): línea temporal

La decisión C1 (docs/c0-interfaces.md §6) añade **una propiedad opcional**,
`layer.timeSteps`, para que una capa real pueda traer varias fechas y la UI
ofrezca un control temporal. Es un cambio de minor conforme a §4.1: no cambia
campos existentes, no altera el orden de `bbox` ni el significado de
`sample`/`real`, y los manifiestos v1.1.0 sin `timeSteps` siguen validando.

| Regla | Dónde se aplica | Efecto |
|---|---|---|
| `layer.timeSteps` es array de ≥ 1 pasos `{date, label?, image, bbox, provenance?}` | Esquema | Unidad, `range`, `legend` y `status` siguen siendo de la capa y comunes a todos los pasos. |
| `schemaVersion: "1.2.0"` obligatorio si hay `timeSteps`; sin serie se admiten `"1.1.0"` y `"1.2.0"` | Esquema (`if/then` + `const`) y semántica | Un manifiesto con serie no puede declararse v1.1.0. |
| `date` ISO 8601 real y orden estrictamente creciente sin duplicados | Esquema (`format`) y semántica | El slider no recibe fechas imposibles ni repetidas. |
| `image` de cada paso con las mismas reglas seguras y prefijo `data/<datasetMode>/` | Esquema, semántica y assets | No se mezclan assets de modos ni se lee fuera de `public/`. |
| `bbox` de cada paso dentro de `zone.bbox` (tolerancia 0.01°) | Semántica | La cobertura de cualquier fecha queda dentro de la zona. |
| `layer.image` y `layer.bbox` iguales a los del **último** paso | Semántica y runtime | Un consumidor v1.1 que ignore `timeSteps` sigue mostrando la fecha más reciente. |
| Procedencia efectiva `{ ...layer.provenance, ...step.provenance }` con `acquisitionDate`, `sceneId` y `referenceUrl` en `processed_real` | Semántica | No se aprueba una serie real con pasos sin trazabilidad. |
| PNG de **cada** paso existente y con alfa | Assets (`validate:data`) | Se detecta un 404 o un PNG opaco antes de publicar. |

`frontend/src/types/manifest.ts` ya exponía `TimeStep` y los campos
`timeSteps`/`selectedTimeIndex`/`selectTimeStep` congelados en C1; esta
ampliación no los reinterpreta. El estado (`useOliveTwinData`) elige el último
paso por defecto y reinicia el índice al cambiar de modo, zona o capa.

### 2.5 Ampliación v1.3.0 (aditiva): cubo de análisis por zona

Para medir variables de interés agronómico (humedad, retrodispersión radar,
vegetación, relieve, suelo y clima) y compararlas por celda, una zona puede
enlazar **opcionalmente** un cubo de análisis con `zone.analysis`. Es un cambio
de minor conforme a §4.1: no cambia campos existentes ni el orden de `bbox`, y
los manifiestos v1.1.0/v1.2.0 siguen validando.

| Regla | Dónde se aplica | Efecto |
|---|---|---|
| `zone.analysis` = `data/<datasetMode>/zones/<zone.id>/analysis/analysis.json` | Esquema (patrón) y semántica | El cubo vive junto a la zona y en el modo correcto. |
| `schemaVersion: "1.3.0"` obligatorio si alguna zona declara `analysis`; `timeSteps` admite `"1.2.0"` o `"1.3.0"` | Esquema (`if/then`) y semántica | Un consumidor v1.2 no recibe campos que no conoce sin aviso de versión. |
| El cubo cumple [`contracts/analysis.schema.json`](../contracts/analysis.schema.json) | Esquema propio | Rejilla EPSG:3857 común, variables con `scale`/`offset`, pasos con estadísticas, series de zona, fuentes no disponibles y criterios del índice. |
| Datos como PNG **gris de 8 bits** (valor = `offset` + `scale` · código; 255 = sin dato) con el tamaño exacto de la rejilla y ≤ 2 MB | Semántica y assets (`validate:data`) | Solo se publican PNG y JSON; nunca GeoTIFF/HDF5. |
| Pasos de variables temporales con fecha ISO real y orden estrictamente creciente; variables estáticas con un único paso | Semántica | Las series y los mapas de cambio comparan fechas reales. |
| `status` coherente con el modo y `provenance.license` obligatoria | Esquema y semántica | Cada variable declara licencia y atribución de su fuente. |
| Criterios del índice de aptitud que apuntan a variables existentes | Semántica | El índice no referencia datos ausentes. |
| `crops[]` opcional: aptitud por cultivo con ráster global y por factor (0–1), fuente con licencia, supuestos y método; factores que usan variables existentes; ids únicos | Esquema, semántica y assets | Los mapas de aptitud son trazables y se validan como el resto del cubo. |
| `cropFactor.classes` y `cropFactor.reference` opcionales; `crop.otherRequirements[]` opcional con variables existentes | Esquema y semántica | Los tramos óptimo / aceptable / no apto y la fuente de cada requisito se publican con los datos; la UI no los inventa. |
| `variable.group` admite `landcover` (usos del suelo, p. ej. CORINE) | Esquema | Ampliación aditiva del enum; los cubos anteriores siguen siendo válidos. |

El índice de aptitud es **exploratorio y relativo a la zona** (rangos
percentiles ponderados): no es un umbral agronómico ni una predicción de
cosecha, y la UI lo indica siempre.

## 3. Tipos TypeScript de referencia

```ts
export type DataMode = 'sample' | 'real';
export type BaseMap = 'pnoa' | 'osm';
export type ManifestLoadStatus = 'loading' | 'ready' | 'empty' | 'error';
export type BBox = [west: number, south: number, east: number, north: number];
```

Estos tipos son el contrato de referencia. **`frontend/src/types/manifest.ts` no se crea en
Fase A**: lo materializa WP-04 a partir de este acuerdo y queda como único propietario del
archivo, evitando un segundo módulo competidor. WP-07 importa esos tipos, no los redefine.

## 4. Regla de cambios

1. **Aditivo (minor: 1.2.0, 1.3.0…):** nueva propiedad opcional, nuevo `$def` reutilizable,
   nueva variante que no rompa consumidores existentes o aclaración documental. El JSON
   Schema y este documento se actualizan en el mismo cambio.
2. **Incompatible (major: 2.0.0):** campo obligatorio nuevo, cambio de tipo o de semántica,
   eliminación o renombrado de campo, cambio del orden de `bbox`, o ampliación de un enum que
   los consumidores tratan de forma exhaustiva (`datasetMode`, `status`, `id` de capa).
3. Cambiar el orden de `bbox` o el significado de `sample`/`real` **siempre** es major, sin
   excepciones.
4. Toda ampliación requiere revisión de integración de `contracts/` y actualización de este
   documento. Un cambio no aprobado no se considera contrato.
5. Los manifiestos de ejemplo (`frontend/public/data/{sample,real}/manifest.json`) se
   mantienen válidos frente a la versión vigente del esquema.

## 5. Propiedad

| Ámbito | Owner |
|---|---|
| `contracts/`, `frontend/src/types`, servicios, composables, manifiestos y scripts de datos | **WP-04** |
| `frontend/src/components`, estilos y mapa Leaflet | **WP-07** |
| Owner humano de WP-04 y WP-07 | coordinado fuera del repositorio (decisión GA) |

La asignación de personas a ambos work packets se coordina **fuera del repositorio** (decisión GA, hackatón de 48 h): no se registra ni se verifica en GitHub. Solo consta `AlRos14` como
colaborador del repositorio. Lo que sí rige dentro del repo son los scopes de archivos y la
revisión independiente de cada PR.

## 6. Verificación de la congelación

Validación local de los dos manifiestos iniciales, del ejemplo completo §4.3 y de los casos
negativos con JSON Schema draft 2020-12 (script temporal fuera del repositorio, no
versionado):

```bash
npx -y ajv-cli@5 validate --spec=draft2020 \
  -s contracts/manifest.schema.json \
  -d frontend/public/data/real/manifest.json
```

Casos negativos exigidos:

| Caso | Resultado esperado |
|---|---|
| `datasetMode: "unknown"` | rechazado por `enum` |
| `zones: null` | rechazado por `type: array` |
| sin `schemaVersion` | rechazado por `required` |
| `legend` como objeto | rechazado por `type: array` |
| `image: "/abs.png"` | rechazado por el patrón de ruta segura |
| `image: "../x.png"` | rechazado por el patrón de ruta segura |
| `image: "data/sample/%2e%2e/x.png"` | rechazado por el patrón de ruta segura (sin `%`) |
| `acquisitionDate: "2026-13-45"` | rechazado por `format: date` y por la semántica de calendario |

Evidencia de la ejecución de A02-fix con `ajv@8.20.0` en modo draft 2020-12, desde
`frontend/` y con el runner en `/tmp` (no versionado), 18/18 comprobaciones correctas:

- el ejemplo completo §4.3 del plan v2 (con `description`, `variable`, `range` y `legend`
  como lista): válido;
- `sample/manifest.json` y `real/manifest.json` vacíos: válidos;
- `datasetMode: "unknown"`: inválido por `enum`;
- `zones: null`: inválido por `type: array`;
- sin `schemaVersion`: inválido por `required`;
- `legend` como objeto: inválido por `type: array`;
- `image: "/abs.png"` e `image: "../x.png"`: inválidos por el patrón de ruta;
- `provenance` sin `provider` o sin `processingVersion`: inválido por `required`;
- `provenance` con `source` y con campos extra `crid`/`maturity`: válido
  (`additionalProperties: true`), sin exigir ya `source`;
- `range` con un solo valor, `legend` vacía o color no `#rrggbb`: inválidos;
- zona con `bbox` fuera de España: válida, confirmando que el contrato es global.

La automatización en CI pertenece a A04 (`frontend/scripts/validate-data.*` y
`.github/workflows/ci.yml`); WP-04 ampliará el esquema y añadirá casos de prueba semánticos.

## 7. Fuera de alcance de esta congelación

- Lógica de carga, caché o composables (WP-04).
- Generación de PNG, GeoTIFF, HDF5 o datos NISAR (WP-04 / pipeline científico).
- Componentes, estilos, mapa base y overlays Leaflet (WP-07).
- Elección de hosting, `base` de Vite y despliegue (Fase B).
- Científicos de referencia, misiones y productos reales: no se declaran sin evidencia.
