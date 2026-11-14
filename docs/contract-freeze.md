# Congelación del contrato mínimo OliveTwin — v1.1.0

**Fecha del acuerdo:** 14 de noviembre de 2026 (Fase A, nodo A02).
**Estado:** congelado para el arranque de Fase B.
**Repositorio:** <https://github.com/AlRos14/olivetwin> (privado, owner `AlRos14`).
**Alcance:** manifiestos de datos, convenciones espaciales y tipos de referencia compartidos por
WP-04 (datos y contratos) y WP-07 (Vue + Leaflet).

Este documento es el acuerdo que permite lanzar ambos work packets en paralelo. No define el
loader, ni la lógica científica, ni componentes de interfaz: eso pertenece a WP-04 y WP-07.

## 1. Relación con el plan de Fase B

Este baseline **sustituye los nodos PRE00, PRE01, PRE02 y C0** del plan de Fase B. Una vez
aprobado GA:

- no se repite el bootstrap del proyecto;
- no se renegocia el contrato básico aquí descrito;
- el orquestador de Fase B marca esos nodos como ya satisfechos y lanza WP-04 y WP-07.

El esquema completo, los fixtures, el generador de PNG y la validación científica siguen
siendo responsabilidad de WP-04.

## 2. Campos y convenciones inmutables

| Objeto | Campos mínimos / convenios | Propiedad del trabajo posterior |
|---|---|---|
| Manifest | `schemaVersion`, `datasetMode` (`sample`/`real`), `appTitle`, `zones[]` | WP-04 completa el schema |
| Zona | `id`, `name`, `bbox`, `layers[]` | WP-04 formaliza JSON Schema; WP-07 visualiza |
| Capa | `id` (`ndvi` o `soil-moisture`), `title`, `kind: image-overlay`, `image`, `bbox`, `imageCrs`, `unit`, `status`, `legend`, `provenance`, `qualityNote` | WP-04 define restricciones/validador; WP-07 usa props |
| BBox | `[west, south, east, north]`, WGS84 EPSG:4326; Leaflet recibe `[[south,west],[north,east]]` | No cambiar orden sin versión mayor |
| Capa PNG | PNG RGBA + `bbox` de imagen, CRS de presentación adecuado, transparencia de nodata | WP-04 genera muestra; científicos producen real |
| Modo | `sample` / `real` en runtime; nunca fallback silencioso | WP-04 estado, WP-07 selector UI |
| Estado de carga | `loading`, `ready`, `empty`, `error` | WP-04 servicio/composable |
| Mapa base | `pnoa` / `osm` | WP-07 |
| Rutas | `image` relativa a `public/`, sin `/` inicial y sin `..`; resolver con `import.meta.env.BASE_URL` | WP-04 carga, WP-07 no crea rutas |
| Procedencia | `synthetic` vs `processed_real`; no presentar datos inventados como NASA real | Aprobación científica cuando haya real |

Notas de aplicación:

- `schemaVersion` debe cumplir `^1\.[0-9]+\.[0-9]+$` y vale `1.1.0` en este baseline.
- `zones: []` es válido en ambos modos; en `real` expresa ausencia deliberada de mediciones,
  no un error que deba rellenarse con ejemplos.
- Las rutas `image` se resuelven como `${import.meta.env.BASE_URL}${image}`. WP-04 entrega la
  URL resuelta; WP-07 no compone rutas.
- `legend` y `provenance` tienen forma mínima en v1.1.0 (`legend`: objeto no vacío;
  `provenance`: objeto con `source` no vacío). WP-04 concretará su interior de forma aditiva.
- La semántica de los valores (rango de `bbox`, unicidad de `id`, coherencia zona/capa,
  existencia del PNG, valores de `imageCrs`) corresponde al validador de WP-04, no al JSON
  Schema mínimo.

## 3. Tipos TypeScript de referencia

```ts
export type DataMode = 'sample' | 'real';
export type BaseMap = 'pnoa' | 'osm';
export type ManifestLoadStatus = 'loading' | 'ready' | 'empty' | 'error';
export type BBox = [west: number, south: number, east: number, north: number];
```

Estos tipos son el contrato de referencia. **`frontend/src/types/manifest.ts` no se crea en
Fase A**: lo materializa WP-04 a partir de este acuerdo y queda como único propietario del
archivo, evitando un segundo módulo competidor. WP-07 importa esos tipos, no los redefine.

## 4. Regla de cambios

1. **Aditivo (minor: 1.2.0, 1.3.0…):** nueva propiedad opcional, nuevo `$def` reutilizable,
   nueva variante que no rompa consumidores existentes o aclaración documental. El JSON
   Schema y este documento se actualizan en el mismo cambio.
2. **Incompatible (major: 2.0.0):** campo obligatorio nuevo, cambio de tipo o de semántica,
   eliminación o renombrado de campo, cambio del orden de `bbox`, o ampliación de un enum que
   los consumidores tratan de forma exhaustiva (`datasetMode`, `status`, `id` de capa).
3. Cambiar el orden de `bbox` o el significado de `sample`/`real` **siempre** es major, sin
   excepciones.
4. Toda ampliación requiere revisión de integración de `contracts/` y actualización de este
   documento. Un cambio no aprobado no se considera contrato.
5. Los manifiestos de ejemplo (`frontend/public/data/{sample,real}/manifest.json`) se
   mantienen válidos frente a la versión vigente del esquema.

## 5. Propiedad

| Ámbito | Owner |
|---|---|
| `contracts/`, `frontend/src/types`, servicios, composables, manifiestos y scripts de datos | **WP-04** |
| `frontend/src/components`, estilos y mapa Leaflet | **WP-07** |
| Owner humano de WP-04 y WP-07 | **pendiente de asignar** |

El owner humano de ambos work packets **no se inventa en este documento**. A la fecha del
acuerdo solo consta verificado `AlRos14` como colaborador del repositorio; los otros cinco
miembros del equipo aún no están identificados. La asignación debe registrarse aquí cuando se
conozca, junto con la persona revisora independiente.

## 6. Verificación de la congelación

Validación local de los dos manifiestos iniciales y de los tres casos negativos con JSON
Schema draft 2020-12 (script temporal fuera del repositorio, no versionado):

```bash
npx -y ajv-cli@5 validate --spec=draft2020 \
  -s contracts/manifest.schema.json \
  -d frontend/public/data/sample/manifest.json \
  -d frontend/public/data/real/manifest.json
```

Casos negativos exigidos:

| Caso | Resultado esperado |
|---|---|
| `datasetMode: "unknown"` | rechazado por `enum` |
| `zones: null` | rechazado por `type: array` |
| sin `schemaVersion` | rechazado por `required` |

Evidencia de la ejecución de A02:

- `sample/manifest.json`: válido.
- `real/manifest.json`: válido.
- `datasetMode: "unknown"`: inválido (`/datasetMode` debe ser igual a uno de los valores del enum).
- `zones: null`: inválido (`/zones` debe ser array).
- sin `schemaVersion`: inválido (falta la propiedad requerida `schemaVersion`).

La automatización en CI pertenece a A04 (`frontend/scripts/validate-data.*` y
`.github/workflows/ci.yml`); WP-04 ampliará el esquema y añadirá casos de prueba semánticos.

## 7. Fuera de alcance de esta congelación

- Lógica de carga, caché o composables (WP-04).
- Generación de PNG, GeoTIFF, HDF5 o datos NISAR (WP-04 / pipeline científico).
- Componentes, estilos, mapa base y overlays Leaflet (WP-07).
- Elección de hosting, `base` de Vite y despliegue (Fase B).
- Científicos de referencia, misiones y productos reales: no se declaran sin evidencia.
