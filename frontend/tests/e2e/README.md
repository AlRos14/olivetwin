# Pruebas E2E de OliveTwin (INT02)

Estas pruebas abren la aplicación real en **Chromium headless** con Playwright,
navegan como una persona y guardan capturas en `docs/qa/`. No se ejecutan con
Vitest: su patrón es `*.spec.ts` y Vitest solo incluye `*.test.ts` / `*.test.mjs`.

## Requisitos

- Node.js 22 o superior (probado con 24.12.0).
- Dependencias del frontend instaladas: `npm ci --prefix frontend`.
- Un harness de Playwright **fuera del repositorio**. Playwright no es una
  dependencia de `frontend/package.json` (decisión de INT02) y no debe añadirse
  sin coordinación con R1.

## Crear el harness

En este entorno el harness vive en:

```text
<scratchpad>/qa-harness
```

```bash
cd <scratchpad>/qa-harness
npm init -y
npm i -D @playwright/test@1.64.0 playwright@1.64.0 pngjs
```

`@playwright/test@1.64.0` usa `chromium-1248`, que ya estaba en
`~/.cache/ms-playwright`; no hizo falta descargar navegadores. Para comprobar la
versión y el lanzamiento:

```bash
npx playwright --version
npx playwright install chromium   # solo si el navegador no está cacheado
```

### Resolución de `@playwright/test` desde los specs

Los specs viven en el repositorio, pero sus dependencias están en el harness.
Node resuelve módulos subiendo por los directorios padre, así que el harness
crea un enlace simbólico **fuera del repo**:

```bash
cd <scratchpad>
ln -sfn qa-harness/node_modules node_modules
```

El enlace está en `<scratchpad>/node_modules`, nunca dentro de
`frontend/`, y no se versiona. `qa-harness/setup.mjs` lo crea de forma
idempotente (`npm run setup` en el harness).

## Configuración

`qa-harness/playwright.config.ts` apunta a `../wt/int02/frontend/tests/e2e` y
define `QA_DOCS_DIR` para que las capturas caigan en `docs/qa/` del repo. La URL
por defecto es `http://localhost:4173` (`vite preview`); se puede cambiar con
`OLIVE_BASE_URL`.

## Ejecutar

1. Compilar y servir la build normal:

   ```bash
   npm ci --prefix frontend
   npm run build --prefix frontend
   npm run preview --prefix frontend -- --port 4173 --strictPort   # en segundo plano
   ```

2. Lanzar los specs (desde el harness):

   ```bash
   cd <scratchpad>/qa-harness
   npx playwright test --config playwright.config.ts
   ```

   El spec `subpath.spec.ts` necesita además:

   ```bash
   npm run build --prefix frontend -- --base /olivetwin/
   npx vite preview --prefix frontend -- --base /olivetwin/ --port 4174 --strictPort
   OLIVE_SUB_URL=http://localhost:4174/olivetwin/ \
     npx playwright test --config playwright.config.ts subpath.spec.ts
   ```

   Al terminar, restaurar la build normal con `npm run build --prefix frontend`.

3. Evidencias: capturas JPEG/PNG en `docs/qa/`, más `docs/qa/consola-red.json`
   con el recuento de errores de consola y peticiones fallidas. El informe
   legible está en `docs/qa-results.md`.

## Notas

- Las teselas PNOA/OSM son servicios externos: sin Internet, AT-04 falla por
  red, no por la aplicación. Las peticiones canceladas (`ERR_ABORTED`) al
  cambiar de vista se cuentan y se ignoran.
- Los specs no modifican código de la aplicación. Para AT-19 el harness
  envuelve `L.Map.prototype.initialize` y expone la instancia real en
  `window.__oliveMap`; así se compara el `<img>` del overlay con
  `map.latLngToContainerPoint(layer.bbox)`.
- Un fallo E2E se documenta en `docs/qa-results.md` con pasos de reproducción y
  severidad. No se corrige desde este nodo (INT02 solo posee pruebas y QA).
