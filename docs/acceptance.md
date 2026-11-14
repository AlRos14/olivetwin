# G2 — Aceptación de la demo OliveTwin

**Fecha:** 2026-11-14 · **Veredicto:** **PASS con limitaciones** (limitaciones científicas y de entorno, no funcionales).
**Revisión independiente:** agente revisor distinto de los implementadores (PASS, 0 bloqueantes; 4 menores de documentación corregidos en esta misma PR).
**Aprobación humana:** responsable de proyecto (`AlRos14`): decisiones de alcance (solo datos reales, línea temporal) y aprobación científica de los datos publicados.

## Qué funciona (verificado en Chromium real y en CI)

- App estática Vue 3 + Vite + TS + Leaflet, sin backend; build normal y bajo subruta `/olivetwin/`.
- Mapa de España con PNOA (por defecto) u OSM, atribuciones visibles y controles España/Canarias.
- Datos **reales** NISAR L3 SME2 (humedad superficial, PROVISIONAL, CRID P05023) en **Jaén** y **Toledo**, 3 fechas cada
  una (2026-06-20, 2026-07-02, 2026-07-14), escala común 0,05–0,40 m³/m³, georreferencia verificada (25/25 píxeles por escena
  en el pipeline; alineación del overlay con su bbox en el navegador, AT-19).
- Línea temporal: slider con anterior/siguiente/reproducir, sin parpadeo; procedencia por fecha (escena, CRID, hora UTC).
- Opacidad, visibilidad, leyenda, procedencia, aviso PROVISIONAL persistente, error explícito ante manifiesto roto o PNG 404.
- Contrato v1.2.0 con validación de schema, semántica y runtime; pipeline `pipelines/nisar/sme2_to_overlay.py` para añadir
  zonas/fechas sin tocar Vue (`docs/handoff-science.md`).

## Evidencia

| Comprobación | Resultado |
|---|---|
| CI (`ci`: validate:data, vitest, build, pytest) | verde en la PR |
| Vitest | 259 tests |
| `validate:data` | 35 comprobaciones |
| Pytest pipeline NISAR | 19 tests |
| E2E Playwright | `docs/qa-results.md`, capturas `docs/qa/real-*.jpg` |

## Limitaciones (explícitas)

- **Científicas:** SME2 PROVISIONAL, no totalmente calibrado; humedad superficial (~5 cm) ≠ necesidad de riego; Jaén
  (ascendente, ~05:23 UTC) y Toledo (descendente, ~19:09 UTC) se observan a distinta hora; la escena del 2026-07-14 tiene
  otra marca de producción (`F_F_J`) y su bajada puede deberse en parte al procesado. Sin banderas de calidad SME2 aplicadas.
- **Fuera de alcance:** NDVI real, SIGPAC, comparador A/B, kg/ha, predicción, consulta por píxel.
- **Entorno:** PNOA y OSM son servicios externos; los E2E usan un harness Playwright externo y no corren en CI.
- **Despliegue:** no se ha publicado en GitHub Pages; la demo se ejecuta con `npm run dev` o `npm run build && npm run preview`.

## Cómo reproducir

```bash
cd frontend && npm ci && npm run validate:data && npm test && npm run build && npm run preview
```
