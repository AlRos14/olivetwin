# QA de la demo OliveTwin — resultados E2E y de aceptación

**Nodo:** INT02 (rol R6, QA y documentación)
**Fecha:** 2026-11-14
**Rama/worktree:** `b/int02`
**Alcance:** aplicación completa integrada (WP-04 + WP-07 + INT01), sin modificar
código de la aplicación.
**Veredicto global:** **PASS con limitaciones de documentación** (AT-20 parcial).
Todos los escenarios funcionales AT-01…AT-19 y SAMPLE-01…SAMPLE-08 pasan en
Chromium real. La única salvedad funcional es que el modo real no tiene datos
reales: se valida con un fixture contractual servido solo en pruebas.

> Los datos de muestra son sintéticos y están marcados como tales. Nada de este
> informe demuestra que el radar mida producción, que el NDVI sea NISAR o que la
> humedad superficial equivalga a riego.

> **Actualización 2026-11-14 (INT-R):** las secciones 1–7 documentan la
> ejecución histórica de INT02 con el modo muestra. La demo vigente **solo usa
> datos reales NISAR SME2** de Jaén y Toledo; los escenarios de muestra se
> retiraron y la re-ejecución completa está en la **sección 8**.

## 1. Entorno

| Elemento | Valor |
|---|---|
| Sistema | Linux (worktree de Git) |
| Node.js / npm | 24.12.0 / 11.18.0 |
| Vue | 3.5.45 |
| Leaflet | 1.9.4 |
| Vite | 8.3.8 |
| Vitest | 5.1.0 |
| Playwright (`@playwright/test`) | 1.64.0 |
| Chromium | 156.0.8078.80 (headless, cacheado en `~/.cache/ms-playwright`) |
| Viewports | 1366×900 (escritorio) y 390×844 (móvil emulado) |
| Servidor | `vite preview` en `http://localhost:4173`; subruta en `http://localhost:4174/olivetwin/` |
| Red | Internet disponible; teselas PNOA y OSM son servicios externos |

El harness de Playwright es **externo al repositorio** (no se añadió ninguna
dependencia a `frontend/package.json`). Instrucciones reproducibles:
[`frontend/tests/e2e/README.md`](../frontend/tests/e2e/README.md).

## 2. Comandos ejecutados y resultado

| Comando | Resultado |
|---|---|
| `npm ci --prefix frontend` | OK (lockfile versionado) |
| `npm run build --prefix frontend` | OK; `vue-tsc -b` + `dist/` (JS 398,38 kB, CSS 25,46 kB) |
| `npx vite preview --port 4173 --strictPort` | OK; `GET /` 200, manifiesto 200, PNG 200 |
| `npm run dev -- --port 5231 --strictPort` | OK; `GET /` 200 (5173/5180 estaban ocupados por otros worktrees) |
| `npm run validate:data --prefix frontend` | OK; **27 comprobaciones superadas, 0 fallos** |
| `npm test --prefix frontend` | OK; **18 archivos, 209 tests** |
| `npx playwright test app.spec.ts` | OK; **19/19 tests** (`docs/qa/e2e-run.txt`) |
| `npm run build --prefix frontend -- --base /olivetwin/` | OK |
| `npx vite preview --base /olivetwin/ --port 4174 --strictPort` | OK; `/olivetwin/` 200 |
| `npx playwright test subpath.spec.ts` | OK; **1/1 test** (`docs/qa/e2e-subpath-run.txt`) |
| Restauración `npm run build --prefix frontend` | OK; la build normal vuelve a servirse |

## 3. Escenarios AT-01…AT-20

| ID | Escenario | Resultado | Evidencia |
|---|---|---|---|
| AT-01 | `npm run dev` arranca sin backend | **PASS** | `GET http://localhost:5231/` → 200 con HTML de la SPA. Puerto 5173 ocupado por otro worktree; no es un fallo del producto. |
| AT-02 | `npm run build` + `npm run preview` | **PASS** | Build OK; preview 4173 → 200; `/data/sample/manifest.json` y `/data/sample/zones/jaen-demo/ndvi.png` → 200. |
| AT-03 | Abrir aplicación: España, zonas demo, Canarias | **PASS** | Centro inicial 39,97 / −2,65, zoom 6; Jaén y Toledo en el selector; 2 contornos; aviso «DATOS SIMULADOS». Botón «Canarias» lleva a lat < 32 y «España» vuelve. `docs/qa/at-03-inicio.jpg`, `at-03-canarias.jpg`. |
| AT-04 | Alternar PNOA ↔ OSM | **PASS** | Peticiones observadas a `tms-pnoa-ma.idee.es` y `tile.openstreetmap.org`. Atribución «Instituto Geográfico Nacional» ↔ «© OpenStreetMap contributors»; las teselas del otro proveedor desaparecen del DOM. `at-04-pnoa.jpg`, `at-04-osm.jpg`. |
| AT-05 | Seleccionar Jaén (`fitBounds`) | **PASS** | Centro 37,795 / −3,735 = centro del bbox; zoom 12; overlay `jaen-demo/ndvi.png`. `at-05-jaen.jpg`. |
| AT-06 | NDVI y humedad distintas | **PASS** | `ndvi.png` ↔ `moisture.png`; leyenda `Unidad: index` ↔ `Unidad: m³/m³`, títulos y paradas distintas. `at-06-ndvi.jpg`, `at-06-humedad.jpg`. |
| AT-07 | Opacidad 0 / 50 / 100 % | **PASS** | `style.opacity` = `0`, `0.5`, `1`; misma imagen y una sola navegación (`performance.navigation` = 1). `at-07-opacidad-{0,50,100}.jpg`. |
| AT-08 | Cambiar a Toledo | **PASS** | Queda **1** overlay con `toledo-demo/ndvi.png`; el de Jaén desaparece; centro en el bbox de Toledo. `at-08-toledo.jpg`. |
| AT-09 | Navegar fuera de cobertura | **PASS** | Con OSM y `setView(0, 0, 4)` el overlay sigue siendo 1 y georreferenciado, pero su rectángulo queda completamente fuera del viewport; no se pinta en otras zonas. `at-09-fuera-de-cobertura.jpg`. |
| AT-10 | Modo real vacío | **PASS** | Texto «Todavía no hay zonas con datos científicos reales»; 0 overlays, 0 contornos SVG, selector deshabilitado, sin aviso de simulados y mapa base intacto. `at-10-real-vacio.jpg`. |
| AT-11 | Volver a muestra | **PASS** | Jaén/Toledo, 2 contornos y «DATOS SIMULADOS» restablecidos; selección vacía. `at-11-vuelta-muestra.jpg`. |
| AT-12 | PNG 404 | **PASS** | Con `page.route` el PNG responde 404: aparece «La imagen de la capa no está disponible», el mapa base sigue con teselas y los contornos permanecen. `at-12-png-404.jpg`. |
| AT-12 | Manifiesto real roto | **PASS** | JSON inválido interceptado: «No se han podido cargar los datos» + «no es un JSON válido»; modo real sin zonas, sin fallback a muestra y sin «DATOS SIMULADOS». `at-12-manifiesto-roto.jpg`. |
| AT-13 | Cambio rápido sample→real→sample | **PASS** | Respuesta real retrasada 900 ms; tras 1,6 s gana `sample`: Jaén/Toledo, 2 contornos, aviso simulado, sin error. `at-13-cambio-rapido.jpg`. |
| AT-14 | JSON Schema y archivos referenciados | **PASS** | `npm run validate:data`: 27 comprobaciones (válidos, inválidos, rutas inseguras, modo/status, bbox, leyenda). `npm test`: 209 tests. |
| AT-15 | Tercera zona solo con JSON | **PASS** | `page.route` añade `tercera-demo` al manifiesto de muestra; aparecen 4 opciones y 3 contornos, y su overlay se pinta sin tocar Vue. `at-15-tercera-zona.jpg`. |
| AT-16 | Zona real válida (fixture contractual) | **PASS (fixture)** | Solo en modo real aparece `qa-fixture-real` con `processed_real`, fecha 19/10/2026 y escena `QA-FIXTURE-NO-REAL`; no contamina el modo muestra. No hay ningún dato real publicado. `at-16-zona-real-fixture.jpg`. |
| AT-17 | Build bajo `/olivetwin/` | **PASS** | HTML, JS/CSS, manifiesto y PNG se piden bajo `/olivetwin/` con 200; overlay con `src="/olivetwin/data/sample/zones/jaen-demo/ndvi.png"`. `at-17-subruta.jpg`. |
| AT-18 | Escritorio + móvil + teclado | **PASS** | 390×844 sin desbordamiento horizontal (0 px), mapa y panel visibles (`at-18-movil.jpg`). Tab llega al grupo de modo; flecha derecha pasa a real y flecha izquierda vuelve a muestra (`at-18-teclado.png`). |
| AT-19 | PNG RGBA y posición por `bbox` | **PASS** | `img.olive-scientific-overlay` = (178, 100, 848, 800) px; proyección `latLngToContainerPoint` del `layer.bbox` = (178, 100, 848, 800), desviación 0 px (tolerancia 2 px). PNG 384×401 con 6.720 píxeles alpha 0 y 147.264 opacos. `at-19-overlay-bbox.jpg`. |
| AT-20 | README, QA y handoff sin contexto oral | **PARCIAL** | `docs/handoff-science.md`, `docs/data-contract.md`, `docs/c0-interfaces.md` y este informe permiten reproducir la demo y añadir una zona. Pero `README.md` y `frontend/README.md` siguen describiendo la Fase A (ver bug B-01). |

## 4. Escenarios SAMPLE-01…SAMPLE-08

| ID | Escenario | Resultado | Evidencia |
|---|---|---|---|
| SAMPLE-01 | Abrir sin datos reales | **PASS** | Jaén y Toledo visibles, capas y leyendas en muestra; «DATOS SIMULADOS». AT-03/AT-05 y tests unitarios del composable. |
| SAMPLE-02 | Modo real vacío | **PASS** | AT-10: mensaje explícito, 0 overlays sample, mapa base intacto. |
| SAMPLE-03 | Volver a muestra | **PASS** | AT-11: zonas, capas y etiqueta simulada recuperadas. |
| SAMPLE-04 | Manifiesto real inválido | **PASS** | AT-12: error visible, sin fallback engañoso. |
| SAMPLE-05 | Cambio rápido sample→real→sample | **PASS** | AT-13: solo queda el estado final. |
| SAMPLE-06 | Añadir zona real válida | **PASS (fixture)** | AT-16: aparece solo en modo real; no se hereda ninguna capa de muestra. |
| SAMPLE-07 | PNOA↔OSM con overlay activo | **PASS** | Misma URL de overlay y opacidad 0,5 tras cambiar a OSM. `sample-07-osm-con-overlay.jpg`. |
| SAMPLE-08 | Capa sintética sin fecha | **PASS** | «Fecha no disponible»; no aparece ninguna fecha inventada. `sample-08-fecha-no-disponible.png`. |

SAMPLE-01…06 también están cubiertos por pruebas unitarias de Vitest
(`useOliveTwinData.test.ts`, `manifestService.test.ts`,
`manifestSemantics.test.ts`, entre otras).

## 5. Consola, red y accesibilidad

`docs/qa/consola-red.json` (última ejecución):

```json
{
  "erroresPagina": [],
  "consolaErroresOavisos": [],
  "peticionesFallidas": 69,
  "peticionesFallidasDeTeselas": 69,
  "peticionesFallidasDeLaApp": [],
  "respuestasHttp4xx5xx": []
}
```

- **0 errores de página**, **0 errores/avisos de consola**.
- **0 peticiones fallidas de la aplicación**: manifiestos y PNG responden 200.
- Las 69 peticiones fallidas son teselas externas canceladas (`net::ERR_ABORTED`)
  al cambiar de mapa base o de encuadre. Es el comportamiento esperado de
  Leaflet y no ensucia la consola.
- **0 respuestas HTTP 4xx/5xx** en toda la sesión instrumentada.

Accesibilidad comprobada: `role="radiogroup"` con radios nativos, `<select>`
etiquetado, slider con `aria-valuetext`, avisos con `role="alert"`/`role="status"`,
atribuciones enlazadas y navegación completa por teclado hasta el modo de datos.

## 6. Bugs y limitaciones encontrados

No se corrigió ninguno: INT02 no es owner del código ni de los README.

### B-01 · README desactualizado (severidad media)

- **Archivos:** `README.md` (estado y limitaciones) y `frontend/README.md`
  (descripción y estructura).
- **Qué ocurre:** afirman que el proyecto está en «Fase A (baseline)», que «los
  manifiestos existen vacíos a propósito: todavía no se muestran capas», que
  «Fase A no incluye mapa, PNG de capas» y que Leaflet no está instalado. La
  aplicación ya muestra mapa, zonas y capas.
- **Reproducción:** leer `README.md` líneas 11-13 y 153, y
  `frontend/README.md` líneas 6-10 y 48-49; comparar con `frontend/package.json`
  (`leaflet`, `vue`) y con la demo.
- **Impacto:** un agente o persona nueva puede creer que la demo no existe y
  duplicar trabajo; es la causa de que AT-20 sea PARCIAL.
- **Corrección sugerida (owner de integración):** actualizar el estado a Fase B,
  enlazar este informe y `frontend/tests/e2e/README.md`, y eliminar las frases
  «sin mapa / sin Leaflet / manifiestos vacíos».

### B-02 · `docs/work-packets/` sin documentación (severidad baja)

- Solo contiene `.gitkeep`, aunque `AGENTS.md` y `README.md` lo presentan como
  el lugar de los work packets. No bloquea la demo; conviene enlazar los briefs
  o retirar la promesa.

### Limitaciones aceptadas

- **Dependencia de red:** PNOA y OSM son externos. Si PNOA falla, AT-04 puede
  fallar por red; la interfaz ya ofrece cambiar a OSM y muestra el aviso.
- **Fixtures reales:** AT-16 usa `page.route` y una URL `example.org` reservada.
  No existe ningún `processed_real` en `frontend/public/data/real/`; no se
  presenta como observación NASA ni como resultado científico.
- **Harness externo:** Playwright no está en `package.json` (por indicación de
  INT02) y las pruebas E2E no se ejecutan en CI; el README del harness explica
  cómo recrearlo.
- **Capturas:** JPEG calidad 70 para mantener cada archivo < 500 KB; no hay
  comparación visual por píxeles, solo aserciones funcionales + evidencia.
- **Móvil:** emulación de viewport en Chromium, no dispositivo físico.
- **AT-09:** la capa no puede pintarse fuera de `layer.bbox` por construcción
  (`L.imageOverlay` con bounds); la prueba confirma que al salir de la zona el
  raster queda fuera del viewport y no se duplica.

## 7. Evidencias

- 26 capturas en `docs/qa/` (JPEG/PNG, todas < 500 KB).
- `docs/qa/e2e-run.txt`: 19/19 E2E.
- `docs/qa/e2e-subpath-run.txt`: 1/1 E2E de subruta.
- `docs/qa/consola-red.json`: consola y red.
- Specs: `frontend/tests/e2e/app.spec.ts`, `subpath.spec.ts`, `support.ts`.
- Instrucciones: `frontend/tests/e2e/README.md`.

## 8. Re-ejecución 2026-11-14 — demo solo con datos reales (INT-R)

**Nodo:** INT-R (rol R1, integración) · **Rama/worktree:** `b/intreal`
**Alcance:** retirada de los datos de muestra, autoselección de Jaén, línea
temporal de 3 fechas y aviso PROVISIONAL. Los E2E se adaptaron a la capa real.

### 8.1 Comandos y resultados

| Comando | Resultado |
|---|---|
| `npm ci --prefix frontend` | OK (140 paquetes; avisos `EBADENGINE` de dependencias, sin error). |
| `npm run validate:data --prefix frontend` | **OK — 35 comprobaciones, 0 fallos**: `sample/manifest.json` omitido por opcional y `real/manifest.json` válido con sus 6 PNG. |
| `npm test --prefix frontend` | **OK — 18 archivos, 259 tests**. |
| `npm run build --prefix frontend` | OK; `vue-tsc -b` + `vite build` (JS 409,00 kB, CSS 27,78 kB). |
| `npm run build --prefix frontend -- --base /olivetwin/` | OK; build bajo subruta generada. |
| `npx playwright test app.spec.ts` | **OK — 8/8** con el harness externo (`scratchpad/qa-harness`, Playwright 1.64.0). |
| `npx playwright test subpath.spec.ts` | **OK — 1/1** con `OLIVE_SUB_URL=http://localhost:4174/olivetwin/`. |
| Restauración `npm run build --prefix frontend` | OK; `dist/` vuelve a la base normal. |

### 8.2 Escenarios E2E vigentes

| Escenario | Resultado | Evidencia |
|---|---|---|
| Abrir → Jaén autoseleccionada, overlay y slider de 3 fechas; sin «DATOS SIMULADOS» | **PASS** | `docs/qa/real-01-jaen.jpg` |
| Mover el slider cambia `src` sin recrear el `<img>` (mismo elemento); reproducir avanza | **PASS** | `docs/qa/real-02-slider-primer-paso.jpg`, `real-03-reproduccion.jpg` |
| Cambiar a Toledo reinicia al último paso y mantiene un solo overlay | **PASS** | `docs/qa/real-04-toledo.jpg` |
| PNOA ↔ OSM conserva overlay, opacidad y la misma imagen | **PASS** | `docs/qa/real-05-osm-overlay.jpg` |
| Manifiesto real roto ⇒ error visible, sin zonas ni overlay | **PASS** | `docs/qa/real-06-json-roto.jpg` |
| AT-19 · overlay alineado con el `bbox` real y PNG con transparencia | **PASS** | `docs/qa/real-07-overlay-bbox.jpg` |
| Móvil 390×844: la línea temporal vive dentro del panel y no hay desbordamiento | **PASS** | `docs/qa/real-08-movil.jpg` |
| AT-17 · build bajo `/olivetwin/`: manifiesto, PNG, overlay y slider bajo la subruta | **PASS** | `docs/qa/real-09-subruta.jpg` |
| Consola y red: sin errores JS ni respuestas 4xx/5xx de la aplicación | **PASS** | `docs/qa/consola-red.json` |

Las capturas están en JPEG calidad 70 y pesan menos de 500 KB. Las teselas PNOA
y OSM son externas: la espera de teselas es *best-effort* y un fallo de red no
convierte en fallo de la aplicación. El informe de consola registra solo
peticiones de teselas canceladas, no errores de la app.

### 8.3 Limitaciones de esta reejecución

- El producto mostrado es NISAR L3 SME2 **PROVISIONAL**; no se valida su
  calibración científica en QA, solo la integración y la georreferenciación.
- Jaén se observa en pasada ascendente (~05:23 UTC) y Toledo en descendente
  (~19:09 UTC); la comparación entre zonas incluye la hora del día.
- Los E2E siguen fuera de CI y requieren el harness externo de Playwright.
- La captura móvil es emulación de viewport, no un dispositivo físico.
