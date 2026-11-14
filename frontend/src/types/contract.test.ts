/**
 * Tests del contrato de manifiestos (WP04-01).
 *
 * Cubren el esquema JSON, la validación semántica y la comprobación de PNG
 * (existencia y canal alfa) a través de la librería compartida con la CLI.
 * Los fixtures son material contractual: no son observaciones ni se sirven
 * desde `frontend/public/data/`.
 */
import { describe, expect, it } from 'vitest'

import schema from '../../../contracts/manifest.schema.json'
import validRealProcessed from '../../scripts/fixtures/valid/real-with-processed-real.json'
import validRealEmpty from '../../scripts/fixtures/valid/real-empty.json'
import validSampleEmpty from '../../scripts/fixtures/valid/sample-empty.json'
import validSamplePlan from '../../scripts/fixtures/valid/sample-plan-4.3.json'

import invalidAcquisitionDate from '../../scripts/fixtures/invalid/acquisition-date-impossible.json'
import invalidBboxInverted from '../../scripts/fixtures/invalid/bbox-inverted.json'
import invalidDuplicateZones from '../../scripts/fixtures/invalid/duplicate-zone-ids.json'
import invalidImageAbsolute from '../../scripts/fixtures/invalid/image-absolute-path.json'
import invalidImageCrs from '../../scripts/fixtures/invalid/image-crs-unsupported.json'
import invalidImageExternal from '../../scripts/fixtures/invalid/image-external-url.json'
import invalidImageParent from '../../scripts/fixtures/invalid/image-parent-traversal.json'
import invalidImagePercent from '../../scripts/fixtures/invalid/image-percent-encoded.json'
import invalidImageWrongMode from '../../scripts/fixtures/invalid/image-wrong-mode-directory.json'
import invalidLayerLegendObject from '../../scripts/fixtures/invalid/layer-legend-object.json'
import invalidLayerOutsideZone from '../../scripts/fixtures/invalid/layer-outside-zone.json'
import invalidLegendSingle from '../../scripts/fixtures/invalid/legend-single-stop.json'
import invalidLegendUnordered from '../../scripts/fixtures/invalid/legend-unordered.json'
import invalidMissingSchemaVersion from '../../scripts/fixtures/invalid/missing-schema-version.json'
import invalidRangeInverted from '../../scripts/fixtures/invalid/range-inverted.json'
import invalidStatusProcessedInSample from '../../scripts/fixtures/invalid/status-processed-real-in-sample.json'
import invalidStatusSyntheticInReal from '../../scripts/fixtures/invalid/status-synthetic-in-real.json'
import invalidUnknownMode from '../../scripts/fixtures/invalid/unknown-dataset-mode.json'
import invalidZoneId from '../../scripts/fixtures/invalid/zone-id-not-kebab.json'
import invalidZonesNull from '../../scripts/fixtures/invalid/zones-null.json'

import {
  createManifestValidator,
  isValidAcquisitionDate,
  pngHasAlpha,
  readPngHeader,
  semanticErrors,
} from '../../scripts/validate-lib.mjs'

const validFixtures: { name: string; manifest: unknown }[] = [
  { name: 'sample-empty', manifest: validSampleEmpty },
  { name: 'real-empty', manifest: validRealEmpty },
  { name: 'sample-plan-4.3', manifest: validSamplePlan },
  { name: 'real-with-processed-real', manifest: validRealProcessed },
]

const invalidFixtures: { name: string; manifest: unknown }[] = [
  { name: 'acquisition-date-impossible', manifest: invalidAcquisitionDate },
  { name: 'bbox-inverted', manifest: invalidBboxInverted },
  { name: 'duplicate-zone-ids', manifest: invalidDuplicateZones },
  { name: 'image-absolute-path', manifest: invalidImageAbsolute },
  { name: 'image-crs-unsupported', manifest: invalidImageCrs },
  { name: 'image-external-url', manifest: invalidImageExternal },
  { name: 'image-parent-traversal', manifest: invalidImageParent },
  { name: 'image-percent-encoded', manifest: invalidImagePercent },
  { name: 'image-wrong-mode-directory', manifest: invalidImageWrongMode },
  { name: 'layer-legend-object', manifest: invalidLayerLegendObject },
  { name: 'layer-outside-zone', manifest: invalidLayerOutsideZone },
  { name: 'legend-single-stop', manifest: invalidLegendSingle },
  { name: 'legend-unordered', manifest: invalidLegendUnordered },
  { name: 'missing-schema-version', manifest: invalidMissingSchemaVersion },
  { name: 'range-inverted', manifest: invalidRangeInverted },
  { name: 'status-processed-real-in-sample', manifest: invalidStatusProcessedInSample },
  { name: 'status-synthetic-in-real', manifest: invalidStatusSyntheticInReal },
  { name: 'unknown-dataset-mode', manifest: invalidUnknownMode },
  { name: 'zone-id-not-kebab', manifest: invalidZoneId },
  { name: 'zones-null', manifest: invalidZonesNull },
]

const validator = createManifestValidator({ schema, checkAssets: false })

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Construye un PNG mínimo con la cabecera IHDR indicada (sin CRC válido). */
function pngChunk(type: string, data: number[]): number[] {
  const length = data.length
  return [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...[...type].map((character) => character.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0,
  ]
}

function makePng(colorType: number, { trns = false }: { trns?: boolean } = {}): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const ihdr = [0, 0, 0, 1, 0, 0, 0, 1, 8, colorType, 0, 0, 0]
  return Uint8Array.from([
    ...signature,
    ...pngChunk('IHDR', ihdr),
    ...(trns ? pngChunk('tRNS', [0, 0]) : []),
    ...pngChunk('IDAT', [0]),
    ...pngChunk('IEND', []),
  ])
}

const SAMPLE_IMAGE = 'data/sample/zones/jaen-demo/ndvi.png'

describe('esquema y semántica: fixtures válidos', () => {
  for (const { name, manifest } of validFixtures) {
    it(`acepta ${name}`, async () => {
      const result = await validator(manifest)
      expect(result.errors).toEqual([])
      expect(result.valid).toBe(true)
    })
  }
})

describe('esquema y semántica: fixtures inválidos', () => {
  for (const { name, manifest } of invalidFixtures) {
    it(`rechaza ${name}`, async () => {
      const result = await validator(manifest)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  }
})

describe('reglas semánticas concretas', () => {
  it('explica que west debe ser menor que east', async () => {
    const result = await validator(invalidBboxInverted)
    expect(result.errors.some((error) => /west/.test(error.message))).toBe(true)
  })

  it('detecta una capa fuera del bbox de la zona', async () => {
    const result = await validator(invalidLayerOutsideZone)
    expect(
      result.errors.some((error) => /fuera de zone\.bbox/.test(error.message)),
    ).toBe(true)
  })

  it('detecta ids de zona duplicados', async () => {
    const result = await validator(invalidDuplicateZones)
    expect(result.errors.some((error) => /duplicado/.test(error.message))).toBe(true)
  })

  it('detecta una leyenda desordenada', async () => {
    const result = await validator(invalidLegendUnordered)
    expect(result.errors.some((error) => /ordenada por value/.test(error.message))).toBe(true)
  })

  it('exige que image viva bajo data/<datasetMode>/', async () => {
    const result = await validator(invalidImageWrongMode)
    expect(result.errors.some((error) => /data\/sample\//.test(error.message))).toBe(true)
  })

  it('rechaza cualquier "%" en image para que %2e%2e no se resuelva como ".."', async () => {
    const result = await validator(invalidImagePercent)
    expect(result.valid).toBe(false)
    expect(
      result.errors.some((error) => error.path.endsWith('/image')),
    ).toBe(true)
  })

  it('rechaza una fecha de adquisición imposible (2026-13-45)', async () => {
    const result = await validator(invalidAcquisitionDate)
    expect(result.valid).toBe(false)
    expect(
      result.errors.some((error) =>
        error.path.endsWith('/provenance/acquisitionDate'),
      ),
    ).toBe(true)
  })

  it('la semántica también rechaza una fecha imposible sin depender del esquema', () => {
    const errors = semanticErrors(invalidAcquisitionDate)
    expect(
      errors.some((error) =>
        error.path.endsWith('/provenance/acquisitionDate'),
      ),
    ).toBe(true)
  })

  it.each(['2026-10-19', '2026-10-19T11:19:03Z', '2026-10-19T11:19:03+02:00'])(
    'acepta la fecha de adquisición real %s',
    async (acquisitionDate) => {
      const manifest = clone(validRealProcessed) as {
        zones: { layers: { provenance: Record<string, unknown> }[] }[]
      }
      manifest.zones[0].layers[0].provenance.acquisitionDate = acquisitionDate
      const result = await validator(manifest)
      expect(result.errors).toEqual([])
      expect(result.valid).toBe(true)
    },
  )

  it('rechaza fechas imposibles que Date.parse normalizaría en silencio', () => {
    expect(isValidAcquisitionDate('2026-02-30')).toBe(false)
    expect(isValidAcquisitionDate('2026-04-31')).toBe(false)
    expect(isValidAcquisitionDate('2026-13-45')).toBe(false)
    expect(isValidAcquisitionDate('2026-10-19T24:00:00Z')).toBe(false)
    expect(isValidAcquisitionDate('2026-10-19T11:19:03')).toBe(false)
    expect(isValidAcquisitionDate('')).toBe(false)
    expect(isValidAcquisitionDate(null)).toBe(false)
    expect(isValidAcquisitionDate(20261019)).toBe(false)
  })

  it('acepta fechas reales, incluido el 29 de febrero de un año bisiesto', () => {
    expect(isValidAcquisitionDate('2026-10-19')).toBe(true)
    expect(isValidAcquisitionDate('2026-10-19T11:19:03Z')).toBe(true)
    expect(isValidAcquisitionDate('2024-02-29')).toBe(true)
    expect(isValidAcquisitionDate('2024-02-29T23:59:59.123Z')).toBe(true)
  })

  it('rechaza un datasetMode distinto del esperado por la carpeta', () => {
    const errors = semanticErrors(validSamplePlan, { expectedMode: 'real' })
    expect(errors.some((error) => error.path === '/datasetMode')).toBe(true)
  })

  it('processed_real exige provenance completa (referenceUrl no nula)', async () => {
    const manifest = clone(validRealProcessed) as {
      zones: { layers: { provenance: Record<string, unknown> }[] }[]
    }
    manifest.zones[0].layers[0].provenance.referenceUrl = null
    const result = await validator(manifest)
    expect(result.valid).toBe(false)
    expect(
      result.errors.some((error) => /provenance\.referenceUrl/.test(error.message)),
    ).toBe(true)
  })

  it('sample exige status synthetic y real exige processed_real', async () => {
    const result = await validator(invalidStatusProcessedInSample)
    expect(result.errors.some((error) => /status/.test(error.path))).toBe(true)
  })

  it('rechaza unit vacío o solo espacios', async () => {
    const manifest = clone(validSamplePlan) as {
      zones: { layers: { unit: string }[] }[]
    }
    manifest.zones[0].layers[0].unit = '   '
    const result = await validator(manifest)
    expect(result.valid).toBe(false)
  })

  it('rechaza una versión de contrato fuera de la major 1', async () => {
    const manifest = clone(validSamplePlan) as { schemaVersion: string }
    manifest.schemaVersion = '2.0.0'
    const result = await validator(manifest)
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.path === '/schemaVersion')).toBe(true)
  })
})

describe('PNG: firma, IHDR y canal alfa', () => {
  it('lee ancho, alto y color type de un IHDR válido', () => {
    const header = readPngHeader(makePng(6))
    expect(header).toMatchObject({
      signatureOk: true,
      width: 1,
      height: 1,
      bitDepth: 8,
      colorType: 6,
      hasTrns: false,
    })
  })

  it('acepta RGBA (color type 6) y gris+alfa (color type 4)', () => {
    expect(pngHasAlpha(makePng(6))).toBe(true)
    expect(pngHasAlpha(makePng(4))).toBe(true)
  })

  it('acepta una paleta con tRNS', () => {
    expect(pngHasAlpha(makePng(3, { trns: true }))).toBe(true)
  })

  it('rechaza RGB sin alfa y ficheros con firma incorrecta', () => {
    expect(pngHasAlpha(makePng(2))).toBe(false)
    expect(pngHasAlpha(Uint8Array.from([1, 2, 3, 4]))).toBe(false)
    expect(readPngHeader(Uint8Array.from([1, 2, 3, 4])).signatureOk).toBe(false)
  })
})

describe('assets: existencia y transparencia del PNG', () => {
  it('acepta un PNG existente con canal alfa', async () => {
    const withAssets = createManifestValidator({
      schema,
      checkAssets: true,
      readAsset: (relativePath) => {
        if (relativePath === SAMPLE_IMAGE) {
          return makePng(6)
        }
        throw new Error('asset inesperado')
      },
    })

    const result = await withAssets(validSamplePlan)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rechaza un PNG referenciado que no existe', async () => {
    const withAssets = createManifestValidator({
      schema,
      checkAssets: true,
      readAsset: () => {
        throw new Error('ENOENT')
      },
    })

    const result = await withAssets(validSamplePlan)
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => /no existe el PNG/.test(error.message))).toBe(true)
  })

  it('rechaza un PNG sin canal alfa', async () => {
    const withAssets = createManifestValidator({
      schema,
      checkAssets: true,
      readAsset: () => makePng(2),
    })

    const result = await withAssets(validSamplePlan)
    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => /canal alfa/.test(error.message))).toBe(true)
  })

  it('no comprueba assets cuando checkAssets es false', async () => {
    const withAssets = createManifestValidator({
      schema,
      checkAssets: true,
      readAsset: () => {
        throw new Error('no debería leerse')
      },
    })

    const result = await withAssets(validSamplePlan, { checkAssets: false })
    expect(result.valid).toBe(true)
  })
})
