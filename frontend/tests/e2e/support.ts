/**
 * Utilidades compartidas por las pruebas E2E de OliveTwin (INT02).
 *
 * Estas pruebas NO forman parte de Vitest: su patrón es `*.spec.ts` y se
 * ejecutan con un harness de Playwright externo al repositorio. Ver
 * `frontend/tests/e2e/README.md` para el procedimiento completo.
 *
 * El harness inyecta `QA_DOCS_DIR` (directorio `docs/qa/` del repo) y
 * `OLIVE_BASE_URL` (servidor de `vite preview`). Así los specs no dependen del
 * directorio de trabajo desde el que se lance Playwright.
 */
import { expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

export const BASE_URL = process.env.OLIVE_BASE_URL ?? 'http://localhost:4173'

/** Directorio del repositorio, derivado de `docs/qa/` inyectado por el harness. */
export function repoDir(): string {
  const docsQa = process.env.QA_DOCS_DIR
  if (!docsQa) {
    throw new Error('QA_DOCS_DIR no está definido: ejecuta los specs con el harness de Playwright.')
  }
  return path.resolve(docsQa, '..', '..')
}

export function docsQaDir(): string {
  const docsQa = process.env.QA_DOCS_DIR
  if (!docsQa) {
    throw new Error('QA_DOCS_DIR no está definido: ejecuta los specs con el harness de Playwright.')
  }
  return docsQa
}

/**
 * Expone el `L.Map` de Leaflet en `window.__oliveMap` sin tocar el código de la
 * aplicación. Leaflet 1.9.4 (UMD) asigna `window.L`; interceptamos esa
 * asignación para envolver `Map.prototype.initialize`. Es solo instrumentación
 * de QA: el bundle servido es exactamente el de `vite build`.
 */
export async function installMapProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let leaflet: unknown
    Object.defineProperty(window, 'L', {
      configurable: true,
      get() {
        return leaflet
      },
      set(value: unknown) {
        leaflet = value
        try {
          const mod = value as {
            Map?: { prototype: { initialize?: (...args: unknown[]) => unknown } }
          }
          const proto = mod.Map?.prototype
          if (!proto || typeof proto.initialize !== 'function') return
          const original = proto.initialize
          proto.initialize = function (this: unknown, ...args: unknown[]) {
            ;(window as unknown as { __oliveMap?: unknown }).__oliveMap = this
            return original.apply(this, args)
          }
        } catch {
          // Si Leaflet cambiara su API, las pruebas dependientes de `__oliveMap`
          // fallan con un mensaje explícito en `getMap()`.
        }
      },
    })
  })
}

/** Espera a que el mapa base haya pintado al menos una tesela. */
export async function waitForTiles(page: Page): Promise<void> {
  await expect
    .poll(() => page.locator('img.leaflet-tile-loaded').count(), { timeout: 45_000 })
    .toBeGreaterThan(0)
}

/** Abre la aplicación, espera el manifiesto de muestra y el primer tile. */
export async function openApp(page: Page, options: { waitTiles?: boolean } = {}): Promise<void> {
  await installMapProbe(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.ot-status')).not.toContainText('Cargando datos…')
  await expect(page.locator('.ot-zone-selector select')).toBeEnabled()
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Boolean((window as unknown as { __oliveMap?: unknown }).__oliveMap),
        ),
      { timeout: 15_000 },
    )
    .toBe(true)
  if (options.waitTiles !== false) {
    await waitForTiles(page)
  }
}

export interface MapSnapshot {
  center: { lat: number; lng: number }
  zoom: number
  /** Proyección del bbox solicitado a coordenadas del contenedor. */
  projected: { left: number; top: number; right: number; bottom: number }
  container: { left: number; top: number; width: number; height: number }
}

/** Lee del mapa real el centro, el zoom y la proyección de un bbox. */
export async function getMap(page: Page, bbox: number[] = [0, 0, 0, 0]): Promise<MapSnapshot> {
  return page.evaluate((inputBbox) => {
    const map = (
      window as unknown as {
        __oliveMap?: {
          getCenter: () => { lat: number; lng: number }
          getZoom: () => number
          latLngToContainerPoint: (latlng: [number, number]) => { x: number; y: number }
        }
      }
    ).__oliveMap
    if (!map) {
      throw new Error('window.__oliveMap no está disponible: el probe de Leaflet no se instaló.')
    }
    const container = document.querySelector('.olive-map')
    if (!(container instanceof HTMLElement)) {
      throw new Error('No se encontró el contenedor .olive-map.')
    }
    const rect = container.getBoundingClientRect()
    const center = map.getCenter()
    const [west, south, east, north] = inputBbox
    const nw = map.latLngToContainerPoint([north, west])
    const se = map.latLngToContainerPoint([south, east])
    return {
      center: { lat: center.lat, lng: center.lng },
      zoom: map.getZoom(),
      projected: { left: nw.x, top: nw.y, right: se.x, bottom: se.y },
      container: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    }
  }, bbox)
}

/** Centra el mapa en una coordenada usando la instancia real de Leaflet. */
export async function panMap(page: Page, lat: number, lng: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ lat: nextLat, lng: nextLng, zoom: nextZoom }) => {
      const map = (
        window as unknown as {
          __oliveMap?: {
            setView: (latlng: [number, number], zoom: number, options?: { animate?: boolean }) => void
          }
        }
      ).__oliveMap
      if (!map) throw new Error('window.__oliveMap no está disponible.')
      map.setView([nextLat, nextLng], nextZoom, { animate: false })
    },
    { lat, lng, zoom },
  )
  await page.waitForTimeout(400)
}

/** Pulsa una opción de un grupo de radios/etiquetas por su texto visible. */
export async function clickLabel(page: Page, scope: string, text: string): Promise<void> {
  await page.locator(`${scope} label`, { hasText: text }).first().click()
}

/** Selecciona una zona del `<select>` y espera su overlay cargado. */
export async function selectZone(page: Page, zoneId: string): Promise<void> {
  await page.selectOption('.ot-zone-selector select', zoneId)
  await waitForOverlay(page)
}

export async function waitForOverlay(page: Page, count = 1): Promise<void> {
  const overlays = page.locator('img.olive-scientific-overlay')
  await expect(overlays).toHaveCount(count)
  if (count === 0) return
  await expect
    .poll(
      () =>
        overlays.first().evaluate((element) => {
          const img = element as HTMLImageElement
          return img.complete && img.naturalWidth > 0
        }),
      { timeout: 20_000 },
    )
    .toBe(true)
}

/** Cambia el slider de opacidad (0–100) como lo haría el usuario. */
export async function setOpacity(page: Page, percent: number): Promise<void> {
  await page.locator('.ot-range').evaluate((element, value) => {
    const input = element as HTMLInputElement
    input.value = String(value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, percent)
  await expect(page.locator('.ot-range + output')).toHaveText(`${percent} %`)
}

/** Captura de pantalla en `docs/qa/`; JPEG calidad 70 para mantener < 500 KB. */
export async function capture(
  page: Page,
  name: string,
  options: { fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number } } = {},
): Promise<string> {
  const target = path.join(docsQaDir(), name)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const jpeg = /\.jpe?g$/i.test(name)
  await page.screenshot({
    path: target,
    fullPage: options.fullPage ?? false,
    ...(options.clip ? { clip: options.clip } : {}),
    ...(jpeg ? { type: 'jpeg' as const, quality: 70 } : { type: 'png' as const }),
  })
  return target
}

/** Captura el recuadro de un elemento (evita PNG grandes de toda la vista). */
export async function captureElement(page: Page, selector: string, name: string): Promise<string> {
  const target = path.join(docsQaDir(), name)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const locator = page.locator(selector)
  await locator.scrollIntoViewIfNeeded()
  const jpeg = /\.jpe?g$/i.test(name)
  await locator.screenshot({
    path: target,
    ...(jpeg ? { type: 'jpeg' as const, quality: 70 } : { type: 'png' as const }),
  })
  return target
}

/** Manifiesto y bbox del contrato, leídos del repositorio para las aserciones. */
export function readSampleManifest(): {
  zones: Array<{
    id: string
    name: string
    bbox: number[]
    layers: Array<{ id: string; image: string; bbox: number[]; unit: string; title: string }>
  }>
} {
  return JSON.parse(
    fs.readFileSync(path.join(repoDir(), 'frontend/public/data/sample/manifest.json'), 'utf8'),
  )
}
