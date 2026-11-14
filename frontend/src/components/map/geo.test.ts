import { describe, expect, it } from 'vitest'
import type { BBox } from '../../types/manifest'
import {
  CANARIAS_VIEW_BOUNDS,
  SPAIN_VIEW_BOUNDS,
  bboxToLatLngBounds,
  bboxToLeafletCorners,
  isUsableBBox,
} from './geo'

const JAEN: BBox = [-3.86, 37.69, -3.61, 37.9]

describe('bboxToLeafletCorners', () => {
  it('convierte [w,s,e,n] a [[s,w],[n,e]] sin invertir el orden', () => {
    expect(bboxToLeafletCorners(JAEN)).toEqual([
      [37.69, -3.86],
      [37.9, -3.61],
    ])
  })

  it('conserva las cuatro coordenadas aunque sean negativas', () => {
    const bbox: BBox = [-18.5, 27.5, -13.0, 29.5]
    expect(bboxToLeafletCorners(bbox)).toEqual([
      [27.5, -18.5],
      [29.5, -13.0],
    ])
  })
})

describe('bboxToLatLngBounds', () => {
  it('crea bounds de Leaflet con las esquinas correctas', () => {
    const bounds = bboxToLatLngBounds(JAEN)
    expect(bounds.getWest()).toBe(-3.86)
    expect(bounds.getSouth()).toBe(37.69)
    expect(bounds.getEast()).toBe(-3.61)
    expect(bounds.getNorth()).toBe(37.9)
  })
})

describe('isUsableBBox', () => {
  it('acepta un bbox normal', () => {
    expect(isUsableBBox(JAEN)).toBe(true)
  })

  it('rechaza valores invertidos, incompletos o no finitos', () => {
    expect(isUsableBBox([0, 1, -1, 2])).toBe(false)
    expect(isUsableBBox([0, 2, 1, 1])).toBe(false)
    expect(isUsableBBox([0, 1, 2] as unknown as BBox)).toBe(false)
    expect(isUsableBBox([0, 1, Number.NaN, 2])).toBe(false)
    expect(isUsableBBox(null)).toBe(false)
    expect(isUsableBBox(undefined)).toBe(false)
  })
})

describe('vistas de España', () => {
  it('la vista nacional incluye la Península y Baleares', () => {
    expect(SPAIN_VIEW_BOUNDS[0]).toBeLessThanOrEqual(-9.2)
    expect(SPAIN_VIEW_BOUNDS[2]).toBeGreaterThanOrEqual(4.3)
    expect(SPAIN_VIEW_BOUNDS[1]).toBeLessThanOrEqual(36)
    expect(SPAIN_VIEW_BOUNDS[3]).toBeGreaterThanOrEqual(43.7)
  })

  it('la vista de Canarias está fuera de la Península y es alcanzable por control', () => {
    expect(CANARIAS_VIEW_BOUNDS[0]).toBeLessThan(SPAIN_VIEW_BOUNDS[0])
    expect(CANARIAS_VIEW_BOUNDS[1]).toBeGreaterThanOrEqual(27.5)
  })
})
