# OliveTwin E2E tests (INT02)

These tests open the real application in **headless Chromium** with Playwright,
navigate like a person and save screenshots in `docs/qa/`. They do not run with
Vitest: their pattern is `*.spec.ts` and Vitest only includes `*.test.ts` / `*.test.mjs`.

The demo publishes **real data only**. Since 2026-11-15 Jaén and Toledo have an
analysis cube (contract v1.3.0) and Layers starts with the cube's soil moisture,
painted in the browser (`data:` image with the cube grid). The
specs verify the auto-selection of Jaén, the single variable dropdown, the
timeline, the zone change, the base maps, the manifest error, the
alignment of the layer with the grid, the Analysis tab (images, change,
charts, zoom with data reading and crop suitability, without calling the
AI model) and the `/olivetwin/` subpath.

## Requirements

- Node.js 22 or later (tested with 24.12.0).
- Frontend dependencies installed: `npm ci --prefix frontend`.
- A Playwright harness **outside the repository**. Playwright is not a
  dependency of `frontend/package.json` (INT02 decision) and must not be added
  without coordinating with R1.

## Creating the harness

In this environment the harness lives in:

```text
<scratchpad>/qa-harness
```

```bash
cd <scratchpad>/qa-harness
npm init -y
npm i -D @playwright/test@1.64.0 playwright@1.64.0 pngjs
```

`@playwright/test@1.64.0` uses `chromium-1248`, which was already in
`~/.cache/ms-playwright`; no browsers had to be downloaded. To check the
version and launch:

```bash
npx playwright --version
npx playwright install chromium   # only if the browser is not cached
```

Re-run of 2026-11-15: `@playwright/test@1.65.1` with
`npx playwright install chromium` (Chrome Headless Shell 159). In that harness
the specs are copied to `qa-harness/tests/` before each run (`sync.sh`)
so they resolve `@playwright/test` from the harness without symbolic links.

### Resolving `@playwright/test` from the specs

Specs live in the repository, but their dependencies are in the harness.
Node resolves modules by walking up parent directories, so the harness
creates a symbolic link **outside the repo**:

```bash
cd <scratchpad>
ln -sfn qa-harness/node_modules node_modules
```

The link is in `<scratchpad>/node_modules`, never inside
`frontend/`, and is not versioned. `qa-harness/setup.mjs` creates it
idempotently (`npm run setup` in the harness).

## Configuration

`qa-harness/playwright.config.ts` points to `frontend/tests/e2e` of the working
worktree and defines `QA_DOCS_DIR` so screenshots land in the repo's
`docs/qa/`. The default URL is `http://localhost:4173` (`vite preview`); it can be
changed with `OLIVE_BASE_URL`. If you change worktree, update `repoDir` in the
harness configuration.

## Running

1. Build and serve the normal build:

   ```bash
   npm ci --prefix frontend
   npm run build --prefix frontend
   npm run preview --prefix frontend -- --port 4173 --strictPort   # in the background
   ```

2. Launch the specs (from the harness):

   ```bash
   cd <scratchpad>/qa-harness
   npx playwright test --config playwright.config.ts
   ```

   The `subpath.spec.ts` spec also needs:

   ```bash
   npm run build --prefix frontend -- --base /olivetwin/
   npx vite preview --prefix frontend -- --base /olivetwin/ --port 4174 --strictPort
   OLIVE_SUB_URL=http://localhost:4174/olivetwin/ \
     npx playwright test --config playwright.config.ts subpath.spec.ts
   ```

   When finished, restore the normal build with `npm run build --prefix frontend`.

3. Evidence: JPEG/PNG screenshots in `docs/qa/`, plus `docs/qa/consola-red.json`
   with the console error count and failed requests. The readable report is in
   `docs/qa-results.md`.

## Notes

- PNOA/OSM tiles are external services. `waitForTiles` is *best-effort*:
  if the provider rate-limits requests, the scenario does not fail; the plan requires that a
  tile failure does not block the application. Requests cancelled
  (`ERR_ABORTED`) when changing view are counted and ignored.
- The specs do not modify application code. For AT-19 the harness
  wraps `L.Map.prototype.initialize` and exposes the real instance in
  `window.__oliveMap`; this is how the real overlay `<img>` is compared with
  `map.latLngToContainerPoint(layer.bbox)`.
- An E2E failure is documented in `docs/qa-results.md` with reproduction steps and
  severity. It is not fixed from this node (INT02 only owns tests and QA).
