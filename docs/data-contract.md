# Contrato de datos OliveTwin v1.2.0 — referencia práctica

Este documento describe el contrato **tal como está implementado** en el
repositorio: el JSON Schema, el validador de datos, el cargador de manifiestos y
el composable de estado. No sustituye a los documentos de congelación, pero
evita tener que leer el código para saber qué se puede publicar y qué se rechaza.

| Documento | Papel |
|---|---|
| [`contracts/manifest.schema.json`](../contracts/manifest.schema.json) | Fuente de verdad estructural (JSON Schema draft 2020-12). |
| [`docs/contract-freeze.md`](contract-freeze.md) | Acuerdo de congelación y regla de cambios. |
| [`contracts/README.md`](../contracts/README.md) | Resumen del esquema y convenciones. |
| [`docs/c0-interfaces.md`](c0-interfaces.md) | Interfaces congeladas entre WP-04 y WP-07. |
| [`docs/handoff-science.md`](handoff-science.md) | Guía para publicar una zona real sin tocar Vue. |

Versión vigente: **1.2.0**. El valor se declara en `schemaVersion`; el
validador solo admite la major `1` y, en esta rama, las versiones exactas
`1.1.0` (manifiestos sin serie temporal) y `1.2.0` (con o sin `timeSteps`).
La v1.2.0 es **aditiva**: un manifiesto v1.1.0 sin `timeSteps` sigue siendo
válido y se muestra con su `layer.image`/`layer.bbox`.

## 1. Dónde vive cada cosa

```text
frontend/public/data/
├── sample/
│   ├── manifest.json                    # datasetMode: "sample"
│   └── zones/<zona>/
│       ├── ndvi.png
│       └── moisture.png
└── real/
    ├── manifest.json                    # datasetMode: "real"; hoy zones: []
    └── zones/<zona>/<capa>.png          # se añade cuando haya datos aprobados
```

- Todos los assets publicados son **PNG optimizados y JSON**. No se versionan
  HDF5, GeoTIFF, NetCDF ni otros binarios científicos (ver `.gitignore`).
- El manifiesto de cada modo es independiente y se carga en tiempo de ejecución.
  Cambiar de modo no recompila la aplicación.
- `frontend/public/data/sample/` solo contiene material sintético.
  `frontend/public/data/real/` solo contiene datos con aprobación científica.
- Las rutas `image` son **relativas a `frontend/public/`**, nunca al sistema de
  archivos ni al directorio de trabajo.

## 2. Estructura del manifiesto

### 2.1 Manifiesto

| Campo | Obligatorio | Tipo | Regla |
|---|---|---|---|
| `schemaVersion` | Sí | string | SemVer de la major 1. Valores admitidos: `"1.1.0"` o `"1.2.0"`; con `timeSteps` es obligatorio `"1.2.0"`. |
| `datasetMode` | Sí | string | Enum cerrado: `"sample"` \| `"real"`. |
| `appTitle` | Sí | string | No vacío ni solo espacios. |
| `zones` | Sí | array | Puede ser `[]`; **nunca** `null`. |

El objeto raíz es cerrado (`additionalProperties: false`): un campo desconocido
en el manifiesto se rechaza para detectar errores tipográficos. Lo mismo ocurre
con las zonas y las capas; la única excepción deliberada es `provenance` (§2.5).

### 2.2 Zona (`zones[]`)

| Campo | Obligatorio | Tipo | Regla |
|---|---|---|---|
| `id` | Sí | string | Kebab-case `^[a-z0-9]+(?:-[a-z0-9]+)*$`; único en el manifiesto. |
| `name` | Sí | string | No vacío ni solo espacios. |
| `description` | No | string | Si existe, no vacía. En una zona sintética debe aclarar que la ubicación es ilustrativa. |
| `bbox` | Sí | number[4] | `[west, south, east, north]` en WGS84; ver §3. |
| `layers` | Sí | array | Puede ser `[]`. Cada capa se describe en §2.3. |

**Una zona sin capas es válida.** No se rellena con datos de muestra ni con
valores inventados: la interfaz simplemente no tendrá capa que pintar.

### 2.3 Capa (`zones[].layers[]`)

| Campo | Obligatorio | Tipo | Regla |
|---|---|---|---|
| `id` | Sí | string | Enum cerrado: `"ndvi"` \| `"soil-moisture"`. Añadir otro id exige cambio de contrato. |
| `title` | Sí | string | No vacío ni solo espacios. |
| `kind` | Sí | string | Constante `"image-overlay"`; en v1.2.0 no hay otro tipo de capa. |
| `variable` | No | string | Etiqueta científica, por ejemplo `"NDVI"` o `"Humedad superficial"`. |
| `image` | Sí | string | Ruta relativa a `public/`, segura y bajo `data/<datasetMode>/`; ver §3.4. |
| `bbox` | Sí | number[4] | Cobertura del PNG; puede ser menor que `zone.bbox`. |
| `imageCrs` | Sí | string | Enum cerrado: `"EPSG:3857"`. |
| `unit` | Sí | string | No vacío ni solo espacios (`index`, `m³/m³`, `%`…). |
| `range` | No | number[2] | `[min, max]`, ambos números y `min < max` estricto. |
| `legend` | Sí | array | Al menos 2 paradas `{value, color, label}`; ver §2.4. |
| `status` | Sí | string | Enum cerrado: `"synthetic"` \| `"processed_real"`. |
| `provenance` | Sí | objeto | Trazabilidad; ver §2.5. |
| `qualityNote` | Sí | string | No vacío; limitaciones que la UI puede mostrar. |
| `timeSteps` | No | array | **v1.2.0**: serie temporal ordenada de al menos un paso; ver §2.7. |

### 2.4 Leyenda

`legend` es una **lista ordenada** de clases, no un objeto libre:

```json
[
  { "value": 0, "color": "#ffffd9", "label": "Más seco" },
  { "value": 0.3, "color": "#41b6c4", "label": "0.30 m³/m³" },
  { "value": 0.6, "color": "#081d58", "label": "Más húmedo" }
]
```

- `value`: número; puede ser negativo (por ejemplo NDVI).
- `color`: hexadecimal de seis dígitos `#rrggbb`; no se admiten nombres ni
  colores de tres dígitos.
- `label`: texto no vacío.
- Orden **creciente estricto** por `value`. El validador rechaza valores
  repetidos o desordenados.
- La leyenda permite interpretar el PNG; **no** permite recuperar el valor
  científico exacto de un píxel.

### 2.5 Procedencia (`provenance`)

| Campo | Obligatorio | Tipo | Regla |
|---|---|---|---|
| `provider` | Sí | string | Proveedor u origen del procesamiento. En sintéticos, un generador sintético; nunca una misión real. |
| `product` | Sí | string | Producto o descripción. En sintéticos debe quedar claro que no es satelital. |
| `processingVersion` | Sí | string | Versión del procesamiento o del generador (`sample-v1`, CRID, versión del pipeline…). |
| `acquisitionDate` | Condicional | string \| null | Fecha ISO 8601 (fecha o fecha-hora con zona). **Obligatoria y no nula si `status: processed_real`.** |
| `sceneId` | Condicional | string \| null | Identificador de escena o producto. **Obligatorio y no vacío si `processed_real`.** |
| `referenceUrl` | Condicional | string \| null | URL `http(s)://` verificable. **Obligatoria y no nula si `processed_real`.** |
| `note` | No | string \| null | Nota libre sobre procedencia o limitaciones. |

`provenance` mantiene `additionalProperties: true` de forma deliberada. Es la
única vía aditiva para metadatos del pipeline sin cambiar el contrato, por
ejemplo `crid`, `maturity` o `approvedBy`. No se inventan proveedores,
productos, fechas, escenas ni URLs.

### 2.6 Ejemplo mínimo válido (sintético)

Estructural y semánticamente válido; para publicarlo haría falta además el PNG
correspondiente en `frontend/public/data/sample/zones/zona-ejemplo/ndvi.png`.

```json
{
  "schemaVersion": "1.1.0",
  "datasetMode": "sample",
  "appTitle": "OliveTwin",
  "zones": [
    {
      "id": "zona-ejemplo",
      "name": "Zona de ejemplo",
      "description": "Ubicación ilustrativa; no es una parcela real.",
      "bbox": [-4.0, 37.5, -3.9, 37.6],
      "layers": [
        {
          "id": "ndvi",
          "title": "Vegetación (NDVI)",
          "kind": "image-overlay",
          "variable": "NDVI",
          "image": "data/sample/zones/zona-ejemplo/ndvi.png",
          "bbox": [-4.0, 37.5, -3.9, 37.6],
          "imageCrs": "EPSG:3857",
          "unit": "index",
          "range": [0, 1],
          "legend": [
            { "value": 0, "color": "#dfc27d", "label": "Bajo" },
            { "value": 1, "color": "#01665e", "label": "Alto" }
          ],
          "status": "synthetic",
          "provenance": {
            "provider": "Generador sintético OliveTwin",
            "product": "NDVI ilustrativo — no satelital",
            "acquisitionDate": null,
            "sceneId": null,
            "processingVersion": "sample-v1",
            "referenceUrl": null,
            "note": "Datos inventados para probar la interfaz"
          },
          "qualityNote": "NO apto para decisiones agronómicas"
        }
      ]
    }
  ]
}
```

### 2.7 Línea temporal (`timeSteps`, v1.2.0)

Una capa puede declarar **varias fechas** en `timeSteps`. La ampliación es
opcional y aditiva; el resto de reglas de la capa no cambia. La unidad,
`range`, `legend` y `status` son **comunes a todos los pasos**: la escala debe
ser fija en el tiempo para que las fechas se puedan comparar.

```json
{
  "schemaVersion": "1.2.0",
  "datasetMode": "sample",
  "appTitle": "OliveTwin",
  "zones": [
    {
      "id": "jaen-demo",
      "name": "Jaén — demostración temporal",
      "bbox": [-3.86, 37.69, -3.61, 37.9],
      "layers": [
        {
          "id": "ndvi",
          "title": "Vegetación (NDVI)",
          "kind": "image-overlay",
          "image": "data/sample/zones/jaen-demo/ndvi-2026-11-01.png",
          "bbox": [-3.86, 37.69, -3.61, 37.9],
          "imageCrs": "EPSG:3857",
          "unit": "index",
          "range": [-1, 1],
          "legend": [
            { "value": -1, "color": "#8c510a", "label": "Bajo" },
            { "value": 0, "color": "#dfc27d", "label": "Intermedio" },
            { "value": 1, "color": "#01665e", "label": "Alto" }
          ],
          "status": "synthetic",
          "provenance": {
            "provider": "Generador sintético",
            "product": "NDVI ilustrativo — no satelital",
            "processingVersion": "sample-v1"
          },
          "qualityNote": "NO apto para decisiones agronómicas",
          "timeSteps": [
            {
              "date": "2026-09-01",
              "label": "1 sep",
              "image": "data/sample/zones/jaen-demo/ndvi-2026-09-01.png",
              "bbox": [-3.86, 37.69, -3.61, 37.9]
            },
            {
              "date": "2026-10-01",
              "label": "1 oct",
              "image": "data/sample/zones/jaen-demo/ndvi-2026-10-01.png",
              "bbox": [-3.86, 37.69, -3.61, 37.9],
              "provenance": { "note": "Paso intermedio sintético" }
            },
            {
              "date": "2026-11-01",
              "label": "1 nov",
              "image": "data/sample/zones/jaen-demo/ndvi-2026-11-01.png",
              "bbox": [-3.86, 37.69, -3.61, 37.9]
            }
          ]
        }
      ]
    }
  ]
}
```

Reglas obligatorias:

| Regla | Detalle |
|---|---|
| `schemaVersion` | `"1.2.0"` si se usa `timeSteps`; sin serie temporal se admiten `"1.1.0"` y `"1.2.0"`. |
| Tamaño | `timeSteps` tiene al menos un paso. |
| `date` | ISO 8601 real: fecha (`2026-10-19`) o fecha-hora con zona (`2026-10-19T11:19:03Z`). |
| Orden | Estrictamente creciente por `date`, sin duplicados. |
| `image` del paso | Mismas reglas seguras que `layer.image` y prefijo `data/<datasetMode>/`; PNG existente con alfa en `validate:data`. |
| `bbox` del paso | `[west, south, east, north]`, válido y dentro de `zone.bbox` con tolerancia 0.01°. |
| Último paso | `layer.image` y `layer.bbox` deben ser **exactamente** los del último paso. Así un consumidor v1.1 sigue mostrando la fecha más reciente. |
| `provenance` del paso | Parcial; la procedencia efectiva es `{ ...layer.provenance, ...step.provenance }`. |
| `processed_real` | La procedencia efectiva de **cada** paso debe tener `acquisitionDate`, `sceneId` y `referenceUrl` como cadenas no vacías (no `null`). |

En runtime, `useOliveTwinData` selecciona por defecto el último paso al elegir
la capa. `selectTimeStep(index)` cambia el paso activo y `ActiveOverlay` expone
`url`/`bbox` del paso junto con `timeIndex` y `timeStep`. Cambiar de modo, zona
o capa reinicia el índice; un índice fuera de rango se ignora.

## 3. Convenciones geoespaciales y de assets

### 3.1 `bbox` = `[west, south, east, north]`

- Cuatro números en grados decimales, **WGS84 / EPSG:4326**.
- Orden: `[longitud mínima, latitud mínima, longitud máxima, latitud máxima]`.
- El esquema comprueba el rango global: longitud ±180°, latitud ±90°. **No**
  limita las zonas a España; el mapa navegable sí está centrado en España.
- `west < east` y `south < north` son validación semántica (no del esquema).
- Leaflet recibe la caja transformada:
  `[[south, west], [north, east]]`. Los componentes no reordenan el JSON.
- `zone.bbox` delimita el área de estudio; `layer.bbox` delimita la cobertura
  real del PNG y puede ser igual o más pequeña. El validador exige que
  `layer.bbox` quede dentro de `zone.bbox` con tolerancia de **0.01°**.

### 3.2 PNG de overlay

Cada `image` debe ser un PNG:

- preparado en **EPSG:3857 (Web Mercator)**;
- **norte arriba**;
- con la extensión exacta de `layer.bbox` (el PNG no transporta coordenadas:
  la posición la da el JSON);
- con canal alfa: RGBA (`color type 6`), gris+alfa (`4`) o paleta con `tRNS`;
- con **alpha 0** en los píxeles sin dato. No se representa «sin dato» como
  humedad 0 ni como un color opaco; los píxeles transparentes deben llevar
  también RGB a 0 para evitar halos;
- con tamaño razonable (objetivo orientativo: menos de 1 MB por PNG). Si el
  raster es enorme, se recorta, se optimiza o se prepara una teselación en una
  fase posterior; cada capa admite una imagen, o una por paso temporal si usa
  `timeSteps`.

La reproyección debe documentarse. Para valores discretos o para no inventar
valores intermedios se usa vecino más próximo; un remuestreo bilineal suaviza y
puede fabricar valores que no existían en el dato original.

Con `timeSteps`, **cada paso** aporta su propio PNG y su `bbox`; se aplican las
mismas reglas de CRS, orientación, transparencia y ruta segura. El último PNG
es el que debe coincidir con `layer.image`.

Un PNG es una **representación visual**: no expone valores científicos
consultables. La consulta por píxel requeriría un `values`/grid numérico con
contrato propio (P1, fuera de v1.2.0).

### 3.3 `imageCrs`

En v1.2.0 el único valor admitido es `"EPSG:3857"`. Un PNG en EPSG:4326 u otro
CRS se rechaza aunque se vea «casi bien» al superponerlo.

### 3.4 Rutas de imagen

El campo `image`:

- es relativo a `frontend/public/`;
- **no** empieza por `/`;
- **no** contiene `..`, `:` (URLs absolutas o unidades de disco) ni `\`;
- en la validación de publicación, debe empezar por `data/sample/` o
  `data/real/` según `datasetMode`.

Ejemplos válidos:

```text
data/sample/zones/jaen-demo/ndvi.png
data/real/zones/mi-zona/soil-moisture.png
```

La aplicación resuelve la URL con la base de Vite:

```ts
const url = `${import.meta.env.BASE_URL}${layer.image}`
```

`BASE_URL` termina en `/` y permite desplegar en la raíz o en una subruta (por
ejemplo `/olivetwin/`). **El equipo científico no construye URLs**: escribe la
ruta del contrato y el cargador la resuelve. Los componentes Vue tampoco
componen rutas; reciben `ActiveOverlay.url` ya resuelta.

## 4. Modo de datos y estado de capa

### 4.1 Coherencia obligatoria

| `datasetMode` | `status` admitido en todas las capas |
|---|---|
| `sample` | `synthetic` |
| `real` | `processed_real` |

La regla se aplica dos veces:

1. en el **esquema**, mediante `if/then`;
2. en el **validador semántico** y en el **cargador de runtime**, que producen
   un error específico y legible (`mode-mismatch` / `status-mismatch`).

No se mezclan capas de ambos modos aunque el `id` de zona o de capa coincida.

### 4.2 `processed_real` no es una etiqueta cosmética

Para declarar `status: "processed_real"` se exige:

- `provenance.acquisitionDate`: cadena ISO 8601 no vacía (no `null`);
- `provenance.sceneId`: cadena no vacía (no `null`);
- `provenance.referenceUrl`: URL verificable (no `null`);
- aprobación científica humana registrada fuera del JSON y, preferiblemente,
  también en `provenance.approvedBy`;
- que el PNG y el `bbox` correspondan al producto descrito.

Cambiar un texto, un nombre de archivo o el `status` no convierte un dato
sintético en real. Un agente no puede aprobar su propio trabajo científico.

### 4.3 `zones: []` es un estado válido

- `real/manifest.json` con `zones: []` es **vacío**, no un error.
- El modo `real` no recurre a `sample` si no hay datos, si el manifiesto da 404
  o si el JSON es inválido. Tampoco se reutilizan PNG del modo anterior.

### 4.4 Estados de carga en runtime

| Estado | Significado | Qué hace la UI |
|---|---|---|
| `loading` | Manifest solicitado; se limpian zonas, selección y overlays previos. | Indicador de carga. |
| `ready` | Manifiesto válido con al menos una zona. | Zonas disponibles; el usuario elige. |
| `empty` | Manifiesto válido con `zones: []`. | «Todavía no hay zonas con datos científicos reales» en modo real. |
| `error` | 404, fallo de red, JSON roto, esquema inválido, incoherencia de modo/estado o ruta insegura. | Mensaje de error y opción de reintentar; **sin fallback** a muestra. |

Reglas del cargador y del composable (`loadManifest`, `useOliveTwinData`):

- `loadManifest` descarga `${BASE_URL}data/<mode>/manifest.json` con
  `cache: 'no-cache'`.
- Antes de Ajv comprueba `datasetMode` y la coherencia de `status` para dar un
  mensaje específico; después valida el esquema completo.
- `assertManifestCoherence` vuelve a comprobar modo, estado y rutas seguras.
- Cada `setDataMode` o `reload` incrementa un contador y aborta la petición
  anterior (`AbortController`). Una respuesta tardía **no** sobrescribe el modo
  actual.
- Al cambiar de modo se vacían `zones`, `selectedZoneId` y `selectedLayerId`.
- Al seleccionar una zona se elige su primera capa, o `null` si no tiene.
- Al seleccionar una capa (o una zona con capa), `selectedTimeIndex` apunta al
  **último** paso si la capa tiene `timeSteps`; si no, es `null`.
- `selectTimeStep(index)` solo acepta un entero dentro de `0..timeSteps.length-1`;
  fuera de rango o sin serie temporal se ignora. Cambiar de modo, zona o capa
  reinicia el índice.
- `selectZone`/`selectLayer` ignoran ids que no existan en el manifiesto
  activo.
- `overlay` es `null` si no hay zona y capa válidas. Si hay selección, la URL se
  resuelve con `BASE_URL` y se entrega como `ActiveOverlay`; con `timeSteps`, la
  URL, el `bbox`, `timeIndex` y `timeStep` salen del paso activo.
- Opacidad inicial `0.7`, recortada siempre a `[0, 1]`; overlay visible por
  defecto.
- No hay persistencia del modo ni de la selección entre recargas.

El navegador **no** comprueba la existencia ni el canal alfa del PNG (tendría
que descargarlo y decodificarlo). Esas comprobaciones se hacen antes de publicar
con `npm run validate:data --prefix frontend`; si un PNG falta en producción, la
UI muestra el error de imagen sin romper el mapa base.

## 5. Validación implementada

La validación se reparte en tres capas. La lógica compartida vive en
[`frontend/scripts/validate-lib.mjs`](../frontend/scripts/validate-lib.mjs).

### 5.1 Esquema JSON

Comprueba estructura, tipos, enums, patrones, campos obligatorios, cierre de
objetos, rango global de `bbox`, tamaño de `range`, forma de `legend`, patrón
seguro de `image` y coherencia `datasetMode`/`status`.

### 5.2 Reglas semánticas (no expresables en el esquema)

| Regla | Detalle |
|---|---|
| `schemaVersion` | Debe cumplir `^1\.[0-9]+\.[0-9]+$`. |
| Modo esperado | El manifiesto publicado debe declarar el modo de su carpeta (`sample` o `real`). |
| `bbox` de zona y capa | `west < east` y `south < north`. |
| Capa dentro de zona | `layer.bbox` dentro de `zone.bbox` con tolerancia `0.01°`. |
| `range` | `min < max` estricto. |
| `legend` | Orden creciente estricto por `value`. |
| Ids | Zona única en el manifiesto; capa única dentro de su zona. |
| `id` de zona | Kebab-case. |
| Prefijo de `image` | `data/<datasetMode>/` (publicación). |
| Coherencia de estado | `sample` ⇒ `synthetic`; `real` ⇒ `processed_real`. |
| `processed_real` | `acquisitionDate`, `sceneId` y `referenceUrl` como cadenas no vacías. |
| Versión y `timeSteps` | `timeSteps` exige `schemaVersion: "1.2.0"`; sin serie se admiten `"1.1.0"` y `"1.2.0"`. |
| Fechas de pasos | ISO 8601 reales, en orden estrictamente creciente y sin duplicados. |
| `bbox` de pasos | Cada paso dentro de `zone.bbox` con tolerancia `0.01°`. |
| Último paso | `layer.image` y `layer.bbox` idénticos a los del último `timeStep`. |
| Procedencia de pasos | En `processed_real`, la procedencia efectiva de cada paso incluye `acquisitionDate`, `sceneId` y `referenceUrl`. |

### 5.3 Assets

Para cada `image` de los manifiestos publicados —incluidos **todos** los
`timeSteps[].image`— se comprueba que:

- el archivo existe bajo `frontend/public/`;
- la firma PNG es correcta;
- el PNG tiene canal alfa (`color type` 4 o 6, o `tRNS`);
- las dimensiones declaradas son válidas.

El runtime no descarga ni decodifica el PNG para comprobar alfa, pero sí rechaza
rutas inseguras de capa y de paso antes de pintar.

Los fixtures contractuales de `frontend/scripts/fixtures/` se validan sin
comprobar assets, porque no se sirven desde `public/`.

### 5.4 Comando de validación

Desde la raíz del repositorio:

```bash
npm run validate:data --prefix frontend
```

El comando:

1. compila el esquema con Ajv (draft 2020-12);
2. valida `public/data/sample/manifest.json` y `public/data/real/manifest.json`
   contra esquema + semántica + assets, exigiendo que el modo coincida con la
   carpeta;
3. exige que todos los fixtures de `fixtures/valid/` pasen;
4. exige que todos los fixtures de `fixtures/invalid/` fallen.

Sale con código 1 si algo falla. En el estado actual de la rama se ejecutan 35
comprobaciones (manifiestos + fixtures).

### 5.5 Validación en runtime frente a validación de publicación

El servicio de runtime repite las comprobaciones críticas para no depender del
build: coherencia de `datasetMode`, coherencia de `status` y rutas seguras. La
comprobación del prefijo `data/<mode>/`, la existencia del PNG y el canal alfa se
ejecutan en `validate:data` antes de publicar. Por eso **la validación local es
obligatoria**: un manifiesto editado a mano que evite la CLI puede apuntar a un
asset del otro modo aunque el navegador lo acepte.

## 6. Regenerar y validar los datos de muestra

Los cuatro PNG sintéticos y `sample/manifest.json` son reproducibles byte a
byte. El generador está en
[`scripts/generate-sample-data.mjs`](../scripts/generate-sample-data.mjs).

```bash
npm ci --prefix frontend
npm run generate:sample --prefix frontend
```

- Genera Jaén (`jaen-demo`) y Toledo (`toledo-demo`), cada una con `ndvi.png` y
  `moisture.png` (RGBA, 384 px de ancho, cuadrícula equiespaciada en Mercator,
  norte arriba, con máscaras de no-data).
- Reescribe `sample/manifest.json` de forma determinista.
- **No sobrescribe** `real/manifest.json` si ya existe; solo crea el manifiesto
  real vacío cuando falta.
- No descarga datos ni usa red. No declara fechas de adquisición ni escenas.
- Los PNG resultantes pesan unos cientos de KB cada uno.

Después, las comprobaciones completas:

```bash
npm run validate:data --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
```

`npm test` ejecuta la suite de Vitest (contrato, servicios, composable y
componentes). `npm run build` ejecuta `vue-tsc -b` y genera `frontend/dist/`.

## 7. Política de cambios del contrato

| Tipo de cambio | Versión | Ejemplos |
|---|---|---|
| **Aditivo** | Minor: `1.2.0`, `1.3.0`… | Nueva propiedad **opcional** en el esquema (así se añadió `layer.timeSteps` en v1.2.0), nuevo `$def` reutilizable, nueva documentación o aclaración. |
| **Incompatible** | Major: `2.0.0` | Campo obligatorio nuevo, cambio de tipo o semántica, eliminación o renombrado, cambio del orden de `bbox`, ampliación de un enum que los consumidores tratan de forma exhaustiva. |

Reglas concretas:

- Cambiar el orden de `bbox` o el significado de `sample`/`real` es **siempre**
  major.
- Añadir un `id` de capa nuevo (`ndvi`, `soil-moisture` son un enum cerrado) es
  **major**.
- Añadir un campo opcional a `provenance` **no** requiere cambiar el esquema:
  `provenance` ya admite propiedades adicionales. Basta documentarlo.
- Añadir una propiedad opcional a manifiesto, zona o capa requiere actualizar el
  JSON Schema y subir la minor.
- Todo cambio de contrato se abre como incidencia, se revisa por integración y
  actualiza `docs/contract-freeze.md` y este documento en el mismo cambio.
- WP-04 no cambia el contrato unilateralmente; WP-07 no lo reescribe ni edita
  los tipos.

## 8. Diagnóstico rápido

| Síntoma | Causa probable | Solución |
|---|---|---|
| `image debe estar bajo "data/real/"` | Ruta de una capa real apunta a `sample/` o a otra carpeta. | Mover el PNG y corregir `image`. |
| `layer.bbox queda fuera de zone.bbox` | La cobertura del raster excede la zona (más de 0.01°). | Ampliar `zone.bbox` o recortar el raster. |
| `processed_real exige provenance.sceneId` | Falta la escena, la fecha o la URL, o están a `null`. | Completar la procedencia verificable (también en la procedencia efectiva de cada paso temporal). |
| `timeSteps debe estar en orden estrictamente creciente` | Dos pasos desordenados o con la misma `date`. | Reordenar y eliminar duplicados; cada paso debe tener una fecha distinta. |
| `layer.image debe coincidir con el image del último timeStep` | La capa muestra una fecha antigua mientras `timeSteps` termina en otra. | Igualar `layer.image`/`layer.bbox` al último paso. |
| `layer.timeSteps exige schemaVersion "1.2.0"` | Series temporales declaradas como `1.1.0`. | Cambiar `schemaVersion` a `"1.2.0"`. |
| `el PNG ... no tiene canal alfa` | El PNG se exportó RGB opaco. | Reexportar RGBA con alpha 0 en no-data. |
| `must NOT have fewer than 2 items` en `legend` | Leyenda con una sola parada. | Añadir al menos dos clases ordenadas. |
| `datasetMode="sample" exige status="synthetic"` | Capa real dentro del manifiesto de muestra. | Separar los manifiestos; no mezclar modos. |
| La app muestra «Todavía no hay zonas…» | `real/manifest.json` tiene `zones: []`. | Es el estado esperado mientras no haya datos aprobados. |
| La app muestra error y no vuelve a muestra | JSON inválido, 404 o incoherencia de modo. | Corregir el manifiesto; no se hace fallback por diseño. |

## 9. Verificación de esta referencia

Los comandos de §6 se ejecutaron en la rama de documentación el 2026-11-14:

| Comando | Resultado |
|---|---|
| `npm ci --prefix frontend` | Instalación correcta (con avisos `EBADENGINE` de dependencias, sin error). |
| `npm run generate:sample --prefix frontend` | 4 PNG y `sample/manifest.json` regenerados; `real/manifest.json` sin cambios. |
| `npm run validate:data --prefix frontend` | `OK — 35 comprobaciones superadas (0 fallos)` (incluye los fixtures de `timeSteps`). |
| `npm test --prefix frontend` | 18 archivos y 244 tests superados. |
| `npm run build --prefix frontend` | `vue-tsc -b` + `vite build` correctos; `dist/` generado. |

La guía para publicar datos reales está en
[`docs/handoff-science.md`](handoff-science.md).
