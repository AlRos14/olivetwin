# Contrato de manifiestos OliveTwin — v1.1.0

**Estado:** congelado en Fase A (nodo A02), fecha 2026-11-14.
**Ámbito:** estructura mínima que comparten el cargador de datos (WP-04) y la interfaz Vue + Leaflet (WP-07).
**Acuerdo completo:** [`docs/contract-freeze.md`](../docs/contract-freeze.md).

Este directorio no contiene lógica de carga, componentes ni datos científicos. Solo fija el
contrato mínimo para que ambos work packets avancen en paralelo sin romperse. WP-04 es el
propietario de `contracts/` y ampliará este esquema **de forma aditiva**.

## Archivos

| Archivo | Papel |
|---|---|
| `manifest.schema.json` | JSON Schema draft 2020-12 del manifiesto mínimo. `$id`: `urn:olivetwin:contract:manifest:1.1.0`. |
| `README.md` | Este documento: convenciones y validación local. |

Manifiestos vigilados por el contrato:

| Archivo | Modo | Zonas en Fase A |
|---|---|---|
| `frontend/public/data/sample/manifest.json` | `sample` | `[]` |
| `frontend/public/data/real/manifest.json` | `real` | `[]` |

La ausencia de zonas es intencionada: Fase A prepara contratos, no enseña capas. Un modo
`real` con `zones: []` seguirá siendo válido después.

## Estructura del manifiesto

```json
{
  "schemaVersion": "1.1.0",
  "datasetMode": "sample",
  "appTitle": "OliveTwin",
  "zones": []
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `schemaVersion` | string | SemVer dentro de la major 1: patrón `^1\.[0-9]+\.[0-9]+$`. Valor vigente `1.1.0`. Obligatorio. |
| `datasetMode` | string | Enum cerrado `sample` \| `real`. Obligatorio. |
| `appTitle` | string | No vacío, no solo espacios. Obligatorio. |
| `zones` | array | Obligatorio; puede ser `[]`, pero nunca `null`. |

Cada zona (`$defs.zone`) exige `id`, `name`, `bbox` y `layers[]`. Cada capa
(`$defs.layer`) exige `id` (`ndvi` \| `soil-moisture`), `title`, `kind`
(`image-overlay`), `image`, `bbox`, `imageCrs`, `unit`, `status`
(`synthetic` \| `processed_real`), `legend`, `provenance` y `qualityNote`.

`legend` y `provenance` son deliberadamente mínimos en v1.1.0: `legend` debe ser un objeto
no vacío y `provenance` debe contener al menos `source`. WP-04 concretará su estructura
interna de forma aditiva. Lo mismo aplica a los valores admitidos de `imageCrs` y a las
validaciones semánticas (por ejemplo `west < east`, unicidad de `id` o existencia del PNG),
que **no** forman parte de este esquema.

## Convenciones congeladas

### 1. Versión del contrato

- La versión vigente es **1.1.0** y se declara en `schemaVersion`.
- Un cambio **aditivo** (nueva propiedad opcional, nuevo `$def` reutilizable, aclaración de
  documentación) sube la minor: `1.2.0`, `1.3.0`…
- Un cambio **incompatible** (campo obligatorio nuevo, cambio de tipo, de semántica, del orden
  de `bbox` o de un enum consumido de forma exhaustiva) exige major: `2.0.0`.
- No se admite cambiar el orden de `bbox`, el significado de `datasetMode` ni los valores de
  `status` sin subir la major.

### 2. `bbox` = `[west, south, east, north]`

- Cuatro números en **grados decimales**, sistema **WGS84 / EPSG:4326**.
- Orden: `[oeste, sur, este, norte]`, es decir `[longitud mínima, latitud mínima, longitud máxima, latitud máxima]`.
- Leaflet recibe la caja como `[[south, west], [north, east]]`; la conversión es
  responsabilidad de WP-04/WP-07 y no altera el orden almacenado.
- El esquema comprueba el rango geográfico de cada componente; la comprobación de que la caja
  es válida (`west < east`, `south < north`) pertenece al validador semántico de WP-04.
- El `bbox` de una capa describe la georreferenciación de **su** PNG y puede ser igual o más
  ajustado que el de la zona.

### 3. Rutas de imágenes relativas a `public/`

El campo `image` es una ruta **relativa a `frontend/public/`**:

- sin `/` inicial: `data/sample/ndvi/jaen.png`, no `/data/sample/ndvi/jaen.png`;
- sin `..`, sin `:` (URLs absolutas o unidades de disco) y sin barras invertidas;
- el esquema rechaza esas formas; la UI **no** construye rutas por su cuenta.

La resolución debe respetar la `base` de Vite (GitHub Pages u otra subruta):

```ts
const layerUrl = `${import.meta.env.BASE_URL}${layer.image}`;
```

`import.meta.env.BASE_URL` ya termina en `/` según la configuración estándar de Vite.
WP-04 expone la ruta resuelta; WP-07 solo la consume.

### 4. Modos `sample` y `real`

- `sample` contiene material de ejemplo, explícitamente sintético.
- `real` contiene datos procesados reales. En Fase A está vacío, y eso es un estado válido.
- **No hay fallback silencioso**: si el modo elegido falla, falta o está vacío, la UI muestra
  el estado correspondiente (`empty` o `error`). Nunca se sustituyen mediciones reales por
  ejemplos sin avisar y sin una acción explícita de la persona usuaria.
- El modo activo es estado de ejecución (`DataMode`); no se persiste en el manifiesto como
  preferencia de usuario.

### 5. `status` de capa: `synthetic` vs `processed_real`

- `synthetic`: dato generado para desarrollo o demostración. Debe etiquetarse como sintético
  en la interfaz y **no** presentarse como observación de NASA.
- `processed_real`: dato derivado de una fuente real mediante el pipeline. Requiere
  aprobación científica y trazabilidad; no se declara sin evidencia.
- `provenance` complementa a `status` con el origen declarado (`source` como mínimo). No
  inventar misiones, productos, fechas ni URLs.

### 6. Estados de carga

Los valores de referencia son `loading`, `ready`, `empty` y `error`. Su implementación
(servicio/composable) pertenece a WP-04; la representación visual, a WP-07. No forman parte
del JSON del manifiesto.

## Tipos TypeScript de referencia

```ts
export type DataMode = 'sample' | 'real';
export type BaseMap = 'pnoa' | 'osm';
export type ManifestLoadStatus = 'loading' | 'ready' | 'empty' | 'error';
export type BBox = [west: number, south: number, east: number, north: number];
```

`frontend/src/types/manifest.ts` **no se crea en Fase A**. WP-04 lo materializará a partir de
[`docs/contract-freeze.md`](../docs/contract-freeze.md) y será su único propietario, para
evitar un segundo módulo competidor.

## Validación local

Sin instalar dependencias en el repositorio (la CI de A04 automatizará esta comprobación):

```bash
npx -y ajv-cli@5 validate --spec=draft2020 \
  -s contracts/manifest.schema.json \
  -d frontend/public/data/sample/manifest.json \
  -d frontend/public/data/real/manifest.json
```

Casos negativos mínimos que el contrato debe rechazar:

1. `datasetMode: "unknown"` → falla el `enum`.
2. `zones: null` → falla `type: array`.
3. manifiesto sin `schemaVersion` → falla `required`.

Un manifiesto con `zones: []` y modo `sample` o `real` debe aceptarse.

## Propiedad y cambios

| Ámbito | Owner |
|---|---|
| `contracts/`, `frontend/src/types`, servicios, composables, manifiestos y scripts de datos | WP-04 |
| `frontend/src/components`, estilos y mapa Leaflet | WP-07 |
| Owner humano de WP-04 y WP-07 | **pendiente de asignar** |

Toda ampliación del contrato requiere revisión de integración y actualización de
`docs/contract-freeze.md`. WP-07 no edita este directorio ni los manifiestos.
