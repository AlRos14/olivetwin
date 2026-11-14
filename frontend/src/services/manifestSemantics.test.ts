import { describe, expect, it } from 'vitest'

import type { BBox } from '../types/manifest'
import { manifestSemanticErrors } from './manifestSemantics'
import { makeLayer, makeManifest, makeZone } from './__fixtures__/manifestFixtures'

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
