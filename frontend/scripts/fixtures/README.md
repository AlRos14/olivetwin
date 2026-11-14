# Fixtures del validador de datos (A04)

Casos de auto-test que ejecuta `npm run validate:data`. El script los descubre
por carpeta y por extensión `.json`; no hay una lista codificada de nombres.

## `valid/`

Deben validar contra `contracts/manifest.schema.json`.

| Fixture | Qué cubre |
|---|---|
| `sample-empty.json` | Manifiesto `sample` con `zones: []` (estado real de Fase A). |
| `real-empty.json` | Manifiesto `real` con `zones: []`; el modo vacío es válido. |
| `sample-plan-4.3.json` | Ejemplo completo de la sección 4.3 del plan v2 (zona, capa NDVI, leyenda de tres clases, procedencia sintética). |

## `invalid/`

Deben ser rechazados por el esquema. El JSON tiene que parsear: si un fixture
estuviera mal formado, el script lo reporta como error del propio fixture.

| Fixture | Error que representa |
|---|---|
| `unknown-dataset-mode.json` | `datasetMode: "unknown"` fuera del enum `sample`/`real`. |
| `zones-null.json` | `zones` no es un array. |
| `missing-schema-version.json` | Falta `schemaVersion`, que es obligatorio. |
| `layer-legend-object.json` | `legend` es un objeto en vez de la lista ordenada `{value, color, label}`. |

Los fixtures son material de prueba: no son datos publicados ni observaciones.
El fixture `sample-plan-4.3.json` conserva los avisos del plan (ubicación
ilustrativa, `status: synthetic`, nota de calidad) y **no** se sirve desde
`frontend/public/data/`.
