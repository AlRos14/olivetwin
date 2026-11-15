# Fuentes de datos, software y licencias

Auditoría de licencias de OliveTwin (2026-11-15). Objetivo: comprobar que todo lo
que usa el proyecto es **open source o se puede usar para investigación**, como
exige el reto ([`challenge.md`](challenge.md#otros-recursos-política-de-licencias)).
Las atribuciones obligatorias están recogidas en [`NOTICE`](../NOTICE).

## Resultado

| Categoría | Veredicto |
|---|---|
| Datos publicados en `frontend/public/data/` | ✅ Todos abiertos o de uso libre con atribución. |
| Requisitos de cultivo y modelos de referencia | ✅ Uso en investigación permitido. ⚠️ FAO ECOCROP y FAO GAEZ: **solo usos no comerciales**. ⚠️ Tablas de la UGR: sin licencia explícita. |
| Servicios de mapas en tiempo de ejecución | ✅ Uso permitido con atribución (visible en el mapa). |
| Dependencias de software (npm y Python) | ✅ Todas con licencias de código abierto (OSI). |
| Modelo de IA opcional (Gemma vía Ollama) | ⚠️ No es una licencia OSI, pero permite investigación; no se distribuye con el proyecto. |

**Conclusión:** OliveTwin cumple la política del reto para **investigación y uso
no comercial**. No debe usarse con fines comerciales sin sustituir FAO ECOCROP y
FAO GAEZ (o pedir permiso a FAO). El código propio es Apache-2.0
([`LICENSE`](../LICENSE)); las licencias de los datos siguen siendo las de cada
fuente.

## 1. Datos publicados en la aplicación

Están en `frontend/public/data/real/` (manifiesto y cubos de análisis de Jaén y
Toledo). Cada variable lleva su procedencia y licencia en el propio JSON
(`provenance.license`).

| Datos (id en el cubo) | Fuente | Proveedor | Licencia / condiciones | Atribución obligatoria |
|---|---|---|---|---|
| Humedad del suelo NISAR (`soil-moisture`, `soil-moisture-all`) y capa del manifiesto | NISAR L3 SME2 (PROVISIONAL) | NASA/JPL–ISRO, ASF DAAC | Datos abiertos de NASA ESDIS, sin restricciones ([Data Use Guidance](https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance)) | Reconocer a NASA y citar el producto (doi:10.5067/NIL3SME2-P1) |
| Radar HH, HV y HV/HH (`radar-hh`, `radar-hv`, `radar-hv-hh`) | NISAR L2 GCOV (PROVISIONAL) | NASA/JPL–ISRO, ASF DAAC | Datos abiertos de NASA ESDIS | Citar doi:10.5067/NIL2GCOV-P1 |
| Coherencia radar (`insar-coherence`) | NISAR L2 GUNW (PROVISIONAL) | NASA/JPL–ISRO, ASF DAAC | Datos abiertos de NASA ESDIS | Citar doi:10.5067/NIL2GUNW-P1 |
| Humedad SMAP (serie `smap-soil-moisture`) | SMAP SPL3SMP_E v006 | NASA, NSIDC DAAC | Libre, abierto y sin restricciones citando el producto | Cita recomendada de NSIDC |
| NDVI y NDMI (`ndvi`, `ndmi`) | Sentinel-2 L2A | ESA Copernicus, vía Microsoft Planetary Computer | Acceso libre, completo y abierto (Reglamento Delegado (UE) 1159/2013) | «Contains modified Copernicus Sentinel data 2026» |
| Altitud y pendiente (`elevation`, `slope`) | Copernicus DEM GLO-30 | ESA/UE (DLR, Airbus), vía Planetary Computer | Licencia gratuita mundial de Copernicus DEM | Texto de WorldDEM-30 © DLR y © Airbus (ver NOTICE) |
| Arcilla, arena, carbono orgánico y pH (`soil-*`) | SoilGrids 2.0 | ISRIC – World Soil Information | **CC BY 4.0** | ISRIC; Poggio et al. (2021) |
| Clima diario y climatología 1991–2020 (series y `climate-*`) | Open-Meteo Historical Weather API (ERA5/ERA5-Land) | Open-Meteo; Copernicus C3S/ECMWF | **CC BY 4.0** | «Weather data by Open-Meteo.com»; Copernicus C3S |
| Superficie agrícola y olivar (`landcover-agri`, `landcover-olive`) | CORINE Land Cover 2018 | EEA, Copernicus Land Monitoring Service | Acceso libre, completo y abierto con atribución | «© European Union, Copernicus Land Monitoring Service 2018, EEA» |
| Mapas de aptitud por cultivo (`crops`) | Cálculo propio de OliveTwin | — | Apache-2.0 (código); hereda las condiciones de sus entradas (abajo) | Las de las fuentes de la sección 2 |

## 2. Requisitos de cultivo y modelos de referencia

Se usan para calcular la aptitud; sus valores aparecen en los mapas y en la
interfaz (tramos óptimo, aceptable y no apto).

| Qué se usa | Fuente | Licencia / condiciones | Notas |
|---|---|---|---|
| Requisitos de cultivo (temperatura, heladas, lluvia, altitud; olivo, almendro, trigo) | FAO ECOCROP | Términos de uso de FAO: estudio, **investigación** y fines **no comerciales**, citando a FAO | ⚠️ No comercial. Aceptado por el owner. |
| Factor climático del olivo y del trigo | FAO e IIASA, GAEZ v4 (tema 3, secano, insumos bajos) | Términos de uso de FAO; las bases de datos de FAO son CC BY 4.0 salvo indicación contraria | ⚠️ GAEZ no declara una licencia propia en sus metadatos: se aplican los términos de FAO (permiten investigación). |
| Clases de pH, textura, pendiente y carbono orgánico | Universidad de Granada, «CambioUso» (Dorronsoro et al.), basado en Sys et al. (1993) y FAO (1976) | Recurso docente público, **sin licencia explícita** | ⚠️ Se cita con atribución completa. Recomendable pedir confirmación a los autores antes de un uso fuera de la investigación. |
| Tramos de clase S1/S2/S3/N (85/60/40) | LUSET (Yen et al., 2006), reproducido en Selmy et al. (2024), *Agronomy* 14(11):2601 | **CC BY 4.0** | — |
| Clases texturales USDA | USDA Soil Survey Manual (Handbook 18, 2017) | Obra del Gobierno de EE. UU., dominio público | — |
| Contraste del modelo Ecocrop | Tabla `ecocrop.rds` del paquete R Recocrop 0.4-2 | GPL ≥ 3 | Solo se descarga a la caché local del pipeline para comparar; no se redistribuye. |

## 3. Servicios externos que carga el navegador

No se descargan ni se guardan: el mapa los pide al vuelo y muestra su atribución.

| Servicio | Proveedor | Condiciones | Cumplimiento |
|---|---|---|---|
| Vista Satelital y Vista Parcelas (ortofoto PNOA) | IGN/CNIG | **CC BY 4.0** (declarado en el servicio: «CC BY 4.0 scne.es») | Atribución «PNOA cedido por © IGN» en el mapa |
| Recintos SIGPAC (Vista Parcelas) | Fondo Español de Garantía Agraria (FEGA) | El servicio WMS declara `AccessConstraints: none` y `Fees: none` | Atribución a FEGA en el mapa |
| Vista General | OpenStreetMap | Datos ODbL; [política de uso de teselas](https://operations.osmfoundation.org/policies/tiles/): atribución visible, sin descargas masivas | Atribución «© OpenStreetMap contributors»; sin precarga de teselas |
| Interpretación con IA (opcional) | El endpoint que configure el usuario (por defecto, Ollama local) | El del modelo elegido | Ver sección 5 |

## 4. Software

| Componente | Licencias | Notas |
|---|---|---|
| Frontend, dependencias directas | Vue 3 (MIT), Leaflet (BSD-2-Clause), Ajv y ajv-formats (MIT), Vite, Vitest, vue-tsc, jsdom, pngjs (MIT), TypeScript (Apache-2.0) | Ajv está en `devDependencies` pero se incluye en el bundle para validar los datos. |
| Frontend, todas las dependencias instaladas (≈ 140) | MIT, ISC, BSD-2/3-Clause, Apache-2.0, BlueOak-1.0.0, MIT-0, CC0-1.0, MPL-2.0 | MPL-2.0 solo en `lightningcss`, herramienta de compilación que no se distribuye. |
| Pipeline de análisis (Python, directas) | numpy, rasterio, affine, h5py, shapely (BSD-3-Clause); pyproj, earthaccess, jsonschema, pytest, rdata, rfc3339-validator (MIT); pillow (MIT-CMU); requests y harmony-py (Apache-2.0) | `harmony-py` es software de la NASA bajo Apache-2.0. |
| Pipeline, dependencias transitivas | MIT, BSD, Apache-2.0, PSF-2.0, MPL-2.0 (`certifi`, `tqdm`) | Todas de código abierto. |
| Navegadores de las pruebas E2E | Playwright (Apache-2.0) | Fuera del repositorio (harness externo). |

## 5. Modelo de lenguaje (opcional)

La interpretación con IA es opcional y el modelo **no forma parte del
repositorio**: lo instala y ejecuta cada usuario. Con la configuración por
defecto se usa Ollama (MIT) con `gemma3:4b`, sujeto a los Términos de uso de
Gemma de Google. No es una licencia de código abierto OSI, pero permite el uso
en investigación con su política de usos prohibidos. Se puede usar cualquier
otro modelo compatible con la API de OpenAI.

## 6. Fuentes descartadas

| Fuente | Motivo |
|---|---|
| Rendimientos provinciales del Anuario del MAPA | Licencia válida (Ley 37/2007), pero el owner decidió no usarlos (2026-11-15): describen la provincia, no el recuadro comparado. |
| Tablas climáticas de Sys et al. (1993) | Sin copia en acceso abierto que se pueda citar. |
| Agua útil del suelo (SoilGrids) | SoilGrids 2.0 no publica mapas de retención de agua; no hay umbrales citables para el olivo. |
| Desplazamiento NISAR GUNW | No publicado: requiere referencia y correcciones validadas (ver `unavailable` en el cubo). |

## 7. Recomendaciones

1. **Antes de cualquier uso comercial**, sustituir FAO ECOCROP y FAO GAEZ o
   pedir permiso a FAO.
2. **Confirmar con los autores** de las tablas de la Universidad de Granada el
   uso de sus clases en una aplicación pública.
3. **Mantener las atribuciones** visibles en el mapa y en [`NOTICE`](../NOTICE).
   Si se añade una fuente, añadirla aquí y en NOTICE en el mismo cambio.
4. **NISAR SME2, GCOV y GUNW son productos PROVISIONALES**: su licencia es
   abierta, pero deben presentarse como tales.
