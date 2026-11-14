/**
 * AT-17 · build estática bajo subruta `/olivetwin/`.
 *
 * Se ejecuta con una build específica (`vite build --base /olivetwin/`) servida
 * por `vite preview --base /olivetwin/ --port 4174`. Comprueba que el
 * manifiesto real, los PNG y el overlay se piden bajo la subruta y que la
 * línea temporal sigue funcionando.
 */
import { expect, test } from '@playwright/test'
import {
  capture,
  getMap,
  installMapProbe,
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
  const layer = jaen.layers.find((candidate) => candidate.id === 'soil-moisture')!
  const steps = layer.timeSteps ?? []
  expect(steps).toHaveLength(3)

  // Autoselección de Jaén y último paso temporal.
  await expect(page.locator('.ot-zone-selector select')).toHaveValue('jaen')
  const overlaySrc = await page.locator('img.olive-scientific-overlay').getAttribute('src')
  expect(overlaySrc).toBe(`/olivetwin/${steps[2]!.image}`)
  await expect(page.locator('.ot-time-slider input[type="range"]')).toHaveValue('2')

  const pngResponse = responses.find((entry) =>
    new RegExp(
      `/olivetwin/${steps[2]!.image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
    ).test(entry.url),
  )
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
  const map = await getMap(page, layer.bbox)
  expect(map.zoom).toBeGreaterThanOrEqual(11)
  await capture(page, 'real-09-subruta.jpg')
})
