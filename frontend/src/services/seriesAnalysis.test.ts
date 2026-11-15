import { describe, expect, it } from 'vitest'

import type { AnalysisVariable, ZoneSeries } from '../types/analysis'
import { preferredVariable } from './analysisService'
import {
  changeSummary,
  climateSummary,
  linearTrend,
  MAX_SAMPLES,
  rainBefore,
  rangeIndices,
  sampleIndices,
  unitLabel,
} from './seriesAnalysis'

const steps = [
  { date: '2026-06-20T05:00:00Z' },
  { date: '2026-07-02T05:00:00Z' },
  { date: '2026-07-14T05:00:00Z' },
  { date: '2026-07-26T05:00:00Z' },
  { date: '2026-08-19T05:00:00Z' },
  { date: '2026-08-31T05:00:00Z' },
  { date: '2026-09-12T05:00:00Z' },
]

describe('rangeIndices', () => {
  it('devuelve el intervalo inclusivo en cualquier orden y omite pasos sin fecha', () => {
    expect(rangeIndices(steps, 1, 3)).toEqual([1, 2, 3])
    expect(rangeIndices(steps, 3, 1)).toEqual([1, 2, 3])
    expect(rangeIndices(steps, -5, 99)).toHaveLength(steps.length)
    expect(rangeIndices([{ date: null }, { date: '2026-06-01' }], 0, 1)).toEqual([1])
  })
})

describe('sampleIndices', () => {
  it('si hay menos fechas que las pedidas, devuelve todas', () => {
    const result = sampleIndices(steps, [0, 1, 2], 6)
    expect(result.indices).toEqual([0, 1, 2])
    expect(result.available).toBe(3)
    expect(result.requested).toBe(6)
  })

  it('reparte uniformemente en el tiempo incluyendo los extremos', () => {
    const result = sampleIndices(steps, [0, 1, 2, 3, 4, 5, 6], 3)
    expect(result.indices[0]).toBe(0)
    expect(result.indices[2]).toBe(6)
    // El objetivo central (≈ 1 ago) cae más cerca del 26 jul (índice 3) que del 19 ago.
    expect(result.indices[1]).toBe(3)
    expect(result.spacingDays).toBeCloseTo(42, 0)
  })

  it('nunca supera el máximo y con una sola imagen elige la última fecha', () => {
    expect(sampleIndices(steps, [0, 1, 2, 3, 4, 5, 6], 100).requested).toBe(MAX_SAMPLES)
    expect(sampleIndices(steps, [0, 1, 2], 1).indices).toEqual([2])
    expect(sampleIndices(steps, [], 4).indices).toEqual([])
  })
})

describe('linearTrend', () => {
  it('calcula la pendiente por 30 días y R²', () => {
    const day = 86_400_000
    const points = [0, 30, 60, 90].map((d, i) => ({ time: d * day, value: 0.3 - 0.01 * i }))
    const trend = linearTrend(points)
    expect(trend.slopePer30Days).toBeCloseTo(-0.01)
    expect(trend.r2).toBeCloseTo(1)
    expect(linearTrend(points.slice(0, 2)).slopePer30Days).toBeNull()
  })
})

describe('changeSummary', () => {
  it('cuenta subidas, bajadas y estables solo en celdas comparables', () => {
    const before = new Float32Array([0.1, 0.2, 0.3, Number.NaN])
    const after = new Float32Array([0.2, 0.2, 0.1, 0.4])
    const summary = changeSummary(before, after, 0.05)
    expect(summary.increased).toBeCloseTo(1 / 3)
    expect(summary.decreased).toBeCloseTo(1 / 3)
    expect(summary.stable).toBeCloseTo(1 / 3)
    expect(summary.comparable).toBeCloseTo(0.75)
    expect(summary.meanDelta).toBeCloseTo((0.1 + 0 - 0.2) / 3)
  })
})

describe('clima de la zona', () => {
  const series: ZoneSeries[] = [
    {
      id: 'precipitation', title: 'Lluvia', unit: 'mm', chart: 'bar',
      provenance: { provider: 'p', product: 'p', processingVersion: 'p', license: 'l' },
      points: [
        { date: '2026-06-14', value: 10 },
        { date: '2026-06-18', value: 2 },
        { date: '2026-06-20', value: 0.5 },
        { date: '2026-06-25', value: 7 },
      ],
    },
    {
      id: 'temperature-max', title: 'Máx', unit: '°C', chart: 'line',
      provenance: { provider: 'p', product: 'p', processingVersion: 'p', license: 'l' },
      points: [{ date: '2026-06-20', value: 30 }, { date: '2026-06-25', value: 34 }],
    },
  ]

  it('rainBefore suma los días previos incluido el de la fecha', () => {
    expect(rainBefore(series, '2026-06-20T05:00:00Z', 7)).toBeCloseTo(12.5)
    expect(rainBefore(series, '2026-06-20T05:00:00Z', 1)).toBeCloseTo(0.5)
    expect(rainBefore(undefined, '2026-06-20', 7)).toBeNull()
  })

  it('climateSummary resume el intervalo', () => {
    const summary = climateSummary(series, '2026-06-18T00:00:00Z', '2026-06-25T00:00:00Z')
    expect(summary.precipitationTotal).toBeCloseTo(9.5)
    expect(summary.rainyDays).toBe(2)
    expect(summary.tMaxMean).toBeCloseTo(32)
    expect(summary.days).toBe(8)
    expect(summary.et0Total).toBeNull()
  })
})

describe('preferredVariable', () => {
  const variable = (id: string, temporal = true) => ({ id, temporal }) as unknown as AnalysisVariable

  it('prefiere la humedad completa, luego la filtrada y si no la primera aceptable', () => {
    expect(preferredVariable([variable('ndvi'), variable('soil-moisture'), variable('soil-moisture-all')])?.id).toBe('soil-moisture-all')
    expect(preferredVariable([variable('ndvi'), variable('soil-moisture')])?.id).toBe('soil-moisture')
    expect(preferredVariable([variable('slope', false), variable('ndvi')], (v) => v.temporal)?.id).toBe('ndvi')
    expect(preferredVariable([])).toBeNull()
  })
})


describe('unitLabel', () => {
  it('muestra las cantidades adimensionales y la lluvia anual como lámina en mm', () => {
    expect(unitLabel('1')).toBe('adimensional')
    expect(unitLabel('adimensional')).toBe('adimensional')
    expect(unitLabel('adimensional (0–1)')).toBe('adimensional')
    expect(unitLabel('fracción')).toBe('adimensional')
    expect(unitLabel('mm/año')).toBe('mm')
    expect(unitLabel('m³/m³')).toBe('m³/m³')
    expect(unitLabel('°C')).toBe('°C')
    expect(unitLabel(null)).toBe('')
  })
})
