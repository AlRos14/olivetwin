/**
 * Pruebas E2E de la demo OliveTwin sobre `vite preview` (INT02/INT-R).
 *
 * Decisión de producto (2026-11-14): la demo publica solo datos reales. Desde
 * el 2026-11-15 Jaén y Toledo tienen cubo de análisis (contrato v1.3.0): Capas
 * arranca con la humedad del suelo del cubo (todas las estimaciones, 10 fechas)
 * pintada en el navegador como imagen `data:` sobre la rejilla del cubo. Se
 * verifica la línea temporal, el desplegable de variables, el cambio de zona,
 * los mapas base, los errores, la georreferenciación y la pestaña Análisis.
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
import {
  BASE_URL,
  capture,
  clickLabel,
  defaultVariable,
  docsQaDir,
  getMap,
  longDate,
  openApp,
  readAnalysis,
  readRealManifest,
  selectZone,
  setOpacity,
  setTimeStep,
  waitForOverlay,
  waitForTiles,
} from './support'

const REAL = readRealManifest()
const TOLEDO = REAL.zones.find((zone) => zone.id === 'toledo')!
const JAEN_CUBE = readAnalysis('jaen')
const TOLEDO_CUBE = readAnalysis('toledo')
const JAEN_VARIABLE = defaultVariable(JAEN_CUBE)
const TOLEDO_VARIABLE = defaultVariable(TOLEDO_CUBE)
const JAEN_STEPS = JAEN_VARIABLE.steps
const TOLEDO_STEPS = TOLEDO_VARIABLE.steps

function overlay(page: import('@playwright/test').Page) {
  return page.locator('img.olive-scientific-overlay')
}

test.describe('OliveTwin · demo con datos reales NISAR SME2', () => {
  test('abrir → Jaén con la humedad del cubo, su línea temporal y su leyenda', async ({ page }) => {
    const pnoaTile = page.waitForRequest(/tms-pnoa-ma\.idee\.es/, { timeout: 30_000 })
    await openApp(page)
    await pnoaTile

    const last = JAEN_STEPS.length - 1
    expect(JAEN_STEPS.length).toBeGreaterThanOrEqual(2)

    // Mapa y zonas: Jaén autoseleccionada, Toledo disponible.
    await expect(page.locator('.ot-zone-selector option')).toHaveText([
      'Selecciona una zona',
      'Jaén',
      'Toledo',
    ])
    await expect(page.locator('.ot-zone-selector select')).toHaveValue('jaen')
    await expect(page.locator('.leaflet-overlay-pane svg path')).toHaveCount(2)

    // Desplegable único de variables del cubo, sin la capa del manifiesto ni número de fechas.
    const variableSelect = page.locator('.ot-layer-panel select')
    await expect(variableSelect).toHaveValue(`cube:${JAEN_VARIABLE.id}`)
    await expect(page.locator('.ot-layer-panel option[value^="layer:"]')).toHaveCount(0)
    const labels = await page.locator('.ot-layer-panel option').allInnerTexts()
    expect(labels.some((label) => /fechas|estático/.test(label))).toBe(false)
    // Humedad y radar, Vegetación, Relieve, Suelo, Clima y Usos del suelo.
    await expect(page.locator('.ot-layer-panel optgroup')).toHaveCount(6)

    // Capa del cubo pintada en el navegador y slider en el último paso.
    await waitForOverlay(page)
    await expect(overlay(page)).toHaveAttribute('src', /^data:image\/png/)
    await expect(page.locator('.ot-time-slider')).toBeVisible()
    await expect(page.locator('.ot-time-slider input[type="range"]')).toHaveValue(String(last))
    await expect(page.locator('.ot-time-slider__status')).toContainText(`Paso ${JAEN_STEPS.length} de ${JAEN_STEPS.length}`)
    await expect(page.locator('.ot-time-slider__marks li')).toHaveCount(JAEN_STEPS.length)
    await expect(page.locator('.ot-time-slider__status')).toContainText(longDate(JAEN_STEPS[last]!.date!))
    await expect(page.locator('.ot-legend')).toContainText('Humedad del suelo')
    await expect(page.locator('.ot-legend')).toContainText('Sin dato')

    // Cabecera con la madurez del producto; sin aviso ni panel de procedencia; nunca «DATOS SIMULADOS».
    await expect(page.locator('.ot-panel__subtitle')).toHaveText(
      'NISAR L3 SME2 · humedad superficial · datos PROVISIONAL',
    )
    await expect(page.locator('.ot-panel__notice')).toHaveCount(0)
    await expect(page.locator('.ot-provenance')).toHaveCount(0)
    await expect(page.locator('.ot-badge')).toHaveCount(0)
    await expect(page.locator('.ot-mode-switch')).toHaveCount(0)
    await expect(page.locator('.ot-status')).not.toContainText('DATOS SIMULADOS')

    await capture(page, 'real-01-jaen.jpg')
  })

  test('mover el slider cambia el src sin recrear el <img>; reproducir avanza', async ({ page }) => {
    await openApp(page)
    const img = overlay(page)
    const handle = await img.elementHandle()
    expect(handle).not.toBeNull()

    const lastSrc = await img.getAttribute('src')
    expect(lastSrc).toMatch(/^data:image\/png/)

    await setTimeStep(page, 0)
    await expect.poll(() => img.getAttribute('src')).not.toBe(lastSrc)
    await expect(page.locator('.ot-time-slider__status')).toContainText(`Paso 1 de ${JAEN_STEPS.length}`)

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
    await clickLabel(page, '.ot-layer-panel', 'Vista General')
    await osmTile

    await page.selectOption('.ot-zone-selector select', 'toledo')
    await waitForOverlay(page)

    await expect(page.locator('img.olive-scientific-overlay')).toHaveCount(1)
    await expect(overlay(page)).toHaveAttribute('src', /^data:image\/png/)
    await expect(page.locator('.ot-zone-selector select')).toHaveValue('toledo')
    await expect(page.locator('.ot-layer-panel select')).toHaveValue(`cube:${TOLEDO_VARIABLE.id}`)
    await expect(page.locator('.ot-time-slider input[type="range"]')).toHaveValue(String(TOLEDO_STEPS.length - 1))
    await expect(page.locator('.ot-time-slider__status')).toContainText(
      `Paso ${TOLEDO_STEPS.length} de ${TOLEDO_STEPS.length}`,
    )

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
    await clickLabel(page, '.ot-layer-panel', 'Vista General')
    await osmTile

    await expect(page.locator('.ot-layer-panel input[value="osm"]')).toBeChecked()
    await expect(overlay(page)).toHaveCount(1)
    await expect(overlay(page)).toHaveAttribute('src', src ?? '')
    await expect(overlay(page)).toHaveCSS('opacity', '0.5')
    expect(await handle!.evaluate((element) => element.isConnected)).toBe(true)
    await capture(page, 'real-05-osm-overlay.jpg')

    // Volver a PNOA puede servirse desde caché; no se exige nueva petición.
    await clickLabel(page, '.ot-layer-panel', 'Vista Satelital')
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

  test('AT-19 · la capa del cubo se alinea con la rejilla y tiene una celda por píxel', async ({ page }) => {
    await openApp(page)
    await selectZone(page, 'jaen')
    await waitForTiles(page)

    const map = await getMap(page, JAEN_CUBE.grid.bbox)
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

    // La imagen calculada tiene exactamente el tamaño de la rejilla del cubo.
    const natural = await overlay(page).evaluate((element) => {
      const img = element as HTMLImageElement
      return { width: img.naturalWidth, height: img.naturalHeight }
    })
    expect(natural).toEqual({ width: JAEN_CUBE.grid.width, height: JAEN_CUBE.grid.height })

    await capture(page, 'real-07-overlay-bbox.jpg')
  })

  test('Análisis: sin mapa, imágenes de la serie, cambio, gráficas y aptitud por cultivo', async ({ page }) => {
    await openApp(page)
    await page.locator('.ot-tabs__tab', { hasText: 'Análisis' }).click()

    const workspace = page.locator('.ot-workspace')
    await expect(workspace).toBeVisible()
    await expect(workspace.locator('.ot-workspace__title')).toHaveText('Humedad del suelo')
    await expect(workspace.locator('.ot-gallery__item')).toHaveCount(Math.min(6, JAEN_STEPS.length))
    await expect(workspace).toContainText('Cambio')
    await expect(workspace).toContainText('zona común')
    // Evolución, distribución por fecha y reparto en la zona (media del intervalo).
    await expect(workspace.locator('.ot-chart__svg')).toHaveCount(3)
    await expect(workspace.locator('.ot-values tbody tr')).toHaveCount(JAEN_STEPS.length)
    await expect(page.locator('.ot-llm__run').first()).toBeEnabled()
    await capture(page, 'real-10-analisis.jpg')

    // Menos imágenes que fechas: se reparten y se indica cuántas hay.
    await page.locator('.ot-analysis input[type="range"]').evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = '3'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(workspace.locator('.ot-gallery__item')).toHaveCount(3)
    await expect(page.locator('.ot-analysis')).toContainText(`Se muestran 3 de ${JAEN_STEPS.length} fechas`)

    // Ampliar una imagen permite leer el dato bajo el cursor.
    await workspace.locator('.ot-gallery__button').first().click()
    const zoom = page.locator('.ot-lightbox__image')
    await expect(zoom).toBeVisible()
    const box = (await zoom.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.locator('.ot-lightbox')).toContainText(/m³\/m³|Sin dato en esta celda/)
    await page.locator('.ot-lightbox .ot-button').click()

    // Aptitud por cultivo con los cultivos del cubo.
    await page.getByRole('radio', { name: 'Aptitud por cultivo' }).click()
    await expect(workspace.locator('.ot-crop__map img')).toBeVisible()
    await expect(page.locator('.ot-analysis select').first().locator('option')).toHaveCount(JAEN_CUBE.crops?.length ?? 0)
    await expect(workspace).toContainText('Qué limita')
    await capture(page, 'real-11-aptitud.jpg')
  })

  test('Comparar: zona A, zona B y cultivo con veredicto, motivos y mapas', async ({ page }) => {
    await openApp(page)
    await page.locator('.ot-tabs__tab', { hasText: 'Comparar' }).click()

    const workspace = page.locator('.ot-compare')
    await expect(workspace).toBeVisible()
    const selects = page.locator('.ot-compare-controls select')
    await expect(selects).toHaveCount(3)
    await expect(selects.nth(0)).toHaveValue('jaen')
    await expect(selects.nth(1)).toHaveValue('toledo')
    await expect(workspace.locator('.ot-compare__verdict-title')).toContainText(/La zona [AB] es mejor para el olivo|aptitud parecida/)
    await expect(workspace.locator('.ot-compare__maps img')).toHaveCount(2)
    await expect(workspace.locator('.ot-compare__table tbody tr').first()).toBeVisible()
    // Solo «Zona A» y «Zona B»: sin provincias ni datos de producción.
    await expect(workspace).not.toContainText(/Jaén|Toledo|MAPA/)
    await expect(page.locator('.ot-llm__run')).toBeEnabled()
    await capture(page, 'real-12-comparar.jpg')

    // Misma zona en A y B: no hay veredicto.
    await selects.nth(1).selectOption('jaen')
    await expect(page.locator('.ot-compare-controls')).toContainText('Elige dos zonas distintas')
    await expect(workspace.locator('.ot-compare__verdict')).toHaveCount(0)
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
    await clickLabel(page, '.ot-layer-panel', 'Vista General')
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
