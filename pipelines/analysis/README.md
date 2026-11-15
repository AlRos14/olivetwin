# pipelines/analysis — cubo de análisis por zona (contrato v1.3.0)

`build_analysis.py` descarga datos **reales y abiertos** para las zonas de estudio (`jaen`, `toledo`) y
escribe, por zona, un **cubo de análisis** conforme a
[`contracts/analysis.schema.json`](../../contracts/analysis.schema.json):

```
frontend/public/data/real/zones/<zona>/analysis/analysis.json
frontend/public/data/real/zones/<zona>/analysis/<variable>/<YYYYMMDDTHHMMSS | YYYYMMDD | static>.png
```

y enlaza cada cubo desde `frontend/public/data/real/manifest.json` (`zone.analysis`,
`schemaVersion: "1.3.0"`). No modifica nada más del manifiesto.

## Rejilla y codificación

- **Rejilla común** por zona en EPSG:3857: parte de la esquina NO del `bbox` de la zona, celdas
  cuadradas de **250 m Web Mercator** (≈ 195–198 m de terreno a estas latitudes),
  `width = ceil(Δx/250)`, `height = ceil(Δy/250)`. La extensión exacta es `width·250 × height·250` y
  `grid.bbox` es su WGS84 (algo mayor que la zona por el este y el sur, < 250 m), para que la conversión
  lat/lon → celda en el cliente sea exacta. Jaén: 175 × 149 celdas; Toledo: 303 × 252.
- **`png-uint8-linear`**: PNG gris de 8 bits (modo `L`, sin alfa ni fragmentos de color/gamma) del tamaño
  de la rejilla; `valor = offset + scale · código` para códigos 0..254 (los valores fuera de rango se
  recortan), **255 = sin dato**.
- **`stats`** de cada paso se calculan con los valores float en la rejilla **antes** de cuantizar
  (`validFraction` = celdas válidas / total).

| Variable | Unidad | offset | scale |
|---|---|---|---|
| `soil-moisture-all`, `soil-moisture` | m³/m³ | 0 | 0,0025 |
| `radar-hh`, `radar-hv` | dB | −35 | 0,16 |
| `radar-hv-hh` | dB | −25 | 0,12 |
| `insar-coherence` | 0–1 | 0 | 1/254 |
| `ndvi`, `ndmi` | — | −1 | 2/254 |
| `elevation` | m | 0 | 10 |
| `slope` | ° | 0 | 0,25 |
| `soil-clay`, `soil-sand` | % | 0 | 0,4 |
| `soil-soc` | g/kg | 0 | 0,5 |
| `soil-ph` | pH | 3 | 0,03 |
| `climate-precip-annual` | mm/año | 0 | 10 |
| `climate-tmean-annual` | °C | 0 | 0,1 |
| `climate-tmin-coldest` | °C | −10 | 0,1 |
| `climate-tabsmin` | °C | −20 | 0,1 |
| rásteres de cultivo (`crops`) | 0–1 | 0 | 1/254 |

## Variables y fuentes

| id | Qué es | Fuente | Licencia / atribución |
|---|---|---|---|
| `soil-moisture-all` | «Humedad superficial (NISAR SME2, todas las estimaciones)»: la misma serie, codificación, paleta, rango y remuestreo que `soil-moisture`, **sin** la máscara de `retrievalQualityFlag`; solo queda sin dato lo que el producto no estima (`_FillValue` o valores fuera de 0–1 m³/m³). Cada paso indica en `provenance.flaggedFractionOfValidCells` la fracción de celdas con dato que el producto marca como «retrieval no recomendada». Va primero en `variables`. | Igual que `soil-moisture` | Igual |
| `soil-moisture` | «Humedad superficial (NISAR SME2, calidad recomendada)». Humedad volumétrica de los ~5 cm superiores. Serie **completa** del mismo track/dirección/frame (Jaén: track 87 ascendente, frame 21, ~05:23 UTC; Toledo: track 95 descendente, frame 68, ~19:09 UTC). Vecino más próximo. Se ocultan los píxeles con **bit 0 de `retrievalQualityFlag` = 1** («retrieval no recomendada»). | NISAR L3 SME2 PROVISIONAL (`C2854344945-ASF`), HDF5 completo desde ASF | Datos abiertos NASA ESDIS (CMR: `FreeAndOpenData`), citar doi:10.5067/NIL3SME2-P1 |
| `radar-hh`, `radar-hv` | gamma0 (no sigma0) en dB; media en **potencia lineal** por celda (≥ 50 % de píxeles válidos) y después `10·log10`. Mismas fechas que SME2. | NISAR L2 GCOV PROVISIONAL (`C2854338529-ASF`), recorte con NASA Harmony | Guía NASA ESDIS (la colección no declara `UseConstraints` en CMR), doi:10.5067/NIL2GCOV-P1 |
| `radar-hv-hh` | Razón de polarización cruzada HV − HH (dB) = `10·log10(HV/HH)` por celda. **No es NDVI**: solo un indicador de estructura. | Igual que GCOV | Igual |
| `insar-coherence` | Coherencia HH de una pareja de 12 días (2026-08-19 → 2026-08-31), media por celda de píxeles de 80 m válidos según la capa `mask`. | NISAR L2 GUNW PROVISIONAL (`C2854335566-ASF`), lectura HTTP parcial del HDF5 con `earthaccess` | NASA ESDIS, doi del producto 10.5067/NIL2GUNW-P1 |
| `ndvi`, `ndmi` | `(B08−B04)/(B08+B04)` y `(B8A−B11)/(B8A+B11)` sobre reflectancia L2A con `BOA_ADD_OFFSET` (−1000 desde la línea 04.00). Máscara SCL: solo clases 4 y 5. Mosaico de las teselas MGRS de la misma pasada; media de subpíxeles válidos con ≥ 50 % válidos por celda. Una fecha por ventana de 14 días (la de menor nubosidad de tesela, ≤ 20 %). | Sentinel-2 L2A en Microsoft Planetary Computer (`sentinel-2-l2a`), firma SAS anónima | «Contains modified Copernicus Sentinel data 2026» (aviso legal de Copernicus) |
| `elevation`, `slope` | Altitud media por celda; pendiente en grados calculada a 30 m en EPSG:25830 y promediada. Estáticas (`date: null`). | Copernicus DEM GLO-30 (`cop-dem-glo-30`, Planetary Computer) | «produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved» |
| `soil-clay`, `soil-sand`, `soil-soc`, `soil-ph` | Media ponderada por espesor de las capas «mean» 0–5, 5–15 y 15–30 cm, ÷ 10 (factor de conversión de SoilGrids) → %, g/kg y pH. Estáticas. | ISRIC SoilGrids 2.0 (VRT/COG oficiales de files.isric.org, rejilla nativa) | CC BY 4.0, ISRIC; Poggio et al. (2021) doi:10.5194/soil-7-217-2021 |
| serie `precipitation`, `et0`, `temperature-max`, `temperature-min` | Valores diarios en el centroide de la rejilla, 2026-06-01 → 2026-10-31. | Open-Meteo Historical Weather API, modelo `era5_seamless` (ERA5 + ERA5-Land) | CC BY 4.0 — Weather data by Open-Meteo.com (ERA5/ERA5-Land, Copernicus Climate Change Service) |
| `climate-precip-annual`, `climate-tmean-annual`, `climate-tmin-coldest`, `climate-tabsmin` | Climatología **1991–2020** (periodo normal de la OMM), estática: lluvia anual media, temperatura media anual, mínima media del mes más frío y media de las mínimas absolutas anuales. Ver «Climatología». | Open-Meteo Historical Weather API, `era5_seamless`, series diarias de 5 puntos por zona | CC BY 4.0 — Weather data by Open-Meteo.com (ERA5/ERA5-Land, Copernicus Climate Change Service) |
| `landcover-agri`, `landcover-olive` | Fracción de la celda con territorios agrícolas (CLC 2xx) y con olivares (CLC 223). Estáticas. Ver «Usos del suelo». | CORINE Land Cover 2018 (EEA, Copernicus), servicio vectorial ArcGIS REST | © Unión Europea, Copernicus Land Monitoring Service 2018, EEA; acceso libre y abierto con atribución |
| serie `smap-soil-moisture` | Media diaria de zona (pasada AM) de las celdas de 9 km cuyo centro cae en la rejilla, solo con bit 0 de `retrieval_qual_flag` = 0. | SMAP SPL3SMP_E v006 (`C2938664763-NSIDC_CPRD`), recorte con Harmony (HOSS) | Texto `UseConstraints` de CMR (libre y abierto, citar NSIDC) |

Todas las variables se publican con `status: "processed_real"` y `provenance.approvedBy` igual al
revisor indicado con `--approved-by` (obligatorio). Cada paso lleva su procedencia (identificador de
escena/ítem, fecha de adquisición, CRID, notas de marcas de producción como `…_F_F_J_001`).

### Índice exploratorio de aptitud (retirado)

El índice relativo con criterios y pesos (`suitability` en la raíz del cubo) se retiró el 2026-11-15 en favor de
la aptitud por cultivo (`crops`). El pipeline ya no lo genera; el campo sigue siendo opcional en el contrato.

## Climatología (`climatology`)

- **Puntos**: las 4 esquinas y el centro de la rejilla de cada zona (5 puntos). Cada punto descarga la serie
  diaria 1991-01-01 → 2020-12-31 de `temperature_2m_mean/max/min` y `precipitation_sum` (modelo
  `era5_seamless`). En el API gratuito cada punto «cuesta» ~783 llamadas (10 958 días / 14); con el límite
  de 5 000/hora y 10 000/día se eligieron 5 puntos por zona y peticiones espaciadas 40 s, con reintento
  tras HTTP 429. Caché en `cache/climatology/<zona>/`.
- **Por punto**: temperatura media, mínima y máxima medias de cada mes; lluvia mensual (total de cada mes,
  promediado entre años); mínima absoluta de cada mes (promedio interanual); media de las mínimas
  absolutas anuales.
- **Por celda**: interpolación por **distancia inversa (potencia 2)** en metros Web Mercator. Las
  temperaturas se reducen al nivel del mar con **6,5 °C/km** usando la elevación que Open-Meteo declara
  para cada punto, se interpolan y se devuelven a la altitud media de la celda (Copernicus DEM, la misma de
  `elevation`). Gradiente: atmósfera estándar de la OACI (ICAO Doc 7488/3, 1993; ISO 2533:1975). La
  precipitación **no** se corrige por altitud.
- La climatología mensual por celda no se publica; la usa el modelo de cultivos.

## Aptitud por cultivo (`crops`)

Cultivos: `olivo` (*Olea europaea*), `almendro` (*Prunus dulcis*, en ECOCROP *Prunus amygdalus* Batsch.) y
`trigo` (trigo de secano, *Triticum aestivum*). Rásteres en
`analysis/crops/<cultivo>/suitability.png` y `<factor>.png` (0 = no apto, 1 = óptimo; 255 = sin dato).
**Aptitud = mínimo de los factores** (ley del mínimo). Clases de la interfaz: S1 ≥ 0,85, S2 0,60–0,85,
S3 0,40–0,60 y N < 0,40 (tramos de LUSET: Yen et al., 2006; Selmy et al., 2024, *Agronomy* 14(11):2601,
tabla 3, CC BY 4.0); «apta» = S1 + S2.

### Revisión del 2026-11-15 (decisión del owner, AlRos14)

El modelo anterior (solo FAO ECOCROP) daba a Jaén menos aptitud para el olivo que a Toledo. El diagnóstico
fue: (1) el recuadro de Jaén incluye sierra (solo el 43 % de sus celdas son llanas y bajo 900 m); (2) los
óptimos genéricos de ECOCROP no son los del olivar mediterráneo: temperatura media mensual de 20–34 °C (dejaba
el clima de las dos zonas en ~0,3), pH óptimo 6–7 (penalizaba los suelos calizos) y textura media/ligera
(penalizaba las tierras francoarcillosas); (3) la rampa de pendiente hasta 0 en el 30 % era demasiado dura. Se
aplicó:

| Factor | Olivo y trigo | Almendro | Fuente |
|---|---|---|---|
| Clima | Factor de restricción climática total de **FAO GAEZ v4** (tema 3, secano, insumos bajos, 1981–2010, ~9 km): `oliv200b_fc0`, `whea200b_fc0` | Temperatura, heladas y lluvia de ECOCROP (como antes) | FAO e IIASA (2021); GAEZ no incluye el almendro |
| pH | Tabla `ph10` de la UGR (olivo: S1 6,0–8,1; S2 5,6–5,9 y 8,2–8,3; S3 5,2–5,5 y 8,4–8,9; N ≤ 5,1 y ≥ 9,0) | Tabla `ph10` de la UGR | Universidad de Granada |
| Textura | Tabla `text8` de la UGR (S1 «otras»; olivo S2 franco arcillo arenosa; S3 arena, franco arenosa, arena franca y arcillas estructuradas) | `text8` | Universidad de Granada |
| Pendiente | Tabla `pend1` de la UGR (olivo y almendro S1 ≤ 8 %, S2 ≤ 16 %, S3 ≤ 30 %, N > 30 %; trigo 6/12/30 %) | `pend1` | Universidad de Granada |
| Carbono orgánico | Tabla `mateorg7` de la UGR (olivo S1 ≥ 1,0 %; almendro y trigo ≥ 0,8 %) | `mateorg7` | Universidad de Granada |
| Altitud | Máximo absoluto de la ficha ECOCROP (olivo 1200 m; trigo 4500 m): 1 por debajo, 0 por encima | — (sin dato) | FAO ECOCROP |

Las tablas de la UGR (Dorronsoro et al., «CambioUso», basadas en Sys et al., 1993, y FAO, 1976) se descargan y
leen tal cual (`otanalysis/sources/ugr.py`, caché en `cache/ugr/`). **Convenciones del proyecto**: puntuación por
clase S1 = 1, S2 = 0,725, S3 = 0,50 y N = 0,20 (puntos medios de los tramos de LUSET); el pH y el carbono se
redondean a un decimal como la tabla; la textura supone suelo estructurado (SoilGrids no distingue las arcillas
«masivas»); «limo arenosa» no tiene equivalencia USDA y no se aplica; si el carbono queda por debajo de todas las
clases con valor se le asigna la peor declarada. Los carbonatos no se evalúan (no hay capa abierta).

**Resultado y lectura.** Con este modelo, sobre la superficie agrícola, el recuadro de Toledo (llano) tiene más
aptitud física para el olivo (99 % apta) que el de Jaén (53 %), sobre todo por la pendiente; el propio GAEZ da a
los dos un clima casi óptimo para el olivo de secano (0,95). Es un resultado de aptitud física de cada recuadro, no
de su provincia: otro recuadro de Jaén, menos inclinado, saldría distinto. Se valoró contrastarlo con los
rendimientos provinciales del Anuario del MAPA, pero el owner decidió no usarlos (2026-11-15) porque describen toda
la provincia y no el recuadro comparado. No se ha encontrado una fuente citable de umbrales de agua útil del suelo
para el olivo (la UGR solo tiene drenaje; SoilGrids 2.0 no publica retención de agua), así que no se ha añadido ese
factor.

### Modelo Ecocrop (almendro)

El almendro conserva el modelo Ecocrop para el clima (Hijmans et al., 2001; `dismo::ecocrop` 1.3-15;
Recocrop 0.4-2), con la ficha FAO id 2397 (descargada el 2026-11-15, `cache/ecocrop/fao/`): temperatura media
mensual óptima 12–35 °C (límites 10–40), temperatura letal −1 °C («early growth») con la rampa de Recocrop sobre
la mínima extrema mensual, lluvia anual óptima 600–900 mm (límites 250–1500), periodo de 6 meses
(round((150+240)/60)) con el mejor mes de inicio. Con 12 meses su TMIN de 10 °C daba aptitud 0 en el 100 % de
las celdas (convención aceptada por el owner); no se evalúan las heladas de floración. Términos de FAO: estudio,
investigación y fines no comerciales citando a FAO (https://www.fao.org/contact-us/terms/en/).

`factor.variables` lista las variables publicadas más próximas a lo que usa cada factor; `parameters` detalla
la fila de la tabla aplicada, las puntuaciones y la variable de entrada; `classes` da los tramos en texto y
`reference` la fuente cuando no es la ficha ECOCROP.

## Usos del suelo (`landcover`)

`landcover-agri` y `landcover-olive`: fracción de cada celda con territorios agrícolas (clases CLC 2xx) y con
olivares (clase 223) según **CORINE Land Cover 2018** (EEA, Copernicus; servicio ArcGIS REST
`Corine/CLC2018_WM`, capa vectorial). Los polígonos se rasterizan a 25 m y se promedian a 250 m. La pestaña
Comparar calcula la aptitud solo en celdas con al menos un 50 % de superficie agrícola; `landcover-olive` se puede
ver como capa en Capas y Análisis. Licencia: acceso libre, completo y abierto con atribución.

## Fuentes no disponibles (`unavailable`)

| id | Motivo |
|---|---|
| `yield-validation` | No hay en el repositorio datos de rendimiento por parcela con licencia compatible; las estadísticas provinciales o municipales no permiten validar variables de 250 m en dos zonas. |
| `los-displacement` | Hay granulos GUNW, pero no se publica: la fase desenrollada es relativa por componente conexa y exige un punto de referencia estable, correcciones ionosférica/troposférica validadas y confirmar la convención de signo. (La frecuencia central del producto, leída del HDF5, es 1,229 GHz → λ ≈ 0,2439 m.) |

Si una fuente falla en una ejecución, sus ids se añaden a `unavailable` con el error literal, salvo
que ya existiera una versión anterior válida en el cubo (en ese caso se conserva y se avisa).

## Instalación

```bash
python3 -m venv pipelines/analysis/.venv
# si falta ensurepip: python3 -m venv --without-pip … && pipelines/analysis/.venv/bin/python -m ensurepip --upgrade
pipelines/analysis/.venv/bin/pip install -r pipelines/analysis/requirements.txt
```

Credenciales de NASA Earthdata: `~/.netrc` (`machine urs.earthdata.nasa.gov`). El código nunca las lee
ni las registra: `requests`, `harmony-py` y `earthaccess` las toman por su cuenta. Planetary Computer,
ISRIC y Open-Meteo no requieren credenciales.

## Uso

```bash
# Todas las fuentes, ambas zonas (escribe en frontend/public y actualiza el manifiesto)
pipelines/analysis/.venv/bin/python pipelines/analysis/build_analysis.py --zone all --approved-by AlRos14

# Solo algunas fuentes / omitir otras (las demás variables del cubo se conservan)
pipelines/analysis/.venv/bin/python pipelines/analysis/build_analysis.py --zone jaen --only s2,dem --approved-by AlRos14
pipelines/analysis/.venv/bin/python pipelines/analysis/build_analysis.py --zone all --skip gunw,smap --approved-by AlRos14

# Ensayo fuera de la app (directorio staging/ no versionado), sin tocar el manifiesto
pipelines/analysis/.venv/bin/python pipelines/analysis/build_analysis.py --zone all --approved-by AlRos14 \
  --public-dir pipelines/analysis/staging/public --no-manifest
```

Fuentes: `sme2`, `gcov`, `s2`, `dem`, `soil`, `climate`, `climatology`, `gunw`, `smap`, `crops`
(`climatology` y `crops` usan las cachés de `dem` y `soil`). Re-ejecutar es idempotente:
cada fuente reemplaza sus variables/series (y borra sus PNG obsoletos) sin duplicar nada. El cubo se
valida contra el esquema (Draft 2020-12) y se comprueban los PNG (modo `L`, tamaño de la rejilla, sin
alfa) antes de actualizar el manifiesto. Después conviene ejecutar `npm run validate:data` en `frontend/`.

`sanity_checks.py` (sin red) compara la humedad SME2 de la rejilla con los PNG de visualización ya
publicados (celda a celda), y comprueba relieve (sierras al sur de Jaén), NDVI en zonas urbanas y la
correlación NDVI–HV; además, temperatura frente a altitud, distribución de la aptitud y factor limitante
por cultivo, y la sensibilidad a las variantes descartadas.

## Caché

Todo lo descargado se guarda en `pipelines/analysis/cache/` (ignorado por Git): HDF5 SME2 completos
(~128 MB cada uno), recortes Harmony GCOV/SMAP, mosaicos Sentinel-2 por fecha (`.npz`), DEM
reproyectado, capas SoilGrids, ventana GUNW, respuestas de Open-Meteo (incluidas las series 1991–2020 de
`cache/climatology/`) y las fichas ECOCROP y la tabla de Recocrop (`cache/ecocrop/`). Una segunda ejecución no vuelve
a descargar. Borrar una subcarpeta fuerza su descarga.

## Limitaciones

- **SME2 y GCOV son PROVISIONAL**: no totalmente calibrados ni validados. La serie SME2 incluye una
  escena con marca de producción distinta (`…_F_F_J_001`, 2026-07-14), anotada en su paso.
- **Máscara de calidad SME2**: en Jaén oculta ~2/3 de los píxeles con estimación (casi todos con la
  clase 1 de `ancillaryData/landCover`, cuya leyenda no documenta el fichero); en Toledo, una fracción
  mucho menor. La cobertura sin y con máscara figura en cada paso. En la ejecución del 2026-11-15 las
  celdas ocultas tenían, de media, más NDVI, más HV y más pendiente que las conservadas (es decir, la
  humedad publicada describe sobre todo las zonas menos arboladas); el criterio de humedad del índice de
  aptitud solo cubre esas celdas. Por decisión del owner se publica también `soil-moisture-all` (sin
  máscara): las celdas que solo aparecen en esa variante son el 64 % de la rejilla de Jaén y el 7 % de la
  de Toledo (con dato en alguna fecha) y tienen de media más NDVI, HV y pendiente (`sanity_checks.py`). El
  índice de aptitud sigue usando `soil-moisture` (calidad recomendada); los cultivos no usan humedad.
- La capa de visualización `soil-moisture` del manifiesto **no** se ha ampliado con las fechas nuevas:
  una prueba con `pipelines/nisar/sme2_to_overlay.py` sobre una copia regeneraba de forma distinta los
  tres PNG ya publicados y ampliaba el `bbox` de la zona de Jaén, así que se descartó.
- En Toledo el frame 68 no cubre toda la zona desde agosto (≈ 80 % de celdas con dato).
- El 2026-09-24 en Jaén se adquirió en modo `SHSH` (sin HV): ese día solo hay `radar-hh`.
- El radar no mide producción ni vigor; NDVI/NDMI son ópticos (Sentinel-2), no NISAR; la humedad
  superficial no equivale a necesidad de riego; SoilGrids es un producto modelado.
- SCL puede dejar nubes/sombras residuales; la selección de fechas usa la nubosidad por tesela.
- El DEM es un modelo de superficie (incluye copas y edificios).
- El clima es reanálisis en un único punto (centroide), no una estación local.

## Tests

```bash
cd pipelines/analysis && env -u PYTHONPATH PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 .venv/bin/python -m pytest -q tests
```

Sin red. Cubren la rejilla (dimensiones, extensión exacta, lat/lon → celda), codificación (ida y vuelta
dentro de media escala, recorte, PNG gris sin alfa), estadísticas, promedio en potencia lineal y umbral
de subpíxeles válidos, fusión idempotente del cubo (sin duplicados, PNG obsoletos, conservación ante
fallos), actualización del manifiesto (solo `schemaVersion` y `zone.analysis`) y utilidades de cada
fuente (BOA offset, NDVI, selección de fechas, media por espesor, pendiente, máscara GUNW, media SMAP),
y del modelo de cultivos: trapecio, regla de temperatura letal, duración del periodo, búsqueda del mes de
inicio, clase USDA y grupo FAO, puntuación de textura, corrección por altitud, IDW, climatología mensual y
lectura de la ficha FAO (con «no input» → sin valor).
