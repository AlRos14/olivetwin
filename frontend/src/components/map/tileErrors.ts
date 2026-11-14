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

/** Coordenadas de una tesela XYZ (`x`/`y` de arriba abajo, `z` de zoom). */
export interface TileCoords {
  x: number
  y: number
  z: number
}

/** Cobertura geográfica aproximada en grados WGS84. */
export interface GeographicBounds {
  west: number
  south: number
  east: number
  north: number
}

/**
 * Cobertura aproximada del servicio PNOA: España peninsular + Baleares y
 * Canarias. Solo se usa para decidir si un error de tesela es atribuible al
 * servicio; no es una frontera administrativa ni restringe la navegación.
 */
export const PNOA_COVERAGE_BOUNDS: readonly GeographicBounds[] = [
  { west: -9.6, south: 35.8, east: 4.6, north: 44 },
  { west: -18.4, south: 27.4, east: -13.3, north: 29.5 },
]

/**
 * Convierte coordenadas de tesela XYZ a sus límites geográficos. `x` se
 * normaliza al rango de una vuelta del mundo porque Leaflet puede emitir
 * coordenadas sin envolver en los zooms más bajos; `y` fuera de rango no
 * corresponde a ninguna latitud válida.
 */
export function tileToBounds(coords: TileCoords): GeographicBounds | null {
  if (!coords) return null
  const { x, y, z } = coords
  if (!Number.isInteger(z) || z < 0) return null
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null

  const scale = 2 ** z
  if (y < 0 || y >= scale) return null

  const wrappedX = ((x % scale) + scale) % scale
  const west = (wrappedX / scale) * 360 - 180
  const east = ((wrappedX + 1) / scale) * 360 - 180
  const north = tileYToLatitude(y, scale)
  const south = tileYToLatitude(y + 1, scale)
  return { west, south, east, north }
}

/** Latitud del borde superior de una fila de tesela en proyección Web Mercator. */
function tileYToLatitude(y: number, scale: number): number {
  const mercator = Math.PI - (2 * Math.PI * y) / scale
  return (180 / Math.PI) * Math.atan(Math.sinh(mercator))
}

function boundsIntersect(a: GeographicBounds, b: GeographicBounds): boolean {
  return a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south
}

/**
 * Indica si la tesela que ha fallado cubre alguna parte de la cobertura PNOA.
 * PNOA solo publica ortofoto de España: los errores de teselas en otras
 * regiones no deben presentarse como una caída del servicio.
 */
export function tileTouchesPnoaCoverage(coords: TileCoords): boolean {
  const bounds = tileToBounds(coords)
  if (!bounds) return false
  return PNOA_COVERAGE_BOUNDS.some((coverage) => boundsIntersect(bounds, coverage))
}
