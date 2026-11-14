import { describe, expect, it } from 'vitest'
import {
  PNOA_COVERAGE_BOUNDS,
  createTileErrorTracker,
  tileToBounds,
  tileTouchesPnoaCoverage,
} from './tileErrors'

describe('createTileErrorTracker', () => {
  it('no avisa antes del umbral y avisa exactamente en el sexto error', () => {
    const tracker = createTileErrorTracker()
    for (let index = 1; index <= 5; index += 1) {
      expect(tracker.register(1_000)).toBe(false)
    }
    expect(tracker.count).toBe(5)
    expect(tracker.register(1_000)).toBe(true)
  })

  it('notifica una sola vez por activación aunque sigan llegando errores', () => {
    const tracker = createTileErrorTracker({ threshold: 2 })
    expect(tracker.register(0)).toBe(false)
    expect(tracker.register(0)).toBe(true)
    expect(tracker.register(0)).toBe(false)
    expect(tracker.register(0)).toBe(false)
  })

  it('reset vuelve a habilitar la notificación', () => {
    const tracker = createTileErrorTracker({ threshold: 1 })
    expect(tracker.register(0)).toBe(true)
    expect(tracker.register(0)).toBe(false)
    tracker.reset()
    expect(tracker.count).toBe(0)
    expect(tracker.register(0)).toBe(true)
  })

  it('descarta errores fuera de la ventana temporal', () => {
    const tracker = createTileErrorTracker({ threshold: 3, windowMs: 1_000 })
    expect(tracker.register(0)).toBe(false)
    expect(tracker.register(500)).toBe(false)
    // El tercer error llega tarde: la ventana se reinicia y el contador vale 1.
    expect(tracker.register(2_500)).toBe(false)
    expect(tracker.count).toBe(1)
    expect(tracker.register(2_600)).toBe(false)
    expect(tracker.register(2_700)).toBe(true)
  })

  it('admite umbrales personalizados y los normaliza a un mínimo de uno', () => {
    const tracker = createTileErrorTracker({ threshold: 0 })
    expect(tracker.register(0)).toBe(true)
  })
})

describe('cobertura PNOA de las teselas', () => {
  it('convierte coordenadas XYZ en límites geográficos coherentes', () => {
    const bounds = tileToBounds({ x: 31, y: 24, z: 6 })!
    expect(bounds.west).toBeCloseTo(-5.625, 6)
    expect(bounds.east).toBeCloseTo(0, 6)
    expect(bounds.north).toBeGreaterThan(bounds.south)
    expect(bounds.north).toBeGreaterThan(40)
    expect(bounds.south).toBeLessThan(40)

    const worldTop = tileToBounds({ x: 0, y: 0, z: 0 })!
    expect(worldTop.west).toBe(-180)
    expect(worldTop.east).toBe(180)
    expect(worldTop.north).toBeCloseTo(85.0511, 3)
  })

  it('normaliza la x sin envolver de los zooms bajos y rechaza y fuera de rango', () => {
    expect(tileToBounds({ x: 0, y: 0, z: 1 })).toEqual(tileToBounds({ x: 2, y: 0, z: 1 }))
    expect(tileToBounds({ x: -1, y: 0, z: 1 })).toEqual(tileToBounds({ x: 1, y: 0, z: 1 }))
    expect(tileToBounds({ x: 0, y: 2, z: 1 })).toBeNull()
    expect(tileToBounds({ x: 0, y: 0, z: -1 })).toBeNull()
    expect(tileToBounds({ x: 0.5, y: 0, z: 1 })).toBeNull()
  })

  it('reconoce teselas sobre España peninsular y Canarias', () => {
    // Jaén (37,77 N, 3,79 O) a zoom 6.
    expect(tileTouchesPnoaCoverage({ x: 31, y: 24, z: 6 })).toBe(true)
    // Canarias (28,1 N, 15,4 O) a zoom 8.
    expect(tileTouchesPnoaCoverage({ x: 117, y: 107, z: 8 })).toBe(true)
  })

  it('descarta teselas fuera de la cobertura PNOA (p. ej. EE. UU.)', () => {
    // Colorado (40 N, 105 O) a zoom 6.
    expect(tileTouchesPnoaCoverage({ x: 13, y: 24, z: 6 })).toBe(false)
    // Atlántico oriental a zoom 6, sin tocar España ni Canarias.
    expect(tileTouchesPnoaCoverage({ x: 10, y: 24, z: 6 })).toBe(false)
  })

  it('publica dos ámbitos de cobertura: península + Baleares y Canarias', () => {
    expect(PNOA_COVERAGE_BOUNDS).toHaveLength(2)
    expect(PNOA_COVERAGE_BOUNDS[0]).toEqual({
      west: -9.6,
      south: 35.8,
      east: 4.6,
      north: 44,
    })
    expect(PNOA_COVERAGE_BOUNDS[1]).toEqual({
      west: -18.4,
      south: 27.4,
      east: -13.3,
      north: 29.5,
    })
  })
})
