/**
 * AT-17 · build estática bajo subruta `/olivetwin/`.
 *
 * Se ejecuta con una build específica (`vite build --base /olivetwin/`) servida
 * por `vite preview --base /olivetwin/ --port 4174`. Comprueba que el
 * manifiesto real, el cubo de análisis y sus PNG de datos se piden bajo la
 * subruta y que la capa y la línea temporal siguen funcionando.
 */
import { expect, test } from '@playwright/test'
import {
  capture,
  getMap,
  installMapProbe,
  defaultVariable,
  readAnalysis,
  readRealManifest,
  waitForOverlay,
  waitForTiles,
} from './support'

const SUB_URL = process.env.OLIVE_SUB_URL ?? 'http://localhost:4174/olivetwin/'

test('AT-17 · build bajo /olivetwin/: manifiesto real, PNG y overlay bajo la subruta', async ({
  page,
}) => {
  const responses: Array<{ url: string; status: number }> = []
  page.on('response', (response) => {
    if (response.url().includes('/data/')) {
      responses.push({ url: response.url(), status: response.status() })
    }
  })

  await installMapProbe(page)
  await page.goto(SUB_URL, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.ot-status')).not.toContainText('Cargando datos…')
  await expect(page.locator('.ot-zone-selector select')).toBeEnabled()
  await expect(page.locator('.ot-zone-selector option')).toHaveCount(3)
  await waitForOverlay(page)
  await waitForTiles(page)

  const manifestResponse = responses.find((entry) =>
    /\/olivetwin\/data\/real\/manifest\.json$/.test(entry.url),
  )
  expect(manifestResponse?.status).toBe(200)

  const real = readRealManifest()
  const jaen = real.zones.find((zone) => zone.id === 'jaen')!
  const cube = readAnalysis('jaen')
  const steps = defaultVariable(cube).steps
  expect(steps.length).toBeGreaterThanOrEqual(2)

  // Autoselección de Jaén: la capa del cubo se pinta en el navegador en el último paso.
  await expect(page.locator('.ot-zone-selector select')).toHaveValue('jaen')
  await expect(page.locator('img.olive-scientific-overlay')).toHaveAttribute('src', /^data:image\/png/)
  await expect(page.locator('.ot-time-slider input[type="range"]')).toHaveValue(String(steps.length - 1))

  const cubeResponse = responses.find((entry) => entry.url.endsWith(`/olivetwin/${jaen.analysis}`))
  expect(cubeResponse?.status).toBe(200)
  const last = steps[steps.length - 1]!.data
  const pngResponse = responses.find((entry) => entry.url.endsWith(`/olivetwin/${last}`))
  expect(pngResponse?.status).toBe(200)

  // Ningún asset de datos se pidió fuera de la subruta.
  expect(responses.every((entry) => entry.url.includes('/olivetwin/'))).toBe(true)

  // Los assets del bundle también respetan la base.
  const assets = await page.evaluate(() => ({
    scripts: [...document.querySelectorAll('script[src]')].map((node) => node.getAttribute('src')),
    styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((node) =>
      node.getAttribute('href'),
    ),
  }))
  expect(assets.scripts.length).toBeGreaterThan(0)
  expect(assets.scripts.every((src) => src?.startsWith('/olivetwin/'))).toBe(true)
  expect(assets.styles.every((href) => href?.startsWith('/olivetwin/'))).toBe(true)

  // El encuadre de zona puede animarse: se espera a que termine el zoom.
  await expect.poll(async () => (await getMap(page)).zoom).toBeGreaterThanOrEqual(11)
  const map = await getMap(page, cube.grid.bbox)
  expect(map.zoom).toBeGreaterThanOrEqual(11)
  await capture(page, 'real-09-subruta.jpg')
})
