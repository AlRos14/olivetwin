# pipelines/nisar — NISAR L3 SME2 → capa OliveTwin

`sme2_to_overlay.py` convierte productos **NISAR L3 SME2** (HDF5 descargados de ASF, p. ej. con el
notebook de serie temporal) en la capa `soil-moisture` del contrato **v1.1.0**
(`contracts/manifest.schema.json`): PNG RGBA en EPSG:3857 + `bbox` WGS84 + leyenda + procedencia.

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

# 2) Publicación tras la revisión científica (escribe en frontend/public/data/real/)
python pipelines/nisar/sme2_to_overlay.py nisar_sme2_data/*.h5 \
  --aoi -90.32 29.90 -90.24 29.96 \
  --zone-id mississippi-delta --zone-name "Delta del Mississippi" \
  --publish --approved-by "Nombre del revisor"
npm run validate:data --prefix frontend
```

Opciones útiles: `--layer algorithmCandidates/DSG/soilMoisture` (por defecto `soilMoisture`, la variable
principal documentada por ASF), `--date YYYY-MM-DD` (por defecto la fecha más reciente), `--vmin/--vmax`
(escala fija, por defecto 0–0,6 m³/m³), `--upscale` (sobremuestreo por vecino más próximo, por defecto 8),
`--maturity` (por defecto `PROVISIONAL`).

## Qué hace

1. Recorta la capa al AOI sobre la rejilla EASE-Grid 2.0 (EPSG:6933), incluyendo todo píxel que toque el
   AOI. Enmascara `_FillValue`, no finitos y valores fuera de [0, 1] m³/m³.
2. Guarda un **GeoTIFF maestro** con los valores reales (`staging/<zona>/geotiff/`, no se versiona).
3. Reproyecta a EPSG:3857 por **vecino más próximo** (no inventa valores) y sobremuestrea para que
   Leaflet no difumine los píxeles de 200 m.
4. Pinta el PNG con **escala fija** (fechas y zonas comparables; la leyenda reproduce la paleta).
   Sin dato → alpha 0.
5. Calcula el `bbox` a partir de las esquinas exactas del raster 3857.
6. **Comprueba la georreferencia**: 25 píxeles de origen, colocados como lo hace Leaflet `ImageOverlay`
   (interpolación lineal en Mercator dentro del `bbox`), deben caer en un píxel opaco del color esperado.

Salidas en `staging/<zona>/`: `png/soil-moisture_<fecha>_<órbita>.png`, `layer.staging.json` (entrada de capa envuelta para que no se copie a mano),
`timeseries.json` (todas las fechas; borrador para una futura extensión v1.2 del contrato, la app v1.1.0
no lo lee) y `report.json` (estadísticas, cobertura, píxeles recortados por `vmax`, comprobaciones).

## Salvaguardas

- `--publish` exige `--approved-by`: el contrato reserva `processed_real` para datos revisados.
- No publica si falla la verificación de georreferencia o si se mezclan versiones de procesamiento (CRID).
- Si se descartó alguna escena (AOI fuera, pocos válidos, unidades raras), exige `--date` explícito para no
  publicar en silencio una fecha antigua como «la más reciente».
- Valida el manifiesto antes de escribir y escribe PNG y manifiesto de forma atómica (sin huérfanos).
- El `bbox` de la zona se amplía, con aviso, para contener el `bbox` de la capa.
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
- Interpreta el nombre de fichero NISAR para fecha, track, órbita y CRID; un nombre no estándar se rechaza.
- No aplica todavía las capas de banderas de calidad de SME2 (codificación pendiente de confirmar en la
  [especificación](https://nisar-docs.asf.alaska.edu/sme2)).
- Los tests usan HDF5 **sintéticos** con la estructura del producto; conviene una pasada con un fichero real
  antes de publicar (comparar con el notebook).

## Tests

```bash
python -m pytest -q pipelines/nisar/tests
```
