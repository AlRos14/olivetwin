import { describe, expect, it } from 'vitest'
import { createTileErrorTracker } from './tileErrors'

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
