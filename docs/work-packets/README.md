# Work packets de OliveTwin

Este directorio reúne los planes de ejecución del proyecto y el estado de sus
nodos. Los planes son documentos de trabajo: describen el alcance acordado, no
sustituyen al contrato ni al informe de QA.

## Planes

| Plan | Contenido | Estado |
|---|---|---|
| [`OliveTwin_Fase_A_Baseline_GitHub.md`](OliveTwin_Fase_A_Baseline_GitHub.md) | Baseline de GitHub: repositorio, bootstrap Vue, contrato mínimo, gobierno, CI y revisión (nodos A00–A05). | Ejecutado; revisión independiente en [`docs/baseline-review.md`](../baseline-review.md). |
| [`OliveTwin_WP04_WP07_Plan_Actualizado.md`](OliveTwin_WP04_WP07_Plan_Actualizado.md) | Plan v2 de la «demo de la demo»: WP-04 (datos y contrato) y WP-07 (mapa y UI) en paralelo, integración, QA y aceptación. | Ejecutado e integrado; QA en [`docs/qa-results.md`](../qa-results.md). |

> **Nota sobre las imágenes:** los planes referencian diagramas DAG en PNG
> (`OliveTwin_Fase_A_DAG.png` y `OliveTwin_WP04_WP07_DAG.png`). Esos binarios no
> se versionan en este repositorio; los diagramas equivalentes en Mermaid y en
> texto están incluidos en cada plan.

## Fase A — baseline (A00–A05)

| Nodo | Contenido | Estado | Evidencia |
|---|---|---|---|
| A00 | Repositorio y acceso | Hecho | Repositorio privado real verificado en `docs/baseline-review.md`. |
| A01 | Árbol y bootstrap Vue 3 + Vite + TypeScript | Integrado | `frontend/` compila; `npm run build` documentado en la revisión. |
| A02 | Contrato mínimo v1.1.0 y ejemplos | Congelado | [`docs/contract-freeze.md`](../contract-freeze.md) y [`contracts/`](../../contracts/). |
| A03 | Gobierno de Git, agentes y plantilla de PR | Integrado | [`AGENTS.md`](../../AGENTS.md), [`docs/contributing.md`](../contributing.md) y plantilla en `.github/`. |
| A04 | CI y validación de manifiestos | Integrado | Check `ci` en verde y `npm run validate:data` en CI. |
| A05 | Revisión independiente y PR del baseline | PASS con limitaciones | [`docs/baseline-review.md`](../baseline-review.md). La fusión es acto del owner humano. |

## Fase B — WP-04 ∥ WP-07 (demo de la demo)

Interfaces congeladas en [`docs/c0-interfaces.md`](../c0-interfaces.md). Los
nodos PRE00/PRE01/PRE02/C0 del plan v2 quedaron satisfechos por el baseline de
Fase A y por el documento C0; no se repitieron.

### WP-04 — Arquitectura, contratos y datos

| Nodo | Contenido | Estado | Evidencia |
|---|---|---|---|
| WP04-01 | JSON Schema v1.1.0, tipos TypeScript y fixtures | Integrado | `contracts/manifest.schema.json`, `frontend/src/types/manifest.ts`. |
| WP04-02 | Generador y datos de muestra (Jaén y Toledo), manifiesto real vacío | Integrado | `scripts/generate-sample-data.mjs`, `frontend/public/data/`. |
| WP04-03 | Loader de manifiestos con `BASE_URL`, validación y errores | Integrado | `frontend/src/services/`. |
| WP04-04 | Composable de estado `sample`/`real`, selección y cancelación | Integrado | `frontend/src/composables/useOliveTwinData.ts`. |
| WP04-05 | Handoff científico y referencia del contrato | Integrado | [`docs/handoff-science.md`](../handoff-science.md), [`docs/data-contract.md`](../data-contract.md). |

### WP-07 — Frontend, cartografía e interacción

| Nodo | Contenido | Estado | Evidencia |
|---|---|---|---|
| WP07-01 | Mapa Leaflet, PNOA/OSM, España y Canarias | Integrado | `frontend/src/components/OliveMap.vue`. |
| WP07-02 | Zonas, contornos y `fitBounds` desde props | Integrado | `frontend/src/components/StudyZoneMarkers.vue`. |
| WP07-03 | Overlays PNG por `bbox`, opacidad y ciclo de vida | Integrado | `frontend/src/components/ScientificOverlay.vue`. |
| WP07-04 | Panel, selectores, leyenda, procedencia y avisos | Integrado | Componentes de `frontend/src/components/` y `frontend/src/styles/ui.css`. |

### Integración y aceptación

| Nodo | Contenido | Estado | Evidencia |
|---|---|---|---|
| INT01 | Composición final en `App.vue` y cableado props/emits | Integrado | `frontend/src/App.vue`. |
| INT02 | Tests, build, E2E y smoke visual | Completado | [`docs/qa-results.md`](../qa-results.md); specs en `frontend/tests/e2e/`. |
| G2 | Aceptación final con revisión independiente y aprobación humana | **Pendiente** | No existe `docs/acceptance.md`; la aprobación humana no puede sustituirse por un agente. |

## Correcciones documentales posteriores a la QA

| Incidencia | Descripción | Estado |
|---|---|---|
| B-01 | `README.md` y `frontend/README.md` describían la Fase A y negaban el mapa y las capas. | Corregido en la rama de documentación; pendiente de revisión independiente. |
| B-02 | `docs/work-packets/` solo contenía un marcador. | Corregido con este índice y la copia de los dos planes; pendiente de revisión independiente. |

El detalle de ambos bugs está en [`docs/qa-results.md`](../qa-results.md) §6.
