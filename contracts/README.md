# Contrato de manifiestos OliveTwin — v1.3.0

**Estado:** congelado en Fase A (nodo A02), corregido en A02-fix para alinearse con el ejemplo §4.3 del plan v2. Ampliación aditiva C1 (v1.2.0) para la línea temporal, 2026-11-14. Ampliación aditiva v1.3.0 (cubo de análisis por zona), 2026-11-15.
**Ámbito:** estructura mínima que comparten el cargador de datos (WP-04) y la interfaz Vue + Leaflet (WP-07).
**Acuerdo completo:** [`docs/contract-freeze.md`](../docs/contract-freeze.md).

Este directorio no contiene lógica de carga, componentes ni datos científicos. Solo fija el
contrato mínimo para que ambos work packets avancen en paralelo sin romperse. WP-04 es el
propietario de `contracts/` y ampliará este esquema **de forma aditiva**.

## Archivos

| Archivo | Papel |
|---|---|
| `manifest.schema.json` | JSON Schema draft 2020-12 del manifiesto mínimo. `$id`: `urn:olivetwin:contract:manifest:1.3.0`. |
| `analysis.schema.json` | JSON Schema del cubo de análisis por zona (v1.3.0), enlazado desde `zone.analysis`. `$id`: `urn:olivetwin:contract:analysis:1.3.0`. |
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
  "schemaVersion": "1.2.0",
  "datasetMode": "sample",
  "appTitle": "OliveTwin",
  "zones": []
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `schemaVersion` | string | SemVer dentro de la major 1: patrón `^1\.[0-9]+\.[0-9]+$`. Se admiten `1.1.0` (sin serie) y `1.2.0`; con `timeSteps` es obligatorio `1.2.0`. |
| `datasetMode` | string | Enum cerrado `sample` \| `real`. Obligatorio. |
| `appTitle` | string | No vacío, no solo espacios. Obligatorio. |
| `zones` | array | Obligatorio; puede ser `[]`, pero nunca `null`. |

Cada zona (`$defs.zone`) exige `id`, `name`, `bbox` y `layers[]`, y admite
opcionalmente `description`. El `id` de zona es un slug kebab-case
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`). Cada capa (`$defs.layer`) exige `id`
(`ndvi` \| `soil-moisture`), `title`, `kind` (`image-overlay`), `image`, `bbox`,
`imageCrs` (`EPSG:3857`), `unit` no vacío, `status` (`synthetic` \|
`processed_real`), `legend`, `provenance` y `qualityNote`; admite opcionalmente
`variable`, `range` (`[min, max]` de números) y, desde v1.2.0, `timeSteps`
(lista de al menos un paso `{date, label?, image, bbox, provenance?}`).

`legend` es una **lista de al menos dos clases** con la forma
`{"value": number, "color": "#rrggbb", "label": string}`, tal como aparece en el
ejemplo §4.3 del plan v2. No es un objeto libre y debe estar ordenada por
`value` de forma creciente estricta (validación semántica).

`provenance` exige `provider`, `product` y `processingVersion`; admite
`acquisitionDate`, `sceneId`, `referenceUrl` y `note` como string o `null`.
Mantiene `additionalProperties: true` de forma deliberada para extensiones
aditivas del pipeline científico (por ejemplo CRID o madurez de NISAR SME2).
No existe el campo `source` de versiones anteriores del borrador.

`acquisitionDate` es una fecha ISO 8601 **real**, no solo una cadena con la forma
correcta: el esquema aplica los formatos `date` (`2026-10-19`) y `date-time`
(`2026-10-19T11:19:03Z`) de ajv-formats, que comprueban el calendario, y el
validador semántico vuelve a verificar los componentes. Se rechazan fechas
imposibles como `2026-13-45` o `2026-02-30`.

Las validaciones semánticas (`west < east`, `south < north`, `layer.bbox` dentro
de `zone.bbox` con tolerancia de 0.01°, `min < max` en `range`, orden de
`legend`, unicidad de `id` de zona y de capa por zona, prefijo
`data/<datasetMode>/` en `image`, fechas de adquisición reales, existencia del
PNG y canal alfa) **no** forman parte de este esquema y pertenecen a WP-04. Se
implementan en `frontend/scripts/validate-lib.mjs` y se ejecutan con
`npm run validate:data` (ver §Validación local). Con `timeSteps` se añaden:
fechas ISO reales en orden estrictamente creciente y sin duplicados, `bbox` de
cada paso dentro de `zone.bbox`, `layer.image`/`layer.bbox` iguales al último
paso, prefijo y PNG de cada paso, y procedencia efectiva completa por paso en
`processed_real`.

La coherencia entre `datasetMode` y `status` sí se expresa en el esquema mediante
`if/then`: `sample` solo admite capas `synthetic` y `real` solo `processed_real`.
Además, `processed_real` exige `provenance.acquisitionDate`, `sceneId` y
`referenceUrl` como cadenas no nulas.

## Cubo de análisis (v1.3.0)

Una zona puede declarar `"analysis": "data/<modo>/zones/<id>/analysis/analysis.json"`.
Ese archivo describe:

- `grid`: rejilla común EPSG:3857 (celdas de `cellSizeM` m Web Mercator, fila 0 = norte)
  con su extensión exacta en WGS84 (`bbox`), `width` y `height`.
- `variables[]`: cada una con `scale`/`offset` para decodificar sus PNG grises de 8 bits
  (valor = `offset` + `scale` · código; 255 = sin dato), `displayRange`, `palette`,
  `temporal`, `description`, `caveat`, `status`, `provenance` (con `license`) y `steps[]`
  (`date`, `data`, `stats` precalculadas y procedencia del paso).
- `zoneSeries[]` opcional: series de zona (p. ej. precipitación diaria).
- `unavailable[]` opcional: fuentes previstas que no se pudieron incorporar y por qué.
- `suitability` opcional y retirado (2026-11-15): índice exploratorio de aptitud relativa; el pipeline ya no lo genera y la interfaz no lo usa (se mantiene en el esquema por compatibilidad).
- `crops[]` opcional: aptitud por cultivo (ráster 0–1 global y por factor, requisitos con su
  fuente, supuestos y método).

Detalle y reglas: [`docs/contract-freeze.md`](../docs/contract-freeze.md) §2.5 y
[`docs/data-contract.md`](../docs/data-contract.md) §2.8.

## Convenciones congeladas

### 1. Versión del contrato

- La versión vigente es **1.2.0** (la 1.1.0 sigue admitida si no hay `timeSteps`) y se
  declara en `schemaVersion`.
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
- El esquema comprueba el rango geográfico global de cada componente (longitud ±180,
  latitud ±90); **no** limita las zonas a España. Es una decisión de producto: el mapa
  navegable sigue centrado en España, pero el contrato admite zonas fuera de ella para
  probar datos NISAR reales sin cambiar el esquema. Ver `docs/contract-freeze.md`.
- La comprobación de que la caja es válida (`west < east`, `south < north`) pertenece al
  validador semántico de WP-04.
- El `bbox` de una capa describe la georreferenciación de **su** PNG y puede ser igual o más
  ajustado que el de la zona.

### 3. Rutas de imágenes relativas a `public/`

El campo `image` es una ruta **relativa a `frontend/public/`**:

- sin `/` inicial: `data/sample/ndvi/jaen.png`, no `/data/sample/ndvi/jaen.png`;
- sin `..`, sin `:` (URLs absolutas o unidades de disco) y sin barras invertidas;
- **sin ningún `%`**: el navegador normaliza la codificación porcentual y
  `data/real/%2e%2e/%2e%2e/x.png` se resolvería como `../..`. Por eso el
  esquema, el validador y la resolución de URLs en runtime rechazan cualquier
  `%`, aunque la ruta no contenga `..` literal;
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
- `provenance` complementa a `status` con proveedor (`provider`), producto (`product`) y
  versión de procesamiento (`processingVersion`) obligatorios, más fecha, escena, URL de
  referencia y nota opcionales. No inventar misiones, productos, fechas ni URLs.

### 6. Estados de carga

Los valores de referencia son `loading`, `ready`, `empty` y `error`. Su implementación
(servicio/composable) pertenece a WP-04; la representación visual, a WP-07. No forman parte
del JSON del manifiesto.

## Tipos TypeScript de referencia

```ts
export type DataMode = 'sample' | 'real';
export type BaseMap = 'pnoa' | 'osm' | 'pnoa-sigpac';
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

Desde WP04-01, la comprobación completa (esquema + semántica + existencia y alfa
del PNG) se ejecuta con:

```bash
npm run validate:data --prefix frontend
```

Los casos negativos de `frontend/scripts/fixtures/invalid/` cubren, entre otros,
`datasetMode`/`status` incoherentes, `bbox` invertido, capa fuera de zona,
rutas `image` absolutas, con `..`, con `%` o con URL externa, `imageCrs` no
admitido, ids de zona duplicados, leyenda desordenada, `range` invertido y
fechas de adquisición imposibles.

Casos negativos mínimos que el contrato debe rechazar:

1. `datasetMode: "unknown"` → falla el `enum`.
2. `zones: null` → falla `type: array`.
3. manifiesto sin `schemaVersion` → falla `required`.
4. `legend` como objeto en vez de lista → falla `type: array`.
5. `image: "/abs.png"` → falla el patrón de ruta segura (sin `/` inicial).
6. `image: "../x.png"` → falla el patrón de ruta segura (sin `..`).
7. `image: "data/sample/%2e%2e/x.png"` → falla el patrón de ruta segura (sin `%`).
8. `provenance.acquisitionDate: "2026-13-45"` → falla el formato `date`/`date-time`
   y la comprobación semántica de calendario.
9. `timeSteps` desordenados, con fechas duplicadas, con un paso fuera de la zona,
   con `layer.image` distinto del último paso o declarados con `schemaVersion: "1.1.0"`
   → rechazados por la semántica o por el `if/then` del esquema.

Un manifiesto con `zones: []` y modo `sample` o `real` debe aceptarse. El
ejemplo completo §4.3 del plan v2 (zona con `description`, capa con `variable`,
`range` y `legend` como lista, `provenance` con `provider`/`product`/
`processingVersion`) debe validar sin cambios.

La comprobación de aceptación de A02-fix se ejecutó con `ajv@8.20.0` en modo
draft 2020-12 desde `frontend/`, con el script temporal fuera del repositorio:
18/18 comprobaciones correctas (válidos, negativos mínimos y extensiones
aditivas de `provenance`).

## Propiedad y cambios

| Ámbito | Owner |
|---|---|
| `contracts/`, `frontend/src/types`, servicios, composables, manifiestos y scripts de datos | WP-04 |
| `frontend/src/components`, estilos y mapa Leaflet | WP-07 |
| Owner humano de WP-04 y WP-07 | coordinado fuera del repositorio (decisión GA) |

Toda ampliación del contrato requiere revisión de integración y actualización de
`docs/contract-freeze.md`. WP-07 no edita este directorio ni los manifiestos.
