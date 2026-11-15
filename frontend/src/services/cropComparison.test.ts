import { describe, expect, it } from 'vitest'
import { compareZones, suitableShare, type ZoneCropSummary, type ZoneFactorSummary } from './cropComparison'

const shares = { optimal: 0, acceptable: 1, unsuitable: 0, valid: 1 }

function factor(id: string, mean: number | null, limiting = 0): ZoneFactorSummary {
  return { id, label: id, mean, shares, limiting, observed: [`${id} observado`], classes: null }
}

function zone(name: string, mean: number | null, factors: ZoneFactorSummary[], suitable = 0.5): ZoneCropSummary {
  return {
    zoneId: name.toLowerCase(),
    zoneName: name,
    basis: 'farmland',
    farmlandShare: 0.7,
    mean,
    p10: null,
    p90: null,
    bins: [
      { label: 'N', min: 0, max: 0.4, fraction: 0.2 },
      { label: 'S3', min: 0.4, max: 0.6, fraction: 0.3 },
      { label: 'S2', min: 0.6, max: 0.85, fraction: 0.4 },
      { label: 'S1', min: 0.85, max: 1, fraction: 0.1 },
    ],
    suitableShare: suitable,
    factors,
    limiting: [],
    unlimited: 0,
  }
}

describe('cropComparison', () => {
  it('suma la superficie apta (S1 + S2)', () => {
    expect(suitableShare(zone('X', 0, []).bins)).toBeCloseTo(0.5)
  })

  it('decide por la superficie apta si difiere al menos 5 puntos, aunque la media diga otra cosa', () => {
    const a = zone('Jaén', 0.4, [factor('x', 0.5)], 0.6)
    const b = zone('Toledo', 0.45, [factor('x', 0.5)], 0.3)
    const result = compareZones(a, b)
    expect(result).toMatchObject({ winner: 'A', decidedBy: 'share' })
    expect(result.shareDelta).toBeCloseTo(-0.3)
  })

  it('con superficie apta parecida decide la media y explica con los factores que difieren', () => {
    const a = zone('Jaén', 0.24, [factor('pendiente', 0.54, 0.17), factor('ph', 0.57, 0.33), factor('lluvia', 1)])
    const b = zone('Toledo', 0.3, [factor('pendiente', 0.97), factor('ph', 0.55), factor('lluvia', 1)], 0.52)
    const result = compareZones(a, b)
    expect(result).toMatchObject({ winner: 'B', decidedBy: 'mean' })
    expect(result.delta).toBeCloseTo(0.06)
    expect(result.reasons.map((reason) => reason.id)).toEqual(['pendiente'])
    expect(result.reasons[0]).toMatchObject({ favors: 'B' })
    expect(result.factors.find((item) => item.id === 'ph')!.favors).toBe('tie')
  })

  it('declara empate si ni la superficie apta ni la media difieren lo suficiente', () => {
    const a = zone('A', 0.3, [factor('x', 0.2), factor('y', 0.9)])
    const b = zone('B', 0.34, [factor('x', 0.9), factor('y', 0.5)], 0.53)
    const result = compareZones(a, b)
    expect(result).toMatchObject({ winner: 'tie', decidedBy: 'none' })
    expect(result.reasons.map((reason) => [reason.id, reason.favors])).toEqual([
      ['x', 'B'],
      ['y', 'A'],
    ])
  })

  it('tolera factores presentes solo en una zona y medias ausentes', () => {
    const result = compareZones(zone('A', null, [factor('x', 0.5)]), zone('B', 0.4, [factor('z', 0.5)]))
    expect(result.winner).toBe('tie')
    expect(result.factors.map((item) => item.id)).toEqual(['x', 'z'])
    expect(result.factors.every((item) => item.favors === 'tie')).toBe(true)
  })
})
