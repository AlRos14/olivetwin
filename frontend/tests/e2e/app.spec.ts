/**
 * Pruebas E2E de la demo OliveTwin sobre `vite preview` (INT02/INT-R).
 *
 * Decisión de producto (2026-11-14): la demo publica solo datos reales NISAR
 * SME2 de Jaén y Toledo. No hay escenarios de datos de muestra ni selector de
 * modo; se verifica la línea temporal (3 fechas), el cambio de zona, los mapas
 * base, los errores y la georreferenciación de la capa real.
 *
 * AT-01, AT-02 y AT-14 son comandos de consola y se documentan en
 * `docs/qa-results.md`; AT-17 tiene su propio spec porque requiere una build
 * con `--base /olivetwin/` en otro puerto.
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
  clickLabel,
  docsQaDir,
  getMap,
  openApp,
  readRealManifest,
  repoDir,
  selectZone,
  setOpacity,
  setTimeStep,
  waitForOverlay,
  waitForTiles,
} from './support'

const REAL = readRealManifest()
const JAEN = REAL.zones.find((zone) => zone.id === 'jaen')!
const TOLEDO = REAL.zones.find((zone) => zone.id === 'toledo')!
const JAEN_LAYER = JAEN.layers.find((layer) => layer.id === 'soil-moisture')!
const TOLEDO_LAYER = TOLEDO.layers.find((layer) => layer.id === 'soil-moisture')!
const JAEN_STEPS = JAEN_LAYER.timeSteps ?? []
const TOLEDO_STEPS = TOLEDO_LAYER.timeSteps ?? []

function overlay(page: import('@playwright/test').Page) {
  return page.locator('img.olive-scientific-overlay')
}

test.describe('OliveTwin · demo con datos reales NISAR SME2', () => {
  test('abrir → Jaén con overlay y slider de 3 fechas, sin datos simulados', async ({ page }) => {
    const pnoaTile = page.waitForRequest(/tms-pnoa-ma\.idee\.es/, { timeout: 30_000 })
    await openApp(page)
    await pnoaTile

    expect(JAEN_STEPS).toHaveLength(3)

    // Mapa y zonas: Jaén autoseleccionada, Toledo disponible.
    await expect(page.locator('.ot-zone-selector option')).toHaveText([
      'Selecciona una zona',
      'Jaén',
      'Toledo',
    ])
    await expect(page.locator('.ot-zone-selector select')).toHaveValue('jaen')
    await expect(page.locator('.leaflet-overlay-pane svg path')).toHaveCount(2)

    // Capa real visible y slider en el último paso.
    await waitForOverlay(page)
    await expect(overlay(page)).toHaveAttribute('src', new RegExp(`${JAEN_STEPS[2]!.image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    await expect(page.locator('.ot-time-slider')).toBeVisible()
    await expect(page.locator('.ot-time-slider input[type="range"]')).toHaveValue('2')
    await expect(page.locator('.ot-time-slider__status')).toContainText('Paso 3 de 3')
    await expect(page.locator('.ot-time-slider__marks li')).toHaveCount(3)

    // Cabecera y aviso científico; nunca «DATOS SIMULADOS».
    await expect(page.locator('.ot-panel__subtitle')).toHaveText(
      'NISAR L3 SME2 · humedad superficial · datos PROVISIONAL',
    )
    await expect(page.locator('.ot-panel__notice')).toContainText(
      'Producto NISAR SME2 PROVISIONAL',
    )
    await expect(page.locator('.ot-panel__notice')).toContainText(
      'humedad superficial ≠ necesidad de riego',
    )
    await expect(page.locator('.ot-badge')).toHaveCount(0)
    await expect(page.locator('.ot-mode-switch')).toHaveCount(0)
    await expect(page.locator('.ot-status')).not.toContainText('DATOS SIMULADOS')

    // Procedencia del paso activo (fecha y escena reales del manifiesto).
    const provenance = page.locator('.ot-provenance')
    await expect(provenance).toContainText('Datos reales')
    await expect(provenance).toContainText('NASA/JPL–ISRO NISAR')
    await expect(provenance).toContainText('14 de julio de 2026')

    await capture(page, 'real-01-jaen.jpg')
  })

  test('mover el slider cambia el src sin recrear el <img>; reproducir avanza', async ({ page }) => {
    await openApp(page)
    const img = overlay(page)
    const handle = await img.elementHandle()
    expect(handle).not.toBeNull()

    const lastSrc = await img.getAttribute('src')
    expect(lastSrc).toContain(JAEN_STEPS[2]!.image.split('/').pop()!)

    await setTimeStep(page, 0)
    await expect(img).toHaveAttribute(
      'src',
      new RegExp(`${JAEN_STEPS[0]!.image.split('/').pop()!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    )
    await expect(page.locator('.ot-time-slider__status')).toContainText('Paso 1 de 3')

    // Mismo elemento <img>: ScientificOverlay usa setUrl, no recrea la capa.
    expect(await handle!.evaluate((element) => element.isConnected)).toBe(true)
    expect(await page.locator('img.olive-scientific-overlay').count()).toBe(1)
    await capture(page, 'real-02-slider-primer-paso.jpg')

    // Reproducir avanza al menos un paso (1,5 s por paso).
    await page.getByRole('button', { name: 'Reproducir' }).click()
    await expect
      .poll(() => page.locator('.ot-time-slider input[type="range"]').inputValue(), {
        timeout: 8_000,
      })
      .toBe('1')
    await capture(page, 'real-03-reproduccion.jpg')
  })

  test('cambiar a Toledo reinicia al último paso y mantiene un solo overlay', async ({ page }) => {
    await openApp(page)
    await setTimeStep(page, 0)
    const osmTile = page.waitForRequest(/tile\.openstreetmap\.org/, { timeout: 30_000 })
    await clickLabel(page, '.ot-layer-panel', 'OpenStreetMap')
    await osmTile

    await page.selectOption('.ot-zone-selector select', 'toledo')
    await waitForOverlay(page)

    await expect(page.locator('img.olive-scientific-overlay')).toHaveCount(1)
    await expect(overlay(page)).toHaveAttribute(
      'src',
      new RegExp(`${TOLEDO_STEPS[2]!.image.split('/').pop()!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    )
    await expect(page.locator('.ot-zone-selector select')).toHaveValue('toledo')
    await expect(page.locator('.ot-time-slider input[type="range"]')).toHaveValue('2')
    await expect(page.locator('.ot-time-slider__status')).toContainText('Paso 3 de 3')

    // El encuadre corresponde al bbox de Toledo.
    const map = await getMap(page)
    const [west, south, east, north] = TOLEDO.bbox
    expect(Math.abs(map.center.lat - (south + north) / 2)).toBeLessThan(0.05)
    expect(Math.abs(map.center.lng - (west + east) / 2)).toBeLessThan(0.05)
    await capture(page, 'real-04-toledo.jpg')
  })

  test('PNOA ↔ OSM conserva overlay, opacidad y la misma imagen', async ({ page }) => {
    await openApp(page)
    await setTimeStep(page, 1)
    await setOpacity(page, 50)

    const img = overlay(page)
    const src = await img.getAttribute('src')
    const handle = await img.elementHandle()

    const osmTile = page.waitForRequest(/tile\.openstreetmap\.org/, { timeout: 30_000 })
    await clickLabel(page, '.ot-layer-panel', 'OpenStreetMap')
    await osmTile

    await expect(page.locator('.ot-layer-panel input[value="osm"]')).toBeChecked()
    await expect(overlay(page)).toHaveCount(1)
    await expect(overlay(page)).toHaveAttribute('src', src ?? '')
    await expect(overlay(page)).toHaveCSS('opacity', '0.5')
    expect(await handle!.evaluate((element) => element.isConnected)).toBe(true)
    await capture(page, 'real-05-osm-overlay.jpg')

    // Volver a PNOA puede servirse desde caché; no se exige nueva petición.
    await clickLabel(page, '.ot-layer-panel', 'Ortofoto PNOA')
    await expect(page.locator('.ot-layer-panel input[value="pnoa"]')).toBeChecked()
    await expect(overlay(page)).toHaveAttribute('src', src ?? '')
    await expect(overlay(page)).toHaveCSS('opacity', '0.5')
  })

  test('manifiesto real roto ⇒ error visible, sin zonas ni overlay', async ({ page }) => {
    await page.route('**/data/real/manifest.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{ esto no es JSON' }),
    )
    await openApp(page, { waitData: false })

    await expect(page.locator('.ot-status')).toContainText('No se han podido cargar los datos')
    await expect(page.locator('.ot-status')).toContainText('no es un JSON válido')
    await expect(page.locator('.ot-zone-selector select')).toBeDisabled()
    await expect(page.locator('.ot-zone-selector option')).toHaveCount(1)
    await expect(page.locator('img.olive-scientific-overlay')).toHaveCount(0)
    await expect(page.locator('.leaflet-overlay-pane svg path')).toHaveCount(0)
    await expect(page.locator('.ot-time-slider')).toHaveCount(0)
    await expect(page.locator('.ot-badge')).toHaveCount(0)
    await expect
      .poll(() => page.locator('img.leaflet-tile-loaded').count())
      .toBeGreaterThan(0)
    await capture(page, 'real-06-json-roto.jpg')
  })

  test('AT-19 · alineación del overlay con el bbox real y PNG con transparencia', async ({ page }) => {
    await openApp(page)
    await selectZone(page, 'jaen')
    await waitForTiles(page)

    const map = await getMap(page, JAEN_LAYER.bbox)
    const expected = map.projected
    const actual = await overlay(page).evaluate((element) => {
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
    const pngPath = path.join(repoDir(), 'frontend/public', JAEN_STEPS[2]!.image)
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

    await capture(page, 'real-07-overlay-bbox.jpg')
  })

  test('móvil 390×844: la línea temporal vive dentro del panel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openApp(page)

    await expect(page.locator('.olive-map')).toBeVisible()
    await expect(page.locator('.ot-time-slider')).toBeVisible()
    const insidePanel = await page
      .locator('.ot-time-slider')
      .evaluate((element) => Boolean(element.closest('.ot-panel')))
    expect(insidePanel).toBe(true)
    await expect(page.locator('.ot-time-slider-dock')).toHaveCount(0)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await capture(page, 'real-08-movil.jpg', { fullPage: true })
  })

  test('consola y red: sin errores JS ni respuestas 4xx/5xx de la aplicación', async ({ page }) => {
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
    await setTimeStep(page, 0)
    await clickLabel(page, '.ot-layer-panel', 'OpenStreetMap')
    await expect(page.locator('.ot-layer-panel input[value="osm"]')).toBeChecked()

    const appFailures = failedRequests.filter(
      (failure) => !/tms-pnoa-ma\.idee\.es|tile\.openstreetmap\.org/.test(failure.url),
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
