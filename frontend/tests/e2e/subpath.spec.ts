/**
 * AT-17 · build estática bajo subruta `/olivetwin/`.
 *
 * Se ejecuta con una build específica (`vite build --base /olivetwin/`) servida
 * por `vite preview --base /olivetwin/ --port 4174`. Comprueba que el manifiesto
 * y los PNG se piden bajo la subruta y que el overlay se pinta.
 */
import { expect, test } from '@playwright/test'
import {
  capture,
  getMap,
  installMapProbe,
  readSampleManifest,
  selectZone,
  waitForOverlay,
  waitForTiles,
} from './support'

const SUB_URL = process.env.OLIVE_SUB_URL ?? 'http://localhost:4174/olivetwin/'

test('AT-17 · build bajo /olivetwin/: manifiesto, PNG y overlay bajo la subruta', async ({
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
  await expect(page.locator('.ot-zone-selector option')).toHaveCount(3)
  await waitForTiles(page)

  const manifestResponse = responses.find((entry) =>
    /\/olivetwin\/data\/sample\/manifest\.json$/.test(entry.url),
  )
  expect(manifestResponse?.status).toBe(200)

  const sample = readSampleManifest()
  const jaen = sample.zones.find((zone) => zone.id === 'jaen-demo')!
  await selectZone(page, 'jaen-demo')
  await waitForOverlay(page)

  const overlaySrc = await page.locator('img.olive-scientific-overlay').getAttribute('src')
  expect(overlaySrc).toBe('/olivetwin/data/sample/zones/jaen-demo/ndvi.png')

  const pngResponse = responses.find((entry) =>
    /\/olivetwin\/data\/sample\/zones\/jaen-demo\/ndvi\.png$/.test(entry.url),
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

  const map = await getMap(page, jaen.layers[0].bbox)
  expect(map.zoom).toBeGreaterThanOrEqual(11)
  await capture(page, 'at-17-subruta.jpg')
})
