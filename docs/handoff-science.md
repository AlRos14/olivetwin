# Handoff científico: añadir una zona real sin tocar Vue

Esta guía explica cómo el equipo científico incorpora una zona con datos
**reales** a OliveTwin. El objetivo es que añadir un PNG y metadatos sea
suficiente: **no se modifican componentes Vue, tipos, servicios ni el cargador**.

La aplicación publica **solo datos reales** (decisión de producto del
2026-11-14): `frontend/public/data/real/manifest.json` declara Jaén y Toledo con
tres fechas cada una, y no existe selector de modo ni datos de muestra en la
demo. El contrato conserva `datasetMode: "sample"` para fixtures y pruebas, pero
la aplicación no lo carga.

Una capa real aparece en la demo únicamente si cumple el contrato v1.2.0 y ha
pasado la validación y la revisión científica. Los manifiestos v1.1.0 sin serie
temporal siguen siendo válidos; para publicar varias fechas se usa `timeSteps` y
`schemaVersion: "1.2.0"` (§3.1).

## 0. Límites científicos que no se pueden cruzar

- **El radar no mide producción directamente.** NISAR aporta observaciones
  (por ejemplo humedad superficial estimada) que requieren interpretación y
  validación; no demuestran por sí mismas una causa agronómica ni kg/ha.
- **NDVI es un índice óptico, no un producto NISAR.** Puede venir de Landsat o
  Sentinel-2. No se etiqueta como radar ni como NISAR.
- **La humedad superficial SME2 no es riego.** Estima humedad en la capa
  superficial del suelo; no equivale a humedad profunda ni a una dosis de riego,
  y su resolución limita el uso a parcelas suficientemente grandes.
- **El PNG es una representación visual.** Sus colores no permiten recuperar
  valores científicos exactos ni hacer consultas por píxel.
- **Los datos sintéticos no son observaciones de NASA.** No se les asigna una
  fecha, escena o misión inventadas.

## 1. Requisitos del entregable científico

Antes de tocar el repositorio, el equipo científico debe tener:

1. Una fuente autorizada y verificable (producto, escena, fecha, versión de
   procesamiento y URL de referencia).
2. Geometría revisada: CRS, extensión, orientación y píxeles sin dato.
3. Unidades y escala comprobadas contra la documentación del producto.
4. Una nota de calidad que explique limitaciones y madurez.
5. Una persona revisora que apruebe el resultado. **La aprobación es humana**;
   un agente no puede aprobar su propio trabajo científico.

## 2. Paso 1 — exportar el PNG

| Requisito | Detalle |
|---|---|
| Formato | PNG con canal alfa: RGBA, gris+alfa o paleta con `tRNS`. |
| CRS de presentación | **EPSG:3857 (Web Mercator)**. Es el único admitido en v1.2.0. |
| Orientación | **Norte arriba**: la primera fila de píxeles es el borde norte. |
| Extensión | Exactamente la de `layer.bbox`. El PNG no guarda coordenadas; la posición la aporta el JSON. |
| Píxeles sin dato | **Alpha 0**, con RGB a 0. No se pinta «sin dato» como valor 0 opaco. |
| Reproyección | Documentar el método. Para valores discretos o para no inventar valores, vecino más próximo. |
| Tamaño | Optimizado; objetivo orientativo < 1 MB por PNG. |
| Paleta | La leyenda del manifiesto debe reproducir la paleta real del PNG. |
| Nada de capturas | No se acepta una imagen de pantalla recortada sin georreferencia. |

El `bbox` de la capa se calcula a partir de las **esquinas exactas del raster en
EPSG:3857**, reproyectadas a WGS84. No se estima «a ojo» mirando el mapa.

Orden del `bbox` en el JSON: `[west, south, east, north]`, grados WGS84. Leaflet
lo recibe como `[[south, west], [north, east]]`, pero **el JSON no se reordena**.

Si el PNG cubre menos que el área de estudio, `layer.bbox` puede ser menor que
`zone.bbox`; debe quedar dentro con una tolerancia máxima de `0.01°`.

## 3. Paso 2 — completar los metadatos

El manifiesto real completo tiene esta forma. Es una **plantilla**: los valores
entre `<...>` deben sustituirse por datos verificables. Mientras se dejen los
marcadores, `validate:data` rechazará el manifiesto, y eso es intencionado.

```json
{
  "schemaVersion": "1.1.0",
  "datasetMode": "real",
  "appTitle": "OliveTwin",
  "zones": [
    {
      "id": "nombre-de-la-zona",
      "name": "Nombre legible de la zona",
      "description": "Qué zona es, con qué criterio se delimitó y qué no debe inferirse de la capa.",
      "bbox": [-4.00, 37.50, -3.90, 37.60],
      "layers": [
        {
          "id": "soil-moisture",
          "title": "Humedad superficial (NISAR SME2)",
          "kind": "image-overlay",
          "variable": "soil_moisture",
          "image": "data/real/zones/nombre-de-la-zona/soil-moisture.png",
          "bbox": [-3.99, 37.51, -3.91, 37.59],
          "imageCrs": "EPSG:3857",
          "unit": "m³/m³",
          "range": [0, 0.6],
          "legend": [
            { "value": 0, "color": "#ffffd9", "label": "Más seco" },
            { "value": 0.15, "color": "#c7e9b4", "label": "0.15 m³/m³" },
            { "value": 0.3, "color": "#41b6c4", "label": "0.30 m³/m³" },
            { "value": 0.45, "color": "#225ea8", "label": "0.45 m³/m³" },
            { "value": 0.6, "color": "#081d58", "label": "Más húmedo" }
          ],
          "status": "processed_real",
          "provenance": {
            "provider": "<proveedor real del producto>",
            "product": "<producto, versión y variable>",
            "acquisitionDate": "<AAAA-MM-DD o fecha-hora ISO 8601 con zona>",
            "sceneId": "<identificador de escena o producto>",
            "processingVersion": "<versión del procesamiento o CRID>",
            "referenceUrl": "<https://... verificable>",
            "note": "Recorte del AOI, reproyección, escala y cualquier limitación relevante.",
            "maturity": "<PROVISIONAL | VALIDATED | BETA, si aplica>",
            "approvedBy": "<nombre de quien aprobó y fecha>"
          },
          "qualityNote": "Limitaciones de calidad y madurez; qué no debe concluirse de esta capa."
        }
      ]
    }
  ]
}
```

Notas de cumplimentación:

- `id` de zona: kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) y único.
- `id` de capa: solo `"ndvi"` o `"soil-moisture"` en v1.2.0. No se inventan
  identificadores nuevos.
- `image`: relativa a `frontend/public/`, bajo `data/real/`, sin `/` inicial,
  sin `..`, sin `:` ni `\`.
- `range` y `legend` deben ser coherentes con la escala del PNG. La leyenda se
  ordena por `value` de forma creciente estricta y tiene al menos dos paradas.
- `status`: `"processed_real"` únicamente tras la aprobación científica.
- `provenance.acquisitionDate`, `sceneId` y `referenceUrl` son **obligatorios y
  no nulos** para `processed_real`.
- `provider`, `product`, `processingVersion` no pueden ir vacíos.
- `maturity`, `crid` y `approvedBy` son extensiones admitidas dentro de
  `provenance`; no se añaden propiedades nuevas fuera de `provenance` sin
  cambiar el contrato.
- No se copian fechas, escenas ni URLs de la documentación o de otro producto:
  cada capa declara su propia procedencia.

El fixture
[`frontend/scripts/fixtures/valid/real-with-processed-real.json`](../frontend/scripts/fixtures/valid/real-with-processed-real.json)
es un ejemplo **contractual** que valida el estado `processed_real`, pero no es
una observación científica y **no se copia a `public/data/real/`**.

### 3.1 Varias fechas: `timeSteps` (v1.2.0)

Si el producto tiene una serie temporal, declara **todos** los pasos en
`layer.timeSteps`, en orden de más antiguo a más reciente. La unidad, `range`,
`legend` y `status` son comunes a todos los pasos: no cambies la escala entre
fechas o las comparaciones visuales serán engañosas.

Requisitos:

- `schemaVersion: "1.2.0"` en el manifiesto.
- Cada paso tiene `date` ISO 8601 real (fecha o fecha-hora con zona), `image`,
  `bbox` y, opcionalmente, `label` y `provenance` parcial.
- Fechas **estrictamente crecientes**, sin duplicados.
- Cada `image` de paso es un PNG RGBA en EPSG:3857 bajo `data/real/` y su
  `bbox` cae dentro de `zone.bbox`.
- `layer.image` y `layer.bbox` deben ser los del **último** paso.
- En `processed_real`, la procedencia efectiva
  `{ ...layer.provenance, ...step.provenance }` de cada paso debe incluir
  `acquisitionDate`, `sceneId` y `referenceUrl`. Si un paso no tiene escena o
  URL verificable, no se publica como `processed_real`.

```json
{
  "schemaVersion": "1.2.0",
  "datasetMode": "real",
  "appTitle": "OliveTwin",
  "zones": [
    {
      "id": "nombre-de-la-zona",
      "name": "Nombre legible de la zona",
      "bbox": [-4.0, 37.5, -3.9, 37.6],
      "layers": [
        {
          "id": "soil-moisture",
          "title": "Humedad superficial (NISAR SME2)",
          "kind": "image-overlay",
          "image": "data/real/zones/nombre-de-la-zona/soil-moisture-2026-03-15.png",
          "bbox": [-4.0, 37.5, -3.9, 37.6],
          "imageCrs": "EPSG:3857",
          "unit": "m³/m³",
          "range": [0, 0.6],
          "legend": [
            { "value": 0, "color": "#ffffd9", "label": "Más seco" },
            { "value": 0.3, "color": "#41b6c4", "label": "0.30 m³/m³" },
            { "value": 0.6, "color": "#081d58", "label": "Más húmedo" }
          ],
          "status": "processed_real",
          "provenance": {
            "provider": "<proveedor real del producto>",
            "product": "<producto, versión y variable>",
            "acquisitionDate": "2026-03-15",
            "sceneId": "<identificador del último paso>",
            "processingVersion": "<versión del procesamiento o CRID>",
            "referenceUrl": "<https://... verificable>",
            "note": "Escala fija común a todos los pasos de la serie.",
            "approvedBy": "<nombre de quien aprobó y fecha>"
          },
          "qualityNote": "Limitaciones de calidad y madurez de la serie.",
          "timeSteps": [
            {
              "date": "2026-01-15",
              "label": "15 ene",
              "image": "data/real/zones/nombre-de-la-zona/soil-moisture-2026-01-15.png",
              "bbox": [-4.0, 37.5, -3.9, 37.6],
              "provenance": {
                "acquisitionDate": "2026-01-15",
                "sceneId": "<escena del 15 ene>"
              }
            },
            {
              "date": "2026-02-15",
              "label": "15 feb",
              "image": "data/real/zones/nombre-de-la-zona/soil-moisture-2026-02-15.png",
              "bbox": [-4.0, 37.5, -3.9, 37.6],
              "provenance": {
                "acquisitionDate": "2026-02-15",
                "sceneId": "<escena del 15 feb>"
              }
            },
            {
              "date": "2026-03-15",
              "label": "15 mar",
              "image": "data/real/zones/nombre-de-la-zona/soil-moisture-2026-03-15.png",
              "bbox": [-4.0, 37.5, -3.9, 37.6],
              "provenance": {
                "acquisitionDate": "2026-03-15",
                "sceneId": "<escena del 15 mar>"
              }
            }
          ]
        }
      ]
    }
  ]
}
```

Los valores entre `<...>` son marcadores: sustitúyelos por procedencia
verificable. `example.org`/`example.invalid` y las escenas de fixture solo
sirven para tests, nunca para la demo pública.

El fixture
[`frontend/scripts/fixtures/valid/real-with-timesteps.json`](../frontend/scripts/fixtures/valid/real-with-timesteps.json)
muestra la forma completa sin ser una observación real.

### Variante NDVI

Para una capa óptica, usa `"id": "ndvi"`, `"unit": "index"`,
`"range": [0, 1]` y una procedencia que identifique la fuente óptica real
(Landsat, Sentinel-2 u otra autorizada). **No la describas como NISAR.** El
pipeline NISAR de este repositorio no genera NDVI.

## 4. Paso 3 — colocar los archivos

```text
frontend/public/data/real/
├── manifest.json
└── zones/
    └── nombre-de-la-zona/
        └── soil-moisture/
            ├── 20260620T052326.png
            ├── 20260702T052325.png
            └── 20260714T052325.png
```

- Añade los PNG en `frontend/public/data/real/zones/<id>/soil-moisture/`.
- Edita **solo** `frontend/public/data/real/manifest.json` para declarar la zona,
  la capa y sus `timeSteps`. Si la zona ya existe, sustituye o amplía su capa
  `soil-moisture` sin duplicarla.
- No copies nada a `sample/` ni reutilices un manifiesto de muestra: la demo no
  los carga.
- No versiones HDF5, GeoTIFF, NetCDF, recortes intermedios ni `.h5`. El
  `.gitignore` ya los excluye.
- No hace falta tocar `App.vue`, `main.ts`, componentes, tipos, servicios ni
  `package.json`.

## 5. Paso 4 — validar

Desde la raíz del repositorio:

```bash
npm ci --prefix frontend
npm run validate:data --prefix frontend
```

La validación comprueba:

- que el esquema JSON compila;
- que los manifiestos publicados cumplen esquema, semántica y assets;
- que el modo del manifiesto coincide con su carpeta;
- que cada `image` —también la de cada `timeSteps[].image`— existe en
  `public/`, es PNG y tiene canal alfa;
- que `bbox`, `range`, leyenda, ids, coherencia `datasetMode`/`status` y
  procedencia de `processed_real` son correctos;
- que `timeSteps`, si existe, tiene fechas ISO reales en orden estricto, sin
  duplicados, cada `bbox` dentro de la zona y el último paso igual a
  `layer.image`/`layer.bbox`;
- que la procedencia efectiva de cada paso de una capa `processed_real` incluye
  fecha, escena y URL;
- que `schemaVersion` es `"1.2.0"` cuando hay `timeSteps`;
- que los fixtures válidos pasan y los inválidos fallan.

Para completar la entrega:

```bash
npm test --prefix frontend
npm run build --prefix frontend
```

`npm run build` debe generar `frontend/dist/` sin errores. Si la validación
falla, no se publica la capa: corrige el JSON o el PNG y repite.

## 6. Paso 5 — revisar la alineación en el navegador

```bash
npm run dev --prefix frontend
```

Abre la URL que imprime Vite (por defecto `http://localhost:5173/`) y:

1. Selecciona la zona nueva en el selector (la primera zona se autoselecciona al
   cargar).
2. Activa la capa y súbela al 100 % de opacidad.
3. Compara con el mapa base PNOA y con OpenStreetMap: los bordes del PNG deben
   caer sobre la misma área en ambos.
4. Comprueba que las zonas sin dato son transparentes (se ve el mapa base) y
   que no hay un rectángulo opaco de relleno.
5. Verifica que la leyenda, la unidad y la fecha mostradas coinciden con el
   manifiesto. La interfaz no muestra la procedencia (decisión de producto del
   2026-11-15): compruébala en el manifiesto y con `validate:data`.
6. Recorre la línea temporal: cada fecha debe cambiar solo la imagen (sin
   recrear el mapa ni parpadear) y el slider debe mostrar la fecha del paso
   activo.
7. Navega fuera de la zona: no debe aparecer color científico fuera de
   `layer.bbox`.

Para revisar la build de producción:

```bash
npm run build --prefix frontend
npm run preview --prefix frontend
```

**Nota de integración:** `frontend/src/App.vue` ya compone el mapa, la línea
temporal y el panel con el manifiesto real. No declares una capa revisada solo
con tests unitarios: la alineación geográfica se comprueba en el navegador.

## 7. Paso 6 — aprobación científica y publicación

1. La persona revisora comprueba fuente, fecha, escena, unidades, escala,
   calidad y alineación. La aprobación se registra en la Issue/PR con nombre y
   fecha; opcionalmente se añade `provenance.approvedBy`.
2. Solo entonces se mantiene `status: "processed_real"`.
3. Se abre una PR pequeña con el PNG, el manifiesto y la evidencia de
   validación. La revisión es independiente del autor; un comentario automático
   no es una aprobación humana.
4. El check `ci` debe estar en verde. No se fusiona sin revisión.
5. Tras el merge se **recompila y publica el sitio estático**. El PNG y el JSON
   deben formar parte del despliegue; no basta con tenerlos en el repositorio.
6. En la web publicada, la zona aparece directamente en la demo (solo datos
   reales) sin cambiar ningún componente Vue.

No se publica una capa real «para probar» con datos ficticios. Para probar la
carga existe el fixture contractual y los tests; la demo pública no expone
fixtures como datos reales.

## 8. NISAR SME2: uso del conversor existente

El repositorio incluye
[`pipelines/nisar/sme2_to_overlay.py`](../pipelines/nisar/sme2_to_overlay.py),
que convierte productos **NISAR L3 SME2** (HDF5 descargados de ASF) en una capa
`soil-moisture` conforme al contrato: PNG RGBA en EPSG:3857, `bbox` WGS84,
leyenda y procedencia. No genera NDVI.

### 8.1 Instalación

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r pipelines/nisar/requirements.txt
```

Requiere Python con `numpy`, `h5py`, `rasterio`, `pyproj` y `pillow`. La
instalación se hace en un entorno virtual; no se instalan dependencias
científicas en el `package.json` del frontend.

### 8.2 Staging: no toca la aplicación

```bash
python pipelines/nisar/sme2_to_overlay.py ruta/a/NISAR_L3_*.h5 \
  --aoi -90.32 29.90 -90.24 29.96 \
  --zone-id delta-mississippi \
  --zone-name "Delta del Misisipi" \
  --staging pipelines/nisar/sme2_staging
```

`--aoi` es `west south east north` en WGS84. El comando:

- recorta la capa SME2 al AOI sobre la rejilla EASE-Grid 2.0;
- enmascara `_FillValue`, valores no finitos y valores fuera del rango físico;
- guarda un GeoTIFF maestro con los valores reales (no se versiona);
- reproyecta a EPSG:3857 por vecino más próximo y sobremuestrea para que
  Leaflet no difumine;
- pinta el PNG con escala fija y alpha 0 en no-data;
- calcula el `bbox` desde las esquinas del raster;
- verifica la georreferencia con 25 píxeles de control;
- **no escribe** en `frontend/public/data/real/`.

Salidas en `pipelines/nisar/sme2_staging/<zone-id>/`:

| Archivo | Contenido |
|---|---|
| `png/soil-moisture_<fecha>_<órbita>.png` | Overlay por fecha. |
| `layer.staging.json` | Entrada de capa preparada; no se copia a mano. |
| `report.json` | Cobertura, estadísticas, avisos, escenas descartadas y comprobación de georreferencia. |
| `timeseries.json` | Borrador de todas las fechas. `--publish` sin `--date` escribe la serie completa como `timeSteps` (ver §8.4). |
| `geotiff/` | Maestro científico intermedio; **no se versiona**. |

### 8.3 Revisión antes de publicar

Revisa `report.json`:

- `problems` debe estar vacío. Si hay fallos de georreferencia o CRID mezclados,
  el script no publica.
- `warnings`: cobertura del AOI menor del 90 %, píxeles que saturan por encima
  de `--vmax`, escenas descartadas…
- `skipped`: escenas fuera del AOI, con pocos píxeles válidos o con unidades
  inesperadas.
- `georefCheck.ok`: la comprobación de alineación debe pasar.
- La fecha elegida es la más reciente por defecto. Si se descartó alguna escena,
  hay que indicar `--date YYYY-MM-DD` explícitamente para no publicar en
  silencio una fecha antigua.

Comprueba también que la escala (`--vmin`/`--vmax`) es la adecuada, que las
unidades son `m³/m³` y que la madurez (`--maturity`, por defecto `PROVISIONAL`)
describe el producto.

### 8.4 Publicación tras la aprobación

Solo después de la revisión científica:

```bash
python pipelines/nisar/sme2_to_overlay.py ruta/a/NISAR_L3_*.h5 \
  --aoi -90.32 29.90 -90.24 29.96 \
  --zone-id delta-mississippi \
  --zone-name "Delta del Misisipi" \
  --publish --approved-by "Nombre del revisor"

npm run validate:data --prefix frontend
```

`--publish` exige `--approved-by`; sin él, el script termina con error. Sin
`--date`, escribe **todas** las fechas como
`frontend/public/data/real/zones/<zone-id>/soil-moisture/<fecha>.png` y
actualiza el manifiesto real de forma atómica:

- añade `layer.timeSteps` ordenados, con la procedencia de cada escena;
- fija `layer.image`/`layer.bbox` al último paso;
- sube `schemaVersion` a `"1.2.0"` si era `1.1.0`;
- si la zona ya existe, sustituye su capa `soil-moisture` sin duplicarla;
- si el `bbox` de la zona no contiene el de la capa, lo amplía con un aviso;
- añade `approvedBy` a la procedencia.

Con `--date YYYY-MM-DD` publica una sola imagen y no escribe `timeSteps`.
Para re-renderizar sin volver a abrir los HDF5, usa
`--from-staging pipelines/nisar/sme2_staging/<zone-id>` con los mismos
`--zone-id`/`--zone-name` y `--publish --approved-by`; el resultado mantiene el
`bbox` y la serie del staging. La guía completa del conversor está en
[`pipelines/nisar/README.md`](../pipelines/nisar/README.md).

Códigos de salida:

| Código | Significado |
|---|---|
| 0 | Correcto (puede haber avisos en stderr). |
| 1 | Error de entrada, ninguna escena utilizable o publicación bloqueada. |
| 2 | Staging con problemas: georreferencia fallida o CRID mezclados. |

### 8.5 Pruebas del conversor

```bash
python -m pytest -q pipelines/nisar/tests
```

Los tests usan HDF5 **sintéticos** con la estructura del producto. Sirven para
probar el conversor, no para declarar una observación real. Antes de publicar
conviene comparar una escena real con la documentación de ASF y con el notebook
de referencia del equipo.

### 8.6 Qué no hace el pipeline

- No descarga datos por ti: los HDF5 se obtienen de ASF con la herramienta del
  equipo y deben tener procedencia y licencia claras.
- No convierte NDVI: el NDVI es óptico y requiere otro procesamiento.
- No decide si una parcela necesita riego.
- No sustituye la revisión científica ni la aprobación humana.

## 9. Checklist final

- [ ] Fuente autorizada, con producto, escena, fecha, versión y URL verificables.
- [ ] PNG RGBA en EPSG:3857, norte arriba y extensión exacta de `layer.bbox`.
- [ ] Píxeles sin dato con alpha 0; sin rectángulos opacos de relleno.
- [ ] `bbox` en orden `[west, south, east, north]`; `layer.bbox` dentro de
      `zone.bbox` (tolerancia 0.01°).
- [ ] `image` bajo `data/real/zones/<id>/` y sin rutas inseguras.
- [ ] `status: "processed_real"` solo tras aprobación humana.
- [ ] `provenance` completa: proveedor, producto, versión, fecha, escena y URL.
- [ ] Si hay `timeSteps`: `schemaVersion: "1.2.0"`, fechas ISO ordenadas y
      únicas, cada PNG/`bbox` válido y el último paso igual a
      `layer.image`/`layer.bbox`. En `processed_real`, cada paso tiene
      procedencia efectiva completa.
- [ ] `legend` de al menos dos paradas, ordenada y coherente con la paleta.
- [ ] `qualityNote` explica madurez y limitaciones; no promete riego ni kg/ha.
- [ ] `npm run validate:data --prefix frontend` pasa.
- [ ] `npm test --prefix frontend` y `npm run build --prefix frontend` pasan.
- [ ] Revisión visual de alineación con PNOA y OSM y de la línea temporal.
- [ ] No se han modificado componentes Vue ni se han versionado binarios
      científicos grandes.
- [ ] Aprobación registrada en la PR; check `ci` en verde; sin auto-merge.

## 10. Qué NO se exige al equipo científico

- Escribir Vue, TypeScript, CSS o Leaflet.
- Construir rutas de assets o conocer `import.meta.env.BASE_URL`.
- Generar teselas nacionales o un mosaico global.
- Calcular índices en el navegador.
- Montar una API, base de datos, autenticación o backend.
- Desplegar la web (lo hace integración).
- Inventar valores donde no hay dato o rellenar huecos de cobertura.
- Entregar HDF5/GeoTIFF versionados en Git.
- Hacer consultas por píxel: v1.2.0 solo pinta imágenes georreferenciadas (una por fecha como máximo).

## 11. Advertencia sobre los datos publicados y el concurso

La demo publica **humedad superficial NISAR L3 SME2** de Jaén y Toledo
(producto **PROVISIONAL**, no totalmente calibrado). No son datos sintéticos ni
una conclusión agronómica: son observaciones georreferenciadas del producto,
con su procedencia y sus limitaciones declaradas en el manifiesto, en los
cubos de análisis y en esta documentación. Desde el 2026-11-15 la interfaz solo
indica «datos PROVISIONAL» en el subtítulo, sin avisos ni panel de procedencia.

La humedad superficial **no equivale a una necesidad de riego**. Publicar una
capa tampoco demuestra por sí mismo una
conclusión sobre producción o kg/ha. Los requisitos del NASA Space Apps
Challenge o de posibles premios globales dependen de lo que establezca el
reglamento vigente y de la revisión científica del producto.

## 12. Referencias

- Contrato práctico y validación: [`docs/data-contract.md`](data-contract.md).
- Congelación y regla de cambios: [`docs/contract-freeze.md`](contract-freeze.md).
- Esquema: [`contracts/manifest.schema.json`](../contracts/manifest.schema.json).
- Conversor NISAR SME2: [`pipelines/nisar/README.md`](../pipelines/nisar/README.md).
- Documentación de ASF sobre SME2: <https://nisar-docs.asf.alaska.edu/sme2>.
