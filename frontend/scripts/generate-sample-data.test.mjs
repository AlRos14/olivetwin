/**
 * Tests del generador de datos de muestra (WP04-02).
 *
 * El generador vive en `scripts/generate-sample-data.mjs` (raíz del repo),
 * pero la configuración de Vitest solo recolecta `frontend/{src,tests,scripts}`
 * (`frontend/vite.config.ts`). Por eso este test vive en `frontend/scripts/`
 * y no requiere tocar la configuración compartida.
 */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PNG } from 'pngjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  IMAGE_WIDTH,
  LAYER_SPECS,
  ZONE_SPECS,
  buildManifest,
  colorAtValue,
  computeGrid,
  generateSampleData,
  latitudeFromMercatorY,
  mercatorY,
  renderLayer,
  serializeManifest,
} from '../../scripts/generate-sample-data.mjs'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(testDir, '..')
const repoRoot = path.resolve(frontendDir, '..')
const committedDataDir = path.join(frontendDir, 'public', 'data')

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

function expectBBox(bbox) {
  expect(bbox).toHaveLength(4)
  const [west, south, east, north] = bbox
  for (const coordinate of bbox) {
    expect(Number.isFinite(coordinate)).toBe(true)
  }
  expect(west).toBeLessThan(east)
  expect(south).toBeLessThan(north)
}

describe('manifiesto de muestra', () => {
  const manifest = buildManifest()

  it('declara el modo sample y las dos zonas ilustrativas', () => {
    expect(manifest.schemaVersion).toBe('1.1.0')
    expect(manifest.datasetMode).toBe('sample')
    expect(manifest.appTitle).toBe('OliveTwin')
    expect(manifest.zones.map((zone) => zone.id)).toEqual(['jaen-demo', 'toledo-demo'])

    for (const zone of manifest.zones) {
      expectBBox(zone.bbox)
      expect(zone.description).toMatch(/no es una parcela real/i)
      expect(zone.layers.map((layer) => layer.id)).toEqual(['ndvi', 'soil-moisture'])
    }
  })

  it('cada capa tiene procedencia sintética explícita y bbox dentro de la zona', () => {
    for (const zone of manifest.zones) {
      for (const layer of zone.layers) {
        expect(layer.kind).toBe('image-overlay')
        expect(layer.status).toBe('synthetic')
        expect(layer.imageCrs).toBe('EPSG:3857')
        expect(layer.image.startsWith('data/sample/zones/')).toBe(true)
        expect(layer.image).not.toMatch(/^\//)
        expect(layer.image).not.toContain('..')
        expect(layer.qualityNote).toBe('NO apto para decisiones agronómicas')
        expect(layer.provenance.provider).toBe('Generador sintético OliveTwin')
        expect(layer.provenance.product).toMatch(/no satelital/)
        expect(layer.provenance.acquisitionDate).toBeNull()
        expect(layer.provenance.sceneId).toBeNull()
        expect(layer.provenance.referenceUrl).toBeNull()
        expect(layer.provenance.processingVersion).toBe('sample-v1')

        expectBBox(layer.bbox)
        const [zoneWest, zoneSouth, zoneEast, zoneNorth] = zone.bbox
        const [west, south, east, north] = layer.bbox
        expect(west).toBeGreaterThanOrEqual(zoneWest)
        expect(south).toBeGreaterThanOrEqual(zoneSouth)
        expect(east).toBeLessThanOrEqual(zoneEast)
        expect(north).toBeLessThanOrEqual(zoneNorth)
      }
    }
  })

  it('la leyenda reproduce la paleta con la que se pinta el PNG', () => {
    for (const zone of manifest.zones) {
      for (const layer of zone.layers) {
        expect(layer.legend.length).toBeGreaterThanOrEqual(3)
        const values = layer.legend.map((stop) => stop.value)
        expect(values).toEqual([...values].sort((a, b) => a - b))
        expect(layer.range[0]).toBe(values[0])
        expect(layer.range[1]).toBe(values[values.length - 1])
        for (const stop of layer.legend) {
          const [r, g, b] = colorAtValue(layer.legend, stop.value)
          const painted = `#${[r, g, b]
            .map((channel) => channel.toString(16).padStart(2, '0'))
            .join('')}`
          expect(painted).toBe(stop.color)
        }
      }
    }

    const ndvi = manifest.zones[0].layers[0]
    const moisture = manifest.zones[0].layers[1]
    expect(ndvi.range).toEqual([0, 1])
    expect(ndvi.unit).toBe('index')
    expect(moisture.range).toEqual([0, 0.5])
    expect(moisture.unit).toBe('m³/m³')
  })
})

describe('cuadrícula Web Mercator', () => {
  it('reparte las filas equiespaciadas en Mercator y de norte a sur', () => {
    const bbox = ZONE_SPECS[0].layerBbox
    const grid = computeGrid({ bbox, width: IMAGE_WIDTH })
    expect(grid.width).toBe(IMAGE_WIDTH)
    expect(grid.height).toBeGreaterThan(1)
    expect(grid.rowLatitudes).toHaveLength(grid.height)

    const [west, south, east, north] = bbox
    const yNorth = mercatorY(north)
    const step = (yNorth - mercatorY(south)) / grid.height

    grid.rowLatitudes.forEach((lat, row) => {
      expect(lat).toBeLessThanOrEqual(north)
      expect(lat).toBeGreaterThanOrEqual(south)
      if (row > 0) {
        expect(lat).toBeLessThan(grid.rowLatitudes[row - 1])
      }
      const expectedY = yNorth - (row + 0.5) * step
      expect(mercatorY(lat)).toBeCloseTo(expectedY, 12)
      expect(latitudeFromMercatorY(mercatorY(lat))).toBeCloseTo(lat, 10)
    })

    expect(east).toBeGreaterThan(west)
  })
})

describe('PNG de las capas', () => {
  it('son RGBA, cubren el bbox y contienen no-data transparente', () => {
    for (const zone of ZONE_SPECS) {
      for (const layer of LAYER_SPECS) {
        const rendered = renderLayer({
          zoneId: zone.id,
          layerId: layer.id,
          bbox: zone.layerBbox,
        })
        const grid = computeGrid({ bbox: zone.layerBbox, width: IMAGE_WIDTH })
        expect(rendered.width).toBe(grid.width)
        expect(rendered.height).toBe(grid.height)
        expect(rendered.buffer.length).toBeLessThan(1024 * 1024)

        const decoded = PNG.sync.read(rendered.buffer)
        expect(decoded.width).toBe(grid.width)
        expect(decoded.height).toBe(grid.height)
        expect(decoded.data).toHaveLength(grid.width * grid.height * 4)

        let transparent = 0
        let unexpectedAlpha = 0
        let coloredTransparent = 0
        for (let offset = 0; offset < decoded.data.length; offset += 4) {
          const alpha = decoded.data[offset + 3]
          if (alpha === 0) {
            transparent += 1
            if (
              decoded.data[offset] !== 0 ||
              decoded.data[offset + 1] !== 0 ||
              decoded.data[offset + 2] !== 0
            ) {
              coloredTransparent += 1
            }
          } else if (alpha !== 255) {
            unexpectedAlpha += 1
          }
        }
        expect(unexpectedAlpha).toBe(0)
        expect(coloredTransparent).toBe(0)
        const ratio = transparent / (grid.width * grid.height)
        expect(ratio).toBeGreaterThan(0.02)
        expect(ratio).toBeLessThan(0.3)
      }
    }
  })

  it('es determinista byte a byte y distinto entre zonas y variables', () => {
    const hashes = new Set()
    for (const zone of ZONE_SPECS) {
      for (const layer of LAYER_SPECS) {
        const options = { zoneId: zone.id, layerId: layer.id, bbox: zone.layerBbox }
        const first = renderLayer(options)
        const second = renderLayer(options)
        expect(first.buffer.equals(second.buffer)).toBe(true)
        hashes.add(sha256(first.buffer))
      }
    }
    // Cuatro imágenes: ninguna debe ser una copia de otra.
    expect(hashes.size).toBe(ZONE_SPECS.length * LAYER_SPECS.length)
  })
})

describe('salida publicada', () => {
  let outputDir
  let secondOutputDir
  let firstRun
  let secondRun

  beforeAll(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), 'olivetwin-sample-a-'))
    secondOutputDir = await mkdtemp(path.join(tmpdir(), 'olivetwin-sample-b-'))
    firstRun = await generateSampleData({ dataDir: outputDir })
    secondRun = await generateSampleData({ dataDir: secondOutputDir })
  })

  afterAll(async () => {
    for (const dir of [outputDir, secondOutputDir]) {
      if (dir) {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })

  it('produce los cuatro PNG y el manifiesto, y no toca un real existente', async () => {
    const pngFiles = firstRun.files.filter((entry) => entry.file.endsWith('.png'))
    expect(pngFiles).toHaveLength(4)
    for (const entry of pngFiles) {
      expect(entry.bytes).toBeGreaterThan(0)
      expect(entry.bytes).toBeLessThan(1024 * 1024)
      expect(entry.noDataPixels).toBeGreaterThan(0)
    }

    const manifest = buildManifest()
    const publishedManifest = await readFile(path.join(outputDir, 'sample', 'manifest.json'), 'utf8')
    expect(publishedManifest).toBe(serializeManifest(manifest))

    const realManifest = JSON.parse(
      await readFile(path.join(outputDir, 'real', 'manifest.json'), 'utf8'),
    )
    expect(realManifest.datasetMode).toBe('real')
    expect(realManifest.zones).toEqual([])
  })

  it('es reproducible entre ejecuciones', async () => {
    const firstManifest = await readFile(path.join(outputDir, 'sample', 'manifest.json'))
    const secondManifest = await readFile(path.join(secondOutputDir, 'sample', 'manifest.json'))
    expect(firstManifest.equals(secondManifest)).toBe(true)

    for (const zone of ZONE_SPECS) {
      for (const layer of LAYER_SPECS) {
        const relative = path.join('sample', 'zones', zone.id, layer.file)
        const first = await readFile(path.join(outputDir, relative))
        const second = await readFile(path.join(secondOutputDir, relative))
        expect(first.equals(second)).toBe(true)
      }
    }
    expect(secondRun.files.map((entry) => entry.bytes)).toEqual(
      firstRun.files.map((entry) => entry.bytes),
    )
  })

  it('coincide con los assets versionados en frontend/public/data', async () => {
    const committedManifest = await readFile(
      path.join(committedDataDir, 'sample', 'manifest.json'),
    )
    expect(sha256(committedManifest)).toBe(sha256(serializeManifest(buildManifest())))

    for (const zone of ZONE_SPECS) {
      for (const layer of LAYER_SPECS) {
        const committed = await readFile(
          path.join(committedDataDir, 'sample', 'zones', zone.id, layer.file),
        )
        const generated = await readFile(
          path.join(outputDir, 'sample', 'zones', zone.id, layer.file),
        )
        expect(sha256(committed)).toBe(sha256(generated))
      }
    }

    const realManifest = JSON.parse(
      await readFile(path.join(committedDataDir, 'real', 'manifest.json'), 'utf8'),
    )
    expect(realManifest.datasetMode).toBe('real')
    expect(realManifest.zones).toEqual([])
  })

  it('mantiene el manifiesto real si ya existe (no destruye datos futuros)', async () => {
    const marker = '{"marcador":"no debe sobrescribirse"}\n'
    const realFile = path.join(outputDir, 'real', 'manifest.json')
    await writeFile(realFile, marker)
    await generateSampleData({ dataDir: outputDir })
    const after = await readFile(realFile, 'utf8')
    expect(after).toBe(marker)
  })
})
