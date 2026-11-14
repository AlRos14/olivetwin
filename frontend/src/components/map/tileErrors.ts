/** Umbral por defecto: seis teselas fallidas indican que el servicio no responde. */
export const TILE_ERROR_THRESHOLD = 6

/** Ventana temporal (ms) en la que se cuentan los errores de tesela. */
export const TILE_ERROR_WINDOW_MS = 10_000

export interface TileErrorTracker {
  /** Número de errores contabilizados en la ventana actual. */
  readonly count: number
  /**
   * Registra un error de tesela. Devuelve `true` una única vez, cuando se
   * alcanza el umbral dentro de la ventana. Tras informar, ignora los errores
   * restantes hasta `reset()` (una notificación por activación de capa).
   */
  register(now?: number): boolean
  reset(): void
}

export interface TileErrorTrackerOptions {
  threshold?: number
  windowMs?: number
}

/**
 * Contador puro (sin Leaflet) para decidir cuándo una capa base debe
 * considerarse caída. Separarlo permite probar el umbral y la ventana temporal
 * sin depender de la red ni de jsdom.
 */
export function createTileErrorTracker(options: TileErrorTrackerOptions = {}): TileErrorTracker {
  const threshold = Math.max(1, Math.floor(options.threshold ?? TILE_ERROR_THRESHOLD))
  const windowMs = Math.max(0, options.windowMs ?? TILE_ERROR_WINDOW_MS)

  let count = 0
  let windowStartedAt: number | null = null
  let notified = false

  return {
    get count() {
      return count
    },
    register(now: number = Date.now()): boolean {
      if (windowStartedAt === null || now - windowStartedAt > windowMs) {
        count = 0
        windowStartedAt = now
      }
      count += 1

      if (count >= threshold && !notified) {
        notified = true
        return true
      }
      return false
    },
    reset() {
      count = 0
      windowStartedAt = null
      notified = false
    },
  }
}
