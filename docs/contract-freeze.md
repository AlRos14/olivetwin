# Congelación del contrato mínimo OliveTwin — v1.1.0

**Fecha del acuerdo:** 14 de noviembre de 2026 (Fase A, nodo A02; corregido en A02-fix).
**Estado:** congelado para el arranque de Fase B; alineado con el ejemplo §4.3 del plan v2.
**Repositorio:** <https://github.com/AlRos14/olivetwin> (privado, owner `AlRos14`).
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
| Rutas | `image` relativa a `public/`, sin `/` inicial y sin `..`; resolver con `import.meta.env.BASE_URL` | WP-04 carga, WP-07 no crea rutas |
| Procedencia | `synthetic` vs `processed_real`; no presentar datos inventados como NASA real | Aprobación científica cuando haya real |

Notas de aplicación:

- `schemaVersion` debe cumplir `^1\.[0-9]+\.[0-9]+$` y vale `1.1.0` en este baseline.
- `zones: []` es válido en ambos modos; en `real` expresa ausencia deliberada de mediciones,
  no un error que deba rellenarse con ejemplos.
- Las rutas `image` se resuelven como `${import.meta.env.BASE_URL}${image}`. WP-04 entrega la
  URL resuelta; WP-07 no compone rutas.
- `legend` es una **lista no vacía** de clases `{value: number, color: "#rrggbb", label:
  string}`, coherente con el ejemplo §4.3 del plan v2; no es un objeto libre.
- `provenance` exige `provider`, `product` y `processingVersion`. Admite
  `acquisitionDate` (fecha ISO 8601 o `null`), `sceneId`, `referenceUrl` y `note` (string o
  `null`). Se mantiene `additionalProperties: true` para extensiones aditivas del pipeline
  científico (por ejemplo CRID o madurez de NISAR SME2). El antiguo campo `source` se elimina.
- La semántica de los valores (rango de `bbox`, `min <= max` en `range`, unicidad de `id`,
  coherencia zona/capa, existencia del PNG, valores de `imageCrs`) corresponde al validador de
  WP-04, no al JSON Schema mínimo.

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
  -d frontend/public/data/sample/manifest.json \
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
