import { describe, expect, it } from 'vitest'

import {
  applyMask,
  commonMask,
  decodeValues,
  difference,
  summarize,
  symmetricRange,
  histogram,
} from './analysisMath'

const NaNv = Number.NaN

describe('analysisMath', () => {
  it('decodifica códigos con scale/offset y nodata → NaN', () => {
    const values = decodeValues(new Uint8Array([0, 100, 255]), 0.0025, 0)
    expect(values[0]).toBe(0)
    expect(values[1]).toBeCloseTo(0.25)
    expect(Number.isNaN(values[2])).toBe(true)
  })

  it('difference propaga NaN', () => {
    const out = difference(new Float32Array([1, NaNv]), new Float32Array([4, 2]))
    expect(out[0]).toBe(3)
    expect(Number.isNaN(out[1])).toBe(true)
  })

  it('commonMask marca solo las celdas con dato en todas las capas y applyMask las aísla', () => {
    const mask = commonMask([new Float32Array([1, NaNv, 3, 4]), new Float32Array([1, 2, NaNv, 4])])
    expect(Array.from(mask)).toEqual([1, 0, 0, 1])
    const masked = applyMask(new Float32Array([5, 6, 7, 8]), mask)
    expect(masked[0]).toBe(5)
    expect(Number.isNaN(masked[1])).toBe(true)
    expect(masked[3]).toBe(8)
  })

  it('histogram reparte las celdas con dato en tramos iguales y acota los extremos', () => {
    const bins = histogram(new Float32Array([0, 0.1, 0.5, 0.95, 2, -1, NaNv]), [0, 1], 4)
    expect(bins.map((bin) => bin.from)).toEqual([0, 0.25, 0.5, 0.75])
    expect(bins.map((bin) => bin.fraction)).toEqual([3 / 6, 0, 1 / 6, 2 / 6])
    expect(histogram(new Float32Array([NaNv]), [0, 1], 2).every((bin) => bin.fraction === 0)).toBe(true)
  })

  it('summarize y symmetricRange', () => {
    const summary = summarize(new Float32Array([1, 2, 3, 4, NaNv]))
    expect(summary.mean).toBe(2.5)
    expect(summary.median).toBe(2.5)
    expect(summary.validFraction).toBeCloseTo(0.8)
    expect([summary.min, summary.max]).toEqual([1, 4])
    expect(summarize(new Float32Array([NaNv])).mean).toBeNull()
    expect(symmetricRange(new Float32Array([-2, 1, NaNv]), 5)).toBeGreaterThan(1)
    expect(symmetricRange(new Float32Array([NaNv]), 5)).toBe(5)
  })
})
