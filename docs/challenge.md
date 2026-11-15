# Reto NASA Space Apps Challenge 2026 — «Dancing with the SARs»

OliveTwin se desarrolla para este reto del NASA Space Apps Challenge 2026:

- **Página oficial del reto:**
  <https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/>

Cualquier persona o agente que trabaje en el repositorio debe tener presente el
reto y priorizar los recursos de esta página. Las bases, requisitos y criterios
de evaluación son los que publique la página oficial; el resumen siguiente es
una referencia de trabajo y no la sustituye.

> **Procedencia:** el enunciado y los recursos los facilitó el equipo a partir
> de la página oficial del reto (registrados el 2026-11-15). La página no pudo
> descargarse automáticamente desde el entorno de trabajo, así que conviene
> contrastarla con la web oficial si cambia. Según la página, pueden añadirse
> más recursos antes del hackatón.

## Enunciado del reto (resumen)

**Reto:** construir una **aplicación interactiva** que use datos de radar de la
misión **NISAR** (NASA-ISRO Synthetic Aperture Radar) para **seguir y
visualizar uno o varios tipos de cambio en la superficie terrestre** en lugares
de todo el mundo. Algunos ejemplos son humedales y llanuras de inundación, pérdida
forestal por deforestación o incendios, cambios en cultivos y su estado,
humedad del suelo, glaciares y hielo marino, y deformación del terreno por
terremotos o subsidencia.

**Contexto técnico que da el enunciado:**

- El SAR es teledetección **activa** en microondas: emite su propio pulso y
  observa de día y de noche y con nubes. «Sintetiza» una antena larga
  combinando adquisiciones sucesivas para ganar resolución espacial.
- La señal radar es sensible sobre todo a la **rugosidad** y a la **constante
  dieléctrica**. La retrodispersión (*backscatter*) en distintas
  **polarizaciones** informa sobre estructura, geometría y material; la alta
  constante dieléctrica del agua resalta masas de agua, inundaciones y
  **humedad del suelo**. El SAR también mide desplazamientos de escala
  centimétrica (terremotos, subsidencia).

**Resultado deseado:** una solución **open source** y fácil de usar que traduzca
observaciones radar complejas en información útil para científicos, gestores,
educadores, responsables de decisiones y público general, mostrando los patrones
y ritmos de la superficie en distintos pasos de tiempo. Se animan
visualizaciones como mapas interactivos de detección de cambios, animaciones de
series temporales o dashboards.

**Pasos que propone el reto:**

1. Elegir una zona de estudio interesante.
2. Descargar datos NISAR de libre acceso con los recursos listados, y si se
   quiere datos complementarios (imágenes ópticas, capas SIG) para
   contextualizar.
3. Presentar los hallazgos en un medio digital interactivo (informe, vídeo,
   presentación, *story map*…) y **formular hipótesis sobre los factores
   físicos** detrás de lo que se ve (o no se ve) en los datos SAR: qué
   polarizaciones resaltan los cambios y qué aplicaciones futuras de NISAR
   son posibles.

**Consideraciones opcionales** (no obligatorias):

- Analizar NISAR con distintas polarizaciones o frecuencias (también de otros
  sensores), varias fechas para una serie temporal y datos auxiliares
  (población, tipo de vegetación…).
- Mostrar cómo los factores humanos (agricultura, industria…) afectan a los
  recursos naturales.
- Contar una historia convincente con visualizaciones de datos.
- Aportar contexto y relatos personales si se conoce la zona de estudio.
- Hacer interactivo el resumen (deslizadores de imagen, mapas web…).

## Encaje de OliveTwin con el reto

Comparación con el estado actual del repositorio (ver [`README.md`](../README.md)).
Las líneas futuras son opciones, no compromisos ni resultados.

| Elemento del reto | Estado en OliveTwin |
|---|---|
| Aplicación interactiva con datos NISAR | Cubierto: mapa web con NISAR SME2, GCOV y GUNW; pestañas Capas, Análisis, Gemelos e Historia. |
| Tipo de cambio en superficie | Humedad superficial del suelo en zonas agrícolas (olivar). |
| Zona de estudio | Jaén y Toledo (España). |
| Serie temporal | Cubierto: ~10 fechas NISAR y 11 de Sentinel-2 por zona (jun–oct 2026), gráficas con lluvia diaria y mapa de cambio entre dos fechas. |
| Datos complementarios (ópticos, SIG) | Cubierto: NDVI/NDMI de Sentinel-2, elevación y pendiente (Copernicus DEM), suelo (SoilGrids), clima (Open-Meteo/ERA5) y SMAP de contraste. |
| Polarizaciones / retrodispersión | Cubierto: GCOV HH, HV y razón HV−HH, y coherencia InSAR de un par GUNW. El desplazamiento InSAR no se publica (sin correcciones validadas). |
| Factores humanos (agricultura) | Es el eje del proyecto (olivares). Mapas de aptitud por cultivo (olivo, almendro, trigo de secano) con requisitos FAO ECOCROP; sin validar con cosechas. |
| Hipótesis sobre factores físicos | Cubierto: pestaña Historia (formuladas como preguntas) e interpretación con un modelo de lenguaje a partir de las estadísticas calculadas (cambio en el tiempo, causas posibles e implicaciones para el cultivo). |
| Solución open source | Cubierto: código público bajo [Apache-2.0](../LICENSE) (licencia OSI, atribución obligatoria mediante [`NOTICE`](../NOTICE)). |
| Presentación / storytelling | Parcial: relato interactivo en la app (Historia + Gemelos). Falta el vídeo o las diapositivas de entrega. |

## Aviso de NASA

> *NASA does not endorse any non-U.S. Government entity and is not responsible
> for information contained on non-U.S. Government websites. For non-U.S.
> Government websites, participants must comply with any data use parameters of
> that specific website.*

## Recursos de NASA

| Recurso | Para qué sirve |
|---|---|
| [NASA Earthdata Search](https://search.earthdata.nasa.gov/search) | Descubrir, buscar, comparar, visualizar y acceder a los datos de ciencias de la Tierra de NASA. |
| [ASF Data Search Vertex](https://search.asf.alaska.edu/) | Archivo de NASA de datos SAR, operado por la Alaska Satellite Facility (ASF) para el proyecto ESDIS. |
| [NISAR Data User Guide](https://nisar-docs.asf.alaska.edu/) | Guía de ASF para acceder a datos NISAR y trabajar con ellos. |
| [Intro to Remote Sensing](https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/remote-sensing) | Fundamentos de teledetección: instrumentos, tipos de resolución y procesamiento. |
| [Intro to Synthetic Aperture Radar (SAR)](https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar) | Fundamentos de SAR: frecuencia y longitud de onda, polarización y mecanismos de dispersión. |
| [NASA ARSET Trainings](https://appliedsciences.nasa.gov/get-involved/training) | Formación para principiantes y avanzados (agricultura, recursos hídricos, desastres…), con material introductorio de teledetección, SAR y NISAR en inglés y español. |
| [NISAR StoryMaps](https://nisar.jpl.nasa.gov/applications/arcgis-storymaps/) | StoryMaps interactivos sobre aplicaciones SAR: inundaciones, incendios, subsidencia, vertidos de petróleo y glaciares. |
| [NISAR Applications White Papers](https://nisar.jpl.nasa.gov/applications/societal-benefit/) | Resúmenes de 2 páginas sobre aplicaciones de NISAR con beneficio social. |
| [UAVSAR Postcards](https://uavsar.jpl.nasa.gov/education/postcards.html) | Composiciones en falso color de datos UAVSAR aerotransportados. |

## Recursos de agencias espaciales socias

### CSA (Agencia Espacial Canadiense)

| Recurso | Para qué sirve |
|---|---|
| [RADARSAT Constellation Mission (RCM) — Data](https://donnees-data.asc-csa.gc.ca/en/dataset/rcm) | Constelación canadiense de tres satélites radar (día/noche, cualquier meteorología); incluye monitorización de ecosistemas y agricultura. |
| [Synthetic Aperture Radar Python Tutorial](https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial) | Tutorial para trabajar con imágenes SAR con Python y QGIS: acceso y visualización. |
| [RADARSAT-1 — Data](https://donnees-data.asc-csa.gc.ca/en/dataset/radarsat1) | Archivo canadiense de RADARSAT-1 (lanzado en 1995), publicado con licencia abierta. |

### CONAE (Comisión Nacional de Actividades Espaciales, Argentina)

| Recurso | Para qué sirve |
|---|---|
| [SAOCOM Catalogue](https://catalogos.conae.gov.ar/catalogo/catalogoSatSaocomInfo.html) | Catálogo e información de la misión SAR SAOCOM: registro, descarga y tutoriales de procesamiento. |
| [SAOCOM Catalogue Registration](https://www.argentina.gob.ar/noticias/la-informacion-saocom-cada-vez-mas-accesible) | Protocolo de registro para acceder al catálogo con el perfil ONE CLICK. |

## Otros recursos: política de licencias

La auditoría de las fuentes y licencias que usa OliveTwin está en
[`data-sources.md`](data-sources.md).

Además de los recursos anteriores, **se puede usar cualquier recurso (datos,
software, modelos o documentación) que sea open source / datos abiertos o cuya
licencia permita su uso en investigación**.

- **Permitido:** licencias abiertas (por ejemplo, de software libre o de datos
  abiertos) y licencias que autoricen expresamente el uso en investigación.
- **No permitido:** recursos sujetos a **licencia comercial** (de pago o
  propietaria que no autorice el uso en investigación).
- Ante la duda sobre una licencia, no se incorpora el recurso hasta aclararlo
  con el owner del repositorio.

Esta política no relaja las reglas del repositorio
([`AGENTS.md`](../AGENTS.md) y [`docs/contributing.md`](contributing.md)):

- cada recurso incorporado debe tener **licencia y procedencia verificables**,
  y su atribución cuando la licencia la exija;
- en sitios web que no son del Gobierno de EE. UU. hay que cumplir los
  parámetros de uso de datos de ese sitio (aviso de NASA);
- las cuentas o registros que exijan algunos catálogos (por ejemplo, SAOCOM
  ONE CLICK o Earthdata Login) son personales: **no se versionan credenciales,
  tokens ni secretos**;
- no se versionan HDF5, GeoTIFF, NetCDF ni otros binarios científicos grandes;
- los límites científicos del proyecto siguen vigentes (el radar no mide
  producción, el NDVI no es NISAR y la humedad superficial no es riego).
