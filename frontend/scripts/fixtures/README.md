# Fixtures del validador de datos (A04 + WP04-01)

Casos de auto-test que ejecutan `npm run validate:data` y
`frontend/src/types/contract.test.ts`. El script los descubre por carpeta y por
extensión `.json`; no hay una lista codificada de nombres.

Los fixtures son material contractual de prueba: **no son observaciones** ni se
sirven desde `frontend/public/data/`. La comprobación de existencia/alfa del PNG
se desactiva para ellos; el esquema y la validación semántica sí se aplican.

## `valid/`

Deben validar contra `contracts/manifest.schema.json` y las reglas semánticas.

| Fixture | Qué cubre |
|---|---|
| `sample-empty.json` | Manifiesto `sample` con `zones: []` (estado real de Fase A). |
| `real-empty.json` | Manifiesto `real` con `zones: []`; el modo vacío es válido. |
| `sample-plan-4.3.json` | Ejemplo completo de la sección 4.3 del plan v2 (zona, capa NDVI, leyenda de tres clases, procedencia sintética). |
| `real-with-processed-real.json` | Zona `real` con una capa `processed_real` y `provenance` completa (fecha, escena y URL). Es un **fixture contractual** para AT-16: no debe publicarse en `data/real/` ni presentarse como dato científico. |
| `sample-with-timesteps.json` | Manifiesto `sample` v1.2.0 con tres pasos temporales ordenados, el último igual a `layer.image`/`bbox` y `provenance` parcial en un paso. |
| `real-with-timesteps.json` | Manifiesto `real` v1.2.0 con `processed_real` y procedencia efectiva completa en cada paso. Fixture contractual; no es una observación real. |

## `invalid/`

Deben ser rechazados por el esquema o por la validación semántica. El JSON tiene
que parsear: si un fixture estuviera mal formado, el script lo reporta como
error del propio fixture.

| Fixture | Error que representa |
|---|---|
| `unknown-dataset-mode.json` | `datasetMode: "unknown"` fuera del enum `sample`/`real`. |
| `zones-null.json` | `zones` no es un array. |
| `missing-schema-version.json` | Falta `schemaVersion`, que es obligatorio. |
| `layer-legend-object.json` | `legend` es un objeto en vez de la lista ordenada `{value, color, label}`. |
| `status-processed-real-in-sample.json` | Modo `sample` con una capa `processed_real`. |
| `status-synthetic-in-real.json` | Modo `real` con una capa `synthetic`. |
| `bbox-inverted.json` | `zone.bbox` con west ≥ east; también invalida la contención de la capa. |
| `layer-outside-zone.json` | `layer.bbox` fuera de `zone.bbox` más allá de la tolerancia de 0.01°. |
| `image-absolute-path.json` | Ruta `image` con `/` inicial (`/x.png`). |
| `image-parent-traversal.json` | Ruta `image` con `..` (`../x.png`). |
| `image-percent-encoded.json` | Ruta `image` con codificación porcentual (`%2e%2e`, que el navegador normaliza como `..`). |
| `image-external-url.json` | URL externa en `image` (`https://x/y.png`). |
| `acquisition-date-impossible.json` | `provenance.acquisitionDate` con una fecha imposible (`2026-13-45`). |
| `image-crs-unsupported.json` | `imageCrs` distinto de `EPSG:3857`. |
| `image-wrong-mode-directory.json` | `image` de `real` referenciada desde un manifiesto `sample`. |
| `duplicate-zone-ids.json` | Dos zonas con el mismo `id`. |
| `legend-unordered.json` | Paradas de leyenda no ordenadas por `value`. |
| `legend-single-stop.json` | Leyenda con una sola parada (mínimo: dos). |
| `range-inverted.json` | `range` con `min` ≥ `max`. |
| `zone-id-not-kebab.json` | `id` de zona que no cumple kebab-case (`Jaen_Demo`). |
| `timesteps-unordered.json` | `timeSteps` con fechas no crecientes. |
| `timesteps-duplicate-date.json` | Dos pasos con la misma `date`. |
| `timesteps-last-step-mismatch.json` | `layer.image` no coincide con el `image` del último paso. |
| `timestep-outside-zone.json` | Un paso intermedio con `bbox` fuera de `zone.bbox`. |
| `timesteps-processed-real-step-missing-scene.json` | `processed_real` con un paso cuya procedencia efectiva deja `sceneId` a `null`. |
| `timesteps-schema-version-1.1.0.json` | `timeSteps` declarados con `schemaVersion: "1.1.0"` en vez de `"1.2.0"`. |
