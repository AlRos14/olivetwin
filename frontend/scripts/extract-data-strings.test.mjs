/**
 * Tests del extractor y del catálogo inglés de los datos publicados.
 *
 * Cubren la selección de cadenas mostrables (exclusiones técnicas), la fusión
 * del catálogo (`--write`) y las comprobaciones que ejecuta
 * `npm run validate:data`.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  catalogErrors,
  emptyCatalog,
  extractDataStrings,
  extractDisplayStrings,
  isDisplayString,
  mergeCatalog,
  serializeCatalog,
} from './extract-data-strings.mjs'
import { collectUnitValues, siUnitErrors } from './validate-lib.mjs'

/** Directorios temporales creados por los tests. */
const temporaryDirs = []

async function makeDataDir(files) {
  const root = await mkdtemp(path.join(tmpdir(), 'olivetwin-i18n-'))
  temporaryDirs.push(root)
  for (const [relativePath, content] of Object.entries(files)) {
    const file = path.join(root, relativePath)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(content), 'utf8')
  }
  return root
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('isDisplayString', () => {
  it('acepta texto libre en español', () => {
    expect(isDisplayString('title', 'Humedad superficial (NISAR SME2)')).toBe(true)
    expect(isDisplayString('label', 'Más seco')).toBe(true)
    expect(isDisplayString('ugrRow', '5,6-5,9 y 8,2-8,3')).toBe(true)
  })

  it('descarta claves y valores técnicos', () => {
    expect(isDisplayString('id', 'jaen')).toBe(false)
    expect(isDisplayString('unit', 'm³/m³')).toBe(false)
    expect(isDisplayString('image', 'data/real/zones/jaen/a.png')).toBe(false)
    expect(isDisplayString('referenceUrl', 'https://example.org')).toBe(false)
    expect(isDisplayString('note', 'https://example.org/x')).toBe(false)
    expect(isDisplayString('note', '2026-10-19T11:19:03Z')).toBe(false)
    expect(isDisplayString('note', '2026-08-19 → 2026-08-31')).toBe(false)
    expect(isDisplayString('note', 'data/real/zones/jaen/x.png')).toBe(false)
    expect(isDisplayString('version', '1.0.11')).toBe(false)
    expect(isDisplayString('ugrRow', '--')).toBe(false)
    expect(isDisplayString('processingVersion', 'P05023')).toBe(false)
    expect(isDisplayString('acquisitionDate', '2026-06-20')).toBe(false)
  })
})

describe('extractDisplayStrings', () => {
  it('recorre el documento y excluye ids, colores, enums y tablas técnicas', () => {
    const document = {
      appTitle: 'OliveTwin',
      schemaVersion: '1.3.0',
      pipeline: { name: 'olivetwin-analysis', source: 'pipelines/analysis/build_analysis.py' },
      zones: [
        {
          id: 'jaen',
          name: 'Jaén',
          description: 'Zona de estudio olivarera',
          layers: [
            {
              id: 'soil-moisture',
              title: 'Humedad superficial (NISAR SME2)',
              unit: 'm³/m³',
              imageCrs: 'EPSG:3857',
              legend: [{ value: 0.05, color: '#a6611a', label: 'Más seco' }],
            },
          ],
        },
      ],
      variables: [
        {
          id: 'ndvi',
          title: 'NDVI (Sentinel-2)',
          unit: '1',
          description: 'Índice de vegetación',
          steps: [{ date: '2026-06-20', provenance: { note: 'Mosaico de 2 teselas' } }],
        },
      ],
      crops: [
        {
          id: 'olivo',
          name: 'Olivo',
          factors: [
            {
              id: 'textura',
              label: 'Textura del suelo',
              variables: ['soil-clay', 'soil-sand'],
              parameters: { usdaClass: { sand: 'N' }, ratings: { S1: 1 } },
            },
          ],
        },
      ],
    }

    expect([...extractDisplayStrings(document)].sort()).toEqual(
      [
        'Humedad superficial (NISAR SME2)',
        'Jaén',
        'Mosaico de 2 teselas',
        'NDVI (Sentinel-2)',
        'OliveTwin',
        'Olivo',
        'Textura del suelo',
        'Zona de estudio olivarera',
        'Índice de vegetación',
        'Más seco',
      ].sort(),
    )
  })
})

describe('mergeCatalog', () => {
  it('conserva traducciones, añade null y elimina obsoletas', () => {
    const { entries, added, removed } = mergeCatalog({
      texts: ['Humedad superficial', 'Texto nuevo', 'Arena'],
      entries: {
        'Humedad superficial': 'Surface soil moisture',
        'Texto antiguo': 'Old text',
      },
    })

    expect(entries).toEqual({
      'Arena': null,
      'Humedad superficial': 'Surface soil moisture',
      'Texto nuevo': null,
    })
    expect(added.sort()).toEqual(['Arena', 'Texto nuevo'])
    expect(removed).toEqual(['Texto antiguo'])
    expect(Object.keys(entries)).toEqual([...Object.keys(entries)].sort())
  })

  it('serializa con la forma del catálogo y UTF-8', () => {
    const output = serializeCatalog(emptyCatalog())
    expect(JSON.parse(output)).toEqual({ sourceLocale: 'es', locale: 'en', entries: {} })
    expect(output.endsWith('\n')).toBe(true)
  })
})

describe('catalogErrors', () => {
  it('acepta un catálogo completo', () => {
    const catalog = {
      sourceLocale: 'es',
      locale: 'en',
      entries: { 'Humedad superficial': 'Surface soil moisture', 'Olivo': 'Olive' },
    }
    expect(catalogErrors({ catalog, texts: ['Humedad superficial', 'Olivo'] })).toEqual([])
  })

  it('falla si falta una traducción y propone el comando de sincronización', () => {
    const catalog = { sourceLocale: 'es', locale: 'en', entries: { 'Olivo': 'Olive' } }
    const errors = catalogErrors({ catalog, texts: ['Humedad superficial', 'Olivo'] })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Humedad superficial')
    expect(errors[0]).toContain('npm run i18n:data -- --write')
  })

  it('rechaza nulls, locales incorrectos y entradas vacías', () => {
    const catalog = {
      sourceLocale: 'es',
      locale: 'es',
      entries: { 'Olivo': null, 'Trigo': '  ' },
    }
    const errors = catalogErrors({ catalog, texts: ['Olivo', 'Trigo'] })
    expect(errors.some((error) => error.includes('locale debe ser "en"'))).toBe(true)
    expect(errors.some((error) => error.includes('entradas del catálogo no son cadenas'))).toBe(true)
  })
})

describe('extractDataStrings', () => {
  it('recorre los JSON de data/real sin leer el propio catálogo', async () => {
    const dataDir = await makeDataDir({
      'manifest.json': { appTitle: 'OliveTwin', zones: [{ id: 'jaen', name: 'Jaén' }] },
      'zones/jaen/analysis/analysis.json': {
        variables: [
          {
            id: 'ndvi',
            title: 'NDVI (Sentinel-2)',
            unit: '1',
            description: 'Índice de vegetación',
          },
        ],
      },
      'i18n/en.json': {
        sourceLocale: 'es',
        locale: 'en',
        entries: { 'No debe extraerse': 'Must not be extracted' },
      },
    })

    const texts = await extractDataStrings({ dataDir })
    expect(texts).toEqual(['Jaén', 'NDVI (Sentinel-2)', 'OliveTwin', 'Índice de vegetación'])
    expect(texts).not.toContain('No debe extraerse')
  })
})

describe('siUnitErrors', () => {
  it('recoge las unidades anidadas con su ruta', () => {
    expect(
      collectUnitValues({
        layers: [{ unit: 'm³/m³' }],
        variables: [{ unit: '°C' }, { unit: '1' }],
      }),
    ).toEqual([
      { path: '/layers/0/unit', unit: 'm³/m³' },
      { path: '/variables/0/unit', unit: '°C' },
      { path: '/variables/1/unit', unit: '1' },
    ])
  })

  it('acepta el SI y las unidades aceptadas', () => {
    const document = {
      variables: [
        { unit: '1' },
        { unit: 'm' },
        { unit: 'mm' },
        { unit: 'km' },
        { unit: 'm³/m³' },
        { unit: 'g/kg' },
        { unit: '°C' },
        { unit: '°' },
        { unit: '%' },
        { unit: 'dB' },
        { unit: 'd' },
        { unit: 'ha' },
        { unit: 'pH' },
      ],
    }
    expect(siUnitErrors(document)).toEqual([])
  })

  it('rechaza unidades anglosajonas o derivadas', () => {
    const errors = siUnitErrors({
      variables: [{ unit: 'mm/año' }, { unit: 'in' }, { unit: '°F' }],
      crops: [{ factors: [{ parameters: { unit: 'ac' } }] }],
    })
    expect(errors.map((error) => error.path)).toEqual([
      '/variables/0/unit',
      '/variables/1/unit',
      '/variables/2/unit',
      '/crops/0/factors/0/parameters/unit',
    ])
    expect(errors[0].message).toContain('mm/año')
  })
})
