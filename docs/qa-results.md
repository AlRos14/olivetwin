# QA de la demo OliveTwin — resultados E2E

Resultados de las pruebas de extremo a extremo (Playwright) de la demo con
datos reales NISAR de Jaén y Toledo, y capturas de evidencia en
[`qa/`](qa/). Las instrucciones para reproducirlas están en
[`frontend/tests/e2e/README.md`](../frontend/tests/e2e/README.md).

> La ejecución histórica de la Fase A (modo muestra con datos sintéticos,
> escenarios AT-01…AT-20 y SAMPLE-01…08) se retiró del informe y sus capturas
> se eliminaron el 2026-11-15: describían una interfaz que ya no existe. Sigue
> disponible en el historial de git.

## Estado vigente (2026-11-15)

| Spec | Resultado |
|---|---|
| `app.spec.ts` (10 escenarios: apertura, slider, Toledo, Vista Satelital ↔ Vista General, manifiesto roto, alineación con la rejilla del cubo, Análisis y aptitud, Comparar, móvil, consola y red) | 10 / 10 superados |
| `subpath.spec.ts` (manifiesto, cubo y PNG de datos bajo `/olivetwin/`) | 1 / 1 superado |

Capturas vigentes: `qa/real-01…12` (la `real-12-comparar.jpg` corresponde a la
pestaña Comparar) y `qa/consola-red.json` (sin errores de la aplicación). La
interpretación con IA no forma parte de los E2E porque depende de un modelo
externo; se probó manualmente con Ollama y `gemma3:4b`.

## 1. Re-ejecución 2026-11-14 — demo solo con datos reales (INT-R)

**Nodo:** INT-R (rol R1, integración) · **Rama/worktree:** `b/intreal`
**Alcance:** retirada de los datos de muestra, autoselección de Jaén, línea
temporal de 3 fechas y aviso PROVISIONAL. Los E2E se adaptaron a la capa real.

### 1.1 Comandos y resultados

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

### 1.2 Escenarios E2E

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

### 1.3 Limitaciones de esta reejecución

- El producto mostrado es NISAR L3 SME2 **PROVISIONAL**; no se valida su
  calibración científica en QA, solo la integración y la georreferenciación.
- Jaén se observa en pasada ascendente (~05:23 UTC) y Toledo en descendente
  (~19:09 UTC); la comparación entre zonas incluye la hora del día.
- Los E2E siguen fuera de CI y requieren el harness externo de Playwright.
- La captura móvil es emulación de viewport, no un dispositivo físico.

## 2. Re-ejecución E2E del 2026-11-15 (cubo de análisis v1.3.0)

Harness externo con `@playwright/test@1.65.1` y Chrome Headless Shell 159,
contra `vite preview` (build normal en `:4173` y build con `--base /olivetwin/`
en `:4174`). Specs adaptados al comportamiento actual: Capas arranca con la
humedad del suelo del cubo (10 fechas, imagen calculada en el navegador), un
único desplegable de variables y la pestaña Análisis sin mapa.

| Spec | Resultado |
|---|---|
| `app.spec.ts` (9 escenarios: apertura, slider, Toledo, PNOA↔OSM, manifiesto roto, AT-19 alineación con la rejilla del cubo, Análisis y aptitud, móvil, consola y red) | 9 / 9 superados |
| `subpath.spec.ts` (AT-17, manifiesto, cubo y PNG de datos bajo `/olivetwin/`) | 1 / 1 superado |

Capturas regeneradas en `docs/qa/real-01…09` y nuevas `real-10-analisis.jpg` y
`real-11-aptitud.jpg`; `docs/qa/consola-red.json` sin errores de la aplicación.
La interpretación con IA no forma parte de los E2E (depende de un modelo
externo); se probó manualmente con Ollama y `gemma3:4b`.

