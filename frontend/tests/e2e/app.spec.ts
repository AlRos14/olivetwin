/**
 * Pruebas E2E de la demo OliveTwin sobre `vite preview` (INT02).
 *
 * Cada test abre la aplicación real, navega como una persona y captura la
 * evidencia en `docs/qa/`. Los escenarios corresponden al checklist AT-01..AT-20
 * y SAMPLE-01..SAMPLE-08 del plan de Fase B. AT-01, AT-02 y AT-14 son comandos
 * de consola y se documentan en `docs/qa-results.md`; AT-17 tiene su propio
 * spec porque requiere una build con `--base /olivetwin/` en otro puerto.
 *
 * No modifica código de la aplicación. Los fallos se documentan, no se corrigen
 * desde aquí.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import {
  BASE_URL,
  capture,
  captureElement,
  clickLabel,
  docsQaDir,
  getMap,
  openApp,
  panMap,
  readSampleManifest,
  repoDir,
  selectZone,
  setOpacity,
  waitForOverlay,
  waitForTiles,
} from './support'

const SAMPLE = readSampleManifest()
const JAEN = SAMPLE.zones.find((zone) => zone.id === 'jaen-demo')!
const TOLEDO = SAMPLE.zones.find((zone) => zone.id === 'toledo-demo')!
const JAEN_NDVI = JAEN.layers.find((layer) => layer.id === 'ndvi')!

const colorStops = [
  { value: 0, color: '#8c510a', label: 'Bajo' },
  { value: 0.5, color: '#f6e8c3', label: 'Medio' },
  { value: 1, color: '#01665e', label: 'Alto' },
]

/** Fixture contractual para AT-16: no es una observación real ni se publica. */
const REAL_FIXTURE = {
  schemaVersion: '1.1.0',
  datasetMode: 'real',
  appTitle: 'OliveTwin',
  zones: [
    {
      id: 'qa-fixture-real',
      name: 'Fixture real de QA — no científico',
      description:
        'Fixture contractual de INT02 para probar el modo real; no representa una observación ni una zona aprobada.',
      bbox: [-4.05, 39.8, -3.95, 39.9],
      layers: [
        {
          id: 'ndvi',
          title: 'Vegetación (NDVI) — fixture QA',
          kind: 'image-overlay',
          variable: 'NDVI',
          image: 'data/real/zones/qa-fixture-real/ndvi.png',
          bbox: [-4.05, 39.8, -3.95, 39.9],
          imageCrs: 'EPSG:3857',
          unit: 'index',
          range: [0, 1],
          legend: colorStops,
          status: 'processed_real',
          provenance: {
            provider: 'Fixture de QA (no científico)',
            product: 'Fixture contractual de prueba — no es una observación',
            acquisitionDate: '2026-10-19',
            sceneId: 'QA-FIXTURE-NO-REAL',
            processingVersion: 'qa-fixture-v1',
            referenceUrl: 'https://example.org/olivetwin/qa-fixture',
            note: 'Servido solo con page.route durante las pruebas E2E; no existe en public/data/real. La URL example.org es un marcador reservado, no una fuente científica.',
          },
          qualityNote: 'Fixture de pruebas; no usar para decisiones ni presentar como dato NASA.',
        },
      ],
    },
  ],
}

/** Tercera zona válida para AT-15; solo se inyecta por JSON con page.route. */
const THIRD_ZONE = {
  id: 'tercera-demo',
  name: 'Tercera zona QA — demostración',
  description: 'Zona añadida solo con JSON para comprobar que los componentes no están hardcodeados.',
  bbox: [-4.1, 39.85, -4.0, 39.95],
  layers: [
    {
      id: 'ndvi',
      title: 'Vegetación (NDVI)',
      kind: 'image-overlay',
      variable: 'NDVI',
      image: 'data/sample/zones/toledo-demo/ndvi.png',
      bbox: [-4.1, 39.85, -4.0, 39.95],
      imageCrs: 'EPSG:3857',
      unit: 'index',
      range: [0, 1],
      legend: colorStops,
      status: 'synthetic',
      provenance: {
        provider: 'Generador sintético OliveTwin (fixture QA)',
        product: 'NDVI ilustrativo — no satelital',
        acquisitionDate: null,
        sceneId: null,
        processingVersion: 'qa-fixture-v1',
        referenceUrl: null,
        note: 'Zona inyectada por page.route para AT-15.',
      },
      qualityNote: 'NO apto para decisiones agronómicas',
    },
  ],
}

test.describe('OliveTwin · demo completa', () => {
  test('AT-03 · abrir app: España, zonas demo, aviso DATOS SIMULADOS y Canarias accesible', async ({
    page,
  }) => {
    const pnoaTile = page.waitForRequest(/tms-pnoa-ma\.idee\.es/, { timeout: 30_000 })
    await openApp(page)
    await pnoaTile

    const map = await getMap(page)
    expect(map.zoom).toBeGreaterThanOrEqual(5)
    expect(map.center.lat).toBeGreaterThan(34)
    expect(map.center.lat).toBeLessThan(45)
    expect(map.center.lng).toBeGreaterThan(-11)
    expect(map.center.lng).toBeLessThan(5)

    await expect(page.locator('.ot-zone-selector option')).toHaveText([
      'Selecciona una zona',
      'Jaén — demostración',
      'Toledo — demostración',
    ])
    await expect(page.locator('.ot-badge')).toHaveText('DATOS SIMULADOS')
    await expect(page.locator('.leaflet-overlay-pane svg path')).toHaveCount(2)
    await expect(page.locator('.leaflet-control-attribution')).toContainText(
      'Instituto Geográfico Nacional',
    )
    await capture(page, 'at-03-inicio.jpg')

    // Canarias accesible desde el control propio del mapa.
    await page.getByRole('button', { name: 'Encuadrar el archipiélago canario' }).click()
    await expect.poll(async () => (await getMap(page)).center.lat).toBeLessThan(32)
    await capture(page, 'at-03-canarias.jpg')
    await page.getByRole('button', { name: 'Encuadrar la Península y Baleares' }).click()
    await expect.poll(async () => (await getMap(page)).center.lat).toBeGreaterThan(35)
  })

  test('AT-04 · PNOA ↔ OSM: peticiones a ambos servicios y atribuciones visibles', async ({ page }) => {
    const pnoaTile = page.waitForRequest(/tms-pnoa-ma\.idee\.es/, { timeout: 30_000 })
    await openApp(page)
    await pnoaTile
    await expect(page.locator('.leaflet-control-attribution')).toContainText(
      'Instituto Geográfico Nacional',
    )
    await expect
      .poll(() => page.locator('img.leaflet-tile[src*="tms-pnoa-ma.idee.es"]').count())
      .toBeGreaterThan(0)
    await capture(page, 'at-04-pnoa.jpg')

    const osmTile = page.waitForRequest(/tile\.openstreetmap\.org/, { timeout: 30_000 })
    await clickLabel(page, '.ot-layer-panel', 'OpenStreetMap')
    await osmTile
    await expect(page.locator('.ot-layer-panel input[value="osm"]')).toBeChecked()
    await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap')
    await expect(page.locator('.leaflet-control-attribution')).not.toContainText(
      'Instituto Geográfico Nacional',
    )
    await expect
      .poll(() => page.locator('img.leaflet-tile[src*="tile.openstreetmap.org"]').count())
      .toBeGreaterThan(0)
    await capture(page, 'at-04-osm.jpg')

    await clickLabel(page, '.ot-layer-panel', 'Ortofoto PNOA')
    // Al volver, las teselas pueden venir de la caché del navegador: por eso no
    // se exige una petición nueva, sino que la capa PNOA vuelva al DOM.
    await expect(page.locator('.ot-layer-panel input[value="pnoa"]')).toBeChecked()
    await expect(page.locator('.leaflet-control-attribution')).toContainText(
      'Instituto Geográfico Nacional',
    )
  })

  test('AT-05 · seleccionar Jaén: fitBounds al centro de la zona', async ({ page }) => {
    await openApp(page)
    await selectZone(page, 'jaen-demo')
    const map = await getMap(page)
    const [west, south, east, north] = JAEN.bbox
    const centerLng = (west + east) / 2
    const centerLat = (south + north) / 2
    expect(Math.abs(map.center.lat - centerLat)).toBeLessThan(0.05)
    expect(Math.abs(map.center.lng - centerLng)).toBeLessThan(0.05)
    expect(map.zoom).toBeGreaterThanOrEqual(11)
    await expect(page.locator('img.olive-scientific-overlay')).toHaveAttribute(
      'src',
      /jaen-demo\/ndvi\.png$/,
    )
    await capture(page, 'at-05-jaen.jpg')
  })

  test('AT-06 · NDVI y humedad: imágenes y leyendas distintas', async ({ page }) => {
    await openApp(page)
    await selectZone(page, 'jaen-demo')

    const overlay = page.locator('img.olive-scientific-overlay')
    const ndviSrc = await overlay.getAttribute('src')
    expect(ndviSrc).toContain('jaen-demo/ndvi.png')
    const ndviLegend = await page.locator('.ot-legend').innerText()
    expect(ndviLegend).toContain('NDVI')
    expect(ndviLegend).toContain('Unidad: index')
    await capture(page, 'at-06-ndvi.jpg')

    await clickLabel(page, '.ot-layer-panel', 'Humedad superficial')
    await waitForOverlay(page)
    const moistureSrc = await overlay.getAttribute('src')
    expect(moistureSrc).toContain('jaen-demo/moisture.png')
    expect(moistureSrc).not.toBe(ndviSrc)
    const moistureLegend = await page.locator('.ot-legend').innerText()
    expect(moistureLegend).toContain('Humedad superficial')
    expect(moistureLegend).toContain('Unidad: m³/m³')
    expect(moistureLegend).not.toBe(ndviLegend)
    await capture(page, 'at-06-humedad.jpg')
  })

  test('AT-07 · opacidad 0 / 50 / 100 % sin recargar la página', async ({ page }) => {
    await openApp(page)
    await selectZone(page, 'jaen-demo')
    const overlay = page.locator('img.olive-scientific-overlay')
    const src = await overlay.getAttribute('src')

    await setOpacity(page, 0)
    await expect(overlay).toHaveCSS('opacity', '0')
    await capture(page, 'at-07-opacidad-0.jpg')

    await setOpacity(page, 50)
    await expect(overlay).toHaveCSS('opacity', '0.5')
    await capture(page, 'at-07-opacidad-50.jpg')

    await setOpacity(page, 100)
    await expect(overlay).toHaveCSS('opacity', '1')
    await expect(overlay).toHaveAttribute('src', src ?? '')
    await capture(page, 'at-07-opacidad-100.jpg')

    const navigations = await page.evaluate(
      () => performance.getEntriesByType('navigation').length,
    )
    expect(navigations).toBe(1)
  })

  test('AT-08 · cambiar a Toledo: un solo overlay, restos de Jaén eliminados', async ({ page }) => {
    await openApp(page)
    await selectZone(page, 'jaen-demo')
    await page.selectOption('.ot-zone-selector select', 'toledo-demo')
    await waitForOverlay(page)
    await expect(page.locator('img.olive-scientific-overlay')).toHaveCount(1)
    await expect(page.locator('img.olive-scientific-overlay')).toHaveAttribute(
      'src',
      /toledo-demo\/ndvi\.png$/,
    )
    await expect(page.locator('.ot-zone-selector select')).toHaveValue('toledo-demo')
    const map = await getMap(page)
    const [west, south, east, north] = TOLEDO.bbox
    expect(Math.abs(map.center.lat - (south + north) / 2)).toBeLessThan(0.05)
    expect(Math.abs(map.center.lng - (west + east) / 2)).toBeLessThan(0.05)
    await capture(page, 'at-08-toledo.jpg')
  })

  test('AT-09 · navegar fuera de cobertura: el overlay queda fuera de la vista', async ({ page }) => {
    await openApp(page)
    await selectZone(page, 'jaen-demo')
    await clickLabel(page, '.ot-layer-panel', 'OpenStreetMap')
    const src = await page.locator('img.olive-scientific-overlay').getAttribute('src')

    await panMap(page, 0, 0, 4)
    const geometry = await getMap(page)
    const rect = await page.locator('img.olive-scientific-overlay').evaluate((element) => {
      const img = element.getBoundingClientRect()
      const map = document.querySelector('.olive-map')!.getBoundingClientRect()
      return {
        left: img.left - map.left,
        top: img.top - map.top,
        right: img.right - map.left,
        bottom: img.bottom - map.top,
      }
    })
    const outside =
      rect.right < 0 ||
      rect.left > geometry.container.width ||
      rect.bottom < 0 ||
      rect.top > geometry.container.height
    expect(outside).toBe(true)
    // El overlay sigue georreferenciado en Jaén: no se duplica ni se pinta en el centro.
    await expect(page.locator('img.olive-scientific-overlay')).toHaveCount(1)
    await expect(page.locator('img.olive-scientific-overlay')).toHaveAttribute('src', src ?? '')
    await expect(page.locator('.leaflet-overlay-pane svg path')).toHaveCount(2)
    await capture(page, 'at-09-fuera-de-cobertura.jpg')
  })

  test('AT-10 · modo real vacío: mensaje explícito, sin overlay ni zonas de muestra', async ({ page }) => {
    await openApp(page)
    await clickLabel(page, '.ot-mode-switch', 'Datos reales')
    await expect(page.locator('.ot-status')).toContainText(
      'Todavía no hay zonas con datos científicos reales',
    )
    await expect(page.locator('img.olive-scientific-overlay')).toHaveCount(0)
    await expect(page.locator('.leaflet-overlay-pane svg path')).toHaveCount(0)
    await expect(page.locator('.ot-zone-selector select')).toBeDisabled()
    await expect(page.locator('.ot-badge')).toHaveCount(0)
    await expect
      .poll(() => page.locator('img.leaflet-tile-loaded').count())
      .toBeGreaterThan(0)
    await capture(page, 'at-10-real-vacio.jpg')
  })

  test('AT-11 · volver a muestra: zonas, capas y aviso simulado restablecidos', async ({ page }) => {
    await openApp(page)
    await clickLabel(page, '.ot-mode-switch', 'Datos reales')
    await expect(page.locator('.ot-status')).toContainText('Todavía no hay zonas')
    await clickLabel(page, '.ot-mode-switch', 'Datos de muestra')
    await expect(page.locator('.ot-zone-selector select')).toBeEnabled()
    await expect(page.locator('.ot-zone-selector option')).toHaveCount(3)
    await expect(page.locator('.ot-badge')).toHaveText('DATOS SIMULADOS')
    await expect(page.locator('.leaflet-overlay-pane svg path')).toHaveCount(2)
    await expect(page.locator('.ot-zone-selector select')).toHaveValue('')
    await capture(page, 'at-11-vuelta-muestra.jpg')
  })

  test('AT-12 · PNG 404: aviso de imagen no disponible y mapa base intacto', async ({ page }) => {
    await page.route('**/data/sample/zones/**/*.png', (route) =>
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }),
    )
    await openApp(page)
    await page.selectOption('.ot-zone-selector select', 'jaen-demo')
    await expect(page.locator('.ot-status')).toContainText(
      'La imagen de la capa no está disponible',
    )
    await expect
      .poll(() => page.locator('img.leaflet-tile-loaded').count())
      .toBeGreaterThan(0)
    await expect(page.locator('.leaflet-overlay-pane svg path')).toHaveCount(2)
    await capture(page, 'at-12-png-404.jpg')
  })

  test('AT-12 · manifiesto real roto: error visible y sin fallback a muestra', async ({ page }) => {
    await openApp(page)
    await page.route('**/data/real/manifest.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{ esto no es JSON' }),
    )
    await clickLabel(page, '.ot-mode-switch', 'Datos reales')
    await expect(page.locator('.ot-status')).toContainText('No se han podido cargar los datos')
    await expect(page.locator('.ot-status')).toContainText('no es un JSON válido')
    await expect(page.locator('.ot-zone-selector select')).toBeDisabled()
    await expect(page.locator('.ot-zone-selector option')).toHaveCount(1)
    await expect(page.locator('.leaflet-overlay-pane svg path')).toHaveCount(0)
    await expect(page.locator('.ot-badge')).toHaveCount(0)
    await expect
      .poll(() => page.locator('img.leaflet-tile-loaded').count())
      .toBeGreaterThan(0)
    await capture(page, 'at-12-manifiesto-roto.jpg')
  })

  test('AT-13 · cambio rápido sample→real→sample: gana el estado final', async ({ page }) => {
    await page.route('**/data/real/manifest.json', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: '1.1.0', datasetMode: 'real', appTitle: 'OliveTwin', zones: [] }),
      })
    })
    await openApp(page)
    await clickLabel(page, '.ot-mode-switch', 'Datos reales')
    await clickLabel(page, '.ot-mode-switch', 'Datos de muestra')
    await page.waitForTimeout(1600)
    await expect(page.locator('.ot-mode-switch input[value="sample"]')).toBeChecked()
    await expect(page.locator('.ot-zone-selector option')).toHaveCount(3)
    await expect(page.locator('.ot-badge')).toHaveText('DATOS SIMULADOS')
    await expect(page.locator('.ot-status')).not.toContainText('No se han podido cargar')
    await expect(page.locator('.ot-status')).not.toContainText('Todavía no hay zonas')
    await expect(page.locator('.leaflet-overlay-pane svg path')).toHaveCount(2)
    await capture(page, 'at-13-cambio-rapido.jpg')
  })

  test('SAMPLE-07 · cambiar PNOA↔OSM conserva overlay y opacidad', async ({ page }) => {
    await openApp(page)
    await selectZone(page, 'jaen-demo')
    await setOpacity(page, 50)
    const src = await page.locator('img.olive-scientific-overlay').getAttribute('src')

    const osmTile = page.waitForRequest(/tile\.openstreetmap\.org/, { timeout: 30_000 })
    await clickLabel(page, '.ot-layer-panel', 'OpenStreetMap')
    await osmTile
    await expect(page.locator('img.olive-scientific-overlay')).toHaveCount(1)
    await expect(page.locator('img.olive-scientific-overlay')).toHaveAttribute('src', src ?? '')
    await expect(page.locator('img.olive-scientific-overlay')).toHaveCSS('opacity', '0.5')
    await expect(page.locator('.ot-zone-selector select')).toHaveValue('jaen-demo')
    await expect(page.locator('.ot-range + output')).toHaveText('50 %')
    await capture(page, 'sample-07-osm-con-overlay.jpg')
  })

  test('SAMPLE-08 · capa sintética sin fecha: «Fecha no disponible»', async ({ page }) => {
    await openApp(page)
    await selectZone(page, 'jaen-demo')
    const provenance = page.locator('.ot-provenance')
    await expect(provenance).toContainText('Fecha no disponible')
    const text = await provenance.innerText()
    expect(text).toMatch(/FECHA\s+Fecha no disponible/)
    // Una fecha inventada o la del día serían un fallo científico.
    expect(text).not.toMatch(/\b2026\b/)
    await captureElement(page, '.ot-provenance', 'sample-08-fecha-no-disponible.png')
  })

  test('AT-15 · tercera zona añadida solo con JSON (sin tocar Vue)', async ({ page }) => {
    await page.route('**/data/sample/manifest.json', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.zones.push(THIRD_ZONE)
      await route.fulfill({ response, json: body })
    })
    await openApp(page)
    await expect(page.locator('.ot-zone-selector option')).toHaveCount(4)
    await expect(
      page.locator('.ot-zone-selector option', { hasText: 'Tercera zona QA — demostración' }),
    ).toHaveCount(1)
    await expect(page.locator('.leaflet-overlay-pane svg path')).toHaveCount(3)
    await selectZone(page, 'tercera-demo')
    await expect(page.locator('img.olive-scientific-overlay')).toHaveAttribute(
      'src',
      /toledo-demo\/ndvi\.png$/,
    )
    const map = await getMap(page)
    expect(map.center.lat).toBeGreaterThan(39.8)
    expect(map.center.lat).toBeLessThan(40)
    await capture(page, 'at-15-tercera-zona.jpg')
  })

  test('AT-16 · zona real válida (fixture): solo aparece en modo real', async ({ page }) => {
    await page.route('**/data/real/manifest.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REAL_FIXTURE) }),
    )
    const samplePng = fs.readFileSync(
      path.join(repoDir(), 'frontend/public/data/sample/zones/toledo-demo/ndvi.png'),
    )
    await page.route('**/data/real/zones/qa-fixture-real/ndvi.png', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: samplePng }),
    )

    await openApp(page)
    // Antes de cambiar de modo, el fixture no contamina la muestra.
    await expect(page.locator('.ot-zone-selector option')).toHaveCount(3)
    await expect(
      page.locator('.ot-zone-selector option', { hasText: 'Fixture real de QA' }),
    ).toHaveCount(0)

    await clickLabel(page, '.ot-mode-switch', 'Datos reales')
    await expect(page.locator('.ot-zone-selector option')).toHaveCount(2)
    await expect(
      page.locator('.ot-zone-selector option', { hasText: 'Fixture real de QA' }),
    ).toHaveCount(1)
    await expect(page.locator('.ot-badge')).toHaveCount(0)

    await selectZone(page, 'qa-fixture-real')
    await expect(page.locator('img.olive-scientific-overlay')).toHaveAttribute(
      'src',
      /\/data\/real\/zones\/qa-fixture-real\/ndvi\.png$/,
    )
    const provenance = page.locator('.ot-provenance')
    await expect(provenance).toContainText('Fixture de QA (no científico)')
    await expect(provenance).toContainText('19 de octubre de 2026')
    await expect(provenance).toContainText('QA-FIXTURE-NO-REAL')
    await expect(provenance).toContainText('Datos reales')
    await capture(page, 'at-16-zona-real-fixture.jpg')

    // Al volver a muestra, el fixture desaparece y no hereda el id.
    await clickLabel(page, '.ot-mode-switch', 'Datos de muestra')
    await expect(page.locator('.ot-zone-selector option')).toHaveCount(3)
    await expect(
      page.locator('.ot-zone-selector option', { hasText: 'Fixture real de QA' }),
    ).toHaveCount(0)
    await expect(page.locator('img.olive-scientific-overlay')).toHaveCount(0)
  })

  test('AT-18 · móvil 390×844 y navegación por teclado hasta el modo de datos', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openApp(page)
    await expect(page.locator('.olive-map')).toBeVisible()
    await expect(page.locator('.ot-mode-switch')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await capture(page, 'at-18-movil.jpg', { fullPage: true })

    // Navegación por teclado en escritorio: Tab hasta el grupo de modo y flecha.
    await page.setViewportSize({ width: 1366, height: 900 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('.ot-status')).not.toContainText('Cargando datos…')
    let reached = false
    for (let i = 0; i < 50; i += 1) {
      await page.keyboard.press('Tab')
      reached = await page.evaluate(() =>
        Boolean(document.activeElement?.closest('.ot-mode-switch')),
      )
      if (reached) break
    }
    expect(reached).toBe(true)
    await expect(page.locator('.ot-mode-switch input[value="sample"]')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.ot-mode-switch input[value="real"]')).toBeChecked()
    await expect(page.locator('.ot-status')).toContainText('Todavía no hay zonas')
    await captureElement(page, '.ot-mode-switch', 'at-18-teclado.png')
    await capture(page, 'at-18-teclado-modo-real.jpg')
    await page.keyboard.press('ArrowLeft')
    await expect(page.locator('.ot-mode-switch input[value="sample"]')).toBeChecked()
  })

  test('AT-19 · overlay georreferenciado por bbox y PNG con transparencia', async ({ page }) => {
    await openApp(page)
    await selectZone(page, 'jaen-demo')

    const map = await getMap(page, JAEN_NDVI.bbox)
    const expected = map.projected
    const actual = await page.locator('img.olive-scientific-overlay').evaluate((element) => {
      const img = element.getBoundingClientRect()
      const container = document.querySelector('.olive-map')!.getBoundingClientRect()
      return {
        left: img.left - container.left,
        top: img.top - container.top,
        right: img.right - container.left,
        bottom: img.bottom - container.top,
        width: img.width,
        height: img.height,
      }
    })
    // Tolerancia de 2 px por redondeo de Leaflet/Chrome.
    expect(Math.abs(actual.left - expected.left)).toBeLessThanOrEqual(2)
    expect(Math.abs(actual.top - expected.top)).toBeLessThanOrEqual(2)
    expect(Math.abs(actual.right - expected.right)).toBeLessThanOrEqual(2)
    expect(Math.abs(actual.bottom - expected.bottom)).toBeLessThanOrEqual(2)
    expect(Math.abs(actual.width - (expected.right - expected.left))).toBeLessThanOrEqual(2)
    expect(Math.abs(actual.height - (expected.bottom - expected.top))).toBeLessThanOrEqual(2)

    // Transparencia real del PNG publicado (no del screenshot).
    const pngPath = path.join(repoDir(), 'frontend/public', JAEN_NDVI.image)
    const png = PNG.sync.read(fs.readFileSync(pngPath))
    expect(png.data.length).toBe(png.width * png.height * 4)
    let transparentPixels = 0
    let opaquePixels = 0
    for (let index = 3; index < png.data.length; index += 4) {
      if (png.data[index] === 0) transparentPixels += 1
      else if (png.data[index] === 255) opaquePixels += 1
    }
    expect(transparentPixels).toBeGreaterThan(0)
    expect(opaquePixels).toBeGreaterThan(0)
    expect(transparentPixels + opaquePixels).toBeLessThanOrEqual(png.width * png.height)

    await capture(page, 'at-19-overlay-bbox.jpg')
  })

  test('Consola y red: sin errores JS; solo teselas canceladas al cambiar de vista', async ({
    page,
  }) => {
    const consoleMessages: Array<{ type: string; text: string }> = []
    const pageErrors: string[] = []
    const failedRequests: Array<{ url: string; error: string }> = []
    const badResponses: Array<{ status: number; url: string }> = []

    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleMessages.push({ type: message.type(), text: message.text() })
      }
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('requestfailed', (request) =>
      failedRequests.push({
        url: request.url(),
        error: request.failure()?.errorText ?? 'desconocido',
      }),
    )
    page.on('response', (response) => {
      if (response.status() >= 400) {
        badResponses.push({ status: response.status(), url: response.url() })
      }
    })

    await openApp(page)
    await selectZone(page, 'jaen-demo')
    await clickLabel(page, '.ot-layer-panel', 'Humedad superficial')
    await waitForOverlay(page)
    await clickLabel(page, '.ot-layer-panel', 'OpenStreetMap')
    await waitForTiles(page)
    await clickLabel(page, '.ot-mode-switch', 'Datos reales')
    await expect(page.locator('.ot-status')).toContainText('Todavía no hay zonas')
    await clickLabel(page, '.ot-mode-switch', 'Datos de muestra')
    await waitForTiles(page)

    const appFailures = failedRequests.filter(
      (failure) =>
        !/tms-pnoa-ma\.idee\.es|tile\.openstreetmap\.org/.test(failure.url),
    )
    const appBadResponses = badResponses.filter((response) => response.url.startsWith(BASE_URL))

    const report = {
      fecha: new Date().toISOString(),
      url: BASE_URL,
      erroresPagina: pageErrors,
      consolaErroresOavisos: consoleMessages,
      peticionesFallidas: failedRequests.length,
      peticionesFallidasDeTeselas: failedRequests.length - appFailures.length,
      peticionesFallidasDeLaApp: appFailures,
      respuestasHttp4xx5xx: badResponses,
      respuestasHttp4xx5xxDeLaApp: appBadResponses,
    }
    fs.mkdirSync(docsQaDir(), { recursive: true })
    fs.writeFileSync(
      path.join(docsQaDir(), 'consola-red.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    )

    expect(pageErrors).toEqual([])
    expect(consoleMessages.filter((message) => message.type === 'error')).toEqual([])
    expect(appFailures).toEqual([])
    expect(appBadResponses).toEqual([])
  })
})
