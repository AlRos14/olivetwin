import { describe, expect, it } from 'vitest'

import type { BBox, TimeStep } from '../types/manifest'
import { manifestSemanticErrors } from './manifestSemantics'
import {
  makeLayer,
  makeManifest,
  makeTimeStep,
  makeZone,
} from './__fixtures__/manifestFixtures'

const ZONE_BBOX: BBox = [-3.86, 37.69, -3.61, 37.9]

describe('manifestSemanticErrors', () => {
  it('no reporta nada para un manifiesto coherente', () => {
    const manifest = makeManifest('sample', [
      makeZone('jaen-demo', [makeLayer()]),
      makeZone('toledo-demo', [makeLayer()]),
    ])
    expect(manifestSemanticErrors(manifest)).toEqual([])
  })

  it('acepta un layer.bbox dentro de la tolerancia de 0.01°', () => {
    const outsideByTolerance: BBox = [-3.865, 37.69, -3.61, 37.9]
    const manifest = makeManifest('sample', [
      makeZone('jaen-demo', [makeLayer('ndvi', { bbox: outsideByTolerance })]),
    ])
    expect(manifestSemanticErrors(manifest)).toEqual([])
  })

  it('detecta un id de zona duplicado', () => {
    const manifest = makeManifest('sample', [
      makeZone('jaen-demo', [makeLayer()]),
      makeZone('jaen-demo', [makeLayer()]),
    ])
    const errors = manifestSemanticErrors(manifest)
    expect(errors.some((message) => /duplicado/.test(message))).toBe(true)
  })

  it('detecta un zone.bbox con west ≥ east', () => {
    const manifest = makeManifest('sample', [
      makeZone('jaen-demo', [makeLayer()], {
        bbox: [-3.61, 37.69, -3.86, 37.9],
      }),
    ])
    const errors = manifestSemanticErrors(manifest)
    expect(errors.some((message) => /west/.test(message))).toBe(true)
  })

  it('detecta un zone.bbox con south ≥ north', () => {
    const manifest = makeManifest('sample', [
      makeZone('jaen-demo', [makeLayer()], {
        bbox: [-3.86, 37.9, -3.61, 37.69],
      }),
    ])
    const errors = manifestSemanticErrors(manifest)
    expect(errors.some((message) => /south/.test(message))).toBe(true)
  })

  it('detecta un layer.bbox fuera de zone.bbox', () => {
    const farAway: BBox = [ZONE_BBOX[0] - 0.5, ZONE_BBOX[1], ZONE_BBOX[2], ZONE_BBOX[3]]
    const manifest = makeManifest('sample', [
      makeZone('jaen-demo', [makeLayer('ndvi', { bbox: farAway })]),
    ])
    const errors = manifestSemanticErrors(manifest)
    expect(errors.some((message) => /fuera de la zona/.test(message))).toBe(true)
  })
})

describe('manifestSemanticErrors — timeSteps (v1.2.0)', () => {
  function layerWithSteps(dates: string[], overrides = {}) {
    const steps: TimeStep[] = dates.map((date, index) =>
      makeTimeStep(date, {
        image: `data/sample/zones/jaen-demo/ndvi-${index}.png`,
      }),
    )
    const last = steps[steps.length - 1]
    return makeLayer('ndvi', {
      image: last.image,
      bbox: last.bbox,
      timeSteps: steps,
      ...overrides,
    })
  }

  it('no reporta nada para una serie ordenada con el último paso igual a la capa', () => {
    const manifest = makeManifest(
      'sample',
      [makeZone('jaen-demo', [layerWithSteps(['2026-09-01', '2026-10-01', '2026-11-01'])])],
      { schemaVersion: '1.2.0' },
    )
    expect(manifestSemanticErrors(manifest)).toEqual([])
  })

  it('detecta una fecha duplicada', () => {
    const manifest = makeManifest(
      'sample',
      [makeZone('jaen-demo', [layerWithSteps(['2026-10-01', '2026-10-01'])])],
      { schemaVersion: '1.2.0' },
    )
    const errors = manifestSemanticErrors(manifest)
    expect(errors.some((message) => /repite la fecha/.test(message))).toBe(true)
  })

  it('detecta pasos fuera de orden', () => {
    const manifest = makeManifest(
      'sample',
      [makeZone('jaen-demo', [layerWithSteps(['2026-10-01', '2026-09-01'])])],
      { schemaVersion: '1.2.0' },
    )
    const errors = manifestSemanticErrors(manifest)
    expect(errors.some((message) => /orden estrictamente creciente/.test(message))).toBe(true)
  })

  it('detecta un paso con bbox fuera de la zona', () => {
    const badStep = makeTimeStep('2026-09-01', {
      image: 'data/sample/zones/jaen-demo/ndvi-0.png',
      bbox: [-4.5, 37.69, -3.61, 37.9],
    })
    const lastStep = makeTimeStep('2026-10-01', {
      image: 'data/sample/zones/jaen-demo/ndvi-1.png',
    })
    const layer = makeLayer('ndvi', {
      image: lastStep.image,
      bbox: lastStep.bbox,
      timeSteps: [badStep, lastStep],
    })
    const manifest = makeManifest(
      'sample',
      [makeZone('jaen-demo', [layer])],
      { schemaVersion: '1.2.0' },
    )
    const errors = manifestSemanticErrors(manifest)
    expect(errors.some((message) => /bbox fuera de la zona/.test(message))).toBe(true)
  })

  it('detecta que layer.image no coincide con el último paso', () => {
    const steps = [
      makeTimeStep('2026-09-01', {
        image: 'data/sample/zones/jaen-demo/ndvi-0.png',
      }),
      makeTimeStep('2026-10-01', {
        image: 'data/sample/zones/jaen-demo/ndvi-1.png',
      }),
    ]
    const layer = makeLayer('ndvi', {
      image: 'data/sample/zones/jaen-demo/ndvi-0.png',
      bbox: steps[0].bbox,
      timeSteps: steps,
    })
    const manifest = makeManifest(
      'sample',
      [makeZone('jaen-demo', [layer])],
      { schemaVersion: '1.2.0' },
    )
    const errors = manifestSemanticErrors(manifest)
    expect(errors.some((message) => /distinto del último paso temporal/.test(message))).toBe(true)
  })

  it('detecta que layer.bbox no coincide con el último paso', () => {
    const steps = [
      makeTimeStep('2026-09-01', {
        image: 'data/sample/zones/jaen-demo/ndvi-0.png',
      }),
      makeTimeStep('2026-10-01', {
        image: 'data/sample/zones/jaen-demo/ndvi-1.png',
        bbox: [-3.8, 37.7, -3.7, 37.8],
      }),
    ]
    const layer = makeLayer('ndvi', {
      image: steps[1].image,
      bbox: steps[0].bbox,
      timeSteps: steps,
    })
    const manifest = makeManifest(
      'sample',
      [makeZone('jaen-demo', [layer])],
      { schemaVersion: '1.2.0' },
    )
    const errors = manifestSemanticErrors(manifest)
    expect(errors.some((message) => /layer.bbox distinto del último paso/.test(message))).toBe(true)
  })

  it('detecta una fecha inválida', () => {
    const manifest = makeManifest(
      'sample',
      [makeZone('jaen-demo', [layerWithSteps(['2026-13-45'])])],
      { schemaVersion: '1.2.0' },
    )
    const errors = manifestSemanticErrors(manifest)
    expect(errors.some((message) => /fecha ISO 8601 real/.test(message))).toBe(true)
  })
})
