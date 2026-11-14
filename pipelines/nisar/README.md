# pipelines/nisar — NISAR L3 SME2 → capa OliveTwin

`sme2_to_overlay.py` convierte productos **NISAR L3 SME2** (HDF5 descargados de ASF, p. ej. con el
notebook de serie temporal) en la capa `soil-moisture` del contrato **v1.2.0**
(`docs/c0-interfaces.md` §6, `frontend/src/types/manifest.ts`): PNG RGBA en EPSG:3857 + `bbox` WGS84
+ leyenda + procedencia, y opcionalmente una **serie temporal** (`timeSteps`) con escala fija común.

## Instalación

```bash
python -m venv .venv && . .venv/bin/activate      # o: uv venv
pip install -r pipelines/nisar/requirements.txt
```

## Uso

```bash
# 1) Staging: no toca la app. Revisa report.json y los PNG.
python pipelines/nisar/sme2_to_overlay.py nisar_sme2_data/*.h5 \
  --aoi -90.32 29.90 -90.24 29.96 \
  --zone-id mississippi-delta --zone-name "Delta del Mississippi" \
  --staging pipelines/nisar/sme2_staging

# 2) Publicación de la serie completa tras la revisión científica
#    (escribe en frontend/public/data/real/)
python pipelines/nisar/sme2_to_overlay.py nisar_sme2_data/*.h5 \
  --aoi -90.32 29.90 -90.24 29.96 \
  --zone-id mississippi-delta --zone-name "Delta del Mississippi" \
  --publish --approved-by "Nombre del revisor"
npm run validate:data --prefix frontend

# 3) Republicar desde el staging (sin volver a abrir los HDF5) con otra escala
python pipelines/nisar/sme2_to_overlay.py \
  --from-staging pipelines/nisar/sme2_staging/mississippi-delta \
  --zone-id mississippi-delta --zone-name "Delta del Mississippi" \
  --auto-scale --publish  # --publish exige además --approved-by
```

Opciones útiles:

| Opción | Efecto |
|---|---|
| `--layer algorithmCandidates/DSG/soilMoisture` | Capa bajo `/science/LSAR/SME2/grids/` (por defecto `soilMoisture`, la variable principal documentada por ASF). |
| `--auto-scale` | Escala común a **todas** las escenas: percentiles p2–p98 agrupados, redondeados hacia fuera a múltiplos de 0,05 m³/m³. Se registra en `report.json`. |
| `--vmin/--vmax` | Escala manual fija (por defecto 0–0,6 m³/m³). No se combina con `--auto-scale`. |
| `--date YYYY-MM-DD` | Publica **solo** esa fecha, sin `timeSteps`. Sin esta opción se publica la serie completa. |
| `--allow-skipped` | Permite publicar la serie de las escenas restantes aunque se descartaran otras (con aviso). |
| `--from-staging DIR [DIR ...]` | Re-renderiza desde `layer.staging.json` + GeoTIFF maestro, sin HDF5. |
| `--upscale` | Sobremuestreo por vecino más próximo (por defecto 8). |
| `--maturity` | `PROVISIONAL` (por defecto), `BETA` o `VALIDATED`. Con `--from-staging` se conserva la del staging si no se indica. |

## Qué hace

1. Recorta la capa al AOI sobre la rejilla EASE-Grid 2.0 (EPSG:6933), incluyendo todo píxel que toque el
   AOI. Enmascara `_FillValue`, no finitos y valores fuera de [0, 1] m³/m³.
2. Guarda un **GeoTIFF maestro** con los valores reales (`staging/<zona>/geotiff/`, no se versiona).
3. Reproyecta a EPSG:3857 por **vecino más próximo** (no inventa valores) y sobremuestrea para que
   Leaflet no difumine los píxeles de 200 m.
4. Pinta el PNG con **escala fija común a toda la serie** (fechas comparables; la leyenda reproduce la
   paleta). Sin dato → alpha 0.
5. Calcula el `bbox` a partir de las esquinas exactas del raster 3857.
6. **Comprueba la georreferencia**: 25 píxeles de origen, colocados como lo hace Leaflet `ImageOverlay`
   (interpolación lineal en Mercator dentro del `bbox`), deben caer en un píxel opaco del color esperado.

La paleta de humedad es secuencial seco→húmedo y distinta de la de NDVI:
`#a6611a · #e9c46a · #d9f0a3 · #41b6c4 · #2c7fb8 · #253494`. La leyenda rotula la primera parada
«Más seco», la última «Más húmedo» y las intermedias con coma decimal (p. ej. «0,12 m³/m³»).

## Serie temporal (`timeSteps`, contrato v1.2.0)

Con `--publish` sin `--date` se publican **todas** las escenas utilizables, ordenadas por fecha:

- cada paso: `{date: acquisitionStart, image: "data/real/zones/<zona>/soil-moisture/<YYYYMMDDTHHMMSS>.png", bbox, provenance: {acquisitionDate, sceneId, processingVersion, note, crid}}`;
- `layer.image` y `layer.bbox` son los del **último** paso (compatibilidad v1.1);
- unidad, `range` y `legend` son comunes; el manifiesto sube a `schemaVersion: "1.2.0"` si era `1.1.0`;
- el `bbox` de la zona se amplía (con aviso) para contener la capa y **todos** los pasos;
- se copian todos los PNG y se reemplaza la capa `soil-moisture` sin duplicarla.

Con `--date` se publica una sola imagen y **no** se escriben `timeSteps` (el manifiesto conserva su
versión si ya era válida).

## Re-render desde staging (`--from-staging`)

Cada `DIR` debe contener `layer.staging.json` y el GeoTIFF maestro en `geotiff/`. Se admiten dos formas:

- **DIR por escena** (`layer.staging.json` con `layer` y un único `.tif`), o
- **DIR por zona** con `series` dentro de `layer.staging.json` (formato que genera este script), que
  reconstruye la serie completa.

La meta se reconstruye desde la procedencia: se intenta `parse_name(sceneId + ".h5")` y, si el nombre no
es estándar, se usan `acquisitionDate`, `crid` y `maturity` del staging. Para `verify_georef`, los
centros de píxel (`x`, `y`) se derivan de la transformada del GeoTIFF. El warp, colorize, verify y
publish son exactamente los mismos que en modo HDF5; el `bbox` resultante coincide con el del staging.

En este modo no se reescribe `layer.staging.json` de la fuente (solo `report.json` y los PNG nuevos).

Salidas en `staging/<zona>/` (modo HDF5): `png/soil-moisture_<fecha>_<órbita>.png`,
`layer.staging.json` (capa elegida + `series` con metadatos y GeoTIFF de cada escena),
`timeseries.json` (serie publicable) y `report.json` (escala, estadísticas, cobertura, píxeles
recortados por `vmax`, comprobaciones).

## Salvaguardas

- `--publish` exige `--approved-by`: el contrato reserva `processed_real` para datos revisados.
- No publica si falla la verificación de georreferencia o si se mezclan versiones de procesamiento (CRID).
- Si se descartó alguna escena, no publica la serie incompleta salvo con `--allow-skipped` (y avisa).
  Con `--date` no se exige, porque se publica una fecha concreta.
- Valida el manifiesto antes de escribir; PNG y manifiesto se escriben de forma atómica (sin huérfanos).
- Detecta fechas de adquisición duplicadas y omite las repetidas (aviso + `--allow-skipped` si se publica).
- Avisa si la escena cubre < 90 % del AOI o si > 5 % de píxeles saturan por encima de `--vmax`.
- Descarta escenas con menos de `--min-valid` (10 %) de píxeles válidos o con unidades inesperadas.
- Republicar reemplaza la capa `soil-moisture` de la zona; no duplica.
- `qualityNote` indica la madurez (PROVISIONAL = no totalmente calibrado), las zonas sin estimación y que
  la humedad superficial no equivale a necesidad de riego.

## Códigos de salida

| Código | Significado |
|---|---|
| 0 | Correcto (puede haber avisos en stderr) |
| 1 | Error de entrada, ninguna escena utilizable o publicación bloqueada |
| 2 | Staging generado con problemas: verificación de georreferencia fallida o CRID mezclados |

## Limitaciones

- La máscara descarta valores fuera de [0, 1] m³/m³ (rango físico).
- Interpreta el nombre de fichero NISAR para fecha, track, órbita y CRID; un nombre no estándar se rechaza
  al leer HDF5 (en staging se tolera si hay `acquisitionDate`).
- No aplica todavía las capas de banderas de calidad de SME2 (codificación pendiente de confirmar en la
  [especificación](https://nisar-docs.asf.alaska.edu/sme2)).
- La escala automática está pensada para humedad superficial (0–1 m³/m³).
- Los tests usan HDF5 **sintéticos** con la estructura del producto; conviene una pasada con un fichero real
  antes de publicar (comparar con el notebook).

## Tests

```bash
python -m pytest -q pipelines/nisar/tests
```

Cubren: staging y georreferencia, aterrizaje real de píxeles, aprobación obligatoria, publicación
idempotente, serie de 3 escenas (`timeSteps` ordenados, `layer.image` = último), `--date` sin serie,
`--auto-scale`, re-render desde staging con otra escala (mismo `bbox` y georef), `--allow-skipped` y
bloqueo por CRID mezclado.
